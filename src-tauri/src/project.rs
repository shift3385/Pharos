//! Project repository + Tauri commands (spec §5.1). A project is a container
//! ("folder") that holds one test plan and its test cases. It also stores the
//! per-project case id numbering config (literal prefix + zero-padding width).

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::{ensure_workspace, Db};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    id: String,
    name: String,
    case_id_prefix: String,
    case_id_digits: i64,
    updated_at: String,
    revision: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    id: String,
    workspace_id: String,
    name: String,
    case_id_prefix: String,
    case_id_digits: i64,
    created_at: String,
    updated_at: String,
    revision: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInput {
    name: String,
    case_id_prefix: Option<String>,
    case_id_digits: Option<i64>,
    /// Authenticated user that owns the project (set on create; never changed
    /// by an update).
    owner_id: Option<String>,
}

const DEFAULT_PREFIX: &str = "ATS_";
const DEFAULT_DIGITS: i64 = 3;

fn map_project(row: &rusqlite::Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get("id")?,
        workspace_id: row.get("workspace_id")?,
        name: row.get("name")?,
        case_id_prefix: row.get("case_id_prefix")?,
        case_id_digits: row.get("case_id_digits")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        revision: row.get("revision")?,
    })
}

/// Only the owner sees a project (collaboration roles arrive with sync, Fase 8).
fn list_projects(conn: &Connection, owner_id: &str) -> Result<Vec<ProjectSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, case_id_prefix, case_id_digits, updated_at, revision \
             FROM projects WHERE owner_id = ?1 AND deleted_at IS NULL \
             ORDER BY name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![owner_id], |r| {
            Ok(ProjectSummary {
                id: r.get("id")?,
                name: r.get("name")?,
                case_id_prefix: r.get("case_id_prefix")?,
                case_id_digits: r.get("case_id_digits")?,
                updated_at: r.get("updated_at")?,
                revision: r.get("revision")?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

fn get_project(
    conn: &Connection,
    id: &str,
    owner_id: &str,
) -> Result<Option<Project>, String> {
    conn.query_row(
        "SELECT id, workspace_id, name, case_id_prefix, case_id_digits, \
         created_at, updated_at, revision FROM projects \
         WHERE id = ?1 AND owner_id = ?2 AND deleted_at IS NULL",
        params![id, owner_id],
        map_project,
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn insert_project(conn: &Connection, input: &ProjectInput) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let workspace_id = ensure_workspace(conn)?;
    let prefix = input
        .case_id_prefix
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_PREFIX.to_string());
    let digits = input.case_id_digits.filter(|d| *d > 0).unwrap_or(DEFAULT_DIGITS);
    conn.execute(
        "INSERT INTO projects (id, workspace_id, owner_id, name, case_id_prefix, \
         case_id_digits, created_by, updated_by, created_at, updated_at, revision) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?1, ?1, datetime('now'), datetime('now'), 1)",
        params![
            id,
            workspace_id,
            input.owner_id.clone().unwrap_or_default(),
            input.name,
            prefix,
            digits
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

/// Guards mutations: only the owner may update or delete a project.
fn owns(conn: &Connection, id: &str, owner_id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM projects WHERE id = ?1 AND owner_id = ?2 AND deleted_at IS NULL",
        params![id, owner_id],
        |_| Ok(()),
    )
    .optional()
    .map_err(|e| e.to_string())
    .map(|r| r.is_some())
}

fn update_project(conn: &Connection, id: &str, input: &ProjectInput) -> Result<(), String> {
    let revision: i64 = conn
        .query_row(
            "SELECT revision FROM projects WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("project not found")?;
    let prefix = input
        .case_id_prefix
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_PREFIX.to_string());
    let digits = input.case_id_digits.filter(|d| *d > 0).unwrap_or(DEFAULT_DIGITS);
    conn.execute(
        "UPDATE projects SET name = ?2, case_id_prefix = ?3, case_id_digits = ?4, \
         updated_at = datetime('now'), updated_by = ?1, revision = ?5 WHERE id = ?1",
        params![id, input.name, prefix, digits, revision + 1],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Soft-deletes a project and cascades the soft-delete to its plan, cases and
/// planner cards so nothing is left orphaned (the hard-delete purge runs later).
fn delete_project(conn: &Connection, id: &str) -> Result<(), String> {
    for table in ["projects", "test_plans", "test_cases", "planner_cards"] {
        let sql = format!(
            "UPDATE {table} SET deleted_at = datetime('now') \
             WHERE {} = ?1 AND deleted_at IS NULL",
            if table == "projects" { "id" } else { "project_id" }
        );
        conn.execute(&sql, params![id]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn project_list(db: State<Db>, owner_id: String) -> Result<Vec<ProjectSummary>, String> {
    db.with_conn(|conn| list_projects(conn, &owner_id))
}

#[tauri::command]
pub fn project_get(
    db: State<Db>,
    id: String,
    owner_id: String,
) -> Result<Option<Project>, String> {
    db.with_conn(|conn| get_project(conn, &id, &owner_id))
}

#[tauri::command]
pub fn project_create(db: State<Db>, input: ProjectInput) -> Result<Option<Project>, String> {
    let owner = input.owner_id.clone().unwrap_or_default();
    let id = db.with_conn(|conn| insert_project(conn, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_project(conn, &id, &owner))
}

#[tauri::command]
pub fn project_update(
    db: State<Db>,
    id: String,
    input: ProjectInput,
) -> Result<Option<Project>, String> {
    let owner = input.owner_id.clone().unwrap_or_default();
    db.with_conn(|conn| {
        if !owns(conn, &id, &owner)? {
            return Err("project not found".to_string());
        }
        update_project(conn, &id, &input)
    })?;
    db.persist()?;
    db.with_conn(|conn| get_project(conn, &id, &owner))
}

#[tauri::command]
pub fn project_delete(db: State<Db>, id: String, owner_id: String) -> Result<(), String> {
    db.with_conn(|conn| {
        if !owns(conn, &id, &owner_id)? {
            return Err("project not found".to_string());
        }
        delete_project(conn, &id)
    })?;
    db.persist()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        c
    }

    const OWNER: &str = "user-1";

    fn input(name: &str, prefix: Option<&str>) -> ProjectInput {
        ProjectInput {
            name: name.to_string(),
            case_id_prefix: prefix.map(String::from),
            case_id_digits: None,
            owner_id: Some(OWNER.to_string()),
        }
    }

    #[test]
    fn creates_project_with_default_numbering() {
        let c = conn();
        let id = insert_project(&c, &input("Checkout", None)).unwrap();
        let p = get_project(&c, &id, OWNER).unwrap().unwrap();
        assert_eq!(p.name, "Checkout");
        assert_eq!(p.case_id_prefix, "ATS_");
        assert_eq!(p.case_id_digits, 3);
        assert_eq!(p.revision, 1);
    }

    #[test]
    fn stores_custom_prefix() {
        let c = conn();
        let id = insert_project(&c, &input("Billing", Some("TC-"))).unwrap();
        assert_eq!(
            get_project(&c, &id, OWNER).unwrap().unwrap().case_id_prefix,
            "TC-"
        );
    }

    #[test]
    fn update_bumps_revision() {
        let c = conn();
        let id = insert_project(&c, &input("X", None)).unwrap();
        update_project(&c, &id, &input("X renamed", Some("FT"))).unwrap();
        let p = get_project(&c, &id, OWNER).unwrap().unwrap();
        assert_eq!(p.revision, 2);
        assert_eq!(p.name, "X renamed");
        assert_eq!(p.case_id_prefix, "FT");
    }

    #[test]
    fn delete_hides_project() {
        let c = conn();
        let id = insert_project(&c, &input("Temp", None)).unwrap();
        delete_project(&c, &id).unwrap();
        assert!(get_project(&c, &id, OWNER).unwrap().is_none());
        assert_eq!(list_projects(&c, OWNER).unwrap().len(), 0);
    }

    #[test]
    fn another_user_cannot_see_or_touch_the_project() {
        let c = conn();
        let id = insert_project(&c, &input("Private", None)).unwrap();
        // A different signed-in user sees nothing and is not the owner.
        assert!(get_project(&c, &id, "user-2").unwrap().is_none());
        assert_eq!(list_projects(&c, "user-2").unwrap().len(), 0);
        assert!(!owns(&c, &id, "user-2").unwrap());
        assert!(owns(&c, &id, OWNER).unwrap());
    }
}
