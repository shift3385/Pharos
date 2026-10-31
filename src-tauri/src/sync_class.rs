//! Sync classes (design 0.2.0 §3.2). `lww` entities (`oplog::SYNCED`) merge by
//! base and HLC with the conflict panel; `append_only` entities, registered
//! here, are inserted if absent, never conflict and never change content; the
//! server refuses other content under an existing id. Registering one is one
//! entry in `APPEND_ONLY` (and one line in the server's `sync.schemas.ts`); a
//! new entity in either class also bumps `APPLIED_SET_VERSION`.

use rusqlite::Connection;
use serde_json::Value;

/// How the desktop pushes and pulls one append-only entity.
pub struct AppendOnly {
    pub entity: &'static str,
    /// The document pushed for a local row; None if it is gone.
    pub read: fn(&Connection, &str) -> Result<Option<Value>, String>,
    /// Stores a pulled document for an account unless its id is already here.
    pub insert_if_absent: fn(&Connection, &str, &Value) -> Result<(), String>,
    /// The account the local row syncs with; None = stays on this device.
    pub owner: fn(&Connection, &str) -> Result<Option<String>, String>,
}

pub const APPEND_ONLY: &[AppendOnly] = &[
    AppendOnly {
        entity: "audit_event",
        read: crate::audit::payload,
        insert_if_absent: crate::audit::insert_if_absent,
        owner: crate::audit::owner,
    },
    AppendOnly {
        entity: "test_case_revision",
        read: crate::revisions::payload,
        insert_if_absent: crate::revisions::insert_if_absent,
        owner: crate::revisions::owner,
    },
    AppendOnly {
        entity: crate::runs::RUN_SHARD,
        read: crate::runs::shard_payload,
        insert_if_absent: crate::runs::shard_insert_if_absent,
        owner: crate::runs::shard_owner,
    },
    AppendOnly {
        entity: crate::runs::RESULT,
        read: crate::runs::result_payload,
        insert_if_absent: crate::runs::result_insert_if_absent,
        owner: crate::runs::result_owner,
    },
];

/// Version of the set of entities this build applies on pull. A pull cursor
/// stored under an older set restarts at 0 (VERSIONING §6.5): an older build
/// moved the cursor past documents it did not apply. Bump it with every entity
/// added to `oplog::SYNCED` or `APPEND_ONLY`.
/// 1: audit_event (AUD-01). 2: test_case_revision and the stable-steps shape
/// of test cases (DAT-02). 3: run, run_item, unlinked_mapping, run_shard and
/// result (EJE-01).
pub const APPLIED_SET_VERSION: i64 = 3;

pub fn append_only(entity: &str) -> Option<&'static AppendOnly> {
    APPEND_ONLY.iter().find(|a| a.entity == entity)
}

/// `APPEND_ONLY` as an SQL list literal, for `entity IN (...)`.
pub fn append_only_sql_list() -> String {
    APPEND_ONLY
        .iter()
        .map(|a| format!("'{}'", a.entity))
        .collect::<Vec<_>>()
        .join(",")
}
