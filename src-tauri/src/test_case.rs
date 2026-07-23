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
    gherkin_level: String,
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
    project_id: String,
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

/// Next sequential scenario id within a project, using the project's configured
/// literal prefix and padding (e.g. `ATS_001`, `FT001`, `TC-001`). The number is
/// the highest live suffix for that prefix + 1, so an empty project starts at 1
/// and soft-deleted cases do not inflate the counter (spec §5.3 "por proyecto").
fn next_scenario_id(conn: &Connection, project_id: &str) -> Result<String, String> {
    let (prefix, digits): (String, usize) = conn
        .query_row(
            "SELECT case_id_prefix, case_id_digits FROM projects WHERE id = ?1",
            params![project_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? as usize)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| ("ATS_".to_string(), 3));

    let mut stmt = conn
        .prepare(
            "SELECT scenario_id FROM test_cases \
             WHERE project_id = ?1 AND deleted_at IS NULL",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut max: u64 = 0;
    for row in rows {
        let sid = row.map_err(|e| e.to_string())?;
        if let Some(rest) = sid.strip_prefix(&prefix) {
            if let Ok(n) = rest.parse::<u64>() {
                max = max.max(n);
            }
        }
    }
    Ok(format!("{prefix}{:0width$}", max + 1, width = digits))
}

fn list_cases(conn: &Connection, project_id: &str) -> Result<Vec<TestCaseSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, scenario_id, title, status, priority, data, updated_at, revision \
             FROM test_cases WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY scenario_id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |r| {
            let data_str: String = r.get("data")?;
            let gherkin_level = serde_json::from_str::<Value>(&data_str)
                .ok()
                .and_then(|v| v.get("gherkinLevel")?.as_str().map(String::from))
                .unwrap_or_else(|| "basic".to_string());
            Ok(TestCaseSummary {
                id: r.get("id")?,
                scenario_id: r.get("scenario_id")?,
                title: r.get("title")?,
                status: r.get("status")?,
                priority: r.get("priority")?,
                gherkin_level,
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
        _ => next_scenario_id(conn, &input.project_id)?,
    };
    let data_str = serde_json::to_string(&input.data).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, \
         version, status, priority, author, data, created_by, updated_by, created_at, \
         updated_at, revision) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?1, \
         ?1, datetime('now'), datetime('now'), 1)",
        params![
            id,
            workspace_id,
            input.project_id,
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
pub fn test_case_list(
    db: State<Db>,
    project_id: String,
) -> Result<Vec<TestCaseSummary>, String> {
    db.with_conn(|conn| list_cases(conn, &project_id))
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

    /// Inserts a project with the given case-id prefix and returns its id.
    fn project(c: &Connection, prefix: &str) -> String {
        let id = Uuid::new_v4().to_string();
        let ws = crate::db::ensure_workspace(c).unwrap();
        c.execute(
            "INSERT INTO projects (id, workspace_id, name, case_id_prefix, case_id_digits, \
             created_by, updated_by, created_at, updated_at, revision) \
             VALUES (?1, ?2, 'P', ?3, 3, ?1, ?1, datetime('now'), datetime('now'), 1)",
            params![id, ws, prefix],
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
        }
    }

    #[test]
    fn auto_generates_sequential_scenario_ids_per_project() {
        let c = conn();
        let p = project(&c, "ATS_");
        let a = insert_case(&c, &input(&p, None, "First")).unwrap();
        let b = insert_case(&c, &input(&p, None, "Second")).unwrap();
        assert_eq!(get_case(&c, &a).unwrap().unwrap().scenario_id, "ATS_001");
        assert_eq!(get_case(&c, &b).unwrap().unwrap().scenario_id, "ATS_002");
    }

    #[test]
    fn numbering_is_scoped_and_uses_project_prefix() {
        let c = conn();
        let p1 = project(&c, "FT");
        let p2 = project(&c, "TC-");
        let a = insert_case(&c, &input(&p1, None, "A")).unwrap();
        let b = insert_case(&c, &input(&p2, None, "B")).unwrap();
        // Each project numbers independently, from 1, with its own prefix.
        assert_eq!(get_case(&c, &a).unwrap().unwrap().scenario_id, "FT001");
        assert_eq!(get_case(&c, &b).unwrap().unwrap().scenario_id, "TC-001");
    }

    #[test]
    fn soft_deleted_cases_do_not_inflate_numbering() {
        let c = conn();
        let p = project(&c, "ATS_");
        let a = insert_case(&c, &input(&p, None, "A")).unwrap();
        assert_eq!(get_case(&c, &a).unwrap().unwrap().scenario_id, "ATS_001");
        c.execute(
            "UPDATE test_cases SET deleted_at = datetime('now') WHERE id = ?1",
            params![a],
        )
        .unwrap();
        // With the only case deleted, the project is empty again → restarts at 1.
        assert_eq!(next_scenario_id(&c, &p).unwrap(), "ATS_001");
    }

    #[test]
    fn respects_provided_scenario_id() {
        let c = conn();
        let p = project(&c, "ATS_");
        let id = insert_case(&c, &input(&p, Some("ATS_042"), "Case")).unwrap();
        assert_eq!(get_case(&c, &id).unwrap().unwrap().scenario_id, "ATS_042");
    }

    #[test]
    fn update_bumps_revision_and_snapshots() {
        let c = conn();
        let p = project(&c, "ATS_");
        let id = insert_case(&c, &input(&p, None, "Case")).unwrap();
        update_case(&c, &id, &input(&p, Some("ATS_001"), "Case v2")).unwrap();
        let case = get_case(&c, &id).unwrap().unwrap();
        assert_eq!(case.revision, 2);
        assert_eq!(case.title, "Case v2");
        assert_eq!(list_revisions(&c, &id).unwrap().len(), 1);
    }
}
