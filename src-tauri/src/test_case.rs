//! Test case repository + Tauri commands (spec §5.3). Scenario ids are
//! auto-generated (ATS_001, ...). The 21-attribute content lives in `data`
//! (JSON); every update snapshots the prior state and bumps `revision`.
//!
//! A case belongs to its project's owner: every function takes the signed-in
//! `user_id` and only touches cases of projects that user owns (FIX-08). Audit
//! fields record that user (FIX-06). The scenario id is assigned once and never
//! changes or comes back after a delete (DAT-01, ADR-0010).

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

use crate::db::{ensure_workspace, Db};
use crate::keys::{self, KeyKind};
use crate::oplog;
use crate::project;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestCaseSummary {
    id: String,
    scenario_id: String,
    title: String,
    status: String,
    priority: String,
    gherkin_level: String,
    /// Some AI-generated content is still pending human review (IA-01).
    ai_pending: bool,
    updated_at: String,
    revision: i64,
}

/// True when any entry of `data.aiProvenance` has no `reviewedAt` yet.
fn ai_pending(data: &Value) -> bool {
    data.get("aiProvenance")
        .and_then(Value::as_object)
        .map(|map| {
            map.values()
                .any(|p| p.get("reviewedAt").map_or(true, Value::is_null))
        })
        .unwrap_or(false)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestCase {
    id: String,
    workspace_id: String,
    scenario_id: String,
    title: String,
    version: String,
    status: String,
    priority: String,
    author: String,
    data: Value,
    created_at: String,
    updated_at: String,
    revision: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionSummary {
    id: String,
    revision: i64,
    title: String,
    created_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestCaseInput {
    project_id: String,
    /// Only honoured on create (empty → auto-numbered); immutable afterwards.
    scenario_id: Option<String>,
    title: String,
    version: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    /// Name printed on the document; not an id.
    author: String,
    #[serde(default = "empty_object")]
    data: Value,
    /// Signed-in user making the change (owner check + audit fields).
    user_id: String,
}

fn empty_object() -> Value {
    Value::Object(serde_json::Map::new())
}

/// Live case `?1` of a live project owned by `?2`.
const SELECT_CASE: &str = "SELECT c.id, c.workspace_id, c.scenario_id, c.title, c.version, \
    c.status, c.priority, c.author, c.data, c.created_at, c.updated_at, c.revision \
    FROM test_cases c JOIN projects p ON p.id = c.project_id \
    WHERE c.id = ?1 AND p.owner_id = ?2 AND c.deleted_at IS NULL AND p.deleted_at IS NULL";

fn map_case(row: &rusqlite::Row) -> rusqlite::Result<TestCase> {
    let data_str: String = row.get("data")?;
    Ok(TestCase {
        id: row.get("id")?,
        workspace_id: row.get("workspace_id")?,
        scenario_id: row.get("scenario_id")?,
        title: row.get("title")?,
        version: row.get("version")?,
        status: row.get("status")?,
        priority: row.get("priority")?,
        author: row.get("author")?,
        data: serde_json::from_str(&data_str).unwrap_or_else(|_| empty_object()),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        revision: row.get("revision")?,
    })
}

/// True when the case is live and its project is owned by `user_id`.
fn owns(conn: &Connection, id: &str, user_id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM test_cases c JOIN projects p ON p.id = c.project_id \
         WHERE c.id = ?1 AND p.owner_id = ?2 AND c.deleted_at IS NULL AND p.deleted_at IS NULL",
        params![id, user_id],
        |_| Ok(()),
    )
    .optional()
    .map_err(|e| e.to_string())
    .map(|r| r.is_some())
}

/// The project's case id numbering: literal prefix and zero-padding width.
fn numbering(conn: &Connection, project_id: &str) -> Result<(String, usize), String> {
    Ok(conn
        .query_row(
            "SELECT case_id_prefix, case_id_digits FROM projects WHERE id = ?1",
            params![project_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? as usize)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| ("ATS_".to_string(), 3)))
}

/// Next scenario id within a project, using the project's configured literal
/// prefix and padding (e.g. `ATS_001`, `FT001`, `TC-001`; spec §5.3 "por
/// proyecto"). It comes from the project's key counter, so the id of a deleted
/// case is never handed out again (DAT-01).
fn next_scenario_id(conn: &Connection, project_id: &str) -> Result<String, String> {
    let (prefix, digits) = numbering(conn, project_id)?;
    keys::allocate(conn, KeyKind::Case, project_id, &prefix, digits)
}

fn list_cases(
    conn: &Connection,
    project_id: &str,
    user_id: &str,
) -> Result<Vec<TestCaseSummary>, String> {
    if !project::owns(conn, project_id, user_id)? {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "SELECT id, scenario_id, title, status, priority, data, updated_at, revision \
             FROM test_cases WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY scenario_id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |r| {
            let data_str: String = r.get("data")?;
            let data = serde_json::from_str::<Value>(&data_str).unwrap_or(Value::Null);
            let gherkin_level = data
                .get("gherkinLevel")
                .and_then(Value::as_str)
                .map(String::from)
                .unwrap_or_else(|| "basic".to_string());
            Ok(TestCaseSummary {
                id: r.get("id")?,
                scenario_id: r.get("scenario_id")?,
                title: r.get("title")?,
                status: r.get("status")?,
                priority: r.get("priority")?,
                gherkin_level,
                ai_pending: ai_pending(&data),
                updated_at: r.get("updated_at")?,
                revision: r.get("revision")?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

fn get_case(conn: &Connection, id: &str, user_id: &str) -> Result<Option<TestCase>, String> {
    conn.query_row(SELECT_CASE, params![id, user_id], map_case)
        .optional()
        .map_err(|e| e.to_string())
}

fn insert_case(conn: &Connection, input: &TestCaseInput) -> Result<String, String> {
    if !project::owns(conn, &input.project_id, &input.user_id)? {
        return Err("project not found".to_string());
    }
    let scenario_id = match input.scenario_id.as_deref().map(str::trim) {
        Some(s) if !s.is_empty() => {
            if keys::taken_live(conn, KeyKind::Case, &input.project_id, s)? {
                return Err(format!("duplicate scenario id: {s}"));
            }
            let (prefix, _) = numbering(conn, &input.project_id)?;
            keys::note_manual(conn, KeyKind::Case, &input.project_id, &prefix, s)?;
            s.to_string()
        }
        _ => next_scenario_id(conn, &input.project_id)?,
    };
    let id = Uuid::new_v4().to_string();
    let workspace_id = ensure_workspace(conn)?;
    let data_str = serde_json::to_string(&input.data).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, \
         version, status, priority, author, data, created_by, updated_by, created_at, \
         updated_at, revision) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, \
         ?11, datetime('now'), datetime('now'), 1)",
        params![
            id,
            workspace_id,
            input.project_id,
            scenario_id,
            input.title,
            input.version.clone().unwrap_or_else(|| "1.0".to_string()),
            input.status.clone().unwrap_or_else(|| "draft".to_string()),
            input
                .priority
                .clone()
                .unwrap_or_else(|| "medium".to_string()),
            input.author,
            data_str,
            input.user_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    oplog::record(conn, "test_case", &id, "upsert", "{}", 1, &input.user_id)?;
    Ok(id)
}

/// Updates the editable fields. The scenario id is immutable and ignored here.
fn update_case(conn: &Connection, id: &str, input: &TestCaseInput) -> Result<(), String> {
    if !owns(conn, id, &input.user_id)? {
        return Err("test case not found".to_string());
    }
    let (revision, prev_title, prev_data) = conn
        .query_row(
            "SELECT revision, title, data FROM test_cases WHERE id = ?1",
            params![id],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO test_case_revisions (id, test_case_id, revision, title, data, \
         created_at, created_by) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), ?6)",
        params![
            Uuid::new_v4().to_string(),
            id,
            revision,
            prev_title,
            prev_data,
            input.user_id
        ],
    )
    .map_err(|e| e.to_string())?;

    let data_str = serde_json::to_string(&input.data).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE test_cases SET title = ?2, version = ?3, status = ?4, priority = ?5, \
         author = ?6, data = ?7, updated_at = datetime('now'), updated_by = ?9, \
         revision = ?8 WHERE id = ?1",
        params![
            id,
            input.title,
            input.version.clone().unwrap_or_else(|| "1.0".to_string()),
            input.status.clone().unwrap_or_else(|| "draft".to_string()),
            input
                .priority
                .clone()
                .unwrap_or_else(|| "medium".to_string()),
            input.author,
            data_str,
            revision + 1,
            input.user_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    oplog::record(
        conn,
        "test_case",
        id,
        "upsert",
        "{}",
        revision + 1,
        &input.user_id,
    )?;
    Ok(())
}

/// Soft-deletes a case the user owns. An unknown or foreign id is an error and
/// leaves no oplog row behind.
fn delete_case(conn: &Connection, id: &str, user_id: &str) -> Result<(), String> {
    if !owns(conn, id, user_id)? {
        return Err("test case not found".to_string());
    }
    conn.execute(
        "UPDATE test_cases SET deleted_at = datetime('now'), updated_by = ?2 WHERE id = ?1",
        params![id, user_id],
    )
    .map_err(|e| e.to_string())?;
    oplog::record(conn, "test_case", id, "delete", "{}", 0, user_id)?;
    Ok(())
}

fn list_revisions(
    conn: &Connection,
    id: &str,
    user_id: &str,
) -> Result<Vec<RevisionSummary>, String> {
    if !owns(conn, id, user_id)? {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "SELECT id, revision, title, created_at FROM test_case_revisions \
             WHERE test_case_id = ?1 ORDER BY revision DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id], |r| {
            Ok(RevisionSummary {
                id: r.get(0)?,
                revision: r.get(1)?,
                title: r.get(2)?,
                created_at: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn test_case_list(
    db: State<Db>,
    project_id: String,
    user_id: String,
) -> Result<Vec<TestCaseSummary>, String> {
    db.with_conn(|conn| list_cases(conn, &project_id, &user_id))
}

#[tauri::command]
pub fn test_case_get(
    db: State<Db>,
    id: String,
    user_id: String,
) -> Result<Option<TestCase>, String> {
    db.with_conn(|conn| get_case(conn, &id, &user_id))
}

#[tauri::command]
pub fn test_case_create(db: State<Db>, input: TestCaseInput) -> Result<Option<TestCase>, String> {
    let id = db.with_conn(|conn| insert_case(conn, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_case(conn, &id, &input.user_id))
}

#[tauri::command]
pub fn test_case_update(
    db: State<Db>,
    id: String,
    input: TestCaseInput,
) -> Result<Option<TestCase>, String> {
    db.with_conn(|conn| update_case(conn, &id, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_case(conn, &id, &input.user_id))
}

#[tauri::command]
pub fn test_case_delete(db: State<Db>, id: String, user_id: String) -> Result<(), String> {
    db.with_conn(|conn| delete_case(conn, &id, &user_id))?;
    db.persist()
}

#[tauri::command]
pub fn test_case_revisions(
    db: State<Db>,
    id: String,
    user_id: String,
) -> Result<Vec<RevisionSummary>, String> {
    db.with_conn(|conn| list_revisions(conn, &id, &user_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    const USER: &str = "user-1";
    const OTHER: &str = "user-2";

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        c
    }

    /// Inserts a project of USER with the given case-id prefix and returns its id.
    fn project(c: &Connection, prefix: &str) -> String {
        let id = Uuid::new_v4().to_string();
        let ws = crate::db::ensure_workspace(c).unwrap();
        c.execute(
            "INSERT INTO projects (id, workspace_id, owner_id, name, case_id_prefix, case_id_digits, \
             created_by, updated_by, created_at, updated_at, revision) \
             VALUES (?1, ?2, ?4, 'P', ?3, 3, ?4, ?4, datetime('now'), datetime('now'), 1)",
            params![id, ws, prefix, USER],
        )
        .unwrap();
        id
    }

    fn input(project_id: &str, scenario: Option<&str>, title: &str) -> TestCaseInput {
        TestCaseInput {
            project_id: project_id.to_string(),
            scenario_id: scenario.map(String::from),
            title: title.to_string(),
            version: None,
            status: None,
            priority: None,
            author: "Ada Lovelace".to_string(),
            data: serde_json::json!({}),
            user_id: USER.to_string(),
        }
    }

    fn scenario(c: &Connection, id: &str) -> String {
        get_case(c, id, USER).unwrap().unwrap().scenario_id
    }

    fn oplog_rows(c: &Connection) -> i64 {
        c.query_row("SELECT count(*) FROM oplog", [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn auto_generates_sequential_scenario_ids_per_project() {
        let c = conn();
        let p = project(&c, "ATS_");
        let a = insert_case(&c, &input(&p, None, "First")).unwrap();
        let b = insert_case(&c, &input(&p, None, "Second")).unwrap();
        assert_eq!(scenario(&c, &a), "ATS_001");
        assert_eq!(scenario(&c, &b), "ATS_002");
    }

    #[test]
    fn numbering_is_scoped_and_uses_project_prefix() {
        let c = conn();
        let p1 = project(&c, "FT");
        let p2 = project(&c, "TC-");
        let a = insert_case(&c, &input(&p1, None, "A")).unwrap();
        let b = insert_case(&c, &input(&p2, None, "B")).unwrap();
        // Each project numbers independently, from 1, with its own prefix.
        assert_eq!(scenario(&c, &a), "FT001");
        assert_eq!(scenario(&c, &b), "TC-001");
    }

    #[test]
    fn the_id_of_a_deleted_case_is_never_reused() {
        let c = conn();
        let p = project(&c, "ATS_");
        let a = insert_case(&c, &input(&p, None, "A")).unwrap();
        assert_eq!(scenario(&c, &a), "ATS_001");
        delete_case(&c, &a, USER).unwrap();
        // A tag @ATS_001 in an automation repo must never point to another case.
        let b = insert_case(&c, &input(&p, None, "B")).unwrap();
        assert_eq!(scenario(&c, &b), "ATS_002");
    }

    #[test]
    fn respects_provided_scenario_id_and_numbers_after_it() {
        let c = conn();
        let p = project(&c, "ATS_");
        let id = insert_case(&c, &input(&p, Some("ATS_042"), "Case")).unwrap();
        assert_eq!(scenario(&c, &id), "ATS_042");
        let next = insert_case(&c, &input(&p, None, "Next")).unwrap();
        assert_eq!(scenario(&c, &next), "ATS_043");
    }

    #[test]
    fn a_live_scenario_id_cannot_be_given_twice() {
        let c = conn();
        let p = project(&c, "ATS_");
        insert_case(&c, &input(&p, Some("ATS_007"), "One")).unwrap();
        let err = insert_case(&c, &input(&p, Some("ATS_007"), "Two")).unwrap_err();
        assert!(err.contains("duplicate"), "{err}");
    }

    #[test]
    fn the_scenario_id_is_immutable() {
        let c = conn();
        let p = project(&c, "ATS_");
        let id = insert_case(&c, &input(&p, None, "Case")).unwrap();
        update_case(&c, &id, &input(&p, Some("ATS_999"), "Case v2")).unwrap();
        update_case(&c, &id, &input(&p, Some(""), "Case v3")).unwrap();
        assert_eq!(scenario(&c, &id), "ATS_001");
    }

    #[test]
    fn ai_pending_until_every_field_is_reviewed() {
        let pending = serde_json::json!({ "aiProvenance": {
            "description": { "provider": "gemini", "model": "m", "generatedAt": "t" },
            "case": { "provider": "ollama", "model": "m", "generatedAt": "t", "reviewedAt": "t2" }
        }});
        let reviewed = serde_json::json!({ "aiProvenance": {
            "description": { "provider": "gemini", "model": "m", "generatedAt": "t", "reviewedAt": "t2" }
        }});
        assert!(ai_pending(&pending));
        assert!(!ai_pending(&reviewed));
        assert!(!ai_pending(&serde_json::json!({})));
    }

    #[test]
    fn update_bumps_revision_and_snapshots() {
        let c = conn();
        let p = project(&c, "ATS_");
        let id = insert_case(&c, &input(&p, None, "Case")).unwrap();
        update_case(&c, &id, &input(&p, Some("ATS_001"), "Case v2")).unwrap();
        let case = get_case(&c, &id, USER).unwrap().unwrap();
        assert_eq!(case.revision, 2);
        assert_eq!(case.title, "Case v2");
        assert_eq!(list_revisions(&c, &id, USER).unwrap().len(), 1);
    }

    #[test]
    fn audit_fields_record_the_user_not_the_case() {
        let c = conn();
        let p = project(&c, "ATS_");
        let id = insert_case(&c, &input(&p, None, "Case")).unwrap();
        update_case(&c, &id, &input(&p, None, "Case v2")).unwrap();
        let (created_by, updated_by): (String, String) = c
            .query_row(
                "SELECT created_by, updated_by FROM test_cases WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!((created_by.as_str(), updated_by.as_str()), (USER, USER));
        let snapshot_by: String = c
            .query_row(
                "SELECT created_by FROM test_case_revisions WHERE test_case_id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(snapshot_by, USER);
        let authors: Vec<String> = c
            .prepare("SELECT author FROM oplog WHERE entity_id = ?1")
            .unwrap()
            .query_map(params![id], |r| r.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(authors, vec![USER, USER]);
    }

    #[test]
    fn another_user_can_neither_read_nor_modify_the_case() {
        let c = conn();
        let p = project(&c, "ATS_");
        let id = insert_case(&c, &input(&p, None, "Private")).unwrap();
        update_case(&c, &id, &input(&p, None, "Private v2")).unwrap();
        let ops = oplog_rows(&c);

        assert!(list_cases(&c, &p, OTHER).unwrap().is_empty());
        assert!(get_case(&c, &id, OTHER).unwrap().is_none());
        assert!(list_revisions(&c, &id, OTHER).unwrap().is_empty());

        let mut theirs = input(&p, None, "Hijacked");
        theirs.user_id = OTHER.to_string();
        assert!(insert_case(&c, &theirs).is_err());
        assert!(update_case(&c, &id, &theirs).is_err());
        assert!(delete_case(&c, &id, OTHER).is_err());

        assert_eq!(
            get_case(&c, &id, USER).unwrap().unwrap().title,
            "Private v2"
        );
        assert_eq!(list_cases(&c, &p, USER).unwrap().len(), 1);
        assert_eq!(oplog_rows(&c), ops);
    }

    #[test]
    fn deleting_an_unknown_case_fails_without_an_oplog_row() {
        let c = conn();
        assert!(delete_case(&c, "no-such-case", USER).is_err());
        assert_eq!(oplog_rows(&c), 0);
    }
}
