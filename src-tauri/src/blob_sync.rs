//! Attachments and templates in sync (SYNC-04b, ADR-0042 §7, ADR-0014).
//!
//! Their rows sync as `lww` documents that name a content by sha256; the
//! content itself never enters the oplog. Before a push the device uploads
//! the contents the workspace does not hold yet (`POST /blobs/missing`, then
//! `PUT /blobs/:sha`); a pulled document whose content is not here gets a
//! `blobs` row in `remote_only`, and the transfer downloads it into the
//! evidence store (`GET /blobs/:sha`), where it turns `present`.
//!
//! Both wait for a server that lists the `blobs` feature. Attachments of a
//! manual execution draft stay local until the draft becomes a result.

use std::collections::BTreeMap;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::State;
#[cfg(test)]
use ts_rs::TS;

use crate::db::Db;
use crate::evidence::{self, EvidenceStore};
use crate::journal::{self, Action, Actor, Audit, Change};
use crate::server::ServerState;

pub const ATTACHMENT: &str = "attachment";
pub const TEMPLATE: &str = "template";

/// Entities of this module (both lww).
pub const ENTITIES: [&str; 2] = [ATTACHMENT, TEMPLATE];

/// The server feature that stores them (`sync.version.ts`).
pub(crate) const BLOBS: &str = "blobs";

/// The owner of an attachment of a manual execution draft (`runs/manual.rs`):
/// local until the draft is saved as a result.
const DRAFT_OWNER: &str = "execution_draft";

fn err(e: impl ToString) -> String {
    e.to_string()
}

/// `ENTITIES` as an SQL list literal, for `entity IN (...)`.
pub(crate) fn entities_sql_list() -> String {
    ENTITIES
        .iter()
        .map(|e| format!("'{e}'"))
        .collect::<Vec<_>>()
        .join(",")
}

pub(crate) fn table_for(entity: &str) -> Option<&'static str> {
    Some(match entity {
        ATTACHMENT => "attachments",
        TEMPLATE => "templates",
        _ => return None,
    })
}

/// Owner of an attachment: its project's owner (ADR-0020 rule 1). Templates
/// have their own (`oplog::owner_of`).
pub(crate) fn owner_sql(entity: &str) -> Option<&'static str> {
    match entity {
        ATTACHMENT => Some(
            "SELECT p.owner_id FROM attachments x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1",
        ),
        _ => None,
    }
}

/// Queues an attachment change for the push, with no audit event of its own:
/// its owner's change (a card, a defect, a result) already left one. The
/// account's role must allow adding attachments (ADR-0042 §6). A draft's
/// attachment is not queued.
pub(crate) fn queue_attachment(
    conn: &Connection,
    user: &str,
    id: &str,
    op: &str,
    is_new: bool,
) -> Result<(), String> {
    let row: Option<(String, i64)> = conn
        .query_row(
            "SELECT owner_entity, revision FROM attachments WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(err)?;
    let Some((owner, revision)) = row else {
        return Ok(());
    };
    if owner == DRAFT_OWNER {
        return Ok(());
    }
    let action = match (op, is_new) {
        ("delete", _) => Action::Delete,
        (_, true) => Action::Create,
        _ => Action::Update,
    };
    let mut change = Change::new(
        ATTACHMENT,
        id,
        action,
        Actor::user(user),
        op,
        revision,
        user,
    );
    change.audit = Audit::Folded;
    journal::record(conn, change)
}

/// The lww payload of an attachment or template (camelCase), its revision and
/// deleted flag. None if the row is gone. Retention (`blob_purged_at`) is a
/// local policy and does not travel.
pub(crate) fn read_payload(
    conn: &Connection,
    entity: &str,
    id: &str,
) -> Result<Option<(Value, i64, bool)>, String> {
    let Some(table) = table_for(entity) else {
        return Ok(None);
    };
    conn.query_row(
        &format!("SELECT * FROM {table} WHERE id = ?1"),
        params![id],
        |r| {
            let s = |c: &str| r.get::<_, Option<String>>(c);
            let payload = if entity == ATTACHMENT {
                json!({
                    "id": s("id")?, "workspaceId": s("workspace_id")?, "projectId": s("project_id")?,
                    "sha256": s("sha256")?, "size": r.get::<_, i64>("size")?, "mime": s("mime")?,
                    "name": s("name")?, "ownerEntity": s("owner_entity")?, "ownerId": s("owner_id")?,
                    "kind": s("kind")?, "createdBy": s("created_by")?,
                    "createdAt": s("created_at")?, "updatedAt": s("updated_at")?,
                    "revision": r.get::<_, i64>("revision")?,
                })
            } else {
                json!({
                    "id": s("id")?, "workspaceId": s("workspace_id")?, "kind": s("kind")?,
                    "language": s("language")?, "name": s("name")?,
                    "description": s("description")?, "usagePrompt": s("usage_prompt")?,
                    "version": s("version")?, "sha256": s("sha256")?,
                    "size": r.get::<_, Option<i64>>("size")?, "mime": s("mime")?,
                    "createdAt": s("created_at")?, "updatedAt": s("updated_at")?,
                    "revision": r.get::<_, i64>("revision")?,
                })
            };
            Ok((
                payload,
                r.get::<_, i64>("revision")?,
                s("deleted_at")?.is_some(),
            ))
        },
    )
    .optional()
    .map_err(err)
}

fn ps<'a>(p: &'a Value, k: &str) -> Option<&'a str> {
    p.get(k).and_then(Value::as_str)
}

fn valid_sha(v: &str) -> bool {
    v.len() == 64 && v.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// A content a pulled document names: known as `remote_only` until the
/// transfer downloads it. Content already here keeps its state.
fn expect_content(
    conn: &Connection,
    sha: &str,
    size: i64,
    mime: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO blobs (sha256, size, mime, local_state, stored_at)
         VALUES (?1, ?2, ?3, 'remote_only', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (sha256) DO UPDATE SET local_state = 'remote_only'
          WHERE blobs.local_state = 'deleting'",
        params![sha, size, mime],
    )
    .map(drop)
    .map_err(err)
}

/// Overwrites the local row of a pulled document (`sync::write_doc`). The
/// row belongs to the account that pulled it (`owner_id` of a template,
/// `created_by`/`updated_by` of an attachment, FIX-06). A document without a
/// valid content hash is skipped rather than failing the pull.
pub(crate) fn write_doc(
    conn: &Connection,
    workspace_id: &str,
    user: &str,
    entity: &str,
    id: &str,
    p: &Value,
    revision: i64,
) -> Result<(), String> {
    let Some(sha) = ps(p, "sha256").filter(|s| valid_sha(s)) else {
        return Ok(());
    };
    let size = p.get("size").and_then(Value::as_i64).unwrap_or(0).max(0);
    let mime = ps(p, "mime");
    match entity {
        ATTACHMENT => {
            conn.execute(
                "INSERT INTO attachments (id, workspace_id, project_id, sha256, size, mime, name,
                        owner_entity, owner_id, kind, created_by, updated_by, created_at, updated_at,
                        deleted_at, revision)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11,
                        coalesce(?12, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                        coalesce(?13, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), NULL, ?14)
                 ON CONFLICT(id) DO UPDATE SET workspace_id=excluded.workspace_id,
                        project_id=excluded.project_id, sha256=excluded.sha256, size=excluded.size,
                        mime=excluded.mime, name=excluded.name, owner_entity=excluded.owner_entity,
                        owner_id=excluded.owner_id, kind=excluded.kind, updated_by=excluded.updated_by,
                        updated_at=excluded.updated_at, deleted_at=NULL, revision=excluded.revision",
                params![
                    id,
                    workspace_id,
                    ps(p, "projectId").unwrap_or_default(),
                    sha,
                    size,
                    mime,
                    ps(p, "name").unwrap_or("attachment"),
                    ps(p, "ownerEntity").unwrap_or_default(),
                    ps(p, "ownerId").unwrap_or_default(),
                    ps(p, "kind").unwrap_or("evidence"),
                    user,
                    ps(p, "createdAt"),
                    ps(p, "updatedAt"),
                    revision,
                ],
            )
            .map_err(err)?;
        }
        TEMPLATE => {
            let kind = ps(p, "kind").filter(|k| matches!(*k, "plan" | "case"));
            let Some(kind) = kind else {
                return Ok(());
            };
            conn.execute(
                "INSERT INTO templates (id, workspace_id, kind, language, name, description,
                        usage_prompt, version, sha256, size, mime, file, is_builtin, owner_id,
                        created_at, updated_at, deleted_at, revision)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, x'', 0, ?12,
                        coalesce(?13, datetime('now')), coalesce(?14, datetime('now')), NULL, ?15)
                 ON CONFLICT(id) DO UPDATE SET workspace_id=excluded.workspace_id,
                        kind=excluded.kind, language=excluded.language, name=excluded.name,
                        description=excluded.description, usage_prompt=excluded.usage_prompt,
                        version=excluded.version, sha256=excluded.sha256, size=excluded.size,
                        mime=excluded.mime, owner_id=excluded.owner_id,
                        updated_at=excluded.updated_at, deleted_at=NULL, revision=excluded.revision
                  WHERE templates.is_builtin = 0",
                params![
                    id,
                    workspace_id,
                    kind,
                    ps(p, "language").unwrap_or("es"),
                    ps(p, "name").unwrap_or("template"),
                    ps(p, "description").unwrap_or_default(),
                    ps(p, "usagePrompt").unwrap_or_default(),
                    ps(p, "version").unwrap_or("1.0"),
                    sha,
                    size,
                    mime,
                    user,
                    ps(p, "createdAt"),
                    ps(p, "updatedAt"),
                    revision,
                ],
            )
            .map_err(err)?;
        }
        _ => return Ok(()),
    }
    if !evidence::is_known(conn, sha)? || is_deleting(conn, sha)? {
        expect_content(conn, sha, size, mime)?;
    }
    Ok(())
}

fn is_deleting(conn: &Connection, sha: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT local_state = 'deleting' FROM blobs WHERE sha256 = ?1",
        params![sha],
        |r| r.get::<_, bool>(0),
    )
    .optional()
    .map_err(err)
    .map(|v| v.unwrap_or(false))
}

/// After a pulled delete (`sync::write_doc`): an attachment's content goes
/// once nothing else needs it.
pub(crate) fn after_pulled_delete(conn: &Connection, entity: &str, id: &str) -> Result<(), String> {
    if entity != ATTACHMENT {
        return Ok(());
    }
    let sha: Option<String> = conn
        .query_row(
            "SELECT sha256 FROM attachments WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?;
    match sha {
        Some(sha) => evidence::release(conn, &sha),
        None => Ok(()),
    }
}

// ---- migration 0046 ------------------------------------------------------------

/// Migration whose SQL adds the content columns of `templates`; this step
/// then moves each template's file into the evidence store and empties
/// `file` (ADR-0014, decision 6 of 2026-11-17). The column stays, empty:
/// dropping it makes SQLite re-check the whole schema, which an older
/// database may fail for reasons unrelated to templates.
pub(crate) const TEMPLATES_OUT: &str = "0046_blobs_sync.sql";

/// Moves the template files into the evidence store and queues the
/// attachments that never synced (SYNC-04b). Runs inside the migration's
/// savepoint, after its SQL; a file stored before a rollback is the same
/// content the next run stores (content-addressed), so it is idempotent.
/// Without a store (bare test connections) there must be no template.
pub(crate) fn migrate(conn: &Connection, store: Option<&EvidenceStore>) -> Result<(), String> {
    let rows: Vec<i64> = conn
        .prepare("SELECT rowid FROM templates WHERE sha256 IS NULL ORDER BY rowid")
        .and_then(|mut stmt| stmt.query_map([], |r| r.get(0))?.collect())
        .map_err(err)?;
    if !rows.is_empty() {
        let store = store.ok_or("templates need the evidence store to migrate")?;
        for rowid in rows {
            let blob = conn
                .blob_open(rusqlite::MAIN_DB, "templates", "file", rowid, true)
                .map_err(err)?;
            let stored = store.put(blob, u64::MAX)?;
            evidence::record_blob(conn, &stored, Some(XLSX))?;
            conn.execute(
                "UPDATE templates SET sha256 = ?2, size = ?3, mime = ?4, file = x'' WHERE rowid = ?1",
                params![rowid, stored.sha256, stored.size as i64, XLSX],
            )
            .map_err(err)?;
        }
    }
    // Attachments written before SYNC-04b left no oplog row: queue the live
    // ones (not a draft's, not an expired one) so they reach the server.
    let pending: Vec<(String, i64, String)> = conn
        .prepare(
            "SELECT id, revision, created_by FROM attachments
              WHERE deleted_at IS NULL AND blob_purged_at IS NULL AND owner_entity <> ?1
              ORDER BY rowid",
        )
        .and_then(|mut stmt| {
            stmt.query_map(params![DRAFT_OWNER], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })?
            .collect()
        })
        .map_err(err)?;
    for (id, revision, author) in pending {
        let mut change = Change::new(
            ATTACHMENT,
            &id,
            Action::Create,
            Actor::System {
                component: "migration",
                on_behalf_of: None,
            },
            "upsert",
            revision,
            &author,
        );
        change.audit = Audit::Folded;
        journal::record(conn, change)?;
    }
    Ok(())
}

/// The media type of a template file.
pub(crate) const XLSX: &str = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ---- transfer ------------------------------------------------------------------

/// What one transfer did, for the sync status and diagnostics.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BlobTransfer {
    uploaded: u32,
    downloaded: u32,
    /// Contents that failed this time; they are tried again next sync.
    failed: u32,
}

/// Contents the account's pending documents of `workspace` name and this
/// device holds: what the server may need before the push.
pub(crate) fn to_upload(
    conn: &Connection,
    user: &str,
    workspace: &str,
) -> Result<Vec<String>, String> {
    conn.prepare(
        "SELECT DISTINCT b.sha256 FROM oplog o
           LEFT JOIN attachments a ON o.entity = 'attachment' AND a.id = o.entity_id
           LEFT JOIN templates t ON o.entity = 'template' AND t.id = o.entity_id
           JOIN blobs b ON b.sha256 = coalesce(a.sha256, t.sha256)
          WHERE o.synced_at IS NULL AND o.user_id = ?1 AND o.workspace_id = ?2
            AND o.entity IN ('attachment', 'template') AND o.op <> 'delete'
            AND b.local_state IN ('present', 'damaged')
          ORDER BY b.sha256",
    )
    .and_then(|mut stmt| {
        stmt.query_map(params![user, workspace], |r| r.get(0))?
            .collect()
    })
    .map_err(err)
}

/// Contents of `workspace` known only to the server: what to download.
pub(crate) fn to_download(
    conn: &Connection,
    workspace: &str,
) -> Result<Vec<(String, Option<String>)>, String> {
    conn.prepare(
        "SELECT DISTINCT b.sha256, b.mime FROM blobs b
          WHERE b.local_state = 'remote_only'
            AND (b.sha256 IN (SELECT sha256 FROM attachments WHERE workspace_id = ?1
                               AND deleted_at IS NULL AND blob_purged_at IS NULL)
                 OR b.sha256 IN (SELECT sha256 FROM templates WHERE workspace_id = ?1
                                  AND deleted_at IS NULL))
          ORDER BY b.sha256",
    )
    .and_then(|mut stmt| {
        stmt.query_map(params![workspace], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect()
    })
    .map_err(err)
}

/// Stores a downloaded content if it is what its hash says.
pub(crate) fn store_download(
    conn: &Connection,
    store: &EvidenceStore,
    sha: &str,
    bytes: &[u8],
    mime: Option<&str>,
) -> Result<(), String> {
    if evidence::hex(&Sha256::digest(bytes)) != sha {
        return Err("blob-hash-mismatch".into());
    }
    let stored = store.put(bytes, evidence::MAX_FILE_BYTES)?;
    evidence::record_blob(conn, &stored, mime)
}

fn auth_headers(state: &ServerState) -> Result<BTreeMap<String, String>, String> {
    let token = crate::session_access_token(&state.origin())?
        .ok_or_else(|| "not-authenticated".to_string())?;
    Ok(BTreeMap::from([
        ("authorization".to_string(), format!("Bearer {token}")),
        (
            "x-pharos-version".to_string(),
            env!("CARGO_PKG_VERSION").to_string(),
        ),
    ]))
}

fn server_err(e: crate::server::ServerError) -> String {
    let kind = serde_json::to_value(e.kind)
        .ok()
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_default();
    format!("server:{kind}")
}

/// Uploads what the server lacks of the account's pending documents of
/// `workspace` (`phase` = `upload`, before the push) or downloads the
/// contents only the server has (`download`, after the pull). Nothing
/// happens until the server lists `blobs`. A content that fails is counted
/// and tried again next time; the sync goes on.
#[tauri::command]
pub async fn blobs_transfer(
    db: State<'_, Db>,
    server: State<'_, ServerState>,
    user_id: String,
    workspace_id: String,
    phase: String,
) -> Result<BlobTransfer, String> {
    if user_id.is_empty() {
        return Err("not-authenticated".into());
    }
    if !db.with_conn(|conn| crate::sync::server_takes_blobs(conn, &user_id))? {
        return Ok(BlobTransfer::default());
    }
    let headers = auth_headers(&server)?;
    let mut done = BlobTransfer::default();
    match phase.as_str() {
        "upload" => {
            let hashes = db.with_conn(|conn| to_upload(conn, &user_id, &workspace_id))?;
            if hashes.is_empty() {
                return Ok(done);
            }
            let mut json_headers = headers.clone();
            json_headers.insert("content-type".into(), "application/json".into());
            let mut missing: Vec<String> = Vec::new();
            for chunk in hashes.chunks(1000) {
                let resp = crate::server::send(
                    &server,
                    crate::server::ServerRequest {
                        method: "POST".into(),
                        path: "/blobs/missing".into(),
                        headers: json_headers.clone(),
                        body: Some(
                            json!({"workspaceId": workspace_id, "hashes": chunk}).to_string(),
                        ),
                    },
                )
                .await
                .map_err(server_err)?;
                if resp.status != 200 {
                    return Err(format!("blobs-missing:{}", resp.status));
                }
                let body: Value = serde_json::from_str(&resp.body).map_err(err)?;
                missing.extend(
                    body.get("missing")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                        .filter_map(|v| v.as_str().map(String::from)),
                );
            }
            for sha in missing {
                let read = db.with_conn(|conn| {
                    let mime: Option<String> = conn
                        .query_row(
                            "SELECT mime FROM blobs WHERE sha256 = ?1",
                            params![sha],
                            |r| r.get(0),
                        )
                        .optional()
                        .map_err(err)?
                        .flatten();
                    let mut bytes = Vec::new();
                    db.evidence().copy_to(&sha, &mut bytes).map_err(err)?;
                    Ok((bytes, mime))
                });
                let Ok((bytes, mime)) = read else {
                    done.failed += 1;
                    continue;
                };
                let mut h = headers.clone();
                h.insert("content-type".into(), "application/octet-stream".into());
                if let Some(m) = mime {
                    h.insert("x-pharos-blob-mime".into(), m);
                }
                let path = format!("/blobs/{sha}?workspace={workspace_id}");
                match crate::server::send_bytes(
                    &server,
                    reqwest::Method::PUT,
                    &path,
                    &h,
                    Some(bytes),
                )
                .await
                {
                    Ok(r) if r.status == 204 || r.status == 200 => done.uploaded += 1,
                    Ok(r) if r.status == 403 || r.status == 401 => {
                        return Err(format!("blobs-upload:{}", r.status))
                    }
                    _ => done.failed += 1,
                }
            }
        }
        "download" => {
            let wanted = db.with_conn(|conn| to_download(conn, &workspace_id))?;
            for (sha, mime) in wanted {
                let path = format!("/blobs/{sha}?workspace={workspace_id}");
                let got =
                    crate::server::send_bytes(&server, reqwest::Method::GET, &path, &headers, None)
                        .await;
                let Ok(resp) = got else {
                    done.failed += 1;
                    continue;
                };
                if resp.status != 200 {
                    done.failed += 1;
                    continue;
                }
                let stored = db.with_conn(|conn| {
                    store_download(conn, db.evidence(), &sha, &resp.body, mime.as_deref())
                });
                match stored {
                    Ok(()) => done.downloaded += 1,
                    Err(e) => {
                        tracing::warn!(error = %e, "blob download not stored");
                        done.failed += 1;
                    }
                }
            }
            if done.downloaded > 0 {
                db.persist()?;
            }
        }
        _ => return Err("unknown phase".into()),
    }
    Ok(done)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::MIGRATIONS;
    use uuid::Uuid;

    const U: &str = "user-a";

    fn store() -> EvidenceStore {
        let dir = std::env::temp_dir().join(format!("pharos-blobsync-{}", Uuid::new_v4()));
        EvidenceStore::new(&dir, &[9u8; 32])
    }

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        c
    }

    fn project(c: &Connection, id: &str) -> String {
        let ws = crate::db::ensure_workspace(c).unwrap();
        c.execute(
            "INSERT INTO projects (id, workspace_id, owner_id, name, created_by, updated_by, \
             created_at, updated_at) VALUES (?1, ?2, ?3, 'P', ?3, ?3, 'now', 'now')",
            params![id, ws, U],
        )
        .unwrap();
        ws
    }

    fn attach(
        c: &Connection,
        s: &EvidenceStore,
        id: &str,
        owner_entity: &str,
        bytes: &[u8],
    ) -> String {
        let ws = crate::db::ensure_workspace(c).unwrap();
        let stored = s.put(bytes, evidence::MAX_FILE_BYTES).unwrap();
        evidence::record_blob(c, &stored, Some("image/png")).unwrap();
        evidence::insert_attachment(
            c,
            &evidence::AttachmentRow {
                id,
                workspace_id: &ws,
                project_id: "p1",
                owner_entity,
                owner_id: "d1",
                name: "shot.png",
                mime: Some("image/png"),
                kind: "evidence",
                sha256: &stored.sha256,
                size: stored.size as i64,
                user: U,
            },
        )
        .unwrap();
        stored.sha256
    }

    fn ops(c: &Connection, entity: &str, id: &str) -> Vec<String> {
        c.prepare("SELECT op FROM oplog WHERE entity = ?1 AND entity_id = ?2 ORDER BY rowid")
            .unwrap()
            .query_map(params![entity, id], |r| r.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap()
    }

    fn state(c: &Connection, sha: &str) -> Option<String> {
        c.query_row(
            "SELECT local_state FROM blobs WHERE sha256 = ?1",
            params![sha],
            |r| r.get(0),
        )
        .optional()
        .unwrap()
    }

    #[test]
    fn migration_moves_template_files_into_the_evidence_store() {
        let s = store();
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, \
             applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
        )
        .unwrap();
        // Up to the migration before 0046, with one template and its file.
        for (name, sql) in MIGRATIONS.iter().filter(|(n, _)| *n < TEMPLATES_OUT) {
            c.execute_batch(sql).unwrap();
            c.execute("INSERT INTO schema_migrations (name) VALUES (?1)", [name])
                .unwrap();
        }
        let ws = crate::db::ensure_workspace(&c).unwrap();
        c.execute(
            "INSERT INTO templates (id, workspace_id, kind, language, name, file, is_builtin, \
             owner_id, created_at, updated_at) \
             VALUES ('t1', ?1, 'case', 'es', 'T', x'504b0304', 0, ?2, 'now', 'now')",
            params![ws, U],
        )
        .unwrap();
        // Without the store it refuses, and nothing changes.
        assert!(crate::db::run_migrations_with(&c, None).is_err());
        crate::db::run_migrations_with(&c, Some(&s)).unwrap();
        let (sha, size): (String, i64) = c
            .query_row(
                "SELECT sha256, size FROM templates WHERE id = 't1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(size, 4);
        assert_eq!(state(&c, &sha).as_deref(), Some("present"));
        let mut bytes = Vec::new();
        s.copy_to(&sha, &mut bytes).unwrap();
        assert_eq!(bytes, b"PK\x03\x04");
        // The bytes left the database.
        let left: i64 = c
            .query_row(
                "SELECT length(file) FROM templates WHERE id = 't1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(left, 0);
    }

    #[test]
    fn an_attachment_is_queued_with_its_owner_change_but_not_a_drafts() {
        let s = store();
        let c = conn();
        project(&c, "p1");
        attach(&c, &s, "a1", "defect", b"one");
        attach(&c, &s, "a2", DRAFT_OWNER, b"two");
        assert_eq!(ops(&c, ATTACHMENT, "a1"), vec!["upsert"]);
        assert!(ops(&c, ATTACHMENT, "a2").is_empty());
        let (payload, revision, deleted) = read_payload(&c, ATTACHMENT, "a1").unwrap().unwrap();
        assert_eq!((revision, deleted), (1, false));
        assert_eq!(payload["ownerEntity"], "defect");
        assert_eq!(payload["size"], 3);
        assert!(payload.get("blobPurgedAt").is_none());
    }

    #[test]
    fn a_pulled_document_expects_its_content_until_it_is_downloaded() {
        let s = store();
        let c = conn();
        let ws = project(&c, "p1");
        let bytes = b"remote";
        let sha = evidence::hex(&Sha256::digest(bytes));
        let p = json!({"projectId": "p1", "sha256": sha, "size": 6, "mime": "image/png",
                       "name": "r.png", "ownerEntity": "defect", "ownerId": "d1"});
        write_doc(&c, &ws, U, ATTACHMENT, "a9", &p, 3).unwrap();
        assert_eq!(state(&c, &sha).as_deref(), Some("remote_only"));
        assert_eq!(
            to_download(&c, &ws).unwrap(),
            vec![(sha.clone(), Some("image/png".to_string()))]
        );
        // Not what its hash says: refused, still expected.
        assert_eq!(
            store_download(&c, &s, &sha, b"tampered", None).unwrap_err(),
            "blob-hash-mismatch"
        );
        store_download(&c, &s, &sha, bytes, Some("image/png")).unwrap();
        assert_eq!(state(&c, &sha).as_deref(), Some("present"));
        assert!(to_download(&c, &ws).unwrap().is_empty());
        // A pulled delete releases it once nothing needs it.
        c.execute(
            "UPDATE attachments SET deleted_at = 'now' WHERE id = 'a9'",
            [],
        )
        .unwrap();
        after_pulled_delete(&c, ATTACHMENT, "a9").unwrap();
        assert_eq!(state(&c, &sha).as_deref(), Some("deleting"));
    }

    #[test]
    fn a_pulled_template_belongs_to_the_account_that_pulled_it() {
        let c = conn();
        let ws = crate::db::ensure_workspace(&c).unwrap();
        let sha = "a".repeat(64);
        let p =
            json!({"kind": "plan", "language": "en", "name": "Plan", "sha256": sha, "size": 10});
        write_doc(&c, &ws, U, TEMPLATE, "t9", &p, 2).unwrap();
        let (owner, revision): (String, i64) = c
            .query_row(
                "SELECT owner_id, revision FROM templates WHERE id = 't9'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!((owner.as_str(), revision), (U, 2));
        assert_eq!(state(&c, &sha).as_deref(), Some("remote_only"));
        // An unknown kind or a bad hash is skipped, not a failed pull.
        write_doc(
            &c,
            &ws,
            U,
            TEMPLATE,
            "t8",
            &json!({"kind": "suite", "sha256": sha}),
            1,
        )
        .unwrap();
        write_doc(
            &c,
            &ws,
            U,
            TEMPLATE,
            "t7",
            &json!({"kind": "plan", "sha256": "nope"}),
            1,
        )
        .unwrap();
        let n: i64 = c
            .query_row(
                "SELECT count(*) FROM templates WHERE id IN ('t8', 't7')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn the_upload_lists_the_contents_pending_documents_name() {
        let s = store();
        let c = conn();
        let ws = project(&c, "p1");
        let sha = attach(&c, &s, "a1", "defect", b"one");
        attach(&c, &s, "a2", DRAFT_OWNER, b"two");
        assert_eq!(to_upload(&c, U, &ws).unwrap(), vec![sha]);
        c.execute("UPDATE oplog SET synced_at = 'now'", []).unwrap();
        assert!(to_upload(&c, U, &ws).unwrap().is_empty());
    }

    #[test]
    fn a_template_keeps_its_content_alive() {
        let s = store();
        let c = conn();
        project(&c, "p1");
        let sha = attach(&c, &s, "a1", "defect", b"shared bytes");
        let ws = crate::db::ensure_workspace(&c).unwrap();
        c.execute(
            "INSERT INTO templates (id, workspace_id, kind, language, name, sha256, size, \
             file, is_builtin, owner_id, created_at, updated_at) \
             VALUES ('t1', ?1, 'case', 'es', 'T', ?2, 12, x'', 0, ?3, 'now', 'now')",
            params![ws, sha, U],
        )
        .unwrap();
        c.execute(
            "UPDATE attachments SET deleted_at = 'now' WHERE id = 'a1'",
            [],
        )
        .unwrap();
        evidence::release(&c, &sha).unwrap();
        assert_eq!(state(&c, &sha).as_deref(), Some("present"));
    }
}
