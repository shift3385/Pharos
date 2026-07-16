//! Profile repository + Tauri commands (spec §3). Audit fields (created_at,
//! updated_at, revision) are filled automatically.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::Db;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    id: String,
    workspace_id: String,
    display_name: String,
    first_name: String,
    last_name: String,
    role: String,
    created_by: String,
    updated_by: String,
    created_at: String,
    updated_at: String,
    revision: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    display_name: String,
    first_name: String,
    last_name: String,
    role: Option<String>,
}

const SELECT_PROFILE: &str = "SELECT id, workspace_id, display_name, first_name, \
    last_name, role, created_by, updated_by, created_at, updated_at, revision \
    FROM profiles WHERE deleted_at IS NULL LIMIT 1";

fn map_profile(row: &rusqlite::Row) -> rusqlite::Result<Profile> {
    Ok(Profile {
        id: row.get("id")?,
        workspace_id: row.get("workspace_id")?,
        display_name: row.get("display_name")?,
        first_name: row.get("first_name")?,
        last_name: row.get("last_name")?,
        role: row.get("role")?,
        created_by: row.get("created_by")?,
        updated_by: row.get("updated_by")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        revision: row.get("revision")?,
    })
}

fn current_profile(conn: &Connection) -> Result<Option<Profile>, String> {
    conn.query_row(SELECT_PROFILE, [], map_profile)
        .optional()
        .map_err(|e| e.to_string())
}

fn ensure_workspace(conn: &Connection) -> Result<String, String> {
    if let Some(id) = conn
        .query_row("SELECT id FROM workspaces LIMIT 1", [], |r| {
            r.get::<_, String>(0)
        })
        .optional()
        .map_err(|e| e.to_string())?
    {
        return Ok(id);
    }
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO workspaces (id, name) VALUES (?1, ?2)",
        params![id, "My workspace"],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

/// Inserts or updates the single profile, filling audit fields automatically:
/// `created_at`/`updated_at` = now, `revision` starts at 1 and increments on
/// each update. Extracted from the command so it can be unit-tested.
fn upsert_profile(
    conn: &Connection,
    display_name: &str,
    first_name: &str,
    last_name: &str,
    role: &str,
) -> Result<(), String> {
    let workspace_id = ensure_workspace(conn)?;
    let existing = conn
        .query_row(
            "SELECT id, revision FROM profiles WHERE deleted_at IS NULL LIMIT 1",
            [],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    match existing {
        Some((id, revision)) => {
            conn.execute(
                "UPDATE profiles SET display_name = ?1, first_name = ?2, \
                 last_name = ?3, role = ?4, updated_at = datetime('now'), \
                 updated_by = ?5, revision = ?6 WHERE id = ?5",
                params![display_name, first_name, last_name, role, id, revision + 1],
            )
            .map_err(|e| e.to_string())?;
        }
        None => {
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO profiles (id, workspace_id, display_name, first_name, \
                 last_name, role, created_by, updated_by, created_at, updated_at, \
                 revision) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?1, ?1, \
                 datetime('now'), datetime('now'), 1)",
                params![id, workspace_id, display_name, first_name, last_name, role],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn profile_get(db: State<Db>) -> Result<Option<Profile>, String> {
    db.with_conn(current_profile)
}

#[tauri::command]
pub fn profile_upsert(db: State<Db>, input: ProfileInput) -> Result<Option<Profile>, String> {
    let role = input.role.unwrap_or_else(|| "test_manager".to_string());
    db.with_conn(|conn| {
        upsert_profile(
            conn,
            &input.display_name,
            &input.first_name,
            &input.last_name,
            &role,
        )
    })?;
    db.persist()?;
    db.with_conn(current_profile)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn conn_with_schema() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn insert_fills_audit_fields() {
        let conn = conn_with_schema();
        upsert_profile(&conn, "Ally", "Alice", "Anderson", "test_manager").unwrap();
        let p = current_profile(&conn).unwrap().unwrap();
        assert_eq!(p.revision, 1);
        assert!(!p.created_at.is_empty());
        assert!(!p.updated_at.is_empty());
        assert_eq!(p.created_by, p.id); // self-authored in v0.0.1
    }

    #[test]
    fn update_bumps_revision_and_keeps_identity() {
        let conn = conn_with_schema();
        upsert_profile(&conn, "Ally", "Alice", "Anderson", "test_manager").unwrap();
        let first = current_profile(&conn).unwrap().unwrap();

        upsert_profile(&conn, "Ally B.", "Alice", "Anderson", "tester").unwrap();
        let second = current_profile(&conn).unwrap().unwrap();

        assert_eq!(second.id, first.id);
        assert_eq!(second.revision, 2);
        assert_eq!(second.display_name, "Ally B.");
        assert_eq!(second.role, "tester");
    }

    #[test]
    fn get_returns_none_when_empty() {
        let conn = conn_with_schema();
        assert!(current_profile(&conn).unwrap().is_none());
    }
}
