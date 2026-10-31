//! Audit log (AUD-01, ADR-0015): the append-only `audit_log` table, its hash
//! chain and its sync payload. Only `journal` writes local events (in the same
//! transaction as the change and its oplog row); events of other devices come
//! in through `insert_if_absent` on pull.
//!
//! Chain: one per `(device_id, chain_workspace_id, chain_owner)`; `chain_seq`
//! counts 1, 2, 3… and
//! `hash = sha256(prev_hash ‖ JCS(header) ‖ changes_sha256)`, hex. The header
//! is the event without `changes`, its location (`workspace_id`,
//! `project_id`), its owner bucket (`user_id`), the links themselves and the
//! redaction mark, so moving a project or redacting `changes` keeps the chain
//! valid. `changes` and `summary` travel as the JSON text stored here, so every
//! copy hashes the same bytes.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// RFC 8785 (JCS) for the subset audit headers use: objects with ASCII keys,
/// strings, integers within ±(2^53 - 1), booleans and null. Anything else (a
/// fraction, a larger integer, a non-ASCII key) is an error instead of a silently different canonical form, so a
/// header field added later cannot drift from another implementation.
pub fn jcs(value: &Value) -> Result<String, String> {
    let mut out = String::new();
    write_jcs(value, &mut out)?;
    Ok(out)
}

fn write_jcs(value: &Value, out: &mut String) -> Result<(), String> {
    match value {
        Value::Null | Value::Bool(_) | Value::String(_) => {
            // serde_json escapes exactly what JCS requires (", \, controls as
            // \b \f \n \r \t or lowercase \u00xx) and nothing else.
            out.push_str(&serde_json::to_string(value).map_err(|e| e.to_string())?);
        }
        Value::Number(n) => out.push_str(&safe_integer(n)?.to_string()),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_jcs(item, out)?;
            }
            out.push(']');
        }
        Value::Object(map) => {
            if let Some(key) = map.keys().find(|k| !k.is_ascii()) {
                return Err(format!(
                    "jcs: non-ASCII key {key:?} is outside the audit subset"
                ));
            }
            // ASCII keys: byte order is UTF-16 code unit order (RFC 8785 §3.2.3).
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            out.push('{');
            for (i, key) in keys.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(key).map_err(|e| e.to_string())?);
                out.push(':');
                write_jcs(&map[key], out)?;
            }
            out.push('}');
        }
    }
    Ok(())
}

/// Largest integer every JSON parser holds exactly (2^53 - 1): the server's
/// JCS (`audit.chain.ts`) reads numbers as IEEE doubles.
const MAX_SAFE_INTEGER: i64 = (1 << 53) - 1;

/// A number of the audit subset: an integer within ±(2^53 - 1). A JSON number
/// written with a fraction or exponent but an integral value (`1.0`, `1e2`) is
/// that integer, as RFC 8785 and the server read it; anything else is an
/// error, so both implementations accept and refuse the same values.
fn safe_integer(n: &serde_json::Number) -> Result<i64, String> {
    let value = if let Some(i) = n.as_i64() {
        Some(i)
    } else if n.is_u64() {
        None
    } else {
        n.as_f64()
            .filter(|f| f.is_finite() && f.fract() == 0.0 && f.abs() <= MAX_SAFE_INTEGER as f64)
            .map(|f| f as i64)
    };
    value
        .filter(|i| i.abs() <= MAX_SAFE_INTEGER)
        .ok_or_else(|| format!("jcs: number {n} is outside the audit subset"))
}

/// One audit event, as stored in `audit_log`.
#[derive(Debug, Clone, PartialEq)]
pub struct Event {
    pub id: String,
    pub workspace_id: String,
    pub project_id: Option<String>,
    pub at: String,
    pub hlc: String,
    pub device_id: String,
    pub actor: String,
    pub on_behalf_of: Option<String>,
    pub action: String,
    pub entity: String,
    pub entity_id: String,
    pub entity_key: Option<String>,
    pub changes: Option<String>,
    pub changes_sha256: String,
    pub summary: Option<String>,
    pub origin: String,
    pub chain_workspace_id: String,
    pub chain_owner: String,
    pub chain_seq: i64,
    pub prev_hash: Option<String>,
    pub hash: String,
    pub user_id: String,
    pub redacted_at: Option<String>,
}

const COLS: &str = "id, workspace_id, project_id, at, hlc, device_id, actor, on_behalf_of, action, entity,
    entity_id, entity_key, changes, changes_sha256, summary, origin, chain_workspace_id, chain_owner,
    chain_seq, prev_hash, hash, user_id, redacted_at";

fn from_row(r: &Row) -> rusqlite::Result<Event> {
    Ok(Event {
        id: r.get(0)?,
        workspace_id: r.get(1)?,
        project_id: r.get(2)?,
        at: r.get(3)?,
        hlc: r.get(4)?,
        device_id: r.get(5)?,
        actor: r.get(6)?,
        on_behalf_of: r.get(7)?,
        action: r.get(8)?,
        entity: r.get(9)?,
        entity_id: r.get(10)?,
        entity_key: r.get(11)?,
        changes: r.get(12)?,
        changes_sha256: r.get(13)?,
        summary: r.get(14)?,
        origin: r.get(15)?,
        chain_workspace_id: r.get(16)?,
        chain_owner: r.get(17)?,
        chain_seq: r.get(18)?,
        prev_hash: r.get(19)?,
        hash: r.get(20)?,
        user_id: r.get(21)?,
        redacted_at: r.get(22)?,
    })
}

/// What is hashed besides `changes_sha256` and the previous hash.
fn header(e: &Event) -> Value {
    json!({
        "id": e.id,
        "at": e.at,
        "hlc": e.hlc,
        "deviceId": e.device_id,
        "actor": e.actor,
        "onBehalfOf": e.on_behalf_of,
        "action": e.action,
        "entity": e.entity,
        "entityId": e.entity_id,
        "entityKey": e.entity_key,
        "summary": e.summary,
        "origin": e.origin,
        "chainWorkspaceId": e.chain_workspace_id,
        "chainOwner": e.chain_owner,
        "chainSeq": e.chain_seq,
    })
}

/// The hash of an event given the previous link.
pub fn hash_of(e: &Event) -> Result<String, String> {
    let mut input = e.prev_hash.clone().unwrap_or_default();
    input.push_str(&jcs(&header(e))?);
    input.push_str(&e.changes_sha256);
    Ok(sha256_hex(input.as_bytes()))
}

/// A new local event, before it is linked into its chain.
pub struct NewEvent {
    pub workspace_id: String,
    pub project_id: Option<String>,
    pub hlc: String,
    pub device_id: String,
    pub actor: String,
    pub on_behalf_of: Option<String>,
    pub action: &'static str,
    pub entity: String,
    pub entity_id: String,
    pub entity_key: Option<String>,
    /// `{ field: [before, after] }`.
    pub changes: Map<String, Value>,
    pub summary: Option<Value>,
    pub origin: &'static str,
    /// Owner the event syncs with, fixed now ('' = local only); also its chain.
    pub user_id: String,
}

/// The last link of a chain: (seq, hash).
fn head(
    conn: &Connection,
    device: &str,
    workspace: &str,
    owner: &str,
) -> Result<Option<(i64, String)>, String> {
    conn.query_row(
        "SELECT chain_seq, hash FROM audit_log
          WHERE device_id = ?1 AND chain_workspace_id = ?2 AND chain_owner = ?3
          ORDER BY chain_seq DESC LIMIT 1",
        params![device, workspace, owner],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// Links a new local event at the end of its chain and stores it. Runs inside
/// the caller's transaction (journal), so the change, its oplog row and its
/// event commit together.
pub fn append(conn: &Connection, new: NewEvent) -> Result<Event, String> {
    let changes = serde_json::to_string(&Value::Object(new.changes)).map_err(|e| e.to_string())?;
    let summary = new
        .summary
        .map(|s| serde_json::to_string(&s))
        .transpose()
        .map_err(|e| e.to_string())?;
    let at: String = conn
        .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())?;
    let (seq, prev) = match head(conn, &new.device_id, &new.workspace_id, &new.user_id)? {
        Some((seq, hash)) => (seq + 1, Some(hash)),
        None => (1, None),
    };
    let mut event = Event {
        id: Uuid::new_v4().to_string(),
        workspace_id: new.workspace_id.clone(),
        project_id: new.project_id,
        at,
        hlc: new.hlc,
        device_id: new.device_id,
        actor: new.actor,
        on_behalf_of: new.on_behalf_of,
        action: new.action.to_string(),
        entity: new.entity,
        entity_id: new.entity_id,
        entity_key: new.entity_key,
        changes_sha256: sha256_hex(changes.as_bytes()),
        changes: Some(changes),
        summary,
        origin: new.origin.to_string(),
        chain_workspace_id: new.workspace_id,
        chain_owner: new.user_id.clone(),
        chain_seq: seq,
        prev_hash: prev,
        hash: String::new(),
        user_id: new.user_id,
        redacted_at: None,
    };
    event.hash = hash_of(&event)?;
    insert(conn, &event)?;
    Ok(event)
}

/// Inserts a row; an existing id is left as it is, which is what an
/// append-only pull needs. The table refuses an insert under an existing id
/// (`audit_log_no_replace`), so the check comes first. Returns whether it was
/// inserted.
fn insert(conn: &Connection, e: &Event) -> Result<bool, String> {
    if get(conn, &e.id)?.is_some() {
        return Ok(false);
    }
    let n = conn
        .execute(
            &format!(
                "INSERT INTO audit_log ({COLS})
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
                         ?17, ?18, ?19, ?20, ?21, ?22, ?23)"
            ),
            params![
                e.id,
                e.workspace_id,
                e.project_id,
                e.at,
                e.hlc,
                e.device_id,
                e.actor,
                e.on_behalf_of,
                e.action,
                e.entity,
                e.entity_id,
                e.entity_key,
                e.changes,
                e.changes_sha256,
                e.summary,
                e.origin,
                e.chain_workspace_id,
                e.chain_owner,
                e.chain_seq,
                e.prev_hash,
                e.hash,
                e.user_id,
                e.redacted_at,
            ],
        )
        .map_err(|e| e.to_string())?;
    Ok(n > 0)
}

pub fn get(conn: &Connection, id: &str) -> Result<Option<Event>, String> {
    conn.query_row(
        &format!("SELECT {COLS} FROM audit_log WHERE id = ?1"),
        params![id],
        from_row,
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// The account an event syncs with; None for a local-only event.
pub fn owner(conn: &Connection, id: &str) -> Result<Option<String>, String> {
    Ok(get(conn, id)?.map(|e| e.user_id).filter(|u| !u.is_empty()))
}

/// The `audit_event` document pushed for an event (camelCase, like every
/// synced payload).
pub fn payload(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    Ok(get(conn, id)?.map(|e| {
        json!({
            "id": e.id,
            "workspaceId": e.workspace_id,
            "projectId": e.project_id,
            "at": e.at,
            "hlc": e.hlc,
            "deviceId": e.device_id,
            "actor": e.actor,
            "onBehalfOf": e.on_behalf_of,
            "action": e.action,
            "entity": e.entity,
            "entityId": e.entity_id,
            "entityKey": e.entity_key,
            "changes": e.changes,
            "changesSha256": e.changes_sha256,
            "summary": e.summary,
            "origin": e.origin,
            "chainWorkspaceId": e.chain_workspace_id,
            "chainOwner": e.chain_owner,
            "chainSeq": e.chain_seq,
            "prevHash": e.prev_hash,
            "hash": e.hash,
            "redactedAt": e.redacted_at,
        })
    }))
}

/// Stores an event pulled from the server for `user` (another device's, or
/// this device's own echo). An id already here is left untouched: append-only
/// content never changes, and no event or oplog row is created for it
/// (ADR-0015). A document without the required fields is skipped, not an
/// error, so one bad document never stops a pull. Its hash is not checked
/// here: a pull stores what the server has, and `verify_chain` (Admin >
/// Auditoría) is what tells a broken chain.
pub fn insert_if_absent(conn: &Connection, user: &str, p: &Value) -> Result<(), String> {
    let s = |k: &str| p.get(k).and_then(Value::as_str).map(str::to_string);
    let required = (|| {
        Some(Event {
            id: s("id")?,
            workspace_id: s("workspaceId").unwrap_or_default(),
            project_id: s("projectId"),
            at: s("at")?,
            hlc: s("hlc")?,
            device_id: s("deviceId")?,
            actor: s("actor")?,
            on_behalf_of: s("onBehalfOf"),
            action: s("action")?,
            entity: s("entity")?,
            entity_id: s("entityId")?,
            entity_key: s("entityKey"),
            changes: s("changes"),
            changes_sha256: s("changesSha256")?,
            summary: s("summary"),
            origin: s("origin")?,
            chain_workspace_id: s("chainWorkspaceId")?,
            chain_owner: s("chainOwner").unwrap_or_default(),
            chain_seq: p.get("chainSeq").and_then(Value::as_i64)?,
            prev_hash: s("prevHash"),
            hash: s("hash")?,
            user_id: user.to_string(),
            redacted_at: s("redactedAt"),
        })
    })();
    let Some(mut event) = required else {
        tracing::warn!("skipped a pulled audit_event without its required fields");
        return Ok(());
    };
    if event.workspace_id.is_empty() {
        event.workspace_id = crate::db::ensure_workspace(conn)?;
    }
    // A CHECK would fail the whole pull: an unknown action or origin from a
    // newer device is skipped instead.
    match insert(conn, &event) {
        Ok(_) => Ok(()),
        Err(e) if e.contains("CHECK constraint failed") => {
            tracing::warn!("skipped a pulled audit_event this version cannot store");
            Ok(())
        }
        Err(e) => Err(e),
    }
}

/// Events written here (any account) that have not reached the server yet. Not in
/// the "pending changes" badge (people see entities, not events); it goes to
/// the exported diagnostics, so a server without `append-only` that makes them
/// pile up can be spotted.
pub fn pending_count(conn: &Connection) -> Result<i64, String> {
    conn.query_row(
        "SELECT count(*) FROM oplog WHERE entity = 'audit_event' AND synced_at IS NULL
            AND payload NOT LIKE '%\"appendRejected\"%'",
        [],
        |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}

/// Where a chain stops being valid.
#[cfg_attr(not(test), allow(dead_code))] // for Admin > Auditoría (AUD-01) and tests
#[derive(Debug, PartialEq)]
pub enum ChainBreak {
    /// `chain_seq` jumps or repeats (a row removed, or inserted twice).
    Gap { expected: i64, found: i64 },
    /// `prev_hash` does not point at the previous link.
    Link { seq: i64 },
    /// The stored hash does not match the event (an edited field).
    Hash { seq: i64 },
    /// `changes` does not match `changes_sha256` (edited content).
    Changes { seq: i64 },
}

/// Checks one chain from its first link. A redacted event (changes NULL) still
/// verifies: its hash covers `changes_sha256`, which stays. Returns how many
/// links were checked.
#[cfg_attr(not(test), allow(dead_code))]
pub fn verify_chain(
    conn: &Connection,
    device: &str,
    workspace: &str,
    owner: &str,
) -> Result<Result<usize, ChainBreak>, String> {
    let events: Vec<Event> = {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {COLS} FROM audit_log
                  WHERE device_id = ?1 AND chain_workspace_id = ?2 AND chain_owner = ?3
                  ORDER BY chain_seq, rowid"
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![device, workspace, owner], from_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?
    };
    let mut prev: Option<String> = None;
    for (i, e) in events.iter().enumerate() {
        let expected = i as i64 + 1;
        if e.chain_seq != expected {
            return Ok(Err(ChainBreak::Gap {
                expected,
                found: e.chain_seq,
            }));
        }
        if e.prev_hash != prev {
            return Ok(Err(ChainBreak::Link { seq: e.chain_seq }));
        }
        if let Some(changes) = &e.changes {
            if sha256_hex(changes.as_bytes()) != e.changes_sha256 {
                return Ok(Err(ChainBreak::Changes { seq: e.chain_seq }));
            }
        }
        if hash_of(e)? != e.hash {
            return Ok(Err(ChainBreak::Hash { seq: e.chain_seq }));
        }
        prev = Some(e.hash.clone());
    }
    Ok(Ok(events.len()))
}

/// Events the server refused (`appendRejected`): kept here, never resent, and
/// counted in the diagnostics so a bug or a tampered copy is visible.
pub fn rejected_count(conn: &Connection) -> Result<i64, String> {
    conn.query_row(
        "SELECT count(*) FROM oplog WHERE entity = 'audit_event' AND synced_at IS NULL
            AND payload LIKE '%\"appendRejected\"%'",
        [],
        |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}
