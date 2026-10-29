//! Test plan repository + Tauri commands (spec §5.1). Scalars are columns; the
//! full 21-step content is a JSON `data` blob. Every update snapshots the prior
//! state into `test_plan_revisions` and bumps `revision`.
//!
//! A plan belongs to its project's owner: every function takes the signed-in
//! `user_id` and only touches plans of projects that user owns (FIX-08). Audit
//! fields record that user, never the plan itself (FIX-06).

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
#[cfg(test)]
use ts_rs::TS;
use uuid::Uuid;

use crate::db::{ensure_workspace, Db};
use crate::oplog;
use crate::project;

#[cfg_attr(test, derive(TS), ts(export))]
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

#[cfg_attr(test, derive(TS), ts(export))]
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
    #[cfg_attr(test, ts(type = "unknown"))]
    data: Value,
    created_at: String,
    updated_at: String,
    revision: i64,
}

#[cfg_attr(test, derive(TS), ts(export, rename = "TestPlanRevisionSummary"))]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionSummary {
    id: String,
    revision: i64,
    title: String,
    created_at: String,
}

#[cfg_attr(test, derive(TS), ts(export, rename = "TestPlanRevisionDetail"))]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionDetail {
    id: String,
    revision: i64,
    title: String,
    #[cfg_attr(test, ts(type = "unknown"))]
    data: Value,
    created_at: String,
}

#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestPlanInput {
    project_id: Option<String>,
    title: String,
    version: Option<String>,
    plan_date: Option<String>,
    /// Name printed on the document; not an id.
    author: String,
    status: Option<String>,
    #[serde(default = "empty_object")]
    #[cfg_attr(test, ts(type = "unknown"))]
    data: Value,
    /// Signed-in user making the change (owner check + audit fields).
    user_id: String,
}

fn empty_object() -> Value {
    Value::Object(serde_json::Map::new())
}

/// Live plans of live projects owned by `?2` (`?1` filters by plan id).
const SELECT_PLAN: &str = "SELECT t.id, t.workspace_id, t.project_id, t.title, t.version, \
    t.plan_date, t.author, t.status, t.data, t.created_at, t.updated_at, t.revision \
    FROM test_plans t JOIN projects p ON p.id = t.project_id \
    WHERE t.id = ?1 AND p.owner_id = ?2 AND t.deleted_at IS NULL AND p.deleted_at IS NULL";

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

/// True when the plan is live and its project is owned by `user_id`.
fn owns(conn: &Connection, id: &str, user_id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM test_plans t JOIN projects p ON p.id = t.project_id \
         WHERE t.id = ?1 AND p.owner_id = ?2 AND t.deleted_at IS NULL AND p.deleted_at IS NULL",
        params![id, user_id],
        |_| Ok(()),
    )
    .optional()
    .map_err(|e| e.to_string())
    .map(|r| r.is_some())
}

pub(crate) fn list_plans(conn: &Connection, user_id: &str) -> Result<Vec<TestPlanSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.title, t.version, t.status, t.updated_at, t.revision \
             FROM test_plans t JOIN projects p ON p.id = t.project_id \
             WHERE p.owner_id = ?1 AND t.deleted_at IS NULL AND p.deleted_at IS NULL \
             ORDER BY t.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![user_id], |r| {
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

fn get_plan(conn: &Connection, id: &str, user_id: &str) -> Result<Option<TestPlan>, String> {
    conn.query_row(SELECT_PLAN, params![id, user_id], map_plan)
        .optional()
        .map_err(|e| e.to_string())
}

/// Returns the (single) plan of a project, if it has one (spec §5.1: 1 project =
/// 1 test plan). Picks the most recently updated if several ever exist.
pub(crate) fn get_plan_by_project(
    conn: &Connection,
    project_id: &str,
    user_id: &str,
) -> Result<Option<TestPlan>, String> {
    if !project::owns(conn, project_id, user_id)? {
        return Ok(None);
    }
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

/// Creates a plan inside a project the user owns. A plan without a project
/// would be visible to nobody, so it is refused.
fn insert_plan(conn: &Connection, input: &TestPlanInput) -> Result<String, String> {
    let project_id = input.project_id.as_deref().unwrap_or_default();
    if !project::owns(conn, project_id, &input.user_id)? {
        return Err("project not found".to_string());
    }
    let id = Uuid::new_v4().to_string();
    let workspace_id = ensure_workspace(conn)?;
    let data_str = serde_json::to_string(&input.data).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO test_plans (id, workspace_id, project_id, title, version, plan_date, \
         author, status, data, created_by, updated_by, created_at, updated_at, \
         revision) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, \
         datetime('now'), datetime('now'), 1)",
        params![
            id,
            workspace_id,
            project_id,
            input.title,
            input.version.clone().unwrap_or_else(|| "1.0".to_string()),
            input.plan_date,
            input.author,
            input.status.clone().unwrap_or_else(|| "draft".to_string()),
            data_str,
            input.user_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    oplog::record(conn, "test_plan", &id, "upsert", "{}", 1, &input.user_id)?;
    Ok(id)
}

fn update_plan(conn: &Connection, id: &str, input: &TestPlanInput) -> Result<(), String> {
    if !owns(conn, id, &input.user_id)? {
        return Err("test plan not found".to_string());
    }
    let (revision, prev_title, prev_data) = conn
        .query_row(
            "SELECT revision, title, data FROM test_plans WHERE id = ?1",
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

    // Snapshot the current state before overwriting it.
    conn.execute(
        "INSERT INTO test_plan_revisions (id, test_plan_id, revision, title, data, \
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
        "UPDATE test_plans SET title = ?2, version = ?3, plan_date = ?4, author = ?5, \
         status = ?6, data = ?7, updated_at = datetime('now'), updated_by = ?9, \
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
            input.user_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    oplog::record(
        conn,
        "test_plan",
        id,
        "upsert",
        "{}",
        revision + 1,
        &input.user_id,
    )?;
    Ok(())
}

/// Soft-deletes a plan the user owns. An unknown or foreign id is an error and
/// leaves no oplog row behind.
fn delete_plan(conn: &Connection, id: &str, user_id: &str) -> Result<(), String> {
    if !owns(conn, id, user_id)? {
        return Err("test plan not found".to_string());
    }
    conn.execute(
        "UPDATE test_plans SET deleted_at = datetime('now'), updated_by = ?2 WHERE id = ?1",
        params![id, user_id],
    )
    .map_err(|e| e.to_string())?;
    oplog::record(conn, "test_plan", id, "delete", "{}", 0, user_id)?;
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

/// Full content of a single revision (title + snapshotted 21-field data), for
/// restoring it into the editor.
fn get_revision(
    conn: &Connection,
    id: &str,
    user_id: &str,
) -> Result<Option<RevisionDetail>, String> {
    conn.query_row(
        "SELECT r.id, r.revision, r.title, r.data, r.created_at FROM test_plan_revisions r \
         JOIN test_plans t ON t.id = r.test_plan_id JOIN projects p ON p.id = t.project_id \
         WHERE r.id = ?1 AND p.owner_id = ?2 AND t.deleted_at IS NULL AND p.deleted_at IS NULL",
        params![id, user_id],
        |r| {
            let data_str: String = r.get(3)?;
            Ok(RevisionDetail {
                id: r.get(0)?,
                revision: r.get(1)?,
                title: r.get(2)?,
                data: serde_json::from_str(&data_str).unwrap_or_else(|_| empty_object()),
                created_at: r.get(4)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn test_plan_list(db: State<Db>, user_id: String) -> Result<Vec<TestPlanSummary>, String> {
    db.with_conn(|conn| list_plans(conn, &user_id))
}

#[tauri::command]
pub fn test_plan_get(
    db: State<Db>,
    id: String,
    user_id: String,
) -> Result<Option<TestPlan>, String> {
    db.with_conn(|conn| get_plan(conn, &id, &user_id))
}

#[tauri::command]
pub fn test_plan_by_project(
    db: State<Db>,
    project_id: String,
    user_id: String,
) -> Result<Option<TestPlan>, String> {
    db.with_conn(|conn| get_plan_by_project(conn, &project_id, &user_id))
}

#[tauri::command]
pub fn test_plan_create(db: State<Db>, input: TestPlanInput) -> Result<Option<TestPlan>, String> {
    let id = db.with_conn(|conn| insert_plan(conn, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_plan(conn, &id, &input.user_id))
}

#[tauri::command]
pub fn test_plan_update(
    db: State<Db>,
    id: String,
    input: TestPlanInput,
) -> Result<Option<TestPlan>, String> {
    db.with_conn(|conn| update_plan(conn, &id, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_plan(conn, &id, &input.user_id))
}

#[tauri::command]
pub fn test_plan_delete(db: State<Db>, id: String, user_id: String) -> Result<(), String> {
    db.with_conn(|conn| delete_plan(conn, &id, &user_id))?;
    db.persist()
}

#[tauri::command]
pub fn test_plan_revisions(
    db: State<Db>,
    id: String,
    user_id: String,
) -> Result<Vec<RevisionSummary>, String> {
    db.with_conn(|conn| list_revisions(conn, &id, &user_id))
}

#[tauri::command]
pub fn test_plan_revision_get(
    db: State<Db>,
    id: String,
    user_id: String,
) -> Result<Option<RevisionDetail>, String> {
    db.with_conn(|conn| get_revision(conn, &id, &user_id))
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

    /// A project owned by `owner`; returns its id.
    fn project(c: &Connection, owner: &str) -> String {
        let id = Uuid::new_v4().to_string();
        let ws = ensure_workspace(c).unwrap();
        c.execute(
            "INSERT INTO projects (id, workspace_id, owner_id, name, created_by, updated_by, \
             created_at, updated_at) VALUES (?1, ?2, ?3, 'P', ?3, ?3, datetime('now'), datetime('now'))",
            params![id, ws, owner],
        )
        .unwrap();
        id
    }

    fn input(project_id: &str, title: &str, data: Value) -> TestPlanInput {
        TestPlanInput {
            project_id: Some(project_id.to_string()),
            title: title.to_string(),
            version: None,
            plan_date: None,
            author: "Ada Lovelace".to_string(),
            status: None,
            data,
            user_id: USER.to_string(),
        }
    }

    fn oplog_rows(c: &Connection) -> i64 {
        c.query_row("SELECT count(*) FROM oplog", [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn create_defaults_and_reads_back_json() {
        let c = conn();
        let p = project(&c, USER);
        let id = insert_plan(
            &c,
            &input(&p, "Plan A", serde_json::json!({"scope": {"in": ["x"]}})),
        )
        .unwrap();
        let plans = list_plans(&c, USER).unwrap();
        assert_eq!(plans.len(), 1);
        let p = get_plan(&c, &id, USER).unwrap().unwrap();
        assert_eq!(p.title, "Plan A");
        assert_eq!(p.version, "1.0");
        assert_eq!(p.status, "draft");
        assert_eq!(p.revision, 1);
        assert_eq!(p.data["scope"]["in"][0], "x");
    }

    #[test]
    fn update_bumps_revision_and_snapshots_previous() {
        let c = conn();
        let p = project(&c, USER);
        let id = insert_plan(&c, &input(&p, "Plan A", serde_json::json!({}))).unwrap();
        update_plan(
            &c,
            &id,
            &input(&p, "Plan A v2", serde_json::json!({"summary": "hi"})),
        )
        .unwrap();

        let plan = get_plan(&c, &id, USER).unwrap().unwrap();
        assert_eq!(plan.revision, 2);
        assert_eq!(plan.title, "Plan A v2");

        let revisions = list_revisions(&c, &id, USER).unwrap();
        assert_eq!(revisions.len(), 1);
        assert_eq!(revisions[0].revision, 1);
        assert_eq!(revisions[0].title, "Plan A");

        // The snapshot keeps the full content so it can be restored.
        let detail = get_revision(&c, &revisions[0].id, USER).unwrap().unwrap();
        assert_eq!(detail.title, "Plan A");
        assert_eq!(detail.data, serde_json::json!({}));
    }

    #[test]
    fn soft_delete_hides_from_list_and_get() {
        let c = conn();
        let p = project(&c, USER);
        let id = insert_plan(&c, &input(&p, "Plan A", serde_json::json!({}))).unwrap();
        delete_plan(&c, &id, USER).unwrap();
        assert!(list_plans(&c, USER).unwrap().is_empty());
        assert!(get_plan(&c, &id, USER).unwrap().is_none());
    }

    #[test]
    fn audit_fields_record_the_user_not_the_plan() {
        let c = conn();
        let p = project(&c, USER);
        let id = insert_plan(&c, &input(&p, "Plan A", serde_json::json!({}))).unwrap();
        update_plan(&c, &id, &input(&p, "Plan B", serde_json::json!({}))).unwrap();
        let (created_by, updated_by): (String, String) = c
            .query_row(
                "SELECT created_by, updated_by FROM test_plans WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!((created_by.as_str(), updated_by.as_str()), (USER, USER));
        let snapshot_by: String = c
            .query_row(
                "SELECT created_by FROM test_plan_revisions WHERE test_plan_id = ?1",
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
    fn another_user_can_neither_read_nor_modify_the_plan() {
        let c = conn();
        let p = project(&c, USER);
        let id = insert_plan(&c, &input(&p, "Private", serde_json::json!({}))).unwrap();
        update_plan(&c, &id, &input(&p, "Private v2", serde_json::json!({}))).unwrap();
        let revision_id = list_revisions(&c, &id, USER).unwrap()[0].id.clone();
        let ops = oplog_rows(&c);

        assert!(list_plans(&c, OTHER).unwrap().is_empty());
        assert!(get_plan(&c, &id, OTHER).unwrap().is_none());
        assert!(get_plan_by_project(&c, &p, OTHER).unwrap().is_none());
        assert!(list_revisions(&c, &id, OTHER).unwrap().is_empty());
        assert!(get_revision(&c, &revision_id, OTHER).unwrap().is_none());

        let mut theirs = input(&p, "Hijacked", serde_json::json!({}));
        theirs.user_id = OTHER.to_string();
        assert!(insert_plan(&c, &theirs).is_err());
        assert!(update_plan(&c, &id, &theirs).is_err());
        assert!(delete_plan(&c, &id, OTHER).is_err());

        assert_eq!(
            get_plan(&c, &id, USER).unwrap().unwrap().title,
            "Private v2"
        );
        assert_eq!(oplog_rows(&c), ops);
    }

    #[test]
    fn deleting_an_unknown_plan_fails_without_an_oplog_row() {
        let c = conn();
        assert!(delete_plan(&c, "no-such-plan", USER).is_err());
        assert_eq!(oplog_rows(&c), 0);
    }

    #[test]
    fn a_plan_needs_a_project() {
        let c = conn();
        let mut orphan = input("", "Orphan", serde_json::json!({}));
        orphan.project_id = None;
        assert!(insert_plan(&c, &orphan).is_err());
    }
}
