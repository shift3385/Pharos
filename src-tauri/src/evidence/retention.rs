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
    // A live, open defect links to it.
    let statuses: Vec<String> = {
        let mut stmt = conn
            .prepare(
                "SELECT d.status FROM defect_links l JOIN defects d ON d.id = l.defect_id
                  WHERE l.target_kind = 'result' AND l.target_id = ?1
                    AND l.deleted_at IS NULL AND d.deleted_at IS NULL",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map(params![result_id], |r| r.get::<_, String>(0))
            .map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)?
    };
    Ok(statuses
        .iter()
        .any(|s| crate::defects::lifecycle::is_open(s)))
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
