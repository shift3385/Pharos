//! Change journal / oplog (Phase 8, spec §9). Every local mutation appends a
//! per-entity delta via `record`, stamped with a Hybrid Logical Clock (SYNC-01).
//! The client shows a "pending changes" count and (Phase 8B) pushes pending
//! deltas to the backend and marks them synced.

use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

use crate::db::Db;
use crate::hlc::{self, Hlc};

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn state_get(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row("SELECT value FROM sync_state WHERE key = ?1", params![key], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())
}

fn state_set(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO sync_state (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// This installation's device id (the HLC tie-break), created on first use and
/// kept in the local DB.
pub fn device_id(conn: &Connection) -> Result<String, String> {
    if let Some(id) = state_get(conn, "device_id")? {
        return Ok(id);
    }
    let id = Uuid::new_v4().to_string();
    state_set(conn, "device_id", &id)?;
    Ok(id)
}

fn last_hlc(conn: &Connection) -> Result<Option<Hlc>, String> {
    Ok(state_get(conn, "hlc_last")?.and_then(|s| Hlc::parse(&s)))
}

/// Issues the HLC for a local change. The last value is persisted so the clock
/// stays monotonic across restarts even if the wall clock goes backwards.
pub fn next_hlc(conn: &Connection) -> Result<String, String> {
    let device = device_id(conn)?;
    let next = hlc::tick(last_hlc(conn)?.as_ref(), now_ms(), &device).encode();
    state_set(conn, "hlc_last", &next)?;
    Ok(next)
}

/// Merges an HLC received from another device into the local clock. Unparseable
/// (legacy, empty) values are ignored.
pub fn observe_hlc(conn: &Connection, remote: &str) -> Result<(), String> {
    let Some(remote) = Hlc::parse(remote) else {
        return Ok(());
    };
    let device = device_id(conn)?;
    let merged = hlc::recv(last_hlc(conn)?.as_ref(), &remote, now_ms(), &device).encode();
    state_set(conn, "hlc_last", &merged)
}

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
    let hlc = next_hlc(conn)?;
    conn.execute(
        "INSERT INTO oplog (id, entity, entity_id, op, payload, revision, author, created_at, hlc)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), ?8)",
        params![
            Uuid::new_v4().to_string(),
            entity,
            entity_id,
            op,
            payload,
            revision,
            author,
            hlc,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    pending: i64,
    /// Open conflicts waiting for the user in the conflict panel (Phase 8C).
    conflicts: i64,
}

/// Number of deltas not yet synced and of open conflicts — drives the status
/// indicator.
#[tauri::command]
pub fn oplog_pending_count(db: State<Db>) -> Result<SyncState, String> {
    db.with_conn(|conn| {
        let pending: i64 = conn
            .query_row("SELECT count(*) FROM oplog WHERE synced_at IS NULL", [], |r| {
                r.get(0)
            })
            .map_err(|e| e.to_string())?;
        let conflicts: i64 = conn
            .query_row("SELECT count(*) FROM sync_conflicts WHERE resolved_at IS NULL", [], |r| {
                r.get(0)
            })
            .map_err(|e| e.to_string())?;
        Ok(SyncState { pending, conflicts })
    })
}
