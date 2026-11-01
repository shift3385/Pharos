//! Execution model (EJE-01, RUN-00; ADR-0012, ADR-0013; design 0.2.0 §5 step
//! 4): runs, run items, shards, results with their step results, and
//! unlinked mappings. Schema in migration 0024; no UI yet (EJE-02 is step 7).
//!
//! - A **run** is one execution against a context (environment, build,
//!   commit, dataset…) with a visible key `RUN-001`. Its header is `lww` and
//!   is only edited while `in_progress`.
//! - A **run item** is what the run means to execute: a case with its
//!   revision frozen when the item is added, plus flow and Outline row.
//! - A **result** is one attempt, immutable (`append_only`), written with its
//!   step results in one transaction and one `execute` audit event. A
//!   correction is a new attempt; the final attempt and flaky are derived
//!   (`derive.rs`).
//! - A **shard** is one upload or import (step 9 writes them); an
//!   **unlinked mapping** links a `test_key` to a case later without touching
//!   its results.
//!
//! Every entity carries `project_id` and belongs to the project's owner
//! (ADR-0020 rule 1). Nothing here has a foreign key to `runs`: a pull can
//! bring a result before its run, so the links are checked here.
//! Sync: `run`, `run_item`, `unlinked_mapping` are lww (`oplog::SYNCED`);
//! `run_shard` and `result` are append-only (`sync_class.rs`). All of them wait
//! for a server that lists `runs` (`sync::server_takes_runs`).

pub mod derive;
pub mod ids;
pub mod import;
#[cfg(test)]
mod tests;

use std::collections::HashSet;

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
use crate::oplog;
use crate::project;
use derive::Attempt;

pub(crate) const KEY_PREFIX: &str = "RUN-";
pub(crate) const KEY_DIGITS: usize = 3;

pub const RUN: &str = "run";
pub const RUN_ITEM: &str = "run_item";
pub const UNLINKED_MAPPING: &str = "unlinked_mapping";
pub const RUN_SHARD: &str = "run_shard";
pub const RESULT: &str = "result";

/// Entities of this module, by sync class.
pub const LWW_ENTITIES: [&str; 3] = [RUN, RUN_ITEM, UNLINKED_MAPPING];
pub const APPEND_ENTITIES: [&str; 2] = [RUN_SHARD, RESULT];

/// Every entity of this module as an SQL list literal, for `entity IN (...)`.
pub(crate) fn entities_sql_list() -> String {
    LWW_ENTITIES
        .iter()
        .chain(APPEND_ENTITIES.iter())
        .map(|e| format!("'{e}'"))
        .collect::<Vec<_>>()
        .join(",")
}

const TRIGGERS: [&str; 6] = ["manual", "local", "agent", "ci", "cloud", "import"];

/// The server's limits (`EXECUTION_PAYLOADS` in `sync.schemas.ts`), checked
/// here too: a document the server refuses would stay pending for ever.
/// Lengths count UTF-16 units, as zod does.
pub(crate) const MAX_TITLE: usize = 500;
pub(crate) const MAX_TEST_KEY: usize = 2000;
pub(crate) const MAX_STEPS: usize = 5000;

fn within(field: &str, value: &str, max: usize) -> Result<(), String> {
    if value.encode_utf16().count() > max {
        return Err(format!("{field}-too-long: at most {max} characters"));
    }
    Ok(())
}
const RESULT_STATUSES: [&str; 5] = ["passed", "failed", "blocked", "skipped", "other"];

// ---- types -------------------------------------------------------------------

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) run_key: String,
    pub(crate) title: String,
    pub(crate) trigger: String,
    pub(crate) source_tool: Option<String>,
    pub(crate) source_tool_version: Option<String>,
    pub(crate) test_plan_id: Option<String>,
    pub(crate) cycle_id: Option<String>,
    pub(crate) configuration_id: Option<String>,
    pub(crate) environment: Option<String>,
    pub(crate) build: Option<String>,
    pub(crate) commit_sha: Option<String>,
    pub(crate) branch: Option<String>,
    pub(crate) repository_url: Option<String>,
    pub(crate) ci_url: Option<String>,
    pub(crate) dataset: Option<String>,
    #[cfg_attr(test, ts(type = "Record<string, unknown>"))]
    pub(crate) context: Value,
    pub(crate) status: String,
    pub(crate) started_at: Option<String>,
    pub(crate) finished_at: Option<String>,
    #[cfg_attr(test, ts(type = "Record<string, unknown>"))]
    pub(crate) summary: Value,
    #[cfg_attr(test, ts(type = "Record<string, unknown>"))]
    pub(crate) data: Value,
    pub(crate) created_by: String,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
    pub(crate) revision: i64,
}

/// Header of a run. On create `projectId` and `title` are required; on update
/// a field left out keeps its value, and `status` may move to `completed` or
/// `aborted` (which closes the run: `finishedAt` defaults to now).
#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RunInput {
    pub(crate) project_id: Option<String>,
    pub(crate) title: Option<String>,
    pub(crate) trigger: Option<String>,
    pub(crate) source_tool: Option<String>,
    pub(crate) source_tool_version: Option<String>,
    pub(crate) test_plan_id: Option<String>,
    pub(crate) cycle_id: Option<String>,
    pub(crate) configuration_id: Option<String>,
    pub(crate) environment: Option<String>,
    pub(crate) build: Option<String>,
    pub(crate) commit_sha: Option<String>,
    pub(crate) branch: Option<String>,
    pub(crate) repository_url: Option<String>,
    pub(crate) ci_url: Option<String>,
    pub(crate) dataset: Option<String>,
    #[cfg_attr(test, ts(type = "Record<string, unknown>"))]
    pub(crate) context: Option<Value>,
    pub(crate) status: Option<String>,
    pub(crate) started_at: Option<String>,
    pub(crate) finished_at: Option<String>,
    pub(crate) user_id: String,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RunItem {
    pub(crate) id: String,
    pub(crate) run_id: String,
    pub(crate) test_case_id: String,
    pub(crate) test_case_revision_id: String,
    pub(crate) flow_id: Option<String>,
    pub(crate) example_row_id: Option<String>,
    pub(crate) example_row: Option<i64>,
    pub(crate) configuration_id: Option<String>,
    pub(crate) assignee: Option<String>,
    pub(crate) position: i64,
    pub(crate) revision: i64,
}

#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RunItemInput {
    pub(crate) test_case_id: String,
    pub(crate) flow_id: Option<String>,
    pub(crate) example_row_id: Option<String>,
    pub(crate) example_row: Option<i64>,
    pub(crate) configuration_id: Option<String>,
    pub(crate) assignee: Option<String>,
}

#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StepResultInput {
    pub(crate) step_id: Option<String>,
    pub(crate) keyword: Option<String>,
    pub(crate) text: String,
    pub(crate) status: String,
    pub(crate) actual: Option<String>,
    pub(crate) duration_ms: Option<i64>,
    pub(crate) gherkin_line: Option<i64>,
}

/// One manual attempt of a run item (EJE-02 writes it from the local draft).
#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResultInput {
    pub(crate) run_item_id: String,
    pub(crate) status: String,
    pub(crate) raw_status: Option<String>,
    pub(crate) configuration_label: Option<String>,
    pub(crate) duration_ms: Option<i64>,
    pub(crate) started_at: Option<String>,
    pub(crate) finished_at: Option<String>,
    pub(crate) error_message: Option<String>,
    pub(crate) error_trace: Option<String>,
    #[cfg_attr(test, ts(type = "Record<string, unknown>"))]
    pub(crate) attributes: Option<Value>,
    pub(crate) steps: Option<Vec<StepResultInput>>,
    pub(crate) user_id: String,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StepResult {
    pub(crate) id: String,
    pub(crate) position: i64,
    pub(crate) step_id: Option<String>,
    pub(crate) keyword: Option<String>,
    pub(crate) text: String,
    pub(crate) status: String,
    pub(crate) actual: Option<String>,
    pub(crate) duration_ms: Option<i64>,
    pub(crate) gherkin_line: Option<i64>,
}

/// An attempt as the run views list it, with what is derived.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResultView {
    pub(crate) id: String,
    pub(crate) run_id: String,
    pub(crate) shard_id: Option<String>,
    pub(crate) run_item_id: Option<String>,
    pub(crate) test_key: String,
    pub(crate) test_case_id: Option<String>,
    /// `coalesce(test_case_id, unlinked_mapping.test_case_id)` (ING-05).
    pub(crate) effective_test_case_id: Option<String>,
    pub(crate) test_case_revision_id: Option<String>,
    pub(crate) case_revision: Option<i64>,
    pub(crate) case_key: Option<String>,
    pub(crate) flow_id: Option<String>,
    pub(crate) example_row_id: Option<String>,
    pub(crate) example_row: Option<i64>,
    pub(crate) configuration_label: Option<String>,
    pub(crate) attempt: i64,
    pub(crate) status: String,
    pub(crate) raw_status: Option<String>,
    pub(crate) duration_ms: Option<i64>,
    pub(crate) started_at: Option<String>,
    pub(crate) finished_at: Option<String>,
    pub(crate) error_message: Option<String>,
    pub(crate) executed_by: String,
    #[cfg_attr(test, ts(type = "Record<string, unknown>"))]
    pub(crate) attributes: Value,
    pub(crate) created_at: String,
    /// The final attempt of its test (derived, ADR-0013).
    pub(crate) is_final: bool,
    /// Its test is flaky (derived; only meaningful on the final attempt).
    pub(crate) flaky: bool,
    pub(crate) steps: Vec<StepResult>,
    #[serde(skip)]
    #[cfg_attr(test, ts(skip))]
    pub(crate) hlc: String,
    #[serde(skip)]
    #[cfg_attr(test, ts(skip))]
    pub(crate) shard_imported_at: Option<String>,
}

// ---- helpers -----------------------------------------------------------------

fn err(e: rusqlite::Error) -> String {
    e.to_string()
}

fn json_col(r: &rusqlite::Row, col: &str) -> rusqlite::Result<Value> {
    let s: Option<String> = r.get(col)?;
    Ok(s.and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({})))
}

fn object_or_empty(v: Option<&Value>) -> Value {
    match v {
        Some(Value::Object(m)) => Value::Object(m.clone()),
        _ => json!({}),
    }
}

/// A non-empty trimmed string, or None.
fn text(v: &Option<String>) -> Option<String> {
    v.as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// Project of a live run the user owns, with its status.
fn owned_run(conn: &Connection, run_id: &str, user: &str) -> Result<(String, String), String> {
    conn.query_row(
        "SELECT r.project_id, r.status FROM runs r JOIN projects p ON p.id = r.project_id
          WHERE r.id = ?1 AND p.owner_id = ?2 AND r.deleted_at IS NULL AND p.deleted_at IS NULL",
        params![run_id, user],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .optional()
    .map_err(err)?
    .ok_or_else(|| "run not found".to_string())
}

fn require_open(status: &str) -> Result<(), String> {
    if status != "in_progress" {
        return Err("run-closed".into());
    }
    Ok(())
}

/// The step and Outline-row ids of one flow of a revision (ADR-0011).
#[derive(Default)]
struct FlowShape {
    steps: HashSet<String>,
    rows: HashSet<String>,
}

/// What a run item's flow and row, and a step result's `step_id`, may point
/// at, by kind: a result attributed to the wrong step can never be corrected.
/// The main flow is the case's preconditions, background and steps with its
/// Outline rows; each flow of an advanced case has the background, its own
/// preconditions and steps, and its own rows.
struct RevisionShape {
    main: FlowShape,
    flows: std::collections::HashMap<String, FlowShape>,
}

impl RevisionShape {
    fn of(data: &Value) -> Self {
        let ids = |list: Option<&Value>| -> HashSet<String> {
            list.and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|el| el.get("id").and_then(Value::as_str).map(String::from))
                .collect()
        };
        let rows = |v: &Value| ids(v.get("examples").and_then(|e| e.get("rows")));
        let background = ids(data.get("background"));
        let mut main = FlowShape {
            steps: background.clone(),
            rows: rows(data),
        };
        for key in ["preconditions", "steps"] {
            main.steps.extend(ids(data.get(key)));
        }
        let mut flows = std::collections::HashMap::new();
        for flow in data
            .get("flows")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let Some(id) = flow.get("id").and_then(Value::as_str) else {
                continue;
            };
            let mut shape = FlowShape {
                steps: background.clone(),
                rows: rows(flow),
            };
            for key in ["preconditions", "steps"] {
                shape.steps.extend(ids(flow.get(key)));
            }
            flows.insert(id.to_string(), shape);
        }
        RevisionShape { main, flows }
    }

    fn load(conn: &Connection, revision_id: &str) -> Result<Self, String> {
        let data: Option<String> = conn
            .query_row(
                "SELECT data FROM test_case_revisions WHERE id = ?1",
                params![revision_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?;
        let data = data
            .and_then(|d| serde_json::from_str::<Value>(&d).ok())
            .unwrap_or(Value::Null);
        Ok(Self::of(&data))
    }

    /// The flow a run item points at: the main one, or a flow of the case.
    fn flow(&self, flow_id: Option<&str>) -> Result<&FlowShape, String> {
        match flow_id {
            None => Ok(&self.main),
            Some(id) => self
                .flows
                .get(id)
                .ok_or_else(|| format!("flow not in the case revision: {id}")),
        }
    }
}

// ---- runs ----------------------------------------------------------------------

const SELECT_RUN: &str = "SELECT r.id, r.project_id, r.run_key, r.title, r.trigger, r.source_tool,
    r.source_tool_version, r.test_plan_id, r.cycle_id, r.configuration_id, r.environment, r.build,
    r.commit_sha, r.branch, r.repository_url, r.ci_url, r.dataset, r.context, r.status, r.started_at,
    r.finished_at, r.summary, r.data, r.created_by, r.created_at, r.updated_at, r.revision
    FROM runs r JOIN projects p ON p.id = r.project_id";

fn map_run(r: &rusqlite::Row) -> rusqlite::Result<Run> {
    Ok(Run {
        id: r.get("id")?,
        project_id: r.get("project_id")?,
        run_key: r.get("run_key")?,
        title: r.get("title")?,
        trigger: r.get("trigger")?,
        source_tool: r.get("source_tool")?,
        source_tool_version: r.get("source_tool_version")?,
        test_plan_id: r.get("test_plan_id")?,
        cycle_id: r.get("cycle_id")?,
        configuration_id: r.get("configuration_id")?,
        environment: r.get("environment")?,
        build: r.get("build")?,
        commit_sha: r.get("commit_sha")?,
        branch: r.get("branch")?,
        repository_url: r.get("repository_url")?,
        ci_url: r.get("ci_url")?,
        dataset: r.get("dataset")?,
        context: json_col(r, "context")?,
        status: r.get("status")?,
        started_at: r.get("started_at")?,
        finished_at: r.get("finished_at")?,
        summary: json_col(r, "summary")?,
        data: json_col(r, "data")?,
        created_by: r.get("created_by")?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
        revision: r.get("revision")?,
    })
}

pub(crate) fn get_run(conn: &Connection, id: &str, user: &str) -> Result<Option<Run>, String> {
    conn.query_row(
        &format!(
            "{SELECT_RUN} WHERE r.id = ?1 AND p.owner_id = ?2 AND r.deleted_at IS NULL \
             AND p.deleted_at IS NULL"
        ),
        params![id, user],
        map_run,
    )
    .optional()
    .map_err(err)
}

pub(crate) fn list_runs(
    conn: &Connection,
    project_id: &str,
    user: &str,
) -> Result<Vec<Run>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "{SELECT_RUN} WHERE r.project_id = ?1 AND p.owner_id = ?2 AND r.deleted_at IS NULL \
             AND p.deleted_at IS NULL ORDER BY r.created_at DESC, r.rowid DESC"
        ))
        .map_err(err)?;
    let rows = stmt
        .query_map(params![project_id, user], map_run)
        .map_err(err)?;
    rows.collect::<rusqlite::Result<_>>().map_err(err)
}

pub(crate) fn insert_run(conn: &Connection, input: &RunInput) -> Result<String, String> {
    let user = &input.user_id;
    let project_id = text(&input.project_id).ok_or("projectId is required")?;
    if !project::owns(conn, &project_id, user)? {
        return Err("project not found".into());
    }
    let title = text(&input.title).ok_or("title is required")?;
    within("title", &title, MAX_TITLE)?;
    let trigger = text(&input.trigger).unwrap_or_else(|| "manual".into());
    if !TRIGGERS.contains(&trigger.as_str()) {
        return Err(format!("unknown trigger: {trigger}"));
    }
    let id = Uuid::new_v4().to_string();
    let key = keys::allocate(conn, KeyKind::Run, &project_id, KEY_PREFIX, KEY_DIGITS)?;
    let context = object_or_empty(input.context.as_ref());
    conn.execute(
        "INSERT INTO runs (id, workspace_id, project_id, run_key, title, trigger, source_tool,
                source_tool_version, test_plan_id, cycle_id, configuration_id, environment, build,
                commit_sha, branch, repository_url, ci_url, dataset, context, status, started_at,
                created_by, updated_by, created_at, updated_at, revision)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19,
                'in_progress', coalesce(?20, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), ?21, ?21,
                datetime('now'), datetime('now'), 1)",
        params![
            id,
            ensure_workspace(conn)?,
            project_id,
            key,
            title,
            trigger,
            text(&input.source_tool),
            text(&input.source_tool_version),
            text(&input.test_plan_id),
            text(&input.cycle_id),
            text(&input.configuration_id),
            text(&input.environment),
            text(&input.build),
            text(&input.commit_sha),
            text(&input.branch),
            text(&input.repository_url),
            text(&input.ci_url),
            text(&input.dataset),
            context.to_string(),
            text(&input.started_at),
            user,
        ],
    )
    .map_err(err)?;
    journal::record(
        conn,
        Change::new(
            RUN,
            &id,
            Action::Create,
            Actor::user(user),
            "upsert",
            1,
            user,
        ),
    )?;
    Ok(id)
}

/// Edits the header of an open run. A field left out keeps its value; the
/// key, the project and the trigger never change.
pub(crate) fn update_run(conn: &Connection, id: &str, input: &RunInput) -> Result<(), String> {
    let user = &input.user_id;
    let (_, status) = owned_run(conn, id, user)?;
    require_open(&status)?;
    let new_status = text(&input.status).unwrap_or_else(|| status.clone());
    if !["in_progress", "completed", "aborted"].contains(&new_status.as_str()) {
        return Err(format!("unknown run status: {new_status}"));
    }
    let closing = new_status != "in_progress";
    if let Some(title) = text(&input.title) {
        within("title", &title, MAX_TITLE)?;
    }
    let revision: i64 = conn
        .query_row(
            "SELECT revision FROM runs WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(err)?;
    let before = journal::snapshot(conn, RUN, id)?;
    let context = input
        .context
        .as_ref()
        .map(|c| object_or_empty(Some(c)).to_string());
    conn.execute(
        "UPDATE runs SET
            title = coalesce(?2, title), source_tool = coalesce(?3, source_tool),
            source_tool_version = coalesce(?4, source_tool_version),
            test_plan_id = coalesce(?5, test_plan_id), cycle_id = coalesce(?6, cycle_id),
            configuration_id = coalesce(?7, configuration_id),
            environment = coalesce(?8, environment), build = coalesce(?9, build),
            commit_sha = coalesce(?10, commit_sha), branch = coalesce(?11, branch),
            repository_url = coalesce(?12, repository_url), ci_url = coalesce(?13, ci_url),
            dataset = coalesce(?14, dataset), context = coalesce(?15, context),
            started_at = coalesce(?16, started_at), status = ?17,
            finished_at = CASE WHEN ?18 THEN coalesce(?19, finished_at,
                              strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ELSE coalesce(?19, finished_at) END,
            updated_by = ?20, updated_at = datetime('now'), revision = ?21
          WHERE id = ?1",
        params![
            id,
            text(&input.title),
            text(&input.source_tool),
            text(&input.source_tool_version),
            text(&input.test_plan_id),
            text(&input.cycle_id),
            text(&input.configuration_id),
            text(&input.environment),
            text(&input.build),
            text(&input.commit_sha),
            text(&input.branch),
            text(&input.repository_url),
            text(&input.ci_url),
            text(&input.dataset),
            context,
            text(&input.started_at),
            new_status,
            closing,
            text(&input.finished_at),
            user,
            revision + 1,
        ],
    )
    .map_err(err)?;
    journal::record(
        conn,
        Change::new(
            RUN,
            id,
            Action::Update,
            Actor::user(user),
            "upsert",
            revision + 1,
            user,
        )
        .before(before),
    )
}

// ---- run items -----------------------------------------------------------------

fn map_item(r: &rusqlite::Row) -> rusqlite::Result<RunItem> {
    Ok(RunItem {
        id: r.get("id")?,
        run_id: r.get("run_id")?,
        test_case_id: r.get("test_case_id")?,
        test_case_revision_id: r.get("test_case_revision_id")?,
        flow_id: r.get("flow_id")?,
        example_row_id: r.get("example_row_id")?,
        example_row: r.get("example_row")?,
        configuration_id: r.get("configuration_id")?,
        assignee: r.get("assignee")?,
        position: r.get("position")?,
        revision: r.get("revision")?,
    })
}

pub(crate) fn list_items(
    conn: &Connection,
    run_id: &str,
    user: &str,
) -> Result<Vec<RunItem>, String> {
    if owned_run(conn, run_id, user).is_err() {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "SELECT * FROM run_items WHERE run_id = ?1 AND deleted_at IS NULL
              ORDER BY position, created_at, rowid",
        )
        .map_err(err)?;
    let rows = stmt.query_map(params![run_id], map_item).map_err(err)?;
    rows.collect::<rusqlite::Result<_>>().map_err(err)
}

/// Adds what the run will execute. Each item freezes the case's **current**
/// revision (ADR-0017: frozen when the run is planned); its flow and row must
/// exist in that revision. One oplog row per item and one audit event for the
/// whole addition (ADR-0015: a bulk operation is one event).
pub(crate) fn add_items(
    conn: &Connection,
    run_id: &str,
    user: &str,
    items: &[RunItemInput],
) -> Result<Vec<String>, String> {
    let (project_id, status) = owned_run(conn, run_id, user)?;
    require_open(&status)?;
    let first: i64 = conn
        .query_row(
            "SELECT coalesce(max(position) + 1, 0) FROM run_items WHERE run_id = ?1",
            params![run_id],
            |r| r.get(0),
        )
        .map_err(err)?;
    let workspace = ensure_workspace(conn)?;
    let mut ids = Vec::new();
    for (n, item) in items.iter().enumerate() {
        let position = first + n as i64;
        let case_project: Option<String> = conn
            .query_row(
                "SELECT project_id FROM test_cases WHERE id = ?1 AND deleted_at IS NULL",
                params![item.test_case_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?
            .flatten();
        if case_project.as_deref() != Some(project_id.as_str()) {
            return Err(format!("test case not found: {}", item.test_case_id));
        }
        // A case with an open key conflict holds a provisional key whose
        // revision stays on this device (`revisions::ensure_current_local`):
        // an item frozen on it would point at a revision no other device has.
        let key_conflict = conn
            .query_row(
                "SELECT 1 FROM key_conflicts WHERE entity = 'test_case' AND entity_id = ?1
                    AND resolved_at IS NULL",
                params![item.test_case_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(err)?
            .is_some();
        if key_conflict {
            return Err(format!("case-key-conflict: {}", item.test_case_id));
        }
        let revision_id =
            crate::revisions::ensure_current(conn, &item.test_case_id, user, true)?
                .ok_or_else(|| format!("test case has no revision: {}", item.test_case_id))?;
        let shape = RevisionShape::load(conn, &revision_id)?;
        let flow = shape.flow(text(&item.flow_id).as_deref())?;
        if let Some(row) = text(&item.example_row_id) {
            if !flow.rows.contains(&row) {
                return Err(format!(
                    "example row not in that flow of the case revision: {row}"
                ));
            }
        }
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO run_items (id, workspace_id, project_id, run_id, test_case_id,
                    test_case_revision_id, flow_id, example_row_id, example_row, configuration_id,
                    assignee, position, created_by, updated_by, created_at, updated_at, revision)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13,
                    datetime('now'), datetime('now'), 1)",
            params![
                id,
                workspace,
                project_id,
                run_id,
                item.test_case_id,
                revision_id,
                text(&item.flow_id),
                text(&item.example_row_id),
                item.example_row,
                text(&item.configuration_id),
                text(&item.assignee),
                position,
                user,
            ],
        )
        .map_err(err)?;
        let mut change = Change::new(
            RUN_ITEM,
            &id,
            Action::Create,
            Actor::user(user),
            "upsert",
            1,
            user,
        );
        change.audit = Audit::Folded;
        journal::record(conn, change)?;
        ids.push(id);
    }
    if !ids.is_empty() {
        journal::record_event(
            conn,
            Actor::user(user),
            Action::Update,
            RUN,
            run_id,
            Map::new(),
            Some(json!({ "itemsAdded": ids.len() })),
        )?;
    }
    Ok(ids)
}

// ---- results -------------------------------------------------------------------

struct ItemContext {
    project_id: String,
    run_id: String,
    test_case_id: String,
    revision_id: String,
    flow_id: Option<String>,
    example_row_id: Option<String>,
    example_row: Option<i64>,
    configuration_id: Option<String>,
}

fn item_context(conn: &Connection, run_item_id: &str) -> Result<Option<ItemContext>, String> {
    conn.query_row(
        "SELECT project_id, run_id, test_case_id, test_case_revision_id, flow_id, example_row_id,
                example_row, configuration_id
           FROM run_items WHERE id = ?1 AND deleted_at IS NULL",
        params![run_item_id],
        |r| {
            Ok(ItemContext {
                project_id: r.get(0)?,
                run_id: r.get(1)?,
                test_case_id: r.get(2)?,
                revision_id: r.get(3)?,
                flow_id: r.get(4)?,
                example_row_id: r.get(5)?,
                example_row: r.get(6)?,
                configuration_id: r.get(7)?,
            })
        },
    )
    .optional()
    .map_err(err)
}

/// Records one manual attempt of a run item: the Result (attempt n), its
/// StepResults and one `execute` audit event, in the caller's transaction.
/// From then on it never changes; a correction is another attempt.
pub(crate) fn record_result(conn: &Connection, input: &ResultInput) -> Result<String, String> {
    let user = &input.user_id;
    let item = item_context(conn, &input.run_item_id)?.ok_or("run item not found")?;
    let (_, status) = owned_run(conn, &item.run_id, user)?;
    require_open(&status)?;
    if !RESULT_STATUSES.contains(&input.status.as_str()) {
        return Err(format!("unknown result status: {}", input.status));
    }
    let steps = input.steps.clone().unwrap_or_default();
    if steps.len() > MAX_STEPS {
        return Err(format!("steps-too-many: at most {MAX_STEPS} steps"));
    }
    let shape = RevisionShape::load(conn, &item.revision_id)?;
    let flow = shape.flow(item.flow_id.as_deref())?;
    for s in &steps {
        if !RESULT_STATUSES.contains(&s.status.as_str()) {
            return Err(format!("unknown step status: {}", s.status));
        }
        if let Some(step_id) = text(&s.step_id) {
            if !flow.steps.contains(&step_id) {
                return Err(format!(
                    "step not in that flow of the case revision: {step_id}"
                ));
            }
        }
    }
    let (case_revision, case_key): (Option<i64>, Option<String>) = conn
        .query_row(
            "SELECT revision, scenario_id FROM test_case_revisions WHERE id = ?1",
            params![item.revision_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(err)?
        .unwrap_or((None, None));
    let test_key = ids::manual_test_key(
        &item.test_case_id,
        item.flow_id.as_deref(),
        item.example_row_id.as_deref(),
    );
    within("testKey", &test_key, MAX_TEST_KEY)?;
    let label = text(&input.configuration_label);
    // attempt n: the next number of this test in this run (shown only; the
    // final attempt is ordered by time, ADR-0013).
    let attempt: i64 = conn
        .query_row(
            "SELECT coalesce(max(attempt) + 1, 0) FROM results
              WHERE run_id = ?1 AND test_key = ?2 AND coalesce(configuration_label, '') = ?3",
            params![item.run_id, test_key, label.clone().unwrap_or_default()],
            |r| r.get(0),
        )
        .map_err(err)?;
    let id = Uuid::new_v4().to_string();
    let hlc = oplog::next_hlc(conn)?;
    let attributes = object_or_empty(input.attributes.as_ref());
    conn.execute(
        "INSERT INTO results (id, workspace_id, project_id, run_id, shard_id, run_item_id, test_key,
                test_case_id, test_case_revision_id, case_revision, case_key, flow_id, example_row_id,
                example_row, example_values, configuration_id, configuration_label, attempt, status,
                raw_status, duration_ms, started_at, finished_at, error_message, error_trace,
                executed_by, external_id, attributes, created_by, created_at, hlc)
         VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, NULL, ?14, ?15, ?16,
                ?17, ?18, ?19, ?20, coalesce(?21, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), ?22, ?23,
                ?24, NULL, ?25, ?26, datetime('now'), ?27)",
        params![
            id,
            ensure_workspace(conn)?,
            item.project_id,
            item.run_id,
            input.run_item_id,
            test_key,
            item.test_case_id,
            item.revision_id,
            case_revision,
            case_key,
            item.flow_id,
            item.example_row_id,
            item.example_row,
            item.configuration_id,
            label,
            attempt,
            input.status,
            text(&input.raw_status),
            input.duration_ms,
            text(&input.started_at),
            text(&input.finished_at),
            input.error_message,
            input.error_trace,
            format!("user:{user}"),
            attributes.to_string(),
            user,
            hlc,
        ],
    )
    .map_err(err)?;
    insert_steps(conn, &id, &steps_of_input(&steps))?;
    journal::record_append(conn, RESULT, &id, user)?;
    let mut changes = Map::new();
    changes.insert("status".into(), json!([null, input.status]));
    journal::record_event_in(
        conn,
        Actor::user(user),
        Action::Execute,
        RESULT,
        &id,
        Some(&item.project_id),
        changes,
        Some(json!({
            "runId": item.run_id,
            "runItemId": input.run_item_id,
            "testKey": test_key,
            "attempt": attempt,
            "steps": steps.len(),
        })),
    )?;
    Ok(id)
}

fn steps_of_input(steps: &[StepResultInput]) -> Vec<StepResult> {
    steps
        .iter()
        .enumerate()
        .map(|(i, s)| StepResult {
            id: Uuid::new_v4().to_string(),
            position: i as i64,
            step_id: text(&s.step_id),
            keyword: text(&s.keyword),
            text: s.text.clone(),
            status: s.status.clone(),
            actual: s.actual.clone(),
            duration_ms: s.duration_ms,
            gherkin_line: s.gherkin_line,
        })
        .collect()
}

fn insert_steps(conn: &Connection, result_id: &str, steps: &[StepResult]) -> Result<(), String> {
    for s in steps {
        conn.execute(
            "INSERT OR IGNORE INTO step_results (id, result_id, position, step_id, keyword, text,
                    status, actual, duration_ms, gherkin_line)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                s.id,
                result_id,
                s.position,
                s.step_id,
                s.keyword,
                s.text,
                s.status,
                s.actual,
                s.duration_ms,
                s.gherkin_line,
            ],
        )
        .map_err(err)?;
    }
    Ok(())
}

fn steps_of(conn: &Connection, result_id: &str) -> Result<Vec<StepResult>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, position, step_id, keyword, text, status, actual, duration_ms, gherkin_line
               FROM step_results WHERE result_id = ?1 ORDER BY position, rowid",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map(params![result_id], |r| {
            Ok(StepResult {
                id: r.get(0)?,
                position: r.get(1)?,
                step_id: r.get(2)?,
                keyword: r.get(3)?,
                text: r.get(4)?,
                status: r.get(5)?,
                actual: r.get(6)?,
                duration_ms: r.get(7)?,
                gherkin_line: r.get(8)?,
            })
        })
        .map_err(err)?;
    rows.collect::<rusqlite::Result<_>>().map_err(err)
}

/// Every attempt of a run, oldest first, with the derived final and flaky.
pub(crate) fn list_results(
    conn: &Connection,
    run_id: &str,
    user: &str,
) -> Result<Vec<ResultView>, String> {
    if owned_run(conn, run_id, user).is_err() {
        return Ok(Vec::new());
    }
    let mut out: Vec<ResultView> = {
        let mut stmt = conn
            .prepare(
                // One mapping per (project, test_key) by its deterministic id;
                // a subquery, not a join, so stray rows can never duplicate
                // a result.
                "SELECT x.*, s.imported_at AS shard_imported_at,
                        coalesce(x.test_case_id,
                                 (SELECT m.test_case_id FROM unlinked_mappings m
                                   WHERE m.project_id = x.project_id AND m.test_key = x.test_key
                                     AND m.deleted_at IS NULL
                                   ORDER BY m.updated_at DESC, m.rowid DESC LIMIT 1)) AS effective_case
                   FROM results x
                   LEFT JOIN run_shards s ON s.id = x.shard_id
                  WHERE x.run_id = ?1
                  ORDER BY x.created_at, x.rowid",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map(params![run_id], |r| {
                Ok(ResultView {
                    id: r.get("id")?,
                    run_id: r.get("run_id")?,
                    shard_id: r.get("shard_id")?,
                    run_item_id: r.get("run_item_id")?,
                    test_key: r.get("test_key")?,
                    test_case_id: r.get("test_case_id")?,
                    effective_test_case_id: r.get("effective_case")?,
                    test_case_revision_id: r.get("test_case_revision_id")?,
                    case_revision: r.get("case_revision")?,
                    case_key: r.get("case_key")?,
                    flow_id: r.get("flow_id")?,
                    example_row_id: r.get("example_row_id")?,
                    example_row: r.get("example_row")?,
                    configuration_label: r.get("configuration_label")?,
                    attempt: r.get("attempt")?,
                    status: r.get("status")?,
                    raw_status: r.get("raw_status")?,
                    duration_ms: r.get("duration_ms")?,
                    started_at: r.get("started_at")?,
                    finished_at: r.get("finished_at")?,
                    error_message: r.get("error_message")?,
                    executed_by: r.get("executed_by")?,
                    attributes: json_col(r, "attributes")?,
                    created_at: r.get("created_at")?,
                    is_final: false,
                    flaky: false,
                    steps: Vec::new(),
                    hlc: r.get("hlc")?,
                    shard_imported_at: r.get("shard_imported_at")?,
                })
            })
            .map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)?
    };
    let (finals, flaky): (HashSet<String>, HashSet<(String, String, String)>) = {
        let attempts: Vec<Attempt> = out
            .iter()
            .map(|v| Attempt {
                id: &v.id,
                run_id: &v.run_id,
                test_key: &v.test_key,
                configuration_label: v.configuration_label.as_deref(),
                attempt: v.attempt,
                status: &v.status,
                started_at: v.started_at.as_deref(),
                finished_at: v.finished_at.as_deref(),
                shard_imported_at: v.shard_imported_at.as_deref(),
                hlc: &v.hlc,
                declared_flaky: v.attributes.get("flaky") == Some(&Value::Bool(true)),
            })
            .collect();
        (
            derive::final_attempts(&attempts)
                .into_iter()
                .map(String::from)
                .collect(),
            derive::flaky_tests(&attempts)
                .into_iter()
                .map(|(a, b, c)| (a.to_string(), b.to_string(), c.to_string()))
                .collect(),
        )
    };
    for v in &mut out {
        v.is_final = finals.contains(&v.id);
        v.flaky = flaky.contains(&(
            v.run_id.clone(),
            v.test_key.clone(),
            v.configuration_label.clone().unwrap_or_default(),
        ));
        v.steps = steps_of(conn, &v.id)?;
    }
    Ok(out)
}

// ---- unlinked mappings -----------------------------------------------------------

/// Links (or, with None, unlinks) every result of `test_key` in the project
/// to a case, past and future, without touching the results (ING-05). The id
/// is deterministic, so two devices write the same rule and the last wins.
pub(crate) fn set_mapping(
    conn: &Connection,
    project_id: &str,
    test_key: &str,
    test_case_id: Option<&str>,
    user: &str,
) -> Result<String, String> {
    if !project::owns(conn, project_id, user)? {
        return Err("project not found".into());
    }
    let test_key = test_key.trim();
    if test_key.is_empty() {
        return Err("testKey is required".into());
    }
    within("testKey", test_key, MAX_TEST_KEY)?;
    if let Some(case) = test_case_id {
        let ok = conn
            .query_row(
                "SELECT 1 FROM test_cases WHERE id = ?1 AND project_id = ?2 AND deleted_at IS NULL",
                params![case, project_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(err)?
            .is_some();
        if !ok {
            return Err(format!("test case not found: {case}"));
        }
    }
    let id = ids::unlinked_mapping_id(project_id, test_key);
    let before = journal::snapshot(conn, UNLINKED_MAPPING, &id)?;
    let revision = before
        .as_ref()
        .and_then(|b| b.get("revision"))
        .and_then(Value::as_i64)
        .map_or(1, |r| r + 1);
    conn.execute(
        "INSERT INTO unlinked_mappings (id, workspace_id, project_id, test_key, test_case_id,
                created_by, updated_by, created_at, updated_at, deleted_at, revision)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, datetime('now'), datetime('now'), NULL, ?7)
         ON CONFLICT(id) DO UPDATE SET test_case_id = excluded.test_case_id,
                updated_by = excluded.updated_by, updated_at = excluded.updated_at,
                deleted_at = NULL, revision = excluded.revision",
        params![
            id,
            ensure_workspace(conn)?,
            project_id,
            test_key,
            test_case_id,
            user,
            revision
        ],
    )
    .map_err(err)?;
    let action = if before.is_some() {
        Action::Update
    } else {
        Action::Create
    };
    journal::record(
        conn,
        Change::new(
            UNLINKED_MAPPING,
            &id,
            action,
            Actor::user(user),
            "upsert",
            revision,
            user,
        )
        .before(before),
    )?;
    Ok(id)
}

// ---- sync ----------------------------------------------------------------------

/// Owner of any entity of this module: its project's owner (ADR-0020 rule 1).
pub(crate) fn owner_sql(entity: &str) -> Option<&'static str> {
    Some(match entity {
        RUN => "SELECT p.owner_id FROM runs x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1",
        RUN_ITEM => {
            "SELECT p.owner_id FROM run_items x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1"
        }
        UNLINKED_MAPPING => {
            "SELECT p.owner_id FROM unlinked_mappings x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1"
        }
        RUN_SHARD => {
            "SELECT p.owner_id FROM run_shards x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1"
        }
        RESULT => {
            "SELECT p.owner_id FROM results x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1"
        }
        _ => return None,
    })
}

fn owner_of(conn: &Connection, entity: &str, id: &str) -> Result<Option<String>, String> {
    let Some(sql) = owner_sql(entity) else {
        return Ok(None);
    };
    let owner: Option<Option<String>> = conn
        .query_row(sql, params![id], |r| r.get(0))
        .optional()
        .map_err(err)?;
    Ok(owner.flatten().filter(|o| !o.is_empty()))
}

pub(crate) fn table_for(entity: &str) -> Option<&'static str> {
    Some(match entity {
        RUN => "runs",
        RUN_ITEM => "run_items",
        UNLINKED_MAPPING => "unlinked_mappings",
        _ => return None,
    })
}

/// The lww payload of a run, run item or unlinked mapping (camelCase), its
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
                RUN => json!({
                    "id": s("id")?, "workspaceId": s("workspace_id")?, "projectId": s("project_id")?,
                    "runKey": s("run_key")?, "title": s("title")?, "trigger": s("trigger")?,
                    "sourceTool": s("source_tool")?, "sourceToolVersion": s("source_tool_version")?,
                    "testPlanId": s("test_plan_id")?, "cycleId": s("cycle_id")?,
                    "configurationId": s("configuration_id")?, "environment": s("environment")?,
                    "build": s("build")?, "commitSha": s("commit_sha")?, "branch": s("branch")?,
                    "repositoryUrl": s("repository_url")?, "ciUrl": s("ci_url")?,
                    "dataset": s("dataset")?, "context": json_col(r, "context")?,
                    "status": s("status")?, "startedAt": s("started_at")?,
                    "finishedAt": s("finished_at")?, "summary": json_col(r, "summary")?,
                    "data": json_col(r, "data")?, "createdAt": s("created_at")?,
                    "updatedAt": s("updated_at")?, "revision": i("revision")?,
                }),
                RUN_ITEM => json!({
                    "id": s("id")?, "workspaceId": s("workspace_id")?, "projectId": s("project_id")?,
                    "runId": s("run_id")?, "testCaseId": s("test_case_id")?,
                    "testCaseRevisionId": s("test_case_revision_id")?, "flowId": s("flow_id")?,
                    "exampleRowId": s("example_row_id")?, "exampleRow": i("example_row")?,
                    "configurationId": s("configuration_id")?, "assignee": s("assignee")?,
                    "position": i("position")?, "createdAt": s("created_at")?,
                    "updatedAt": s("updated_at")?, "revision": i("revision")?,
                }),
                _ => json!({
                    "id": s("id")?, "workspaceId": s("workspace_id")?, "projectId": s("project_id")?,
                    "testKey": s("test_key")?, "testCaseId": s("test_case_id")?,
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

fn pj(p: &Value, k: &str) -> String {
    object_or_empty(p.get(k)).to_string()
}

/// Overwrites the local row of a pulled lww document (`sync::write_doc`):
/// `created_by`/`updated_by` get the account it belongs to (FIX-06).
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
        RUN => conn.execute(
            "INSERT INTO runs (id, workspace_id, project_id, run_key, title, trigger, source_tool,
                    source_tool_version, test_plan_id, cycle_id, configuration_id, environment, build,
                    commit_sha, branch, repository_url, ci_url, dataset, context, status, started_at,
                    finished_at, summary, data, created_by, updated_by, created_at, updated_at,
                    revision, deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
                    ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?25, datetime('now'), datetime('now'), ?26, NULL)
             ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, run_key=excluded.run_key,
                    title=excluded.title, trigger=excluded.trigger, source_tool=excluded.source_tool,
                    source_tool_version=excluded.source_tool_version,
                    test_plan_id=excluded.test_plan_id, cycle_id=excluded.cycle_id,
                    configuration_id=excluded.configuration_id, environment=excluded.environment,
                    build=excluded.build, commit_sha=excluded.commit_sha, branch=excluded.branch,
                    repository_url=excluded.repository_url, ci_url=excluded.ci_url,
                    dataset=excluded.dataset, context=excluded.context, status=excluded.status,
                    started_at=excluded.started_at, finished_at=excluded.finished_at,
                    summary=excluded.summary, data=excluded.data, updated_by=excluded.updated_by,
                    updated_at=datetime('now'), revision=excluded.revision, deleted_at=NULL",
            params![
                id,
                workspace_id,
                ps(p, "projectId").unwrap_or_default(),
                ps(p, "runKey").unwrap_or_default(),
                ps(p, "title").unwrap_or_default(),
                ps(p, "trigger").unwrap_or("manual"),
                ps(p, "sourceTool"),
                ps(p, "sourceToolVersion"),
                ps(p, "testPlanId"),
                ps(p, "cycleId"),
                ps(p, "configurationId"),
                ps(p, "environment"),
                ps(p, "build"),
                ps(p, "commitSha"),
                ps(p, "branch"),
                ps(p, "repositoryUrl"),
                ps(p, "ciUrl"),
                ps(p, "dataset"),
                pj(p, "context"),
                ps(p, "status")
                    .filter(|s| ["in_progress", "completed", "aborted"].contains(s))
                    .unwrap_or("in_progress"),
                ps(p, "startedAt"),
                ps(p, "finishedAt"),
                pj(p, "summary"),
                pj(p, "data"),
                user,
                revision,
            ],
        ),
        RUN_ITEM => conn.execute(
            "INSERT INTO run_items (id, workspace_id, project_id, run_id, test_case_id,
                    test_case_revision_id, flow_id, example_row_id, example_row, configuration_id,
                    assignee, position, created_by, updated_by, created_at, updated_at, revision,
                    deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13, datetime('now'),
                    datetime('now'), ?14, NULL)
             ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, run_id=excluded.run_id,
                    test_case_id=excluded.test_case_id,
                    test_case_revision_id=excluded.test_case_revision_id, flow_id=excluded.flow_id,
                    example_row_id=excluded.example_row_id, example_row=excluded.example_row,
                    configuration_id=excluded.configuration_id, assignee=excluded.assignee,
                    position=excluded.position, updated_by=excluded.updated_by,
                    updated_at=datetime('now'), revision=excluded.revision, deleted_at=NULL",
            params![
                id,
                workspace_id,
                ps(p, "projectId").unwrap_or_default(),
                ps(p, "runId").unwrap_or_default(),
                ps(p, "testCaseId").unwrap_or_default(),
                ps(p, "testCaseRevisionId").unwrap_or_default(),
                ps(p, "flowId"),
                ps(p, "exampleRowId"),
                pi(p, "exampleRow"),
                ps(p, "configurationId"),
                ps(p, "assignee"),
                pi(p, "position").unwrap_or(0),
                user,
                revision,
            ],
        ),
        UNLINKED_MAPPING => conn.execute(
            "INSERT INTO unlinked_mappings (id, workspace_id, project_id, test_key, test_case_id,
                    created_by, updated_by, created_at, updated_at, revision, deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, datetime('now'), datetime('now'), ?7, NULL)
             ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, test_key=excluded.test_key,
                    test_case_id=excluded.test_case_id, updated_by=excluded.updated_by,
                    updated_at=datetime('now'), revision=excluded.revision, deleted_at=NULL",
            params![
                id,
                workspace_id,
                ps(p, "projectId").unwrap_or_default(),
                ps(p, "testKey").unwrap_or_default(),
                ps(p, "testCaseId"),
                user,
                revision,
            ],
        ),
        _ => return Ok(()),
    }
    .map_err(err)?;
    Ok(())
}

/// `sync_state` key that marks a run purged on this device: its shards and
/// results are never inserted again by a later pull.
fn purged_key(run_id: &str) -> String {
    format!("purged_run:{run_id}")
}

pub(crate) fn remember_purged(conn: &Connection, run_id: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO sync_state (key, value) VALUES (?1, datetime('now'))",
        params![purged_key(run_id)],
    )
    .map_err(err)?;
    Ok(())
}

fn is_purged(conn: &Connection, run_id: &str) -> Result<bool, String> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM sync_state WHERE key = ?1",
            params![purged_key(run_id)],
            |_| Ok(()),
        )
        .optional()
        .map_err(err)?
        .is_some())
}

/// `(entity, id)` of the shards and results of a run, for the purge.
pub(crate) fn appended_rows(
    conn: &Connection,
    run_id: &str,
) -> Result<Vec<(&'static str, String)>, String> {
    let mut out = Vec::new();
    for (entity, table) in [(RESULT, "results"), (RUN_SHARD, "run_shards")] {
        let mut stmt = conn
            .prepare(&format!("SELECT id FROM {table} WHERE run_id = ?1"))
            .map_err(err)?;
        let ids = stmt
            .query_map(params![run_id], |r| r.get::<_, String>(0))
            .map_err(err)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(err)?;
        out.extend(ids.into_iter().map(|id| (entity, id)));
    }
    Ok(out)
}

/// True while a shard or result of the run still has to reach the server.
pub(crate) fn has_pending_appends(conn: &Connection, run_id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM oplog o
          WHERE o.synced_at IS NULL AND o.payload NOT LIKE '%\"appendRejected\"%'
            AND ((o.entity = 'result' AND o.entity_id IN (SELECT id FROM results WHERE run_id = ?1))
              OR (o.entity = 'run_shard' AND o.entity_id IN (SELECT id FROM run_shards WHERE run_id = ?1)))
          LIMIT 1",
        params![run_id],
        |_| Ok(()),
    )
    .optional()
    .map_err(err)
    .map(|r| r.is_some())
}

/// The `run_shard` document pushed for a row.
pub fn shard_payload(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    conn.query_row("SELECT * FROM run_shards WHERE id = ?1", params![id], |r| {
        let s = |c: &str| r.get::<_, Option<String>>(c);
        let i = |c: &str| r.get::<_, Option<i64>>(c);
        Ok(json!({
            "id": s("id")?, "workspaceId": s("workspace_id")?, "projectId": s("project_id")?,
            "runId": s("run_id")?, "shardIndex": i("shard_index")?, "shardTotal": i("shard_total")?,
            "sourceFormat": s("source_format")?, "sourceFileSha256": s("source_file_sha256")?,
            "sourceAttachmentId": s("source_attachment_id")?, "formatVersion": s("format_version")?,
            "importedBy": s("imported_by")?, "importedAt": s("imported_at")?, "hlc": s("hlc")?,
        }))
    })
    .optional()
    .map_err(err)
}

/// Stores a pulled shard unless its id is here (or its run was purged here).
pub fn shard_insert_if_absent(conn: &Connection, _user: &str, p: &Value) -> Result<(), String> {
    let (Some(id), Some(project), Some(run), Some(format), Some(sha)) = (
        ps(p, "id"),
        ps(p, "projectId"),
        ps(p, "runId"),
        ps(p, "sourceFormat"),
        ps(p, "sourceFileSha256"),
    ) else {
        tracing::warn!("skipped a pulled run_shard without its required fields");
        return Ok(());
    };
    if is_purged(conn, run)? {
        return Ok(());
    }
    conn.execute(
        "INSERT OR IGNORE INTO run_shards (id, workspace_id, project_id, run_id, shard_index,
                shard_total, source_format, source_file_sha256, source_attachment_id, format_version,
                imported_by, imported_at, hlc)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            id,
            ensure_workspace(conn)?,
            project,
            run,
            pi(p, "shardIndex"),
            pi(p, "shardTotal"),
            format,
            sha,
            ps(p, "sourceAttachmentId"),
            ps(p, "formatVersion"),
            ps(p, "importedBy").unwrap_or_default(),
            ps(p, "importedAt").unwrap_or_default(),
            ps(p, "hlc").unwrap_or_default(),
        ],
    )
    .map_err(err)?;
    Ok(())
}

pub fn shard_owner(conn: &Connection, id: &str) -> Result<Option<String>, String> {
    owner_of(conn, RUN_SHARD, id)
}

/// The `result` document pushed for a row, with its step results inside.
pub fn result_payload(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    let row = conn
        .query_row("SELECT * FROM results WHERE id = ?1", params![id], |r| {
            let s = |c: &str| r.get::<_, Option<String>>(c);
            let i = |c: &str| r.get::<_, Option<i64>>(c);
            let example_values: Option<Value> =
                s("example_values")?.and_then(|v| serde_json::from_str(&v).ok());
            Ok(json!({
                "id": s("id")?, "workspaceId": s("workspace_id")?, "projectId": s("project_id")?,
                "runId": s("run_id")?, "shardId": s("shard_id")?, "runItemId": s("run_item_id")?,
                "testKey": s("test_key")?, "testCaseId": s("test_case_id")?,
                "testCaseRevisionId": s("test_case_revision_id")?,
                "caseRevision": i("case_revision")?, "caseKey": s("case_key")?,
                "flowId": s("flow_id")?, "exampleRowId": s("example_row_id")?,
                "exampleRow": i("example_row")?, "exampleValues": example_values,
                "configurationId": s("configuration_id")?,
                "configurationLabel": s("configuration_label")?, "attempt": i("attempt")?,
                "status": s("status")?, "rawStatus": s("raw_status")?,
                "durationMs": i("duration_ms")?, "startedAt": s("started_at")?,
                "finishedAt": s("finished_at")?, "errorMessage": s("error_message")?,
                "errorTrace": s("error_trace")?, "executedBy": s("executed_by")?,
                "externalId": s("external_id")?, "attributes": json_col(r, "attributes")?,
                "createdBy": s("created_by")?, "createdAt": s("created_at")?, "hlc": s("hlc")?,
            }))
        })
        .optional()
        .map_err(err)?;
    let Some(mut payload) = row else {
        return Ok(None);
    };
    let steps = steps_of(conn, id)?;
    payload["steps"] = serde_json::to_value(steps).map_err(|e| e.to_string())?;
    Ok(Some(payload))
}

/// Stores a pulled result and its step results unless its id is here (or its
/// run was purged here). A document without its required fields is skipped
/// (logged); the server already refuses those.
pub fn result_insert_if_absent(conn: &Connection, _user: &str, p: &Value) -> Result<(), String> {
    let status_ok = ps(p, "status").is_some_and(|s| RESULT_STATUSES.contains(&s));
    let (Some(id), Some(project), Some(run), Some(test_key), true) = (
        ps(p, "id"),
        ps(p, "projectId"),
        ps(p, "runId"),
        ps(p, "testKey"),
        status_ok,
    ) else {
        tracing::warn!("skipped a pulled result without its required fields");
        return Ok(());
    };
    if is_purged(conn, run)? {
        return Ok(());
    }
    let inserted = conn
        .execute(
            "INSERT OR IGNORE INTO results (id, workspace_id, project_id, run_id, shard_id,
                    run_item_id, test_key, test_case_id, test_case_revision_id, case_revision,
                    case_key, flow_id, example_row_id, example_row, example_values,
                    configuration_id, configuration_label, attempt, status, raw_status, duration_ms,
                    started_at, finished_at, error_message, error_trace, executed_by, external_id,
                    attributes, created_by, created_at, hlc)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
                    ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31)",
            params![
                id,
                ensure_workspace(conn)?,
                project,
                run,
                ps(p, "shardId"),
                ps(p, "runItemId"),
                test_key,
                ps(p, "testCaseId"),
                ps(p, "testCaseRevisionId"),
                pi(p, "caseRevision"),
                ps(p, "caseKey"),
                ps(p, "flowId"),
                ps(p, "exampleRowId"),
                pi(p, "exampleRow"),
                p.get("exampleValues")
                    .filter(|v| !v.is_null())
                    .map(Value::to_string),
                ps(p, "configurationId"),
                ps(p, "configurationLabel"),
                pi(p, "attempt").unwrap_or(0),
                ps(p, "status"),
                ps(p, "rawStatus"),
                pi(p, "durationMs"),
                ps(p, "startedAt"),
                ps(p, "finishedAt"),
                ps(p, "errorMessage"),
                ps(p, "errorTrace"),
                ps(p, "executedBy").unwrap_or_default(),
                ps(p, "externalId"),
                pj(p, "attributes"),
                ps(p, "createdBy").unwrap_or_default(),
                ps(p, "createdAt").unwrap_or_default(),
                ps(p, "hlc").unwrap_or_default(),
            ],
        )
        .map_err(err)?;
    if inserted == 0 {
        return Ok(());
    }
    let steps: Vec<StepResult> = p
        .get("steps")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .enumerate()
                .filter_map(|(n, s)| {
                    Some(StepResult {
                        id: ps(s, "id")
                            .map(String::from)
                            .unwrap_or_else(|| format!("{id}:{n}")),
                        position: pi(s, "position").unwrap_or(n as i64),
                        step_id: ps(s, "stepId").map(String::from),
                        keyword: ps(s, "keyword").map(String::from),
                        text: ps(s, "text")?.to_string(),
                        status: ps(s, "status")?.to_string(),
                        actual: ps(s, "actual").map(String::from),
                        duration_ms: pi(s, "durationMs"),
                        gherkin_line: pi(s, "gherkinLine"),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    insert_steps(conn, id, &steps)
}

pub fn result_owner(conn: &Connection, id: &str) -> Result<Option<String>, String> {
    owner_of(conn, RESULT, id)
}

/// Pending changes of this module held back, over every account of this
/// device, because its server has not listed `runs` yet (diagnostics).
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
        if crate::sync::server_takes_runs(conn, &user)? {
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
pub fn run_create(db: State<Db>, input: RunInput) -> Result<Option<Run>, String> {
    let id = db.with_tx(|conn| insert_run(conn, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_run(conn, &id, &input.user_id))
}

#[tauri::command]
pub fn run_update(db: State<Db>, id: String, input: RunInput) -> Result<Option<Run>, String> {
    db.with_tx(|conn| update_run(conn, &id, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_run(conn, &id, &input.user_id))
}

#[tauri::command]
pub fn run_get(db: State<Db>, id: String, user_id: String) -> Result<Option<Run>, String> {
    db.with_conn(|conn| get_run(conn, &id, &user_id))
}

#[tauri::command]
pub fn run_list(db: State<Db>, project_id: String, user_id: String) -> Result<Vec<Run>, String> {
    db.with_conn(|conn| list_runs(conn, &project_id, &user_id))
}

#[tauri::command]
pub fn run_items_add(
    db: State<Db>,
    run_id: String,
    user_id: String,
    items: Vec<RunItemInput>,
) -> Result<Vec<RunItem>, String> {
    db.with_tx(|conn| add_items(conn, &run_id, &user_id, &items))?;
    db.persist()?;
    db.with_conn(|conn| list_items(conn, &run_id, &user_id))
}

#[tauri::command]
pub fn run_items_list(
    db: State<Db>,
    run_id: String,
    user_id: String,
) -> Result<Vec<RunItem>, String> {
    db.with_conn(|conn| list_items(conn, &run_id, &user_id))
}

#[tauri::command]
pub fn result_record(db: State<Db>, input: ResultInput) -> Result<String, String> {
    let id = db.with_tx(|conn| record_result(conn, &input))?;
    db.persist()?;
    Ok(id)
}

#[tauri::command]
pub fn results_list(
    db: State<Db>,
    run_id: String,
    user_id: String,
) -> Result<Vec<ResultView>, String> {
    db.with_conn(|conn| list_results(conn, &run_id, &user_id))
}

#[tauri::command]
pub fn unlinked_mapping_set(
    db: State<Db>,
    project_id: String,
    test_key: String,
    test_case_id: Option<String>,
    user_id: String,
) -> Result<String, String> {
    let id = db.with_tx(|conn| {
        set_mapping(
            conn,
            &project_id,
            &test_key,
            test_case_id.as_deref(),
            &user_id,
        )
    })?;
    db.persist()?;
    Ok(id)
}
