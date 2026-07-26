//! Local planner repository + Tauri commands (spec §7). A per-project kanban of
//! tasks, defects and test data. Cards move across columns; attachments are
//! stored as blobs inside the encrypted database. Everything is owner-scoped.

use base64::Engine as _;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

use crate::db::{ensure_workspace, Db};

const B64: base64::engine::general_purpose::GeneralPurpose =
    base64::engine::general_purpose::STANDARD;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerCard {
    id: String,
    project_id: String,
    kind: String,
    title: String,
    status: String,
    priority: String,
    position: i64,
    data: Value,
    created_at: String,
    updated_at: String,
    revision: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerCardInput {
    project_id: String,
    owner_id: String,
    kind: String,
    title: String,
    status: Option<String>,
    priority: Option<String>,
    #[serde(default = "empty_object")]
    data: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentSummary {
    id: String,
    name: String,
    mime: Option<String>,
    size: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentData {
    name: String,
    mime: Option<String>,
    data_base64: String,
}

fn empty_object() -> Value {
    Value::Object(serde_json::Map::new())
}

fn map_card(row: &rusqlite::Row) -> rusqlite::Result<PlannerCard> {
    let data_str: String = row.get("data")?;
    Ok(PlannerCard {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        kind: row.get("kind")?,
        title: row.get("title")?,
        status: row.get("status")?,
        priority: row.get("priority")?,
        position: row.get("position")?,
        data: serde_json::from_str(&data_str).unwrap_or_else(|_| empty_object()),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        revision: row.get("revision")?,
    })
}

/// Cards of a project, owner-scoped, ordered for the board.
fn list_cards(
    conn: &Connection,
    project_id: &str,
    owner_id: &str,
) -> Result<Vec<PlannerCard>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, kind, title, status, priority, position, data, \
             created_at, updated_at, revision FROM planner_cards \
             WHERE project_id = ?1 AND owner_id = ?2 AND deleted_at IS NULL \
             ORDER BY position, created_at",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id, owner_id], map_card)
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

fn get_card(conn: &Connection, id: &str, owner_id: &str) -> Result<Option<PlannerCard>, String> {
    conn.query_row(
        "SELECT id, project_id, kind, title, status, priority, position, data, \
         created_at, updated_at, revision FROM planner_cards \
         WHERE id = ?1 AND owner_id = ?2 AND deleted_at IS NULL",
        params![id, owner_id],
        map_card,
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn owns(conn: &Connection, id: &str, owner_id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM planner_cards WHERE id = ?1 AND owner_id = ?2 AND deleted_at IS NULL",
        params![id, owner_id],
        |_| Ok(()),
    )
    .optional()
    .map_err(|e| e.to_string())
    .map(|r| r.is_some())
}

fn insert_card(conn: &Connection, input: &PlannerCardInput) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let workspace_id = ensure_workspace(conn)?;
    let status = input.status.clone().unwrap_or_else(|| "backlog".to_string());
    // Append to the bottom of its column.
    let position: i64 = conn
        .query_row(
            "SELECT coalesce(max(position), -1) + 1 FROM planner_cards \
             WHERE project_id = ?1 AND owner_id = ?2 AND status = ?3 AND deleted_at IS NULL",
            params![input.project_id, input.owner_id, status],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let data_str = serde_json::to_string(&input.data).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO planner_cards (id, workspace_id, project_id, owner_id, kind, title, \
         status, priority, position, data, created_by, updated_by, created_at, updated_at, \
         revision) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?4, ?4, \
         datetime('now'), datetime('now'), 1)",
        params![
            id,
            workspace_id,
            input.project_id,
            input.owner_id,
            input.kind,
            input.title,
            status,
            input.priority.clone().unwrap_or_else(|| "medium".to_string()),
            position,
            data_str,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

fn update_card(conn: &Connection, id: &str, input: &PlannerCardInput) -> Result<(), String> {
    let data_str = serde_json::to_string(&input.data).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE planner_cards SET kind = ?2, title = ?3, priority = ?4, data = ?5, \
         updated_by = ?6, updated_at = datetime('now'), revision = revision + 1 \
         WHERE id = ?1 AND owner_id = ?6 AND deleted_at IS NULL",
        params![
            id,
            input.kind,
            input.title,
            input.priority.clone().unwrap_or_else(|| "medium".to_string()),
            data_str,
            input.owner_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Persists the order of a column after a drag: every id gets its index as
/// position and the target status (handles both moves and reorders).
fn reorder(
    conn: &Connection,
    owner_id: &str,
    status: &str,
    ids: &[String],
) -> Result<(), String> {
    for (i, id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE planner_cards SET status = ?2, position = ?3, \
             updated_at = datetime('now'), revision = revision + 1 \
             WHERE id = ?1 AND owner_id = ?4 AND deleted_at IS NULL",
            params![id, status, i as i64, owner_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---- Commands ----

#[tauri::command]
pub fn planner_list(
    db: State<Db>,
    project_id: String,
    owner_id: String,
) -> Result<Vec<PlannerCard>, String> {
    db.with_conn(|conn| list_cards(conn, &project_id, &owner_id))
}

#[tauri::command]
pub fn planner_create(db: State<Db>, input: PlannerCardInput) -> Result<Option<PlannerCard>, String> {
    let owner = input.owner_id.clone();
    let id = db.with_conn(|conn| insert_card(conn, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_card(conn, &id, &owner))
}

#[tauri::command]
pub fn planner_update(
    db: State<Db>,
    id: String,
    input: PlannerCardInput,
) -> Result<Option<PlannerCard>, String> {
    let owner = input.owner_id.clone();
    db.with_conn(|conn| update_card(conn, &id, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_card(conn, &id, &owner))
}

#[tauri::command]
pub fn planner_delete(db: State<Db>, id: String, owner_id: String) -> Result<(), String> {
    db.with_conn(|conn| {
        if !owns(conn, &id, &owner_id)? {
            return Err("card not found".to_string());
        }
        conn.execute(
            "UPDATE planner_cards SET deleted_at = datetime('now') WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    db.persist()
}

#[tauri::command]
pub fn planner_reorder(
    db: State<Db>,
    owner_id: String,
    status: String,
    ids: Vec<String>,
) -> Result<(), String> {
    db.with_conn(|conn| reorder(conn, &owner_id, &status, &ids))?;
    db.persist()
}

#[tauri::command]
pub fn planner_attachment_add(
    db: State<Db>,
    card_id: String,
    owner_id: String,
    name: String,
    mime: Option<String>,
    data_base64: String,
) -> Result<Option<AttachmentSummary>, String> {
    let bytes = B64.decode(data_base64).map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    db.with_conn(|conn| {
        if !owns(conn, &card_id, &owner_id)? {
            return Err("card not found".to_string());
        }
        conn.execute(
            "INSERT INTO planner_attachments (id, card_id, name, mime, bytes) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, card_id, name, mime, bytes],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    db.persist()?;
    Ok(Some(AttachmentSummary {
        id,
        name,
        mime,
        size: bytes.len() as i64,
    }))
}

fn list_attachments(conn: &Connection, card_id: &str) -> Result<Vec<AttachmentSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, mime, length(bytes) FROM planner_attachments \
             WHERE card_id = ?1 ORDER BY created_at",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![card_id], |r| {
            Ok(AttachmentSummary {
                id: r.get(0)?,
                name: r.get(1)?,
                mime: r.get(2)?,
                size: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn planner_attachment_list(
    db: State<Db>,
    card_id: String,
) -> Result<Vec<AttachmentSummary>, String> {
    db.with_conn(|conn| list_attachments(conn, &card_id))
}

#[tauri::command]
pub fn planner_attachment_get(
    db: State<Db>,
    id: String,
) -> Result<Option<AttachmentData>, String> {
    db.with_conn(|conn| {
        conn.query_row(
            "SELECT name, mime, bytes FROM planner_attachments WHERE id = ?1",
            params![id],
            |r| {
                let bytes: Vec<u8> = r.get(2)?;
                Ok(AttachmentData {
                    name: r.get(0)?,
                    mime: r.get(1)?,
                    data_base64: B64.encode(bytes),
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn planner_attachment_delete(db: State<Db>, id: String) -> Result<(), String> {
    db.with_conn(|conn| {
        conn.execute("DELETE FROM planner_attachments WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    db.persist()
}

#[cfg(test)]
mod tests {
    use super::*;

    const OWNER: &str = "user-1";

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        c
    }

    fn input(kind: &str, title: &str, status: Option<&str>) -> PlannerCardInput {
        PlannerCardInput {
            project_id: "p1".to_string(),
            owner_id: OWNER.to_string(),
            kind: kind.to_string(),
            title: title.to_string(),
            status: status.map(String::from),
            priority: None,
            data: serde_json::json!({}),
        }
    }

    #[test]
    fn creates_and_lists_scoped_by_project_and_owner() {
        let c = conn();
        insert_card(&c, &input("task", "A", None)).unwrap();
        insert_card(&c, &input("defect", "B", None)).unwrap();
        let cards = list_cards(&c, "p1", OWNER).unwrap();
        assert_eq!(cards.len(), 2);
        // Appended within the same column with increasing positions.
        assert_eq!(cards[0].position, 0);
        assert_eq!(cards[1].position, 1);
        // Another user sees nothing.
        assert_eq!(list_cards(&c, "p1", "user-2").unwrap().len(), 0);
    }

    #[test]
    fn reorder_moves_between_columns() {
        let c = conn();
        let a = insert_card(&c, &input("task", "A", Some("backlog"))).unwrap();
        reorder(&c, OWNER, "in_progress", &[a.clone()]).unwrap();
        let card = get_card(&c, &a, OWNER).unwrap().unwrap();
        assert_eq!(card.status, "in_progress");
        assert_eq!(card.position, 0);
    }

    #[test]
    fn attachments_roundtrip_and_delete() {
        let c = conn();
        let a = insert_card(&c, &input("defect", "Bug", None)).unwrap();
        let id = Uuid::new_v4().to_string();
        c.execute(
            "INSERT INTO planner_attachments (id, card_id, name, mime, bytes) VALUES (?1,?2,?3,?4,?5)",
            params![id, a, "log.txt", "text/plain", b"hello".to_vec()],
        )
        .unwrap();
        let list = list_attachments(&c, &a).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].size, 5);
        c.execute("DELETE FROM planner_attachments WHERE id = ?1", params![id])
            .unwrap();
        assert_eq!(list_attachments(&c, &a).unwrap().len(), 0);
    }
}
