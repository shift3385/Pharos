//! Manual step-by-step execution (EJE-02; ADR-0013, ADR-0014; design 0.2.0 §5
//! step 7). What a person drives by hand on the run screen:
//!
//! - **Targets.** A run item expands to the things that get one attempt each:
//!   `(flow, Outline row)`. An item with a flow and a row is one target; an
//!   item with a flow and no row is one target per row of that flow (or one,
//!   without rows); a whole-case item is the main flow (when it has steps or
//!   there are no flows) plus each flow, each expanded the same way. An
//!   attempt narrows the item to its target (`ResultInput.flowId` /
//!   `exampleRowId`), so its `test_key`, flow and row are the target's and
//!   cycle progress counts it against that exact flow and row.
//! - **Drafts** (`execution_drafts`, local, never synced, no audit): one row
//!   per run item, `{"targets": {<targetKey>: <the UI's state>},
//!   "attachments": {<attachmentId>: {"target", "stepId"}}}`. The UI owns
//!   what is inside a target; this module owns `attachments`.
//! - **Evidence before the attempt exists** is an ordinary `attachments` row
//!   with `owner_entity = 'execution_draft'` and `owner_id = run_item_id`: the
//!   bytes go encrypted to `evidence/` at once and the row keeps the blob
//!   alive. Recording the attempt (`execution_record`) re-points those rows
//!   to the new `result` / `step_result` in the same transaction, with one
//!   `link` event each. Attachments are not synced yet (SYNC-04b).
//! - **The revision** shown and recorded is always the run item's frozen one,
//!   so editing the case afterwards changes nothing here (exit criterion of
//!   0.2.0).

use std::collections::HashMap;

use base64::Engine;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Map, Value};
use tauri::State;
#[cfg(test)]
use ts_rs::TS;
use uuid::Uuid;

use super::{
    derive, err, get_run, ids, list_items, list_results, owned_run, record_result, require_open,
    text, ResultInput, ResultView, RevisionShape, Run, RunItem, RESULT,
};
use crate::db::{ensure_workspace, in_tx, Db};
use crate::downloads::{Downloads, SaveResult};
use crate::evidence;
use crate::journal::{self, Action, Actor};

/// `owner_entity` of an attachment taken while the attempt is a draft.
pub const DRAFT_OWNER: &str = "execution_draft";
/// Kinds a manual attachment may have (ADR-0014 retention: both are kept).
const KINDS: [&str; 2] = ["evidence", "screenshot"];
/// A draft larger than this is refused: the UI keeps text, never bytes.
const MAX_DRAFT_BYTES: usize = 1024 * 1024;
/// Images up to this size get an inline preview; larger ones show an icon.
const MAX_PREVIEW_BYTES: i64 = 5 * 1024 * 1024;
/// File names are clipped to this many characters.
const MAX_NAME: usize = 255;

// ---- types -------------------------------------------------------------------

/// One thing a run item executes: a flow (None = the main one) and an
/// Outline row (None = no rows).
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionTarget {
    /// `<flowId|->/<rowId|->`: the key of its draft and of its attempts.
    pub(crate) key: String,
    pub(crate) flow_id: Option<String>,
    pub(crate) flow_name: Option<String>,
    pub(crate) example_row_id: Option<String>,
    /// 0-based index of the row in its Examples table.
    pub(crate) example_row: Option<i64>,
    /// The row's values by header (or as a list without headers).
    #[cfg_attr(test, ts(type = "Record<string, string> | string[] | null"))]
    pub(crate) values: Option<Value>,
    pub(crate) test_key: String,
}

/// An attachment of the manual execution: a draft's, a result's or a step
/// result's.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionAttachment {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) mime: Option<String>,
    pub(crate) size: i64,
    pub(crate) kind: String,
    /// Its content was removed by the retention (never, for manual ones).
    pub(crate) purged: bool,
    pub(crate) owner_entity: String,
    pub(crate) owner_id: String,
    /// For a draft's: the target and step it was taken on.
    pub(crate) target_key: Option<String>,
    pub(crate) step_id: Option<String>,
}

/// The local work in progress of a run item.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionDraft {
    /// By target key: what the UI saved.
    #[cfg_attr(test, ts(type = "Record<string, unknown>"))]
    pub(crate) targets: Value,
    pub(crate) attachments: Vec<ExecutionAttachment>,
    pub(crate) updated_at: String,
}

/// Everything the executor needs for one run item.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RunItemDetail {
    pub(crate) item: RunItem,
    pub(crate) run_status: String,
    pub(crate) case_key: Option<String>,
    pub(crate) case_title: String,
    pub(crate) case_deleted: bool,
    /// The revision the item froze, and the case's current one.
    pub(crate) frozen_revision: Option<i64>,
    pub(crate) current_revision: Option<i64>,
    /// The case changed after the item froze it.
    pub(crate) case_changed: bool,
    /// The frozen revision's data (steps, flows, Examples).
    #[cfg_attr(test, ts(type = "Record<string, unknown>"))]
    pub(crate) revision: Value,
    pub(crate) targets: Vec<ExecutionTarget>,
    /// Every attempt of this item, oldest first, with the derived final.
    pub(crate) results: Vec<ResultView>,
    /// Attachments of those attempts and of their steps.
    pub(crate) attachments: Vec<ExecutionAttachment>,
    pub(crate) draft: Option<ExecutionDraft>,
}

/// One run item as the run screen lists it.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RunItemRow {
    pub(crate) item: RunItem,
    pub(crate) case_key: Option<String>,
    pub(crate) case_title: String,
    pub(crate) case_deleted: bool,
    pub(crate) flow_name: Option<String>,
    /// 0-based row index, when the item is one row.
    pub(crate) row_index: Option<i64>,
    pub(crate) targets: i64,
    /// Targets with a final attempt.
    pub(crate) done: i64,
    /// Worst final status of its targets, or `not_run`.
    pub(crate) status: String,
    pub(crate) attempts: i64,
    pub(crate) has_draft: bool,
}

/// Targets of a run by their final status.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TargetCounts {
    pub(crate) passed: i64,
    pub(crate) failed: i64,
    pub(crate) blocked: i64,
    pub(crate) skipped: i64,
    pub(crate) other: i64,
    pub(crate) not_run: i64,
    pub(crate) total: i64,
}

/// The run screen in one call.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RunOverview {
    pub(crate) run: Run,
    pub(crate) cycle_key: Option<String>,
    pub(crate) cycle_title: Option<String>,
    pub(crate) configuration_name: Option<String>,
    pub(crate) items: Vec<RunItemRow>,
    pub(crate) counts: TargetCounts,
}

// ---- revision and targets ------------------------------------------------------

/// The data of a stored case revision (Null if it is not here).
pub(crate) fn revision_data(conn: &Connection, revision_id: &str) -> Result<Value, String> {
    let data: Option<String> = conn
        .query_row(
            "SELECT data FROM test_case_revisions WHERE id = ?1",
            params![revision_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?;
    Ok(data
        .and_then(|d| serde_json::from_str::<Value>(&d).ok())
        .unwrap_or(Value::Null))
}

/// The object holding a flow's steps and Examples: `data` itself for the
/// main flow.
fn container<'a>(data: &'a Value, flow_id: Option<&str>) -> Option<&'a Value> {
    match flow_id {
        None => Some(data),
        Some(id) => data
            .get("flows")
            .and_then(Value::as_array)?
            .iter()
            .find(|f| f.get("id").and_then(Value::as_str) == Some(id)),
    }
}

fn rows_of(container: &Value) -> Vec<&Value> {
    container
        .get("examples")
        .and_then(|e| e.get("rows"))
        .and_then(Value::as_array)
        .map(|rows| rows.iter().collect())
        .unwrap_or_default()
}

/// A row's values by header, or as the plain list when the headers do not
/// match them.
fn row_values(container: &Value, row: &Value) -> Value {
    let values: Vec<Value> = row
        .get("values")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let headers: Vec<&str> = container
        .get("examples")
        .and_then(|e| e.get("headers"))
        .and_then(Value::as_array)
        .map(|h| h.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    if !headers.is_empty() && headers.len() == values.len() {
        let mut m = Map::new();
        for (h, v) in headers.iter().zip(values) {
            m.insert((*h).to_string(), v);
        }
        Value::Object(m)
    } else {
        Value::Array(values)
    }
}

/// The 0-based index and the values of an Outline row of a flow.
pub(crate) fn row_of(data: &Value, flow_id: Option<&str>, row_id: &str) -> Option<(i64, Value)> {
    let c = container(data, flow_id)?;
    rows_of(c)
        .iter()
        .position(|r| r.get("id").and_then(Value::as_str) == Some(row_id))
        .map(|i| (i as i64, row_values(c, rows_of(c)[i])))
}

fn has_steps(c: &Value) -> bool {
    ["preconditions", "steps"].iter().any(|k| {
        c.get(*k)
            .and_then(Value::as_array)
            .is_some_and(|a| !a.is_empty())
    })
}

/// The key of a target, as drafts and the UI name it.
pub(crate) fn target_key(flow_id: Option<&str>, row_id: Option<&str>) -> String {
    format!("{}/{}", flow_id.unwrap_or("-"), row_id.unwrap_or("-"))
}

/// What a run item executes, one attempt each (see the module docs).
pub(crate) fn targets_of(
    case_id: &str,
    data: &Value,
    item_flow: Option<&str>,
    item_row: Option<&str>,
) -> Vec<ExecutionTarget> {
    let flows: Vec<&Value> = data
        .get("flows")
        .and_then(Value::as_array)
        .map(|f| f.iter().collect())
        .unwrap_or_default();
    let mut chosen: Vec<(Option<String>, Option<String>, &Value)> = Vec::new();
    match item_flow {
        Some(id) => {
            if let Some(c) = container(data, Some(id)) {
                let name = c.get("name").and_then(Value::as_str).map(String::from);
                chosen.push((Some(id.to_string()), name, c));
            }
        }
        None => {
            if flows.is_empty() || has_steps(data) || item_row.is_some() {
                chosen.push((None, None, data));
            }
            if item_row.is_none() {
                for f in flows {
                    if let Some(id) = f.get("id").and_then(Value::as_str) {
                        let name = f.get("name").and_then(Value::as_str).map(String::from);
                        chosen.push((Some(id.to_string()), name, f));
                    }
                }
            }
        }
    }
    let mut out = Vec::new();
    for (flow_id, flow_name, c) in chosen {
        let rows = rows_of(c);
        let target = |row: Option<(i64, &Value)>| {
            let row_id = row.and_then(|(_, r)| r.get("id").and_then(Value::as_str));
            ExecutionTarget {
                key: target_key(flow_id.as_deref(), row_id),
                flow_id: flow_id.clone(),
                flow_name: flow_name.clone(),
                example_row_id: row_id.map(String::from),
                example_row: row.map(|(i, _)| i),
                values: row.map(|(_, r)| row_values(c, r)),
                test_key: ids::manual_test_key(case_id, flow_id.as_deref(), row_id),
            }
        };
        match item_row {
            Some(want) => {
                if let Some(i) = rows
                    .iter()
                    .position(|r| r.get("id").and_then(Value::as_str) == Some(want))
                {
                    out.push(target(Some((i as i64, rows[i]))));
                }
            }
            None if rows.is_empty() => out.push(target(None)),
            None => {
                for (i, r) in rows.iter().enumerate() {
                    out.push(target(Some((i as i64, r))));
                }
            }
        }
    }
    out
}

// ---- reads ---------------------------------------------------------------------

/// A live run item of a run the user owns: (run id, run status, project).
fn owned_item(
    conn: &Connection,
    run_item_id: &str,
    user: &str,
) -> Result<(String, String, String), String> {
    let run_id: String = conn
        .query_row(
            "SELECT run_id FROM run_items WHERE id = ?1 AND deleted_at IS NULL",
            params![run_item_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?
        .ok_or("run item not found")?;
    let (project, status) = owned_run(conn, &run_id, user)?;
    Ok((run_id, status, project))
}

struct CaseFacts {
    key: Option<String>,
    title: String,
    deleted: bool,
    current_revision: Option<i64>,
}

fn case_facts(conn: &Connection, case_id: &str, frozen: &str) -> Result<CaseFacts, String> {
    let current: Option<(Option<String>, String, bool, i64)> = conn
        .query_row(
            "SELECT scenario_id, title, deleted_at IS NOT NULL, revision FROM test_cases
              WHERE id = ?1",
            params![case_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .map_err(err)?;
    if let Some((key, title, deleted, revision)) = current {
        return Ok(CaseFacts {
            key,
            title,
            deleted,
            current_revision: Some(revision),
        });
    }
    // A case purged here: what the frozen revision says.
    let (key, title): (Option<String>, String) = conn
        .query_row(
            "SELECT scenario_id, title FROM test_case_revisions WHERE id = ?1",
            params![frozen],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(err)?
        .unwrap_or((None, String::new()));
    Ok(CaseFacts {
        key,
        title,
        deleted: true,
        current_revision: None,
    })
}

fn frozen_number(conn: &Connection, revision_id: &str) -> Result<Option<i64>, String> {
    conn.query_row(
        "SELECT revision FROM test_case_revisions WHERE id = ?1",
        params![revision_id],
        |r| r.get(0),
    )
    .optional()
    .map_err(err)
}

fn map_attachment(r: &rusqlite::Row) -> rusqlite::Result<ExecutionAttachment> {
    Ok(ExecutionAttachment {
        id: r.get(0)?,
        name: r.get(1)?,
        mime: r.get(2)?,
        size: r.get(3)?,
        kind: r.get(4)?,
        purged: r.get(5)?,
        owner_entity: r.get(6)?,
        owner_id: r.get(7)?,
        target_key: None,
        step_id: None,
    })
}

const ATTACHMENT_COLUMNS: &str =
    "a.id, a.name, a.mime, a.size, a.kind, a.blob_purged_at IS NOT NULL, a.owner_entity, a.owner_id";

/// Attachments of the recorded attempts of an item and of their steps.
fn result_attachments(
    conn: &Connection,
    run_item_id: &str,
) -> Result<Vec<ExecutionAttachment>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {ATTACHMENT_COLUMNS} FROM attachments a
              WHERE a.deleted_at IS NULL AND (
                    (a.owner_entity = 'result'
                     AND a.owner_id IN (SELECT id FROM results WHERE run_item_id = ?1))
                 OR (a.owner_entity = 'step_result'
                     AND a.owner_id IN (SELECT s.id FROM step_results s
                                          JOIN results x ON x.id = s.result_id
                                         WHERE x.run_item_id = ?1)))
              ORDER BY a.created_at, a.rowid"
        ))
        .map_err(err)?;
    let rows = stmt
        .query_map(params![run_item_id], map_attachment)
        .map_err(err)?;
    rows.collect::<rusqlite::Result<_>>().map_err(err)
}

/// The draft state as stored, or an empty one.
fn stored_state(conn: &Connection, run_item_id: &str) -> Result<Option<(Value, String)>, String> {
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT state, updated_at FROM execution_drafts WHERE run_item_id = ?1",
            params![run_item_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(err)?;
    Ok(row.map(|(s, at)| {
        let mut v = serde_json::from_str::<Value>(&s).unwrap_or_else(|_| json!({}));
        if !v.is_object() {
            v = json!({});
        }
        for k in ["targets", "attachments"] {
            if !v.get(k).is_some_and(Value::is_object) {
                v[k] = json!({});
            }
        }
        (v, at)
    }))
}

fn write_state(conn: &Connection, run_item_id: &str, state: &Value) -> Result<(), String> {
    let empty = |k: &str| state[k].as_object().map_or(true, Map::is_empty);
    if empty("targets") && empty("attachments") {
        conn.execute(
            "DELETE FROM execution_drafts WHERE run_item_id = ?1",
            params![run_item_id],
        )
        .map_err(err)?;
        return Ok(());
    }
    let text = state.to_string();
    if text.len() > MAX_DRAFT_BYTES {
        return Err("draft-too-large: at most 1 MB of text per run item".into());
    }
    conn.execute(
        "INSERT INTO execution_drafts (run_item_id, state, updated_at)
         VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (run_item_id) DO UPDATE SET state = excluded.state,
                updated_at = excluded.updated_at",
        params![run_item_id, text],
    )
    .map_err(err)
    .map(drop)
}

/// The draft of an item, with its attachments.
fn read_draft(conn: &Connection, run_item_id: &str) -> Result<Option<ExecutionDraft>, String> {
    let Some((state, updated_at)) = stored_state(conn, run_item_id)? else {
        return Ok(None);
    };
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {ATTACHMENT_COLUMNS} FROM attachments a
              WHERE a.owner_entity = '{DRAFT_OWNER}' AND a.owner_id = ?1 AND a.deleted_at IS NULL
              ORDER BY a.created_at, a.rowid"
        ))
        .map_err(err)?;
    let rows = stmt
        .query_map(params![run_item_id], map_attachment)
        .map_err(err)?;
    let mut attachments: Vec<ExecutionAttachment> =
        rows.collect::<rusqlite::Result<_>>().map_err(err)?;
    for a in &mut attachments {
        let at = &state["attachments"][&a.id];
        a.target_key = at.get("target").and_then(Value::as_str).map(String::from);
        a.step_id = at.get("stepId").and_then(Value::as_str).map(String::from);
    }
    Ok(Some(ExecutionDraft {
        targets: state["targets"].clone(),
        attachments,
        updated_at,
    }))
}

/// The executor's view of one run item.
pub(crate) fn item_detail(
    conn: &Connection,
    run_item_id: &str,
    user: &str,
) -> Result<Option<RunItemDetail>, String> {
    let Ok((run_id, run_status, _)) = owned_item(conn, run_item_id, user) else {
        return Ok(None);
    };
    let Some(item) = list_items(conn, &run_id, user)?
        .into_iter()
        .find(|i| i.id == run_item_id)
    else {
        return Ok(None);
    };
    let revision = revision_data(conn, &item.test_case_revision_id)?;
    let facts = case_facts(conn, &item.test_case_id, &item.test_case_revision_id)?;
    let frozen_revision = frozen_number(conn, &item.test_case_revision_id)?;
    let case_changed = match crate::revisions::current_id(conn, &item.test_case_id)? {
        Some((current, _)) => current != item.test_case_revision_id,
        None => false,
    };
    let targets = targets_of(
        &item.test_case_id,
        &revision,
        item.flow_id.as_deref(),
        item.example_row_id.as_deref(),
    );
    let results: Vec<ResultView> = list_results(conn, &run_id, user)?
        .into_iter()
        .filter(|r| r.effective_run_item_id.as_deref() == Some(run_item_id))
        .collect();
    Ok(Some(RunItemDetail {
        attachments: result_attachments(conn, run_item_id)?,
        draft: read_draft(conn, run_item_id)?,
        item,
        run_status,
        case_key: facts.key,
        case_title: facts.title,
        case_deleted: facts.deleted,
        frozen_revision,
        current_revision: facts.current_revision,
        case_changed,
        revision,
        targets,
        results,
    }))
}

/// The run screen: header, cycle and configuration names, items with their
/// progress, and the counts over all targets.
pub(crate) fn overview(
    conn: &Connection,
    run_id: &str,
    user: &str,
) -> Result<Option<RunOverview>, String> {
    let Some(run) = get_run(conn, run_id, user)? else {
        return Ok(None);
    };
    let cycle: Option<(String, String)> = match &run.cycle_id {
        Some(id) => conn
            .query_row(
                "SELECT cycle_key, title FROM test_cycles WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(err)?,
        None => None,
    };
    let configuration_name: Option<String> = match &run.configuration_id {
        Some(id) => conn
            .query_row(
                "SELECT name FROM configurations WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?,
        None => None,
    };
    let results = list_results(conn, run_id, user)?;
    // Final statuses by (item, target key); attempts by item.
    let mut finals: HashMap<(String, String), Vec<&str>> = HashMap::new();
    let mut attempts: HashMap<&str, i64> = HashMap::new();
    for r in &results {
        let Some(item) = r.effective_run_item_id.as_deref() else {
            continue;
        };
        *attempts.entry(item).or_default() += 1;
        if r.is_final {
            let key = target_key(
                r.effective_flow_id.as_deref(),
                r.effective_example_row_id.as_deref(),
            );
            finals
                .entry((item.to_string(), key))
                .or_default()
                .push(r.status.as_str());
        }
    }
    let drafts: std::collections::HashSet<String> = {
        let mut stmt = conn
            .prepare(
                "SELECT d.run_item_id FROM execution_drafts d
                   JOIN run_items i ON i.id = d.run_item_id WHERE i.run_id = ?1",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map(params![run_id], |r| r.get::<_, String>(0))
            .map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)?
    };
    let mut counts = TargetCounts::default();
    let mut items = Vec::new();
    for item in list_items(conn, run_id, user)? {
        let data = revision_data(conn, &item.test_case_revision_id)?;
        let facts = case_facts(conn, &item.test_case_id, &item.test_case_revision_id)?;
        let targets = targets_of(
            &item.test_case_id,
            &data,
            item.flow_id.as_deref(),
            item.example_row_id.as_deref(),
        );
        let mut statuses: Vec<&str> = Vec::new();
        for t in &targets {
            let found = finals.get(&(item.id.clone(), t.key.clone()));
            let mut list: Vec<&str> = found.cloned().unwrap_or_default();
            list.sort_unstable();
            match derive::worst_status(list) {
                Some(s) => {
                    statuses.push(s);
                    match s {
                        "passed" => counts.passed += 1,
                        "failed" => counts.failed += 1,
                        "blocked" => counts.blocked += 1,
                        "skipped" => counts.skipped += 1,
                        _ => counts.other += 1,
                    }
                }
                None => counts.not_run += 1,
            }
            counts.total += 1;
        }
        let done = statuses.len() as i64;
        statuses.sort_unstable();
        let flow_name = item.flow_id.as_deref().and_then(|f| {
            container(&data, Some(f))
                .and_then(|c| c.get("name"))
                .and_then(Value::as_str)
                .map(String::from)
        });
        let row_index = item
            .example_row_id
            .as_deref()
            .and_then(|r| row_of(&data, item.flow_id.as_deref(), r))
            .map(|(i, _)| i);
        items.push(RunItemRow {
            case_key: facts.key,
            case_title: facts.title,
            case_deleted: facts.deleted,
            flow_name,
            row_index,
            targets: targets.len() as i64,
            done,
            status: derive::worst_status(statuses)
                .unwrap_or(crate::cycles::progress::NOT_RUN)
                .to_string(),
            attempts: attempts.get(item.id.as_str()).copied().unwrap_or(0),
            has_draft: drafts.contains(&item.id),
            item,
        });
    }
    Ok(Some(RunOverview {
        cycle_key: cycle.as_ref().map(|c| c.0.clone()),
        cycle_title: cycle.map(|c| c.1),
        configuration_name,
        run,
        items,
        counts,
    }))
}

// ---- drafts --------------------------------------------------------------------

/// The target of an item named by `key`, refused if the item has no such one.
fn target_of(
    conn: &Connection,
    run_item_id: &str,
    key: &str,
) -> Result<(ExecutionTarget, String), String> {
    let (case_id, revision_id, flow, row): (String, String, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT test_case_id, test_case_revision_id, flow_id, example_row_id
               FROM run_items WHERE id = ?1",
            params![run_item_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .map_err(err)?;
    let data = revision_data(conn, &revision_id)?;
    targets_of(&case_id, &data, flow.as_deref(), row.as_deref())
        .into_iter()
        .find(|t| t.key == key)
        .map(|t| (t, revision_id))
        .ok_or_else(|| format!("target-not-in-item: {key}"))
}

/// Drops the draft attachments of `target` (all of them with None): soft
/// delete, and their content is released if nothing else uses it.
fn drop_attachments(
    conn: &Connection,
    run_item_id: &str,
    state: &mut Value,
    target: Option<&str>,
    user: &str,
) -> Result<(), String> {
    let ids: Vec<String> = state["attachments"]
        .as_object()
        .map(|m| {
            m.iter()
                .filter(|(_, v)| {
                    target.map_or(true, |t| v.get("target").and_then(Value::as_str) == Some(t))
                })
                .map(|(k, _)| k.clone())
                .collect()
        })
        .unwrap_or_default();
    for id in ids {
        let sha: Option<String> = conn
            .query_row(
                "SELECT sha256 FROM attachments
                  WHERE id = ?1 AND owner_entity = ?2 AND owner_id = ?3 AND deleted_at IS NULL",
                params![id, DRAFT_OWNER, run_item_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?;
        if let Some(sha) = sha {
            conn.execute(
                "UPDATE attachments SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_by = ?2,
                        revision = revision + 1 WHERE id = ?1",
                params![id, user],
            )
            .map_err(err)?;
            evidence::release(conn, &sha)?;
        }
        if let Some(m) = state["attachments"].as_object_mut() {
            m.remove(&id);
        }
    }
    Ok(())
}

/// Saves (or, with None, discards) the draft of one target of an item. Local
/// only: no oplog row, no audit event (ADR-0013: the draft is not a fact).
pub(crate) fn save_draft(
    conn: &Connection,
    run_item_id: &str,
    key: &str,
    target_state: Option<&Value>,
    user: &str,
) -> Result<(), String> {
    let (_, status, _) = owned_item(conn, run_item_id, user)?;
    let mut state = stored_state(conn, run_item_id)?
        .map(|(s, _)| s)
        .unwrap_or_else(|| json!({"targets": {}, "attachments": {}}));
    match target_state {
        Some(v) => {
            require_open(&status)?;
            target_of(conn, run_item_id, key)?;
            state["targets"][key] = v.clone();
        }
        None => {
            if let Some(m) = state["targets"].as_object_mut() {
                m.remove(key);
            }
            drop_attachments(conn, run_item_id, &mut state, Some(key), user)?;
        }
    }
    write_state(conn, run_item_id, &state)
}

/// Stores an attachment taken while the attempt is a draft.
#[allow(clippy::too_many_arguments)]
pub(crate) fn add_draft_attachment(
    conn: &Connection,
    id: &str,
    run_item_id: &str,
    key: &str,
    step_id: Option<&str>,
    name: &str,
    mime: Option<&str>,
    kind: &str,
    stored: &evidence::Stored,
    user: &str,
) -> Result<ExecutionAttachment, String> {
    let (_, status, project) = owned_item(conn, run_item_id, user)?;
    require_open(&status)?;
    let (target, revision_id) = target_of(conn, run_item_id, key)?;
    if let Some(step) = step_id {
        let shape = RevisionShape::load(conn, &revision_id)?;
        if !shape.flow(target.flow_id.as_deref())?.steps.contains(step) {
            return Err(format!(
                "step not in that flow of the case revision: {step}"
            ));
        }
    }
    let kind = if KINDS.contains(&kind) {
        kind
    } else {
        "evidence"
    };
    let name = text(&Some(name.to_string())).ok_or("name is required")?;
    let name: String = name.chars().take(MAX_NAME).collect();
    evidence::record_blob(conn, stored, mime)?;
    evidence::insert_attachment(
        conn,
        &evidence::AttachmentRow {
            id,
            workspace_id: &ensure_workspace(conn)?,
            project_id: &project,
            owner_entity: DRAFT_OWNER,
            owner_id: run_item_id,
            name: &name,
            mime,
            kind,
            sha256: &stored.sha256,
            size: stored.size as i64,
            user,
        },
    )?;
    let mut state = stored_state(conn, run_item_id)?
        .map(|(s, _)| s)
        .unwrap_or_else(|| json!({"targets": {}, "attachments": {}}));
    state["attachments"][id] = json!({"target": key, "stepId": step_id});
    write_state(conn, run_item_id, &state)?;
    Ok(ExecutionAttachment {
        id: id.to_string(),
        name,
        mime: mime.map(String::from),
        size: stored.size as i64,
        kind: kind.to_string(),
        purged: false,
        owner_entity: DRAFT_OWNER.into(),
        owner_id: run_item_id.to_string(),
        target_key: Some(key.to_string()),
        step_id: step_id.map(String::from),
    })
}

/// Removes one attachment of a draft. A recorded one never changes.
pub(crate) fn delete_draft_attachment(
    conn: &Connection,
    id: &str,
    user: &str,
) -> Result<(), String> {
    let run_item_id: String = conn
        .query_row(
            "SELECT owner_id FROM attachments
              WHERE id = ?1 AND owner_entity = ?2 AND deleted_at IS NULL",
            params![id, DRAFT_OWNER],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?
        .ok_or("attachment not found")?;
    owned_item(conn, &run_item_id, user)?;
    let mut state = stored_state(conn, &run_item_id)?
        .map(|(s, _)| s)
        .unwrap_or_else(|| json!({"targets": {}, "attachments": {}}));
    // Only this one: a state with just it, dropped whatever its target.
    let mut only = json!({"targets": {}, "attachments": {id: {}}});
    drop_attachments(conn, &run_item_id, &mut only, None, user)?;
    if let Some(m) = state["attachments"].as_object_mut() {
        m.remove(id);
    }
    write_state(conn, &run_item_id, &state)
}

/// Records the attempt of a target from its draft (EJE-02, design §4 step 3),
/// in the caller's transaction: the Result and its StepResults with one
/// `execute` event (`record_result`), the draft's attachments of that target
/// moved to the result or to the step result of their step with one `link`
/// event each, and the target's draft removed.
pub(crate) fn record_from_draft(conn: &Connection, input: &ResultInput) -> Result<String, String> {
    let id = record_result(conn, input)?;
    let (project, flow, row): (String, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT project_id, flow_id, example_row_id FROM results WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(err)?;
    let key = target_key(flow.as_deref(), row.as_deref());
    let run_item_id = &input.run_item_id;
    let Some((mut state, _)) = stored_state(conn, run_item_id)? else {
        return Ok(id);
    };
    let mine: Vec<(String, Option<String>)> = state["attachments"]
        .as_object()
        .map(|m| {
            m.iter()
                .filter(|(_, v)| v.get("target").and_then(Value::as_str) == Some(key.as_str()))
                .map(|(k, v)| {
                    (
                        k.clone(),
                        v.get("stepId").and_then(Value::as_str).map(String::from),
                    )
                })
                .collect()
        })
        .unwrap_or_default();
    let user = &input.user_id;
    for (attachment, step) in mine {
        let found: Option<(String, Option<String>, i64, String)> = conn
            .query_row(
                "SELECT name, mime, size, sha256 FROM attachments
                  WHERE id = ?1 AND owner_entity = ?2 AND owner_id = ?3 AND deleted_at IS NULL",
                params![attachment, DRAFT_OWNER, run_item_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .map_err(err)?;
        if let Some((name, mime, size, sha)) = found {
            let step_result: Option<String> = match &step {
                Some(s) => conn
                    .query_row(
                        "SELECT id FROM step_results WHERE result_id = ?1 AND step_id = ?2
                          ORDER BY position LIMIT 1",
                        params![id, s],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(err)?,
                None => None,
            };
            let (owner_entity, owner_id) = match &step_result {
                Some(s) => ("step_result", s.as_str()),
                None => ("result", id.as_str()),
            };
            conn.execute(
                "UPDATE attachments SET owner_entity = ?2, owner_id = ?3, updated_by = ?4,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                        revision = revision + 1
                  WHERE id = ?1",
                params![attachment, owner_entity, owner_id, user],
            )
            .map_err(err)?;
            let mut changes = Map::new();
            changes.insert(
                "attachment".into(),
                json!([
                    null,
                    evidence::attachment_fact(&attachment, &name, mime.as_deref(), size, &sha)
                ]),
            );
            journal::record_event_in(
                conn,
                Actor::user(user),
                Action::Link,
                RESULT,
                &id,
                Some(&project),
                changes,
                step_result.map(|s| json!({ "stepResultId": s })),
            )?;
        }
        if let Some(m) = state["attachments"].as_object_mut() {
            m.remove(&attachment);
        }
    }
    if let Some(m) = state["targets"].as_object_mut() {
        m.remove(&key);
    }
    write_state(conn, run_item_id, &state)?;
    Ok(id)
}

/// An attachment of the manual execution in a project the user owns: (name,
/// mime, size, sha256, purged).
fn owned_attachment(
    conn: &Connection,
    id: &str,
    user: &str,
) -> Result<(String, Option<String>, i64, String, bool), String> {
    conn.query_row(
        "SELECT a.name, a.mime, a.size, a.sha256, a.blob_purged_at IS NOT NULL
           FROM attachments a JOIN projects p ON p.id = a.project_id
          WHERE a.id = ?1 AND a.deleted_at IS NULL AND p.owner_id = ?2 AND p.deleted_at IS NULL
            AND a.owner_entity IN ('execution_draft', 'result', 'step_result')",
        params![id, user],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
    )
    .optional()
    .map_err(err)?
    .ok_or_else(|| "attachment not found".to_string())
}

// ---- commands ------------------------------------------------------------------

#[tauri::command]
pub fn run_overview(
    db: State<Db>,
    run_id: String,
    user_id: String,
) -> Result<Option<RunOverview>, String> {
    db.with_conn(|conn| overview(conn, &run_id, &user_id))
}

#[tauri::command]
pub fn run_item_detail(
    db: State<Db>,
    run_item_id: String,
    user_id: String,
) -> Result<Option<RunItemDetail>, String> {
    db.with_conn(|conn| item_detail(conn, &run_item_id, &user_id))
}

/// Saves the draft of one target (local only).
#[tauri::command]
pub fn execution_draft_save(
    db: State<Db>,
    run_item_id: String,
    target_key: String,
    state: Value,
    user_id: String,
) -> Result<(), String> {
    db.with_tx(|conn| save_draft(conn, &run_item_id, &target_key, Some(&state), &user_id))?;
    db.persist()
}

/// Discards the draft of one target and its attachments.
#[tauri::command]
pub fn execution_draft_discard(
    db: State<Db>,
    run_item_id: String,
    target_key: String,
    user_id: String,
) -> Result<(), String> {
    db.with_tx(|conn| save_draft(conn, &run_item_id, &target_key, None, &user_id))?;
    db.persist_and_collect()
}

/// Records an attempt from its draft; returns the result id.
#[tauri::command]
pub fn execution_record(db: State<Db>, input: ResultInput) -> Result<String, String> {
    let id = db.with_tx(|conn| record_from_draft(conn, &input))?;
    db.persist()?;
    Ok(id)
}

/// Attaches a finished upload (`evidence_upload_*`) to a draft's target, or
/// to one of its steps.
#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub fn execution_attach(
    db: State<'_, Db>,
    uploads: State<'_, evidence::Uploads>,
    run_item_id: String,
    target_key: String,
    step_id: Option<String>,
    upload_id: String,
    name: String,
    mime: Option<String>,
    kind: Option<String>,
    user_id: String,
) -> Result<ExecutionAttachment, String> {
    let mut upload = uploads.take(&upload_id)?;
    upload.seal()?;
    let id = Uuid::new_v4().to_string();
    let out = db.with_conn(|conn| {
        owned_item(conn, &run_item_id, &user_id)?;
        let committed = upload.commit(db.evidence())?;
        let stored = committed.stored;
        let added = in_tx(conn, |tx| {
            add_draft_attachment(
                tx,
                &id,
                &run_item_id,
                &target_key,
                text(&step_id).as_deref(),
                &name,
                text(&mime).as_deref(),
                kind.as_deref().unwrap_or("evidence"),
                &stored,
                &user_id,
            )
        });
        if added.is_err() && committed.wrote && !evidence::is_known(conn, &stored.sha256)? {
            db.evidence().remove(&stored.sha256)?;
        }
        added
    })?;
    db.persist()?;
    Ok(out)
}

#[tauri::command]
pub fn execution_attachment_delete(
    db: State<Db>,
    id: String,
    user_id: String,
) -> Result<(), String> {
    db.with_tx(|conn| delete_draft_attachment(conn, &id, &user_id))?;
    db.persist_and_collect()
}

/// Saves an attachment to the download folder, decrypted block by block.
#[tauri::command(async)]
pub fn execution_attachment_save(
    db: State<'_, Db>,
    downloads: State<'_, Downloads>,
    id: String,
    user_id: String,
) -> Result<SaveResult, String> {
    let (name, _, _, sha256, purged) =
        db.with_conn(|conn| owned_attachment(conn, &id, &user_id))?;
    if purged {
        return Err(format!(
            "{}: the file was removed by the retention policy",
            evidence::EVIDENCE_MISSING
        ));
    }
    db.evidence().open(&sha256)?;
    downloads.save_with(&name, true, &|out| {
        db.evidence().copy_to(&sha256, out).map(drop)
    })
}

/// A `data:` URL of an image attachment for its thumbnail; None for other
/// files, large ones, or a content that is not here.
#[tauri::command(async)]
pub fn execution_attachment_preview(
    db: State<'_, Db>,
    id: String,
    user_id: String,
) -> Result<Option<String>, String> {
    let (_, mime, size, sha256, purged) =
        db.with_conn(|conn| owned_attachment(conn, &id, &user_id))?;
    let Some(mime) = mime.filter(|m| m.starts_with("image/") && !m.contains("svg")) else {
        return Ok(None);
    };
    if purged || size > MAX_PREVIEW_BYTES || !db.evidence().is_stored(&sha256, size as u64) {
        return Ok(None);
    }
    let mut bytes = Vec::with_capacity(size as usize);
    if db.evidence().copy_to(&sha256, &mut bytes).is_err() {
        return Ok(None);
    }
    Ok(Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )))
}

#[cfg(test)]
#[path = "manual_tests.rs"]
mod tests;
