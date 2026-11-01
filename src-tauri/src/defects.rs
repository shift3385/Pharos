//! Defects as their own entity (DEF-01, ADR-0016; design 0.2.0 §5 step 8).
//! Schema in migration 0029.
//!
//! - A **defect** has a visible key `DEF-001` (DAT-01, the project's key
//!   counter), severity (impact) apart from priority (urgency), the fixed
//!   lifecycle of `lifecycle.rs` with a resolution on `closed`/`rejected`,
//!   where it was found (run, build, environment) and the external key that
//!   INT-05 (Jira) fills.
//! - A **defect link** points it at a result, case, requirement, finding or
//!   session note, with a deterministic id (`ids.rs`).
//! - Its evidence are `attachments` with `owner_entity = 'defect'` in the
//!   evidence store (ADR-0014); one created from a result points at the same
//!   contents, without copying bytes.
//!
//! Every row carries `project_id` and belongs to the project's owner
//! (ADR-0020 rule 1), no longer to the card's `owner_id`. No foreign key to
//! `defects`: a pull can bring a link before its defect, so the links are
//! checked here. Sync: both entities are lww (`oplog::SYNCED`) and wait for a
//! server that lists `defects` (`sync::server_takes_defects`).
//!
//! The planner's defect cards became defects in migration 0029
//! (`migrate_planner_defects`); a card still pulled from an older server is
//! converted the same way (`apply_pulled_card`), with `convert::from_card`.

pub mod convert;
pub mod ids;
pub mod lifecycle;
#[cfg(test)]
mod tests;

use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::State;
#[cfg(test)]
use ts_rs::TS;
use uuid::Uuid;

use crate::db::{ensure_workspace, in_tx, Db};
use crate::downloads::{Downloads, SaveResult};
use crate::evidence;
use crate::journal::{self, Action, Actor, Audit, Change};
use crate::keys::{self, KeyKind};
use crate::project;
use lifecycle::{PRIORITIES, SEVERITIES, STATUSES, TARGET_KINDS};

pub(crate) const KEY_PREFIX: &str = "DEF-";
pub(crate) const KEY_DIGITS: usize = 3;

pub const DEFECT: &str = "defect";
pub const DEFECT_LINK: &str = "defect_link";

/// Entities of this module (both lww).
pub const ENTITIES: [&str; 2] = [DEFECT, DEFECT_LINK];

/// `ENTITIES` as an SQL list literal, for `entity IN (...)`.
pub(crate) fn entities_sql_list() -> String {
    ENTITIES
        .iter()
        .map(|e| format!("'{e}'"))
        .collect::<Vec<_>>()
        .join(",")
}

/// The server's limits (`DEFECT_PAYLOADS` in `sync.schemas.ts`), checked here
/// too: a document the server refuses would stay pending for ever. Lengths
/// count UTF-16 units, as zod does.
pub(crate) const MAX_TITLE: usize = 500;
pub(crate) const MAX_TEXT: usize = 20_000;
pub(crate) const MAX_SHORT: usize = 200;

fn within(field: &str, value: &str, max: usize) -> Result<(), String> {
    if value.encode_utf16().count() > max {
        return Err(format!("{field} is longer than {max} characters"));
    }
    Ok(())
}

fn err(e: rusqlite::Error) -> String {
    e.to_string()
}

fn text(v: &Option<String>) -> Option<String> {
    v.as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

// ---- types -----------------------------------------------------------------------

/// A defect as the module's screens read it, with its live links.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Defect {
    pub id: String,
    pub project_id: String,
    pub defect_key: String,
    pub title: String,
    pub description: String,
    pub steps_to_reproduce: String,
    pub expected: Option<String>,
    pub actual: Option<String>,
    pub severity: String,
    pub priority: String,
    pub status: String,
    pub resolution: Option<String>,
    pub found_in_run_id: Option<String>,
    pub found_in_build: Option<String>,
    pub found_in_environment: Option<String>,
    pub fixed_in_build: Option<String>,
    pub reporter: String,
    pub assignee: Option<String>,
    pub external_system: Option<String>,
    pub external_key: Option<String>,
    pub external_url: Option<String>,
    pub external_synced_at: Option<String>,
    #[cfg_attr(test, ts(type = "Record<string, unknown>"))]
    pub data: Value,
    pub created_at: String,
    pub updated_at: String,
    pub revision: i64,
    pub links: Vec<DefectLink>,
    /// Cases the defect reaches: linked directly or through a linked result
    /// (its case, or the case its `test_key` is mapped to). The matrix uses it.
    pub case_ids: Vec<String>,
}

/// A live link, with a label for the screens (the case or requirement key,
/// or `RUN-001 · ATS_001 #2` for a result).
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DefectLink {
    pub id: String,
    pub target_kind: String,
    pub target_id: String,
    pub label: Option<String>,
}

#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LinkTarget {
    pub target_kind: String,
    pub target_id: String,
}

/// Where a defect created from a failed result comes from (ADR-0016).
#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct FromResult {
    pub result_id: String,
    pub step_id: Option<String>,
}

/// What the editor sends. On update every editable field is replaced (the
/// editor sends its whole state); the key, project and reporter never change.
#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DefectInput {
    pub project_id: String,
    pub user_id: String,
    pub title: String,
    pub description: Option<String>,
    pub steps_to_reproduce: Option<String>,
    pub expected: Option<String>,
    pub actual: Option<String>,
    pub severity: Option<String>,
    pub priority: Option<String>,
    pub status: Option<String>,
    pub resolution: Option<String>,
    pub found_in_run_id: Option<String>,
    pub found_in_build: Option<String>,
    pub found_in_environment: Option<String>,
    pub fixed_in_build: Option<String>,
    pub assignee: Option<String>,
    pub external_system: Option<String>,
    pub external_key: Option<String>,
    pub external_url: Option<String>,
    #[cfg_attr(test, ts(type = "Record<string, unknown>"))]
    pub data: Option<Value>,
    /// Create only: links written with the defect.
    pub links: Option<Vec<LinkTarget>>,
    /// Create only: the failed result it comes from.
    pub from_result: Option<FromResult>,
}

/// A failed attempt a defect can be linked to or created from.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResultCandidate {
    pub result_id: String,
    pub run_id: String,
    pub run_key: String,
    pub run_title: String,
    pub test_case_id: Option<String>,
    pub case_key: Option<String>,
    pub test_key: String,
    pub attempt: i64,
    pub status: String,
    pub created_at: String,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DefectAttachment {
    pub id: String,
    pub name: String,
    pub mime: Option<String>,
    pub size: i64,
    /// The content expired by retention (ADR-0014): the row stays.
    pub purged: bool,
}

// ---- reads -----------------------------------------------------------------------

const SELECT_DEFECT: &str = "SELECT d.* FROM defects d JOIN projects p ON p.id = d.project_id";

fn map_defect(r: &rusqlite::Row) -> rusqlite::Result<Defect> {
    let data: String = r.get("data")?;
    Ok(Defect {
        id: r.get("id")?,
        project_id: r.get("project_id")?,
        defect_key: r.get("defect_key")?,
        title: r.get("title")?,
        description: r.get("description")?,
        steps_to_reproduce: r.get("steps_to_reproduce")?,
        expected: r.get("expected")?,
        actual: r.get("actual")?,
        severity: r.get("severity")?,
        priority: r.get("priority")?,
        status: r.get("status")?,
        resolution: r.get("resolution")?,
        found_in_run_id: r.get("found_in_run_id")?,
        found_in_build: r.get("found_in_build")?,
        found_in_environment: r.get("found_in_environment")?,
        fixed_in_build: r.get("fixed_in_build")?,
        reporter: r.get("reporter")?,
        assignee: r.get("assignee")?,
        external_system: r.get("external_system")?,
        external_key: r.get("external_key")?,
        external_url: r.get("external_url")?,
        external_synced_at: r.get("external_synced_at")?,
        data: serde_json::from_str(&data).unwrap_or_else(|_| json!({})),
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
        revision: r.get("revision")?,
        links: Vec::new(),
        case_ids: Vec::new(),
    })
}

/// Live links of the given defects (all of a project's with `?1` the project
/// and `?2` NULL, or one defect's with `?2` its id), labelled, in creation
/// order, grouped by defect: one query, whatever the number of defects.
fn links_by_defect(
    conn: &Connection,
    project_id: &str,
    defect_id: Option<&str>,
) -> Result<HashMap<String, Vec<DefectLink>>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT l.defect_id, l.id, l.target_kind, l.target_id,
                    CASE l.target_kind
                      WHEN 'test_case' THEN (SELECT c.scenario_id FROM test_cases c WHERE c.id = l.target_id)
                      WHEN 'requirement' THEN (SELECT q.requirement_key FROM requirements q WHERE q.id = l.target_id)
                      WHEN 'result' THEN (SELECT r.run_key || ' · ' || coalesce(x.case_key, x.test_key)
                                                 || ' #' || x.attempt
                                            FROM results x LEFT JOIN runs r ON r.id = x.run_id
                                           WHERE x.id = l.target_id)
                    END AS label
               FROM defect_links l
              WHERE l.project_id = ?1 AND (?2 IS NULL OR l.defect_id = ?2) AND l.deleted_at IS NULL
              ORDER BY l.created_at, l.rowid",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map(params![project_id, defect_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                DefectLink {
                    id: r.get(1)?,
                    target_kind: r.get(2)?,
                    target_id: r.get(3)?,
                    label: r.get(4)?,
                },
            ))
        })
        .map_err(err)?;
    let mut out: HashMap<String, Vec<DefectLink>> = HashMap::new();
    for row in rows {
        let (defect, link) = row.map_err(err)?;
        out.entry(defect).or_default().push(link);
    }
    Ok(out)
}

/// What a result is the execution of: its effective case, the revision and
/// the flow. **The one place this module reads it** (cases a defect reaches,
/// the candidates, the draft and the create from a result): a manual result
/// carries the link in its content, an imported one gets it at read time
/// (step 9, `runs/link.rs::resolve`), so switching to that resolver is a
/// change here only. Today: the result's own case, else the project's
/// mapping of its `test_key` (as `runs::list_results`).
pub(crate) struct ResultLink {
    pub case_id: Option<String>,
    pub revision_id: Option<String>,
    pub flow_id: Option<String>,
}

/// `ResultLink` of many results in one query, by result id.
pub(crate) fn result_links(
    conn: &Connection,
    result_ids: &[String],
) -> Result<HashMap<String, ResultLink>, String> {
    if result_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let mut stmt = conn
        .prepare(
            "SELECT x.id,
                    coalesce(x.test_case_id,
                             (SELECT m.test_case_id FROM unlinked_mappings m
                               WHERE m.project_id = x.project_id AND m.test_key = x.test_key
                                 AND m.deleted_at IS NULL
                               ORDER BY m.updated_at DESC, m.rowid DESC LIMIT 1)),
                    x.test_case_revision_id, x.flow_id
               FROM results x WHERE x.id IN (SELECT value FROM json_each(?1))",
        )
        .map_err(err)?;
    let ids = serde_json::to_string(result_ids).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![ids], |r| {
            Ok((
                r.get::<_, String>(0)?,
                ResultLink {
                    case_id: r.get(1)?,
                    revision_id: r.get(2)?,
                    flow_id: r.get(3)?,
                },
            ))
        })
        .map_err(err)?;
    rows.collect::<rusqlite::Result<_>>().map_err(err)
}

/// `result_links` of one result.
pub(crate) fn result_link(
    conn: &Connection,
    result_id: &str,
) -> Result<Option<ResultLink>, String> {
    Ok(result_links(conn, &[result_id.to_string()])?.remove(result_id))
}

/// Attaches their links to defects and derives the cases each reaches:
/// direct case links, and the case of each linked result (`result_links`),
/// in link order, once each. Two queries for any number of defects.
fn attach_links(
    conn: &Connection,
    project_id: &str,
    one: Option<&str>,
    defects: &mut [Defect],
) -> Result<(), String> {
    let mut links = links_by_defect(conn, project_id, one)?;
    let result_ids: Vec<String> = links
        .values()
        .flatten()
        .filter(|l| l.target_kind == "result")
        .map(|l| l.target_id.clone())
        .collect();
    let resolved = result_links(conn, &result_ids)?;
    for d in defects.iter_mut() {
        d.links = links.remove(&d.id).unwrap_or_default();
        let mut cases: Vec<String> = Vec::new();
        for l in &d.links {
            let case = match l.target_kind.as_str() {
                "test_case" => Some(l.target_id.clone()),
                "result" => resolved.get(&l.target_id).and_then(|r| r.case_id.clone()),
                _ => None,
            };
            if let Some(c) = case.filter(|c| !cases.contains(c)) {
                cases.push(c);
            }
        }
        d.case_ids = cases;
    }
    Ok(())
}

pub(crate) fn get_defect(
    conn: &Connection,
    id: &str,
    user: &str,
) -> Result<Option<Defect>, String> {
    let found = conn
        .query_row(
            &format!(
                "{SELECT_DEFECT} WHERE d.id = ?1 AND p.owner_id = ?2 AND d.deleted_at IS NULL \
                 AND p.deleted_at IS NULL"
            ),
            params![id, user],
            map_defect,
        )
        .optional()
        .map_err(err)?;
    let Some(d) = found else {
        return Ok(None);
    };
    let project = d.project_id.clone();
    let mut one = [d];
    attach_links(conn, &project, Some(id), &mut one)?;
    let [d] = one;
    Ok(Some(d))
}

pub(crate) fn list_defects(
    conn: &Connection,
    project_id: &str,
    user: &str,
) -> Result<Vec<Defect>, String> {
    let mut defects: Vec<Defect> = {
        let mut stmt = conn
            .prepare(&format!(
                "{SELECT_DEFECT} WHERE d.project_id = ?1 AND p.owner_id = ?2 \
                 AND d.deleted_at IS NULL AND p.deleted_at IS NULL \
                 ORDER BY d.created_at DESC, d.rowid DESC"
            ))
            .map_err(err)?;
        let rows = stmt
            .query_map(params![project_id, user], map_defect)
            .map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)?
    };
    attach_links(conn, project_id, None, &mut defects)?;
    Ok(defects)
}

/// The project's attempts that did not pass, newest first, for the «link a
/// result» picker.
pub(crate) fn result_candidates(
    conn: &Connection,
    project_id: &str,
    user: &str,
) -> Result<Vec<ResultCandidate>, String> {
    if !project::owns(conn, project_id, user)? {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "SELECT x.id, x.run_id, coalesce(r.run_key, ''), coalesce(r.title, ''),
                    NULL, x.case_key, x.test_key, x.attempt, x.status, x.created_at
               FROM results x LEFT JOIN runs r ON r.id = x.run_id
              WHERE x.project_id = ?1 AND x.status IN ('failed', 'blocked', 'other')
                AND (r.id IS NULL OR r.deleted_at IS NULL)
              ORDER BY x.created_at DESC, x.rowid DESC LIMIT 500",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map(params![project_id], |r| {
            Ok(ResultCandidate {
                result_id: r.get(0)?,
                run_id: r.get(1)?,
                run_key: r.get(2)?,
                run_title: r.get(3)?,
                test_case_id: r.get(4)?,
                case_key: r.get(5)?,
                test_key: r.get(6)?,
                attempt: r.get(7)?,
                status: r.get(8)?,
                created_at: r.get(9)?,
            })
        })
        .map_err(err)?;
    let mut out: Vec<ResultCandidate> = rows.collect::<rusqlite::Result<_>>().map_err(err)?;
    let ids: Vec<String> = out.iter().map(|c| c.result_id.clone()).collect();
    let mut resolved = result_links(conn, &ids)?;
    for c in &mut out {
        c.test_case_id = resolved.remove(&c.result_id).and_then(|l| l.case_id);
    }
    Ok(out)
}

// ---- writes ----------------------------------------------------------------------

/// A live defect of a project the user owns: (project, status, revision).
fn owned(conn: &Connection, id: &str, user: &str) -> Result<(String, String, i64), String> {
    conn.query_row(
        "SELECT d.project_id, d.status, d.revision FROM defects d JOIN projects p ON p.id = d.project_id
          WHERE d.id = ?1 AND p.owner_id = ?2 AND d.deleted_at IS NULL AND p.deleted_at IS NULL",
        params![id, user],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )
    .optional()
    .map_err(err)?
    .ok_or_else(|| "defect not found".to_string())
}

fn pick<'a>(
    value: Option<&'a str>,
    allowed: &[&str],
    default: &'a str,
    what: &str,
) -> Result<&'a str, String> {
    match value.filter(|v| !v.is_empty()) {
        None => Ok(default),
        Some(v) if allowed.contains(&v) => Ok(v),
        Some(v) => Err(format!("unknown defect {what}: {v}")),
    }
}

/// The checked editable fields of an input.
struct Fields {
    title: String,
    description: String,
    steps: String,
    severity: String,
    priority: String,
    data: Value,
}

fn check_fields(input: &DefectInput) -> Result<Fields, String> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return Err("title is required".into());
    }
    within("title", &title, MAX_TITLE)?;
    let description = input.description.clone().unwrap_or_default();
    let steps = input.steps_to_reproduce.clone().unwrap_or_default();
    for (name, v) in [
        ("description", Some(&description)),
        ("stepsToReproduce", Some(&steps)),
        ("expected", input.expected.as_ref()),
        ("actual", input.actual.as_ref()),
    ] {
        if let Some(v) = v {
            within(name, v, MAX_TEXT)?;
        }
    }
    for (name, v) in [
        ("foundInBuild", &input.found_in_build),
        ("foundInEnvironment", &input.found_in_environment),
        ("fixedInBuild", &input.fixed_in_build),
        ("assignee", &input.assignee),
        ("externalSystem", &input.external_system),
        ("externalKey", &input.external_key),
    ] {
        if let Some(v) = v {
            within(name, v, MAX_SHORT)?;
        }
    }
    if let Some(url) = &input.external_url {
        within("externalUrl", url, 2000)?;
    }
    let data = match &input.data {
        None | Some(Value::Null) => json!({}),
        Some(Value::Object(o)) => Value::Object(o.clone()),
        Some(_) => return Err("data must be an object".into()),
    };
    Ok(Fields {
        title,
        description,
        steps,
        severity: pick(input.severity.as_deref(), &SEVERITIES, "major", "severity")?.into(),
        priority: pick(input.priority.as_deref(), &PRIORITIES, "medium", "priority")?.into(),
        data,
    })
}

/// A target of the same project the link may point at. Results are
/// append-only and may be pulled before their run, so only their project is
/// checked; findings and session notes have no table before 0.4.0/0.5.0.
fn check_target(conn: &Connection, project_id: &str, t: &LinkTarget) -> Result<(), String> {
    if !TARGET_KINDS.contains(&t.target_kind.as_str()) {
        return Err(format!("unknown link target: {}", t.target_kind));
    }
    let table = match t.target_kind.as_str() {
        "test_case" => "test_cases",
        "requirement" => "requirements",
        "result" => "results",
        _ => return Err(format!("{} links arrive with 0.4.0/0.5.0", t.target_kind)),
    };
    let live = if table == "results" {
        ""
    } else {
        " AND deleted_at IS NULL"
    };
    let found = conn
        .query_row(
            &format!("SELECT 1 FROM {table} WHERE id = ?1 AND project_id = ?2{live}"),
            params![t.target_id, project_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(err)?;
    found.ok_or_else(|| format!("{} not found: {}", t.target_kind, t.target_id))
}

/// Writes (or revives) one link. Returns false if it was already live.
fn put_link(
    conn: &Connection,
    defect_id: &str,
    project_id: &str,
    t: &LinkTarget,
    user: &str,
    audit: Audit,
) -> Result<bool, String> {
    let id = ids::link_id(defect_id, &t.target_kind, &t.target_id);
    let existing: Option<(Option<String>, i64)> = conn
        .query_row(
            "SELECT deleted_at, revision FROM defect_links WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(err)?;
    let (action, revision) = match existing {
        Some((None, _)) => return Ok(false),
        Some((Some(_), rev)) => {
            conn.execute(
                "UPDATE defect_links SET deleted_at = NULL, updated_by = ?2,
                        updated_at = datetime('now'), revision = ?3 WHERE id = ?1",
                params![id, user, rev + 1],
            )
            .map_err(err)?;
            (Action::Update, rev + 1)
        }
        None => {
            conn.execute(
                "INSERT INTO defect_links (id, workspace_id, project_id, defect_id, target_kind,
                        target_id, created_by, updated_by, created_at, updated_at, revision)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, datetime('now'), datetime('now'), 1)",
                params![
                    id,
                    ensure_workspace(conn)?,
                    project_id,
                    defect_id,
                    t.target_kind,
                    t.target_id,
                    user
                ],
            )
            .map_err(err)?;
            (Action::Create, 1)
        }
    };
    let mut change = Change::new(
        DEFECT_LINK,
        &id,
        action,
        Actor::user(user),
        "upsert",
        revision,
        user,
    );
    change.audit = audit;
    journal::record(conn, change)?;
    Ok(true)
}

/// Soft-deletes one live link. Returns false if there was none.
fn drop_link(conn: &Connection, id: &str, user: &str, audit: Audit) -> Result<bool, String> {
    let before = journal::snapshot(conn, DEFECT_LINK, id)?;
    let changed = conn
        .execute(
            "UPDATE defect_links SET deleted_at = datetime('now'), updated_by = ?2,
                    updated_at = datetime('now'), revision = revision + 1
              WHERE id = ?1 AND deleted_at IS NULL",
            params![id, user],
        )
        .map_err(err)?;
    if changed == 0 {
        return Ok(false);
    }
    let mut change = Change::new(
        DEFECT_LINK,
        id,
        Action::Delete,
        Actor::user(user),
        "delete",
        0,
        user,
    )
    .before(before);
    change.audit = audit;
    journal::record(conn, change)?;
    Ok(true)
}

/// Creates a defect: its key from the project's counter (DAT-01), status
/// `new` unless another valid starting one is given, the links it brings and,
/// from a failed result, that result's evidence (same contents, ADR-0014).
pub(crate) fn insert_defect(conn: &Connection, input: &DefectInput) -> Result<String, String> {
    let user = &input.user_id;
    if !project::owns(conn, &input.project_id, user)? {
        return Err("project not found".into());
    }
    let f = check_fields(input)?;
    let status = pick(input.status.as_deref(), &STATUSES, "new", "status")?;
    let resolution = lifecycle::check(status, status, input.resolution.as_deref())?;
    let mut links: Vec<LinkTarget> = input.links.clone().unwrap_or_default();
    if let Some(from) = &input.from_result {
        let in_project = conn
            .query_row(
                "SELECT 1 FROM results WHERE id = ?1 AND project_id = ?2",
                params![from.result_id, input.project_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(err)?
            .is_some();
        if !in_project {
            return Err("result not found".into());
        }
        // Only the result is linked: its case is derived through it
        // (`result_link`), so a later relink of the result never leaves a
        // stale copy of it here.
        links.insert(
            0,
            LinkTarget {
                target_kind: "result".into(),
                target_id: from.result_id.clone(),
            },
        );
    }
    for t in &links {
        check_target(conn, &input.project_id, t)?;
    }
    let id = Uuid::new_v4().to_string();
    let key = keys::allocate(
        conn,
        KeyKind::Defect,
        &input.project_id,
        KEY_PREFIX,
        KEY_DIGITS,
    )?;
    conn.execute(
        "INSERT INTO defects (id, workspace_id, project_id, defect_key, title, description,
                steps_to_reproduce, expected, actual, severity, priority, status, resolution,
                found_in_run_id, found_in_build, found_in_environment, fixed_in_build, reporter,
                assignee, external_system, external_key, external_url, data, created_by,
                updated_by, created_at, updated_at, revision)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
                ?19, ?20, ?21, ?22, ?23, ?18, ?18, datetime('now'), datetime('now'), 1)",
        params![
            id,
            ensure_workspace(conn)?,
            input.project_id,
            key,
            f.title,
            f.description,
            f.steps,
            text(&input.expected),
            text(&input.actual),
            f.severity,
            f.priority,
            status,
            resolution,
            text(&input.found_in_run_id),
            text(&input.found_in_build),
            text(&input.found_in_environment),
            text(&input.fixed_in_build),
            user,
            text(&input.assignee),
            text(&input.external_system),
            text(&input.external_key),
            text(&input.external_url),
            f.data.to_string(),
        ],
    )
    .map_err(err)?;
    journal::record(
        conn,
        Change::new(
            DEFECT,
            &id,
            Action::Create,
            Actor::user(user),
            "upsert",
            1,
            user,
        ),
    )?;
    // The links are part of the create: one event for the defect.
    for t in &links {
        put_link(conn, &id, &input.project_id, t, user, Audit::Folded)?;
    }
    if let Some(from) = &input.from_result {
        copy_result_evidence(conn, &id, &input.project_id, &from.result_id, user)?;
    }
    Ok(id)
}

/// Replaces the editable fields. A status change follows the lifecycle; the
/// resolution goes only with `closed`/`rejected`.
pub(crate) fn update_defect(
    conn: &Connection,
    id: &str,
    input: &DefectInput,
) -> Result<(), String> {
    let user = &input.user_id;
    let (_, status, revision) = owned(conn, id, user)?;
    let f = check_fields(input)?;
    let to = input
        .status
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or(status.clone());
    let resolution = lifecycle::check(&status, &to, input.resolution.as_deref())?;
    let before = journal::snapshot(conn, DEFECT, id)?;
    conn.execute(
        "UPDATE defects SET title = ?2, description = ?3, steps_to_reproduce = ?4, expected = ?5,
                actual = ?6, severity = ?7, priority = ?8, status = ?9, resolution = ?10,
                found_in_run_id = ?11, found_in_build = ?12, found_in_environment = ?13,
                fixed_in_build = ?14, assignee = ?15, external_system = ?16, external_key = ?17,
                external_url = ?18, data = ?19, updated_by = ?20, updated_at = datetime('now'),
                revision = ?21
          WHERE id = ?1",
        params![
            id,
            f.title,
            f.description,
            f.steps,
            text(&input.expected),
            text(&input.actual),
            f.severity,
            f.priority,
            to,
            resolution,
            text(&input.found_in_run_id),
            text(&input.found_in_build),
            text(&input.found_in_environment),
            text(&input.fixed_in_build),
            text(&input.assignee),
            text(&input.external_system),
            text(&input.external_key),
            text(&input.external_url),
            f.data.to_string(),
            user,
            revision + 1,
        ],
    )
    .map_err(err)?;
    journal::record(
        conn,
        Change::new(
            DEFECT,
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

/// The board's move: a status change along the lifecycle, with the
/// resolution `closed`/`rejected` need and, optionally, the fixing build.
pub(crate) fn transition(
    conn: &Connection,
    id: &str,
    user: &str,
    status: &str,
    resolution: Option<&str>,
    fixed_in_build: Option<&str>,
) -> Result<(), String> {
    let (_, from, revision) = owned(conn, id, user)?;
    let resolution = lifecycle::check(&from, status, resolution)?;
    if let Some(b) = fixed_in_build {
        within("fixedInBuild", b, MAX_SHORT)?;
    }
    if from == status && fixed_in_build.is_none() {
        return Ok(());
    }
    let before = journal::snapshot(conn, DEFECT, id)?;
    conn.execute(
        "UPDATE defects SET status = ?2, resolution = ?3,
                fixed_in_build = coalesce(nullif(trim(?4), ''), fixed_in_build),
                updated_by = ?5, updated_at = datetime('now'), revision = ?6
          WHERE id = ?1",
        params![id, status, resolution, fixed_in_build, user, revision + 1],
    )
    .map_err(err)?;
    journal::record(
        conn,
        Change::new(
            DEFECT,
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

/// Soft-deletes a defect with its links (one event, for the defect) and
/// releases its attachments, whose files go with the next collection.
pub(crate) fn delete_defect(conn: &Connection, id: &str, user: &str) -> Result<(), String> {
    owned(conn, id, user)?;
    let before = journal::snapshot(conn, DEFECT, id)?;
    let link_ids: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT id FROM defect_links WHERE defect_id = ?1 AND deleted_at IS NULL")
            .map_err(err)?;
        let rows = stmt.query_map(params![id], |r| r.get(0)).map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)?
    };
    for link in &link_ids {
        drop_link(conn, link, user, Audit::Folded)?;
    }
    conn.execute(
        "UPDATE defects SET deleted_at = datetime('now'), updated_by = ?2 WHERE id = ?1",
        params![id, user],
    )
    .map_err(err)?;
    let shas: Vec<String> = {
        let mut stmt = conn
            .prepare(
                "SELECT sha256 FROM attachments WHERE owner_entity = 'defect' AND owner_id = ?1
                   AND deleted_at IS NULL",
            )
            .map_err(err)?;
        let rows = stmt.query_map(params![id], |r| r.get(0)).map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)?
    };
    conn.execute(
        "UPDATE attachments SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_by = ?2,
                revision = revision + 1
          WHERE owner_entity = 'defect' AND owner_id = ?1 AND deleted_at IS NULL",
        params![id, user],
    )
    .map_err(err)?;
    for sha in shas {
        evidence::release(conn, &sha)?;
    }
    journal::record(
        conn,
        Change::new(
            DEFECT,
            id,
            Action::Delete,
            Actor::user(user),
            "delete",
            0,
            user,
        )
        .before(before)
        .summary(json!({ "links": link_ids.len() })),
    )
}

/// Links (or unlinks) a defect and a target of its project: `link`/`unlink`
/// events on the defect, the link row journaled for the sync. Linking twice
/// or unlinking what is not linked changes nothing.
pub(crate) fn set_link(
    conn: &Connection,
    defect_id: &str,
    user: &str,
    target: &LinkTarget,
    linked: bool,
) -> Result<(), String> {
    let (project_id, _, _) = owned(conn, defect_id, user)?;
    let fact = json!({ "targetKind": target.target_kind, "targetId": target.target_id });
    let mut changes = Map::new();
    let action = if linked {
        check_target(conn, &project_id, target)?;
        if !put_link(conn, defect_id, &project_id, target, user, Audit::Folded)? {
            return Ok(());
        }
        changes.insert("link".into(), json!([null, fact]));
        Action::Link
    } else {
        let id = ids::link_id(defect_id, &target.target_kind, &target.target_id);
        if !drop_link(conn, &id, user, Audit::Folded)? {
            return Ok(());
        }
        changes.insert("link".into(), json!([fact, null]));
        Action::Unlink
    };
    journal::record_event(
        conn,
        Actor::user(user),
        action,
        DEFECT,
        defect_id,
        changes,
        None,
    )
}

// ---- from a result -----------------------------------------------------------------

/// What `defect_create` would get from a failed result (ADR-0016): the steps
/// of the executed revision, what was obtained, the run's build and
/// environment and the links. Nothing is written; the editor shows it.
pub(crate) fn draft_from_result(
    conn: &Connection,
    result_id: &str,
    step_id: Option<&str>,
    user: &str,
) -> Result<DefectInput, String> {
    type Row = (
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        String,
    );
    let row: Option<Row> = conn
        .query_row(
            "SELECT x.project_id, x.run_id, NULL, NULL, x.case_key, NULL, x.error_message,
                    x.test_key
               FROM results x JOIN projects p ON p.id = x.project_id
              WHERE x.id = ?1 AND p.owner_id = ?2 AND p.deleted_at IS NULL",
            params![result_id, user],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                ))
            },
        )
        .optional()
        .map_err(err)?;
    let Some((project_id, run_id, _, _, case_key, _, message, test_key)) = row else {
        return Err("result not found".into());
    };
    let link = result_link(conn, result_id)?;
    let revision_id = link.as_ref().and_then(|l| l.revision_id.clone());
    let flow_id = link.as_ref().and_then(|l| l.flow_id.clone());
    let run: Option<(Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT build, environment FROM runs WHERE id = ?1",
            params![run_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(err)?;
    let (build, environment) = run.unwrap_or((None, None));
    let revision: Option<(String, String)> = match &revision_id {
        Some(rid) => conn
            .query_row(
                "SELECT title, data FROM test_case_revisions WHERE id = ?1",
                params![rid],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(err)?,
        None => None,
    };
    let (case_title, data) = match revision {
        Some((t, d)) => (
            Some(t),
            serde_json::from_str::<Value>(&d).unwrap_or(Value::Null),
        ),
        None => (None, Value::Null),
    };
    let steps = revision_steps(&data, flow_id.as_deref());
    let numbered = steps
        .iter()
        .enumerate()
        .map(|(i, s)| format!("{}. {}", i + 1, s.1))
        .collect::<Vec<_>>()
        .join("\n");
    // The failed step: the one asked for, else the first that did not pass.
    let step_row: Option<(Option<String>, String, Option<String>)> = conn
        .query_row(
            "SELECT step_id, text, actual FROM step_results
              WHERE result_id = ?1 AND (?2 IS NULL AND status NOT IN ('passed', 'skipped')
                                         OR step_id = ?2)
              ORDER BY position LIMIT 1",
            params![result_id, step_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(err)?;
    let expected = step_row
        .as_ref()
        .and_then(|(sid, _, _)| sid.as_deref())
        .and_then(|sid| steps.iter().find(|s| s.0.as_deref() == Some(sid)))
        .and_then(|s| s.2.clone());
    let actual = step_row
        .as_ref()
        .and_then(|(_, _, a)| a.clone())
        .filter(|a| !a.trim().is_empty())
        .or(message);
    let label = case_key.clone().unwrap_or(test_key);
    let what = step_row
        .as_ref()
        .map(|s| s.1.clone())
        .or(case_title)
        .unwrap_or_default();
    let mut title = if what.is_empty() {
        label
    } else {
        format!("{label} · {what}")
    };
    if title.encode_utf16().count() > MAX_TITLE {
        title = title.chars().take(MAX_TITLE / 2).collect();
    }
    Ok(DefectInput {
        project_id,
        user_id: user.to_string(),
        title,
        steps_to_reproduce: Some(numbered),
        expected,
        actual,
        found_in_run_id: Some(run_id),
        found_in_build: build,
        found_in_environment: environment,
        from_result: Some(FromResult {
            result_id: result_id.to_string(),
            step_id: step_row.and_then(|s| s.0).or(step_id.map(String::from)),
        }),
        ..Default::default()
    })
}

/// (id, text, expected) of the steps a flow of a revision runs: the main flow
/// is preconditions, background and steps; a flow of an advanced case is the
/// background and its own lists (as `runs::RevisionShape`).
fn revision_steps(
    data: &Value,
    flow_id: Option<&str>,
) -> Vec<(Option<String>, String, Option<String>)> {
    let list = |v: Option<&Value>| -> Vec<(Option<String>, String, Option<String>)> {
        v.and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(|el| {
                (
                    el.get("id").and_then(Value::as_str).map(String::from),
                    crate::steps::step_text(el),
                    el.get("expected")
                        .and_then(Value::as_str)
                        .filter(|e| !e.is_empty())
                        .map(String::from),
                )
            })
            .collect()
    };
    let flow = flow_id.and_then(|f| {
        data.get("flows")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .find(|x| x.get("id").and_then(Value::as_str) == Some(f))
    });
    let mut out = Vec::new();
    match flow {
        Some(flow) => {
            out.extend(list(data.get("background")));
            out.extend(list(flow.get("preconditions")));
            out.extend(list(flow.get("steps")));
        }
        None => {
            out.extend(list(data.get("preconditions")));
            out.extend(list(data.get("background")));
            out.extend(list(data.get("steps")));
        }
    }
    out
}

/// New attachments of the defect for every live attachment of the result and
/// its step results: same contents (sha256), no bytes copied (ADR-0014).
fn copy_result_evidence(
    conn: &Connection,
    defect_id: &str,
    project_id: &str,
    result_id: &str,
    user: &str,
) -> Result<(), String> {
    type Att = (String, i64, Option<String>, String, String);
    let found: Vec<Att> = {
        let mut stmt = conn
            .prepare(
                "SELECT a.sha256, a.size, a.mime, a.name, a.kind FROM attachments a
                  WHERE a.deleted_at IS NULL AND a.blob_purged_at IS NULL
                    AND ((a.owner_entity = 'result' AND a.owner_id = ?1)
                         OR (a.owner_entity = 'step_result'
                             AND a.owner_id IN (SELECT id FROM step_results WHERE result_id = ?1)))
                  ORDER BY a.created_at, a.rowid",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map(params![result_id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)?
    };
    let workspace_id = ensure_workspace(conn)?;
    for (sha256, size, mime, name, kind) in found {
        let id = Uuid::new_v4().to_string();
        evidence::insert_attachment(
            conn,
            &evidence::AttachmentRow {
                id: &id,
                workspace_id: &workspace_id,
                project_id,
                owner_entity: DEFECT,
                owner_id: defect_id,
                name: &name,
                mime: mime.as_deref(),
                kind: &kind,
                sha256: &sha256,
                size,
                user,
            },
        )?;
    }
    Ok(())
}

// ---- attachments -------------------------------------------------------------------

pub(crate) fn list_attachments(
    conn: &Connection,
    defect_id: &str,
    user: &str,
) -> Result<Vec<DefectAttachment>, String> {
    if owned(conn, defect_id, user).is_err() {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "SELECT id, name, mime, size, blob_purged_at IS NOT NULL FROM attachments
              WHERE owner_entity = 'defect' AND owner_id = ?1 AND deleted_at IS NULL
              ORDER BY created_at, rowid",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map(params![defect_id], |r| {
            Ok(DefectAttachment {
                id: r.get(0)?,
                name: r.get(1)?,
                mime: r.get(2)?,
                size: r.get(3)?,
                purged: r.get(4)?,
            })
        })
        .map_err(err)?;
    rows.collect::<rusqlite::Result<_>>().map_err(err)
}

/// A live attachment of a live defect the user owns: (defect, name, mime,
/// size, sha256, purged).
type OwnedAttachment = (String, String, Option<String>, i64, String, bool);

fn owned_attachment(
    conn: &Connection,
    id: &str,
    user: &str,
) -> Result<Option<OwnedAttachment>, String> {
    conn.query_row(
        "SELECT a.owner_id, a.name, a.mime, a.size, a.sha256, a.blob_purged_at IS NOT NULL
           FROM attachments a JOIN defects d ON d.id = a.owner_id
           JOIN projects p ON p.id = d.project_id
          WHERE a.id = ?1 AND a.owner_entity = 'defect' AND a.deleted_at IS NULL
            AND d.deleted_at IS NULL AND p.owner_id = ?2 AND p.deleted_at IS NULL",
        params![id, user],
        |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
            ))
        },
    )
    .optional()
    .map_err(err)
}

/// Attaches stored content to a defect the user owns. Attachments do not sync
/// yet (SYNC-04b, ADR-0014): a `link` event without an oplog row.
pub(crate) fn add_attachment(
    conn: &Connection,
    id: &str,
    defect_id: &str,
    user: &str,
    name: &str,
    mime: Option<&str>,
    stored: &evidence::Stored,
) -> Result<(), String> {
    let (project_id, _, _) = owned(conn, defect_id, user)?;
    evidence::record_blob(conn, stored, mime)?;
    evidence::insert_attachment(
        conn,
        &evidence::AttachmentRow {
            id,
            workspace_id: &ensure_workspace(conn)?,
            project_id: &project_id,
            owner_entity: DEFECT,
            owner_id: defect_id,
            name,
            mime,
            kind: "evidence",
            sha256: &stored.sha256,
            size: stored.size as i64,
            user,
        },
    )?;
    let mut changes = Map::new();
    changes.insert(
        "attachment".into(),
        json!([
            null,
            evidence::attachment_fact(id, name, mime, stored.size as i64, &stored.sha256)
        ]),
    );
    journal::record_event(
        conn,
        Actor::user(user),
        Action::Link,
        DEFECT,
        defect_id,
        changes,
        None,
    )
}

pub(crate) fn delete_attachment(conn: &Connection, id: &str, user: &str) -> Result<(), String> {
    let Some((defect_id, name, mime, size, sha256, _)) = owned_attachment(conn, id, user)? else {
        return Err("attachment not found".into());
    };
    conn.execute(
        "UPDATE attachments SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_by = ?2,
                revision = revision + 1 WHERE id = ?1",
        params![id, user],
    )
    .map_err(err)?;
    evidence::release(conn, &sha256)?;
    let mut changes = Map::new();
    changes.insert(
        "attachment".into(),
        json!([
            evidence::attachment_fact(id, &name, mime.as_deref(), size, &sha256),
            null
        ]),
    );
    journal::record_event(
        conn,
        Actor::user(user),
        Action::Unlink,
        DEFECT,
        &defect_id,
        changes,
        None,
    )
}

// ---- sync ------------------------------------------------------------------------

pub(crate) fn table_for(entity: &str) -> Option<&'static str> {
    Some(match entity {
        DEFECT => "defects",
        DEFECT_LINK => "defect_links",
        _ => return None,
    })
}

/// Owner of a defect or link: its project's owner (ADR-0020 rule 1).
pub(crate) fn owner_sql(entity: &str) -> Option<&'static str> {
    Some(match entity {
        DEFECT => "SELECT p.owner_id FROM defects x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1",
        DEFECT_LINK => {
            "SELECT p.owner_id FROM defect_links x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1"
        }
        _ => return None,
    })
}

/// The lww payload of a defect or link (camelCase), its revision and deleted
/// flag. None if the row is gone.
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
            let payload = if entity == DEFECT {
                let data: String = r.get("data")?;
                json!({
                    "id": s("id")?, "workspaceId": s("workspace_id")?, "projectId": s("project_id")?,
                    "defectKey": s("defect_key")?, "title": s("title")?,
                    "description": s("description")?, "stepsToReproduce": s("steps_to_reproduce")?,
                    "expected": s("expected")?, "actual": s("actual")?, "severity": s("severity")?,
                    "priority": s("priority")?, "status": s("status")?,
                    "resolution": s("resolution")?, "foundInRunId": s("found_in_run_id")?,
                    "foundInBuild": s("found_in_build")?,
                    "foundInEnvironment": s("found_in_environment")?,
                    "fixedInBuild": s("fixed_in_build")?, "reporter": s("reporter")?,
                    "assignee": s("assignee")?, "externalSystem": s("external_system")?,
                    "externalKey": s("external_key")?, "externalUrl": s("external_url")?,
                    "externalSyncedAt": s("external_synced_at")?,
                    "data": serde_json::from_str::<Value>(&data).unwrap_or_else(|_| json!({})),
                    "createdAt": s("created_at")?, "updatedAt": s("updated_at")?,
                    "revision": r.get::<_, i64>("revision")?,
                })
            } else {
                json!({
                    "id": s("id")?, "workspaceId": s("workspace_id")?, "projectId": s("project_id")?,
                    "defectId": s("defect_id")?, "targetKind": s("target_kind")?,
                    "targetId": s("target_id")?, "createdAt": s("created_at")?,
                    "updatedAt": s("updated_at")?, "revision": r.get::<_, i64>("revision")?,
                })
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

/// A value of an enum, or `default` when the payload has another one: a pull
/// never fails on the CHECK (design §3.7).
fn one_of<'a>(p: &'a Value, k: &str, allowed: &[&str], default: &'a str) -> &'a str {
    ps(p, k).filter(|v| allowed.contains(v)).unwrap_or(default)
}

/// Timestamps and authors of a written row; a pull uses the account and now.
pub(crate) struct RowMeta<'a> {
    pub created_by: &'a str,
    pub updated_by: &'a str,
    pub created_at: Option<&'a str>,
    pub updated_at: Option<&'a str>,
    pub deleted_at: Option<&'a str>,
}

/// Writes a defect row from its payload (pull or migration).
pub(crate) fn upsert_defect(
    conn: &Connection,
    workspace_id: &str,
    id: &str,
    p: &Value,
    revision: i64,
    meta: &RowMeta,
) -> Result<(), String> {
    let status = one_of(p, "status", &STATUSES, "new");
    let resolution = ps(p, "resolution")
        .filter(|r| lifecycle::needs_resolution(status) && lifecycle::RESOLUTIONS.contains(r));
    let data = match p.get("data") {
        Some(Value::Object(o)) => Value::Object(o.clone()).to_string(),
        _ => "{}".into(),
    };
    conn.execute(
        "INSERT INTO defects (id, workspace_id, project_id, defect_key, title, description,
                steps_to_reproduce, expected, actual, severity, priority, status, resolution,
                found_in_run_id, found_in_build, found_in_environment, fixed_in_build, reporter,
                assignee, external_system, external_key, external_url, external_synced_at, data,
                created_by, updated_by, created_at, updated_at, deleted_at, revision)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
                ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, coalesce(?27, datetime('now')),
                coalesce(?28, datetime('now')), ?29, ?30)
         ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,
                defect_key=excluded.defect_key, title=excluded.title,
                description=excluded.description, steps_to_reproduce=excluded.steps_to_reproduce,
                expected=excluded.expected, actual=excluded.actual, severity=excluded.severity,
                priority=excluded.priority, status=excluded.status, resolution=excluded.resolution,
                found_in_run_id=excluded.found_in_run_id, found_in_build=excluded.found_in_build,
                found_in_environment=excluded.found_in_environment,
                fixed_in_build=excluded.fixed_in_build, reporter=excluded.reporter,
                assignee=excluded.assignee, external_system=excluded.external_system,
                external_key=excluded.external_key, external_url=excluded.external_url,
                external_synced_at=excluded.external_synced_at, data=excluded.data,
                updated_by=excluded.updated_by, updated_at=excluded.updated_at,
                deleted_at=excluded.deleted_at, revision=excluded.revision",
        params![
            id,
            workspace_id,
            ps(p, "projectId").unwrap_or_default(),
            ps(p, "defectKey").unwrap_or_default(),
            ps(p, "title").unwrap_or_default(),
            ps(p, "description").unwrap_or_default(),
            ps(p, "stepsToReproduce").unwrap_or_default(),
            ps(p, "expected"),
            ps(p, "actual"),
            one_of(p, "severity", &SEVERITIES, "major"),
            one_of(p, "priority", &PRIORITIES, "medium"),
            status,
            resolution,
            ps(p, "foundInRunId"),
            ps(p, "foundInBuild"),
            ps(p, "foundInEnvironment"),
            ps(p, "fixedInBuild"),
            ps(p, "reporter").unwrap_or(meta.created_by),
            ps(p, "assignee"),
            ps(p, "externalSystem"),
            ps(p, "externalKey"),
            ps(p, "externalUrl"),
            ps(p, "externalSyncedAt"),
            data,
            meta.created_by,
            meta.updated_by,
            meta.created_at,
            meta.updated_at,
            meta.deleted_at,
            revision,
        ],
    )
    .map_err(err)?;
    Ok(())
}

/// Writes a link row from its payload (pull or migration). A target kind
/// outside the known ones is skipped rather than failing the pull.
pub(crate) fn upsert_link(
    conn: &Connection,
    workspace_id: &str,
    id: &str,
    p: &Value,
    revision: i64,
    meta: &RowMeta,
) -> Result<(), String> {
    let Some(kind) = ps(p, "targetKind").filter(|k| TARGET_KINDS.contains(k)) else {
        return Ok(());
    };
    conn.execute(
        "INSERT INTO defect_links (id, workspace_id, project_id, defect_id, target_kind, target_id,
                created_by, updated_by, created_at, updated_at, deleted_at, revision)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, coalesce(?9, datetime('now')),
                coalesce(?10, datetime('now')), ?11, ?12)
         ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,
                defect_id=excluded.defect_id, target_kind=excluded.target_kind,
                target_id=excluded.target_id, updated_by=excluded.updated_by,
                updated_at=excluded.updated_at, deleted_at=excluded.deleted_at,
                revision=excluded.revision",
        params![
            id,
            workspace_id,
            ps(p, "projectId").unwrap_or_default(),
            ps(p, "defectId").unwrap_or_default(),
            kind,
            ps(p, "targetId").unwrap_or_default(),
            meta.created_by,
            meta.updated_by,
            meta.created_at,
            meta.updated_at,
            meta.deleted_at,
            revision,
        ],
    )
    .map_err(err)?;
    Ok(())
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
    // The document's own dates, as the other device wrote them.
    let meta = RowMeta {
        created_by: user,
        updated_by: user,
        created_at: ps(p, "createdAt"),
        updated_at: ps(p, "updatedAt"),
        deleted_at: None,
    };
    match entity {
        DEFECT => upsert_defect(conn, workspace_id, id, p, revision, &meta),
        DEFECT_LINK => upsert_link(conn, workspace_id, id, p, revision, &meta),
        _ => Ok(()),
    }
}

/// Pending changes of this module held back, over every account of this
/// device, because its server has not listed `defects` yet (diagnostics).
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
        if crate::sync::server_takes_defects(conn, &user)? {
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

/// Live defects per status over the device (diagnostics: counts only).
pub(crate) fn counts_by_status(conn: &Connection) -> Result<Value, String> {
    let mut stmt = conn
        .prepare("SELECT status, count(*) FROM defects WHERE deleted_at IS NULL GROUP BY status")
        .map_err(err)?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
        .map_err(err)?;
    let mut out = Map::new();
    for row in rows {
        let (status, n) = row.map_err(err)?;
        out.insert(status, n.into());
    }
    Ok(Value::Object(out))
}

// ---- conversion of planner defect cards ---------------------------------------------------

/// The sync bookkeeping a converted card hands to its defect and links:
/// - each account's base of the card becomes the defect's base, and each link
///   gets `(1, card hlc)`, what the server's migration 0010 writes, so a card
///   the server knew converges without a push or a conflict;
/// - the card's unsynced oplog rows become the defect's (same ids, HLCs and
///   authors), so an edit made before upgrading is pushed as an update;
/// - links of a card the server never saw, or that had unsynced changes, are
///   journaled (folded: the migration is not a user action) for the push;
/// - open key conflicts and version conflicts move to the defect.
fn hand_over_sync(
    conn: &Connection,
    card_id: &str,
    links: &[Value],
    owner: &str,
) -> Result<(), String> {
    let bases: Vec<(String, i64, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT user_id, revision, hlc FROM sync_base
                  WHERE entity = 'planner_card' AND entity_id = ?1",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map(params![card_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)?
    };
    for (user, revision, hlc) in &bases {
        conn.execute(
            "INSERT OR IGNORE INTO sync_base (user_id, entity, entity_id, revision, hlc)
             VALUES (?1, 'defect', ?2, ?3, ?4)",
            params![user, card_id, revision, hlc],
        )
        .map_err(err)?;
        for link in links {
            conn.execute(
                "INSERT OR IGNORE INTO sync_base (user_id, entity, entity_id, revision, hlc)
                 VALUES (?1, 'defect_link', ?2, 1, ?3)",
                params![user, ps(link, "id").unwrap_or_default(), hlc],
            )
            .map_err(err)?;
        }
    }
    let pending = conn
        .execute(
            "UPDATE oplog SET entity = 'defect'
              WHERE entity = 'planner_card' AND entity_id = ?1 AND synced_at IS NULL",
            params![card_id],
        )
        .map_err(err)?;
    // A card from before the journal (no base and nothing pending) would
    // push its links without their defect: journal the defect too.
    if bases.is_empty() && pending == 0 {
        let mut change = Change::new(
            DEFECT,
            card_id,
            Action::Create,
            Actor::System {
                component: "migration",
                on_behalf_of: Some(owner.to_string()),
            },
            "upsert",
            1,
            owner,
        );
        change.audit = Audit::Folded;
        journal::record(conn, change)?;
    }
    // What the server's own conversion will say about these links is only
    // known when its defect and links arrive: remember what this one made up
    // (`reconcile_pulled`).
    if let Some((_, _, hlc)) = bases.first() {
        let record = json!({
            "hlc": hlc,
            "pending": pending > 0,
            "links": links.iter().filter_map(|l| ps(l, "id")).collect::<Vec<_>>(),
        });
        conn.execute(
            "INSERT OR REPLACE INTO sync_state (key, value) VALUES (?1, ?2)",
            params![converted_key(card_id), record.to_string()],
        )
        .map_err(err)?;
    }
    if bases.is_empty() || pending > 0 {
        for link in links {
            let id = ps(link, "id").unwrap_or_default();
            let mut change = Change::new(
                DEFECT_LINK,
                id,
                Action::Create,
                Actor::System {
                    component: "migration",
                    on_behalf_of: Some(owner.to_string()),
                },
                "upsert",
                1,
                owner,
            );
            change.audit = Audit::Folded;
            journal::record(conn, change)?;
        }
    }
    conn.execute(
        "UPDATE key_conflicts SET entity = 'defect' WHERE entity = 'planner_card' AND entity_id = ?1",
        params![card_id],
    )
    .map_err(err)?;
    // A version conflict keeps both sides, now as defects.
    let conflicts: Vec<(String, String, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, local_payload, remote_payload FROM sync_conflicts
                  WHERE entity = 'planner_card' AND entity_id = ?1 AND resolved_at IS NULL",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map(params![card_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)?
    };
    for (id, local, remote) in conflicts {
        let as_defect = |raw: &str| -> String {
            match serde_json::from_str::<Value>(raw) {
                Ok(card) if card.is_object() => convert::from_card(&card).0.to_string(),
                _ => raw.to_string(),
            }
        };
        conn.execute(
            "UPDATE sync_conflicts SET entity = 'defect', local_payload = ?2, remote_payload = ?3
              WHERE id = ?1",
            params![id, as_defect(&local), as_defect(&remote)],
        )
        .map_err(err)?;
    }
    Ok(())
}

/// `sync_state` key of what the local conversion of a card the server
/// knew made up: `{hlc, pending, links}` (`hand_over_sync`).
fn converted_key(defect_id: &str) -> String {
    format!("converted_card:{defect_id}")
}

fn has_pending(conn: &Connection, entity: &str, id: &str) -> Result<bool, String> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM oplog WHERE entity = ?1 AND entity_id = ?2 AND synced_at IS NULL LIMIT 1",
            params![entity, id],
            |_| Ok(()),
        )
        .optional()
        .map_err(err)?
        .is_some())
}

/// Takes a link away on this device only (the server never had it): no
/// oplog row, no event.
fn forget_link(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE defect_links SET deleted_at = datetime('now') WHERE id = ?1 AND deleted_at IS NULL",
        params![id],
    )
    .map_err(err)?;
    Ok(())
}

/// After a pulled defect or link was written (`sync::apply_doc`): makes the
/// links a local conversion made up agree with the server's conversion, which
/// may have started from a newer or an older card (ADR-0016, «Implementación»).
/// - The server's defect says which case links its card had
///   (`data.fromCard.testCaseIds`). If the local card had no pending edit,
///   a made-up link it does not have, and that nothing pending touches, is
///   taken away here (the server's card had lost it).
/// - If the local card had a pending edit, that edit wins: a link of the
///   server's conversion (revision 1, the card's HLC) that the edited card
///   no longer has is deleted and journaled, so the server loses it too.
pub(crate) fn reconcile_pulled(
    conn: &Connection,
    user: &str,
    entity: &str,
    id: &str,
    p: &Value,
    revision: i64,
    hlc: &str,
) -> Result<(), String> {
    let defect_id = match entity {
        DEFECT => id,
        DEFECT_LINK => ps(p, "defectId").unwrap_or_default(),
        _ => return Ok(()),
    };
    let Some(raw): Option<String> = conn
        .query_row(
            "SELECT value FROM sync_state WHERE key = ?1",
            params![converted_key(defect_id)],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?
    else {
        return Ok(());
    };
    let record: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    let made_up: Vec<&str> = record["links"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect();
    let pending = record["pending"].as_bool().unwrap_or(false);
    if entity == DEFECT && !pending {
        let Some(server_cases) = p["data"]["fromCard"]["testCaseIds"].as_array() else {
            return Ok(());
        };
        let server: Vec<String> = server_cases
            .iter()
            .filter_map(Value::as_str)
            .map(|c| ids::link_id(id, "test_case", c))
            .collect();
        for link in made_up {
            if !server.iter().any(|s| s == link) && !has_pending(conn, DEFECT_LINK, link)? {
                forget_link(conn, link)?;
            }
        }
        conn.execute(
            "DELETE FROM sync_state WHERE key = ?1",
            params![converted_key(id)],
        )
        .map_err(err)?;
    } else if entity == DEFECT_LINK
        && pending
        && revision == 1
        && Some(hlc) == record["hlc"].as_str()
        && !made_up.contains(&id)
    {
        let before = journal::snapshot(conn, DEFECT_LINK, id)?;
        conn.execute(
            "UPDATE defect_links SET deleted_at = datetime('now'), updated_by = ?2,
                    updated_at = datetime('now'), revision = revision + 1
              WHERE id = ?1 AND deleted_at IS NULL",
            params![id, user],
        )
        .map_err(err)?;
        let mut change = Change::new(
            DEFECT_LINK,
            id,
            Action::Delete,
            Actor::System {
                component: "migration",
                on_behalf_of: Some(user.to_string()),
            },
            "delete",
            0,
            user,
        )
        .before(before);
        change.audit = Audit::Folded;
        journal::record(conn, change)?;
    }
    Ok(())
}

/// Migration 0029's Rust step (ADR-0016): every planner card of kind
/// `defect`, live or deleted, becomes a defect with the same id, key, dates
/// and revision (`convert::from_card`); its attachments now belong to the
/// defect; the card is soft-deleted without an oplog row (the server converts
/// its own copy, migration 0010). The DEF keys of cards that are tasks now
/// stay taken (`retired_keys`). Idempotent: a defect already there is kept.
pub(crate) fn migrate_planner_defects(conn: &Connection) -> Result<(), String> {
    type Card = (String, String, String, String, String, Option<String>);
    let cards: Vec<Card> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, workspace_id, created_by, updated_by, owner_id, deleted_at
                   FROM planner_cards WHERE kind = 'defect' ORDER BY rowid",
            )
            .map_err(err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                ))
            })
            .map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)?
    };
    for (id, workspace_id, created_by, updated_by, owner, deleted_at) in cards {
        let exists = conn
            .query_row("SELECT 1 FROM defects WHERE id = ?1", params![id], |_| {
                Ok(())
            })
            .optional()
            .map_err(err)?
            .is_some();
        if exists {
            continue;
        }
        let Some((card, revision, _)) = crate::sync::read_payload(conn, "planner_card", &id)?
        else {
            continue;
        };
        let (defect, links) = convert::from_card(&card);
        let meta = RowMeta {
            created_by: &created_by,
            updated_by: &updated_by,
            created_at: ps(&card, "createdAt"),
            updated_at: ps(&card, "updatedAt"),
            deleted_at: deleted_at.as_deref(),
        };
        upsert_defect(conn, &workspace_id, &id, &defect, revision, &meta)?;
        let link_meta = RowMeta {
            deleted_at: None,
            ..meta
        };
        for link in &links {
            upsert_link(
                conn,
                &workspace_id,
                ps(link, "id").unwrap_or_default(),
                link,
                1,
                &link_meta,
            )?;
        }
        conn.execute(
            "UPDATE attachments SET owner_entity = 'defect'
              WHERE owner_entity = 'planner_card' AND owner_id = ?1",
            params![id],
        )
        .map_err(err)?;
        conn.execute(
            "UPDATE planner_cards SET deleted_at = coalesce(deleted_at, datetime('now')) WHERE id = ?1",
            params![id],
        )
        .map_err(err)?;
        hand_over_sync(conn, &id, &links, &owner)?;
    }
    // A task that was once a defect keeps its DEF key on the card; the key
    // stays taken in its series, which now lives in `defects`.
    conn.execute(
        "INSERT OR IGNORE INTO retired_keys (project_id, kind, key)
         SELECT project_id, 'defect', card_key FROM planner_cards
          WHERE kind <> 'defect' AND card_key IS NOT NULL AND card_key <> ''",
        [],
    )
    .map_err(err)?;
    Ok(())
}

/// A live defect card pulled from a server that has not converted it yet (an
/// older server, or a card written before its migration 0010): converted with
/// the same function and applied as the defect and link documents the server
/// will write, through the normal lww path, so a pending local edit becomes a
/// conflict, not an overwrite. A defect already at that revision or later is
/// kept (a stale card never overwrites it). The card row goes away here
/// without an oplog row; its base moves on so its echo is not applied again.
pub(crate) fn apply_pulled_card(
    conn: &Connection,
    workspace_id: &str,
    user: &str,
    card: &Value,
    revision: i64,
    hlc: &str,
) -> Result<(), String> {
    let id = ps(card, "id").unwrap_or_default().to_string();
    let (defect, links) = convert::from_card(card);
    let local: Option<i64> = conn
        .query_row(
            "SELECT revision FROM defects WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?;
    if local.map_or(true, |r| r < revision) {
        crate::sync::apply_remote_doc(
            conn,
            workspace_id,
            user,
            DEFECT,
            &id,
            defect,
            revision,
            hlc,
        )?;
        // The newer card's links are the truth: a case link of an older card
        // it no longer has goes, unless something pending touches it (no
        // link reached a server without `defects` but through a card).
        let wanted: Vec<String> = links
            .iter()
            .filter_map(|l| ps(l, "id").map(String::from))
            .collect();
        let local_links: Vec<String> = {
            let mut stmt = conn
                .prepare(
                    "SELECT id FROM defect_links WHERE defect_id = ?1 AND target_kind = 'test_case'
                       AND deleted_at IS NULL",
                )
                .map_err(err)?;
            let rows = stmt.query_map(params![id], |r| r.get(0)).map_err(err)?;
            rows.collect::<rusqlite::Result<_>>().map_err(err)?
        };
        for link in local_links {
            if !wanted.contains(&link) && !has_pending(conn, DEFECT_LINK, &link)? {
                forget_link(conn, &link)?;
            }
        }
    }
    for link in links {
        let link_id = ps(&link, "id").unwrap_or_default().to_string();
        let known = conn
            .query_row(
                "SELECT 1 FROM defect_links WHERE id = ?1",
                params![link_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(err)?
            .is_some();
        if !known {
            crate::sync::apply_remote_doc(
                conn,
                workspace_id,
                user,
                DEFECT_LINK,
                &link_id,
                link,
                1,
                hlc,
            )?;
        }
    }
    conn.execute(
        "UPDATE planner_cards SET deleted_at = coalesce(deleted_at, datetime('now')) WHERE id = ?1",
        params![id],
    )
    .map_err(err)?;
    Ok(())
}

// ---- commands ----------------------------------------------------------------------

#[tauri::command]
pub fn defect_list(
    db: State<Db>,
    project_id: String,
    user_id: String,
) -> Result<Vec<Defect>, String> {
    db.with_conn(|conn| list_defects(conn, &project_id, &user_id))
}

#[tauri::command]
pub fn defect_get(db: State<Db>, id: String, user_id: String) -> Result<Option<Defect>, String> {
    db.with_conn(|conn| get_defect(conn, &id, &user_id))
}

#[tauri::command]
pub fn defect_create(db: State<Db>, input: DefectInput) -> Result<Option<Defect>, String> {
    let id = db.with_tx(|conn| insert_defect(conn, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_defect(conn, &id, &input.user_id))
}

#[tauri::command]
pub fn defect_update(
    db: State<Db>,
    id: String,
    input: DefectInput,
) -> Result<Option<Defect>, String> {
    db.with_tx(|conn| update_defect(conn, &id, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_defect(conn, &id, &input.user_id))
}

#[tauri::command]
pub fn defect_transition(
    db: State<Db>,
    id: String,
    user_id: String,
    status: String,
    resolution: Option<String>,
    fixed_in_build: Option<String>,
) -> Result<Option<Defect>, String> {
    db.with_tx(|conn| {
        transition(
            conn,
            &id,
            &user_id,
            &status,
            resolution.as_deref(),
            fixed_in_build.as_deref(),
        )
    })?;
    db.persist()?;
    db.with_conn(|conn| get_defect(conn, &id, &user_id))
}

#[tauri::command]
pub fn defect_delete(db: State<Db>, id: String, user_id: String) -> Result<(), String> {
    db.with_tx(|conn| delete_defect(conn, &id, &user_id))?;
    db.persist_and_collect()
}

#[tauri::command]
pub fn defect_link_set(
    db: State<Db>,
    defect_id: String,
    user_id: String,
    target: LinkTarget,
    linked: bool,
) -> Result<Option<Defect>, String> {
    db.with_tx(|conn| set_link(conn, &defect_id, &user_id, &target, linked))?;
    db.persist()?;
    db.with_conn(|conn| get_defect(conn, &defect_id, &user_id))
}

/// Read only: the editor's prefill for a defect created from a result.
#[tauri::command]
pub fn defect_draft_from_result(
    db: State<Db>,
    result_id: String,
    step_id: Option<String>,
    user_id: String,
) -> Result<DefectInput, String> {
    db.with_conn(|conn| draft_from_result(conn, &result_id, step_id.as_deref(), &user_id))
}

#[tauri::command]
pub fn defect_result_list(
    db: State<Db>,
    project_id: String,
    user_id: String,
) -> Result<Vec<ResultCandidate>, String> {
    db.with_conn(|conn| result_candidates(conn, &project_id, &user_id))
}

/// Attaches a finished upload (`evidence_upload_*`) to a defect the user
/// owns, as `planner_attachment_add` does for cards.
#[tauri::command(async)]
pub fn defect_attachment_add(
    db: State<'_, Db>,
    uploads: State<'_, evidence::Uploads>,
    defect_id: String,
    user_id: String,
    upload_id: String,
    name: String,
    mime: Option<String>,
) -> Result<Option<DefectAttachment>, String> {
    let mut upload = uploads.take(&upload_id)?;
    upload.seal()?;
    let id = Uuid::new_v4().to_string();
    let stored = db.with_conn(|conn| {
        owned(conn, &defect_id, &user_id)?;
        let committed = upload.commit(db.evidence())?;
        let stored = committed.stored;
        let added = in_tx(conn, |tx| {
            add_attachment(
                tx,
                &id,
                &defect_id,
                &user_id,
                &name,
                mime.as_deref(),
                &stored,
            )
        });
        if let Err(e) = added {
            if committed.wrote && !evidence::is_known(conn, &stored.sha256)? {
                db.evidence().remove(&stored.sha256)?;
            }
            return Err(e);
        }
        Ok(stored)
    })?;
    db.persist()?;
    Ok(Some(DefectAttachment {
        id,
        name,
        mime,
        size: stored.size as i64,
        purged: false,
    }))
}

#[tauri::command]
pub fn defect_attachment_list(
    db: State<Db>,
    defect_id: String,
    user_id: String,
) -> Result<Vec<DefectAttachment>, String> {
    db.with_conn(|conn| list_attachments(conn, &defect_id, &user_id))
}

/// Saves an attachment into the download folder, decrypted block by block
/// straight to disk (as `planner_attachment_save`).
#[tauri::command(async)]
pub fn defect_attachment_save(
    db: State<'_, Db>,
    downloads: State<'_, Downloads>,
    id: String,
    user_id: String,
) -> Result<SaveResult, String> {
    let (_, name, _, size, sha256, purged) = db
        .with_conn(|conn| owned_attachment(conn, &id, &user_id))?
        .ok_or("attachment not found")?;
    if purged {
        return Err(format!(
            "{}: the file was removed by the retention policy",
            evidence::EVIDENCE_MISSING
        ));
    }
    db.evidence().open(&sha256)?;
    let saved = downloads.save_with(&name, true, &|out| {
        db.evidence().copy_to(&sha256, out).map(drop)
    })?;
    tracing::info!(
        bytes = size,
        "defect attachment saved to the download folder"
    );
    Ok(saved)
}

#[tauri::command]
pub fn defect_attachment_delete(db: State<Db>, id: String, user_id: String) -> Result<(), String> {
    db.with_tx(|conn| delete_attachment(conn, &id, &user_id))?;
    db.persist_and_collect()
}
