//! Change journal / oplog (Phase 8, spec §9). Every local mutation appends a
//! per-entity delta via `record`. The client shows a "pending changes" count and
//! (Phase 8B) pushes pending deltas to the backend and marks them synced.

use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

use crate::db::Db;

/// Appends a delta for an entity mutation. Called inside each repo's write, in
/// the same connection/transaction, so the journal never diverges from the data.
pub fn record(
    conn: &Connection,
    entity: &str,
    entity_id: &str,
    op: &str,
    payload: &str,
    revision: i64,
    author: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO oplog (id, entity, entity_id, op, payload, revision, author, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))",
        params![
            Uuid::new_v4().to_string(),
            entity,
            entity_id,
            op,
            payload,
            revision,
            author,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    pending: i64,
}

/// Number of deltas not yet synced — drives the status indicator.
#[tauri::command]
pub fn oplog_pending_count(db: State<Db>) -> Result<SyncState, String> {
    db.with_conn(|conn| {
        let pending: i64 = conn
            .query_row("SELECT count(*) FROM oplog WHERE synced_at IS NULL", [], |r| {
                r.get(0)
            })
            .map_err(|e| e.to_string())?;
        Ok(SyncState { pending })
    })
}
