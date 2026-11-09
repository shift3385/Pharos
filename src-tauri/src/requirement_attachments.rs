//! Images a requirement came from (IA-19): «Requisitos desde diseños» can
//! keep, when the user ticks it, the image the AI read as an attachment of
//! each requirement it created or changed. The content goes to the evidence
//! store (ADR-0014) like a defect's attachment; the row is an `attachments`
//! row owned by the requirement. Attachments do not sync yet (SYNC-04b): a
//! `link` event without an oplog row, as for defects.

use base64::Engine;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Map};
use tauri::State;
#[cfg(test)]
use ts_rs::TS;
use uuid::Uuid;

use crate::db::{ensure_workspace, in_tx, Db};
use crate::evidence;
use crate::journal::{self, Action, Actor};

const REQUIREMENT: &str = "requirement";
/// Largest image returned as a `data:` URL (the images sent to the AI are
/// reduced well below this).
const MAX_PREVIEW_BYTES: i64 = 8 * 1024 * 1024;

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RequirementAttachment {
    pub id: String,
    pub name: String,
    pub mime: Option<String>,
    pub size: i64,
    pub purged: bool,
}

fn err(e: rusqlite::Error) -> String {
    e.to_string()
}

/// The project of a live requirement of a live project owned by `user`.
fn owned(conn: &Connection, requirement_id: &str, user: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT r.project_id FROM requirements r JOIN projects p ON p.id = r.project_id \
         WHERE r.id = ?1 AND p.owner_id = ?2 AND r.deleted_at IS NULL AND p.deleted_at IS NULL",
        params![requirement_id, user],
        |r| r.get(0),
    )
    .optional()
    .map_err(err)?
    .ok_or_else(|| "requirement not found".to_string())
}

pub(crate) fn add_attachment(
    conn: &Connection,
    id: &str,
    requirement_id: &str,
    user: &str,
    name: &str,
    mime: Option<&str>,
    stored: &evidence::Stored,
) -> Result<(), String> {
    let project_id = owned(conn, requirement_id, user)?;
    evidence::record_blob(conn, stored, mime)?;
    evidence::insert_attachment(
        conn,
        &evidence::AttachmentRow {
            id,
            workspace_id: &ensure_workspace(conn)?,
            project_id: &project_id,
            owner_entity: REQUIREMENT,
            owner_id: requirement_id,
            name,
            mime,
            kind: "evidence",
            sha256: &stored.sha256,
            size: stored.size as i64,
            user,
        },
    )?;
    let mut changes = Map::new();
    changes.insert(
        "attachment".into(),
        json!([
            null,
            evidence::attachment_fact(id, name, mime, stored.size as i64, &stored.sha256)
        ]),
    );
    journal::record_event(
        conn,
        Actor::user(user),
        Action::Link,
        REQUIREMENT,
        requirement_id,
        changes,
        None,
    )
}

pub(crate) fn list_attachments(
    conn: &Connection,
    requirement_id: &str,
    user: &str,
) -> Result<Vec<RequirementAttachment>, String> {
    if owned(conn, requirement_id, user).is_err() {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "SELECT id, name, mime, size, blob_purged_at IS NOT NULL FROM attachments
              WHERE owner_entity = 'requirement' AND owner_id = ?1 AND deleted_at IS NULL
              ORDER BY created_at, rowid",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map(params![requirement_id], |r| {
            Ok(RequirementAttachment {
                id: r.get(0)?,
                name: r.get(1)?,
                mime: r.get(2)?,
                size: r.get(3)?,
                purged: r.get(4)?,
            })
        })
        .map_err(err)?;
    rows.collect::<rusqlite::Result<_>>().map_err(err)
}

/// (mime, size, sha256, purged) of a live attachment of a live requirement
/// the user owns.
fn owned_attachment(
    conn: &Connection,
    id: &str,
    user: &str,
) -> Result<Option<(Option<String>, i64, String, bool)>, String> {
    conn.query_row(
        "SELECT a.mime, a.size, a.sha256, a.blob_purged_at IS NOT NULL
           FROM attachments a JOIN requirements r ON r.id = a.owner_id
           JOIN projects p ON p.id = r.project_id
          WHERE a.id = ?1 AND a.owner_entity = 'requirement' AND a.deleted_at IS NULL
            AND r.deleted_at IS NULL AND p.owner_id = ?2 AND p.deleted_at IS NULL",
        params![id, user],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )
    .optional()
    .map_err(err)
}

/// Attaches a finished upload (`evidence_upload_*`) to a requirement the
/// user owns, as `defect_attachment_add` does.
#[tauri::command(async)]
pub fn requirement_attachment_add(
    db: State<'_, Db>,
    uploads: State<'_, evidence::Uploads>,
    requirement_id: String,
    user_id: String,
    upload_id: String,
    name: String,
    mime: Option<String>,
) -> Result<Option<RequirementAttachment>, String> {
    let mut upload = uploads.take(&upload_id)?;
    upload.seal()?;
    let id = Uuid::new_v4().to_string();
    let stored = db.with_conn(|conn| {
        owned(conn, &requirement_id, &user_id)?;
        let committed = upload.commit(db.evidence())?;
        let stored = committed.stored;
        let added = in_tx(conn, |tx| {
            add_attachment(
                tx,
                &id,
                &requirement_id,
                &user_id,
                &name,
                mime.as_deref(),
                &stored,
            )
        });
        if let Err(e) = added {
            if committed.wrote && !evidence::is_known(conn, &stored.sha256)? {
                db.evidence().remove(&stored.sha256)?;
            }
            return Err(e);
        }
        Ok(stored)
    })?;
    db.persist()?;
    Ok(Some(RequirementAttachment {
        id,
        name,
        mime,
        size: stored.size as i64,
        purged: false,
    }))
}

#[tauri::command]
pub fn requirement_attachment_list(
    db: State<Db>,
    requirement_id: String,
    user_id: String,
) -> Result<Vec<RequirementAttachment>, String> {
    db.with_conn(|conn| list_attachments(conn, &requirement_id, &user_id))
}

/// A `data:` URL of an image attachment, to show the source; None for other
/// files, large ones, or a content that is not here.
#[tauri::command(async)]
pub fn requirement_attachment_preview(
    db: State<'_, Db>,
    id: String,
    user_id: String,
) -> Result<Option<String>, String> {
    let Some((mime, size, sha256, purged)) =
        db.with_conn(|conn| owned_attachment(conn, &id, &user_id))?
    else {
        return Ok(None);
    };
    let Some(mime) = mime.filter(|m| m.starts_with("image/") && !m.contains("svg")) else {
        return Ok(None);
    };
    if purged || size > MAX_PREVIEW_BYTES || !db.evidence().is_stored(&sha256, size as u64) {
        return Ok(None);
    }
    let mut bytes = Vec::with_capacity(size as usize);
    if db.evidence().copy_to(&sha256, &mut bytes).is_err() {
        return Ok(None);
    }
    Ok(Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    const USER: &str = "user-1";
    const OTHER: &str = "user-2";

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        let ws = ensure_workspace(&c).unwrap();
        c.execute(
            "INSERT INTO projects (id, workspace_id, owner_id, name, created_by, updated_by, \
             created_at, updated_at) VALUES ('p1', ?1, ?2, 'P', ?2, ?2, datetime('now'), datetime('now'))",
            params![ws, USER],
        )
        .unwrap();
        c.execute(
            "INSERT INTO requirements (id, workspace_id, project_id, requirement_key, title, description, \
             priority, data, created_by, updated_by, created_at, updated_at) \
             VALUES ('r1', ?1, 'p1', 'REQ-001', 'Login', '', 'high', '{}', ?2, ?2, datetime('now'), datetime('now'))",
            params![ws, USER],
        )
        .unwrap();
        c
    }

    fn stored(sha: &str) -> evidence::Stored {
        evidence::Stored {
            sha256: sha.to_string(),
            size: 10,
        }
    }

    #[test]
    fn an_attachment_belongs_to_its_requirement_and_owner() {
        let c = conn();
        add_attachment(&c, "a1", "r1", USER, "boceto.webp", Some("image/webp"), &stored("s1")).unwrap();
        let list = list_attachments(&c, "r1", USER).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "boceto.webp");
        assert!(!list[0].purged);
        // Another user sees nothing and cannot attach.
        assert!(list_attachments(&c, "r1", OTHER).unwrap().is_empty());
        assert!(add_attachment(&c, "a2", "r1", OTHER, "x.png", None, &stored("s2")).is_err());
        assert!(owned_attachment(&c, "a1", OTHER).unwrap().is_none());
        assert_eq!(owned_attachment(&c, "a1", USER).unwrap().unwrap().2, "s1");
    }

    #[test]
    fn a_deleted_requirement_has_no_attachments() {
        let c = conn();
        add_attachment(&c, "a1", "r1", USER, "boceto.webp", Some("image/webp"), &stored("s1")).unwrap();
        c.execute("UPDATE requirements SET deleted_at = datetime('now') WHERE id = 'r1'", [])
            .unwrap();
        assert!(list_attachments(&c, "r1", USER).unwrap().is_empty());
        assert!(owned_attachment(&c, "a1", USER).unwrap().is_none());
    }
}
