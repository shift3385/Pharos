//! Local planner repository + Tauri commands (spec §7). A per-project kanban of
//! tasks, defects and test data. Cards move across columns; attachment contents
//! live encrypted in the evidence store (`evidence/`, ADR-0014) and their rows in
//! `attachments` (`owner_entity = 'planner_card'`). Everything is owner-scoped,
//! attachments included (FIX-08). Defect keys come from the project's key
//! counter (DAT-01, ADR-0010).

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
#[cfg(test)]
use ts_rs::TS;
use uuid::Uuid;

use crate::db::{ensure_workspace, in_tx, Db};
use crate::downloads::{Downloads, SaveResult};
use crate::evidence;
use crate::journal::{self, Action, Actor, Change};
use crate::keys::{self, KeyKind};
use crate::project;

pub(crate) const DEFECT_KEY_PREFIX: &str = "DEF-";

#[cfg_attr(test, derive(TS), ts(export))]
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
    #[cfg_attr(test, ts(type = "unknown"))]
    data: Value,
    created_at: String,
    updated_at: String,
    revision: i64,
}

#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
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
    #[cfg_attr(test, ts(type = "unknown"))]
    data: Value,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentSummary {
    id: String,
    name: String,
    mime: Option<String>,
    size: i64,
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

pub(crate) fn insert_card(conn: &Connection, input: &PlannerCardInput) -> Result<String, String> {
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
    let owner = &input.owner_id;
    journal::record(
        conn,
        Change::new(
            "planner_card",
            &id,
            Action::Create,
            Actor::user(owner),
            "upsert",
            1,
            owner,
        ),
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

pub(crate) fn update_card(
    conn: &Connection,
    id: &str,
    input: &PlannerCardInput,
) -> Result<(), String> {
    let before = journal::snapshot(conn, "planner_card", id)?;
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
    let owner = &input.owner_id;
    journal::record(
        conn,
        Change::new(
            "planner_card",
            id,
            Action::Update,
            Actor::user(owner),
            "upsert",
            0,
            owner,
        )
        .before(before),
    )?;
    Ok(())
}

/// Persists the order of a column after a drag: every id gets its index as
/// position and the target status (handles both moves and reorders).
pub(crate) fn reorder(
    conn: &Connection,
    owner_id: &str,
    status: &str,
    ids: &[String],
) -> Result<(), String> {
    for (i, id) in ids.iter().enumerate() {
        let before = journal::snapshot(conn, "planner_card", id)?;
        let moved = conn
            .execute(
                "UPDATE planner_cards SET status = ?2, position = ?3, \
             updated_at = datetime('now'), revision = revision + 1 \
             WHERE id = ?1 AND owner_id = ?4 AND deleted_at IS NULL",
                params![id, status, i as i64, owner_id],
            )
            .map_err(|e| e.to_string())?;
        // A move changes status/position, which sync carries (SYNC-04a).
        if moved > 0 {
            journal::record(
                conn,
                Change::new(
                    "planner_card",
                    id,
                    Action::Update,
                    Actor::user(owner_id),
                    "upsert",
                    0,
                    owner_id,
                )
                .before(before),
            )?;
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
    let id = db.with_tx(|conn| insert_card(conn, &input))?;
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
    db.with_tx(|conn| update_card(conn, &id, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_card(conn, &id, &owner))
}

/// Soft-deletes a card the user owns. An unknown or foreign id is an error and
/// leaves no oplog row behind.
pub(crate) fn delete_card(conn: &Connection, id: &str, owner_id: &str) -> Result<(), String> {
    if !owns(conn, id, owner_id)? {
        return Err("card not found".to_string());
    }
    let before = journal::snapshot(conn, "planner_card", id)?;
    conn.execute(
        "UPDATE planner_cards SET deleted_at = datetime('now'), updated_by = ?2 WHERE id = ?1",
        params![id, owner_id],
    )
    .map_err(|e| e.to_string())?;
    journal::record(
        conn,
        Change::new(
            "planner_card",
            id,
            Action::Delete,
            Actor::user(owner_id),
            "delete",
            0,
            owner_id,
        )
        .before(before),
    )?;
    Ok(())
}

#[tauri::command]
pub fn planner_delete(db: State<Db>, id: String, owner_id: String) -> Result<(), String> {
    db.with_tx(|conn| delete_card(conn, &id, &owner_id))?;
    db.persist()
}

#[tauri::command]
pub fn planner_reorder(
    db: State<Db>,
    owner_id: String,
    status: String,
    ids: Vec<String>,
) -> Result<(), String> {
    db.with_tx(|conn| reorder(conn, &owner_id, &status, &ids))?;
    db.persist()
}

/// Attaches a finished upload (`evidence_upload_*`) to a card the user owns.
/// The upload is sealed off the lock, moved into the store under it (so a
/// concurrent `collect` cannot remove it before its row exists), and the row,
/// its `blobs` entry and the `link` event are written in one transaction.
#[tauri::command(async)]
pub fn planner_attachment_add(
    db: State<'_, Db>,
    uploads: State<'_, evidence::Uploads>,
    card_id: String,
    owner_id: String,
    upload_id: String,
    name: String,
    mime: Option<String>,
) -> Result<Option<AttachmentSummary>, String> {
    let mut upload = uploads.take(&upload_id)?;
    upload.seal()?;
    let id = Uuid::new_v4().to_string();
    let stored = db.with_conn(|conn| {
        let card = NewAttachment {
            id: &id,
            card_id: &card_id,
            owner_id: &owner_id,
            name: &name,
            mime: mime.as_deref(),
        };
        attach_upload(conn, db.evidence(), upload, &card)
    })?;
    db.persist()?;
    Ok(Some(AttachmentSummary {
        id,
        name,
        mime,
        size: stored.size as i64,
    }))
}

/// The row `attach_upload` writes for an upload.
struct NewAttachment<'a> {
    id: &'a str,
    card_id: &'a str,
    owner_id: &'a str,
    name: &'a str,
    mime: Option<&'a str>,
}

/// Moves a sealed upload into the store and attaches it, under the database
/// lock (`conn`). If attaching fails, the file is removed only when this
/// upload wrote it and nothing knows that content: a copy that was already
/// stored (another attachment's, or one a moved-aside database needs) stays.
fn attach_upload(
    conn: &Connection,
    store: &evidence::EvidenceStore,
    upload: evidence::BlobWriter,
    new: &NewAttachment,
) -> Result<evidence::Stored, String> {
    if !owns(conn, new.card_id, new.owner_id)? {
        return Err("card not found".to_string());
    }
    let committed = upload.commit(store)?;
    let stored = committed.stored;
    let added = in_tx(conn, |tx| {
        add_attachment(
            tx,
            new.id,
            new.card_id,
            new.owner_id,
            new.name,
            new.mime,
            &stored,
        )
    });
    if let Err(e) = added {
        if committed.wrote && !evidence::is_known(conn, &stored.sha256)? {
            store.remove(&stored.sha256)?;
        }
        return Err(e);
    }
    Ok(stored)
}

/// Attachments of a live card the user owns (none for anyone else).
pub(crate) fn list_attachments(
    conn: &Connection,
    card_id: &str,
    owner_id: &str,
) -> Result<Vec<AttachmentSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.name, a.mime, a.size FROM attachments a \
             JOIN planner_cards c ON c.id = a.owner_id \
             WHERE a.owner_entity = 'planner_card' AND a.owner_id = ?1 AND a.deleted_at IS NULL \
             AND c.owner_id = ?2 AND c.deleted_at IS NULL \
             ORDER BY a.created_at, a.rowid",
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

/// A live attachment of a live card the user owns.
struct OwnedAttachment {
    card_id: String,
    name: String,
    mime: Option<String>,
    size: i64,
    sha256: String,
    purged: bool,
}

fn owned_attachment(
    conn: &Connection,
    id: &str,
    owner_id: &str,
) -> Result<Option<OwnedAttachment>, String> {
    conn.query_row(
        "SELECT a.owner_id, a.name, a.mime, a.size, a.sha256, a.blob_purged_at IS NOT NULL \
         FROM attachments a JOIN planner_cards c ON c.id = a.owner_id \
         WHERE a.id = ?1 AND a.owner_entity = 'planner_card' AND a.deleted_at IS NULL \
         AND c.owner_id = ?2 AND c.deleted_at IS NULL",
        params![id, owner_id],
        |r| {
            Ok(OwnedAttachment {
                card_id: r.get(0)?,
                name: r.get(1)?,
                mime: r.get(2)?,
                size: r.get(3)?,
                sha256: r.get(4)?,
                purged: r.get(5)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// Attaches stored content to a card the user owns. Attachments do not sync
/// yet (SYNC-04b, ADR-0014), so this is an audit event without an oplog row.
pub(crate) fn add_attachment(
    conn: &Connection,
    id: &str,
    card_id: &str,
    owner_id: &str,
    name: &str,
    mime: Option<&str>,
    stored: &evidence::Stored,
) -> Result<(), String> {
    let card: Option<(String, String)> = conn
        .query_row(
            "SELECT workspace_id, project_id FROM planner_cards \
             WHERE id = ?1 AND owner_id = ?2 AND deleted_at IS NULL",
            params![card_id, owner_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((workspace_id, project_id)) = card else {
        return Err("card not found".to_string());
    };
    evidence::record_blob(conn, stored, mime)?;
    conn.execute(
        "INSERT INTO attachments (id, workspace_id, project_id, sha256, size, mime, name, \
         owner_entity, owner_id, kind, created_by, updated_by, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'planner_card', ?8, 'evidence', ?9, ?9, \
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        params![
            id,
            workspace_id,
            project_id,
            stored.sha256,
            stored.size as i64,
            mime,
            name,
            card_id,
            owner_id
        ],
    )
    .map_err(|e| e.to_string())?;
    let mut changes = serde_json::Map::new();
    changes.insert(
        "attachment".into(),
        serde_json::json!([
            null,
            evidence::attachment_fact(id, name, mime, stored.size as i64, &stored.sha256)
        ]),
    );
    journal::record_event(
        conn,
        Actor::user(owner_id),
        Action::Link,
        "planner_card",
        card_id,
        changes,
        None,
    )
}

/// Removes an attachment whose card the user owns (soft delete, so the row
/// can sync later); its content is released when nothing else uses it and
/// its file goes with the next `collect`.
pub(crate) fn delete_attachment(conn: &Connection, id: &str, owner_id: &str) -> Result<(), String> {
    let Some(found) = owned_attachment(conn, id, owner_id)? else {
        return Err("attachment not found".to_string());
    };
    conn.execute(
        "UPDATE attachments SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_by = ?2, \
         revision = revision + 1 WHERE id = ?1",
        params![id, owner_id],
    )
    .map_err(|e| e.to_string())?;
    evidence::release(conn, &found.sha256)?;
    let mut changes = serde_json::Map::new();
    changes.insert(
        "attachment".into(),
        serde_json::json!([
            evidence::attachment_fact(
                id,
                &found.name,
                found.mime.as_deref(),
                found.size,
                &found.sha256
            ),
            null
        ]),
    );
    journal::record_event(
        conn,
        Actor::user(owner_id),
        Action::Unlink,
        "planner_card",
        &found.card_id,
        changes,
        None,
    )
}

#[tauri::command]
pub fn planner_attachment_list(
    db: State<Db>,
    card_id: String,
    owner_id: String,
) -> Result<Vec<AttachmentSummary>, String> {
    db.with_conn(|conn| list_attachments(conn, &card_id, &owner_id))
}

/// Saves an attachment into the download folder (with Mark-of-the-Web),
/// decrypted block by block straight to disk: the bytes never pass through
/// the webview and the file is never whole in memory. The content is checked
/// against its sha256 before the saved file gets its name.
#[tauri::command(async)]
pub fn planner_attachment_save(
    db: State<'_, Db>,
    downloads: State<'_, Downloads>,
    id: String,
    owner_id: String,
) -> Result<SaveResult, String> {
    let found = db
        .with_conn(|conn| owned_attachment(conn, &id, &owner_id))?
        .ok_or("attachment not found")?;
    if found.purged {
        return Err(format!(
            "{}: the file was removed by the retention policy",
            evidence::EVIDENCE_MISSING
        ));
    }
    // Fail before reserving a name in the download folder.
    db.evidence().open(&found.sha256)?;
    let saved = downloads.save_with(&found.name, true, &|out| {
        db.evidence().copy_to(&found.sha256, out).map(drop)
    })?;
    tracing::info!(
        bytes = found.size,
        "attachment saved to the download folder"
    );
    Ok(saved)
}

#[tauri::command]
pub fn planner_attachment_delete(
    db: State<Db>,
    id: String,
    owner_id: String,
) -> Result<(), String> {
    db.with_tx(|conn| delete_attachment(conn, &id, &owner_id))?;
    db.persist_and_collect()
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

    /// Attaches "hello" (its content is not stored: these tests are about rows).
    fn attach(c: &Connection, card_id: &str) -> String {
        let id = Uuid::new_v4().to_string();
        let stored = evidence::Stored {
            sha256: crate::audit::sha256_hex(b"hello"),
            size: 5,
        };
        add_attachment(
            c,
            &id,
            card_id,
            OWNER,
            "log.txt",
            Some("text/plain"),
            &stored,
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
        assert!(owned_attachment(&c, &file, OTHER).unwrap().is_none());
        assert!(delete_attachment(&c, &file, OTHER).is_err());
        let mut theirs = input("task", "Hijacked", None);
        theirs.owner_id = OTHER.to_string();
        assert!(insert_card(&c, &theirs).is_err());
        assert!(update_card(&c, &card, &theirs).is_err());
        assert!(delete_card(&c, &card, OTHER).is_err());

        assert_eq!(get_card(&c, &card, OWNER).unwrap().unwrap().title, "Bug");
        assert_eq!(list_attachments(&c, &card, OWNER).unwrap().len(), 1);
        assert!(owned_attachment(&c, &file, OWNER).unwrap().is_some());
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
        // Soft-deleted (the row can sync later); its content is released.
        let state: String = c
            .query_row(
                "SELECT b.local_state FROM attachments a JOIN blobs b ON b.sha256 = a.sha256 \
                 WHERE a.id = ?1 AND a.deleted_at IS NOT NULL",
                params![id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(state, "deleting");
    }

    #[test]
    fn a_failed_attach_removes_only_a_file_it_wrote() {
        let dir = std::env::temp_dir().join(format!("pharos-attach-{}", Uuid::new_v4()));
        let store = evidence::EvidenceStore::new(&dir, &[3u8; 32]);
        let c = conn();
        let card = insert_card(&c, &input("defect", "Bug", None)).unwrap();
        let existing = attach(&c, &card); // takes the id the failing attach reuses
        let upload = |bytes: &[u8]| {
            let mut w = store.writer(evidence::MAX_FILE_BYTES).unwrap();
            w.write(bytes).unwrap();
            w.seal().unwrap();
            w
        };
        let new = |name: &'static str| NewAttachment {
            id: &existing,
            card_id: &card,
            owner_id: OWNER,
            name,
            mime: None,
        };
        // Content already on disk (and unknown to this database): the failed
        // attach found it there and must leave it alone.
        let foreign = store
            .put(&b"foreign"[..], evidence::MAX_FILE_BYTES)
            .unwrap();
        assert!(attach_upload(&c, &store, upload(b"foreign"), &new("a")).is_err());
        assert!(store.exists(&foreign.sha256));
        // A content this attach wrote and nothing knows: removed.
        let fresh = crate::audit::sha256_hex(b"fresh");
        assert!(attach_upload(&c, &store, upload(b"fresh"), &new("b")).is_err());
        assert!(!store.exists(&fresh));
        // And a working attach keeps its file.
        let ok = NewAttachment {
            id: "ok",
            card_id: &card,
            owner_id: OWNER,
            name: "ok.txt",
            mime: None,
        };
        let stored = attach_upload(&c, &store, upload(b"fresh"), &ok).unwrap();
        assert!(store.exists(&stored.sha256));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn attachments_of_a_deleted_card_are_hidden_but_keep_their_content() {
        let c = conn();
        let a = insert_card(&c, &input("defect", "Bug", None)).unwrap();
        let id = attach(&c, &a);
        delete_card(&c, &a, OWNER).unwrap();
        assert!(list_attachments(&c, &a, OWNER).unwrap().is_empty());
        assert!(owned_attachment(&c, &id, OWNER).unwrap().is_none());
        // The card may come back through a conflict: nothing is released.
        let state: String = c
            .query_row("SELECT local_state FROM blobs", [], |r| r.get(0))
            .unwrap();
        assert_eq!(state, "present");
    }
}
