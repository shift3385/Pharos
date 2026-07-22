//! Test case repository + Tauri commands (spec §5.3). Scenario ids are
//! auto-generated (ATS_001, ...). The 21-attribute content lives in `data`
//! (JSON); every update snapshots the prior state and bumps `revision`.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

use crate::db::{ensure_workspace, Db};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestCaseSummary {
    id: String,
    scenario_id: String,
    title: String,
    status: String,
    priority: String,
    updated_at: String,
    revision: i64,
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
    scenario_id: Option<String>,
    title: String,
    version: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    author: String,
    #[serde(default = "empty_object")]
    data: Value,
}

fn empty_object() -> Value {
    Value::Object(serde_json::Map::new())
}

const SELECT_CASE: &str = "SELECT id, workspace_id, scenario_id, title, version, \
    status, priority, author, data, created_at, updated_at, revision \
    FROM test_cases WHERE id = ?1 AND deleted_at IS NULL";

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

/// Next sequential scenario id (`ATS_001`, `ATS_002`, ...).
fn next_scenario_id(conn: &Connection) -> Result<String, String> {
    let count: i64 = conn
        .query_row("SELECT count(*) FROM test_cases", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(format!("ATS_{:03}", count + 1))
}

fn list_cases(conn: &Connection) -> Result<Vec<TestCaseSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, scenario_id, title, status, priority, updated_at, revision \
             FROM test_cases WHERE deleted_at IS NULL ORDER BY scenario_id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(TestCaseSummary {
                id: r.get("id")?,
                scenario_id: r.get("scenario_id")?,
                title: r.get("title")?,
                status: r.get("status")?,
                priority: r.get("priority")?,
                updated_at: r.get("updated_at")?,
                revision: r.get("revision")?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

fn get_case(conn: &Connection, id: &str) -> Result<Option<TestCase>, String> {
    conn.query_row(SELECT_CASE, params![id], map_case)
        .optional()
        .map_err(|e| e.to_string())
}

fn insert_case(conn: &Connection, input: &TestCaseInput) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let workspace_id = ensure_workspace(conn)?;
    let scenario_id = match input.scenario_id.as_ref().map(|s| s.trim()) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => next_scenario_id(conn)?,
    };
    let data_str = serde_json::to_string(&input.data).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO test_cases (id, workspace_id, scenario_id, title, version, \
         status, priority, author, data, created_by, updated_by, created_at, \
         updated_at, revision) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?1, \
         ?1, datetime('now'), datetime('now'), 1)",
        params![
            id,
            workspace_id,
            scenario_id,
            input.title,
            input.version.clone().unwrap_or_else(|| "1.0".to_string()),
            input.status.clone().unwrap_or_else(|| "draft".to_string()),
            input.priority.clone().unwrap_or_else(|| "medium".to_string()),
            input.author,
            data_str,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

fn update_case(conn: &Connection, id: &str, input: &TestCaseInput) -> Result<(), String> {
    let current = conn
        .query_row(
            "SELECT revision, title, data FROM test_cases WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let (revision, prev_title, prev_data) = current.ok_or("test case not found")?;

    conn.execute(
        "INSERT INTO test_case_revisions (id, test_case_id, revision, title, data, \
         created_at, created_by) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), ?2)",
        params![Uuid::new_v4().to_string(), id, revision, prev_title, prev_data],
    )
    .map_err(|e| e.to_string())?;

    let data_str = serde_json::to_string(&input.data).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE test_cases SET scenario_id = ?2, title = ?3, version = ?4, \
         status = ?5, priority = ?6, author = ?7, data = ?8, \
         updated_at = datetime('now'), updated_by = ?1, revision = ?9 WHERE id = ?1",
        params![
            id,
            input
                .scenario_id
                .clone()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_default(),
            input.title,
            input.version.clone().unwrap_or_else(|| "1.0".to_string()),
            input.status.clone().unwrap_or_else(|| "draft".to_string()),
            input.priority.clone().unwrap_or_else(|| "medium".to_string()),
            input.author,
            data_str,
            revision + 1,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn list_revisions(conn: &Connection, id: &str) -> Result<Vec<RevisionSummary>, String> {
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
pub fn test_case_list(db: State<Db>) -> Result<Vec<TestCaseSummary>, String> {
    db.with_conn(list_cases)
}

#[tauri::command]
pub fn test_case_get(db: State<Db>, id: String) -> Result<Option<TestCase>, String> {
    db.with_conn(|conn| get_case(conn, &id))
}

#[tauri::command]
pub fn test_case_create(db: State<Db>, input: TestCaseInput) -> Result<Option<TestCase>, String> {
    let id = db.with_conn(|conn| insert_case(conn, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_case(conn, &id))
}

#[tauri::command]
pub fn test_case_update(
    db: State<Db>,
    id: String,
    input: TestCaseInput,
) -> Result<Option<TestCase>, String> {
    db.with_conn(|conn| update_case(conn, &id, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_case(conn, &id))
}

#[tauri::command]
pub fn test_case_delete(db: State<Db>, id: String) -> Result<(), String> {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE test_cases SET deleted_at = datetime('now') WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    db.persist()
}

#[tauri::command]
pub fn test_case_revisions(db: State<Db>, id: String) -> Result<Vec<RevisionSummary>, String> {
    db.with_conn(|conn| list_revisions(conn, &id))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        c
    }

    fn input(scenario: Option<&str>, title: &str) -> TestCaseInput {
        TestCaseInput {
            scenario_id: scenario.map(String::from),
            title: title.to_string(),
            version: None,
            status: None,
            priority: None,
            author: "Ada Lovelace".to_string(),
            data: serde_json::json!({}),
        }
    }

    #[test]
    fn auto_generates_sequential_scenario_ids() {
        let c = conn();
        let a = insert_case(&c, &input(None, "First")).unwrap();
        let b = insert_case(&c, &input(None, "Second")).unwrap();
        assert_eq!(get_case(&c, &a).unwrap().unwrap().scenario_id, "ATS_001");
        assert_eq!(get_case(&c, &b).unwrap().unwrap().scenario_id, "ATS_002");
    }

    #[test]
    fn respects_provided_scenario_id() {
        let c = conn();
        let id = insert_case(&c, &input(Some("ATS_042"), "Case")).unwrap();
        assert_eq!(get_case(&c, &id).unwrap().unwrap().scenario_id, "ATS_042");
    }

    #[test]
    fn update_bumps_revision_and_snapshots() {
        let c = conn();
        let id = insert_case(&c, &input(None, "Case")).unwrap();
        update_case(&c, &id, &input(Some("ATS_001"), "Case v2")).unwrap();
        let case = get_case(&c, &id).unwrap().unwrap();
        assert_eq!(case.revision, 2);
        assert_eq!(case.title, "Case v2");
        assert_eq!(list_revisions(&c, &id).unwrap().len(), 1);
    }
}
