//! Keys across devices, sync side (DAT-01, ADR-0010). `keys.rs` hands out the
//! numbers; this module keeps them unique between devices:
//! - before each push the TS layer asks for the blocks this device needs
//!   (`key_lease_requests`), leases them from the server (`POST
//!   /sync/key-blocks`) and stores them (`key_blocks_apply`);
//! - provisional keys (`ATS_?KQZD`, created offline without a block) then get
//!   their definitive key (`key_finalize`), in one transaction that also
//!   rewrites the cases that link a renamed requirement (`data.requirementKeys`);
//! - a row whose key another live document of the project already has (the
//!   server refused its push, or a pulled document brought that key) gets a
//!   provisional key and a key conflict. It is not pushed until the user picks
//!   a new key in the conflict panel (`key_conflict_resolve`). A definitive key
//!   is never renamed on its own.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
#[cfg(test)]
use ts_rs::TS;
use uuid::Uuid;

use crate::db::Db;
use crate::journal::{self, Action, Actor, Change};
use crate::keys::{self, KeyKind};
use crate::oplog;

/// Numbers a device keeps in reserve, per project and kind it numbers, to
/// create without a connection (DAT-04). Small, because what another device
/// creates meanwhile goes after it: the reserve is the gap it can leave.
const RESERVE: u64 = 10;

/// The most numbers one request may take (the server's limit).
const MAX_BLOCK: u64 = 50;

/// One block this device needs: `floor` is its next number, so a project
/// numbered before its first push keeps the keys it already has. `prefix` lets
/// the server count only the keys of this series (`JIRA-48213` is not one).
/// `size`: how many numbers (a server before DAT-04 ignores it and gives 50).
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LeaseRequest {
    pub(crate) project_id: String,
    pub(crate) kind: &'static str,
    pub(crate) prefix: String,
    pub(crate) floor: u64,
    pub(crate) size: u64,
}

/// A block leased from the server, both ends included.
#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyBlock {
    pub(crate) project_id: String,
    pub(crate) kind: String,
    pub(crate) start: u64,
    pub(crate) end: u64,
}

/// A key the server refused because another live document has it.
#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RejectedKey {
    pub(crate) entity: String,
    pub(crate) entity_id: String,
    #[serde(default)]
    pub(crate) taken_by: String,
}

/// An open key conflict, for the conflict panel.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KeyConflict {
    pub(crate) id: String,
    pub(crate) entity: String,
    pub(crate) entity_id: String,
    pub(crate) project_id: String,
    pub(crate) title: String,
    /// The key the row wanted and another document holds.
    pub(crate) lost_key: String,
    /// The provisional key it has meanwhile.
    pub(crate) current_key: String,
}

fn require_user(user_id: &str) -> Result<(), String> {
    if user_id.is_empty() {
        return Err("not-authenticated".into());
    }
    Ok(())
}

fn kind_of(entity: &str) -> Option<KeyKind> {
    KeyKind::ALL.into_iter().find(|k| k.entity().0 == entity)
}

/// Live projects of the account.
fn projects_of(conn: &Connection, user: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM projects WHERE owner_id = ?1 AND deleted_at IS NULL ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![user], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())
}

/// The offline reserves the account's projects need at a sync (DAT-04): only
/// the kinds this device numbers in each project (a counter, or keys still
/// provisional), and only once the reserve is used up, so no number is left
/// behind. Enough for the provisional keys waiting plus a reserve of `RESERVE`.
/// `run` blocks only from a server that lists `runs`, and `cycle` blocks only
/// from one that lists `cycles`: an older one refuses the whole request for a
/// kind it does not know.
pub(crate) fn lease_requests(conn: &Connection, user: &str) -> Result<Vec<LeaseRequest>, String> {
    let runs_too = crate::sync::server_takes_runs(conn, user)?;
    let cycles_too = crate::sync::server_takes_cycles(conn, user)?;
    let mut out = Vec::new();
    for project_id in projects_of(conn, user)? {
        for kind in KeyKind::ALL {
            if matches!(kind, KeyKind::Run) && !runs_too {
                continue;
            }
            if matches!(kind, KeyKind::Cycle) && !cycles_too {
                continue;
            }
            let waiting = keys::provisional_count(conn, kind, &project_id)?;
            if waiting == 0 && !keys::has_counter(conn, kind, &project_id)? {
                continue;
            }
            let (left, next) = keys::remaining(conn, kind, &project_id)?;
            if left == 0 {
                let (prefix, _) = keys::numbering(conn, kind, &project_id)?;
                out.push(LeaseRequest {
                    project_id: project_id.clone(),
                    kind: kind.as_str(),
                    prefix,
                    floor: next,
                    size: (waiting + RESERVE).min(MAX_BLOCK),
                });
            }
        }
    }
    Ok(out)
}

/// The numbers to ask the server for right before creating `count` keys of a
/// project with a connection (DAT-04): None when the project is not the
/// account's, when the server never saw it (this device numbers it freely,
/// ADR-0010 rule 3) or while its reserve has numbers left (those are already
/// this device's; any key beyond them is provisional until the next sync).
pub(crate) fn lease_for(
    conn: &Connection,
    user: &str,
    project_id: &str,
    kind: KeyKind,
    count: u64,
) -> Result<Option<LeaseRequest>, String> {
    if !projects_of(conn, user)?.iter().any(|p| p == project_id)
        || !crate::oplog::known_to_server(conn, "project", project_id)?
    {
        return Ok(None);
    }
    let (left, next) = keys::remaining(conn, kind, project_id)?;
    if left > 0 {
        return Ok(None);
    }
    let (prefix, _) = keys::numbering(conn, kind, project_id)?;
    Ok(Some(LeaseRequest {
        project_id: project_id.to_string(),
        kind: kind.as_str(),
        prefix,
        floor: next,
        size: count.clamp(1, MAX_BLOCK),
    }))
}

/// Stores the leased blocks of the account's projects (others are ignored).
pub(crate) fn apply_blocks(
    conn: &Connection,
    user: &str,
    blocks: &[KeyBlock],
) -> Result<(), String> {
    let owned = projects_of(conn, user)?;
    for b in blocks {
        let Some(kind) = KeyKind::parse(&b.kind) else {
            continue;
        };
        if owned.contains(&b.project_id) && b.start >= 1 && b.end >= b.start {
            keys::store_block(conn, kind, &b.project_id, b.start, b.end)?;
        }
    }
    Ok(())
}

/// Gives a row a new key: bumps its revision and journals it, so the next push
/// carries it. A renamed requirement takes its links along.
#[allow(clippy::too_many_arguments)]
fn set_key(
    conn: &Connection,
    actor: &Actor,
    user: &str,
    kind: KeyKind,
    id: &str,
    project_id: &str,
    old: &str,
    new: &str,
) -> Result<(), String> {
    let (entity, table, column) = kind.entity();
    let revision: i64 = conn
        .query_row(
            &format!("SELECT revision FROM {table} WHERE id = ?1"),
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let before = journal::snapshot(conn, entity, id)?;
    conn.execute(
        &format!(
            "UPDATE {table} SET {column} = ?2, revision = ?3, updated_by = ?4, \
             updated_at = datetime('now') WHERE id = ?1"
        ),
        params![id, new, revision + 1, user],
    )
    .map_err(|e| e.to_string())?;
    journal::record(
        conn,
        Change::new(
            entity,
            id,
            Action::Update,
            actor.clone(),
            "upsert",
            revision + 1,
            user,
        )
        .before(before),
    )?;
    if entity == "test_case" {
        crate::revisions::ensure_current(conn, id, user, true)?;
    }
    if let KeyKind::Requirement = kind {
        relink_requirement(conn, actor, user, project_id, old, new)?;
    }
    Ok(())
}

/// Rewrites `data.requirementKeys` of the project's cases from `old` to `new`
/// (ADR-0010 precisions: a provisional key is replaced in the same transaction).
fn relink_requirement(
    conn: &Connection,
    actor: &Actor,
    user: &str,
    project_id: &str,
    old: &str,
    new: &str,
) -> Result<(), String> {
    let cases: Vec<(String, String, i64)> = {
        let mut stmt = conn
            .prepare(
                "SELECT c.id, c.data, c.revision FROM test_cases c
                  WHERE c.project_id = ?1 AND c.deleted_at IS NULL
                    AND EXISTS (SELECT 1 FROM json_each(c.data, '$.requirementKeys') k WHERE k.value = ?2)",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![project_id, old], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?
    };
    for (id, data, revision) in cases {
        let before = journal::snapshot(conn, "test_case", &id)?;
        let mut data: Value = serde_json::from_str(&data).unwrap_or(Value::Null);
        if let Some(keys) = data
            .get_mut("requirementKeys")
            .and_then(Value::as_array_mut)
        {
            for k in keys.iter_mut() {
                if k.as_str() == Some(old) {
                    *k = Value::String(new.to_string());
                }
            }
        }
        conn.execute(
            "UPDATE test_cases SET data = ?2, revision = ?3, updated_by = ?4, \
             updated_at = datetime('now') WHERE id = ?1",
            params![id, data.to_string(), revision + 1, user],
        )
        .map_err(|e| e.to_string())?;
        journal::record(
            conn,
            Change::new(
                "test_case",
                &id,
                Action::Update,
                actor.clone(),
                "upsert",
                revision + 1,
                user,
            )
            .before(before),
        )?;
        crate::revisions::ensure_current(conn, &id, user, true)?;
    }
    Ok(())
}

/// Replaces the account's provisional keys with definitive ones from the
/// leased blocks; rows with an open key conflict wait for the user. Returns how
/// many keys it assigned.
pub(crate) fn finalize(conn: &Connection, user: &str) -> Result<usize, String> {
    let mut assigned = 0;
    for kind in KeyKind::ALL {
        let (entity, table, column) = kind.entity();
        let rows: Vec<(String, String, String)> = {
            let mut stmt = conn
                .prepare(&format!(
                    "SELECT x.id, x.project_id, x.{column} FROM {table} x
                      JOIN projects p ON p.id = x.project_id
                     WHERE p.owner_id = ?1 AND x.deleted_at IS NULL AND instr(x.{column}, '?') > 0
                       AND NOT EXISTS (SELECT 1 FROM key_conflicts k WHERE k.entity = ?2
                                       AND k.entity_id = x.id AND k.resolved_at IS NULL)
                     ORDER BY x.created_at, x.rowid"
                ))
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![user, entity], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?))
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<rusqlite::Result<_>>()
                .map_err(|e| e.to_string())?
        };
        for (id, project_id, old) in rows {
            // No block left for this project: the rest wait for the next sync.
            let Some(new) = keys::allocate_definitive(conn, kind, &project_id)? else {
                continue;
            };
            let actor = Actor::System {
                component: "keys",
                on_behalf_of: Some(user.to_string()),
            };
            set_key(conn, &actor, user, kind, &id, &project_id, &old, &new)?;
            assigned += 1;
        }
    }
    Ok(assigned)
}

/// The live row of the project, other than `except_id`, that uses `key`.
pub(crate) fn holder(
    conn: &Connection,
    entity: &str,
    project_id: &str,
    key: &str,
    except_id: &str,
) -> Result<Option<String>, String> {
    let Some(kind) = kind_of(entity) else {
        return Ok(None);
    };
    if key.is_empty() || keys::is_provisional(key) {
        return Ok(None);
    }
    let (_, table, column) = kind.entity();
    conn.query_row(
        &format!(
            "SELECT id FROM {table} WHERE project_id = ?1 AND {column} = ?2 \
             AND deleted_at IS NULL AND id <> ?3 LIMIT 1"
        ),
        params![project_id, key, except_id],
        |r| r.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// The row loses its key: it gets a provisional one (not journaled: it is
/// held back from the push until resolved) and a key conflict for the user.
pub(crate) fn vacate(
    conn: &Connection,
    user: &str,
    entity: &str,
    id: &str,
    taken_by: &str,
) -> Result<(), String> {
    let Some(kind) = kind_of(entity) else {
        return Ok(());
    };
    let (_, table, column) = kind.entity();
    let row: Option<(String, Option<String>)> = conn
        .query_row(
            &format!("SELECT project_id, {column} FROM {table} WHERE id = ?1"),
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((project_id, Some(key))) = row else {
        return Ok(());
    };
    if key.is_empty() || keys::is_provisional(&key) {
        return Ok(());
    }
    let provisional = keys::provisional_key(conn, kind, &project_id)?;
    conn.execute(
        &format!("UPDATE {table} SET {column} = ?2 WHERE id = ?1"),
        params![id, provisional],
    )
    .map_err(|e| e.to_string())?;
    if entity == "test_case" {
        crate::revisions::ensure_current_local(conn, id)?;
    }
    conn.execute(
        "INSERT OR IGNORE INTO key_conflicts (id, user_id, entity, entity_id, project_id, lost_key, \
         taken_by, detected_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))",
        params![Uuid::new_v4().to_string(), user, entity, id, project_id, key, taken_by],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// The server deleted `holder_id`, which held the key a synced row of this
/// device lost in the local repair (migration 0017). The server kept that
/// key for the row all along, so it gets it back (not journaled: it matches
/// the server) and its conflict closes. A row the server never had keeps its
/// conflict: a deleted key is never handed to another entity (ADR-0010).
pub(crate) fn holder_deleted(
    conn: &Connection,
    entity: &str,
    holder_id: &str,
) -> Result<(), String> {
    let Some(kind) = kind_of(entity) else {
        return Ok(());
    };
    let (_, table, column) = kind.entity();
    let open: Vec<(String, String, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, entity_id, lost_key FROM key_conflicts
                  WHERE entity = ?1 AND taken_by = ?2 AND resolved_at IS NULL",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![entity, holder_id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?
    };
    for (id, entity_id, lost_key) in open {
        if !oplog::known_to_server(conn, entity, &entity_id)? {
            continue;
        }
        conn.execute(
            &format!("UPDATE {table} SET {column} = ?2 WHERE id = ?1"),
            params![entity_id, lost_key],
        )
        .map_err(|e| e.to_string())?;
        if entity == "test_case" {
            crate::revisions::ensure_current_local(conn, &entity_id)?;
        }
        conn.execute(
            "UPDATE key_conflicts SET resolved_at = datetime('now'), resolution = 'remote' WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Closes the open key conflicts of rows that were deleted or are gone: a
/// deleted row needs no key, and its delete must still reach the server.
pub(crate) fn close_stale(conn: &Connection) -> Result<(), String> {
    for kind in KeyKind::ALL {
        let (entity, table, _) = kind.entity();
        // A kind whose table an older image does not have yet (the upgrade
        // tests read pending changes before migrating) has no conflicts.
        let exists = conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
                params![table],
                |_| Ok(()),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .is_some();
        if !exists {
            continue;
        }
        conn.execute(
            &format!(
                "UPDATE key_conflicts SET resolved_at = datetime('now'), resolution = 'deleted'
                  WHERE resolved_at IS NULL AND entity = ?1
                    AND NOT EXISTS (SELECT 1 FROM {table} x WHERE x.id = key_conflicts.entity_id
                                    AND x.deleted_at IS NULL)"
            ),
            params![entity],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// A pulled document gave this entity a definitive key: its key conflict, if
/// any, is settled by the server.
pub(crate) fn settled_by_server(conn: &Connection, entity: &str, id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE key_conflicts SET resolved_at = datetime('now'), resolution = 'remote'
          WHERE entity = ?1 AND entity_id = ?2 AND resolved_at IS NULL",
        params![entity, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Keys the server refused on push: each of the account's rows becomes a key
/// conflict.
pub(crate) fn record_rejected(
    conn: &Connection,
    user: &str,
    items: &[RejectedKey],
) -> Result<(), String> {
    for item in items {
        if oplog::owner_of(conn, &item.entity, &item.entity_id)?.as_deref() == Some(user) {
            vacate(conn, user, &item.entity, &item.entity_id, &item.taken_by)?;
        }
    }
    Ok(())
}

pub(crate) fn list(conn: &Connection, user: &str) -> Result<Vec<KeyConflict>, String> {
    close_stale(conn)?;
    let open: Vec<(String, String, String, String, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, entity, entity_id, project_id, lost_key FROM key_conflicts
                  WHERE user_id = ?1 AND resolved_at IS NULL ORDER BY detected_at, rowid",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![user], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?
    };
    let mut out = Vec::new();
    for (id, entity, entity_id, project_id, lost_key) in open {
        let Some(kind) = kind_of(&entity) else {
            continue;
        };
        let (_, table, column) = kind.entity();
        let row: Option<(String, Option<String>)> = conn
            .query_row(
                &format!("SELECT title, {column} FROM {table} WHERE id = ?1"),
                params![entity_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let (title, current_key) = row.unwrap_or_default();
        out.push(KeyConflict {
            id,
            entity,
            entity_id,
            project_id,
            title,
            lost_key,
            current_key: current_key.unwrap_or_default(),
        });
    }
    Ok(out)
}

/// Resolves a key conflict: `key` given by the user (never used in the project,
/// not provisional), or else the next number of the leased block.
pub(crate) fn resolve(
    conn: &Connection,
    user: &str,
    id: &str,
    key: Option<&str>,
) -> Result<String, String> {
    let (entity, entity_id, project_id, lost_key): (String, String, String, String) = conn
        .query_row(
            "SELECT entity, entity_id, project_id, lost_key FROM key_conflicts
              WHERE id = ?1 AND user_id = ?2 AND resolved_at IS NULL",
            params![id, user],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("key conflict not found")?;
    let kind = kind_of(&entity).ok_or("key conflict not found")?;
    let (_, table, column) = kind.entity();
    let current: String = conn
        .query_row(
            &format!("SELECT {column} FROM {table} WHERE id = ?1"),
            params![entity_id],
            |r| r.get::<_, Option<String>>(0),
        )
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    let new = match key.map(str::trim).filter(|k| !k.is_empty()) {
        Some(k) => {
            let valid = match kind {
                KeyKind::Requirement => crate::requirement::valid_key(k),
                _ => !k.chars().any(char::is_whitespace),
            };
            if keys::is_provisional(k) || !valid {
                return Err(format!("invalid key: {k}"));
            }
            // The lost key belongs to another document on the server.
            if k == lost_key || keys::taken(conn, kind, &project_id, k)? {
                return Err(format!("key {k} is already used in this project"));
            }
            let (prefix, _) = keys::numbering(conn, kind, &project_id)?;
            keys::note_manual(conn, kind, &project_id, &prefix, k)?;
            k.to_string()
        }
        None => keys::allocate_definitive(conn, kind, &project_id)?.ok_or("no-key-block")?,
    };
    set_key(
        conn,
        &Actor::user(user),
        user,
        kind,
        &entity_id,
        &project_id,
        &current,
        &new,
    )?;
    conn.execute(
        "UPDATE key_conflicts SET resolved_at = datetime('now'), resolution = 'renamed' WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(new)
}

#[tauri::command]
pub fn key_lease_requests(db: State<Db>, user_id: String) -> Result<Vec<LeaseRequest>, String> {
    require_user(&user_id)?;
    db.with_conn(|conn| lease_requests(conn, &user_id))
}

/// What to lease before creating `count` keys of `kind` in a project with a
/// connection (`lease_for`); None when nothing is needed.
#[tauri::command]
pub fn key_lease_for(
    db: State<Db>,
    user_id: String,
    project_id: String,
    kind: String,
    count: u64,
) -> Result<Option<LeaseRequest>, String> {
    require_user(&user_id)?;
    let kind = KeyKind::parse(&kind).ok_or_else(|| format!("unknown key kind: {kind}"))?;
    db.with_conn(|conn| lease_for(conn, &user_id, &project_id, kind, count))
}

/// Stores the leased blocks and gives the provisional keys their definitive
/// one, in one transaction. Returns how many keys it assigned.
#[tauri::command]
pub fn key_blocks_apply(
    db: State<Db>,
    user_id: String,
    blocks: Vec<KeyBlock>,
) -> Result<usize, String> {
    require_user(&user_id)?;
    let assigned = db.with_conn(|conn| {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        apply_blocks(&tx, &user_id, &blocks)?;
        let assigned = finalize(&tx, &user_id)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(assigned)
    })?;
    db.persist()?;
    Ok(assigned)
}

#[tauri::command]
pub fn key_conflicts_record(
    db: State<Db>,
    user_id: String,
    items: Vec<RejectedKey>,
) -> Result<(), String> {
    require_user(&user_id)?;
    if items.is_empty() {
        return Ok(());
    }
    db.with_conn(|conn| {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        record_rejected(&tx, &user_id, &items)?;
        tx.commit().map_err(|e| e.to_string())
    })?;
    db.persist()
}

#[tauri::command]
pub fn key_conflicts_list(db: State<Db>, user_id: String) -> Result<Vec<KeyConflict>, String> {
    require_user(&user_id)?;
    db.with_conn(|conn| list(conn, &user_id))
}

#[tauri::command]
pub fn key_conflict_resolve(
    db: State<Db>,
    user_id: String,
    id: String,
    key: Option<String>,
) -> Result<String, String> {
    require_user(&user_id)?;
    let new = db.with_conn(|conn| {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        let new = resolve(&tx, &user_id, &id, key.as_deref())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(new)
    })?;
    db.persist()?;
    Ok(new)
}

#[cfg(test)]
mod tests {
    use super::*;

    const U: &str = "user-a";

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        crate::sync::assume_stable_steps_server(&c);
        c
    }

    fn project(c: &Connection, id: &str, owner: &str, known_to_server: bool) {
        let ws = crate::db::ensure_workspace(c).unwrap();
        c.execute(
            "INSERT INTO projects (id, workspace_id, owner_id, name, created_by, updated_by, \
             created_at, updated_at) VALUES (?1, ?2, ?3, 'P', ?3, ?3, 'now', 'now')",
            params![id, ws, owner],
        )
        .unwrap();
        if known_to_server {
            c.execute(
                "INSERT INTO sync_base (user_id, entity, entity_id, revision, hlc) \
                 VALUES (?1, 'project', ?2, 1, '')",
                params![owner, id],
            )
            .unwrap();
        }
    }

    fn case(c: &Connection, id: &str, key: &str, data: &str) {
        let ws = crate::db::ensure_workspace(c).unwrap();
        c.execute(
            "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, author, data, \
             created_by, updated_by, created_at, updated_at) \
             VALUES (?1, ?2, 'p1', ?3, ?1, 'a', ?4, 'a', 'a', 'now', 'now')",
            params![id, ws, key, data],
        )
        .unwrap();
    }

    fn requirement(c: &Connection, id: &str, key: &str) {
        let ws = crate::db::ensure_workspace(c).unwrap();
        c.execute(
            "INSERT INTO requirements (id, workspace_id, project_id, requirement_key, title, \
             created_by, updated_by, created_at, updated_at) \
             VALUES (?1, ?2, 'p1', ?3, ?1, 'a', 'a', 'now', 'now')",
            params![id, ws, key],
        )
        .unwrap();
    }

    fn next_case(c: &Connection) -> String {
        keys::allocate(c, KeyKind::Case, "p1", "ATS_", 3).unwrap()
    }

    fn block(kind: &str, start: u64, end: u64) -> KeyBlock {
        KeyBlock {
            project_id: "p1".into(),
            kind: kind.into(),
            start,
            end,
        }
    }

    #[test]
    fn a_project_the_server_never_saw_numbers_freely() {
        let c = conn();
        project(&c, "p1", U, false);
        assert_eq!(next_case(&c), "ATS_001");
        assert_eq!(next_case(&c), "ATS_002");
    }

    #[test]
    fn a_synced_project_numbers_from_its_block_or_provisionally() {
        let c = conn();
        project(&c, "p1", U, true);
        // No block yet (offline): a provisional key, unique and never numeric.
        let p1 = next_case(&c);
        let p2 = next_case(&c);
        assert!(keys::is_provisional(&p1) && p1.starts_with("ATS_?"), "{p1}");
        assert_ne!(p1, p2);
        assert!(!p1.ends_with(|ch: char| ch.is_ascii_digit()));

        apply_blocks(&c, U, &[block("case", 51, 52)]).unwrap();
        assert_eq!(next_case(&c), "ATS_051");
        assert_eq!(next_case(&c), "ATS_052");
        // The block is used up.
        assert!(keys::is_provisional(&next_case(&c)));
    }

    #[test]
    fn reserves_only_the_kinds_this_device_numbers_once_used_up() {
        let c = conn();
        project(&c, "p1", U, true);
        project(&c, "other", "user-b", true);
        case(&c, "c7", "ATS_007", "{}");
        // Nothing numbered on this device yet: no reserve, not even for the
        // cases it pulled (DAT-04), so another device's numbers stay contiguous.
        assert!(lease_requests(&c, U).unwrap().is_empty());

        // A case created offline waits with a provisional key: its number
        // plus the reserve.
        let provisional = next_case(&c);
        assert!(keys::is_provisional(&provisional));
        case(&c, "c8", &provisional, "{}");
        assert_eq!(
            lease_requests(&c, U).unwrap(),
            vec![LeaseRequest {
                project_id: "p1".into(),
                kind: "case",
                prefix: "ATS_".into(),
                floor: 8,
                size: 1 + RESERVE,
            }],
            "only the account's projects, only the kind in use"
        );
        apply_blocks(&c, U, &[block("case", 8, 18)]).unwrap();
        assert_eq!(finalize(&c, U).unwrap(), 1);

        // While the reserve has numbers left, nothing is leased: none is lost.
        assert!(lease_requests(&c, U).unwrap().is_empty());
        for n in 9..=18 {
            assert_eq!(next_case(&c), format!("ATS_{n:03}"));
        }
        assert_eq!(lease_requests(&c, U).unwrap()[0].size, RESERVE);
        // Blocks of a foreign project are ignored.
        apply_blocks(
            &c,
            U,
            &[KeyBlock {
                project_id: "other".into(),
                kind: "case".into(),
                start: 1,
                end: 50,
            }],
        )
        .unwrap();
        assert_eq!(keys::remaining(&c, KeyKind::Case, "other").unwrap().0, 0);
    }

    #[test]
    fn creating_online_leases_just_the_numbers_it_needs() {
        let c = conn();
        project(&c, "p1", U, true);
        project(&c, "local", U, false);
        project(&c, "other", "user-b", true);
        assert_eq!(
            lease_for(&c, U, "p1", KeyKind::Requirement, 1).unwrap(),
            Some(LeaseRequest {
                project_id: "p1".into(),
                kind: "requirement",
                prefix: "REQ-".into(),
                floor: 1,
                size: 1,
            })
        );
        // An import asks for its rows, up to the server's limit.
        assert_eq!(
            lease_for(&c, U, "p1", KeyKind::Requirement, 80)
                .unwrap()
                .map(|r| r.size),
            Some(MAX_BLOCK)
        );
        // A project the server never saw numbers itself; another account's is
        // not this device's to number.
        assert_eq!(
            lease_for(&c, U, "local", KeyKind::Requirement, 1).unwrap(),
            None
        );
        assert_eq!(
            lease_for(&c, U, "other", KeyKind::Requirement, 1).unwrap(),
            None
        );

        // The leased number makes the key definitive at once.
        apply_blocks(&c, U, &[block("requirement", 1, 1)]).unwrap();
        assert_eq!(
            keys::allocate(&c, KeyKind::Requirement, "p1", "REQ-", 3).unwrap(),
            "REQ-001"
        );
        // A reserve with numbers left is used first.
        apply_blocks(&c, U, &[block("requirement", 2, 11)]).unwrap();
        assert_eq!(
            lease_for(&c, U, "p1", KeyKind::Requirement, 1).unwrap(),
            None
        );
    }

    #[test]
    fn finalize_gives_provisional_keys_a_definitive_one_and_relinks_cases() {
        let c = conn();
        project(&c, "p1", U, true);
        requirement(&c, "r1", "REQ-?ABCD");
        case(
            &c,
            "c1",
            "ATS_?WXYZ",
            r#"{"requirementKeys":["REQ-?ABCD","REQ-900"]}"#,
        );
        case(&c, "c2", "ATS_?QQQQ", "{}");
        // c2 is in a key conflict: it waits for the user.
        c.execute(
            "INSERT INTO key_conflicts (id, user_id, entity, entity_id, project_id, lost_key, detected_at) \
             VALUES ('k', ?1, 'test_case', 'c2', 'p1', 'ATS_003', 'now')",
            [U],
        )
        .unwrap();

        // Without blocks nothing changes.
        assert_eq!(finalize(&c, U).unwrap(), 0);
        apply_blocks(&c, U, &[block("case", 1, 50), block("requirement", 1, 50)]).unwrap();
        assert_eq!(finalize(&c, U).unwrap(), 2);

        let get = |sql: &str| -> String { c.query_row(sql, [], |r| r.get(0)).unwrap() };
        assert_eq!(
            get("SELECT scenario_id FROM test_cases WHERE id = 'c1'"),
            "ATS_001"
        );
        assert_eq!(
            get("SELECT requirement_key FROM requirements WHERE id = 'r1'"),
            "REQ-001"
        );
        assert_eq!(
            get("SELECT data FROM test_cases WHERE id = 'c1'"),
            r#"{"requirementKeys":["REQ-001","REQ-900"]}"#
        );
        assert_eq!(
            get("SELECT scenario_id FROM test_cases WHERE id = 'c2'"),
            "ATS_?QQQQ"
        );
        // Every change is journaled for the next push (and audited, AUD-01).
        let journaled: i64 = c
            .query_row(
                "SELECT count(DISTINCT entity_id) FROM oplog WHERE synced_at IS NULL \
                 AND entity NOT IN ('audit_event', 'test_case_revision')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(journaled, 2, "c1 (key and link) and r1");
    }

    #[test]
    fn a_rejected_key_becomes_a_key_conflict_the_user_resolves() {
        let c = conn();
        project(&c, "p1", U, true);
        case(&c, "c1", "ATS_004", "{}");
        record_rejected(
            &c,
            U,
            &[RejectedKey {
                entity: "test_case".into(),
                entity_id: "c1".into(),
                taken_by: "remote".into(),
            }],
        )
        .unwrap();
        let open = list(&c, U).unwrap();
        assert_eq!(open.len(), 1);
        assert_eq!(open[0].lost_key, "ATS_004");
        assert!(keys::is_provisional(&open[0].current_key));
        // Another account cannot see or resolve it.
        assert!(list(&c, "user-b").unwrap().is_empty());
        assert!(resolve(&c, "user-b", &open[0].id, None).is_err());

        // No block yet: "assign the next one" needs a sync first.
        assert_eq!(
            resolve(&c, U, &open[0].id, None).unwrap_err(),
            "no-key-block"
        );
        // A used or provisional key is refused.
        assert!(resolve(&c, U, &open[0].id, Some("ATS_004")).is_err());
        assert!(resolve(&c, U, &open[0].id, Some("ATS_?AAAA")).is_err());
        apply_blocks(&c, U, &[block("case", 51, 100)]).unwrap();
        assert_eq!(resolve(&c, U, &open[0].id, None).unwrap(), "ATS_051");
        assert!(list(&c, U).unwrap().is_empty());
    }

    #[test]
    fn migration_0017_renames_duplicates_like_the_server_and_makes_keys_unique() {
        let c = Connection::open_in_memory().unwrap();
        for (name, sql) in crate::db::MIGRATIONS.iter() {
            if *name < "0017" {
                c.execute_batch(sql).unwrap();
            }
        }
        project(&c, "p1", U, false);
        // Two devices numbered ATS_004 offline (before this version).
        case(&c, "b", "ATS_004", "{}");
        case(&c, "a", "ATS_004", "{}");
        case(&c, "c", "ATS_004", "{}");
        case(&c, "gone", "ATS_004", "{}");
        c.execute(
            "UPDATE test_cases SET deleted_at = 'now' WHERE id = 'gone'",
            [],
        )
        .unwrap();
        // The server already has "c": it keeps the key, whatever its id.
        c.execute(
            "INSERT INTO sync_base (user_id, entity, entity_id, revision, hlc) VALUES (?1, 'test_case', 'c', 1, '')",
            [U],
        )
        .unwrap();
        requirement(&c, "r2", "REQ-001");
        requirement(&c, "r1", "REQ-001");
        // Two synced rows with the same key: the second one gets a conflict.
        case(&c, "s1", "ATS_009", "{}");
        case(&c, "s2", "ATS_009", "{}");
        for id in ["s1", "s2"] {
            c.execute(
                "INSERT INTO sync_base (user_id, entity, entity_id, revision, hlc) VALUES (?1, 'test_case', ?2, 1, '')",
                params![U, id],
            )
            .unwrap();
        }
        // Rows without a key (a pull without one writes ''): never a duplicate.
        case(&c, "e1", "", "{}");
        case(&c, "e2", "", "{}");
        requirement(&c, "re1", "");

        c.execute_batch(include_str!("../migrations/0017_keys_and_purge.sql"))
            .unwrap();
        let s2: String = c
            .query_row(
                "SELECT scenario_id FROM test_cases WHERE id = 's2'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(
            s2.starts_with("ATS_009?") && keys::is_provisional(&s2),
            "{s2}"
        );
        let open = list(&c, U).unwrap();
        assert_eq!(
            open.len(),
            1,
            "only the synced loser: the others were never on the server"
        );
        assert_eq!(
            (open[0].entity_id.as_str(), open[0].lost_key.as_str()),
            ("s2", "ATS_009")
        );
        // The app runs every later migration before it syncs again.
        for (name, sql) in crate::db::MIGRATIONS.iter() {
            if *name > "0017_keys_and_purge.sql" {
                c.execute_batch(sql).unwrap();
            }
        }
        crate::revisions::migrate_stable_steps(&c).unwrap();
        // The server had deleted s1 and kept ATS_009 on s2: the tombstone of s1
        // gives it back, nothing diverges.
        c.execute(
            "UPDATE test_cases SET deleted_at = 'now' WHERE id = 's1'",
            [],
        )
        .unwrap();
        holder_deleted(&c, "test_case", "s1").unwrap();
        let s2: String = c
            .query_row(
                "SELECT scenario_id FROM test_cases WHERE id = 's2'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(s2, "ATS_009");
        assert!(list(&c, U).unwrap().is_empty());
        let key = |sql: &str| -> String { c.query_row(sql, [], |r| r.get(0)).unwrap() };
        assert_eq!(
            key("SELECT scenario_id FROM test_cases WHERE id = 'c'"),
            "ATS_004"
        );
        assert_eq!(
            key("SELECT scenario_id FROM test_cases WHERE id = 'a'"),
            "ATS_004-dup1"
        );
        assert_eq!(
            key("SELECT scenario_id FROM test_cases WHERE id = 'b'"),
            "ATS_004-dup2"
        );
        assert_eq!(
            key("SELECT scenario_id FROM test_cases WHERE id = 'gone'"),
            "ATS_004"
        );
        assert_eq!(
            key("SELECT requirement_key FROM requirements WHERE id = 'r1'"),
            "REQ-001"
        );
        assert_eq!(
            key("SELECT requirement_key FROM requirements WHERE id = 'r2'"),
            "REQ-001-dup1"
        );

        // From now on a second live row with the same key is refused.
        let ws = crate::db::ensure_workspace(&c).unwrap();
        let dup = c.execute(
            "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, author, \
             created_by, updated_by, created_at, updated_at) \
             VALUES ('d', ?1, 'p1', 'ATS_004', 't', 'a', 'a', 'a', 'now', 'now')",
            [&ws],
        );
        assert!(dup.is_err());
    }

    /// The current state of the case has its revision row (DAT-02, review S2).
    fn assert_current_revision(c: &Connection, id: &str) {
        let (rev_id, sha) = crate::revisions::current_id(c, id).unwrap().unwrap();
        let stored: String = c
            .query_row(
                "SELECT content_sha256 FROM test_case_revisions WHERE id = ?1",
                [&rev_id],
                |r| r.get(0),
            )
            .unwrap_or_else(|_| panic!("no revision row for the current state of {id}"));
        assert_eq!(stored, sha, "{id}");
    }

    #[test]
    fn every_key_path_that_changes_a_case_leaves_its_current_revision() {
        let c = conn();
        project(&c, "p1", U, true);
        requirement(&c, "r1", "REQ-?ABCD");
        case(
            &c,
            "c1",
            "ATS_?WXYZ",
            r#"{"requirementKeys":["REQ-?ABCD"]}"#,
        );
        case(
            &c,
            "c2",
            "ATS_?QQQQ",
            r#"{"requirementKeys":["REQ-?ABCD"]}"#,
        );
        // Key finalization of a case, and of the requirement it links (relink).
        apply_blocks(&c, U, &[block("case", 1, 50), block("requirement", 1, 50)]).unwrap();
        assert!(finalize(&c, U).unwrap() > 0);
        for id in ["c1", "c2"] {
            assert_current_revision(&c, id);
        }
        // A pulled key takes the local one away (vacate), then comes back.
        let key: String = c
            .query_row(
                "SELECT scenario_id FROM test_cases WHERE id = 'c1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        c.execute(
            "INSERT OR IGNORE INTO sync_base (user_id, entity, entity_id, revision, hlc) VALUES (?1, 'test_case', 'c1', 1, '')",
            [U],
        )
        .unwrap();
        vacate(&c, U, "test_case", "c1", "remote-holder").unwrap();
        assert_current_revision(&c, "c1");
        holder_deleted(&c, "test_case", "remote-holder").unwrap();
        let back: String = c
            .query_row(
                "SELECT scenario_id FROM test_cases WHERE id = 'c1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(back, key);
        assert_current_revision(&c, "c1");
    }
}
