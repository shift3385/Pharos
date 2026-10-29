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

/// Entities the sync pushes and pulls (Phase 8B + SYNC-04a). The pending count
/// and the push are both built from this list, so the indicator only counts
/// what a sync actually sends (FIX-01). Templates and attachments still write
/// to the oplog and wait for SYNC-04b.
pub const SYNCED: [&str; 5] = [
    "project",
    "test_plan",
    "test_case",
    "requirement",
    "planner_card",
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
        "template" => "SELECT owner_id FROM templates WHERE id = ?1",
        _ => return Ok(None),
    };
    let owner: Option<Option<String>> = conn
        .query_row(sql, params![entity_id], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(owner.flatten().filter(|o| !o.is_empty()))
}

/// Appends a delta for an entity mutation. Called inside each repo's write, in
/// the same connection/transaction, so the journal never diverges from the data.
/// The row belongs to the entity's owner (FIX-07), so another account signed in
/// on this device never pushes it.
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
    let user_id = owner_of(conn, entity, entity_id)?.unwrap_or_default();
    conn.execute(
        "INSERT INTO oplog (id, entity, entity_id, op, payload, revision, author, created_at, hlc, user_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), ?8, ?9)",
        params![
            Uuid::new_v4().to_string(),
            entity,
            entity_id,
            op,
            payload,
            revision,
            author,
            hlc,
            user_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

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
/// open conflicts.
pub fn sync_state(conn: &Connection, user_id: &str) -> Result<SyncState, String> {
    claim_unowned(conn)?;
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
            "SELECT count(*) FROM sync_conflicts WHERE resolved_at IS NULL AND user_id = ?1",
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
             VALUES ('t', 'template', 't1', 'upsert', 'now', ?1)",
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
}
