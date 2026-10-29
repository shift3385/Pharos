//! Local planner repository + Tauri commands (spec §7). A per-project kanban of
//! tasks, defects and test data. Cards move across columns; attachments are
//! stored as blobs inside the encrypted database. Everything is owner-scoped,
//! attachments included (FIX-08). Defect keys come from the project's key
//! counter (DAT-01, ADR-0010).

use base64::Engine as _;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

use crate::db::{ensure_workspace, Db};
use crate::keys::{self, KeyKind};
use crate::oplog;
use crate::project;

const B64: base64::engine::general_purpose::GeneralPurpose =
    base64::engine::general_purpose::STANDARD;
pub(crate) const DEFECT_KEY_PREFIX: &str = "DEF-";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerCard {
    id: String,
    project_id: String,
    kind: String,
    /// Visible id of a defect (DEF-001…), numbered per project; None otherwise.
    card_key: Option<String>,
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
        card_key: row.get("card_key")?,
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
pub(crate) fn list_cards(
    conn: &Connection,
    project_id: &str,
    owner_id: &str,
) -> Result<Vec<PlannerCard>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, kind, card_key, title, status, priority, position, data, \
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
        "SELECT id, project_id, kind, card_key, title, status, priority, position, data, \
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
    if !project::owns(conn, &input.project_id, &input.owner_id)? {
        return Err("project not found".to_string());
    }
    let id = Uuid::new_v4().to_string();
    let workspace_id = ensure_workspace(conn)?;
    let status = input
        .status
        .clone()
        .unwrap_or_else(|| "backlog".to_string());
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
            input
                .priority
                .clone()
                .unwrap_or_else(|| "medium".to_string()),
            position,
            data_str,
        ],
    )
    .map_err(|e| e.to_string())?;
    ensure_defect_key(conn, &id)?;
    oplog::record(
        conn,
        "planner_card",
        &id,
        "upsert",
        "{}",
        1,
        &input.owner_id,
    )?;
    Ok(id)
}

/// Next defect key within a project, from its key counter, so a key is never
/// reused (the matrix shows it).
fn next_defect_key(conn: &Connection, project_id: &str) -> Result<String, String> {
    keys::allocate(conn, KeyKind::Defect, project_id, DEFECT_KEY_PREFIX, 3)
}

/// Gives a defect its key the first time it is a defect (on create, or when a
/// task is re-classified). The key is kept afterwards, even if the kind changes.
fn ensure_defect_key(conn: &Connection, id: &str) -> Result<(), String> {
    let row: Option<(String, String, Option<String>)> = conn
        .query_row(
            "SELECT project_id, kind, card_key FROM planner_cards WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some((project_id, kind, None)) = row {
        if kind == "defect" {
            let key = next_defect_key(conn, &project_id)?;
            conn.execute(
                "UPDATE planner_cards SET card_key = ?2 WHERE id = ?1",
                params![id, key],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn update_card(conn: &Connection, id: &str, input: &PlannerCardInput) -> Result<(), String> {
    let data_str = serde_json::to_string(&input.data).map_err(|e| e.to_string())?;
    let changed = conn
        .execute(
            "UPDATE planner_cards SET kind = ?2, title = ?3, priority = ?4, data = ?5, \
             updated_by = ?6, updated_at = datetime('now'), revision = revision + 1 \
             WHERE id = ?1 AND owner_id = ?6 AND deleted_at IS NULL",
            params![
                id,
                input.kind,
                input.title,
                input
                    .priority
                    .clone()
                    .unwrap_or_else(|| "medium".to_string()),
                data_str,
                input.owner_id,
            ],
        )
        .map_err(|e| e.to_string())?;
    // A foreign or unknown card: nothing to key or journal.
    if changed == 0 {
        return Err("card not found".to_string());
    }
    ensure_defect_key(conn, id)?;
    oplog::record(conn, "planner_card", id, "upsert", "{}", 0, &input.owner_id)?;
    Ok(())
}

/// Persists the order of a column after a drag: every id gets its index as
/// position and the target status (handles both moves and reorders).
fn reorder(conn: &Connection, owner_id: &str, status: &str, ids: &[String]) -> Result<(), String> {
    for (i, id) in ids.iter().enumerate() {
        let moved = conn.execute(
            "UPDATE planner_cards SET status = ?2, position = ?3, \
             updated_at = datetime('now'), revision = revision + 1 \
             WHERE id = ?1 AND owner_id = ?4 AND deleted_at IS NULL",
            params![id, status, i as i64, owner_id],
        )
        .map_err(|e| e.to_string())?;
        // A move changes status/position, which sync carries (SYNC-04a).
        if moved > 0 {
            oplog::record(conn, "planner_card", id, "upsert", "{}", 0, owner_id)?;
        }
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
pub fn planner_create(
    db: State<Db>,
    input: PlannerCardInput,
) -> Result<Option<PlannerCard>, String> {
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

/// Soft-deletes a card the user owns. An unknown or foreign id is an error and
/// leaves no oplog row behind.
fn delete_card(conn: &Connection, id: &str, owner_id: &str) -> Result<(), String> {
    if !owns(conn, id, owner_id)? {
        return Err("card not found".to_string());
    }
    conn.execute(
        "UPDATE planner_cards SET deleted_at = datetime('now'), updated_by = ?2 WHERE id = ?1",
        params![id, owner_id],
    )
    .map_err(|e| e.to_string())?;
    oplog::record(conn, "planner_card", id, "delete", "{}", 0, owner_id)?;
    Ok(())
}

#[tauri::command]
pub fn planner_delete(db: State<Db>, id: String, owner_id: String) -> Result<(), String> {
    db.with_conn(|conn| delete_card(conn, &id, &owner_id))?;
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

/// Attachments of a live card the user owns (none for anyone else).
pub(crate) fn list_attachments(
    conn: &Connection,
    card_id: &str,
    owner_id: &str,
) -> Result<Vec<AttachmentSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.name, a.mime, length(a.bytes) FROM planner_attachments a \
             JOIN planner_cards c ON c.id = a.card_id \
             WHERE a.card_id = ?1 AND c.owner_id = ?2 AND c.deleted_at IS NULL \
             ORDER BY a.created_at",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![card_id, owner_id], |r| {
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

/// Content of an attachment whose card the user owns.
fn get_attachment(
    conn: &Connection,
    id: &str,
    owner_id: &str,
) -> Result<Option<AttachmentData>, String> {
    conn.query_row(
        "SELECT a.name, a.mime, a.bytes FROM planner_attachments a \
         JOIN planner_cards c ON c.id = a.card_id \
         WHERE a.id = ?1 AND c.owner_id = ?2 AND c.deleted_at IS NULL",
        params![id, owner_id],
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
}

/// Removes an attachment whose card the user owns.
fn delete_attachment(conn: &Connection, id: &str, owner_id: &str) -> Result<(), String> {
    let removed = conn
        .execute(
            "DELETE FROM planner_attachments WHERE id = ?1 AND card_id IN \
             (SELECT id FROM planner_cards WHERE owner_id = ?2 AND deleted_at IS NULL)",
            params![id, owner_id],
        )
        .map_err(|e| e.to_string())?;
    if removed == 0 {
        return Err("attachment not found".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn planner_attachment_list(
    db: State<Db>,
    card_id: String,
    owner_id: String,
) -> Result<Vec<AttachmentSummary>, String> {
    db.with_conn(|conn| list_attachments(conn, &card_id, &owner_id))
}

#[tauri::command]
pub fn planner_attachment_get(
    db: State<Db>,
    id: String,
    owner_id: String,
) -> Result<Option<AttachmentData>, String> {
    db.with_conn(|conn| get_attachment(conn, &id, &owner_id))
}

#[tauri::command]
pub fn planner_attachment_delete(
    db: State<Db>,
    id: String,
    owner_id: String,
) -> Result<(), String> {
    db.with_conn(|conn| delete_attachment(conn, &id, &owner_id))?;
    db.persist()
}

#[cfg(test)]
mod tests {
    use super::*;

    const OWNER: &str = "user-1";
    const OTHER: &str = "user-2";

    /// A database with project `p1`, owned by OWNER.
    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        let ws = ensure_workspace(&c).unwrap();
        c.execute(
            "INSERT INTO projects (id, workspace_id, owner_id, name, created_by, updated_by, \
             created_at, updated_at) VALUES ('p1', ?1, ?2, 'P', ?2, ?2, datetime('now'), datetime('now'))",
            params![ws, OWNER],
        )
        .unwrap();
        c
    }

    fn oplog_rows(c: &Connection) -> i64 {
        c.query_row("SELECT count(*) FROM oplog", [], |r| r.get(0))
            .unwrap()
    }

    fn attach(c: &Connection, card_id: &str) -> String {
        let id = Uuid::new_v4().to_string();
        c.execute(
            "INSERT INTO planner_attachments (id, card_id, name, mime, bytes) VALUES (?1,?2,?3,?4,?5)",
            params![id, card_id, "log.txt", "text/plain", b"hello".to_vec()],
        )
        .unwrap();
        id
    }

    #[test]
    fn another_user_can_neither_read_nor_modify_cards_or_attachments() {
        let c = conn();
        let card = insert_card(&c, &input("defect", "Bug", None)).unwrap();
        let file = attach(&c, &card);
        let ops = oplog_rows(&c);

        assert!(list_attachments(&c, &card, OTHER).unwrap().is_empty());
        assert!(get_attachment(&c, &file, OTHER).unwrap().is_none());
        assert!(delete_attachment(&c, &file, OTHER).is_err());
        let mut theirs = input("task", "Hijacked", None);
        theirs.owner_id = OTHER.to_string();
        assert!(insert_card(&c, &theirs).is_err());
        assert!(update_card(&c, &card, &theirs).is_err());
        assert!(delete_card(&c, &card, OTHER).is_err());

        assert_eq!(get_card(&c, &card, OWNER).unwrap().unwrap().title, "Bug");
        assert_eq!(list_attachments(&c, &card, OWNER).unwrap().len(), 1);
        assert!(get_attachment(&c, &file, OWNER).unwrap().is_some());
        assert_eq!(oplog_rows(&c), ops);
    }

    #[test]
    fn deleting_an_unknown_card_fails_without_an_oplog_row() {
        let c = conn();
        assert!(delete_card(&c, "no-such-card", OWNER).is_err());
        assert!(update_card(&c, "no-such-card", &input("defect", "X", None)).is_err());
        assert_eq!(oplog_rows(&c), 0);
    }

    #[test]
    fn defect_keys_are_never_reused() {
        let c = conn();
        let d1 = insert_card(&c, &input("defect", "D1", None)).unwrap();
        delete_card(&c, &d1, OWNER).unwrap();
        let d2 = insert_card(&c, &input("defect", "D2", None)).unwrap();
        assert_eq!(
            get_card(&c, &d2, OWNER)
                .unwrap()
                .unwrap()
                .card_key
                .as_deref(),
            Some("DEF-002")
        );
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
    fn defects_get_sequential_keys_and_tasks_none() {
        let c = conn();
        let task = insert_card(&c, &input("task", "T", None)).unwrap();
        let d1 = insert_card(&c, &input("defect", "D1", None)).unwrap();
        let d2 = insert_card(&c, &input("defect", "D2", None)).unwrap();
        let key = |id: &str| get_card(&c, id, OWNER).unwrap().unwrap().card_key;
        assert_eq!(key(&task), None);
        assert_eq!(key(&d1).as_deref(), Some("DEF-001"));
        assert_eq!(key(&d2).as_deref(), Some("DEF-002"));
        // Re-classifying a task as a defect gives it the next key.
        update_card(&c, &task, &input("defect", "T", None)).unwrap();
        assert_eq!(key(&task).as_deref(), Some("DEF-003"));
    }

    #[test]
    fn reorder_moves_between_columns() {
        let c = conn();
        let a = insert_card(&c, &input("task", "A", Some("backlog"))).unwrap();
        reorder(&c, OWNER, "in_progress", std::slice::from_ref(&a)).unwrap();
        let card = get_card(&c, &a, OWNER).unwrap().unwrap();
        assert_eq!(card.status, "in_progress");
        assert_eq!(card.position, 0);
    }

    #[test]
    fn attachments_roundtrip_and_delete() {
        let c = conn();
        let a = insert_card(&c, &input("defect", "Bug", None)).unwrap();
        let id = attach(&c, &a);
        let list = list_attachments(&c, &a, OWNER).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].size, 5);
        delete_attachment(&c, &id, OWNER).unwrap();
        assert_eq!(list_attachments(&c, &a, OWNER).unwrap().len(), 0);
    }
}
