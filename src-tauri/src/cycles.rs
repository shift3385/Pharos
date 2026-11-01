//! Test cycles and configurations (CYC-01, ADR-0017; design 0.2.0 §5 step 6).
//! Schema in migration 0028.
//!
//! - A **configuration** is where something runs ("Chrome · Windows 11"):
//!   attributes `{browser, os, device, locale}` and the `match_labels` an
//!   import recognizes it by. Archived, never deleted: runs point at it.
//! - A **cycle** (`CYC-001`) is what (items), where (configurations), against
//!   what (build, environment) and when (dates, plan milestone and sprint as
//!   text). Status `planned | active | closed`; a closed cycle takes no items
//!   and no runs until it is reopened.
//! - An **item** is one case, optionally one flow or Outline row, with its
//!   assignee. Its own entity: two people adding cases to one cycle never
//!   conflict. "Add by filter" resolves the filter once; the list is static.
//! - **Executing** a cycle creates one run per configuration
//!   (`runs.cycle_id`, `runs.configuration_id`); its run items copy the cycle
//!   items and freeze the revision current at that moment (`runs::add_items`).
//! - **Progress** is derived (`progress.rs`): per item × configuration, the
//!   latest final result among the cycle's runs.
//!
//! Every row carries `project_id` and belongs to the project's owner (ADR-0020
//! rule 1). `test_cycle_items` has no foreign key to its cycle: a pull can
//! bring an item first. All three are lww (`oplog::SYNCED`) and wait for a
//! server that lists `cycles` (`sync::server_takes_cycles`).

pub mod progress;
#[cfg(test)]
mod tests;

use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::State;
#[cfg(test)]
use ts_rs::TS;
use uuid::Uuid;

use crate::db::{ensure_workspace, Db};
use crate::journal::{self, Action, Actor, Audit, Change};
use crate::keys::{self, KeyKind};
use crate::project;
use crate::runs::{self, derive::Attempt};

pub(crate) const KEY_PREFIX: &str = "CYC-";
pub(crate) const KEY_DIGITS: usize = 3;

pub const CONFIGURATION: &str = "configuration";
pub const CYCLE: &str = "test_cycle";
pub const CYCLE_ITEM: &str = "test_cycle_item";

/// The entities of this module (all lww).
pub const ENTITIES: [&str; 3] = [CONFIGURATION, CYCLE, CYCLE_ITEM];

const STATUSES: [&str; 3] = ["planned", "active", "closed"];
const ATTRIBUTES: [&str; 4] = ["browser", "os", "device", "locale"];

/// The server's limits (`CYCLE_PAYLOADS` in `sync.schemas.ts`), checked here
/// too: a document the server refuses would stay pending for ever. UTF-16
/// units, as zod counts.
pub(crate) const MAX_NAME: usize = 200;
pub(crate) const MAX_TITLE: usize = 500;
pub(crate) const MAX_SHORT: usize = 200;
pub(crate) const MAX_DESCRIPTION: usize = 10_000;
pub(crate) const MAX_LABELS: usize = 50;
pub(crate) const MAX_CONFIGURATIONS: usize = 200;

/// Every entity of this module as an SQL list literal, for `entity IN (...)`.
pub(crate) fn entities_sql_list() -> String {
    ENTITIES
        .iter()
        .map(|e| format!("'{e}'"))
        .collect::<Vec<_>>()
        .join(",")
}

// ---- types -------------------------------------------------------------------

/// A match label this configuration shares with another live one (two
/// devices can create the same label offline). Imports take the configuration
/// with the smallest id (`wins`), on every device alike (ADR-0017).
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LabelClash {
    pub(crate) label: String,
    pub(crate) other_id: String,
    pub(crate) other_name: String,
    /// True if imports map the label to this configuration.
    pub(crate) wins: bool,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Configuration {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) name: String,
    #[cfg_attr(test, ts(type = "Record<string, string>"))]
    pub(crate) attributes: Value,
    pub(crate) match_labels: Vec<String>,
    pub(crate) position: i64,
    pub(crate) archived: bool,
    pub(crate) revision: i64,
    pub(crate) label_clashes: Vec<LabelClash>,
}

/// On create `projectId` and `name` are required; on update a field left out
/// keeps its value.
#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConfigurationInput {
    pub(crate) project_id: Option<String>,
    pub(crate) name: Option<String>,
    #[cfg_attr(test, ts(type = "Record<string, string | null>", optional))]
    pub(crate) attributes: Option<Value>,
    pub(crate) match_labels: Option<Vec<String>>,
    pub(crate) user_id: String,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TestCycle {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) cycle_key: String,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) test_plan_id: Option<String>,
    pub(crate) milestone: Option<String>,
    pub(crate) sprint: Option<String>,
    pub(crate) build: Option<String>,
    pub(crate) environment: Option<String>,
    pub(crate) configuration_ids: Vec<String>,
    pub(crate) starts_on: Option<String>,
    pub(crate) ends_on: Option<String>,
    pub(crate) status: String,
    #[cfg_attr(test, ts(type = "Record<string, unknown>"))]
    pub(crate) data: Value,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
    pub(crate) revision: i64,
}

/// A cycle as the list shows it.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CycleSummary {
    #[serde(flatten)]
    pub(crate) cycle: TestCycle,
    pub(crate) items: i64,
    pub(crate) runs: i64,
    pub(crate) progress: ProgressSummary,
}

/// On create `projectId` and `title` are required. On update a field left out
/// keeps its value and an empty text clears an optional one.
#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TestCycleInput {
    pub(crate) project_id: Option<String>,
    pub(crate) title: Option<String>,
    pub(crate) description: Option<String>,
    pub(crate) test_plan_id: Option<String>,
    pub(crate) milestone: Option<String>,
    pub(crate) sprint: Option<String>,
    pub(crate) build: Option<String>,
    pub(crate) environment: Option<String>,
    pub(crate) configuration_ids: Option<Vec<String>>,
    pub(crate) starts_on: Option<String>,
    pub(crate) ends_on: Option<String>,
    pub(crate) status: Option<String>,
    #[cfg_attr(test, ts(type = "Record<string, unknown>", optional))]
    pub(crate) data: Option<Value>,
    pub(crate) user_id: String,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CycleItem {
    pub(crate) id: String,
    pub(crate) cycle_id: String,
    pub(crate) test_case_id: String,
    /// The case's key, title, status and priority now (empty if it is gone).
    pub(crate) case_key: String,
    pub(crate) case_title: String,
    pub(crate) case_status: String,
    pub(crate) case_priority: String,
    pub(crate) flow_id: Option<String>,
    pub(crate) example_row_id: Option<String>,
    pub(crate) assignee: Option<String>,
    pub(crate) position: i64,
    pub(crate) revision: i64,
}

#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CycleItemInput {
    pub(crate) test_case_id: String,
    pub(crate) flow_id: Option<String>,
    pub(crate) example_row_id: Option<String>,
    pub(crate) assignee: Option<String>,
}

/// What an addition did: ids added, identical items skipped, and the keys of
/// the added cases that are not approved (a warning, never a block: ADR-0017
/// decision 2).
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AddOutcome {
    pub(crate) added: Vec<String>,
    pub(crate) skipped: i64,
    pub(crate) not_approved: Vec<String>,
}

/// "Add by filter": every non-empty criterion must hold; inside one, any value.
/// `minRisk`: the highest `risk_likelihood × risk_impact` of the case's
/// requirements is at least this (a case without an assessed one does not
/// match).
#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CycleFilter {
    pub(crate) tags: Option<Vec<String>>,
    pub(crate) requirement_keys: Option<Vec<String>>,
    pub(crate) priorities: Option<Vec<String>>,
    pub(crate) statuses: Option<Vec<String>>,
    pub(crate) min_risk: Option<i64>,
}

#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CycleItemUpdate {
    /// Empty clears it.
    pub(crate) assignee: Option<String>,
    pub(crate) user_id: String,
}

/// "Ejecutar": which configurations (default: every live one of the cycle)
/// and the build or environment of these runs (default: the cycle's).
#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteInput {
    pub(crate) configuration_ids: Option<Vec<String>>,
    pub(crate) title: Option<String>,
    pub(crate) build: Option<String>,
    pub(crate) environment: Option<String>,
    pub(crate) user_id: String,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Default, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProgressSummary {
    pub(crate) total: i64,
    pub(crate) executed: i64,
    pub(crate) passed: i64,
    pub(crate) failed: i64,
    pub(crate) blocked: i64,
    pub(crate) skipped: i64,
    pub(crate) other: i64,
    pub(crate) not_run: i64,
}

impl ProgressSummary {
    fn count(&mut self, status: &str) {
        self.total += 1;
        match status {
            progress::NOT_RUN => self.not_run += 1,
            "passed" => self.passed += 1,
            "failed" => self.failed += 1,
            "blocked" => self.blocked += 1,
            "skipped" => self.skipped += 1,
            _ => self.other += 1,
        }
        if status != progress::NOT_RUN {
            self.executed += 1;
        }
    }
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProgressCell {
    pub(crate) item_id: String,
    pub(crate) configuration_id: Option<String>,
    /// passed | failed | blocked | skipped | other | not_run
    pub(crate) status: String,
    pub(crate) result_id: Option<String>,
    pub(crate) run_id: Option<String>,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConfigurationProgress {
    pub(crate) configuration_id: Option<String>,
    pub(crate) summary: ProgressSummary,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CycleProgress {
    /// The columns, in order: the cycle's configurations, or one `null`.
    pub(crate) configuration_ids: Vec<Option<String>>,
    pub(crate) cells: Vec<ProgressCell>,
    pub(crate) by_configuration: Vec<ConfigurationProgress>,
    pub(crate) summary: ProgressSummary,
}

// ---- helpers -----------------------------------------------------------------

fn err(e: rusqlite::Error) -> String {
    e.to_string()
}

fn within(field: &str, value: &str, max: usize) -> Result<(), String> {
    if value.encode_utf16().count() > max {
        return Err(format!("{field}-too-long: at most {max} characters"));
    }
    Ok(())
}

/// A non-empty trimmed string, or None.
fn text(v: &Option<String>) -> Option<String> {
    v.as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn json_col(r: &rusqlite::Row, col: &str, empty: Value) -> rusqlite::Result<Value> {
    let s: Option<String> = r.get(col)?;
    Ok(s.and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(empty))
}

fn strings(v: &Value) -> Vec<String> {
    v.as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(String::from)
        .collect()
}

fn to_json<T: Serialize>(v: &T) -> Result<String, String> {
    serde_json::to_string(v).map_err(|e| e.to_string())
}

/// A label as imports compare it: trimmed, lower case.
pub(crate) fn normalize_label(label: &str) -> String {
    label.trim().to_lowercase()
}

/// `YYYY-MM-DD`, a real day.
fn valid_day(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    let num = |r: std::ops::Range<usize>| -> Option<u32> {
        let p = &s[r];
        p.bytes()
            .all(|c| c.is_ascii_digit())
            .then(|| p.parse().ok())?
    };
    let (Some(y), Some(m), Some(d)) = (num(0..4), num(5..7), num(8..10)) else {
        return false;
    };
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let days = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days).contains(&d)
}

/// Bumps a row's revision and journals the update with its snapshot.
fn record_update(
    conn: &Connection,
    entity: &str,
    id: &str,
    user: &str,
    before: Option<Value>,
    audit: Audit,
) -> Result<i64, String> {
    let table = table_for(entity).ok_or("unknown entity")?;
    let revision: i64 = conn
        .query_row(
            &format!(
                "UPDATE {table} SET revision = revision + 1, updated_by = ?2,
                    updated_at = datetime('now') WHERE id = ?1 RETURNING revision"
            ),
            params![id, user],
            |r| r.get(0),
        )
        .map_err(err)?;
    let mut change = Change::new(
        entity,
        id,
        Action::Update,
        Actor::user(user),
        "upsert",
        revision,
        user,
    )
    .before(before);
    change.audit = audit;
    journal::record(conn, change)?;
    Ok(revision)
}

/// Soft-deletes a row and journals it.
fn record_delete(
    conn: &Connection,
    entity: &str,
    id: &str,
    user: &str,
    audit: Audit,
) -> Result<(), String> {
    let table = table_for(entity).ok_or("unknown entity")?;
    let before = journal::snapshot(conn, entity, id)?;
    let revision: i64 = conn
        .query_row(
            &format!(
                "UPDATE {table} SET deleted_at = datetime('now'), revision = revision + 1,
                    updated_by = ?2, updated_at = datetime('now') WHERE id = ?1 RETURNING revision"
            ),
            params![id, user],
            |r| r.get(0),
        )
        .map_err(err)?;
    let mut change = Change::new(
        entity,
        id,
        Action::Delete,
        Actor::user(user),
        "delete",
        revision,
        user,
    )
    .before(before);
    change.audit = audit;
    journal::record(conn, change)
}

fn record_create(
    conn: &Connection,
    entity: &str,
    id: &str,
    user: &str,
    audit: Audit,
) -> Result<(), String> {
    let mut change = Change::new(
        entity,
        id,
        Action::Create,
        Actor::user(user),
        "upsert",
        1,
        user,
    );
    change.audit = audit;
    journal::record(conn, change)
}

// ---- configurations --------------------------------------------------------------

fn map_configuration(r: &rusqlite::Row) -> rusqlite::Result<Configuration> {
    Ok(Configuration {
        id: r.get("id")?,
        project_id: r.get("project_id")?,
        name: r.get("name")?,
        attributes: json_col(r, "attributes", json!({}))?,
        match_labels: strings(&json_col(r, "match_labels", json!([]))?),
        position: r.get("position")?,
        archived: r.get::<_, Option<String>>("archived_at")?.is_some(),
        revision: r.get("revision")?,
        label_clashes: Vec::new(),
    })
}

/// Live configurations of a project (archived ones too), by position.
fn project_configurations(
    conn: &Connection,
    project_id: &str,
) -> Result<Vec<Configuration>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT * FROM configurations WHERE project_id = ?1 AND deleted_at IS NULL
              ORDER BY position, created_at, rowid",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map(params![project_id], map_configuration)
        .map_err(err)?;
    let mut list: Vec<Configuration> = rows.collect::<rusqlite::Result<_>>().map_err(err)?;
    // Labels shared by live, not archived configurations (only possible when
    // two devices created them offline): the smallest id wins on every device.
    let mut holders: HashMap<String, Vec<(String, String)>> = HashMap::new();
    for c in list.iter().filter(|c| !c.archived) {
        for l in &c.match_labels {
            holders
                .entry(normalize_label(l))
                .or_default()
                .push((c.id.clone(), c.name.clone()));
        }
    }
    for c in list.iter_mut().filter(|c| !c.archived) {
        for l in c.match_labels.clone() {
            let Some(hs) = holders.get(&normalize_label(&l)) else {
                continue;
            };
            if hs.len() < 2 {
                continue;
            }
            let winner = hs.iter().map(|h| &h.0).min().cloned().unwrap_or_default();
            for (other_id, other_name) in hs.iter().filter(|h| h.0 != c.id) {
                c.label_clashes.push(LabelClash {
                    label: l.clone(),
                    other_id: other_id.clone(),
                    other_name: other_name.clone(),
                    wins: winner == c.id,
                });
            }
        }
    }
    Ok(list)
}

pub(crate) fn list_configurations(
    conn: &Connection,
    project_id: &str,
    user: &str,
    include_archived: bool,
) -> Result<Vec<Configuration>, String> {
    if !project::owns(conn, project_id, user)? {
        return Ok(Vec::new());
    }
    Ok(project_configurations(conn, project_id)?
        .into_iter()
        .filter(|c| include_archived || !c.archived)
        .collect())
}

fn get_configuration(conn: &Connection, id: &str) -> Result<Option<Configuration>, String> {
    let project: Option<String> = conn
        .query_row(
            "SELECT project_id FROM configurations WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?;
    let Some(project) = project else {
        return Ok(None);
    };
    Ok(project_configurations(conn, &project)?
        .into_iter()
        .find(|c| c.id == id))
}

/// Project of a live configuration the user owns.
fn owned_configuration(conn: &Connection, id: &str, user: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT c.project_id FROM configurations c JOIN projects p ON p.id = c.project_id
          WHERE c.id = ?1 AND p.owner_id = ?2 AND c.deleted_at IS NULL AND p.deleted_at IS NULL",
        params![id, user],
        |r| r.get(0),
    )
    .optional()
    .map_err(err)?
    .ok_or_else(|| "configuration not found".to_string())
}

/// Only `browser`, `os`, `device` and `locale`, as trimmed text; an empty or
/// null one is dropped.
fn check_attributes(v: &Value) -> Result<Value, String> {
    let Value::Object(map) = v else {
        return Err("attributes must be an object".into());
    };
    let mut out = Map::new();
    for (k, val) in map {
        if !ATTRIBUTES.contains(&k.as_str()) {
            return Err(format!("unknown configuration attribute: {k}"));
        }
        match val {
            Value::Null => {}
            Value::String(s) => {
                let s = s.trim();
                within(k, s, MAX_SHORT)?;
                if !s.is_empty() {
                    out.insert(k.clone(), Value::String(s.to_string()));
                }
            }
            _ => return Err(format!("attribute {k} must be text")),
        }
    }
    Ok(Value::Object(out))
}

/// Trimmed, without empty ones or repeats (case-insensitive, the first kept).
fn check_labels(labels: &[String]) -> Result<Vec<String>, String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for l in labels {
        let l = l.trim();
        if l.is_empty() || !seen.insert(normalize_label(l)) {
            continue;
        }
        within("matchLabel", l, MAX_SHORT)?;
        out.push(l.to_string());
    }
    if out.len() > MAX_LABELS {
        return Err(format!("too-many-labels: at most {MAX_LABELS}"));
    }
    Ok(out)
}

/// A label another live, not archived configuration of the project already
/// has (ADR-0017: an import maps one label to one configuration).
fn check_labels_free(
    conn: &Connection,
    project_id: &str,
    labels: &[String],
    except: Option<&str>,
) -> Result<(), String> {
    let taken: HashMap<String, String> = project_configurations(conn, project_id)?
        .into_iter()
        .filter(|c| !c.archived && Some(c.id.as_str()) != except)
        .flat_map(|c| {
            let name = c.name.clone();
            c.match_labels
                .into_iter()
                .map(move |l| (normalize_label(&l), name.clone()))
        })
        .collect();
    for l in labels {
        if let Some(name) = taken.get(&normalize_label(l)) {
            return Err(format!("match-label-taken: {l} ({name})"));
        }
    }
    Ok(())
}

pub(crate) fn create_configuration(
    conn: &Connection,
    input: &ConfigurationInput,
) -> Result<String, String> {
    let user = &input.user_id;
    let project_id = text(&input.project_id).ok_or("projectId is required")?;
    if !project::owns(conn, &project_id, user)? {
        return Err("project not found".into());
    }
    let name = text(&input.name).ok_or("name is required")?;
    within("name", &name, MAX_NAME)?;
    let attributes = check_attributes(input.attributes.as_ref().unwrap_or(&json!({})))?;
    let labels = check_labels(input.match_labels.as_deref().unwrap_or_default())?;
    check_labels_free(conn, &project_id, &labels, None)?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO configurations (id, workspace_id, project_id, name, attributes, match_labels,
                position, created_by, updated_by, created_at, updated_at, revision)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6,
                (SELECT coalesce(max(position) + 1, 0) FROM configurations WHERE project_id = ?3),
                ?7, ?7, datetime('now'), datetime('now'), 1)",
        params![
            id,
            ensure_workspace(conn)?,
            project_id,
            name,
            attributes.to_string(),
            to_json(&labels)?,
            user
        ],
    )
    .map_err(err)?;
    record_create(conn, CONFIGURATION, &id, user, Audit::Event)?;
    Ok(id)
}

pub(crate) fn update_configuration(
    conn: &Connection,
    id: &str,
    input: &ConfigurationInput,
) -> Result<(), String> {
    let user = &input.user_id;
    let project_id = owned_configuration(conn, id, user)?;
    let name = match &input.name {
        Some(_) => Some(text(&input.name).ok_or("name is required")?),
        None => None,
    };
    if let Some(n) = &name {
        within("name", n, MAX_NAME)?;
    }
    let attributes = input
        .attributes
        .as_ref()
        .map(check_attributes)
        .transpose()?;
    let labels = input
        .match_labels
        .as_deref()
        .map(check_labels)
        .transpose()?;
    let archived: bool = conn
        .query_row(
            "SELECT archived_at IS NOT NULL FROM configurations WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(err)?;
    if let (Some(l), false) = (&labels, archived) {
        check_labels_free(conn, &project_id, l, Some(id))?;
    }
    let before = journal::snapshot(conn, CONFIGURATION, id)?;
    conn.execute(
        "UPDATE configurations SET name = coalesce(?2, name), attributes = coalesce(?3, attributes),
                match_labels = coalesce(?4, match_labels) WHERE id = ?1",
        params![
            id,
            name,
            attributes.map(|a| a.to_string()),
            labels.map(|l| to_json(&l)).transpose()?
        ],
    )
    .map_err(err)?;
    record_update(conn, CONFIGURATION, id, user, before, Audit::Event)?;
    Ok(())
}

/// Archives or restores a configuration. An archived one stays in the cycles
/// and runs that have it; it is not offered for new ones and `execute` skips
/// it. Restoring checks its labels again.
pub(crate) fn set_configuration_archived(
    conn: &Connection,
    id: &str,
    archived: bool,
    user: &str,
) -> Result<(), String> {
    let project_id = owned_configuration(conn, id, user)?;
    let current = get_configuration(conn, id)?.ok_or("configuration not found")?;
    if current.archived == archived {
        return Ok(());
    }
    if !archived {
        check_labels_free(conn, &project_id, &current.match_labels, Some(id))?;
    }
    let before = journal::snapshot(conn, CONFIGURATION, id)?;
    conn.execute(
        "UPDATE configurations SET archived_at = CASE WHEN ?2 THEN datetime('now') END
          WHERE id = ?1",
        params![id, archived],
    )
    .map_err(err)?;
    record_update(conn, CONFIGURATION, id, user, before, Audit::Event)?;
    Ok(())
}

/// New order of a project's configurations: one oplog row per moved row and
/// one event (ADR-0015: a bulk operation is one event).
pub(crate) fn reorder_configurations(
    conn: &Connection,
    project_id: &str,
    ids: &[String],
    user: &str,
) -> Result<(), String> {
    if !project::owns(conn, project_id, user)? {
        return Err("project not found".into());
    }
    let list = project_configurations(conn, project_id)?;
    let moved = reorder_rows(
        conn,
        CONFIGURATION,
        list.iter().map(|c| (c.id.as_str(), c.position)).collect(),
        ids,
        user,
    )?;
    if moved > 0 {
        journal::record_event_in(
            conn,
            Actor::user(user),
            Action::Update,
            "project",
            project_id,
            Some(project_id),
            Map::new(),
            Some(json!({ "configurationsReordered": moved })),
        )?;
    }
    Ok(())
}

/// Puts `ids` first, in that order, the rest after; writes only the rows whose
/// position changes (folded). Returns how many moved.
fn reorder_rows(
    conn: &Connection,
    entity: &str,
    current: Vec<(&str, i64)>,
    ids: &[String],
    user: &str,
) -> Result<usize, String> {
    let table = table_for(entity).ok_or("unknown entity")?;
    let mut ordered: Vec<(&str, i64)> = ids
        .iter()
        .filter_map(|id| current.iter().find(|c| c.0 == id).copied())
        .collect();
    for c in &current {
        if !ids.iter().any(|id| id == c.0) {
            ordered.push(*c);
        }
    }
    let mut moved = 0;
    for (pos, (id, old)) in ordered.into_iter().enumerate() {
        let pos = pos as i64;
        if pos == old {
            continue;
        }
        let before = journal::snapshot(conn, entity, id)?;
        conn.execute(
            &format!("UPDATE {table} SET position = ?2 WHERE id = ?1"),
            params![id, pos],
        )
        .map_err(err)?;
        record_update(conn, entity, id, user, before, Audit::Folded)?;
        moved += 1;
    }
    Ok(moved)
}

/// The configuration an import label stands for (step 9, ADR-0017): a live,
/// not archived configuration of the project with that match label
/// (trimmed, case-insensitive), else one with that name. When two have it
/// (created offline on two devices), the smallest id wins, on every device
/// alike; never two.
// The importers (step 9) are its production caller.
#[cfg_attr(not(test), allow(dead_code))]
pub fn match_configuration(
    conn: &Connection,
    project_id: &str,
    label: &str,
) -> Result<Option<String>, String> {
    let wanted = normalize_label(label);
    if wanted.is_empty() {
        return Ok(None);
    }
    let live: Vec<Configuration> = project_configurations(conn, project_id)?
        .into_iter()
        .filter(|c| !c.archived)
        .collect();
    let by_label = live
        .iter()
        .filter(|c| c.match_labels.iter().any(|l| normalize_label(l) == wanted))
        .map(|c| c.id.clone())
        .min();
    if by_label.is_some() {
        return Ok(by_label);
    }
    Ok(live
        .iter()
        .filter(|c| normalize_label(&c.name) == wanted)
        .map(|c| c.id.clone())
        .min())
}

// ---- cycles --------------------------------------------------------------------

const SELECT_CYCLE: &str = "SELECT x.* FROM test_cycles x JOIN projects p ON p.id = x.project_id";

fn map_cycle(r: &rusqlite::Row) -> rusqlite::Result<TestCycle> {
    Ok(TestCycle {
        id: r.get("id")?,
        project_id: r.get("project_id")?,
        cycle_key: r.get("cycle_key")?,
        title: r.get("title")?,
        description: r.get("description")?,
        test_plan_id: r.get("test_plan_id")?,
        milestone: r.get("milestone")?,
        sprint: r.get("sprint")?,
        build: r.get("build")?,
        environment: r.get("environment")?,
        configuration_ids: strings(&json_col(r, "configuration_ids", json!([]))?),
        starts_on: r.get("starts_on")?,
        ends_on: r.get("ends_on")?,
        status: r.get("status")?,
        data: json_col(r, "data", json!({}))?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
        revision: r.get("revision")?,
    })
}

pub(crate) fn get_cycle(
    conn: &Connection,
    id: &str,
    user: &str,
) -> Result<Option<TestCycle>, String> {
    conn.query_row(
        &format!(
            "{SELECT_CYCLE} WHERE x.id = ?1 AND p.owner_id = ?2 AND x.deleted_at IS NULL \
             AND p.deleted_at IS NULL"
        ),
        params![id, user],
        map_cycle,
    )
    .optional()
    .map_err(err)
}

fn owned_cycle(conn: &Connection, id: &str, user: &str) -> Result<TestCycle, String> {
    get_cycle(conn, id, user)?.ok_or_else(|| "cycle not found".to_string())
}

fn require_open(cycle: &TestCycle) -> Result<(), String> {
    if cycle.status == "closed" {
        return Err("cycle-closed".into());
    }
    Ok(())
}

pub(crate) fn list_cycles(
    conn: &Connection,
    project_id: &str,
    user: &str,
) -> Result<Vec<CycleSummary>, String> {
    let cycles: Vec<TestCycle> = {
        let mut stmt = conn
            .prepare(&format!(
                "{SELECT_CYCLE} WHERE x.project_id = ?1 AND p.owner_id = ?2 \
                 AND x.deleted_at IS NULL AND p.deleted_at IS NULL \
                 ORDER BY x.created_at DESC, x.rowid DESC"
            ))
            .map_err(err)?;
        let rows = stmt
            .query_map(params![project_id, user], map_cycle)
            .map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)?
    };
    let mut out = Vec::new();
    for cycle in cycles {
        let items: i64 = conn
            .query_row(
                "SELECT count(*) FROM test_cycle_items WHERE cycle_id = ?1 AND deleted_at IS NULL",
                params![cycle.id],
                |r| r.get(0),
            )
            .map_err(err)?;
        let runs: i64 = conn
            .query_row(
                "SELECT count(*) FROM runs WHERE cycle_id = ?1 AND deleted_at IS NULL",
                params![cycle.id],
                |r| r.get(0),
            )
            .map_err(err)?;
        let progress = cycle_progress_of(conn, &cycle)?.summary;
        out.push(CycleSummary {
            cycle,
            items,
            runs,
            progress,
        });
    }
    Ok(out)
}

/// The configurations of a cycle: live ones of the project; one added now
/// must not be archived (`keep` are those it already had).
fn check_configuration_ids(
    conn: &Connection,
    project_id: &str,
    ids: &[String],
    keep: &[String],
) -> Result<Vec<String>, String> {
    let live = project_configurations(conn, project_id)?;
    let mut out: Vec<String> = Vec::new();
    for id in ids {
        let id = id.trim();
        if id.is_empty() || out.iter().any(|o| o == id) {
            continue;
        }
        let Some(c) = live.iter().find(|c| c.id == id) else {
            return Err(format!("configuration-not-found: {id}"));
        };
        if c.archived && !keep.iter().any(|k| k == id) {
            return Err(format!("configuration-archived: {}", c.name));
        }
        out.push(id.to_string());
    }
    if out.len() > MAX_CONFIGURATIONS {
        return Err(format!(
            "too-many-configurations: at most {MAX_CONFIGURATIONS}"
        ));
    }
    Ok(out)
}

fn check_plan(conn: &Connection, project_id: &str, plan: &str) -> Result<(), String> {
    let ok = conn
        .query_row(
            "SELECT 1 FROM test_plans WHERE id = ?1 AND project_id = ?2 AND deleted_at IS NULL",
            params![plan, project_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(err)?
        .is_some();
    if !ok {
        return Err(format!("test plan not found: {plan}"));
    }
    Ok(())
}

/// The header fields of an input, checked: `Some(None)` clears, `None` keeps.
struct Header {
    description: Option<String>,
    test_plan_id: Option<Option<String>>,
    milestone: Option<Option<String>>,
    sprint: Option<Option<String>>,
    build: Option<Option<String>>,
    environment: Option<Option<String>>,
    starts_on: Option<Option<String>>,
    ends_on: Option<Option<String>>,
    data: Option<Value>,
}

fn header(conn: &Connection, project_id: &str, input: &TestCycleInput) -> Result<Header, String> {
    let opt = |field: &str, v: &Option<String>| -> Result<Option<Option<String>>, String> {
        match v {
            None => Ok(None),
            Some(_) => {
                let t = text(v);
                if let Some(t) = &t {
                    within(field, t, MAX_SHORT)?;
                }
                Ok(Some(t))
            }
        }
    };
    let day = |field: &str, v: &Option<String>| -> Result<Option<Option<String>>, String> {
        let d = opt(field, v)?;
        if let Some(Some(s)) = &d {
            if !valid_day(s) {
                return Err(format!("invalid {field}: {s} (YYYY-MM-DD)"));
            }
        }
        Ok(d)
    };
    let description = input.description.as_ref().map(|d| d.trim().to_string());
    if let Some(d) = &description {
        within("description", d, MAX_DESCRIPTION)?;
    }
    let test_plan_id = opt("testPlanId", &input.test_plan_id)?;
    if let Some(Some(plan)) = &test_plan_id {
        check_plan(conn, project_id, plan)?;
    }
    let data = match &input.data {
        None => None,
        Some(Value::Object(m)) => Some(Value::Object(m.clone())),
        Some(_) => return Err("data must be an object".into()),
    };
    Ok(Header {
        description,
        test_plan_id,
        milestone: opt("milestone", &input.milestone)?,
        sprint: opt("sprint", &input.sprint)?,
        build: opt("build", &input.build)?,
        environment: opt("environment", &input.environment)?,
        starts_on: day("startsOn", &input.starts_on)?,
        ends_on: day("endsOn", &input.ends_on)?,
        data,
    })
}

fn check_dates(starts: Option<&str>, ends: Option<&str>) -> Result<(), String> {
    if let (Some(s), Some(e)) = (starts, ends) {
        if s > e {
            return Err("dates-out-of-order: the cycle ends before it starts".into());
        }
    }
    Ok(())
}

fn check_status(status: &str) -> Result<(), String> {
    if !STATUSES.contains(&status) {
        return Err(format!("unknown cycle status: {status}"));
    }
    Ok(())
}

pub(crate) fn insert_cycle(conn: &Connection, input: &TestCycleInput) -> Result<String, String> {
    let user = &input.user_id;
    let project_id = text(&input.project_id).ok_or("projectId is required")?;
    if !project::owns(conn, &project_id, user)? {
        return Err("project not found".into());
    }
    let title = text(&input.title).ok_or("title is required")?;
    within("title", &title, MAX_TITLE)?;
    let h = header(conn, &project_id, input)?;
    let status = text(&input.status).unwrap_or_else(|| "planned".into());
    check_status(&status)?;
    let configuration_ids = check_configuration_ids(
        conn,
        &project_id,
        input.configuration_ids.as_deref().unwrap_or_default(),
        &[],
    )?;
    let flat = |v: Option<Option<String>>| v.flatten();
    let (starts_on, ends_on) = (flat(h.starts_on), flat(h.ends_on));
    check_dates(starts_on.as_deref(), ends_on.as_deref())?;
    let id = Uuid::new_v4().to_string();
    let key = keys::allocate(conn, KeyKind::Cycle, &project_id, KEY_PREFIX, KEY_DIGITS)?;
    conn.execute(
        "INSERT INTO test_cycles (id, workspace_id, project_id, cycle_key, title, description,
                test_plan_id, milestone, sprint, build, environment, configuration_ids, starts_on,
                ends_on, status, data, created_by, updated_by, created_at, updated_at, revision)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17,
                datetime('now'), datetime('now'), 1)",
        params![
            id,
            ensure_workspace(conn)?,
            project_id,
            key,
            title,
            h.description.unwrap_or_default(),
            flat(h.test_plan_id),
            flat(h.milestone),
            flat(h.sprint),
            flat(h.build),
            flat(h.environment),
            to_json(&configuration_ids)?,
            starts_on,
            ends_on,
            status,
            h.data.unwrap_or_else(|| json!({})).to_string(),
            user,
        ],
    )
    .map_err(err)?;
    record_create(conn, CYCLE, &id, user, Audit::Event)?;
    Ok(id)
}

/// Edits a cycle. Its status moves freely between planned, active and closed
/// (a closed cycle can be reopened). Removing a configuration is allowed even
/// if it has runs: they keep their link.
pub(crate) fn update_cycle(
    conn: &Connection,
    id: &str,
    input: &TestCycleInput,
) -> Result<(), String> {
    let user = &input.user_id;
    let cycle = owned_cycle(conn, id, user)?;
    let title = match &input.title {
        Some(_) => Some(text(&input.title).ok_or("title is required")?),
        None => None,
    };
    if let Some(t) = &title {
        within("title", t, MAX_TITLE)?;
    }
    let h = header(conn, &cycle.project_id, input)?;
    let status = text(&input.status);
    if let Some(s) = &status {
        check_status(s)?;
    }
    let configuration_ids = input
        .configuration_ids
        .as_deref()
        .map(|ids| check_configuration_ids(conn, &cycle.project_id, ids, &cycle.configuration_ids))
        .transpose()?;
    let pick = |new: &Option<Option<String>>, old: &Option<String>| match new {
        Some(v) => v.clone(),
        None => old.clone(),
    };
    let starts_on = pick(&h.starts_on, &cycle.starts_on);
    let ends_on = pick(&h.ends_on, &cycle.ends_on);
    check_dates(starts_on.as_deref(), ends_on.as_deref())?;
    let before = journal::snapshot(conn, CYCLE, id)?;
    conn.execute(
        "UPDATE test_cycles SET title = ?2, description = ?3, test_plan_id = ?4, milestone = ?5,
                sprint = ?6, build = ?7, environment = ?8, configuration_ids = ?9, starts_on = ?10,
                ends_on = ?11, status = ?12, data = ?13 WHERE id = ?1",
        params![
            id,
            title.unwrap_or(cycle.title.clone()),
            h.description.unwrap_or(cycle.description.clone()),
            pick(&h.test_plan_id, &cycle.test_plan_id),
            pick(&h.milestone, &cycle.milestone),
            pick(&h.sprint, &cycle.sprint),
            pick(&h.build, &cycle.build),
            pick(&h.environment, &cycle.environment),
            to_json(&configuration_ids.unwrap_or(cycle.configuration_ids.clone()))?,
            starts_on,
            ends_on,
            status.unwrap_or(cycle.status.clone()),
            h.data.unwrap_or(cycle.data.clone()).to_string(),
        ],
    )
    .map_err(err)?;
    record_update(conn, CYCLE, id, user, before, Audit::Event)?;
    Ok(())
}

/// «Clonar» (ADR-0017: the way to repeat a regression until CAS-02): a new
/// cycle, `planned`, with a new key, the header, the configurations and the
/// items with their assignees. One event; the items are folded.
pub(crate) fn clone_cycle(
    conn: &Connection,
    id: &str,
    title: Option<&str>,
    user: &str,
) -> Result<String, String> {
    let source = owned_cycle(conn, id, user)?;
    let title = title
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("Copia de {}", source.title));
    let title: String = if title.encode_utf16().count() > MAX_TITLE {
        title.chars().take(MAX_TITLE / 2).collect()
    } else {
        title
    };
    let new_id = Uuid::new_v4().to_string();
    let key = keys::allocate(
        conn,
        KeyKind::Cycle,
        &source.project_id,
        KEY_PREFIX,
        KEY_DIGITS,
    )?;
    conn.execute(
        "INSERT INTO test_cycles (id, workspace_id, project_id, cycle_key, title, description,
                test_plan_id, milestone, sprint, build, environment, configuration_ids, starts_on,
                ends_on, status, data, created_by, updated_by, created_at, updated_at, revision)
         SELECT ?2, workspace_id, project_id, ?3, ?4, description, test_plan_id, milestone, sprint,
                build, environment, configuration_ids, starts_on, ends_on, 'planned', data, ?5, ?5,
                datetime('now'), datetime('now'), 1
           FROM test_cycles WHERE id = ?1",
        params![id, new_id, key, title, user],
    )
    .map_err(err)?;
    let items = live_items(conn, id)?;
    let workspace = ensure_workspace(conn)?;
    for (n, it) in items.iter().enumerate() {
        let item_id = Uuid::new_v4().to_string();
        insert_item_row(
            conn,
            &workspace,
            &item_id,
            &new_id,
            &source.project_id,
            &CycleItemInput {
                test_case_id: it.test_case_id.clone(),
                flow_id: it.flow_id.clone(),
                example_row_id: it.example_row_id.clone(),
                assignee: it.assignee.clone(),
            },
            n as i64,
            user,
        )?;
        record_create(conn, CYCLE_ITEM, &item_id, user, Audit::Folded)?;
    }
    journal::record(
        conn,
        Change::new(
            CYCLE,
            &new_id,
            Action::Create,
            Actor::user(user),
            "upsert",
            1,
            user,
        )
        .summary(json!({ "clonedFrom": source.cycle_key, "items": items.len() })),
    )?;
    Ok(new_id)
}

/// Deletes a cycle and its items (soft; the purge removes them later). Its
/// runs stay: a run without a cycle is valid (ADR-0017), and they keep the
/// cycle's id. One event with the count of items.
pub(crate) fn delete_cycle(conn: &Connection, id: &str, user: &str) -> Result<(), String> {
    owned_cycle(conn, id, user)?;
    let items = live_items(conn, id)?;
    for it in &items {
        record_delete(conn, CYCLE_ITEM, &it.id, user, Audit::Folded)?;
    }
    let before = journal::snapshot(conn, CYCLE, id)?;
    let revision: i64 = conn
        .query_row(
            "UPDATE test_cycles SET deleted_at = datetime('now'), revision = revision + 1,
                updated_by = ?2, updated_at = datetime('now') WHERE id = ?1 RETURNING revision",
            params![id, user],
            |r| r.get(0),
        )
        .map_err(err)?;
    journal::record(
        conn,
        Change::new(
            CYCLE,
            id,
            Action::Delete,
            Actor::user(user),
            "delete",
            revision,
            user,
        )
        .before(before)
        .summary(json!({ "cascade": { "test_cycle_items": items.len() } })),
    )
}

/// A run's links (`runs::insert_run`, `update_run`): a live cycle of the
/// project that is not closed, and a live configuration of the project.
pub(crate) fn check_run_links(
    conn: &Connection,
    project_id: &str,
    cycle_id: Option<&str>,
    configuration_id: Option<&str>,
) -> Result<(), String> {
    if let Some(cycle) = cycle_id {
        let status: Option<String> = conn
            .query_row(
                "SELECT status FROM test_cycles WHERE id = ?1 AND project_id = ?2
                    AND deleted_at IS NULL",
                params![cycle, project_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?;
        match status.as_deref() {
            None => return Err(format!("cycle-not-found: {cycle}")),
            Some("closed") => return Err("cycle-closed".into()),
            _ => {}
        }
    }
    if let Some(configuration) = configuration_id {
        let ok = conn
            .query_row(
                "SELECT 1 FROM configurations WHERE id = ?1 AND project_id = ?2
                    AND deleted_at IS NULL",
                params![configuration, project_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(err)?
            .is_some();
        if !ok {
            return Err(format!("configuration-not-found: {configuration}"));
        }
    }
    Ok(())
}

// ---- items ---------------------------------------------------------------------

struct ItemRow {
    id: String,
    test_case_id: String,
    flow_id: Option<String>,
    example_row_id: Option<String>,
    assignee: Option<String>,
    position: i64,
}

fn live_items(conn: &Connection, cycle_id: &str) -> Result<Vec<ItemRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, test_case_id, flow_id, example_row_id, assignee, position
               FROM test_cycle_items WHERE cycle_id = ?1 AND deleted_at IS NULL
              ORDER BY position, created_at, rowid",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map(params![cycle_id], |r| {
            Ok(ItemRow {
                id: r.get(0)?,
                test_case_id: r.get(1)?,
                flow_id: r.get(2)?,
                example_row_id: r.get(3)?,
                assignee: r.get(4)?,
                position: r.get(5)?,
            })
        })
        .map_err(err)?;
    rows.collect::<rusqlite::Result<_>>().map_err(err)
}

pub(crate) fn list_items(
    conn: &Connection,
    cycle_id: &str,
    user: &str,
) -> Result<Vec<CycleItem>, String> {
    if get_cycle(conn, cycle_id, user)?.is_none() {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "SELECT i.id, i.cycle_id, i.test_case_id, coalesce(c.scenario_id, '') AS case_key,
                    coalesce(c.title, '') AS case_title, coalesce(c.status, '') AS case_status,
                    coalesce(c.priority, '') AS case_priority, i.flow_id, i.example_row_id,
                    i.assignee, i.position, i.revision
               FROM test_cycle_items i
               LEFT JOIN test_cases c ON c.id = i.test_case_id AND c.deleted_at IS NULL
              WHERE i.cycle_id = ?1 AND i.deleted_at IS NULL
              ORDER BY i.position, i.created_at, i.rowid",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map(params![cycle_id], |r| {
            Ok(CycleItem {
                id: r.get("id")?,
                cycle_id: r.get("cycle_id")?,
                test_case_id: r.get("test_case_id")?,
                case_key: r.get("case_key")?,
                case_title: r.get("case_title")?,
                case_status: r.get("case_status")?,
                case_priority: r.get("case_priority")?,
                flow_id: r.get("flow_id")?,
                example_row_id: r.get("example_row_id")?,
                assignee: r.get("assignee")?,
                position: r.get("position")?,
                revision: r.get("revision")?,
            })
        })
        .map_err(err)?;
    rows.collect::<rusqlite::Result<_>>().map_err(err)
}

#[allow(clippy::too_many_arguments)]
fn insert_item_row(
    conn: &Connection,
    workspace: &str,
    id: &str,
    cycle_id: &str,
    project_id: &str,
    item: &CycleItemInput,
    position: i64,
    user: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO test_cycle_items (id, workspace_id, cycle_id, project_id, test_case_id, flow_id,
                example_row_id, assignee, position, created_by, updated_by, created_at, updated_at,
                revision)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, datetime('now'), datetime('now'), 1)",
        params![
            id,
            workspace,
            cycle_id,
            project_id,
            item.test_case_id,
            text(&item.flow_id),
            text(&item.example_row_id),
            text(&item.assignee),
            position,
            user,
        ],
    )
    .map_err(err)?;
    Ok(())
}

/// Adds cases to a cycle. Each case must be live and of the cycle's project;
/// its flow and row must exist in the case **now** (the revision is frozen
/// later, when a run is created: ADR-0017 decision 3). An item identical to
/// one already there (case, flow, row) is skipped. A case that is not
/// approved is added and reported. One oplog row per item, one event.
pub(crate) fn add_items(
    conn: &Connection,
    cycle_id: &str,
    user: &str,
    items: &[CycleItemInput],
) -> Result<AddOutcome, String> {
    let cycle = owned_cycle(conn, cycle_id, user)?;
    require_open(&cycle)?;
    let mut present: HashSet<(String, Option<String>, Option<String>)> =
        live_items(conn, cycle_id)?
            .into_iter()
            .map(|i| (i.test_case_id, i.flow_id, i.example_row_id))
            .collect();
    let mut position: i64 = conn
        .query_row(
            "SELECT coalesce(max(position) + 1, 0) FROM test_cycle_items WHERE cycle_id = ?1",
            params![cycle_id],
            |r| r.get(0),
        )
        .map_err(err)?;
    let workspace = ensure_workspace(conn)?;
    let mut out = AddOutcome::default();
    for item in items {
        if let Some(a) = text(&item.assignee) {
            within("assignee", &a, MAX_SHORT)?;
        }
        let case: Option<(String, String, String)> = conn
            .query_row(
                "SELECT scenario_id, status, data FROM test_cases
                  WHERE id = ?1 AND project_id = ?2 AND deleted_at IS NULL",
                params![item.test_case_id, cycle.project_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .map_err(err)?;
        let Some((case_key, status, data)) = case else {
            return Err(format!("test case not found: {}", item.test_case_id));
        };
        let data: Value = serde_json::from_str(&data).unwrap_or(Value::Null);
        let shape = runs::RevisionShape::of(&data);
        let flow = shape.flow(text(&item.flow_id).as_deref())?;
        if let Some(row) = text(&item.example_row_id) {
            if !flow.rows.contains(&row) {
                return Err(format!("example row not in that flow of the case: {row}"));
            }
        }
        let identity = (
            item.test_case_id.clone(),
            text(&item.flow_id),
            text(&item.example_row_id),
        );
        if !present.insert(identity) {
            out.skipped += 1;
            continue;
        }
        let id = Uuid::new_v4().to_string();
        insert_item_row(
            conn,
            &workspace,
            &id,
            cycle_id,
            &cycle.project_id,
            item,
            position,
            user,
        )?;
        position += 1;
        record_create(conn, CYCLE_ITEM, &id, user, Audit::Folded)?;
        if status != "approved" && !out.not_approved.contains(&case_key) {
            out.not_approved.push(case_key);
        }
        out.added.push(id);
    }
    if !out.added.is_empty() {
        journal::record_event(
            conn,
            Actor::user(user),
            Action::Update,
            CYCLE,
            cycle_id,
            Map::new(),
            Some(json!({ "itemsAdded": out.added.len() })),
        )?;
    }
    Ok(out)
}

/// The cases of the project that match a filter now, oldest first.
pub(crate) fn matching_cases(
    conn: &Connection,
    project_id: &str,
    filter: &CycleFilter,
) -> Result<Vec<String>, String> {
    let set = |v: &Option<Vec<String>>| -> HashSet<String> {
        v.iter()
            .flatten()
            .map(|s| s.trim().trim_start_matches('@').to_lowercase())
            .filter(|s| !s.is_empty())
            .collect()
    };
    let (tags, reqs, prios, statuses) = (
        set(&filter.tags),
        set(&filter.requirement_keys),
        set(&filter.priorities),
        set(&filter.statuses),
    );
    let risk: HashMap<String, i64> = {
        let mut stmt = conn
            .prepare(
                "SELECT requirement_key, risk_likelihood, risk_impact FROM requirements
                  WHERE project_id = ?1 AND deleted_at IS NULL",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map(params![project_id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<i64>>(1)?,
                    r.get::<_, Option<i64>>(2)?,
                ))
            })
            .map_err(err)?;
        let mut m = HashMap::new();
        for row in rows {
            let (k, l, i) = row.map_err(err)?;
            if let Some(level) = runs::derive::risk_level(l, i) {
                m.insert(k.to_lowercase(), level);
            }
        }
        m
    };
    let mut stmt = conn
        .prepare(
            "SELECT id, status, priority, data FROM test_cases
              WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY created_at, rowid",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map(params![project_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(err)?;
    let mut out = Vec::new();
    for row in rows {
        let (id, status, priority, data) = row.map_err(err)?;
        let data: Value = serde_json::from_str(&data).unwrap_or(Value::Null);
        let lower = |key: &str| -> Vec<String> {
            strings(data.get(key).unwrap_or(&Value::Null))
                .into_iter()
                .map(|s| s.trim().trim_start_matches('@').to_lowercase())
                .collect()
        };
        let case_tags = lower("tags");
        let case_reqs = lower("requirementKeys");
        if !tags.is_empty() && !case_tags.iter().any(|t| tags.contains(t)) {
            continue;
        }
        if !reqs.is_empty() && !case_reqs.iter().any(|r| reqs.contains(r)) {
            continue;
        }
        if !prios.is_empty() && !prios.contains(&priority.to_lowercase()) {
            continue;
        }
        if !statuses.is_empty() && !statuses.contains(&status.to_lowercase()) {
            continue;
        }
        if let Some(min) = filter.min_risk {
            let max = case_reqs.iter().filter_map(|r| risk.get(r)).max();
            if max.map_or(true, |m| *m < min) {
                continue;
            }
        }
        out.push(id);
    }
    Ok(out)
}

/// «Añadir por filtro»: the cases that match now are added (whole cases);
/// later changes to the cases do not change the cycle.
pub(crate) fn add_by_filter(
    conn: &Connection,
    cycle_id: &str,
    user: &str,
    filter: &CycleFilter,
    assignee: Option<&str>,
) -> Result<AddOutcome, String> {
    let cycle = owned_cycle(conn, cycle_id, user)?;
    let items: Vec<CycleItemInput> = matching_cases(conn, &cycle.project_id, filter)?
        .into_iter()
        .map(|id| CycleItemInput {
            test_case_id: id,
            assignee: assignee.map(str::to_string),
            ..Default::default()
        })
        .collect();
    add_items(conn, cycle_id, user, &items)
}

/// Cycle and project of a live item the user owns.
fn owned_item(conn: &Connection, id: &str, user: &str) -> Result<TestCycle, String> {
    let cycle_id: String = conn
        .query_row(
            "SELECT cycle_id FROM test_cycle_items WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?
        .ok_or("cycle item not found")?;
    owned_cycle(conn, &cycle_id, user).map_err(|_| "cycle item not found".to_string())
}

pub(crate) fn update_item(
    conn: &Connection,
    id: &str,
    input: &CycleItemUpdate,
) -> Result<(), String> {
    let user = &input.user_id;
    let cycle = owned_item(conn, id, user)?;
    require_open(&cycle)?;
    let Some(_) = &input.assignee else {
        return Ok(());
    };
    let assignee = text(&input.assignee);
    if let Some(a) = &assignee {
        within("assignee", a, MAX_SHORT)?;
    }
    let before = journal::snapshot(conn, CYCLE_ITEM, id)?;
    conn.execute(
        "UPDATE test_cycle_items SET assignee = ?2 WHERE id = ?1",
        params![id, assignee],
    )
    .map_err(err)?;
    record_update(conn, CYCLE_ITEM, id, user, before, Audit::Event)?;
    Ok(())
}

pub(crate) fn remove_items(
    conn: &Connection,
    cycle_id: &str,
    ids: &[String],
    user: &str,
) -> Result<usize, String> {
    let cycle = owned_cycle(conn, cycle_id, user)?;
    require_open(&cycle)?;
    let live = live_items(conn, cycle_id)?;
    let mut removed = 0;
    for it in live.iter().filter(|i| ids.contains(&i.id)) {
        record_delete(conn, CYCLE_ITEM, &it.id, user, Audit::Folded)?;
        removed += 1;
    }
    if removed > 0 {
        journal::record_event(
            conn,
            Actor::user(user),
            Action::Update,
            CYCLE,
            cycle_id,
            Map::new(),
            Some(json!({ "itemsRemoved": removed })),
        )?;
    }
    Ok(removed)
}

pub(crate) fn reorder_items(
    conn: &Connection,
    cycle_id: &str,
    ids: &[String],
    user: &str,
) -> Result<(), String> {
    let cycle = owned_cycle(conn, cycle_id, user)?;
    require_open(&cycle)?;
    let live = live_items(conn, cycle_id)?;
    let moved = reorder_rows(
        conn,
        CYCLE_ITEM,
        live.iter().map(|i| (i.id.as_str(), i.position)).collect(),
        ids,
        user,
    )?;
    if moved > 0 {
        journal::record_event(
            conn,
            Actor::user(user),
            Action::Update,
            CYCLE,
            cycle_id,
            Map::new(),
            Some(json!({ "itemsReordered": moved })),
        )?;
    }
    Ok(())
}

/// The live item of a cycle an imported result belongs to (step 9, ADR-0017:
/// case + flow + row): the most specific one — flow and row, then flow, then
/// the whole case. None when the cycle has no such item.
// The importers (step 9) are its production caller.
#[cfg_attr(not(test), allow(dead_code))]
pub fn item_for(
    conn: &Connection,
    cycle_id: &str,
    test_case_id: &str,
    flow_id: Option<&str>,
    example_row_id: Option<&str>,
) -> Result<Option<String>, String> {
    let items = live_items(conn, cycle_id)?;
    let candidates = [(flow_id, example_row_id), (flow_id, None), (None, None)];
    for (f, r) in candidates {
        if let Some(i) = items.iter().find(|i| {
            i.test_case_id == test_case_id
                && i.flow_id.as_deref() == f
                && i.example_row_id.as_deref() == r
        }) {
            return Ok(Some(i.id.clone()));
        }
    }
    Ok(None)
}

// ---- execute and runs ----------------------------------------------------------------

/// «Ejecutar»: one run per configuration (every live, not archived one of the
/// cycle, or the subset asked for; a cycle without configurations gets one
/// run without). Each run copies the items and freezes the revision current
/// now (`runs::add_items`, ADR-0017 decision 3). A planned cycle becomes
/// active. All or nothing: the caller's transaction rolls back if one case
/// cannot be frozen. Returns the run ids.
pub(crate) fn execute(
    conn: &Connection,
    cycle_id: &str,
    input: &ExecuteInput,
) -> Result<Vec<String>, String> {
    let user = &input.user_id;
    let cycle = owned_cycle(conn, cycle_id, user)?;
    require_open(&cycle)?;
    let items = live_items(conn, cycle_id)?;
    if items.is_empty() {
        return Err("cycle-empty".into());
    }
    let live = project_configurations(conn, &cycle.project_id)?;
    let wanted: Vec<String> = match &input.configuration_ids {
        Some(ids) => {
            for id in ids {
                if !cycle.configuration_ids.contains(id) {
                    return Err(format!("configuration not in the cycle: {id}"));
                }
            }
            ids.clone()
        }
        None => cycle.configuration_ids.clone(),
    };
    let targets: Vec<Option<&Configuration>> = if cycle.configuration_ids.is_empty() {
        vec![None]
    } else {
        let t: Vec<Option<&Configuration>> = wanted
            .iter()
            .filter_map(|id| live.iter().find(|c| &c.id == id && !c.archived))
            .map(Some)
            .collect();
        if t.is_empty() {
            return Err("no-configuration: every configuration of the cycle is archived".into());
        }
        t
    };
    let base = text(&input.title).unwrap_or_else(|| cycle.title.clone());
    let mut run_ids = Vec::new();
    for target in targets {
        let mut title = format!("{} · {base}", cycle.cycle_key);
        if let Some(c) = target {
            title = format!("{title} · {}", c.name);
        }
        if title.encode_utf16().count() > runs::MAX_TITLE {
            title = title.chars().take(runs::MAX_TITLE / 2).collect();
        }
        let run_input = runs::RunInput {
            project_id: Some(cycle.project_id.clone()),
            title: Some(title),
            trigger: Some("manual".into()),
            test_plan_id: cycle.test_plan_id.clone(),
            cycle_id: Some(cycle.id.clone()),
            configuration_id: target.map(|c| c.id.clone()),
            environment: text(&input.environment).or(cycle.environment.clone()),
            build: text(&input.build).or(cycle.build.clone()),
            user_id: user.clone(),
            ..Default::default()
        };
        let run_id = runs::insert_run(conn, &run_input)?;
        let run_items: Vec<runs::RunItemInput> = items
            .iter()
            .map(|i| runs::RunItemInput {
                test_case_id: i.test_case_id.clone(),
                flow_id: i.flow_id.clone(),
                example_row_id: i.example_row_id.clone(),
                example_row: None,
                configuration_id: target.map(|c| c.id.clone()),
                assignee: i.assignee.clone(),
            })
            .collect();
        runs::add_items(conn, &run_id, user, &run_items)?;
        run_ids.push(run_id);
    }
    let summary = json!({ "runsCreated": run_ids.len() });
    if cycle.status == "planned" {
        let before = journal::snapshot(conn, CYCLE, cycle_id)?;
        let revision: i64 = conn
            .query_row(
                "UPDATE test_cycles SET status = 'active', revision = revision + 1,
                    updated_by = ?2, updated_at = datetime('now') WHERE id = ?1 RETURNING revision",
                params![cycle_id, user],
                |r| r.get(0),
            )
            .map_err(err)?;
        journal::record(
            conn,
            Change::new(
                CYCLE,
                cycle_id,
                Action::Update,
                Actor::user(user),
                "upsert",
                revision,
                user,
            )
            .before(before)
            .summary(summary),
        )?;
    } else {
        journal::record_event(
            conn,
            Actor::user(user),
            Action::Update,
            CYCLE,
            cycle_id,
            Map::new(),
            Some(summary),
        )?;
    }
    Ok(run_ids)
}

/// The cycle's live runs, newest first.
pub(crate) fn cycle_runs_of(
    conn: &Connection,
    cycle_id: &str,
    user: &str,
) -> Result<Vec<runs::Run>, String> {
    let Some(cycle) = get_cycle(conn, cycle_id, user)? else {
        return Ok(Vec::new());
    };
    Ok(runs::list_runs(conn, &cycle.project_id, user)?
        .into_iter()
        .filter(|r| r.cycle_id.as_deref() == Some(cycle_id))
        .collect())
}

// ---- progress --------------------------------------------------------------------

/// One result row as progress reads it.
struct ResultRow {
    id: String,
    run_id: String,
    test_key: String,
    configuration_label: Option<String>,
    attempt: i64,
    status: String,
    started_at: Option<String>,
    finished_at: Option<String>,
    shard_imported_at: Option<String>,
    hlc: String,
    configuration_id: Option<String>,
    case_id: Option<String>,
    flow_id: Option<String>,
    row_id: Option<String>,
}

fn cycle_progress_of(conn: &Connection, cycle: &TestCycle) -> Result<CycleProgress, String> {
    let items = live_items(conn, &cycle.id)?;
    let columns: Vec<Option<String>> = if cycle.configuration_ids.is_empty() {
        vec![None]
    } else {
        cycle.configuration_ids.iter().cloned().map(Some).collect()
    };
    let rows: Vec<ResultRow> = {
        let mut stmt = conn
            .prepare(
                "SELECT x.id, x.run_id, x.test_key, x.configuration_label, x.attempt, x.status,
                        x.started_at, x.finished_at, s.imported_at, x.hlc,
                        coalesce(r.configuration_id, x.configuration_id) AS configuration,
                        coalesce(x.test_case_id,
                                 (SELECT m.test_case_id FROM unlinked_mappings m
                                   WHERE m.project_id = x.project_id AND m.test_key = x.test_key
                                     AND m.deleted_at IS NULL
                                   ORDER BY m.updated_at DESC, m.rowid DESC LIMIT 1)) AS case_id,
                        x.flow_id, x.example_row_id
                   FROM results x
                   JOIN runs r ON r.id = x.run_id AND r.deleted_at IS NULL
                   LEFT JOIN run_shards s ON s.id = x.shard_id
                  WHERE r.cycle_id = ?1",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map(params![cycle.id], |r| {
                Ok(ResultRow {
                    id: r.get(0)?,
                    run_id: r.get(1)?,
                    test_key: r.get(2)?,
                    configuration_label: r.get(3)?,
                    attempt: r.get(4)?,
                    status: r.get(5)?,
                    started_at: r.get(6)?,
                    finished_at: r.get(7)?,
                    shard_imported_at: r.get(8)?,
                    hlc: r.get(9)?,
                    configuration_id: r.get(10)?,
                    case_id: r.get(11)?,
                    flow_id: r.get(12)?,
                    row_id: r.get(13)?,
                })
            })
            .map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)?
    };
    let attempts: Vec<progress::CycleAttempt> = rows
        .iter()
        .map(|r| progress::CycleAttempt {
            attempt: Attempt {
                id: &r.id,
                run_id: &r.run_id,
                test_key: &r.test_key,
                configuration_label: r.configuration_label.as_deref(),
                attempt: r.attempt,
                status: &r.status,
                started_at: r.started_at.as_deref(),
                finished_at: r.finished_at.as_deref(),
                shard_imported_at: r.shard_imported_at.as_deref(),
                hlc: &r.hlc,
                declared_flaky: false,
            },
            configuration_id: r.configuration_id.as_deref(),
            case_id: r.case_id.as_deref(),
            flow_id: r.flow_id.as_deref(),
            row_id: r.row_id.as_deref(),
        })
        .collect();
    let pitems: Vec<progress::Item> = items
        .iter()
        .map(|i| progress::Item {
            id: &i.id,
            case_id: &i.test_case_id,
            flow_id: i.flow_id.as_deref(),
            row_id: i.example_row_id.as_deref(),
        })
        .collect();
    let cols: Vec<Option<&str>> = columns.iter().map(|c| c.as_deref()).collect();
    let cells = progress::cells(&pitems, &cols, &attempts);
    let mut summary = ProgressSummary::default();
    let mut by: Vec<ConfigurationProgress> = columns
        .iter()
        .map(|c| ConfigurationProgress {
            configuration_id: c.clone(),
            summary: ProgressSummary::default(),
        })
        .collect();
    for cell in &cells {
        summary.count(cell.status);
        if let Some(b) = by
            .iter_mut()
            .find(|b| b.configuration_id.as_deref() == cell.configuration_id)
        {
            b.summary.count(cell.status);
        }
    }
    Ok(CycleProgress {
        configuration_ids: columns.clone(),
        cells: cells
            .into_iter()
            .map(|c| ProgressCell {
                item_id: c.item_id.to_string(),
                configuration_id: c.configuration_id.map(String::from),
                status: c.status.to_string(),
                result_id: c.result_id.map(String::from),
                run_id: c.run_id.map(String::from),
            })
            .collect(),
        by_configuration: by,
        summary,
    })
}

pub(crate) fn cycle_progress(
    conn: &Connection,
    cycle_id: &str,
    user: &str,
) -> Result<Option<CycleProgress>, String> {
    match get_cycle(conn, cycle_id, user)? {
        Some(cycle) => cycle_progress_of(conn, &cycle).map(Some),
        None => Ok(None),
    }
}

// ---- sync ----------------------------------------------------------------------

/// Owner of an entity of this module: its project's owner (ADR-0020 rule 1).
pub(crate) fn owner_sql(entity: &str) -> Option<&'static str> {
    Some(match entity {
        CONFIGURATION => {
            "SELECT p.owner_id FROM configurations x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1"
        }
        CYCLE => {
            "SELECT p.owner_id FROM test_cycles x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1"
        }
        CYCLE_ITEM => {
            "SELECT p.owner_id FROM test_cycle_items x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1"
        }
        _ => return None,
    })
}

pub(crate) fn table_for(entity: &str) -> Option<&'static str> {
    Some(match entity {
        CONFIGURATION => "configurations",
        CYCLE => "test_cycles",
        CYCLE_ITEM => "test_cycle_items",
        _ => return None,
    })
}

/// The lww payload of a configuration, cycle or item (camelCase), its
/// revision and deleted flag. None if the row is gone.
pub(crate) fn read_payload(
    conn: &Connection,
    entity: &str,
    id: &str,
) -> Result<Option<(Value, i64, bool)>, String> {
    let Some(table) = table_for(entity) else {
        return Ok(None);
    };
    conn.query_row(
        &format!("SELECT * FROM {table} WHERE id = ?1"),
        params![id],
        |r| {
            let s = |c: &str| r.get::<_, Option<String>>(c);
            let i = |c: &str| r.get::<_, Option<i64>>(c);
            let payload = match entity {
                CONFIGURATION => json!({
                    "id": s("id")?, "workspaceId": s("workspace_id")?, "projectId": s("project_id")?,
                    "name": s("name")?, "attributes": json_col(r, "attributes", json!({}))?,
                    "matchLabels": json_col(r, "match_labels", json!([]))?,
                    "position": i("position")?, "archivedAt": s("archived_at")?,
                    "createdAt": s("created_at")?, "updatedAt": s("updated_at")?,
                    "revision": i("revision")?,
                }),
                CYCLE => json!({
                    "id": s("id")?, "workspaceId": s("workspace_id")?, "projectId": s("project_id")?,
                    "cycleKey": s("cycle_key")?, "title": s("title")?,
                    "description": s("description")?, "testPlanId": s("test_plan_id")?,
                    "milestone": s("milestone")?, "sprint": s("sprint")?, "build": s("build")?,
                    "environment": s("environment")?,
                    "configurationIds": json_col(r, "configuration_ids", json!([]))?,
                    "startsOn": s("starts_on")?, "endsOn": s("ends_on")?, "status": s("status")?,
                    "data": json_col(r, "data", json!({}))?, "createdAt": s("created_at")?,
                    "updatedAt": s("updated_at")?, "revision": i("revision")?,
                }),
                _ => json!({
                    "id": s("id")?, "workspaceId": s("workspace_id")?, "projectId": s("project_id")?,
                    "cycleId": s("cycle_id")?, "testCaseId": s("test_case_id")?,
                    "flowId": s("flow_id")?, "exampleRowId": s("example_row_id")?,
                    "assignee": s("assignee")?, "position": i("position")?,
                    "createdAt": s("created_at")?, "updatedAt": s("updated_at")?,
                    "revision": i("revision")?,
                }),
            };
            Ok((
                payload,
                r.get::<_, i64>("revision")?,
                s("deleted_at")?.is_some(),
            ))
        },
    )
    .optional()
    .map_err(err)
}

fn ps<'a>(p: &'a Value, k: &str) -> Option<&'a str> {
    p.get(k).and_then(Value::as_str)
}

fn pi(p: &Value, k: &str) -> Option<i64> {
    p.get(k).and_then(Value::as_i64)
}

/// A JSON list of strings from a payload key (anything else: empty).
fn plist(p: &Value, k: &str) -> String {
    Value::Array(
        strings(p.get(k).unwrap_or(&Value::Null))
            .into_iter()
            .map(Value::String)
            .collect(),
    )
    .to_string()
}

fn pobj(p: &Value, k: &str) -> String {
    match p.get(k) {
        Some(Value::Object(m)) => Value::Object(m.clone()).to_string(),
        _ => "{}".into(),
    }
}

/// Overwrites the local row of a pulled lww document (`sync::write_doc`):
/// `created_by`/`updated_by` get the account it belongs to (FIX-06). Nothing
/// is validated: a status this build does not know reads as `planned`, and a
/// link to a cycle or configuration not here yet is kept as it is.
pub(crate) fn write_doc(
    conn: &Connection,
    workspace_id: &str,
    user: &str,
    entity: &str,
    id: &str,
    p: &Value,
    revision: i64,
) -> Result<(), String> {
    match entity {
        CONFIGURATION => conn.execute(
            "INSERT INTO configurations (id, workspace_id, project_id, name, attributes, match_labels,
                    position, archived_at, created_by, updated_by, created_at, updated_at, revision,
                    deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, datetime('now'), datetime('now'), ?10, NULL)
             ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, name=excluded.name,
                    attributes=excluded.attributes, match_labels=excluded.match_labels,
                    position=excluded.position, archived_at=excluded.archived_at,
                    updated_by=excluded.updated_by, updated_at=datetime('now'),
                    revision=excluded.revision, deleted_at=NULL",
            params![
                id,
                workspace_id,
                ps(p, "projectId").unwrap_or_default(),
                ps(p, "name").unwrap_or_default(),
                pobj(p, "attributes"),
                plist(p, "matchLabels"),
                pi(p, "position").unwrap_or(0),
                ps(p, "archivedAt"),
                user,
                revision,
            ],
        ),
        CYCLE => conn.execute(
            "INSERT INTO test_cycles (id, workspace_id, project_id, cycle_key, title, description,
                    test_plan_id, milestone, sprint, build, environment, configuration_ids, starts_on,
                    ends_on, status, data, created_by, updated_by, created_at, updated_at, revision,
                    deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17,
                    datetime('now'), datetime('now'), ?18, NULL)
             ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, cycle_key=excluded.cycle_key,
                    title=excluded.title, description=excluded.description,
                    test_plan_id=excluded.test_plan_id, milestone=excluded.milestone,
                    sprint=excluded.sprint, build=excluded.build, environment=excluded.environment,
                    configuration_ids=excluded.configuration_ids, starts_on=excluded.starts_on,
                    ends_on=excluded.ends_on, status=excluded.status, data=excluded.data,
                    updated_by=excluded.updated_by, updated_at=datetime('now'),
                    revision=excluded.revision, deleted_at=NULL",
            params![
                id,
                workspace_id,
                ps(p, "projectId").unwrap_or_default(),
                ps(p, "cycleKey").unwrap_or_default(),
                ps(p, "title").unwrap_or_default(),
                ps(p, "description").unwrap_or_default(),
                ps(p, "testPlanId"),
                ps(p, "milestone"),
                ps(p, "sprint"),
                ps(p, "build"),
                ps(p, "environment"),
                plist(p, "configurationIds"),
                ps(p, "startsOn"),
                ps(p, "endsOn"),
                ps(p, "status")
                    .filter(|s| STATUSES.contains(s))
                    .unwrap_or("planned"),
                pobj(p, "data"),
                user,
                revision,
            ],
        ),
        CYCLE_ITEM => conn.execute(
            "INSERT INTO test_cycle_items (id, workspace_id, cycle_id, project_id, test_case_id, flow_id,
                    example_row_id, assignee, position, created_by, updated_by, created_at, updated_at,
                    revision, deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, datetime('now'), datetime('now'),
                    ?11, NULL)
             ON CONFLICT(id) DO UPDATE SET cycle_id=excluded.cycle_id, project_id=excluded.project_id,
                    test_case_id=excluded.test_case_id, flow_id=excluded.flow_id,
                    example_row_id=excluded.example_row_id, assignee=excluded.assignee,
                    position=excluded.position, updated_by=excluded.updated_by,
                    updated_at=datetime('now'), revision=excluded.revision, deleted_at=NULL",
            params![
                id,
                workspace_id,
                ps(p, "cycleId").unwrap_or_default(),
                ps(p, "projectId").unwrap_or_default(),
                ps(p, "testCaseId").unwrap_or_default(),
                ps(p, "flowId"),
                ps(p, "exampleRowId"),
                ps(p, "assignee"),
                pi(p, "position").unwrap_or(0),
                user,
                revision,
            ],
        ),
        _ => return Ok(()),
    }
    .map_err(err)?;
    Ok(())
}

/// Pending changes of this module held back, over every account of this
/// device, because its server has not listed `cycles` yet (diagnostics).
pub(crate) fn held_back(conn: &Connection) -> Result<i64, String> {
    let users: Vec<String> = {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT DISTINCT user_id FROM oplog
                  WHERE entity IN ({}) AND synced_at IS NULL AND user_id <> ''",
                entities_sql_list()
            ))
            .map_err(err)?;
        let rows = stmt.query_map([], |r| r.get(0)).map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)?
    };
    let mut held = 0;
    for user in users {
        if crate::sync::server_takes_cycles(conn, &user)? {
            continue;
        }
        held += conn
            .query_row(
                &format!(
                    "SELECT count(DISTINCT entity || ':' || entity_id) FROM oplog
                      WHERE entity IN ({}) AND synced_at IS NULL AND user_id = ?1",
                    entities_sql_list()
                ),
                params![user],
                |r| r.get::<_, i64>(0),
            )
            .map_err(err)?;
    }
    Ok(held)
}

// ---- commands ------------------------------------------------------------------

#[tauri::command]
pub fn configuration_list(
    db: State<Db>,
    project_id: String,
    user_id: String,
    include_archived: Option<bool>,
) -> Result<Vec<Configuration>, String> {
    db.with_conn(|conn| {
        list_configurations(
            conn,
            &project_id,
            &user_id,
            include_archived.unwrap_or(false),
        )
    })
}

#[tauri::command]
pub fn configuration_create(
    db: State<Db>,
    input: ConfigurationInput,
) -> Result<Option<Configuration>, String> {
    let id = db.with_tx(|conn| create_configuration(conn, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_configuration(conn, &id))
}

#[tauri::command]
pub fn configuration_update(
    db: State<Db>,
    id: String,
    input: ConfigurationInput,
) -> Result<Option<Configuration>, String> {
    db.with_tx(|conn| update_configuration(conn, &id, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_configuration(conn, &id))
}

#[tauri::command]
pub fn configuration_archive(
    db: State<Db>,
    id: String,
    archived: bool,
    user_id: String,
) -> Result<Option<Configuration>, String> {
    db.with_tx(|conn| set_configuration_archived(conn, &id, archived, &user_id))?;
    db.persist()?;
    db.with_conn(|conn| get_configuration(conn, &id))
}

#[tauri::command]
pub fn configuration_reorder(
    db: State<Db>,
    project_id: String,
    ids: Vec<String>,
    user_id: String,
) -> Result<Vec<Configuration>, String> {
    db.with_tx(|conn| reorder_configurations(conn, &project_id, &ids, &user_id))?;
    db.persist()?;
    db.with_conn(|conn| list_configurations(conn, &project_id, &user_id, true))
}

#[tauri::command]
pub fn cycle_list(
    db: State<Db>,
    project_id: String,
    user_id: String,
) -> Result<Vec<CycleSummary>, String> {
    db.with_conn(|conn| list_cycles(conn, &project_id, &user_id))
}

#[tauri::command]
pub fn cycle_get(db: State<Db>, id: String, user_id: String) -> Result<Option<TestCycle>, String> {
    db.with_conn(|conn| get_cycle(conn, &id, &user_id))
}

#[tauri::command]
pub fn cycle_create(db: State<Db>, input: TestCycleInput) -> Result<Option<TestCycle>, String> {
    let id = db.with_tx(|conn| insert_cycle(conn, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_cycle(conn, &id, &input.user_id))
}

#[tauri::command]
pub fn cycle_update(
    db: State<Db>,
    id: String,
    input: TestCycleInput,
) -> Result<Option<TestCycle>, String> {
    db.with_tx(|conn| update_cycle(conn, &id, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_cycle(conn, &id, &input.user_id))
}

#[tauri::command]
pub fn cycle_clone(
    db: State<Db>,
    id: String,
    title: Option<String>,
    user_id: String,
) -> Result<Option<TestCycle>, String> {
    let new_id = db.with_tx(|conn| clone_cycle(conn, &id, title.as_deref(), &user_id))?;
    db.persist()?;
    db.with_conn(|conn| get_cycle(conn, &new_id, &user_id))
}

#[tauri::command]
pub fn cycle_delete(db: State<Db>, id: String, user_id: String) -> Result<(), String> {
    db.with_tx(|conn| delete_cycle(conn, &id, &user_id))?;
    db.persist()
}

#[tauri::command]
pub fn cycle_items_list(
    db: State<Db>,
    cycle_id: String,
    user_id: String,
) -> Result<Vec<CycleItem>, String> {
    db.with_conn(|conn| list_items(conn, &cycle_id, &user_id))
}

#[tauri::command]
pub fn cycle_items_add(
    db: State<Db>,
    cycle_id: String,
    user_id: String,
    items: Vec<CycleItemInput>,
) -> Result<AddOutcome, String> {
    let out = db.with_tx(|conn| add_items(conn, &cycle_id, &user_id, &items))?;
    db.persist()?;
    Ok(out)
}

#[tauri::command]
pub fn cycle_items_add_by_filter(
    db: State<Db>,
    cycle_id: String,
    user_id: String,
    filter: CycleFilter,
    assignee: Option<String>,
) -> Result<AddOutcome, String> {
    let out =
        db.with_tx(|conn| add_by_filter(conn, &cycle_id, &user_id, &filter, assignee.as_deref()))?;
    db.persist()?;
    Ok(out)
}

/// How many cases of the project match a filter now (the dialog's preview).
#[tauri::command]
pub fn cycle_filter_preview(
    db: State<Db>,
    project_id: String,
    user_id: String,
    filter: CycleFilter,
) -> Result<i64, String> {
    db.with_conn(|conn| {
        if !project::owns(conn, &project_id, &user_id)? {
            return Ok(0);
        }
        Ok(matching_cases(conn, &project_id, &filter)?.len() as i64)
    })
}

#[tauri::command]
pub fn cycle_item_update(db: State<Db>, id: String, input: CycleItemUpdate) -> Result<(), String> {
    db.with_tx(|conn| update_item(conn, &id, &input))?;
    db.persist()
}

#[tauri::command]
pub fn cycle_items_remove(
    db: State<Db>,
    cycle_id: String,
    ids: Vec<String>,
    user_id: String,
) -> Result<usize, String> {
    let n = db.with_tx(|conn| remove_items(conn, &cycle_id, &ids, &user_id))?;
    db.persist()?;
    Ok(n)
}

#[tauri::command]
pub fn cycle_items_reorder(
    db: State<Db>,
    cycle_id: String,
    ids: Vec<String>,
    user_id: String,
) -> Result<Vec<CycleItem>, String> {
    db.with_tx(|conn| reorder_items(conn, &cycle_id, &ids, &user_id))?;
    db.persist()?;
    db.with_conn(|conn| list_items(conn, &cycle_id, &user_id))
}

#[tauri::command]
pub fn cycle_execute(
    db: State<Db>,
    cycle_id: String,
    input: ExecuteInput,
) -> Result<Vec<runs::Run>, String> {
    let ids = db.with_tx(|conn| execute(conn, &cycle_id, &input))?;
    db.persist()?;
    db.with_conn(|conn| {
        let mut out = Vec::new();
        for id in &ids {
            if let Some(r) = runs::get_run(conn, id, &input.user_id)? {
                out.push(r);
            }
        }
        Ok(out)
    })
}

#[tauri::command]
pub fn cycle_runs(
    db: State<Db>,
    cycle_id: String,
    user_id: String,
) -> Result<Vec<runs::Run>, String> {
    db.with_conn(|conn| cycle_runs_of(conn, &cycle_id, &user_id))
}

#[tauri::command]
pub fn cycle_progress_get(
    db: State<Db>,
    cycle_id: String,
    user_id: String,
) -> Result<Option<CycleProgress>, String> {
    db.with_conn(|conn| cycle_progress(conn, &cycle_id, &user_id))
}
