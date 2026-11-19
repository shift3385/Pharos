//! A copy of the database put back by hand (AUD-01c, ADR-0015). A `.bak`
//! copied over `pharos.db` keeps the `device_id` of the file it came from,
//! so its new audit events would extend a chain whose later links already
//! exist: the chain forks and `verify_chain` sees a broken link.
//!
//! Each open (and each backup) counts itself twice: inside the encrypted
//! database (`sync_state.save_seq`) and in a plain mark next to it
//! (`pharos.db.seq`, only that number; `pharos.db.enc.seq` before 0.6, still
//! checked when a `pharos.db.enc` is converted). On open, a database whose
//! count is below the mark is older than what this device last opened: a
//! restored copy. A copy taken after the last open is not told apart.
//! It gets a new `device_id` (`oplog::rotate_device_id`, as a recovery with
//! the key does), so its events start a new chain, and the count jumps to the
//! mark so the next save is ahead again.
//!
//! Without a mark (first start after the update, or deleted) nothing happens.
//! A rotation too many is harmless: it only starts another chain.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};

const SEQ_KEY: &str = "save_seq";
/// When a restored copy was last detected (exported with the diagnostics).
pub(crate) const DETECTED_KEY: &str = "restored_copy_at";

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// The plain mark next to the encrypted file.
pub(crate) fn mark_path(enc_path: &Path) -> PathBuf {
    let mut name = enc_path.file_name().unwrap_or_default().to_os_string();
    name.push(".seq");
    enc_path.with_file_name(name)
}

fn state_get(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM sync_state WHERE key = ?1",
        params![key],
        |r| r.get(0),
    )
    .optional()
    .map_err(err)
}

fn state_set(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO sync_state (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(err)?;
    Ok(())
}

fn image_seq(conn: &Connection) -> Result<u64, String> {
    Ok(state_get(conn, SEQ_KEY)?
        .and_then(|v| v.parse().ok())
        .unwrap_or(0))
}

fn read_mark(enc_path: &Path) -> Option<u64> {
    fs::read_to_string(mark_path(enc_path))
        .ok()
        .and_then(|s| s.trim().parse().ok())
}

/// Before a save: counts it in the image. Returns the new count.
pub(crate) fn bump(conn: &Connection) -> Result<u64, String> {
    let next = image_seq(conn)? + 1;
    state_set(conn, SEQ_KEY, &next.to_string())?;
    Ok(next)
}

/// After the encrypted file is written: the same count in the mark. Best
/// effort: without it, the next open just cannot tell.
pub(crate) fn write_mark(enc_path: &Path, seq: u64) {
    let _ = fs::write(mark_path(enc_path), seq.to_string());
}

/// On open: true if the image is older than the last save of this device,
/// after rotating its device id. The caller saves.
pub(crate) fn check(conn: &Connection, enc_path: &Path) -> Result<bool, String> {
    let Some(mark) = read_mark(enc_path) else {
        return Ok(false);
    };
    if image_seq(conn)? >= mark {
        return Ok(false);
    }
    crate::oplog::rotate_device_id(conn)?;
    state_set(conn, SEQ_KEY, &mark.to_string())?;
    let at: String = conn
        .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |r| {
            r.get(0)
        })
        .map_err(err)?;
    state_set(conn, DETECTED_KEY, &at)?;
    Ok(true)
}

/// When a restored copy was last detected, for the diagnostics.
pub(crate) fn detected_at(conn: &Connection) -> Result<Option<String>, String> {
    state_get(conn, DETECTED_KEY)
}
