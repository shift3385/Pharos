//! Change journal / oplog (Phase 8, spec §9). Every local mutation appends a
//! per-entity delta via `record`, stamped with a Hybrid Logical Clock (SYNC-01).
//! The client shows a "pending changes" count and (Phase 8B) pushes pending
//! deltas to the backend and marks them synced.

use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
#[cfg(feature = "tauri")]
use tauri::State;
#[cfg(test)]
use ts_rs::TS;
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
    conn.query_row(
        "SELECT value FROM sync_state WHERE key = ?1",
        params![key],
        |r| r.get(0),
    )
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

/// Gives this database a new device id (AUD-01 review): for a file that may be
/// a copy of another device's (recovered with the recovery key). Its audit
/// events then start a new chain instead of forking the original's; the HLC
/// stays monotonic (`hlc_last` is kept).
pub(crate) fn rotate_device_id(conn: &Connection) -> Result<(), String> {
    state_set(conn, "device_id", &Uuid::new_v4().to_string())
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

/// Entities the sync pushes and pulls (Phase 8B + SYNC-04a, custom fields of
/// FLD-01). The pending count
/// and the push are both built from this list, so the indicator only counts
/// what a sync actually sends (FIX-01). Templates and attachments still write
/// to the oplog and wait for SYNC-04b. The execution entities (EJE-01) join
/// with `runs.rs`; custom field definitions (FLD-01) with `custom_fields.rs`;
/// configurations, test cycles and their items (CYC-01) with `cycles.rs`;
/// defects and their links (DEF-01) with `defects.rs`; attachments and
/// templates (SYNC-04b) with `blob_sync.rs`.
pub const SYNCED: [&str; 16] = [
    "project",
    "test_plan",
    "test_case",
    "requirement",
    "planner_card",
    "run",
    "run_item",
    "unlinked_mapping",
    "custom_field",
    "configuration",
    "test_cycle",
    "test_cycle_item",
    "defect",
    "defect_link",
    "attachment",
    "template",
];

/// `SYNCED` as an SQL list literal, for `entity IN (...)`.
pub fn synced_sql_list() -> String {
    SYNCED
        .iter()
        .map(|e| format!("'{e}'"))
        .collect::<Vec<_>>()
        .join(",")
}

/// The account an entity belongs to (FIX-07): its owner, or its project's owner.
/// None when it cannot be derived (built-in templates, rows without a project).
pub fn owner_of(
    conn: &Connection,
    entity: &str,
    entity_id: &str,
) -> Result<Option<String>, String> {
    let sql = match entity {
        "project" => "SELECT owner_id FROM projects WHERE id = ?1",
        "test_plan" => "SELECT p.owner_id FROM test_plans x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1",
        "test_case" => "SELECT p.owner_id FROM test_cases x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1",
        "requirement" => {
            "SELECT p.owner_id FROM requirements x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1"
        }
        "planner_card" => "SELECT owner_id FROM planner_cards WHERE id = ?1",
        "custom_field" => {
            "SELECT p.owner_id FROM custom_fields x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1"
        }
        "template" => "SELECT owner_id FROM templates WHERE id = ?1",
        "run" | "run_item" | "unlinked_mapping" => crate::runs::owner_sql(entity).unwrap_or_default(),
        "configuration" | "test_cycle" | "test_cycle_item" => {
            crate::cycles::owner_sql(entity).unwrap_or_default()
        }
        "defect" | "defect_link" => crate::defects::owner_sql(entity).unwrap_or_default(),
        "attachment" => crate::blob_sync::owner_sql(entity).unwrap_or_default(),
        // Append-only entities say it themselves (sync_class registry).
        _ => {
            return match crate::sync_class::append_only(entity) {
                Some(class) => (class.owner)(conn, entity_id),
                None => Ok(None),
            }
        }
    };
    let owner: Option<Option<String>> = conn
        .query_row(sql, params![entity_id], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(owner.flatten().filter(|o| !o.is_empty()))
}

/// True when the server ever knew this entity: a sync base or a synced journal
/// row exists for it, on any account of this device (SYNC-06, DAT-01).
pub(crate) fn known_to_server(conn: &Connection, entity: &str, id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM sync_base WHERE entity = ?1 AND entity_id = ?2
         UNION ALL SELECT 1 FROM oplog WHERE entity = ?1 AND entity_id = ?2 AND synced_at IS NOT NULL
         LIMIT 1",
        params![entity, id],
        |_| Ok(()),
    )
    .optional()
    .map_err(|e| e.to_string())
    .map(|r| r.is_some())
}

/// Appends a delta for an entity mutation, in the same connection/transaction
/// as the write, so the journal never diverges from the data. Only
/// `journal::record` calls it (AUD-01): the oplog row and the audit event of a
/// change are written together. The row belongs to the entity's owner (FIX-07),
/// so another account signed in on this device never pushes it.
pub(crate) fn record(
    conn: &Connection,
    entity: &str,
    entity_id: &str,
    op: &str,
    payload: &str,
    revision: i64,
    author: &str,
) -> Result<(), String> {
    let hlc = next_hlc(conn)?;
    let user_id = owner_of(conn, entity, entity_id)?.unwrap_or_default();
    // The workspace the change belongs to (SYNC-07): a delete leaves no row
    // to read it from at push time.
    let workspace_id = crate::workspaces::workspace_of(conn, entity, entity_id)?;
    let id = Uuid::new_v4().to_string();
    let stamped = conn.execute(
        "INSERT INTO oplog (id, entity, entity_id, op, payload, revision, author, created_at, hlc, user_id, workspace_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), ?8, ?9, ?10)",
        params![id, entity, entity_id, op, payload, revision, author, hlc, user_id, workspace_id],
    );
    match stamped {
        Ok(_) => Ok(()),
        // A data step of a migration before 0040 (the column does not exist
        // yet): the row as it was written then.
        Err(e) if e.to_string().contains("no column named workspace_id") => conn
            .execute(
                "INSERT INTO oplog (id, entity, entity_id, op, payload, revision, author, created_at, hlc, user_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), ?8, ?9)",
                params![id, entity, entity_id, op, payload, revision, author, hlc, user_id],
            )
            .map(|_| ())
            .map_err(|e| e.to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    pub(crate) pending: i64,
    /// Open conflicts waiting for the user in the conflict panel (Phase 8C).
    pub(crate) conflicts: i64,
    /// Pending changes of synced entities that belong to no account yet (no
    /// derivable owner): kept, but they cannot sync until they get one.
    pub(crate) orphans: i64,
}

/// Gives an owner to pending rows stamped without one because the entity's
/// owner was unknown when they were written (e.g. a case whose project had not
/// been pulled yet). Rows that still have no derivable owner stay `''`.
pub fn claim_unowned(conn: &Connection) -> Result<(), String> {
    let unowned: Vec<(String, String)> = {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT DISTINCT entity, entity_id FROM oplog
                  WHERE user_id = '' AND synced_at IS NULL AND entity IN ({})",
                synced_sql_list()
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?
    };
    for (entity, entity_id) in unowned {
        if let Some(owner) = owner_of(conn, &entity, &entity_id)? {
            conn.execute(
                "UPDATE oplog SET user_id = ?3
                  WHERE user_id = '' AND synced_at IS NULL AND entity = ?1 AND entity_id = ?2",
                params![entity, entity_id, owner],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Pending changes of one account: the distinct synced entities with unsynced
/// rows, i.e. the deltas its next push would send (FIX-01, FIX-07) — plus its
/// open conflicts (of version and of key).
pub fn sync_state(conn: &Connection, user_id: &str) -> Result<SyncState, String> {
    claim_unowned(conn)?;
    crate::key_sync::close_stale(conn)?;
    let pending: i64 = conn
        .query_row(
            &format!(
                "SELECT count(*) FROM (SELECT DISTINCT entity, entity_id FROM oplog
                  WHERE synced_at IS NULL AND user_id = ?1 AND entity IN ({}))",
                synced_sql_list()
            ),
            params![user_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let conflicts: i64 = conn
        .query_row(
            "SELECT (SELECT count(*) FROM sync_conflicts WHERE resolved_at IS NULL AND user_id = ?1)
                  + (SELECT count(*) FROM key_conflicts WHERE resolved_at IS NULL AND user_id = ?1)
                  + (SELECT count(*) FROM sync_rejections WHERE resolved_at IS NULL AND user_id = ?1)",
            params![user_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let orphans: i64 = conn
        .query_row(
            &format!(
                "SELECT count(*) FROM (SELECT DISTINCT entity, entity_id FROM oplog
                  WHERE synced_at IS NULL AND user_id = '' AND entity IN ({}))",
                synced_sql_list()
            ),
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(SyncState {
        pending,
        conflicts,
        orphans,
    })
}

/// Pending changes and open conflicts of the signed-in account — drives the
/// status indicator.
/// Synced rows younger than this stay, as a margin to diagnose a sync that
/// just happened (SYNC-10).
const COMPACT_KEEP: &str = "-1 day";

/// `sync_state` key of the last compaction.
const COMPACTED_AT: &str = "oplog_compacted_at";

/// Deletes the oplog rows the server already has (SYNC-10, ADR-0051): a
/// synced row is never sent again, and what the sync and the purge read later
/// lives elsewhere (`sync_base`, the entity tables, the append-only tables).
/// Kept: every pending row, the synced rows of the last day, and the latest
/// `delete` row of each entity, which the restore of a project's children
/// (`restore_project_children`, `trash`) and of a run's items read to tell an
/// item's own delete from its parent's. Never a VACUUM: reclaiming the pages
/// is the database's (N4, ADR-0050). Returns how many rows went.
pub fn compact(conn: &Connection) -> Result<usize, String> {
    conn.execute(
        &format!(
            "DELETE FROM oplog
              WHERE synced_at IS NOT NULL AND synced_at < datetime('now', '{COMPACT_KEEP}')
                AND NOT (op = 'delete' AND rowid = (
                      SELECT max(o.rowid) FROM oplog o
                       WHERE o.entity = oplog.entity AND o.entity_id = oplog.entity_id
                         AND o.op = 'delete'))"
        ),
        [],
    )
    .map_err(|e| e.to_string())
}

/// Compacts at most once a day (after a sync that went through). Returns the
/// rows deleted, or None when it was not due.
pub fn compact_if_due(conn: &Connection) -> Result<Option<usize>, String> {
    let due = match state_get(conn, COMPACTED_AT)? {
        None => true,
        Some(at) => conn
            .query_row(
                "SELECT julianday('now') - julianday(?1) >= 1",
                params![at],
                |r| r.get::<_, bool>(0),
            )
            .unwrap_or(true),
    };
    if !due {
        return Ok(None);
    }
    let gone = compact(conn)?;
    let now: String = conn
        .query_row("SELECT datetime('now')", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    state_set(conn, COMPACTED_AT, &now)?;
    Ok(Some(gone))
}

/// What the sync and the audit log take on disk, as counts (SYNC-10): it goes
/// in the diagnostic bundle. Never a value, an id or a name.
#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncStorage {
    /// Oplog rows not yet sent.
    oplog_pending: i64,
    /// Oplog rows the server already has (what compaction removes).
    oplog_synced: i64,
    /// All oplog rows, by entity.
    oplog_by_entity: std::collections::BTreeMap<String, i64>,
    /// Audit events, and the bytes of their `changes`.
    audit_events: i64,
    audit_changes_bytes: i64,
    /// The average and the largest `changes`, in bytes.
    audit_changes_avg_bytes: i64,
    audit_changes_max_bytes: i64,
    /// Audit events by `entity:action`, the five largest groups.
    audit_top: Vec<(String, i64)>,
    /// Planner card moves (an update that only changed the column or the
    /// position): one event per card moved.
    audit_card_moves: i64,
    /// When the oplog was last compacted.
    #[serde(skip_serializing_if = "Option::is_none")]
    compacted_at: Option<String>,
}

pub fn storage(conn: &Connection) -> Result<SyncStorage, String> {
    let one = |sql: &str| -> Result<i64, String> {
        conn.query_row(sql, [], |r| r.get(0))
            .map_err(|e| e.to_string())
    };
    let pairs = |sql: &str| -> Result<Vec<(String, i64)>, String> {
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())
    };
    Ok(SyncStorage {
        oplog_pending: one("SELECT count(*) FROM oplog WHERE synced_at IS NULL")?,
        oplog_synced: one("SELECT count(*) FROM oplog WHERE synced_at IS NOT NULL")?,
        oplog_by_entity: pairs("SELECT entity, count(*) FROM oplog GROUP BY entity")?
            .into_iter()
            .collect(),
        audit_events: one("SELECT count(*) FROM audit_log")?,
        audit_changes_bytes: one("SELECT coalesce(sum(length(changes)), 0) FROM audit_log")?,
        audit_changes_avg_bytes: one(
            "SELECT coalesce(CAST(avg(length(changes)) AS INTEGER), 0) FROM audit_log",
        )?,
        audit_changes_max_bytes: one("SELECT coalesce(max(length(changes)), 0) FROM audit_log")?,
        audit_top: pairs(
            "SELECT entity || ':' || action, count(*) AS n FROM audit_log
              GROUP BY entity, action ORDER BY n DESC, 1 LIMIT 5",
        )?,
        audit_card_moves: one("SELECT count(*) FROM audit_log
              WHERE entity = 'planner_card' AND action = 'update' AND changes IS NOT NULL
                AND (SELECT count(*) FROM json_each(changes)
                      WHERE key NOT IN ('status', 'position')) = 0")?,
        compacted_at: state_get(conn, COMPACTED_AT)?,
    })
}

/// Compacts the oplog after a sync that went through, at most once a day
/// (SYNC-10). Returns how many rows went (0 when it was not due).
#[cfg(feature = "tauri")]
#[tauri::command]
pub fn oplog_compact(db: State<Db>, user_id: String) -> Result<usize, String> {
    if user_id.trim().is_empty() {
        return Err("not-authenticated".into());
    }
    let gone = db.with_conn(compact_if_due)?;
    Ok(gone.unwrap_or(0))
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn oplog_pending_count(db: State<Db>, user_id: String) -> Result<SyncState, String> {
    db.with_conn(|conn| sync_state(conn, &user_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: &str = "user-a";
    const B: &str = "user-b";

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        c
    }

    fn add_project(c: &Connection, id: &str, owner: &str) {
        let ws = crate::db::ensure_workspace(c).unwrap();
        c.execute(
            "INSERT INTO projects (id, workspace_id, owner_id, name, created_by, updated_by, \
             created_at, updated_at) VALUES (?1, ?2, ?3, 'P', ?3, ?3, 'now', 'now')",
            params![id, ws, owner],
        )
        .unwrap();
    }

    fn add_case(c: &Connection, id: &str, project: &str) {
        let ws = crate::db::ensure_workspace(c).unwrap();
        c.execute(
            "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, author, \
             created_by, updated_by, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?1, 't', 'a', 'a', 'a', 'now', 'now')",
            params![id, ws, project],
        )
        .unwrap();
    }

    fn user_of(c: &Connection, entity_id: &str) -> String {
        c.query_row(
            "SELECT user_id FROM oplog WHERE entity_id = ?1 ORDER BY rowid DESC LIMIT 1",
            [entity_id],
            |r| r.get(0),
        )
        .unwrap()
    }

    #[test]
    fn hlc_is_monotonic_and_the_device_id_is_stable() {
        let c = conn();
        let device = device_id(&c).unwrap();
        assert_eq!(device_id(&c).unwrap(), device);
        let mut prev = next_hlc(&c).unwrap();
        for _ in 0..50 {
            let next = next_hlc(&c).unwrap();
            assert!(
                hlc::cmp_encoded(&next, &prev).is_gt(),
                "{next} after {prev}"
            );
            assert!(next.ends_with(&device));
            prev = next;
        }
    }

    #[test]
    fn observing_a_remote_clock_moves_the_local_one_past_it() {
        let c = conn();
        let ahead = Hlc::parse(&next_hlc(&c).unwrap()).unwrap();
        // A device one hour ahead.
        let remote = hlc::tick(Some(&ahead), now_ms() + 3_600_000, "other-device").encode();
        observe_hlc(&c, &remote).unwrap();
        assert!(hlc::cmp_encoded(&next_hlc(&c).unwrap(), &remote).is_gt());
        // Legacy or garbage values are ignored.
        let before = state_get(&c, "hlc_last").unwrap();
        observe_hlc(&c, "").unwrap();
        observe_hlc(&c, "not-an-hlc").unwrap();
        assert_eq!(state_get(&c, "hlc_last").unwrap(), before);
    }

    #[test]
    fn owner_of_follows_the_project_or_the_row() {
        let c = conn();
        add_project(&c, "p1", A);
        add_case(&c, "c1", "p1");
        add_case(&c, "orphan", "missing-project");
        let ws = crate::db::ensure_workspace(&c).unwrap();
        c.execute(
            "INSERT INTO planner_cards (id, workspace_id, project_id, owner_id, kind, title, \
             created_by, updated_by, created_at, updated_at) \
             VALUES ('k1', ?1, 'p1', ?2, 'task', 't', 'x', 'x', 'now', 'now')",
            params![ws, B],
        )
        .unwrap();
        assert_eq!(owner_of(&c, "project", "p1").unwrap().as_deref(), Some(A));
        assert_eq!(owner_of(&c, "test_case", "c1").unwrap().as_deref(), Some(A));
        assert_eq!(
            owner_of(&c, "planner_card", "k1").unwrap().as_deref(),
            Some(B)
        );
        assert_eq!(owner_of(&c, "test_case", "orphan").unwrap(), None);
        assert_eq!(owner_of(&c, "test_case", "missing").unwrap(), None);
        assert_eq!(owner_of(&c, "attachment", "x").unwrap(), None);
        add_project(&c, "p-empty", "");
        assert_eq!(owner_of(&c, "project", "p-empty").unwrap(), None);
    }

    #[test]
    fn record_stamps_the_owner_and_an_hlc() {
        let c = conn();
        add_project(&c, "p1", A);
        record(&c, "project", "p1", "upsert", "{}", 1, "me").unwrap();
        record(&c, "test_case", "not-yet-pulled", "upsert", "{}", 1, "me").unwrap();
        assert_eq!(user_of(&c, "p1"), A);
        assert_eq!(user_of(&c, "not-yet-pulled"), "");
        let (hlc, synced): (String, Option<String>) = c
            .query_row(
                "SELECT hlc, synced_at FROM oplog WHERE entity_id = 'p1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert!(Hlc::parse(&hlc).is_some());
        assert!(synced.is_none(), "a new row is pending");
    }

    #[test]
    fn claim_unowned_gives_pending_rows_their_owner_once_known() {
        let c = conn();
        add_case(&c, "c1", "p1");
        record(&c, "test_case", "c1", "upsert", "{}", 1, "me").unwrap();
        record(&c, "test_case", "c1", "upsert", "{}", 2, "me").unwrap();
        c.execute("UPDATE oplog SET synced_at = 'now' WHERE revision = 1", [])
            .unwrap();
        claim_unowned(&c).unwrap();
        assert_eq!(user_of(&c, "c1"), "", "still no derivable owner");

        add_project(&c, "p1", A);
        claim_unowned(&c).unwrap();
        let users: Vec<(i64, String)> = {
            let mut stmt = c
                .prepare("SELECT revision, user_id FROM oplog ORDER BY revision")
                .unwrap();
            stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap()
        };
        // Only the pending row is claimed; a synced row is history.
        assert_eq!(users, [(1, String::new()), (2, A.to_string())]);
    }

    #[test]
    fn sync_state_counts_one_accounts_synced_entities() {
        let c = conn();
        add_project(&c, "pa", A);
        add_project(&c, "pb", B);
        add_case(&c, "ca", "pa");
        // Two changes of one entity count once.
        record(&c, "test_case", "ca", "upsert", "{}", 1, "a").unwrap();
        record(&c, "test_case", "ca", "upsert", "{}", 2, "a").unwrap();
        record(&c, "project", "pa", "upsert", "{}", 1, "a").unwrap();
        // Another account's change, a synced one, an unsynced entity kind and
        // an orphan.
        record(&c, "project", "pb", "upsert", "{}", 1, "b").unwrap();
        record(&c, "project", "pa", "upsert", "{}", 2, "a").unwrap();
        c.execute(
            "UPDATE oplog SET synced_at = 'now' WHERE entity_id = 'pa' AND revision = 2",
            [],
        )
        .unwrap();
        c.execute(
            "INSERT INTO oplog (id, entity, entity_id, op, created_at, user_id) \
             VALUES ('t', 'profile', 't1', 'upsert', 'now', ?1)",
            [A],
        )
        .unwrap();
        record(&c, "test_case", "orphan", "upsert", "{}", 1, "x").unwrap();
        c.execute(
            "INSERT INTO sync_conflicts (id, entity, entity_id, detected_at, user_id) \
             VALUES ('k', 'test_case', 'ca', 'now', ?1)",
            [A],
        )
        .unwrap();

        let a = sync_state(&c, A).unwrap();
        assert_eq!((a.pending, a.conflicts, a.orphans), (2, 1, 1));
        let b = sync_state(&c, B).unwrap();
        assert_eq!((b.pending, b.conflicts, b.orphans), (1, 0, 1));
    }

    // SYNC-10 (ADR-0051): compacting the synced oplog.

    fn row(c: &Connection, entity: &str, id: &str, op: &str, synced_at: Option<&str>) {
        c.execute(
            "INSERT INTO oplog (id, entity, entity_id, op, payload, revision, author, created_at, hlc, user_id)
             VALUES (?1, ?2, ?3, ?4, '{}', 1, 'a', datetime('now'), ?5, ?6)",
            params![
                Uuid::new_v4().to_string(),
                entity,
                id,
                op,
                next_hlc(c).unwrap(),
                A
            ],
        )
        .unwrap();
        if let Some(at) = synced_at {
            c.execute(
                "UPDATE oplog SET synced_at = ?1 WHERE rowid = last_insert_rowid()",
                params![at],
            )
            .unwrap();
        }
    }

    fn ops(c: &Connection) -> Vec<(String, String, bool)> {
        let mut stmt = c
            .prepare("SELECT entity_id, op, synced_at IS NOT NULL FROM oplog ORDER BY rowid")
            .unwrap();
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    #[test]
    fn compaction_drops_old_synced_rows_and_keeps_what_is_still_read() {
        let c = conn();
        let old = "2026-01-01 00:00:00";
        row(&c, "test_case", "c1", "upsert", Some(old));
        row(&c, "test_case", "c1", "upsert", Some(old));
        row(&c, "audit_event", "e1", "append", Some(old));
        row(&c, "test_case_revision", "r1", "append", Some(old));
        // An item deleted on its own, long ago: its latest delete stays.
        row(&c, "run_item", "i1", "delete", Some(old));
        row(&c, "run_item", "i1", "delete", Some(old));
        // Pending, and synced within the last day: they stay.
        row(&c, "test_case", "c2", "upsert", None);
        row(&c, "test_case", "c3", "upsert", Some("2999-01-01 00:00:00"));
        assert_eq!(compact(&c).unwrap(), 5);
        assert_eq!(
            ops(&c),
            vec![
                ("i1".into(), "delete".into(), true),
                ("c2".into(), "upsert".into(), false),
                ("c3".into(), "upsert".into(), true),
            ]
        );
        // known_to_server reads the base, not only synced rows.
        c.execute(
            "INSERT INTO sync_base (user_id, entity, entity_id, revision, hlc) VALUES (?1, 'test_case', 'c1', 2, 'h')",
            params![A],
        )
        .unwrap();
        assert!(known_to_server(&c, "test_case", "c1").unwrap());
    }

    #[test]
    fn compaction_runs_at_most_once_a_day() {
        let c = conn();
        row(&c, "test_case", "c1", "upsert", Some("2026-01-01 00:00:00"));
        assert_eq!(compact_if_due(&c).unwrap(), Some(1));
        row(&c, "test_case", "c1", "upsert", Some("2026-01-01 00:00:00"));
        assert_eq!(compact_if_due(&c).unwrap(), None);
        state_set(&c, COMPACTED_AT, "2026-01-01 00:00:00").unwrap();
        assert_eq!(compact_if_due(&c).unwrap(), Some(1));
    }

    #[test]
    fn storage_counts_without_values() {
        let c = conn();
        row(&c, "test_case", "c1", "upsert", None);
        row(&c, "test_case", "c1", "upsert", Some("2026-01-01 00:00:00"));
        let s = storage(&c).unwrap();
        assert_eq!(s.oplog_pending, 1);
        assert_eq!(s.oplog_synced, 1);
        assert_eq!(s.oplog_by_entity.get("test_case"), Some(&2));
        assert_eq!(s.audit_events, 0);
        let json = serde_json::to_value(&s).unwrap();
        assert!(json.get("oplogPending").is_some());
    }

    /// The numbers behind ADR-0051 (SYNC-10). Not run by default:
    /// `cargo test -p pharos-core --lib oplog::tests::bench_ -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn bench_oplog_and_audit_growth() {
        use crate::journal::{self, Action, Actor, Change};
        let c = conn();
        add_project(&c, "p1", A);
        let (cases, edits) = (2_000, 20);
        for i in 0..cases {
            add_case(&c, &format!("c{i}"), "p1");
        }
        let page_bytes = |c: &Connection| -> i64 {
            c.query_row("PRAGMA page_count", [], |r| r.get::<_, i64>(0))
                .unwrap()
                * c.query_row("PRAGMA page_size", [], |r| r.get::<_, i64>(0))
                    .unwrap()
        };
        let empty = page_bytes(&c);
        for e in 0..edits {
            for i in 0..cases {
                let id = format!("c{i}");
                let before = journal::snapshot(&c, "test_case", &id).unwrap();
                c.execute(
                    "UPDATE test_cases SET title = ?2, revision = revision + 1 WHERE id = ?1",
                    params![id, format!("Caso {i} versión {e}")],
                )
                .unwrap();
                journal::record(
                    &c,
                    Change::new(
                        "test_case",
                        &id,
                        Action::Update,
                        Actor::user(A),
                        "upsert",
                        e + 2,
                        "a",
                    )
                    .before(before),
                )
                .unwrap();
            }
        }
        c.execute("UPDATE oplog SET synced_at = '2026-01-01 00:00:00'", [])
            .unwrap();
        let s = storage(&c).unwrap();
        let full = page_bytes(&c);
        let oplog_bytes: i64 = c
            .query_row(
                "SELECT coalesce(sum(length(id) + length(entity) + length(entity_id) + length(op)
                        + length(payload) + length(author) + length(hlc) + length(user_id) + 40), 0) FROM oplog",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let gone = compact(&c).unwrap();
        let left: i64 = c
            .query_row("SELECT count(*) FROM oplog", [], |r| r.get(0))
            .unwrap();
        println!(
            "SYNC-10 bench: {cases} cases x {edits} edits = {} changes
  oplog rows before: {} (synced {}), ~{} KiB of row data
  audit events: {}, changes {} KiB (avg {} B, max {} B)
  database: {} KiB empty, {} KiB after the edits
  compaction: {gone} rows deleted, {left} left",
            cases * edits,
            s.oplog_pending + s.oplog_synced,
            s.oplog_synced,
            oplog_bytes / 1024,
            s.audit_events,
            s.audit_changes_bytes / 1024,
            s.audit_changes_avg_bytes,
            s.audit_changes_max_bytes,
            empty / 1024,
            full / 1024,
        );
    }
}
