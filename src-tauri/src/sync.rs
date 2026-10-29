//! Delta sync client side (Phase 8B, spec §9). Builds the pending deltas (full
//! entity state, read live from the local DB) for the TS layer to POST to the
//! backend, marks them synced, and applies remote documents back. Phase 8C adds
//! conflict detection: each delta carries the base it was built on (`sync_base`)
//! and its HLC; a remote change that diverged from a local pending one is kept
//! in `sync_conflicts` for the conflict panel instead of overwriting local data.
//! Everything is scoped to the signed-in account (FIX-07, ADR-0020): its oplog
//! rows, bases, cursor and conflicts, so another account on this device never
//! pushes or overwrites them.
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
use crate::key_sync;
use crate::keys;
use crate::oplog::{self, SYNCED};

fn table_for(entity: &str) -> Option<&'static str> {
    match entity {
        "project" => Some("projects"),
        "test_plan" => Some("test_plans"),
        "test_case" => Some("test_cases"),
        "requirement" => Some("requirements"),
        "planner_card" => Some("planner_cards"),
        _ => None,
    }
}

/// Every sync command acts for one account; '' is the bucket of rows without a
/// derivable owner and must never be synced.
fn require_user(user_id: &str) -> Result<(), String> {
    if user_id.is_empty() {
        return Err("not-authenticated".into());
    }
    Ok(())
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

#[derive(Deserialize, Clone)]
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

fn data_json(row: &rusqlite::Row) -> rusqlite::Result<Value> {
    let data: String = row.get("data")?;
    Ok(serde_json::from_str::<Value>(&data).unwrap_or(Value::Null))
}

/// An entity's payload, revision and deleted flag, read from one row.
type PayloadRow = (Value, i64, bool);

/// Reads one entity's live state as the camelCase payload the TS API returns
/// (so the web client can consume it directly). None if the row is gone.
fn read_payload(conn: &Connection, entity: &str, id: &str) -> Result<Option<PayloadRow>, String> {
    let (sql, build): (&str, fn(&rusqlite::Row) -> rusqlite::Result<PayloadRow>) = match entity {
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
                        "data": data_json(r)?,
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
                        "data": data_json(r)?,
                        "createdAt": r.get::<_, String>("created_at")?,
                        "updatedAt": r.get::<_, String>("updated_at")?,
                        "revision": r.get::<_, i64>("revision")?,
                    }),
                    r.get::<_, i64>("revision")?,
                    s(r, "deleted_at")?.is_some(),
                ))
            },
        ),
        "requirement" => (
            "SELECT id, workspace_id, project_id, requirement_key, title, description, priority,
                    created_at, updated_at, revision, deleted_at FROM requirements WHERE id = ?1",
            |r| {
                Ok((
                    json!({
                        "id": r.get::<_, String>("id")?,
                        "workspaceId": r.get::<_, String>("workspace_id")?,
                        "projectId": r.get::<_, String>("project_id")?,
                        "requirementKey": r.get::<_, String>("requirement_key")?,
                        "title": r.get::<_, String>("title")?,
                        "description": r.get::<_, String>("description")?,
                        "priority": r.get::<_, String>("priority")?,
                        "createdAt": r.get::<_, String>("created_at")?,
                        "updatedAt": r.get::<_, String>("updated_at")?,
                        "revision": r.get::<_, i64>("revision")?,
                    }),
                    r.get::<_, i64>("revision")?,
                    s(r, "deleted_at")?.is_some(),
                ))
            },
        ),
        // Attachments stay on this device until SYNC-04b (content-addressed).
        "planner_card" => (
            "SELECT id, workspace_id, project_id, owner_id, kind, card_key, title, status, priority,
                    position, data, created_at, updated_at, revision, deleted_at FROM planner_cards WHERE id = ?1",
            |r| {
                Ok((
                    json!({
                        "id": r.get::<_, String>("id")?,
                        "workspaceId": r.get::<_, String>("workspace_id")?,
                        "projectId": r.get::<_, String>("project_id")?,
                        "ownerId": r.get::<_, String>("owner_id")?,
                        "kind": r.get::<_, String>("kind")?,
                        "cardKey": s(r, "card_key")?,
                        "title": r.get::<_, String>("title")?,
                        "status": r.get::<_, String>("status")?,
                        "priority": r.get::<_, String>("priority")?,
                        "position": r.get::<_, i64>("position")?,
                        "data": data_json(r)?,
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
    conn.query_row(sql, params![id], build)
        .optional()
        .map_err(|e| e.to_string())
}

fn base_of(
    conn: &Connection,
    user: &str,
    entity: &str,
    id: &str,
) -> Result<Option<(i64, String)>, String> {
    conn.query_row(
        "SELECT revision, hlc FROM sync_base WHERE user_id = ?1 AND entity = ?2 AND entity_id = ?3",
        params![user, entity, id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn set_base(
    conn: &Connection,
    user: &str,
    entity: &str,
    id: &str,
    revision: i64,
    hlc: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO sync_base (user_id, entity, entity_id, revision, hlc) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(user_id, entity, entity_id) DO UPDATE SET revision = excluded.revision, hlc = excluded.hlc",
        params![user, entity, id, revision, hlc],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Latest pending local change of an entity: (hlc, author). None if none pending.
fn latest_pending(
    conn: &Connection,
    user: &str,
    entity: &str,
    id: &str,
) -> Result<Option<(String, String)>, String> {
    conn.query_row(
        "SELECT hlc, author FROM oplog
          WHERE user_id = ?1 AND entity = ?2 AND entity_id = ?3 AND synced_at IS NULL
          ORDER BY rowid DESC LIMIT 1",
        params![user, entity, id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn mark_entity_synced(conn: &Connection, user: &str, entity: &str, id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE oplog SET synced_at = datetime('now')
         WHERE user_id = ?1 AND entity = ?2 AND entity_id = ?3 AND synced_at IS NULL",
        params![user, entity, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn open_conflict_id(
    conn: &Connection,
    user: &str,
    entity: &str,
    id: &str,
) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT id FROM sync_conflicts
          WHERE user_id = ?1 AND entity = ?2 AND entity_id = ?3 AND resolved_at IS NULL",
        params![user, entity, id],
        |r| r.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// Builds the pending deltas of one account: one per distinct synced entity
/// changed since the last sync, carrying its live state (or a tombstone), its
/// base and the oplog ids covered. Entities with an open conflict (of version
/// or of key, DAT-01) are held back until it is resolved.
fn build_pending(conn: &Connection, user: &str) -> Result<Pending, String> {
    oplog::claim_unowned(conn)?;
    key_sync::close_stale(conn)?;
    // (entity, entity_id) → (op ids, max hlc, author of the latest change), in
    // first-change order.
    let mut order: Vec<(String, String)> = Vec::new();
    let mut groups: HashMap<(String, String), (Vec<String>, String, String)> = HashMap::new();
    {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT o.entity, o.entity_id, o.id, o.hlc, o.author FROM oplog o
                 WHERE o.synced_at IS NULL AND o.user_id = ?1 AND o.entity IN ({})
                   AND NOT EXISTS (SELECT 1 FROM sync_conflicts c WHERE c.user_id = o.user_id
                                   AND c.entity = o.entity AND c.entity_id = o.entity_id
                                   AND c.resolved_at IS NULL)
                   AND NOT EXISTS (SELECT 1 FROM key_conflicts k WHERE k.entity = o.entity
                                   AND k.entity_id = o.entity_id AND k.resolved_at IS NULL)
                 ORDER BY o.rowid",
                oplog::synced_sql_list()
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![user], |r| {
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
                conn.execute(
                    "UPDATE oplog SET hlc = ?2 WHERE id = ?1",
                    params![id, delta_hlc],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        let base = base_of(conn, user, &entity, &entity_id)?;
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
pub fn oplog_pending(db: State<Db>, user_id: String) -> Result<Pending, String> {
    require_user(&user_id)?;
    let pending = db.with_conn(|conn| build_pending(conn, &user_id))?;
    db.persist()?;
    Ok(pending)
}

/// Marks the oplog rows of the deltas the server accepted as synced and moves
/// each entity's base to the version just pushed.
fn mark_pushed(conn: &Connection, user: &str, deltas: &[PushedDelta]) -> Result<(), String> {
    for d in deltas {
        for id in &d.op_ids {
            conn.execute(
                "UPDATE oplog SET synced_at = datetime('now') WHERE id = ?1 AND user_id = ?2",
                params![id, user],
            )
            .map_err(|e| e.to_string())?;
        }
        set_base(conn, user, &d.entity, &d.entity_id, d.revision, &d.hlc)?;
    }
    Ok(())
}

#[tauri::command]
pub fn oplog_mark_synced(
    db: State<Db>,
    user_id: String,
    deltas: Vec<PushedDelta>,
) -> Result<(), String> {
    require_user(&user_id)?;
    if deltas.is_empty() {
        return Ok(());
    }
    db.with_conn(|conn| {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        mark_pushed(&tx, &user_id, &deltas)?;
        tx.commit().map_err(|e| e.to_string())
    })?;
    db.persist()
}

fn field<'a>(p: &'a Value, key: &str) -> &'a str {
    p.get(key).and_then(Value::as_str).unwrap_or("")
}

/// Records (or refreshes) the conflict between the local pending state of an
/// entity and a remote document that diverged from the same base.
fn upsert_conflict(
    conn: &Connection,
    user: &str,
    doc: &RemoteDoc,
    base: Option<(i64, String)>,
) -> Result<(), String> {
    let remote_payload = doc.payload.to_string();
    if let Some(id) = open_conflict_id(conn, user, &doc.entity, &doc.entity_id)? {
        conn.execute(
            "UPDATE sync_conflicts SET remote_payload = ?2, remote_revision = ?3, remote_deleted = ?4,
                    remote_hlc = ?5 WHERE id = ?1",
            params![id, remote_payload, doc.revision, doc.deleted, doc.hlc],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }
    let (local_payload, local_revision, local_deleted) =
        read_payload(conn, &doc.entity, &doc.entity_id)?.unwrap_or((Value::Null, 0, true));
    let local_hlc = latest_pending(conn, user, &doc.entity, &doc.entity_id)?
        .map(|p| p.0)
        .unwrap_or_default();
    conn.execute(
        "INSERT INTO sync_conflicts (id, entity, entity_id, base_revision, local_payload, local_revision,
                local_deleted, local_hlc, remote_payload, remote_revision, remote_deleted, remote_hlc,
                detected_at, user_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now'), ?13)",
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
            user,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Applies one remote document of `user`'s server store. Does NOT append to
/// the oplog (remote changes must not echo back). If the entity has local
/// pending changes or an open conflict, the remote version is kept in
/// `sync_conflicts` instead. An entity that belongs to another account on this
/// device is never overwritten (FIX-07).
fn apply_doc(
    conn: &Connection,
    workspace_id: &str,
    user: &str,
    doc: &RemoteDoc,
) -> Result<(), String> {
    if !SYNCED.contains(&doc.entity.as_str()) {
        return Ok(());
    }
    if oplog::owner_of(conn, &doc.entity, &doc.entity_id)?.is_some_and(|owner| owner != user) {
        return Ok(());
    }
    oplog::observe_hlc(conn, &doc.hlc)?;
    let base = base_of(conn, user, &doc.entity, &doc.entity_id)?;
    // The version we already have in sync (typically the echo of our own push).
    if base.as_ref() == Some(&(doc.revision, doc.hlc.clone())) {
        return Ok(());
    }
    if open_conflict_id(conn, user, &doc.entity, &doc.entity_id)?.is_some()
        || latest_pending(conn, user, &doc.entity, &doc.entity_id)?.is_some()
    {
        return upsert_conflict(conn, user, doc, base);
    }
    write_doc(conn, workspace_id, user, doc)?;
    set_base(
        conn,
        user,
        &doc.entity,
        &doc.entity_id,
        doc.revision,
        &doc.hlc,
    )
}

/// Overwrites the local row with a remote document's state. `created_by` and
/// `updated_by` always get `user`, the account the document belongs to (its
/// owner, ADR-0020), never the free-text `author` of the payload (FIX-06).
fn write_doc(
    conn: &Connection,
    workspace_id: &str,
    user: &str,
    doc: &RemoteDoc,
) -> Result<(), String> {
    let Some(table) = table_for(&doc.entity) else {
        return Ok(());
    };

    if doc.deleted {
        conn.execute(
            &format!(
                "UPDATE {table} SET deleted_at = datetime('now'), revision = ?2 WHERE id = ?1"
            ),
            params![doc.entity_id, doc.revision],
        )
        .map_err(|e| e.to_string())?;
        key_sync::holder_deleted(conn, &doc.entity, &doc.entity_id)?;
        return Ok(());
    }

    let p = &doc.payload;
    let data_str = |key: &str| {
        p.get(key)
            .map(|v| v.to_string())
            .unwrap_or_else(|| "{}".into())
    };
    // Live keys are unique per project (DAT-01). The server has the last word:
    // a different local row that holds the pulled key loses it, gets a
    // provisional key and a key conflict for the user (ADR-0010).
    let key_field = match doc.entity.as_str() {
        "test_case" => Some("scenarioId"),
        "requirement" => Some("requirementKey"),
        "planner_card" => Some("cardKey"),
        _ => None,
    };
    let pulled_key = key_field.map_or("", |f| field(p, f));
    if key_field.is_some() {
        if let Some(holder) = key_sync::holder(
            conn,
            &doc.entity,
            field(p, "projectId"),
            pulled_key,
            &doc.entity_id,
        )? {
            key_sync::vacate(conn, user, &doc.entity, &holder, &doc.entity_id)?;
        }
    }
    match doc.entity.as_str() {
        "project" => {
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
                    user,
                    doc.revision,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        "test_plan" => {
            conn.execute(
                "INSERT INTO test_plans (id, workspace_id, project_id, title, version, plan_date, author,
                        status, data, created_by, updated_by, created_at, updated_at, revision, deleted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?11, ?11, datetime('now'), datetime('now'), ?10, NULL)
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
                    field(p, "author"),
                    field(p, "status"),
                    data_str("data"),
                    doc.revision,
                    user,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        "test_case" => {
            conn.execute(
                "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, version, status,
                        priority, author, data, created_by, updated_by, created_at, updated_at, revision, deleted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?12, ?12, datetime('now'), datetime('now'), ?11, NULL)
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
                    user,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        "requirement" => {
            // A definitive key never changes, but the server's version wins:
            // a provisional key replaced on another device, or a key renamed in
            // the conflict panel there, arrives here (DAT-01).
            conn.execute(
                "INSERT INTO requirements (id, workspace_id, project_id, requirement_key, title, description,
                        priority, created_by, updated_by, created_at, updated_at, revision, deleted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, datetime('now'), datetime('now'), ?9, NULL)
                 ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,
                        requirement_key=excluded.requirement_key, title=excluded.title,
                        description=excluded.description, priority=excluded.priority,
                        updated_by=excluded.updated_by, updated_at=datetime('now'),
                        revision=excluded.revision, deleted_at=NULL",
                params![
                    doc.entity_id,
                    workspace_id,
                    field(p, "projectId"),
                    field(p, "requirementKey"),
                    field(p, "title"),
                    field(p, "description"),
                    p.get("priority").and_then(Value::as_str).unwrap_or("medium"),
                    user,
                    doc.revision,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        "planner_card" => {
            let owner = p
                .get("ownerId")
                .and_then(Value::as_str)
                .filter(|o| !o.is_empty())
                .unwrap_or(user);
            conn.execute(
                "INSERT INTO planner_cards (id, workspace_id, project_id, owner_id, kind, card_key, title,
                        status, priority, position, data, created_by, updated_by, created_at, updated_at,
                        revision, deleted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12, datetime('now'),
                        datetime('now'), ?13, NULL)
                 ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, owner_id=excluded.owner_id,
                        kind=excluded.kind, card_key=excluded.card_key, title=excluded.title,
                        status=excluded.status, priority=excluded.priority, position=excluded.position,
                        data=excluded.data, updated_by=excluded.updated_by, updated_at=datetime('now'),
                        revision=excluded.revision, deleted_at=NULL",
                params![
                    doc.entity_id,
                    workspace_id,
                    field(p, "projectId"),
                    owner,
                    p.get("kind").and_then(Value::as_str).unwrap_or("task"),
                    p.get("cardKey").and_then(Value::as_str),
                    field(p, "title"),
                    p.get("status").and_then(Value::as_str).unwrap_or("backlog"),
                    p.get("priority").and_then(Value::as_str).unwrap_or("medium"),
                    p.get("position").and_then(Value::as_i64).unwrap_or(0),
                    data_str("data"),
                    user,
                    doc.revision,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        _ => {}
    }
    // The server gave this entity a definitive key: nothing left to resolve.
    if key_field.is_some() && !pulled_key.is_empty() && !keys::is_provisional(pulled_key) {
        key_sync::settled_by_server(conn, &doc.entity, &doc.entity_id)?;
    }
    Ok(())
}

/// Key of an account's pull cursor in `sync_state`. It lives in the local DB so
/// it is wiped together with the data (a fresh/empty DB restarts at 0).
fn cursor_key(user: &str) -> String {
    format!("cursor:{user}")
}

#[tauri::command]
pub fn sync_cursor_get(db: State<Db>, user_id: String) -> Result<String, String> {
    require_user(&user_id)?;
    db.with_conn(|conn| {
        let v: Option<String> = conn
            .query_row(
                "SELECT value FROM sync_state WHERE key = ?1",
                params![cursor_key(&user_id)],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        Ok(v.unwrap_or_else(|| "0".to_string()))
    })
}

#[tauri::command]
pub fn sync_cursor_set(db: State<Db>, user_id: String, value: String) -> Result<(), String> {
    require_user(&user_id)?;
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO sync_state (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![cursor_key(&user_id), value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    db.persist()
}

/// Applies one page of remote documents (pulled from the backend).
#[tauri::command]
pub fn apply_remote(db: State<Db>, user_id: String, docs: Vec<RemoteDoc>) -> Result<(), String> {
    require_user(&user_id)?;
    if docs.is_empty() {
        return Ok(());
    }
    db.with_conn(|conn| {
        let workspace_id = ensure_workspace(conn)?;
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        for doc in &docs {
            apply_doc(&tx, &workspace_id, &user_id, doc)?;
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
        local: ConflictSide {
            payload: json_col(4)?,
            revision: r.get(5)?,
            deleted: r.get(6)?,
            hlc: r.get(7)?,
        },
        remote: ConflictSide {
            payload: json_col(8)?,
            revision: r.get(9)?,
            deleted: r.get(10)?,
            hlc: r.get(11)?,
        },
        detected_at: r.get(12)?,
    })
}

/// Open conflicts of one account, oldest first.
fn list_conflicts(conn: &Connection, user: &str) -> Result<Vec<Conflict>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {CONFLICT_COLS} FROM sync_conflicts WHERE resolved_at IS NULL AND user_id = ?1
              ORDER BY detected_at, rowid"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![user], conflict_from_row)
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sync_conflicts_list(db: State<Db>, user_id: String) -> Result<Vec<Conflict>, String> {
    require_user(&user_id)?;
    db.with_conn(|conn| list_conflicts(conn, &user_id))
}

/// Resolves a conflict for the whole entity (decision 2026-08-13: per-entity
/// granularity). `local` keeps this device's version and re-bases it on the
/// remote one so the next push is accepted; `remote` takes the server version
/// and discards the local pending changes.
fn resolve_conflict(
    conn: &Connection,
    workspace_id: &str,
    user: &str,
    id: &str,
    resolution: &str,
) -> Result<(), String> {
    let c = conn
        .query_row(
            &format!(
                "SELECT {CONFLICT_COLS} FROM sync_conflicts WHERE id = ?1 AND user_id = ?2 AND resolved_at IS NULL"
            ),
            params![id, user],
            conflict_from_row,
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("conflict not found")?;
    let table = table_for(&c.entity).ok_or("unknown entity")?;

    match resolution {
        "local" => {
            let author = latest_pending(conn, user, &c.entity, &c.entity_id)?
                .map(|p| p.1)
                .unwrap_or_default();
            let revision = c.remote.revision + 1;
            conn.execute(
                &format!("UPDATE {table} SET revision = ?2 WHERE id = ?1"),
                params![c.entity_id, revision],
            )
            .map_err(|e| e.to_string())?;
            mark_entity_synced(conn, user, &c.entity, &c.entity_id)?;
            set_base(
                conn,
                user,
                &c.entity,
                &c.entity_id,
                c.remote.revision,
                &c.remote.hlc,
            )?;
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
            // Taking back a project this device had deleted: its children were
            // soft-deleted with it, only here (the server rejected the delete).
            if c.entity == "project" && c.local.deleted && !c.remote.deleted {
                restore_project_children(conn, &c.entity_id)?;
            }
            let doc = RemoteDoc {
                entity: c.entity.clone(),
                entity_id: c.entity_id.clone(),
                payload: c.remote.payload,
                revision: c.remote.revision,
                deleted: c.remote.deleted,
                hlc: c.remote.hlc,
            };
            write_doc(conn, workspace_id, user, &doc)?;
            mark_entity_synced(conn, user, &c.entity, &c.entity_id)?;
            set_base(
                conn,
                user,
                &doc.entity,
                &doc.entity_id,
                doc.revision,
                &doc.hlc,
            )?;
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

/// Undeletes the plans, cases, requirements and cards that `delete_project`
/// removed together with the project: deleted at or after the project and
/// without a delete of their own in the oplog (those stay deleted).
fn restore_project_children(conn: &Connection, project_id: &str) -> Result<(), String> {
    let Some(deleted_at) = conn
        .query_row(
            "SELECT deleted_at FROM projects WHERE id = ?1",
            params![project_id],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten()
    else {
        return Ok(());
    };
    for (entity, table) in [
        ("test_plan", "test_plans"),
        ("test_case", "test_cases"),
        ("requirement", "requirements"),
        ("planner_card", "planner_cards"),
    ] {
        conn.execute(
            &format!(
                "UPDATE {table} SET deleted_at = NULL
                  WHERE project_id = ?1 AND deleted_at >= ?2
                    AND id NOT IN (SELECT entity_id FROM oplog WHERE entity = ?3 AND op = 'delete')"
            ),
            params![project_id, deleted_at, entity],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn sync_conflict_resolve(
    db: State<Db>,
    user_id: String,
    id: String,
    resolution: String,
) -> Result<(), String> {
    require_user(&user_id)?;
    db.with_conn(|conn| {
        let workspace_id = ensure_workspace(conn)?;
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        resolve_conflict(&tx, &workspace_id, &user_id, &id, &resolution)?;
        tx.commit().map_err(|e| e.to_string())
    })?;
    db.persist()
}

#[cfg(test)]
mod tests {
    use super::*;

    const U1: &str = "user-1";
    const U2: &str = "user-2";

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        c
    }

    /// A project owned by `owner`, already in sync with the server.
    fn project(c: &Connection, id: &str, owner: &str) -> String {
        let ws = ensure_workspace(c).unwrap();
        c.execute(
            "INSERT INTO projects (id, workspace_id, owner_id, name, created_by, updated_by, created_at,
                    updated_at, revision)
             VALUES (?1, ?2, ?3, 'Checkout', ?3, ?3, datetime('now'), datetime('now'), 1)",
            params![id, ws, owner],
        )
        .unwrap();
        set_base(c, owner, "project", id, 1, "").unwrap();
        ws
    }

    /// A test case of project `p1` (owned by U1) already in sync at revision 1.
    fn synced_case(c: &Connection, id: &str, title: &str) -> String {
        let ws = if oplog::owner_of(c, "project", "p1").unwrap().is_none() {
            project(c, "p1", U1)
        } else {
            ensure_workspace(c).unwrap()
        };
        c.execute(
            "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, version, status,
                    priority, author, data, created_by, updated_by, created_at, updated_at, revision)
             VALUES (?1, ?2, 'p1', ?1, ?3, '1.0', 'draft', 'medium', 'Ada', '{}', 'Ada', 'Ada',
                    datetime('now'), datetime('now'), 1)",
            params![id, ws, title],
        )
        .unwrap();
        set_base(c, U1, "test_case", id, 1, "").unwrap();
        ws
    }

    /// A local edit, as the test_case repo does it (bump revision + oplog row).
    fn edit_locally(c: &Connection, id: &str, title: &str) {
        let rev: i64 = c
            .query_row(
                "SELECT revision FROM test_cases WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap();
        c.execute(
            "UPDATE test_cases SET title = ?2, revision = ?3 WHERE id = ?1",
            params![id, title, rev + 1],
        )
        .unwrap();
        oplog::record(c, "test_case", id, "upsert", "{}", rev + 1, "Ada").unwrap();
    }

    fn remote(id: &str, title: &str, revision: i64, hlc: &str) -> RemoteDoc {
        RemoteDoc {
            entity: "test_case".into(),
            entity_id: id.into(),
            payload: json!({ "id": id, "projectId": "p1", "scenarioId": id, "title": title,
                             "version": "1.0", "status": "draft", "priority": "medium", "author": "Web",
                             "data": {} }),
            revision,
            deleted: false,
            hlc: hlc.into(),
        }
    }

    fn title(c: &Connection, id: &str) -> String {
        c.query_row(
            "SELECT title FROM test_cases WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .unwrap()
    }

    fn open_conflicts(c: &Connection) -> i64 {
        c.query_row(
            "SELECT count(*) FROM sync_conflicts WHERE resolved_at IS NULL",
            [],
            |r| r.get(0),
        )
        .unwrap()
    }

    /// What the server would return on a pull for a delta it accepted.
    fn as_remote(d: &Delta) -> RemoteDoc {
        RemoteDoc {
            entity: d.entity.clone(),
            entity_id: d.entity_id.clone(),
            payload: d.payload.clone(),
            revision: d.revision,
            deleted: d.op == "delete",
            hlc: d.hlc.clone(),
        }
    }

    fn pushed(d: &Delta) -> PushedDelta {
        PushedDelta {
            entity: d.entity.clone(),
            entity_id: d.entity_id.clone(),
            revision: d.revision,
            hlc: d.hlc.clone(),
            op_ids: d.op_ids.clone(),
        }
    }

    const WEB_HLC: &str = "001730000000000-00000-web-device";

    #[test]
    fn remote_change_without_local_edits_is_applied() {
        let c = conn();
        let ws = synced_case(&c, "c1", "Login");
        apply_doc(&c, &ws, U1, &remote("c1", "Login (web)", 2, WEB_HLC)).unwrap();
        assert_eq!(title(&c, "c1"), "Login (web)");
        assert_eq!(
            base_of(&c, U1, "test_case", "c1").unwrap(),
            Some((2, WEB_HLC.to_string()))
        );
        assert_eq!(open_conflicts(&c), 0);
    }

    #[test]
    fn diverged_changes_are_kept_as_a_conflict() {
        let c = conn();
        let ws = synced_case(&c, "c1", "Login");
        edit_locally(&c, "c1", "Login (desktop)");
        apply_doc(&c, &ws, U1, &remote("c1", "Login (web)", 2, WEB_HLC)).unwrap();

        // Local data is not overwritten and the entity is held back from push.
        assert_eq!(title(&c, "c1"), "Login (desktop)");
        assert_eq!(open_conflicts(&c), 1);
        assert!(build_pending(&c, U1).unwrap().deltas.is_empty());

        // The same remote doc again (pull after a rejected push) does not duplicate it.
        apply_doc(&c, &ws, U1, &remote("c1", "Login (web)", 2, WEB_HLC)).unwrap();
        assert_eq!(open_conflicts(&c), 1);
    }

    #[test]
    fn echo_of_own_push_is_not_a_conflict() {
        let c = conn();
        let ws = synced_case(&c, "c1", "Login");
        edit_locally(&c, "c1", "Login (desktop)");
        let pending = build_pending(&c, U1).unwrap();
        let d = &pending.deltas[0];
        assert_eq!((d.base_revision, d.revision), (Some(1), 2));
        let echo = remote("c1", "Login (desktop)", 2, &d.hlc);
        mark_pushed(&c, U1, &[pushed(d)]).unwrap();
        apply_doc(&c, &ws, U1, &echo).unwrap();
        assert_eq!(open_conflicts(&c), 0);
        assert!(build_pending(&c, U1).unwrap().deltas.is_empty());
    }

    #[test]
    fn resolve_remote_takes_the_server_version() {
        let c = conn();
        let ws = synced_case(&c, "c1", "Login");
        edit_locally(&c, "c1", "Login (desktop)");
        apply_doc(&c, &ws, U1, &remote("c1", "Login (web)", 2, WEB_HLC)).unwrap();
        let id = sync_conflict_id(&c);

        resolve_conflict(&c, &ws, U1, &id, "remote").unwrap();
        assert_eq!(title(&c, "c1"), "Login (web)");
        assert_eq!(open_conflicts(&c), 0);
        assert!(build_pending(&c, U1).unwrap().deltas.is_empty());
        assert_eq!(
            base_of(&c, U1, "test_case", "c1").unwrap(),
            Some((2, WEB_HLC.to_string()))
        );
    }

    #[test]
    fn resolve_local_rebases_on_the_remote_version() {
        let c = conn();
        let ws = synced_case(&c, "c1", "Login");
        edit_locally(&c, "c1", "Login (desktop)");
        apply_doc(&c, &ws, U1, &remote("c1", "Login (web)", 2, WEB_HLC)).unwrap();
        let id = sync_conflict_id(&c);

        resolve_conflict(&c, &ws, U1, &id, "local").unwrap();
        assert_eq!(title(&c, "c1"), "Login (desktop)");
        assert_eq!(open_conflicts(&c), 0);
        let pending = build_pending(&c, U1).unwrap();
        assert_eq!(pending.deltas.len(), 1);
        let d = &pending.deltas[0];
        // Based on the server's version, one revision above it, with a later HLC.
        assert_eq!(d.base_revision, Some(2));
        assert_eq!(d.base_hlc.as_deref(), Some(WEB_HLC));
        assert_eq!(d.revision, 3);
        assert!(hlc::cmp_encoded(&d.hlc, WEB_HLC).is_gt());
        assert!(
            resolve_conflict(&c, &ws, U1, &id, "local").is_err(),
            "already resolved"
        );
    }

    fn sync_conflict_id(c: &Connection) -> String {
        c.query_row(
            "SELECT id FROM sync_conflicts WHERE resolved_at IS NULL",
            [],
            |r| r.get(0),
        )
        .unwrap()
    }

    fn insert_requirement(c: &Connection, id: &str, project_id: &str, key: &str, title: &str) {
        let ws = ensure_workspace(c).unwrap();
        c.execute(
            "INSERT INTO requirements (id, workspace_id, project_id, requirement_key, title, description,
                    priority, created_by, updated_by, created_at, updated_at, revision)
             VALUES (?1, ?2, ?3, ?4, ?5, '', 'high', 'x', 'x', datetime('now'), datetime('now'), 1)",
            params![id, ws, project_id, key, title],
        )
        .unwrap();
        oplog::record(c, "requirement", id, "upsert", "{}", 1, "x").unwrap();
    }

    // FIX-01: the indicator counts only what a sync sends, and reaches 0 after it.
    #[test]
    fn pending_count_matches_what_the_push_sends() {
        let c = conn();
        project(&c, "p1", U1);
        insert_requirement(&c, "r1", "p1", "REQ-001", "Login");
        c.execute(
            "UPDATE requirements SET title = 'Login v2', revision = 2 WHERE id = 'r1'",
            [],
        )
        .unwrap();
        oplog::record(&c, "requirement", "r1", "upsert", "{}", 2, "x").unwrap();
        // A template edit is journaled but not synced until SYNC-04b.
        oplog::record(&c, "template", "t1", "upsert", "{}", 1, "").unwrap();

        assert_eq!(
            oplog::sync_state(&c, U1).unwrap().pending,
            1,
            "one entity, two edits, no template"
        );
        let pending = build_pending(&c, U1).unwrap();
        assert_eq!(pending.deltas.len(), 1);
        assert_eq!(pending.deltas[0].entity, "requirement");
        mark_pushed(&c, U1, &[pushed(&pending.deltas[0])]).unwrap();
        assert_eq!(oplog::sync_state(&c, U1).unwrap().pending, 0);
    }

    // FIX-07: two accounts on one device never see each other's sync state.
    #[test]
    fn another_account_does_not_push_pending_changes() {
        let c = conn();
        let ws = synced_case(&c, "c1", "Login"); // owned by U1 through p1
        edit_locally(&c, "c1", "Login (A offline)");
        project(&c, "p2", U2);

        assert_eq!(oplog::sync_state(&c, U1).unwrap().pending, 1);
        assert_eq!(oplog::sync_state(&c, U2).unwrap().pending, 0);
        assert!(build_pending(&c, U2).unwrap().deltas.is_empty());
        // B cannot mark A's rows synced either.
        let a = build_pending(&c, U1).unwrap();
        mark_pushed(&c, U2, &[pushed(&a.deltas[0])]).unwrap();
        assert_eq!(oplog::sync_state(&c, U1).unwrap().pending, 1);
        // A pull for B never overwrites A's entity, even if B's store has a copy.
        apply_doc(&c, &ws, U2, &remote("c1", "Login (B's copy)", 9, WEB_HLC)).unwrap();
        assert_eq!(title(&c, "c1"), "Login (A offline)");
        assert_eq!(open_conflicts(&c), 0);
        // Rows without a derivable owner are never synced.
        assert!(require_user("").is_err());
    }

    // SYNC-04a: a requirement and a defect created on device A appear on device
    // B, and the case links (by key) resolve there.
    #[test]
    fn requirements_and_cards_travel_between_devices() {
        let a = conn();
        let ws_a = project(&a, "p1", U1);
        oplog::record(&a, "project", "p1", "upsert", "{}", 1, U1).unwrap();
        insert_requirement(&a, "r1", "p1", "REQ-001", "Login");
        a.execute(
            "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, version, status,
                    priority, author, data, created_by, updated_by, created_at, updated_at, revision)
             VALUES ('c1', ?1, 'p1', 'ATS_001', 'Login ok', '1.0', 'draft', 'medium', 'Ada',
                     '{\"requirementKeys\":[\"REQ-001\"]}', 'Ada', 'Ada', datetime('now'), datetime('now'), 1)",
            params![ws_a],
        )
        .unwrap();
        oplog::record(&a, "test_case", "c1", "upsert", "{}", 1, "Ada").unwrap();
        a.execute(
            "INSERT INTO planner_cards (id, workspace_id, project_id, owner_id, kind, card_key, title, status,
                    priority, position, data, created_by, updated_by, created_at, updated_at, revision)
             VALUES ('d1', ?1, 'p1', ?2, 'defect', 'DEF-001', 'Crash', 'backlog', 'high', 0,
                     '{\"testCaseIds\":[\"c1\"]}', ?2, ?2, datetime('now'), datetime('now'), 1)",
            params![ws_a, U1],
        )
        .unwrap();
        oplog::record(&a, "planner_card", "d1", "upsert", "{}", 1, U1).unwrap();

        let deltas = build_pending(&a, U1).unwrap().deltas;
        let entities: Vec<&str> = deltas.iter().map(|d| d.entity.as_str()).collect();
        assert_eq!(
            entities,
            ["project", "requirement", "test_case", "planner_card"]
        );

        // Device B pulls those documents (same account).
        let b = conn();
        let ws_b = ensure_workspace(&b).unwrap();
        for d in &deltas {
            apply_doc(&b, &ws_b, U1, &as_remote(d)).unwrap();
        }
        let linked: String = b
            .query_row(
                "SELECT r.title FROM test_cases c, json_each(c.data, '$.requirementKeys') k
                   JOIN requirements r ON r.project_id = c.project_id AND r.requirement_key = k.value
                  WHERE c.id = 'c1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(linked, "Login");
        let card: (String, String, String) = b
            .query_row(
                "SELECT card_key, owner_id, data FROM planner_cards WHERE id = 'd1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(card.0, "DEF-001");
        assert_eq!(card.1, U1);
        assert!(card.2.contains("c1"));
        // Nothing echoes back from B.
        assert!(build_pending(&b, U1).unwrap().deltas.is_empty());
    }

    // DAT-01: a key numbered on two devices does not break the pull nor drop
    // either requirement. The pulled one keeps the key (the server has the last
    // word); the local one gets a provisional key and a key conflict, and is
    // not pushed until the user picks a new key.
    #[test]
    fn a_pulled_key_wins_and_the_local_holder_gets_a_key_conflict() {
        let c = conn();
        let ws = project(&c, "p1", U1);
        insert_requirement(&c, "r-local", "p1", "REQ-004", "Local one");
        oplog::record(&c, "requirement", "r-local", "upsert", "{}", 1, U1).unwrap();
        let doc = RemoteDoc {
            entity: "requirement".into(),
            entity_id: "r-remote".into(),
            payload: json!({ "id": "r-remote", "projectId": "p1", "requirementKey": "REQ-004",
                             "title": "Remote one", "description": "", "priority": "low" }),
            revision: 1,
            deleted: false,
            hlc: WEB_HLC.into(),
        };
        apply_doc(&c, &ws, U1, &doc).unwrap();
        let key_of = |id: &str| -> String {
            c.query_row(
                "SELECT requirement_key FROM requirements WHERE id = ?1 AND deleted_at IS NULL",
                [id],
                |r| r.get(0),
            )
            .unwrap()
        };
        assert_eq!(key_of("r-remote"), "REQ-004");
        let provisional = key_of("r-local");
        assert!(provisional.starts_with("REQ-?"), "{provisional}");

        let open = crate::key_sync::list(&c, U1).unwrap();
        assert_eq!(open.len(), 1);
        assert_eq!(
            (open[0].entity_id.as_str(), open[0].lost_key.as_str()),
            ("r-local", "REQ-004")
        );
        assert_eq!(oplog::sync_state(&c, U1).unwrap().conflicts, 1);
        // Held back from the push until resolved.
        assert!(build_pending(&c, U1)
            .unwrap()
            .deltas
            .iter()
            .all(|d| d.entity_id != "r-local"));

        // The user picks a key: it is pushed with it.
        crate::key_sync::resolve(&c, U1, &open[0].id, Some("REQ-104")).unwrap();
        assert_eq!(key_of("r-local"), "REQ-104");
        let pending = build_pending(&c, U1).unwrap();
        let delta = pending
            .deltas
            .iter()
            .find(|d| d.entity_id == "r-local")
            .unwrap();
        assert_eq!(delta.payload["requirementKey"], "REQ-104");
        assert_eq!(oplog::sync_state(&c, U1).unwrap().conflicts, 0);
    }

    #[test]
    fn a_key_conflict_is_settled_when_the_server_sends_the_entity_with_a_key() {
        let c = conn();
        let ws = project(&c, "p1", U1);
        insert_requirement(&c, "r1", "p1", "REQ-001", "Mine");
        c.execute("UPDATE oplog SET synced_at = 'now'", []).unwrap();
        crate::key_sync::vacate(&c, U1, "requirement", "r1", "r2").unwrap();
        assert_eq!(crate::key_sync::list(&c, U1).unwrap().len(), 1);
        let doc = RemoteDoc {
            entity: "requirement".into(),
            entity_id: "r1".into(),
            payload: json!({ "id": "r1", "projectId": "p1", "requirementKey": "REQ-001-dup1",
                             "title": "Mine", "description": "", "priority": "low" }),
            revision: 2,
            deleted: false,
            hlc: WEB_HLC.into(),
        };
        apply_doc(&c, &ws, U1, &doc).unwrap();
        assert!(crate::key_sync::list(&c, U1).unwrap().is_empty());
        let key: String = c
            .query_row(
                "SELECT requirement_key FROM requirements WHERE id = 'r1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(key, "REQ-001-dup1");
    }

    // FIX-05 on the receiving device: the server cascades a project delete into
    // tombstones of its children; each is applied, and a child with a local
    // pending edit becomes a conflict instead of losing the edit.
    #[test]
    fn cascaded_tombstones_delete_children_or_raise_a_conflict() {
        let c = conn();
        let ws = synced_case(&c, "c1", "Login");
        synced_case(&c, "c2", "Logout");
        edit_locally(&c, "c2", "Logout (edited offline)");
        let tomb = |entity: &str, id: &str| RemoteDoc {
            entity: entity.into(),
            entity_id: id.into(),
            payload: json!({ "id": id, "projectId": "p1" }),
            revision: 2,
            deleted: true,
            hlc: WEB_HLC.into(),
        };
        for doc in [
            tomb("project", "p1"),
            tomb("test_case", "c1"),
            tomb("test_case", "c2"),
        ] {
            apply_doc(&c, &ws, U1, &doc).unwrap();
        }
        let deleted = |table: &str, id: &str| -> bool {
            c.query_row(
                &format!("SELECT deleted_at IS NOT NULL FROM {table} WHERE id = ?1"),
                params![id],
                |r| r.get(0),
            )
            .unwrap()
        };
        assert!(deleted("projects", "p1"));
        assert!(deleted("test_cases", "c1"));
        assert!(!deleted("test_cases", "c2"), "pending edit is kept");
        assert_eq!(open_conflicts(&c), 1);
    }

    // VERSIONING §6.2: a database at migration 0011 with sync state of two
    // accounts upgrades without losing a row, and each row gets its owner.
    #[test]
    fn upgrade_from_0011_keeps_sync_state_per_owner() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))")
            .unwrap();
        for (name, sql) in &crate::db::MIGRATIONS[..11] {
            c.execute_batch(sql).unwrap();
            c.execute("INSERT INTO schema_migrations (name) VALUES (?1)", [name])
                .unwrap();
        }
        assert_eq!(crate::db::MIGRATIONS[10].0, "0011_sync_conflicts.sql");
        c.execute_batch(
            "INSERT INTO workspaces (id, name) VALUES ('w', 'W');
             INSERT INTO projects (id, workspace_id, owner_id, name, created_by, updated_by, created_at, updated_at)
                  VALUES ('pa', 'w', 'A', 'A''s', 'A', 'A', 'now', 'now'),
                         ('pb', 'w', 'B', 'B''s', 'B', 'B', 'now', 'now');
             INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, version, status, priority,
                    author, data, created_by, updated_by, created_at, updated_at)
                  VALUES ('ca', 'w', 'pa', 'ATS_001', 'A case', '1.0', 'draft', 'medium', 'A', '{}', 'A', 'A', 'now', 'now');
             INSERT INTO requirements (id, workspace_id, project_id, requirement_key, title, created_by, updated_by,
                    created_at, updated_at) VALUES ('rb', 'w', 'pb', 'REQ-001', 'B req', 'B', 'B', 'now', 'now');
             INSERT INTO oplog (id, entity, entity_id, op, created_at, hlc) VALUES
                  ('o1', 'test_case', 'ca', 'upsert', 'now', ''),
                  ('o2', 'requirement', 'rb', 'upsert', 'now', ''),
                  ('o3', 'template', 't1', 'upsert', 'now', '');
             INSERT INTO sync_base (entity, entity_id, revision, hlc) VALUES ('project', 'pa', 1, 'h1'),
                  ('project', 'pb', 1, 'h2');
             INSERT INTO sync_state (key, value) VALUES ('cursor', '42'), ('device_id', 'dev');
             INSERT INTO sync_conflicts (id, entity, entity_id, detected_at) VALUES ('k1', 'project', 'pb', 'now');",
        )
        .unwrap();

        crate::db::run_migrations(&c).unwrap();

        let owner_of_row = |id: &str| -> String {
            c.query_row("SELECT user_id FROM oplog WHERE id = ?1", [id], |r| {
                r.get(0)
            })
            .unwrap()
        };
        assert_eq!(owner_of_row("o1"), "A");
        assert_eq!(owner_of_row("o2"), "B");
        assert_eq!(owner_of_row("o3"), "", "kept, but never pushed");
        assert_eq!(
            base_of(&c, "A", "project", "pa").unwrap(),
            Some((1, "h1".into()))
        );
        assert_eq!(
            base_of(&c, "B", "project", "pb").unwrap(),
            Some((1, "h2".into()))
        );
        assert_eq!(list_conflicts(&c, "B").unwrap().len(), 1);
        assert!(list_conflicts(&c, "A").unwrap().is_empty());
        assert_eq!(oplog::sync_state(&c, "A").unwrap().pending, 1);
        assert_eq!(oplog::sync_state(&c, "B").unwrap().pending, 1);
        let rows: i64 = c
            .query_row("SELECT count(*) FROM oplog", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 3);
        // Only the unattributable global cursor goes; the device id stays.
        let keys: Vec<String> = c
            .prepare("SELECT key FROM sync_state ORDER BY key")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(keys, ["device_id"]);
    }

    fn is_deleted(c: &Connection, table: &str, id: &str) -> bool {
        c.query_row(
            &format!("SELECT deleted_at IS NOT NULL FROM {table} WHERE id = ?1"),
            params![id],
            |r| r.get(0),
        )
        .unwrap()
    }

    // FIX-05 end to end on the deleting device: only the project tombstone is
    // pushed; the server's cascade comes back as child tombstones that apply
    // cleanly, with nothing left pending.
    #[test]
    fn deleting_a_project_pushes_its_tombstone_and_takes_the_cascade_back() {
        let c = conn();
        let ws = synced_case(&c, "c1", "Login");
        crate::project::delete_project(&c, "p1", U1).unwrap();
        assert!(is_deleted(&c, "test_cases", "c1"));

        let deltas = build_pending(&c, U1).unwrap().deltas;
        assert_eq!(deltas.len(), 1);
        assert_eq!(
            (deltas[0].entity.as_str(), deltas[0].op.as_str()),
            ("project", "delete")
        );
        mark_pushed(&c, U1, &[pushed(&deltas[0])]).unwrap();

        // The pull returns the project echo and the cascaded child tombstone.
        apply_doc(&c, &ws, U1, &as_remote(&deltas[0])).unwrap();
        let child = RemoteDoc {
            entity: "test_case".into(),
            entity_id: "c1".into(),
            payload: json!({ "id": "c1", "projectId": "p1" }),
            revision: 2,
            deleted: true,
            hlc: deltas[0].hlc.clone(),
        };
        apply_doc(&c, &ws, U1, &child).unwrap();
        assert!(is_deleted(&c, "test_cases", "c1"));
        assert_eq!(open_conflicts(&c), 0);
        assert_eq!(oplog::sync_state(&c, U1).unwrap().pending, 0);
    }

    /// A project deleted here while another device edited it: the delete is
    /// rejected and comes back as a conflict.
    fn rejected_project_delete(c: &Connection) -> String {
        let ws = synced_case(c, "c1", "Login");
        synced_case(c, "c2", "Logout");
        // c2 was deleted on its own before (its delete is in the oplog).
        c.execute(
            "UPDATE test_cases SET deleted_at = '2000-01-01 00:00:00' WHERE id = 'c2'",
            [],
        )
        .unwrap();
        oplog::record(c, "test_case", "c2", "delete", "{}", 2, U1).unwrap();
        crate::project::delete_project(c, "p1", U1).unwrap();
        let remote = RemoteDoc {
            entity: "project".into(),
            entity_id: "p1".into(),
            payload: json!({ "id": "p1", "ownerId": U1, "name": "Checkout (renamed elsewhere)" }),
            revision: 2,
            deleted: false,
            hlc: WEB_HLC.into(),
        };
        apply_doc(c, &ws, U1, &remote).unwrap();
        assert_eq!(open_conflicts(c), 1);
        ws
    }

    // Review fix: "use the server's" on a rejected project delete brings the
    // project back with the children that were deleted with it.
    #[test]
    fn taking_the_server_project_back_restores_its_children() {
        let c = conn();
        let ws = rejected_project_delete(&c);
        resolve_conflict(&c, &ws, U1, &sync_conflict_id(&c), "remote").unwrap();
        assert!(!is_deleted(&c, "projects", "p1"));
        assert!(
            !is_deleted(&c, "test_cases", "c1"),
            "deleted with the project: restored"
        );
        assert!(
            is_deleted(&c, "test_cases", "c2"),
            "deleted on its own: stays deleted"
        );
        let name: String = c
            .query_row("SELECT name FROM projects WHERE id = 'p1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(name, "Checkout (renamed elsewhere)");
        // Only c2's own delete is still waiting to be pushed.
        let pending = build_pending(&c, U1).unwrap().deltas;
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].entity_id, "c2");
    }

    #[test]
    fn keeping_the_local_project_delete_pushes_it_again_on_the_server_base() {
        let c = conn();
        let ws = rejected_project_delete(&c);
        resolve_conflict(&c, &ws, U1, &sync_conflict_id(&c), "local").unwrap();
        assert!(is_deleted(&c, "test_cases", "c1"));
        let pending = build_pending(&c, U1).unwrap().deltas;
        let project = pending.iter().find(|d| d.entity == "project").unwrap();
        assert_eq!(project.op, "delete");
        assert_eq!(project.base_revision, Some(2));
        assert_eq!(project.base_hlc.as_deref(), Some(WEB_HLC));
    }

    // Review fix: a change written before its project arrived gets an owner
    // once the project is here, instead of staying unsynced silently.
    #[test]
    fn a_change_without_owner_is_claimed_when_its_project_arrives() {
        let c = conn();
        let ws = ensure_workspace(&c).unwrap();
        c.execute(
            "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, version, status,
                    priority, author, data, created_by, updated_by, created_at, updated_at, revision)
             VALUES ('c9', ?1, 'p9', 'ATS_009', 'Early', '1.0', 'draft', 'medium', 'Ada', '{}', 'Ada', 'Ada',
                    datetime('now'), datetime('now'), 1)",
            params![ws],
        )
        .unwrap();
        oplog::record(&c, "test_case", "c9", "upsert", "{}", 1, "Ada").unwrap();
        let before = oplog::sync_state(&c, U1).unwrap();
        assert_eq!(
            (before.pending, before.orphans),
            (0, 1),
            "visible as an orphan"
        );

        project(&c, "p9", U1);
        let after = oplog::sync_state(&c, U1).unwrap();
        assert_eq!((after.pending, after.orphans), (1, 0));
        assert_eq!(build_pending(&c, U1).unwrap().deltas[0].entity_id, "c9");
    }

    // FIX-06 on pull (A2 review): pulled rows record the account as their
    // actor, never the free-text author of the payload.
    #[test]
    fn pulled_rows_record_the_account_as_created_and_updated_by() {
        let c = conn();
        let ws = ensure_workspace(&c).unwrap();
        let doc = |entity: &str, id: &str, payload: Value| RemoteDoc {
            entity: entity.into(),
            entity_id: id.into(),
            payload,
            revision: 1,
            deleted: false,
            hlc: WEB_HLC.into(),
        };
        let docs = [
            doc(
                "project",
                "p1",
                json!({ "id": "p1", "ownerId": U1, "name": "Checkout" }),
            ),
            doc(
                "test_plan",
                "tp1",
                json!({ "id": "tp1", "projectId": "p1", "title": "Plan", "author": "Ada Lovelace" }),
            ),
            doc(
                "test_case",
                "c1",
                json!({ "id": "c1", "projectId": "p1", "scenarioId": "ATS_001", "title": "Login", "author": "Ada Lovelace" }),
            ),
            doc(
                "requirement",
                "r1",
                json!({ "id": "r1", "projectId": "p1", "requirementKey": "REQ-001", "title": "R" }),
            ),
            doc(
                "planner_card",
                "d1",
                json!({ "id": "d1", "projectId": "p1", "ownerId": U1, "kind": "defect", "title": "Bug" }),
            ),
        ];
        for d in &docs {
            apply_doc(&c, &ws, U1, d).unwrap();
        }
        // An update pulled later keeps the account as the actor too.
        let mut edited = doc(
            "test_case",
            "c1",
            json!({ "id": "c1", "projectId": "p1", "scenarioId": "ATS_001", "title": "Login v2", "author": "Grace Hopper" }),
        );
        edited.revision = 2;
        edited.hlc = "001740000000000-00000-web-device".into();
        apply_doc(&c, &ws, U1, &edited).unwrap();

        for (table, id) in [
            ("projects", "p1"),
            ("test_plans", "tp1"),
            ("test_cases", "c1"),
            ("requirements", "r1"),
            ("planner_cards", "d1"),
        ] {
            let (created_by, updated_by): (String, String) = c
                .query_row(
                    &format!("SELECT created_by, updated_by FROM {table} WHERE id = ?1"),
                    params![id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .unwrap();
            assert_eq!(
                (created_by.as_str(), updated_by.as_str()),
                (U1, U1),
                "{table}"
            );
        }
        // The author stays as the visible field it is.
        assert_eq!(title(&c, "c1"), "Login v2");
        let author: String = c
            .query_row("SELECT author FROM test_cases WHERE id = 'c1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(author, "Grace Hopper");
    }

    // Review fix: conflicts are looked up per account too.
    #[test]
    fn another_accounts_open_conflict_does_not_hold_back_my_push() {
        let c = conn();
        let ws = synced_case(&c, "c1", "Login");
        edit_locally(&c, "c1", "Mine");
        // A conflict row of another account on the same entity id (legacy data).
        c.execute(
            "INSERT INTO sync_conflicts (id, entity, entity_id, detected_at, user_id)
             VALUES ('k', 'test_case', 'c1', 'now', ?1)",
            params![U2],
        )
        .unwrap();
        assert_eq!(build_pending(&c, U1).unwrap().deltas.len(), 1);
        assert!(list_conflicts(&c, U1).unwrap().is_empty());
        let _ = ws;
    }

    #[test]
    fn a_purged_record_does_not_come_back_on_a_pull() {
        // SYNC-06: a case deleted, pushed and purged after the retention.
        let c = conn();
        let ws = synced_case(&c, "c1", "Login");
        c.execute(
            "UPDATE test_cases SET deleted_at = datetime('now', '-40 days'), revision = 2 WHERE id = 'c1'",
            [],
        )
        .unwrap();
        oplog::record(&c, "test_case", "c1", "delete", "{}", 2, "Ada").unwrap();
        let push = build_pending(&c, U1).unwrap();
        let tombstone = as_remote(&push.deltas[0]);
        assert!(tombstone.deleted);
        mark_pushed(&c, U1, &[pushed(&push.deltas[0])]).unwrap();
        assert_eq!(crate::purge::purge(&c, U1, 30).unwrap().test_cases, 1);

        // The next pull (or a full re-pull from cursor 0) brings the tombstone
        // the server keeps: nothing is written, nothing comes back.
        for _ in 0..2 {
            apply_doc(&c, &ws, U1, &tombstone).unwrap();
            c.execute("DELETE FROM sync_base", []).unwrap();
        }
        let rows: i64 = c
            .query_row("SELECT count(*) FROM test_cases WHERE id = 'c1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(rows, 0);
        assert_eq!(open_conflicts(&c), 0);
        assert!(build_pending(&c, U1).unwrap().deltas.is_empty());
    }

    /// The server side of DAT-01 as `server/src/modules/sync` does it: one
    /// document per entity, blocks of 50 that never overlap, and a push whose
    /// key another live document of the project has is refused.
    #[derive(Default)]
    struct FakeServer {
        docs: Vec<RemoteDoc>,
        next: HashMap<(String, String), u64>,
    }

    impl FakeServer {
        fn lease(
            &mut self,
            reqs: Vec<crate::key_sync::LeaseRequest>,
        ) -> Vec<crate::key_sync::KeyBlock> {
            reqs.into_iter()
                .map(|r| {
                    let next = self
                        .next
                        .entry((r.project_id.clone(), r.kind.to_string()))
                        .or_insert(1);
                    let start = (*next).max(r.floor);
                    *next = start + 50;
                    crate::key_sync::KeyBlock {
                        project_id: r.project_id,
                        kind: r.kind.to_string(),
                        start,
                        end: start + 49,
                    }
                })
                .collect()
        }

        fn key_of(doc: &RemoteDoc) -> &str {
            doc.payload
                .get("scenarioId")
                .and_then(Value::as_str)
                .unwrap_or("")
        }

        /// None when accepted; the holder's id when the key is taken.
        fn push(&mut self, doc: RemoteDoc) -> Option<String> {
            let key = Self::key_of(&doc).to_string();
            if doc.entity == "test_case" && !doc.deleted && !keys::is_provisional(&key) {
                if let Some(holder) = self.docs.iter().find(|d| {
                    d.entity == "test_case"
                        && !d.deleted
                        && d.entity_id != doc.entity_id
                        && Self::key_of(d) == key
                }) {
                    return Some(holder.entity_id.clone());
                }
            }
            self.docs
                .retain(|d| !(d.entity == doc.entity && d.entity_id == doc.entity_id));
            self.docs.push(doc);
            None
        }
    }

    /// One desktop sync cycle (`syncApi.ts::syncNow`): lease blocks and finalize
    /// provisional keys, push (refused keys become key conflicts), pull all.
    fn sync_device(dev: &Connection, server: &mut FakeServer, lease: bool) {
        let ws = ensure_workspace(dev).unwrap();
        if lease {
            let blocks = server.lease(crate::key_sync::lease_requests(dev, U1).unwrap());
            crate::key_sync::apply_blocks(dev, U1, &blocks).unwrap();
            crate::key_sync::finalize(dev, U1).unwrap();
        }
        for d in build_pending(dev, U1).unwrap().deltas {
            match server.push(as_remote(&d)) {
                None => mark_pushed(dev, U1, &[pushed(&d)]).unwrap(),
                Some(holder) => crate::key_sync::record_rejected(
                    dev,
                    U1,
                    &[crate::key_sync::RejectedKey {
                        entity: d.entity.clone(),
                        entity_id: d.entity_id.clone(),
                        taken_by: holder,
                    }],
                )
                .unwrap(),
            }
        }
        for doc in server.docs.clone() {
            apply_doc(dev, &ws, U1, &doc).unwrap();
        }
    }

    /// A case created as the repository does it, numbered by `keys::allocate`
    /// or with a hand-typed key.
    fn create_case(dev: &Connection, id: &str, manual: Option<&str>) {
        let ws = ensure_workspace(dev).unwrap();
        let key = match manual {
            Some(k) => k.to_string(),
            None => keys::allocate(dev, keys::KeyKind::Case, "p1", "ATS_", 3).unwrap(),
        };
        dev.execute(
            "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, author, \
             created_by, updated_by, created_at, updated_at) \
             VALUES (?1, ?2, 'p1', ?3, ?1, 'Ada', ?4, ?4, datetime('now'), datetime('now'))",
            params![id, ws, key, U1],
        )
        .unwrap();
        oplog::record(dev, "test_case", id, "upsert", "{}", 1, U1).unwrap();
    }

    fn live_keys(dev: &Connection) -> Vec<String> {
        let mut stmt = dev
            .prepare(
                "SELECT scenario_id FROM test_cases WHERE deleted_at IS NULL ORDER BY scenario_id",
            )
            .unwrap();
        stmt.query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    // DAT-01 acceptance: two devices create cases offline and, after syncing,
    // there are no duplicate keys.
    #[test]
    fn two_offline_devices_never_end_with_duplicate_keys() {
        let mut server = FakeServer::default();
        let a = conn();
        let b = conn();

        // A creates the project and numbers it freely before its first push.
        let ws = ensure_workspace(&a).unwrap();
        a.execute(
            "INSERT INTO projects (id, workspace_id, owner_id, name, created_by, updated_by, \
             created_at, updated_at) VALUES ('p1', ?1, ?2, 'Checkout', ?2, ?2, 'now', 'now')",
            params![ws, U1],
        )
        .unwrap();
        oplog::record(&a, "project", "p1", "upsert", "{}", 1, U1).unwrap();
        create_case(&a, "a1", None);
        create_case(&a, "a2", None);
        assert_eq!(live_keys(&a), ["ATS_001", "ATS_002"]);
        sync_device(&a, &mut server, true);

        // B gets the project but no block (say its lease failed), then both
        // work offline. B also types the same manual key as A.
        sync_device(&b, &mut server, false);
        for id in ["a3", "a4", "a5"] {
            create_case(&a, id, None);
        }
        create_case(&a, "a-manual", Some("LOGIN-1"));
        for id in ["b1", "b2"] {
            create_case(&b, id, None);
        }
        create_case(&b, "b-manual", Some("LOGIN-1"));
        assert!(
            live_keys(&b)
                .iter()
                .filter(|k| keys::is_provisional(k))
                .count()
                == 2
        );

        // Both sync, in any order, until nothing changes.
        sync_device(&a, &mut server, true);
        sync_device(&b, &mut server, true);
        sync_device(&a, &mut server, true);

        // B's hand-typed key lost to A's: a key conflict the user resolves.
        let open = crate::key_sync::list(&b, U1).unwrap();
        assert_eq!(open.len(), 1);
        assert_eq!(
            (open[0].entity_id.as_str(), open[0].lost_key.as_str()),
            ("b-manual", "LOGIN-1")
        );
        crate::key_sync::resolve(&b, U1, &open[0].id, Some("LOGIN-2")).unwrap();
        sync_device(&b, &mut server, true);
        sync_device(&a, &mut server, true);

        for dev in [&a, &b] {
            let keys = live_keys(dev);
            assert_eq!(keys.len(), 9, "{keys:?}");
            let mut unique = keys.clone();
            unique.dedup();
            assert_eq!(unique, keys, "no duplicate keys");
            assert!(keys.iter().all(|k| !keys::is_provisional(k)), "{keys:?}");
            assert!(keys.contains(&"LOGIN-1".to_string()) && keys.contains(&"LOGIN-2".to_string()));
        }
        assert_eq!(live_keys(&a), live_keys(&b), "both devices agree");
        // A kept its first keys; nothing was renamed on its own.
        let a_key: String = a
            .query_row(
                "SELECT scenario_id FROM test_cases WHERE id = 'a1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(a_key, "ATS_001");
    }
}
