//! Findings and metrics of a run (ING-06; ADR-0012, ADR-0053): append-only
//! children of a shard, like results. The importer (`import.rs`) plans and
//! writes them in its transaction; the parsers (`@pharos/formats`) already
//! gave each finding its fingerprint. Ids are deterministic (`ids.rs`), so
//! the same file gives the same rows on every device and the sync converges.
//! The link to a case is not stored: the tags stay in `attributes` and are
//! resolved when read (ADR-0013), like an imported result's.

#[cfg(test)]
mod tests;

use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Map, Value};

use super::import::{clip, MAX_ATTRIBUTES, MAX_ERROR_MESSAGE};
use super::{err, ids, is_purged, owner_of, ps};
use uuid::Uuid;

use crate::db::ensure_workspace;
use crate::journal;

pub const FINDING: &str = "finding";
pub const METRIC: &str = "metric";
/// One triage decision on a fingerprint (ADR-0053 as amended).
pub const FINDING_TRIAGE: &str = "finding_triage";
/// The entities of this module (all append-only).
pub const ENTITIES: [&str; 3] = [FINDING, METRIC, FINDING_TRIAGE];

/// Triage states (ADR-0012). `open` takes back an earlier decision.
pub const TRIAGE_STATES: [&str; 4] = ["open", "false_positive", "accepted_risk", "fixed"];
const MAX_REASON: usize = 2_000;

/// Per import, as the parsers check (ADR-0053).
pub(crate) const MAX_FINDINGS: usize = 20_000;
pub(crate) const MAX_METRICS: usize = 5_000;
/// The markup of an axe node is cut, deterministically.
const MAX_HTML: usize = 1_000;
const MAX_TEXT: usize = 1_000;

pub const SEVERITIES: [&str; 5] = ["critical", "high", "medium", "low", "info"];

/// Every entity of this module as an SQL list literal, for `entity IN (...)`.
pub(crate) fn entities_sql_list() -> String {
    ENTITIES
        .iter()
        .map(|e| format!("'{e}'"))
        .collect::<Vec<_>>()
        .join(",")
}

/// Owner of a finding or a metric: its project's owner (ADR-0020 rule 1).
pub(crate) fn owner_sql(entity: &str) -> Option<&'static str> {
    Some(match entity {
        FINDING => {
            "SELECT p.owner_id FROM findings x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1"
        }
        METRIC => {
            "SELECT p.owner_id FROM metrics x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1"
        }
        FINDING_TRIAGE => {
            "SELECT p.owner_id FROM finding_triage x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1"
        }
        _ => return None,
    })
}

// ---- planning ----------------------------------------------------------------

pub(crate) struct PlannedFinding {
    pub id: String,
    rule_id: String,
    rule_name: Option<String>,
    pub severity: String,
    raw_severity: Option<String>,
    message: String,
    location: String,
    fingerprint: String,
    standard_refs: String,
    help_uri: Option<String>,
    attributes: String,
}

pub(crate) struct PlannedMetric {
    pub id: String,
    name: String,
    aggregation: Option<String>,
    scope: Option<String>,
    value: f64,
    unit: Option<String>,
    threshold: Option<String>,
    pub passed: Option<bool>,
    attributes: String,
}

#[derive(Default)]
pub(crate) struct Planned {
    pub findings: Vec<PlannedFinding>,
    pub metrics: Vec<PlannedMetric>,
    /// `(code, detail)`: `text-truncated`, `duplicate-metric`.
    pub warnings: Vec<(&'static str, String)>,
}

impl Planned {
    /// Findings by severity, for the preview and the import event.
    pub fn severities(&self) -> Value {
        let mut out = Map::new();
        for s in SEVERITIES {
            let n = self.findings.iter().filter(|f| f.severity == s).count();
            if n > 0 {
                out.insert(s.into(), json!(n));
            }
        }
        Value::Object(out)
    }

    /// Metrics whose threshold failed.
    pub fn thresholds_failed(&self) -> usize {
        self.metrics
            .iter()
            .filter(|m| m.passed == Some(false))
            .count()
    }
}

fn opt_text(v: &Value, k: &str, max: usize) -> Option<String> {
    v.get(k)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| clip(s, max).0)
}

/// A JSON object of the document as stored text, within the attribute limit.
/// An object over the limit keeps only its `tool` (and says it was cut).
fn object_text(v: Option<&Value>) -> (String, bool) {
    let obj = match v {
        Some(Value::Object(m)) => m.clone(),
        _ => Map::new(),
    };
    let text = Value::Object(obj.clone()).to_string();
    if text.len() <= MAX_ATTRIBUTES {
        return (text, false);
    }
    let mut kept = Map::new();
    if let Some(tool) = obj.get("tool") {
        kept.insert("tool".into(), tool.clone());
    }
    kept.insert("truncated".into(), json!(true));
    (Value::Object(kept).to_string(), true)
}

/// Checks and shapes the document's `findings[]` and `metrics[]` for a shard.
/// A finding needs its rule, severity, message and fingerprint; a metric its
/// name and a finite value. Anything else is `invalid-report`.
pub(crate) fn plan(doc: &Value, shard_id: &str) -> Result<Planned, String> {
    let empty = Vec::new();
    let findings = doc
        .get("findings")
        .and_then(Value::as_array)
        .unwrap_or(&empty);
    let metrics = doc
        .get("metrics")
        .and_then(Value::as_array)
        .unwrap_or(&empty);
    if findings.len() > MAX_FINDINGS {
        return Err(format!(
            "too-large: at most {MAX_FINDINGS} findings per import"
        ));
    }
    if metrics.len() > MAX_METRICS {
        return Err(format!(
            "too-large: at most {MAX_METRICS} metrics per import"
        ));
    }
    let mut out = Planned::default();
    let mut cut = 0usize;

    let mut seen: HashMap<String, i64> = HashMap::new();
    for (i, f) in findings.iter().enumerate() {
        let bad = |what: &str| format!("invalid-report: findings.{i}.{what}");
        let rule_id = opt_text(f, "ruleId", MAX_TEXT).ok_or_else(|| bad("ruleId"))?;
        let severity = f
            .get("severity")
            .and_then(Value::as_str)
            .filter(|s| SEVERITIES.contains(s))
            .ok_or_else(|| bad("severity"))?
            .to_string();
        let message_raw = f
            .get("message")
            .and_then(Value::as_str)
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| bad("message"))?;
        let (message, cut_message) = clip(message_raw, MAX_ERROR_MESSAGE);
        let fingerprint = opt_text(f, "fingerprint", MAX_TEXT).ok_or_else(|| bad("fingerprint"))?;
        let mut location = match f.get("location") {
            Some(Value::Object(m)) => m.clone(),
            _ => Map::new(),
        };
        let mut cut_html = false;
        if let Some(html) = location.get("html").and_then(Value::as_str) {
            let (h, c) = clip(html, MAX_HTML);
            cut_html = c;
            location.insert("html".into(), json!(h));
        }
        let (location, cut_location) = object_text(Some(&Value::Object(location)));
        let (attributes, cut_attributes) = object_text(f.get("attributes"));
        let refs: Vec<String> = f
            .get("standardRefs")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(Value::as_str)
                    .map(|s| clip(s, MAX_TEXT).0)
                    .collect()
            })
            .unwrap_or_default();
        if cut_message || cut_html || cut_location || cut_attributes {
            cut += 1;
        }
        let n = seen.entry(fingerprint.clone()).or_insert(0);
        let id = ids::finding_id(shard_id, &fingerprint, *n);
        *n += 1;
        out.findings.push(PlannedFinding {
            id,
            rule_id,
            rule_name: opt_text(f, "ruleName", MAX_TEXT),
            severity,
            raw_severity: opt_text(f, "rawSeverity", MAX_TEXT),
            message,
            location,
            fingerprint,
            standard_refs: json!(refs).to_string(),
            help_uri: opt_text(f, "helpUri", MAX_TEXT),
            attributes,
        });
    }

    let mut metric_ids: HashMap<String, ()> = HashMap::new();
    for (i, m) in metrics.iter().enumerate() {
        let bad = |what: &str| format!("invalid-report: metrics.{i}.{what}");
        let name = opt_text(m, "name", MAX_TEXT).ok_or_else(|| bad("name"))?;
        let value = m
            .get("value")
            .and_then(Value::as_f64)
            .filter(|v| v.is_finite())
            .ok_or_else(|| bad("value"))?;
        let aggregation = opt_text(m, "aggregation", MAX_TEXT);
        let scope = opt_text(m, "scope", MAX_TEXT);
        let id = ids::metric_id(shard_id, &name, aggregation.as_deref(), scope.as_deref());
        if metric_ids.insert(id.clone(), ()).is_some() {
            // The same name, aggregation and scope twice: the first one counts.
            out.warnings.push(("duplicate-metric", name.clone()));
            continue;
        }
        let (attributes, cut_attributes) = object_text(m.get("attributes"));
        if cut_attributes {
            cut += 1;
        }
        out.metrics.push(PlannedMetric {
            id,
            name,
            aggregation,
            scope,
            value,
            unit: opt_text(m, "unit", MAX_TEXT),
            threshold: opt_text(m, "threshold", MAX_TEXT),
            passed: m.get("passed").and_then(Value::as_bool),
            attributes,
        });
    }
    if cut > 0 {
        out.warnings.push(("text-truncated", cut.to_string()));
    }
    Ok(out)
}

// ---- writing -----------------------------------------------------------------

/// Writes the planned findings and metrics of a new shard in the caller's
/// transaction, each with its `append` oplog row.
pub(crate) fn write(
    conn: &Connection,
    project_id: &str,
    run_id: &str,
    shard_id: &str,
    user: &str,
    planned: &Planned,
) -> Result<(), String> {
    let workspace = ensure_workspace(conn)?;
    for f in &planned.findings {
        let hlc = crate::oplog::next_hlc(conn)?;
        conn.execute(
            "INSERT INTO findings (id, workspace_id, project_id, run_id, shard_id, rule_id,
                    rule_name, severity, raw_severity, message, location, fingerprint,
                    standard_refs, help_uri, attributes, created_by, created_at, hlc)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?17)",
            params![
                f.id,
                workspace,
                project_id,
                run_id,
                shard_id,
                f.rule_id,
                f.rule_name,
                f.severity,
                f.raw_severity,
                f.message,
                f.location,
                f.fingerprint,
                f.standard_refs,
                f.help_uri,
                f.attributes,
                user,
                hlc,
            ],
        )
        .map_err(err)?;
        journal::record_append(conn, FINDING, &f.id, user)?;
    }
    for m in &planned.metrics {
        let hlc = crate::oplog::next_hlc(conn)?;
        conn.execute(
            "INSERT INTO metrics (id, workspace_id, project_id, run_id, shard_id, name,
                    aggregation, scope, value, unit, threshold, passed, attributes, created_by,
                    created_at, hlc)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?15)",
            params![
                m.id,
                workspace,
                project_id,
                run_id,
                shard_id,
                m.name,
                m.aggregation,
                m.scope,
                m.value,
                m.unit,
                m.threshold,
                m.passed,
                m.attributes,
                user,
                hlc,
            ],
        )
        .map_err(err)?;
        journal::record_append(conn, METRIC, &m.id, user)?;
    }
    Ok(())
}

// ---- sync (append-only, `sync_class.rs`) --------------------------------------

fn json_of(text: Option<String>) -> Value {
    text.and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or(Value::Null)
}

/// The `finding` document pushed for a row.
pub fn finding_payload(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    conn.query_row("SELECT * FROM findings WHERE id = ?1", params![id], |r| {
        let s = |c: &str| r.get::<_, Option<String>>(c);
        Ok(json!({
            "id": s("id")?, "workspaceId": s("workspace_id")?, "projectId": s("project_id")?,
            "runId": s("run_id")?, "shardId": s("shard_id")?, "ruleId": s("rule_id")?,
            "ruleName": s("rule_name")?, "severity": s("severity")?,
            "rawSeverity": s("raw_severity")?, "message": s("message")?,
            "location": json_of(s("location")?), "fingerprint": s("fingerprint")?,
            "standardRefs": json_of(s("standard_refs")?), "helpUri": s("help_uri")?,
            "attributes": json_of(s("attributes")?), "createdBy": s("created_by")?,
            "createdAt": s("created_at")?, "hlc": s("hlc")?,
        }))
    })
    .optional()
    .map_err(err)
}

fn text_of(p: &Value, k: &str) -> Option<String> {
    match p.get(k) {
        Some(Value::Null) | None => None,
        Some(v) => Some(v.to_string()),
    }
}

/// Stores a pulled finding unless its id is here (or its run was purged here).
pub fn finding_insert_if_absent(conn: &Connection, _user: &str, p: &Value) -> Result<(), String> {
    let severity_ok = ps(p, "severity").is_some_and(|s| SEVERITIES.contains(&s));
    let (
        Some(id),
        Some(project),
        Some(run),
        Some(shard),
        Some(rule),
        Some(message),
        Some(fp),
        true,
    ) = (
        ps(p, "id"),
        ps(p, "projectId"),
        ps(p, "runId"),
        ps(p, "shardId"),
        ps(p, "ruleId"),
        ps(p, "message"),
        ps(p, "fingerprint"),
        severity_ok,
    )
    else {
        tracing::warn!("skipped a pulled finding without its required fields");
        return Ok(());
    };
    if is_purged(conn, run)? {
        return Ok(());
    }
    conn.execute(
        "INSERT OR IGNORE INTO findings (id, workspace_id, project_id, run_id, shard_id, rule_id,
                rule_name, severity, raw_severity, message, location, fingerprint, standard_refs,
                help_uri, attributes, created_by, created_at, hlc)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
        params![
            id,
            ensure_workspace(conn)?,
            project,
            run,
            shard,
            rule,
            ps(p, "ruleName"),
            ps(p, "severity"),
            ps(p, "rawSeverity"),
            message,
            text_of(p, "location").unwrap_or_else(|| "{}".into()),
            fp,
            text_of(p, "standardRefs").unwrap_or_else(|| "[]".into()),
            ps(p, "helpUri"),
            text_of(p, "attributes").unwrap_or_else(|| "{}".into()),
            ps(p, "createdBy").unwrap_or_default(),
            ps(p, "createdAt").unwrap_or_default(),
            ps(p, "hlc").unwrap_or_default(),
        ],
    )
    .map_err(err)?;
    Ok(())
}

pub fn finding_owner(conn: &Connection, id: &str) -> Result<Option<String>, String> {
    owner_of(conn, FINDING, id)
}

/// The `metric` document pushed for a row.
pub fn metric_payload(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    conn.query_row("SELECT * FROM metrics WHERE id = ?1", params![id], |r| {
        let s = |c: &str| r.get::<_, Option<String>>(c);
        Ok(json!({
            "id": s("id")?, "workspaceId": s("workspace_id")?, "projectId": s("project_id")?,
            "runId": s("run_id")?, "shardId": s("shard_id")?, "name": s("name")?,
            "aggregation": s("aggregation")?, "scope": s("scope")?,
            "value": r.get::<_, f64>("value")?, "unit": s("unit")?,
            "threshold": s("threshold")?, "passed": r.get::<_, Option<bool>>("passed")?,
            "attributes": json_of(s("attributes")?), "createdBy": s("created_by")?,
            "createdAt": s("created_at")?, "hlc": s("hlc")?,
        }))
    })
    .optional()
    .map_err(err)
}

/// Stores a pulled metric unless its id is here (or its run was purged here).
pub fn metric_insert_if_absent(conn: &Connection, _user: &str, p: &Value) -> Result<(), String> {
    let value = p
        .get("value")
        .and_then(Value::as_f64)
        .filter(|v| v.is_finite());
    let (Some(id), Some(project), Some(run), Some(shard), Some(name), Some(value)) = (
        ps(p, "id"),
        ps(p, "projectId"),
        ps(p, "runId"),
        ps(p, "shardId"),
        ps(p, "name"),
        value,
    ) else {
        tracing::warn!("skipped a pulled metric without its required fields");
        return Ok(());
    };
    if is_purged(conn, run)? {
        return Ok(());
    }
    conn.execute(
        "INSERT OR IGNORE INTO metrics (id, workspace_id, project_id, run_id, shard_id, name,
                aggregation, scope, value, unit, threshold, passed, attributes, created_by,
                created_at, hlc)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            id,
            ensure_workspace(conn)?,
            project,
            run,
            shard,
            name,
            ps(p, "aggregation"),
            ps(p, "scope"),
            value,
            ps(p, "unit"),
            ps(p, "threshold"),
            p.get("passed").and_then(Value::as_bool),
            text_of(p, "attributes").unwrap_or_else(|| "{}".into()),
            ps(p, "createdBy").unwrap_or_default(),
            ps(p, "createdAt").unwrap_or_default(),
            ps(p, "hlc").unwrap_or_default(),
        ],
    )
    .map_err(err)?;
    Ok(())
}

pub fn metric_owner(conn: &Connection, id: &str) -> Result<Option<String>, String> {
    owner_of(conn, METRIC, id)
}

/// `(entity, id)` of the findings and metrics of a run, for the purge.
pub(crate) fn appended_rows(
    conn: &Connection,
    run_id: &str,
) -> Result<Vec<(&'static str, String)>, String> {
    let mut out = Vec::new();
    for (entity, table) in [(FINDING, "findings"), (METRIC, "metrics")] {
        let mut stmt = conn
            .prepare(&format!("SELECT id FROM {table} WHERE run_id = ?1"))
            .map_err(err)?;
        let rows = stmt
            .query_map(params![run_id], |r| r.get::<_, String>(0))
            .map_err(err)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(err)?;
        out.extend(rows.into_iter().map(|id| (entity, id)));
    }
    Ok(out)
}

// ---- triage (ADR-0012; ADR-0053 as amended: append-only events) --------------

/// One triage decision as read. The current one of a fingerprint is the
/// latest (HLC, then id).
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TriageEvent {
    pub id: String,
    pub fingerprint: String,
    pub state: String,
    pub reason: Option<String>,
    pub defect_id: Option<String>,
    pub created_by: String,
    pub created_at: String,
}

/// Records a triage decision on a fingerprint of the project, in the
/// transaction of the caller. A reason is required unless the decision is
/// `open`. Returns the id of the new event.
pub fn triage_add(
    conn: &Connection,
    project_id: &str,
    user: &str,
    fingerprint: &str,
    state: &str,
    reason: Option<&str>,
    defect_id: Option<&str>,
) -> Result<String, String> {
    if !crate::project::owns(conn, project_id, user)? {
        return Err("project-not-found".into());
    }
    let fingerprint = fingerprint.trim();
    if fingerprint.is_empty() {
        return Err("invalid-triage: fingerprint".into());
    }
    if !TRIAGE_STATES.contains(&state) {
        return Err(format!("invalid-triage: state {state}"));
    }
    let reason = reason.map(str::trim).filter(|r| !r.is_empty());
    if state != "open" && reason.is_none() {
        return Err("invalid-triage: reason".into());
    }
    let id = Uuid::new_v4().to_string();
    let hlc = crate::oplog::next_hlc(conn)?;
    conn.execute(
        "INSERT INTO finding_triage (id, workspace_id, project_id, fingerprint, state, reason,
                defect_id, created_by, created_at, hlc)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?9)",
        params![
            id,
            ensure_workspace(conn)?,
            project_id,
            clip(fingerprint, MAX_TEXT).0,
            state,
            reason.map(|r| clip(r, MAX_REASON).0),
            defect_id.map(str::trim).filter(|d| !d.is_empty()),
            user,
            hlc,
        ],
    )
    .map_err(err)?;
    journal::record_append(conn, FINDING_TRIAGE, &id, user)?;
    Ok(id)
}

fn event_of(r: &rusqlite::Row) -> rusqlite::Result<TriageEvent> {
    Ok(TriageEvent {
        id: r.get("id")?,
        fingerprint: r.get("fingerprint")?,
        state: r.get("state")?,
        reason: r.get("reason")?,
        defect_id: r.get("defect_id")?,
        created_by: r.get("created_by")?,
        created_at: r.get("created_at")?,
    })
}

/// The decisions on a fingerprint, newest first (HLC, then id: the same
/// order on every device).
pub fn triage_history(
    conn: &Connection,
    project_id: &str,
    fingerprint: &str,
) -> Result<Vec<TriageEvent>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT * FROM finding_triage WHERE project_id = ?1 AND fingerprint = ?2
              ORDER BY hlc DESC, id DESC",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map(params![project_id, fingerprint], event_of)
        .map_err(err)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(err)?;
    Ok(rows)
}

/// The current decision on each fingerprint of the project that has one.
pub fn triage_current(
    conn: &Connection,
    project_id: &str,
) -> Result<HashMap<String, TriageEvent>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT * FROM finding_triage t WHERE t.project_id = ?1
               AND NOT EXISTS (SELECT 1 FROM finding_triage n
                                WHERE n.project_id = t.project_id
                                  AND n.fingerprint = t.fingerprint
                                  AND (n.hlc > t.hlc OR (n.hlc = t.hlc AND n.id > t.id)))",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map(params![project_id], event_of)
        .map_err(err)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(err)?;
    Ok(rows
        .into_iter()
        .map(|e| (e.fingerprint.clone(), e))
        .collect())
}

/// The `finding_triage` document pushed for a row.
pub fn triage_payload(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    conn.query_row(
        "SELECT * FROM finding_triage WHERE id = ?1",
        params![id],
        |r| {
            let s = |c: &str| r.get::<_, Option<String>>(c);
            Ok(json!({
                "id": s("id")?, "workspaceId": s("workspace_id")?, "projectId": s("project_id")?,
                "fingerprint": s("fingerprint")?, "state": s("state")?, "reason": s("reason")?,
                "defectId": s("defect_id")?, "createdBy": s("created_by")?,
                "createdAt": s("created_at")?, "hlc": s("hlc")?,
            }))
        },
    )
    .optional()
    .map_err(err)
}

/// Stores a pulled triage decision unless its id is here.
pub fn triage_insert_if_absent(conn: &Connection, _user: &str, p: &Value) -> Result<(), String> {
    let state_ok = ps(p, "state").is_some_and(|s| TRIAGE_STATES.contains(&s));
    let (Some(id), Some(project), Some(fp), Some(hlc), true) = (
        ps(p, "id"),
        ps(p, "projectId"),
        ps(p, "fingerprint"),
        ps(p, "hlc"),
        state_ok,
    ) else {
        tracing::warn!("skipped a pulled finding_triage without its required fields");
        return Ok(());
    };
    conn.execute(
        "INSERT OR IGNORE INTO finding_triage (id, workspace_id, project_id, fingerprint, state,
                reason, defect_id, created_by, created_at, hlc)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            id,
            ensure_workspace(conn)?,
            project,
            fp,
            ps(p, "state"),
            ps(p, "reason"),
            ps(p, "defectId"),
            ps(p, "createdBy").unwrap_or_default(),
            ps(p, "createdAt").unwrap_or_default(),
            hlc,
        ],
    )
    .map_err(err)?;
    Ok(())
}

pub fn triage_owner(conn: &Connection, id: &str) -> Result<Option<String>, String> {
    owner_of(conn, FINDING_TRIAGE, id)
}
