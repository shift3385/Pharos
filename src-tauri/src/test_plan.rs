//! Test plan repository + Tauri commands (spec §5.1). Scalars are columns; the
//! full 21-step content is a JSON `data` blob. Every update snapshots the prior
//! state into `test_plan_revisions` and bumps `revision`.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

use crate::db::{ensure_workspace, Db};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestPlanSummary {
    id: String,
    title: String,
    version: String,
    status: String,
    updated_at: String,
    revision: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestPlan {
    id: String,
    workspace_id: String,
    project_id: Option<String>,
    title: String,
    version: String,
    plan_date: Option<String>,
    author: String,
    status: String,
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
pub struct TestPlanInput {
    project_id: Option<String>,
    title: String,
    version: Option<String>,
    plan_date: Option<String>,
    author: String,
    status: Option<String>,
    #[serde(default = "empty_object")]
    data: Value,
}

fn empty_object() -> Value {
    Value::Object(serde_json::Map::new())
}

const SELECT_PLAN: &str = "SELECT id, workspace_id, project_id, title, version, plan_date, \
    author, status, data, created_at, updated_at, revision \
    FROM test_plans WHERE id = ?1 AND deleted_at IS NULL";

fn map_plan(row: &rusqlite::Row) -> rusqlite::Result<TestPlan> {
    let data_str: String = row.get("data")?;
    Ok(TestPlan {
        id: row.get("id")?,
        workspace_id: row.get("workspace_id")?,
        project_id: row.get("project_id")?,
        title: row.get("title")?,
        version: row.get("version")?,
        plan_date: row.get("plan_date")?,
        author: row.get("author")?,
        status: row.get("status")?,
        data: serde_json::from_str(&data_str).unwrap_or_else(|_| empty_object()),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        revision: row.get("revision")?,
    })
}

fn list_plans(conn: &Connection) -> Result<Vec<TestPlanSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, version, status, updated_at, revision \
             FROM test_plans WHERE deleted_at IS NULL ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(TestPlanSummary {
                id: r.get("id")?,
                title: r.get("title")?,
                version: r.get("version")?,
                status: r.get("status")?,
                updated_at: r.get("updated_at")?,
                revision: r.get("revision")?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

fn get_plan(conn: &Connection, id: &str) -> Result<Option<TestPlan>, String> {
    conn.query_row(SELECT_PLAN, params![id], map_plan)
        .optional()
        .map_err(|e| e.to_string())
}

/// Returns the (single) plan of a project, if it has one (spec §5.1: 1 project =
/// 1 test plan). Picks the most recently updated if several ever exist.
fn get_plan_by_project(conn: &Connection, project_id: &str) -> Result<Option<TestPlan>, String> {
    conn.query_row(
        "SELECT id, workspace_id, project_id, title, version, plan_date, author, \
         status, data, created_at, updated_at, revision FROM test_plans \
         WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1",
        params![project_id],
        map_plan,
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn insert_plan(conn: &Connection, input: &TestPlanInput) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let workspace_id = ensure_workspace(conn)?;
    let data_str = serde_json::to_string(&input.data).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO test_plans (id, workspace_id, project_id, title, version, plan_date, \
         author, status, data, created_by, updated_by, created_at, updated_at, \
         revision) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?1, ?1, \
         datetime('now'), datetime('now'), 1)",
        params![
            id,
            workspace_id,
            input.project_id,
            input.title,
            input.version.clone().unwrap_or_else(|| "1.0".to_string()),
            input.plan_date,
            input.author,
            input.status.clone().unwrap_or_else(|| "draft".to_string()),
            data_str,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

fn update_plan(conn: &Connection, id: &str, input: &TestPlanInput) -> Result<(), String> {
    let current = conn
        .query_row(
            "SELECT revision, title, data FROM test_plans WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let (revision, prev_title, prev_data) = current.ok_or("test plan not found")?;

    // Snapshot the current state before overwriting it.
    conn.execute(
        "INSERT INTO test_plan_revisions (id, test_plan_id, revision, title, data, \
         created_at, created_by) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), ?2)",
        params![Uuid::new_v4().to_string(), id, revision, prev_title, prev_data],
    )
    .map_err(|e| e.to_string())?;

    let data_str = serde_json::to_string(&input.data).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE test_plans SET title = ?2, version = ?3, plan_date = ?4, author = ?5, \
         status = ?6, data = ?7, updated_at = datetime('now'), updated_by = ?1, \
         revision = ?8 WHERE id = ?1",
        params![
            id,
            input.title,
            input.version.clone().unwrap_or_else(|| "1.0".to_string()),
            input.plan_date,
            input.author,
            input.status.clone().unwrap_or_else(|| "draft".to_string()),
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
            "SELECT id, revision, title, created_at FROM test_plan_revisions \
             WHERE test_plan_id = ?1 ORDER BY revision DESC",
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
pub fn test_plan_list(db: State<Db>) -> Result<Vec<TestPlanSummary>, String> {
    db.with_conn(list_plans)
}

#[tauri::command]
pub fn test_plan_get(db: State<Db>, id: String) -> Result<Option<TestPlan>, String> {
    db.with_conn(|conn| get_plan(conn, &id))
}

#[tauri::command]
pub fn test_plan_by_project(
    db: State<Db>,
    project_id: String,
) -> Result<Option<TestPlan>, String> {
    db.with_conn(|conn| get_plan_by_project(conn, &project_id))
}

#[tauri::command]
pub fn test_plan_create(db: State<Db>, input: TestPlanInput) -> Result<Option<TestPlan>, String> {
    let id = db.with_conn(|conn| insert_plan(conn, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_plan(conn, &id))
}

#[tauri::command]
pub fn test_plan_update(
    db: State<Db>,
    id: String,
    input: TestPlanInput,
) -> Result<Option<TestPlan>, String> {
    db.with_conn(|conn| update_plan(conn, &id, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_plan(conn, &id))
}

#[tauri::command]
pub fn test_plan_delete(db: State<Db>, id: String) -> Result<(), String> {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE test_plans SET deleted_at = datetime('now') WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    db.persist()
}

#[tauri::command]
pub fn test_plan_revisions(db: State<Db>, id: String) -> Result<Vec<RevisionSummary>, String> {
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

    fn input(title: &str, data: Value) -> TestPlanInput {
        TestPlanInput {
            project_id: None,
            title: title.to_string(),
            version: None,
            plan_date: None,
            author: "Ada Lovelace".to_string(),
            status: None,
            data,
        }
    }

    #[test]
    fn create_defaults_and_reads_back_json() {
        let c = conn();
        let id = insert_plan(&c, &input("Plan A", serde_json::json!({"scope": {"in": ["x"]}}))).unwrap();
        let plans = list_plans(&c).unwrap();
        assert_eq!(plans.len(), 1);
        let p = get_plan(&c, &id).unwrap().unwrap();
        assert_eq!(p.title, "Plan A");
        assert_eq!(p.version, "1.0");
        assert_eq!(p.status, "draft");
        assert_eq!(p.revision, 1);
        assert_eq!(p.data["scope"]["in"][0], "x");
    }

    #[test]
    fn update_bumps_revision_and_snapshots_previous() {
        let c = conn();
        let id = insert_plan(&c, &input("Plan A", serde_json::json!({}))).unwrap();
        update_plan(&c, &id, &input("Plan A v2", serde_json::json!({"summary": "hi"}))).unwrap();

        let p = get_plan(&c, &id).unwrap().unwrap();
        assert_eq!(p.revision, 2);
        assert_eq!(p.title, "Plan A v2");

        let revisions = list_revisions(&c, &id).unwrap();
        assert_eq!(revisions.len(), 1);
        assert_eq!(revisions[0].revision, 1);
        assert_eq!(revisions[0].title, "Plan A");
    }

    #[test]
    fn soft_delete_hides_from_list_and_get() {
        let c = conn();
        let id = insert_plan(&c, &input("Plan A", serde_json::json!({}))).unwrap();
        c.execute(
            "UPDATE test_plans SET deleted_at = datetime('now') WHERE id = ?1",
            params![id],
        )
        .unwrap();
        assert!(list_plans(&c).unwrap().is_empty());
        assert!(get_plan(&c, &id).unwrap().is_none());
    }
}
