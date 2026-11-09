//! Retention of evidence per project (DAT-03c, ADR-0014 «Implementación
//! (DAT-03c)»): the settings of Administration → Evidencias and the
//! exceptions of results.
//!
//! - **Settings** live in `evidence_retention` (0022): no row = the default
//!   of `DEFAULT_RETENTION`, a row with `days NULL` = always, a row with days
//!   = that many days. They are **local to this device** (not synced): expiry
//!   is a local task and the attachments themselves do not sync until
//!   SYNC-04b. Each change leaves an `update` event on `evidence_retention`
//!   (no oplog row).
//! - **Exceptions** (never expire): the evidence of a result recorded by hand
//!   (manual execution, `shard_id IS NULL`), of the final attempt of its test
//!   when it failed or was blocked, and of a result a live, open defect is
//!   linked to. A step result's evidence follows its result. They are
//!   evaluated at each expiry: once a retry passes or the defect is closed,
//!   the evidence expires when its age passes the retention.

use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::State;
#[cfg(test)]
use ts_rs::TS;

use super::DEFAULT_RETENTION;
use crate::db::Db;
use crate::journal::{self, Action, Actor};
use crate::runs::derive::{self, Attempt};

#[cfg(test)]
mod tests;

/// The audit entity of a change of the settings.
pub const RETENTION_ENTITY: &str = "evidence_retention";
/// Longest retention that can be set, in days (10 years).
pub const MAX_DAYS: i64 = 3650;

/// The retention of one kind in one project.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceRetentionKind {
    pub kind: String,
    /// The default (None = always).
    pub default_days: Option<i64>,
    /// What applies (None = always).
    pub days: Option<i64>,
    /// The project has its own setting for this kind.
    pub custom: bool,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceRetention {
    pub project_id: String,
    pub kinds: Vec<EvidenceRetentionKind>,
}

/// A new setting for one kind.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum RetentionPolicy {
    /// Back to the default (the row goes).
    Default,
    /// Never expires.
    Always,
    /// Expires after `days` days.
    Days { days: i64 },
}

fn err(e: rusqlite::Error) -> String {
    e.to_string()
}

fn default_of(kind: &str) -> Option<Option<i64>> {
    DEFAULT_RETENTION
        .iter()
        .find(|(k, _)| *k == kind)
        .map(|(_, d)| *d)
}

/// The stored setting: None = default; Some(None) = always; Some(Some(n)).
fn stored(conn: &Connection, project_id: &str, kind: &str) -> Result<Option<Option<i64>>, String> {
    conn.query_row(
        "SELECT days FROM evidence_retention WHERE project_id = ?1 AND kind = ?2",
        params![project_id, kind],
        |r| r.get(0),
    )
    .optional()
    .map_err(err)
}

/// The setting as the audit event shows it.
fn shown(setting: Option<Option<i64>>) -> Value {
    match setting {
        None => json!("default"),
        Some(None) => json!("always"),
        Some(Some(days)) => json!(days),
    }
}

fn owns(conn: &Connection, project_id: &str, user: &str) -> Result<(), String> {
    if crate::project::owns(conn, project_id, user)? {
        Ok(())
    } else {
        Err("project-not-found".into())
    }
}

/// The retention of every kind in a project the user owns.
pub(crate) fn get(
    conn: &Connection,
    project_id: &str,
    user: &str,
) -> Result<EvidenceRetention, String> {
    owns(conn, project_id, user)?;
    let mut kinds = Vec::with_capacity(DEFAULT_RETENTION.len());
    for (kind, default_days) in DEFAULT_RETENTION {
        let custom = stored(conn, project_id, kind)?;
        kinds.push(EvidenceRetentionKind {
            kind: (*kind).to_string(),
            default_days: *default_days,
            days: custom.unwrap_or(*default_days),
            custom: custom.is_some(),
        });
    }
    Ok(EvidenceRetention {
        project_id: project_id.to_string(),
        kinds,
    })
}

/// Sets the retention of one kind in a project the user owns, with one
/// `update` event when it changes. Returns whether it changed.
pub(crate) fn set(
    conn: &Connection,
    project_id: &str,
    kind: &str,
    policy: &RetentionPolicy,
    user: &str,
) -> Result<bool, String> {
    owns(conn, project_id, user)?;
    if default_of(kind).is_none() {
        return Err(format!("unknown evidence kind: {kind}"));
    }
    let next = match policy {
        RetentionPolicy::Default => None,
        RetentionPolicy::Always => Some(None),
        RetentionPolicy::Days { days } => {
            if !(1..=MAX_DAYS).contains(days) {
                return Err(format!("retention-days-out-of-range: 1..{MAX_DAYS}"));
            }
            Some(Some(*days))
        }
    };
    let before = stored(conn, project_id, kind)?;
    if before == next {
        return Ok(false);
    }
    match next {
        None => conn.execute(
            "DELETE FROM evidence_retention WHERE project_id = ?1 AND kind = ?2",
            params![project_id, kind],
        ),
        Some(days) => conn.execute(
            "INSERT INTO evidence_retention (project_id, kind, days) VALUES (?1, ?2, ?3)
             ON CONFLICT (project_id, kind) DO UPDATE SET days = excluded.days",
            params![project_id, kind, days],
        ),
    }
    .map_err(err)?;
    let mut changes = Map::new();
    changes.insert(kind.to_string(), json!([shown(before), shown(next)]));
    journal::record_event_in(
        conn,
        Actor::user(user),
        Action::Update,
        RETENTION_ENTITY,
        project_id,
        Some(project_id),
        changes,
        None,
    )?;
    Ok(true)
}

/// Copies the retention of every kind from one project to another, both
/// owned by the user (UX-25, «Copiar ajustes de…» when a project is
/// created): the kinds the source left at the default go back to the default
/// in the target, the others take the source's setting. A one-time copy: the
/// two projects stay independent. One `update` event per kind that changed.
/// Returns how many kinds changed.
pub(crate) fn copy(
    conn: &Connection,
    from_project_id: &str,
    to_project_id: &str,
    user: &str,
) -> Result<usize, String> {
    owns(conn, from_project_id, user)?;
    owns(conn, to_project_id, user)?;
    if from_project_id == to_project_id {
        return Ok(0);
    }
    let mut changed = 0;
    for (kind, _) in DEFAULT_RETENTION {
        let policy = match stored(conn, from_project_id, kind)? {
            None => RetentionPolicy::Default,
            Some(None) => RetentionPolicy::Always,
            Some(Some(days)) => RetentionPolicy::Days { days },
        };
        if set(conn, to_project_id, kind, &policy, user)? {
            changed += 1;
        }
    }
    Ok(changed)
}

// ---- exceptions -------------------------------------------------------------

/// What `exempt` already read during one expiry pass.
#[derive(Default)]
pub(crate) struct ExemptCache {
    /// Final attempt ids of each run.
    finals: HashMap<String, HashSet<String>>,
}

/// The final attempt of each test of a run, over its current shards (the set
/// `runs::list_results` derives: a superseded shard's results are never final).
fn finals_of_run(conn: &Connection, run_id: &str) -> Result<HashSet<String>, String> {
    type Row = (
        String,
        String,
        String,
        Option<String>,
        i64,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        String,
        String,
    );
    let mut stmt = conn
        .prepare(&format!(
            "SELECT x.id, x.run_id, x.test_key, x.configuration_label, x.attempt, x.status,
                    x.started_at, x.finished_at, s.imported_at, x.hlc, x.attributes
               FROM results x LEFT JOIN run_shards s ON s.id = x.shard_id
              WHERE x.run_id = ?1 AND {}",
            crate::runs::link::CURRENT_SHARD
        ))
        .map_err(err)?;
    let rows: Vec<Row> = stmt
        .query_map(params![run_id], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
                r.get(7)?,
                r.get(8)?,
                r.get(9)?,
                r.get(10)?,
            ))
        })
        .map_err(err)?
        .collect::<rusqlite::Result<_>>()
        .map_err(err)?;
    let attempts: Vec<Attempt> = rows
        .iter()
        .map(|r| Attempt {
            id: &r.0,
            run_id: &r.1,
            test_key: &r.2,
            configuration_label: r.3.as_deref(),
            attempt: r.4,
            status: &r.5,
            started_at: r.6.as_deref(),
            finished_at: r.7.as_deref(),
            shard_imported_at: r.8.as_deref(),
            hlc: &r.9,
            declared_flaky: serde_json::from_str::<Value>(&r.10)
                .ok()
                .and_then(|v| v.get("flaky").cloned())
                == Some(Value::Bool(true)),
        })
        .collect();
    Ok(derive::final_attempts(&attempts)
        .into_iter()
        .map(String::from)
        .collect())
}

/// Whether a result's evidence never expires (see the module notes).
fn result_exempt(
    conn: &Connection,
    cache: &mut ExemptCache,
    result_id: &str,
) -> Result<bool, String> {
    let row: Option<(String, Option<String>, String)> = conn
        .query_row(
            "SELECT run_id, shard_id, status FROM results WHERE id = ?1",
            params![result_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(err)?;
    // Unknown result (a stray row): keep it, never lose evidence.
    let Some((run_id, shard_id, status)) = row else {
        return Ok(true);
    };
    // Manual execution.
    if shard_id.is_none() {
        return Ok(true);
    }
    // Final failed or blocked.
    if matches!(status.as_str(), "failed" | "blocked") {
        if !cache.finals.contains_key(&run_id) {
            let finals = finals_of_run(conn, &run_id)?;
            cache.finals.insert(run_id.clone(), finals);
        }
        if cache.finals[&run_id].contains(result_id) {
            return Ok(true);
        }
    }
    // A live, open defect links to it. A link pulled before its defect (no
    // foreign key, 0029) counts as open: the defect may be open, and keeping
    // the evidence one pass longer loses nothing.
    let statuses: Vec<Option<String>> = {
        let mut stmt = conn
            .prepare(
                "SELECT CASE WHEN d.id IS NULL THEN NULL ELSE d.status END
                   FROM defect_links l LEFT JOIN defects d ON d.id = l.defect_id
                  WHERE l.target_kind = 'result' AND l.target_id = ?1
                    AND l.deleted_at IS NULL AND (d.id IS NULL OR d.deleted_at IS NULL)",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map(params![result_id], |r| r.get::<_, Option<String>>(0))
            .map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)?
    };
    Ok(statuses.iter().any(|s| {
        s.as_deref()
            .map_or(true, crate::defects::lifecycle::is_open)
    }))
}

// ---- the expiry pass --------------------------------------------------------

/// Most contents one pass expires: the pass runs inside the purge's
/// transaction, under the database lock (the next pass goes on).
pub(crate) const MAX_PER_PASS: usize = 500;
/// Most days one pass moves the expiry clock past the last pass or the last
/// HLC: a clock set years ahead does not expire everything at once.
pub(crate) const MAX_CLOCK_STEP_DAYS: i64 = 7;
/// `sync_state` key: when this device first ran a pass with the result
/// exceptions (DAT-03c). The evidence of results ages from here at the
/// earliest, so an upgrade expires nothing before one full window.
pub(crate) const ENABLED_KEY: &str = "dat03c_enabled_at";
/// `sync_state` key: the expiry clock of the last pass (ms).
pub(crate) const LAST_PASS_KEY: &str = "evidence_last_expire_at";
const DAY_MS: i64 = 86_400_000;

fn state_ms(conn: &Connection, key: &str) -> Result<Option<i64>, String> {
    let v: Option<String> = conn
        .query_row(
            "SELECT value FROM sync_state WHERE key = ?1",
            params![key],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?;
    Ok(v.and_then(|s| s.parse().ok()))
}

fn set_state_ms(conn: &Connection, key: &str, ms: i64) -> Result<(), String> {
    conn.execute(
        "INSERT INTO sync_state (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, ms.to_string()],
    )
    .map(drop)
    .map_err(err)
}

fn wall_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// The "now" of a pass (ms): the wall clock, but at most
/// `MAX_CLOCK_STEP_DAYS` past the later of the last pass and the last HLC of
/// this device (`hlc_last`, which also follows the clocks of the devices it
/// synced with). A clock that went back is taken as it is (expires less).
fn pass_clock(conn: &Connection, wall: i64) -> Result<i64, String> {
    let hlc: Option<i64> = conn
        .query_row(
            "SELECT value FROM sync_state WHERE key = 'hlc_last'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(err)?
        .and_then(|s| crate::hlc::Hlc::parse(&s))
        .map(|h| h.wall_ms as i64);
    let reference = [state_ms(conn, LAST_PASS_KEY)?, hlc]
        .into_iter()
        .flatten()
        .max();
    Ok(match reference {
        Some(r) if wall > r + MAX_CLOCK_STEP_DAYS * DAY_MS => {
            tracing::warn!(
                "the clock is ahead of the last expiry and the last HLC: \
                 evidence expiry advances at most {MAX_CLOCK_STEP_DAYS} days in this pass"
            );
            r + MAX_CLOCK_STEP_DAYS * DAY_MS
        }
        _ => wall,
    })
}

/// When the result exceptions started on this device (ms), recorded on the
/// first pass.
fn enabled_at(conn: &Connection, now: i64) -> Result<i64, String> {
    match state_ms(conn, ENABLED_KEY)? {
        Some(ms) => Ok(ms),
        None => {
            set_state_ms(conn, ENABLED_KEY, now)?;
            Ok(now)
        }
    }
}

/// Julian day of an instant in ms (as SQLite's `julianday`).
fn jd(ms: i64) -> f64 {
    ms as f64 / DAY_MS as f64 + 2_440_587.5
}

/// One attachment that the pass looks at.
pub(crate) struct Candidate {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) kind: String,
    pub(crate) sha256: String,
    pub(crate) days: i64,
}

/// The attachments whose retention passed at `now` and that no exception
/// keeps, oldest first; `only` narrows them to one project and kind with a
/// given retention (the confirmation of a shorter setting). At most `limit`.
fn due(
    conn: &Connection,
    now: i64,
    enabled: i64,
    only: Option<(&str, &str, Option<i64>)>,
    limit: usize,
) -> Result<Vec<Candidate>, String> {
    type Row = (String, String, String, String, String, String, f64);
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.project_id, a.kind, a.owner_entity, a.owner_id, a.sha256,
                    coalesce(julianday(a.created_at), 0)
               FROM attachments a
              WHERE a.deleted_at IS NULL AND a.blob_purged_at IS NULL
                AND a.owner_entity IN ('run_shard', 'result', 'step_result')
                AND (?1 IS NULL OR (a.project_id = ?1 AND a.kind = ?2))
              ORDER BY a.created_at, a.rowid",
        )
        .map_err(err)?;
    let rows: Vec<Row> = stmt
        .query_map(params![only.map(|o| o.0), only.map(|o| o.1)], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
            ))
        })
        .map_err(err)?
        .collect::<rusqlite::Result<_>>()
        .map_err(err)?;
    let (now_jd, enabled_jd) = (jd(now), jd(enabled));
    let mut cache = ExemptCache::default();
    let mut out = Vec::new();
    for (id, project_id, kind, owner_entity, owner_id, sha256, created_jd) in rows {
        if out.len() >= limit {
            break;
        }
        let days = match only {
            Some((_, _, days)) => days,
            None => super::retention_days(conn, &project_id, &kind)?,
        };
        let Some(days) = days else { continue };
        // The evidence of results ages from the upgrade at the earliest.
        let born = if owner_entity == "run_shard" {
            created_jd
        } else {
            created_jd.max(enabled_jd)
        };
        if born > now_jd - days as f64 || exempt(conn, &mut cache, &owner_entity, &owner_id)? {
            continue;
        }
        out.push(Candidate {
            id,
            project_id,
            kind,
            sha256,
            days,
        });
    }
    Ok(out)
}

/// Expires up to `MAX_PER_PASS` contents whose retention passed (local task,
/// not sync): the `attachments` row stays with `blob_purged_at` and its
/// sha256, a `redact` event is written and the content is released. Results
/// are never touched. Returns how many expired.
pub(crate) fn expire(conn: &Connection) -> Result<usize, String> {
    let now = pass_clock(conn, wall_ms())?;
    let enabled = enabled_at(conn, now)?;
    let due = due(conn, now, enabled, None, MAX_PER_PASS)?;
    for c in &due {
        conn.execute(
            "UPDATE attachments SET blob_purged_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
              WHERE id = ?1",
            params![c.id],
        )
        .map_err(err)?;
        let owner = crate::oplog::owner_of(conn, "project", &c.project_id)?;
        let mut changes = Map::new();
        changes.insert("blob".into(), json!([c.sha256, null]));
        journal::record_event_in(
            conn,
            Actor::System {
                component: "evidence",
                on_behalf_of: owner,
            },
            Action::Redact,
            "attachment",
            &c.id,
            Some(&c.project_id),
            changes,
            Some(json!({"reason": "retention", "kind": c.kind, "days": c.days})),
        )?;
        super::release(conn, &c.sha256)?;
    }
    let last = state_ms(conn, LAST_PASS_KEY)?.unwrap_or(i64::MIN);
    set_state_ms(conn, LAST_PASS_KEY, last.max(now))?;
    if !due.is_empty() {
        tracing::info!(expired = due.len(), "evidence expired by retention");
    }
    Ok(due.len())
}

/// How many files of `kind` in a project would expire at the next pass with
/// retention `days` (None = always): what the confirmation of a shorter
/// setting names. Writes nothing.
pub(crate) fn would_expire(
    conn: &Connection,
    project_id: &str,
    kind: &str,
    days: Option<i64>,
    user: &str,
) -> Result<usize, String> {
    owns(conn, project_id, user)?;
    if days.is_none() {
        return Ok(0);
    }
    let now = pass_clock(conn, wall_ms())?;
    let enabled = state_ms(conn, ENABLED_KEY)?.unwrap_or(now);
    Ok(due(
        conn,
        now,
        enabled,
        Some((project_id, kind, days)),
        usize::MAX,
    )?
    .len())
}

/// Whether the attachments of an owner never expire. Only the evidence of
/// imported runs can: a raw report (`run_shard`) and the evidence of an
/// imported result or step result outside the exceptions. A planner card's,
/// a defect's or a draft's files are the user's.
pub(crate) fn exempt(
    conn: &Connection,
    cache: &mut ExemptCache,
    owner_entity: &str,
    owner_id: &str,
) -> Result<bool, String> {
    match owner_entity {
        "run_shard" => Ok(false),
        "result" => result_exempt(conn, cache, owner_id),
        "step_result" => {
            let result: Option<String> = conn
                .query_row(
                    "SELECT result_id FROM step_results WHERE id = ?1",
                    params![owner_id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(err)?;
            match result {
                Some(result) => result_exempt(conn, cache, &result),
                None => Ok(true),
            }
        }
        _ => Ok(true),
    }
}

// ---- commands -------------------------------------------------------------

/// The retention of every kind in a project (Administration → Evidencias).
#[tauri::command]
pub fn evidence_retention_get(
    db: State<Db>,
    project_id: String,
    user_id: String,
) -> Result<EvidenceRetention, String> {
    db.with_conn(|conn| get(conn, &project_id, &user_id))
}

/// How many files of a kind would expire with a new setting (read).
#[tauri::command]
pub fn evidence_retention_preview(
    db: State<Db>,
    project_id: String,
    kind: String,
    policy: RetentionPolicy,
    user_id: String,
) -> Result<usize, String> {
    let days = match policy {
        RetentionPolicy::Default => {
            default_of(&kind).ok_or_else(|| format!("unknown evidence kind: {kind}"))?
        }
        RetentionPolicy::Always => None,
        RetentionPolicy::Days { days } => Some(days),
    };
    db.with_conn(|conn| would_expire(conn, &project_id, &kind, days, &user_id))
}

/// Sets the retention of one kind in a project; saves when it changed.
#[tauri::command]
pub fn evidence_retention_set(
    db: State<Db>,
    project_id: String,
    kind: String,
    policy: RetentionPolicy,
    user_id: String,
) -> Result<EvidenceRetention, String> {
    let changed = db.with_tx(|conn| set(conn, &project_id, &kind, &policy, &user_id))?;
    if changed {
        db.persist()?;
    }
    db.with_conn(|conn| get(conn, &project_id, &user_id))
}

/// Copies the retention of one project to another (UX-25); returns how many
/// kinds changed. All or nothing: one transaction.
#[tauri::command]
pub fn evidence_retention_copy(
    db: State<Db>,
    from_project_id: String,
    to_project_id: String,
    user_id: String,
) -> Result<usize, String> {
    let changed = db.with_tx(|conn| copy(conn, &from_project_id, &to_project_id, &user_id))?;
    if changed > 0 {
        db.persist()?;
    }
    Ok(changed)
}
