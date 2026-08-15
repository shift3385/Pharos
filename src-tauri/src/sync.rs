//! Delta sync client side (Phase 8B, spec §9). Builds the pending deltas (full
//! entity state, read live from the local DB) for the TS layer to POST to the
//! backend, marks them synced, and applies remote documents back with per-entity
//! last-write-wins by revision. The HTTP call itself lives in the TS layer (it
//! holds the auth token); this module only touches the local database.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

use crate::db::{ensure_workspace, Db};

const CORE: [&str; 3] = ["project", "test_plan", "test_case"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Delta {
    entity: String,
    entity_id: String,
    op: String,
    payload: Value,
    revision: i64,
    author: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pending {
    deltas: Vec<Delta>,
    /// Oplog row ids included here, to mark synced after a successful push.
    ids: Vec<String>,
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

/// Builds the pending deltas: one per distinct core entity changed since the last
/// sync, carrying its live state (or a tombstone), plus the oplog ids covered.
#[tauri::command]
pub fn oplog_pending(db: State<Db>) -> Result<Pending, String> {
    db.with_conn(|conn| {
        let mut ids: Vec<String> = Vec::new();
        {
            let mut stmt = conn
                .prepare("SELECT id FROM oplog WHERE synced_at IS NULL AND entity IN ('project','test_plan','test_case')")
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
            for r in rows {
                ids.push(r.map_err(|e| e.to_string())?);
            }
        }

        // Distinct entities with pending changes.
        let mut targets: Vec<(String, String, String)> = Vec::new();
        {
            let mut stmt = conn
                .prepare(
                    "SELECT DISTINCT entity, entity_id, author FROM oplog
                     WHERE synced_at IS NULL AND entity IN ('project','test_plan','test_case')",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))
                .map_err(|e| e.to_string())?;
            for r in rows {
                targets.push(r.map_err(|e| e.to_string())?);
            }
        }

        let mut deltas = Vec::new();
        for (entity, entity_id, author) in targets {
            match read_payload(conn, &entity, &entity_id)? {
                Some((payload, revision, deleted)) => deltas.push(Delta {
                    op: if deleted { "delete".into() } else { "upsert".into() },
                    entity,
                    entity_id,
                    payload,
                    revision,
                    author,
                }),
                None => deltas.push(Delta {
                    op: "delete".into(),
                    entity,
                    entity_id,
                    payload: Value::Null,
                    revision: 0,
                    author,
                }),
            }
        }
        Ok(Pending { deltas, ids })
    })
}

/// Marks the given oplog rows as synced (called after a successful push).
#[tauri::command]
pub fn oplog_mark_synced(db: State<Db>, ids: Vec<String>) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    db.with_conn(|conn| {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        for id in &ids {
            tx.execute("UPDATE oplog SET synced_at = datetime('now') WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    })?;
    db.persist()
}

fn field<'a>(p: &'a Value, key: &str) -> &'a str {
    p.get(key).and_then(Value::as_str).unwrap_or("")
}

/// Applies one remote document to the local tables with last-write-wins by
/// revision. Does NOT append to the oplog (remote changes must not echo back).
fn apply_doc(conn: &Connection, workspace_id: &str, doc: &RemoteDoc) -> Result<(), String> {
    if !CORE.contains(&doc.entity.as_str()) {
        return Ok(());
    }
    let table = match doc.entity.as_str() {
        "project" => "projects",
        "test_plan" => "test_plans",
        "test_case" => "test_cases",
        _ => return Ok(()),
    };
    let local_rev: Option<i64> = conn
        .query_row(&format!("SELECT revision FROM {table} WHERE id = ?1"), params![doc.entity_id], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(lr) = local_rev {
        if doc.revision < lr {
            return Ok(()); // ours is newer — keep it
        }
    }

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
