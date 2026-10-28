//! Delta sync client side (Phase 8B, spec §9). Builds the pending deltas (full
//! entity state, read live from the local DB) for the TS layer to POST to the
//! backend, marks them synced, and applies remote documents back. Phase 8C adds
//! conflict detection: each delta carries the base it was built on (`sync_base`)
//! and its HLC; a remote change that diverged from a local pending one is kept
//! in `sync_conflicts` for the conflict panel instead of overwriting local data.
//! The HTTP call itself lives in the TS layer (it holds the auth token); this
//! module only touches the local database.

use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;

use crate::db::{ensure_workspace, Db};
use crate::hlc;
use crate::oplog;

const CORE: [&str; 3] = ["project", "test_plan", "test_case"];

fn table_for(entity: &str) -> Option<&'static str> {
    match entity {
        "project" => Some("projects"),
        "test_plan" => Some("test_plans"),
        "test_case" => Some("test_cases"),
        _ => None,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Delta {
    entity: String,
    entity_id: String,
    op: String,
    payload: Value,
    revision: i64,
    author: String,
    /// HLC of the latest local change folded into this delta.
    hlc: String,
    /// Last version known to be in sync with the server (None: never synced,
    /// or pending before migration 0011 — the server then falls back to LWW).
    base_revision: Option<i64>,
    base_hlc: Option<String>,
    /// Oplog row ids covered, marked synced only if the server accepts the delta.
    op_ids: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pending {
    deltas: Vec<Delta>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDoc {
    entity: String,
    entity_id: String,
    #[serde(default)]
    payload: Value,
    revision: i64,
    #[serde(default)]
    deleted: bool,
    #[serde(default)]
    hlc: String,
}

/// A delta the server accepted (echoed back by the TS layer after the push).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushedDelta {
    entity: String,
    entity_id: String,
    revision: i64,
    hlc: String,
    op_ids: Vec<String>,
}

fn s(row: &rusqlite::Row, col: &str) -> rusqlite::Result<Option<String>> {
    row.get::<_, Option<String>>(col)
}

/// Reads one entity's live state as the camelCase payload the TS API returns
/// (so a future web client can consume it directly). None if the row is gone.
fn read_payload(conn: &Connection, entity: &str, id: &str) -> Result<Option<(Value, i64, bool)>, String> {
    let (sql, build): (&str, fn(&rusqlite::Row) -> rusqlite::Result<(Value, i64, bool)>) = match entity {
        "project" => (
            "SELECT id, workspace_id, owner_id, name, case_id_prefix, case_id_digits,
                    created_at, updated_at, revision, deleted_at FROM projects WHERE id = ?1",
            |r| {
                Ok((
                    json!({
                        "id": r.get::<_, String>("id")?,
                        "workspaceId": r.get::<_, String>("workspace_id")?,
                        "ownerId": s(r, "owner_id")?,
                        "name": r.get::<_, String>("name")?,
                        "caseIdPrefix": r.get::<_, String>("case_id_prefix")?,
                        "caseIdDigits": r.get::<_, i64>("case_id_digits")?,
                        "createdAt": r.get::<_, String>("created_at")?,
                        "updatedAt": r.get::<_, String>("updated_at")?,
                        "revision": r.get::<_, i64>("revision")?,
                    }),
                    r.get::<_, i64>("revision")?,
                    s(r, "deleted_at")?.is_some(),
                ))
            },
        ),
        "test_plan" => (
            "SELECT id, workspace_id, project_id, title, version, plan_date, author, status,
                    data, created_at, updated_at, revision, deleted_at FROM test_plans WHERE id = ?1",
            |r| {
                let data: String = r.get("data")?;
                Ok((
                    json!({
                        "id": r.get::<_, String>("id")?,
                        "workspaceId": r.get::<_, String>("workspace_id")?,
                        "projectId": s(r, "project_id")?,
                        "title": r.get::<_, String>("title")?,
                        "version": r.get::<_, String>("version")?,
                        "planDate": s(r, "plan_date")?,
                        "author": r.get::<_, String>("author")?,
                        "status": r.get::<_, String>("status")?,
                        "data": serde_json::from_str::<Value>(&data).unwrap_or(Value::Null),
                        "createdAt": r.get::<_, String>("created_at")?,
                        "updatedAt": r.get::<_, String>("updated_at")?,
                        "revision": r.get::<_, i64>("revision")?,
                    }),
                    r.get::<_, i64>("revision")?,
                    s(r, "deleted_at")?.is_some(),
                ))
            },
        ),
        "test_case" => (
            "SELECT id, workspace_id, project_id, scenario_id, title, version, status, priority,
                    author, data, created_at, updated_at, revision, deleted_at FROM test_cases WHERE id = ?1",
            |r| {
                let data: String = r.get("data")?;
                Ok((
                    json!({
                        "id": r.get::<_, String>("id")?,
                        "workspaceId": r.get::<_, String>("workspace_id")?,
                        "projectId": s(r, "project_id")?,
                        "scenarioId": r.get::<_, String>("scenario_id")?,
                        "title": r.get::<_, String>("title")?,
                        "version": r.get::<_, String>("version")?,
                        "status": r.get::<_, String>("status")?,
                        "priority": r.get::<_, String>("priority")?,
                        "author": r.get::<_, String>("author")?,
                        "data": serde_json::from_str::<Value>(&data).unwrap_or(Value::Null),
                        "createdAt": r.get::<_, String>("created_at")?,
                        "updatedAt": r.get::<_, String>("updated_at")?,
                        "revision": r.get::<_, i64>("revision")?,
                    }),
                    r.get::<_, i64>("revision")?,
                    s(r, "deleted_at")?.is_some(),
                ))
            },
        ),
        _ => return Ok(None),
    };
    conn.query_row(sql, params![id], build).optional().map_err(|e| e.to_string())
}

fn base_of(conn: &Connection, entity: &str, id: &str) -> Result<Option<(i64, String)>, String> {
    conn.query_row(
        "SELECT revision, hlc FROM sync_base WHERE entity = ?1 AND entity_id = ?2",
        params![entity, id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn set_base(conn: &Connection, entity: &str, id: &str, revision: i64, hlc: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO sync_base (entity, entity_id, revision, hlc) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(entity, entity_id) DO UPDATE SET revision = excluded.revision, hlc = excluded.hlc",
        params![entity, id, revision, hlc],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Latest pending local change of an entity: (hlc, author). None if none pending.
fn latest_pending(conn: &Connection, entity: &str, id: &str) -> Result<Option<(String, String)>, String> {
    conn.query_row(
        "SELECT hlc, author FROM oplog WHERE entity = ?1 AND entity_id = ?2 AND synced_at IS NULL
         ORDER BY rowid DESC LIMIT 1",
        params![entity, id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn mark_entity_synced(conn: &Connection, entity: &str, id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE oplog SET synced_at = datetime('now')
         WHERE entity = ?1 AND entity_id = ?2 AND synced_at IS NULL",
        params![entity, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn open_conflict_id(conn: &Connection, entity: &str, id: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT id FROM sync_conflicts WHERE entity = ?1 AND entity_id = ?2 AND resolved_at IS NULL",
        params![entity, id],
        |r| r.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// Builds the pending deltas: one per distinct core entity changed since the last
/// sync, carrying its live state (or a tombstone), its base and the oplog ids
/// covered. Entities with an open conflict are held back until it is resolved.
fn build_pending(conn: &Connection) -> Result<Pending, String> {
    // (entity, entity_id) → (op ids, max hlc, author of the latest change), in
    // first-change order.
    let mut order: Vec<(String, String)> = Vec::new();
    let mut groups: HashMap<(String, String), (Vec<String>, String, String)> = HashMap::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT o.entity, o.entity_id, o.id, o.hlc, o.author FROM oplog o
                 WHERE o.synced_at IS NULL AND o.entity IN ('project','test_plan','test_case')
                   AND NOT EXISTS (SELECT 1 FROM sync_conflicts c WHERE c.entity = o.entity
                                   AND c.entity_id = o.entity_id AND c.resolved_at IS NULL)
                 ORDER BY o.rowid",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (entity, entity_id, id, row_hlc, author) = row.map_err(|e| e.to_string())?;
            let key = (entity, entity_id);
            let g = groups.entry(key.clone()).or_insert_with(|| {
                order.push(key);
                (Vec::new(), String::new(), String::new())
            });
            g.0.push(id);
            if hlc::cmp_encoded(&row_hlc, &g.1).is_ge() {
                g.1 = row_hlc;
            }
            g.2 = author;
        }
    }

    let mut deltas = Vec::new();
    for key in order {
        let (op_ids, mut delta_hlc, author) = groups.remove(&key).unwrap_or_default();
        let (entity, entity_id) = key;
        if delta_hlc.is_empty() {
            // Only rows written before migration 0011: stamp them now (and
            // store it, so a retried push carries the same HLC).
            delta_hlc = oplog::next_hlc(conn)?;
            for id in &op_ids {
                conn.execute("UPDATE oplog SET hlc = ?2 WHERE id = ?1", params![id, delta_hlc])
                    .map_err(|e| e.to_string())?;
            }
        }
        let base = base_of(conn, &entity, &entity_id)?;
        let (op, payload, revision) = match read_payload(conn, &entity, &entity_id)? {
            Some((payload, revision, deleted)) => {
                (if deleted { "delete" } else { "upsert" }, payload, revision)
            }
            None => ("delete", Value::Null, 0),
        };
        deltas.push(Delta {
            op: op.into(),
            entity,
            entity_id,
            payload,
            revision,
            author,
            hlc: delta_hlc,
            base_revision: base.as_ref().map(|b| b.0),
            base_hlc: base.map(|b| b.1),
            op_ids,
        });
    }
    Ok(Pending { deltas })
}

#[tauri::command]
pub fn oplog_pending(db: State<Db>) -> Result<Pending, String> {
    let pending = db.with_conn(build_pending)?;
    db.persist()?;
    Ok(pending)
}

/// Marks the oplog rows of the deltas the server accepted as synced and moves
/// each entity's base to the version just pushed.
fn mark_pushed(conn: &Connection, deltas: &[PushedDelta]) -> Result<(), String> {
    for d in deltas {
        for id in &d.op_ids {
            conn.execute("UPDATE oplog SET synced_at = datetime('now') WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
        }
        set_base(conn, &d.entity, &d.entity_id, d.revision, &d.hlc)?;
    }
    Ok(())
}

#[tauri::command]
pub fn oplog_mark_synced(db: State<Db>, deltas: Vec<PushedDelta>) -> Result<(), String> {
    if deltas.is_empty() {
        return Ok(());
    }
    db.with_conn(|conn| {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        mark_pushed(&tx, &deltas)?;
        tx.commit().map_err(|e| e.to_string())
    })?;
    db.persist()
}

fn field<'a>(p: &'a Value, key: &str) -> &'a str {
    p.get(key).and_then(Value::as_str).unwrap_or("")
}

/// Records (or refreshes) the conflict between the local pending state of an
/// entity and a remote document that diverged from the same base.
fn upsert_conflict(conn: &Connection, doc: &RemoteDoc, base: Option<(i64, String)>) -> Result<(), String> {
    let remote_payload = doc.payload.to_string();
    if let Some(id) = open_conflict_id(conn, &doc.entity, &doc.entity_id)? {
        conn.execute(
            "UPDATE sync_conflicts SET remote_payload = ?2, remote_revision = ?3, remote_deleted = ?4,
                    remote_hlc = ?5 WHERE id = ?1",
            params![id, remote_payload, doc.revision, doc.deleted, doc.hlc],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }
    let (local_payload, local_revision, local_deleted) = read_payload(conn, &doc.entity, &doc.entity_id)?
        .unwrap_or((Value::Null, 0, true));
    let local_hlc = latest_pending(conn, &doc.entity, &doc.entity_id)?.map(|p| p.0).unwrap_or_default();
    conn.execute(
        "INSERT INTO sync_conflicts (id, entity, entity_id, base_revision, local_payload, local_revision,
                local_deleted, local_hlc, remote_payload, remote_revision, remote_deleted, remote_hlc,
                detected_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now'))",
        params![
            Uuid::new_v4().to_string(),
            doc.entity,
            doc.entity_id,
            base.map(|b| b.0),
            local_payload.to_string(),
            local_revision,
            local_deleted,
            local_hlc,
            remote_payload,
            doc.revision,
            doc.deleted,
            doc.hlc,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Applies one remote document. Does NOT append to the oplog (remote changes
/// must not echo back). If the entity has local pending changes or an open
/// conflict, the remote version is kept in `sync_conflicts` instead.
fn apply_doc(conn: &Connection, workspace_id: &str, doc: &RemoteDoc) -> Result<(), String> {
    if !CORE.contains(&doc.entity.as_str()) {
        return Ok(());
    }
    oplog::observe_hlc(conn, &doc.hlc)?;
    let base = base_of(conn, &doc.entity, &doc.entity_id)?;
    // The version we already have in sync (typically the echo of our own push).
    if base.as_ref() == Some(&(doc.revision, doc.hlc.clone())) {
        return Ok(());
    }
    if open_conflict_id(conn, &doc.entity, &doc.entity_id)?.is_some()
        || latest_pending(conn, &doc.entity, &doc.entity_id)?.is_some()
    {
        return upsert_conflict(conn, doc, base);
    }
    write_doc(conn, workspace_id, doc)?;
    set_base(conn, &doc.entity, &doc.entity_id, doc.revision, &doc.hlc)
}

/// Overwrites the local row with a remote document's state.
fn write_doc(conn: &Connection, workspace_id: &str, doc: &RemoteDoc) -> Result<(), String> {
    let Some(table) = table_for(&doc.entity) else {
        return Ok(());
    };

    if doc.deleted {
        conn.execute(
            &format!("UPDATE {table} SET deleted_at = datetime('now'), revision = ?2 WHERE id = ?1"),
            params![doc.entity_id, doc.revision],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let p = &doc.payload;
    let data_str = |key: &str| p.get(key).map(|v| v.to_string()).unwrap_or_else(|| "{}".into());
    match doc.entity.as_str() {
        "project" => {
            // created_by/updated_by are NOT NULL; use the owner as the actor.
            let actor = p.get("ownerId").and_then(Value::as_str).unwrap_or("");
            conn.execute(
                "INSERT INTO projects (id, workspace_id, owner_id, name, case_id_prefix, case_id_digits,
                        created_by, updated_by, created_at, updated_at, revision, deleted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, datetime('now'), datetime('now'), ?8, NULL)
                 ON CONFLICT(id) DO UPDATE SET name=excluded.name, case_id_prefix=excluded.case_id_prefix,
                        case_id_digits=excluded.case_id_digits, owner_id=excluded.owner_id,
                        updated_by=excluded.updated_by, updated_at=datetime('now'),
                        revision=excluded.revision, deleted_at=NULL",
                params![
                    doc.entity_id,
                    workspace_id,
                    p.get("ownerId").and_then(Value::as_str),
                    field(p, "name"),
                    field(p, "caseIdPrefix"),
                    p.get("caseIdDigits").and_then(Value::as_i64).unwrap_or(3),
                    actor,
                    doc.revision,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        "test_plan" => {
            let actor = field(p, "author");
            conn.execute(
                "INSERT INTO test_plans (id, workspace_id, project_id, title, version, plan_date, author,
                        status, data, created_by, updated_by, created_at, updated_at, revision, deleted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?7, ?7, datetime('now'), datetime('now'), ?10, NULL)
                 ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, title=excluded.title,
                        version=excluded.version, plan_date=excluded.plan_date, author=excluded.author,
                        status=excluded.status, data=excluded.data, updated_by=excluded.updated_by,
                        updated_at=datetime('now'), revision=excluded.revision, deleted_at=NULL",
                params![
                    doc.entity_id,
                    workspace_id,
                    p.get("projectId").and_then(Value::as_str),
                    field(p, "title"),
                    field(p, "version"),
                    p.get("planDate").and_then(Value::as_str),
                    actor,
                    field(p, "status"),
                    data_str("data"),
                    doc.revision,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        "test_case" => {
            // created_by/updated_by (NOT NULL) reuse the author param (?9).
            conn.execute(
                "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, version, status,
                        priority, author, data, created_by, updated_by, created_at, updated_at, revision, deleted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?9, ?9, datetime('now'), datetime('now'), ?11, NULL)
                 ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, scenario_id=excluded.scenario_id,
                        title=excluded.title, version=excluded.version, status=excluded.status,
                        priority=excluded.priority, author=excluded.author, data=excluded.data,
                        updated_by=excluded.updated_by, updated_at=datetime('now'),
                        revision=excluded.revision, deleted_at=NULL",
                params![
                    doc.entity_id,
                    workspace_id,
                    p.get("projectId").and_then(Value::as_str),
                    field(p, "scenarioId"),
                    field(p, "title"),
                    field(p, "version"),
                    field(p, "status"),
                    field(p, "priority"),
                    field(p, "author"),
                    data_str("data"),
                    doc.revision,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        _ => {}
    }
    Ok(())
}

/// The pull cursor, stored in the local DB so it is wiped together with the data
/// (a fresh/empty DB restarts at 0 and re-pulls everything).
#[tauri::command]
pub fn sync_cursor_get(db: State<Db>) -> Result<String, String> {
    db.with_conn(|conn| {
        let v: Option<String> = conn
            .query_row("SELECT value FROM sync_state WHERE key = 'cursor'", [], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        Ok(v.unwrap_or_else(|| "0".to_string()))
    })
}

#[tauri::command]
pub fn sync_cursor_set(db: State<Db>, value: String) -> Result<(), String> {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO sync_state (key, value) VALUES ('cursor', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    db.persist()
}

/// Applies a batch of remote documents (pulled from the backend).
#[tauri::command]
pub fn apply_remote(db: State<Db>, docs: Vec<RemoteDoc>) -> Result<(), String> {
    if docs.is_empty() {
        return Ok(());
    }
    db.with_conn(|conn| {
        let workspace_id = ensure_workspace(conn)?;
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        for doc in &docs {
            apply_doc(&tx, &workspace_id, doc)?;
        }
        tx.commit().map_err(|e| e.to_string())
    })?;
    db.persist()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictSide {
    payload: Value,
    revision: i64,
    deleted: bool,
    hlc: String,
}

/// An open conflict as shown in the conflict panel: both full versions, so the
/// UI can diff them field by field (SYNC-02 can later add a merged resolution).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    id: String,
    entity: String,
    entity_id: String,
    base_revision: Option<i64>,
    local: ConflictSide,
    remote: ConflictSide,
    detected_at: String,
}

const CONFLICT_COLS: &str = "id, entity, entity_id, base_revision, local_payload, local_revision,
    local_deleted, local_hlc, remote_payload, remote_revision, remote_deleted, remote_hlc, detected_at";

fn conflict_from_row(r: &rusqlite::Row) -> rusqlite::Result<Conflict> {
    let json_col = |i: usize| -> rusqlite::Result<Value> {
        let s: String = r.get(i)?;
        Ok(serde_json::from_str(&s).unwrap_or(Value::Null))
    };
    Ok(Conflict {
        id: r.get(0)?,
        entity: r.get(1)?,
        entity_id: r.get(2)?,
        base_revision: r.get(3)?,
        local: ConflictSide { payload: json_col(4)?, revision: r.get(5)?, deleted: r.get(6)?, hlc: r.get(7)? },
        remote: ConflictSide { payload: json_col(8)?, revision: r.get(9)?, deleted: r.get(10)?, hlc: r.get(11)? },
        detected_at: r.get(12)?,
    })
}

/// Open conflicts, oldest first.
#[tauri::command]
pub fn sync_conflicts_list(db: State<Db>) -> Result<Vec<Conflict>, String> {
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {CONFLICT_COLS} FROM sync_conflicts WHERE resolved_at IS NULL ORDER BY detected_at, rowid"
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], conflict_from_row).map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
    })
}

/// Resolves a conflict for the whole entity (decision 2026-08-13: per-entity
/// granularity). `local` keeps this device's version and re-bases it on the
/// remote one so the next push is accepted; `remote` takes the server version
/// and discards the local pending changes.
fn resolve_conflict(conn: &Connection, workspace_id: &str, id: &str, resolution: &str) -> Result<(), String> {
    let c = conn
        .query_row(
            &format!("SELECT {CONFLICT_COLS} FROM sync_conflicts WHERE id = ?1 AND resolved_at IS NULL"),
            params![id],
            conflict_from_row,
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("conflict not found")?;
    let table = table_for(&c.entity).ok_or("unknown entity")?;

    match resolution {
        "local" => {
            let author = latest_pending(conn, &c.entity, &c.entity_id)?.map(|p| p.1).unwrap_or_default();
            let revision = c.remote.revision + 1;
            conn.execute(&format!("UPDATE {table} SET revision = ?2 WHERE id = ?1"), params![c.entity_id, revision])
                .map_err(|e| e.to_string())?;
            mark_entity_synced(conn, &c.entity, &c.entity_id)?;
            set_base(conn, &c.entity, &c.entity_id, c.remote.revision, &c.remote.hlc)?;
            let deleted = read_payload(conn, &c.entity, &c.entity_id)?.map_or(true, |p| p.2);
            // A fresh delta (new HLC, after the remote one already observed) on
            // top of the remote base: the next push fast-forwards the server.
            oplog::record(
                conn,
                &c.entity,
                &c.entity_id,
                if deleted { "delete" } else { "upsert" },
                "{}",
                revision,
                &author,
            )?;
        }
        "remote" => {
            let doc = RemoteDoc {
                entity: c.entity.clone(),
                entity_id: c.entity_id.clone(),
                payload: c.remote.payload,
                revision: c.remote.revision,
                deleted: c.remote.deleted,
                hlc: c.remote.hlc,
            };
            write_doc(conn, workspace_id, &doc)?;
            mark_entity_synced(conn, &c.entity, &c.entity_id)?;
            set_base(conn, &doc.entity, &doc.entity_id, doc.revision, &doc.hlc)?;
        }
        other => return Err(format!("unknown resolution: {other}")),
    }

    conn.execute(
        "UPDATE sync_conflicts SET resolved_at = datetime('now'), resolution = ?2 WHERE id = ?1",
        params![id, resolution],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn sync_conflict_resolve(db: State<Db>, id: String, resolution: String) -> Result<(), String> {
    db.with_conn(|conn| {
        let workspace_id = ensure_workspace(conn)?;
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        resolve_conflict(&tx, &workspace_id, &id, &resolution)?;
        tx.commit().map_err(|e| e.to_string())
    })?;
    db.persist()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        c
    }

    /// A test case already in sync with the server at revision 1.
    fn synced_case(c: &Connection, id: &str, title: &str) -> String {
        let ws = ensure_workspace(c).unwrap();
        c.execute(
            "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, version, status,
                    priority, author, data, created_by, updated_by, created_at, updated_at, revision)
             VALUES (?1, ?2, NULL, 'ATS_001', ?3, '1.0', 'draft', 'medium', 'Ada', '{}', 'Ada', 'Ada',
                    datetime('now'), datetime('now'), 1)",
            params![id, ws, title],
        )
        .unwrap();
        set_base(c, "test_case", id, 1, "").unwrap();
        ws
    }

    /// A local edit, as the test_case repo does it (bump revision + oplog row).
    fn edit_locally(c: &Connection, id: &str, title: &str) {
        let rev: i64 = c.query_row("SELECT revision FROM test_cases WHERE id = ?1", params![id], |r| r.get(0)).unwrap();
        c.execute("UPDATE test_cases SET title = ?2, revision = ?3 WHERE id = ?1", params![id, title, rev + 1])
            .unwrap();
        oplog::record(c, "test_case", id, "upsert", "{}", rev + 1, "Ada").unwrap();
    }

    fn remote(id: &str, title: &str, revision: i64, hlc: &str) -> RemoteDoc {
        RemoteDoc {
            entity: "test_case".into(),
            entity_id: id.into(),
            payload: json!({ "id": id, "scenarioId": "ATS_001", "title": title, "version": "1.0",
                             "status": "draft", "priority": "medium", "author": "Web", "data": {} }),
            revision,
            deleted: false,
            hlc: hlc.into(),
        }
    }

    fn title(c: &Connection, id: &str) -> String {
        c.query_row("SELECT title FROM test_cases WHERE id = ?1", params![id], |r| r.get(0)).unwrap()
    }

    fn open_conflicts(c: &Connection) -> i64 {
        c.query_row("SELECT count(*) FROM sync_conflicts WHERE resolved_at IS NULL", [], |r| r.get(0)).unwrap()
    }

    const WEB_HLC: &str = "001730000000000-00000-web-device";

    #[test]
    fn remote_change_without_local_edits_is_applied() {
        let c = conn();
        let ws = synced_case(&c, "c1", "Login");
        apply_doc(&c, &ws, &remote("c1", "Login (web)", 2, WEB_HLC)).unwrap();
        assert_eq!(title(&c, "c1"), "Login (web)");
        assert_eq!(base_of(&c, "test_case", "c1").unwrap(), Some((2, WEB_HLC.to_string())));
        assert_eq!(open_conflicts(&c), 0);
    }

    #[test]
    fn diverged_changes_are_kept_as_a_conflict() {
        let c = conn();
        let ws = synced_case(&c, "c1", "Login");
        edit_locally(&c, "c1", "Login (desktop)");
        apply_doc(&c, &ws, &remote("c1", "Login (web)", 2, WEB_HLC)).unwrap();

        // Local data is not overwritten and the entity is held back from push.
        assert_eq!(title(&c, "c1"), "Login (desktop)");
        assert_eq!(open_conflicts(&c), 1);
        assert!(build_pending(&c).unwrap().deltas.is_empty());

        // The same remote doc again (pull after a rejected push) does not duplicate it.
        apply_doc(&c, &ws, &remote("c1", "Login (web)", 2, WEB_HLC)).unwrap();
        assert_eq!(open_conflicts(&c), 1);
    }

    #[test]
    fn echo_of_own_push_is_not_a_conflict() {
        let c = conn();
        let ws = synced_case(&c, "c1", "Login");
        edit_locally(&c, "c1", "Login (desktop)");
        let pending = build_pending(&c).unwrap();
        let d = &pending.deltas[0];
        assert_eq!((d.base_revision, d.revision), (Some(1), 2));
        let pushed = PushedDelta {
            entity: d.entity.clone(),
            entity_id: d.entity_id.clone(),
            revision: d.revision,
            hlc: d.hlc.clone(),
            op_ids: d.op_ids.clone(),
        };
        let echo = remote("c1", "Login (desktop)", 2, &d.hlc);
        mark_pushed(&c, &[pushed]).unwrap();
        apply_doc(&c, &ws, &echo).unwrap();
        assert_eq!(open_conflicts(&c), 0);
        assert!(build_pending(&c).unwrap().deltas.is_empty());
    }

    #[test]
    fn resolve_remote_takes_the_server_version() {
        let c = conn();
        let ws = synced_case(&c, "c1", "Login");
        edit_locally(&c, "c1", "Login (desktop)");
        apply_doc(&c, &ws, &remote("c1", "Login (web)", 2, WEB_HLC)).unwrap();
        let id = sync_conflict_id(&c);

        resolve_conflict(&c, &ws, &id, "remote").unwrap();
        assert_eq!(title(&c, "c1"), "Login (web)");
        assert_eq!(open_conflicts(&c), 0);
        assert!(build_pending(&c).unwrap().deltas.is_empty());
        assert_eq!(base_of(&c, "test_case", "c1").unwrap(), Some((2, WEB_HLC.to_string())));
    }

    #[test]
    fn resolve_local_rebases_on_the_remote_version() {
        let c = conn();
        let ws = synced_case(&c, "c1", "Login");
        edit_locally(&c, "c1", "Login (desktop)");
        apply_doc(&c, &ws, &remote("c1", "Login (web)", 2, WEB_HLC)).unwrap();
        let id = sync_conflict_id(&c);

        resolve_conflict(&c, &ws, &id, "local").unwrap();
        assert_eq!(title(&c, "c1"), "Login (desktop)");
        assert_eq!(open_conflicts(&c), 0);
        let pending = build_pending(&c).unwrap();
        assert_eq!(pending.deltas.len(), 1);
        let d = &pending.deltas[0];
        // Based on the server's version, one revision above it, with a later HLC.
        assert_eq!(d.base_revision, Some(2));
        assert_eq!(d.base_hlc.as_deref(), Some(WEB_HLC));
        assert_eq!(d.revision, 3);
        assert!(hlc::cmp_encoded(&d.hlc, WEB_HLC).is_gt());
        assert!(resolve_conflict(&c, &ws, &id, "local").is_err(), "already resolved");
    }

    fn sync_conflict_id(c: &Connection) -> String {
        c.query_row("SELECT id FROM sync_conflicts WHERE resolved_at IS NULL", [], |r| r.get(0)).unwrap()
    }
}
