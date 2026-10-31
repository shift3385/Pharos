//! Immutable case revisions (DAT-02, ADR-0011). Every state a case reaches has
//! one row in `test_case_revisions`, the current one included, with a
//! deterministic id: `UUIDv5(NS, case ‖ revision ‖ sha256(JCS(content)))`
//! (`steps.rs`). The same content on two devices is the same row, and two
//! divergent "revision 4" are two rows.
//!
//! `ensure_current` is the only writer of local rows. Every path that gives a
//! case a new state calls it: create, update, key finalization and key
//! conflicts, conflict resolution, pull, and the 0021 data migration. With
//! `push` it also queues the row as an `append_only` document
//! (`test_case_revision`, `sync_class.rs`); a pulled state does not, because
//! the device that made it pushes the same row.
//!
//! Rows written before 0.2.0 (the previous states `update_case` used to copy,
//! with random ids and `content_sha256` NULL) stay as they are and never sync.

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

use crate::journal;
use crate::oplog;
use crate::steps;

pub const ENTITY: &str = "test_case_revision";

struct CaseState {
    workspace_id: String,
    project_id: Option<String>,
    scenario_id: String,
    title: String,
    version: String,
    status: String,
    priority: String,
    data: Value,
    revision: i64,
}

fn case_state(conn: &Connection, case_id: &str) -> Result<Option<CaseState>, String> {
    conn.query_row(
        "SELECT workspace_id, project_id, scenario_id, title, version, status, priority, data, revision
           FROM test_cases WHERE id = ?1",
        params![case_id],
        |r| {
            Ok((
                CaseState {
                    workspace_id: r.get(0)?,
                    project_id: r.get(1)?,
                    scenario_id: r.get(2)?,
                    title: r.get(3)?,
                    version: r.get(4)?,
                    status: r.get(5)?,
                    priority: r.get(6)?,
                    data: Value::Null,
                    revision: r.get(8)?,
                },
                r.get::<_, String>(7)?,
            ))
        },
    )
    .optional()
    .map_err(|e| e.to_string())?
    .map_or(Ok(None), |(mut state, data)| match serde_json::from_str(&data) {
        Ok(value) => {
            state.data = value;
            Ok(Some(state))
        }
        // Not JSON: no content to fix in an immutable row. Logged, skipped.
        Err(_) => {
            tracing::warn!(case_id, "case data is not JSON: no revision row written");
            Ok(None)
        }
    })
}

/// `sync_state` key that marks a case purged on this device (SYNC-06).
fn purged_key(case_id: &str) -> String {
    format!("purged_case:{case_id}")
}

/// Records that the purge removed a case, so its revisions, which the server
/// keeps until SYNC-11, are not inserted again by a later pull.
pub fn remember_purged(conn: &Connection, case_id: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO sync_state (key, value) VALUES (?1, datetime('now'))",
        params![purged_key(case_id)],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Id and hash of the case's current state; None if the case does not exist.
#[cfg_attr(not(test), allow(dead_code))] // for the run items of EJE-02 (step 4) and tests
pub fn current_id(conn: &Connection, case_id: &str) -> Result<Option<(String, String)>, String> {
    Ok(case_state(conn, case_id)?.map(|c| {
        let sha = steps::content_sha256(&content_of(&c));
        (steps::revision_id(case_id, c.revision, &sha), sha)
    }))
}

fn content_of(c: &CaseState) -> Value {
    steps::revision_content(
        &c.scenario_id,
        &c.title,
        &c.version,
        &c.status,
        &c.priority,
        None,
        None,
        &c.data,
    )
}

/// Makes sure the case's current state has its revision row; returns its id
/// (None if the case does not exist). `push` queues a new row for the server.
/// `author` is the account recorded as `created_by`.
pub fn ensure_current(
    conn: &Connection,
    case_id: &str,
    author: &str,
    push: bool,
) -> Result<Option<String>, String> {
    let Some(c) = case_state(conn, case_id)? else {
        return Ok(None);
    };
    let sha = steps::content_sha256(&content_of(&c));
    let id = steps::revision_id(case_id, c.revision, &sha);
    let exists = conn
        .query_row(
            "SELECT 1 FROM test_case_revisions WHERE id = ?1",
            params![id],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .is_some();
    if exists {
        return Ok(Some(id));
    }
    let hlc = oplog::next_hlc(conn)?;
    let inserted = conn
        .execute(
            "INSERT OR IGNORE INTO test_case_revisions (id, test_case_id, revision, title, data,
                    created_at, created_by, workspace_id, project_id, scenario_id, version, status,
                    priority, case_type, automation_status, content_sha256, hlc)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), ?6, ?7, ?8, ?9, ?10, ?11, ?12, NULL, NULL, ?13, ?14)",
            params![
                id,
                case_id,
                c.revision,
                c.title,
                c.data.to_string(),
                author,
                c.workspace_id,
                c.project_id,
                c.scenario_id,
                c.version,
                c.status,
                c.priority,
                sha,
                hlc,
            ],
        )
        .map_err(|e| e.to_string())?;
    if inserted == 1 && push {
        journal::record_append(conn, ENTITY, &id, author)?;
    }
    Ok(Some(id))
}

/// `ensure_current` for a state that is not journaled (a key the server gave
/// back, a provisional key while a key conflict is open): the row stays on
/// this device, recorded as written by the case's last editor.
pub fn ensure_current_local(conn: &Connection, case_id: &str) -> Result<Option<String>, String> {
    let author: Option<String> = conn
        .query_row(
            "SELECT updated_by FROM test_cases WHERE id = ?1",
            params![case_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match author {
        Some(author) => ensure_current(conn, case_id, &author, false),
        None => Ok(None),
    }
}

/// The `test_case_revision` document pushed for a row (camelCase). Rows from
/// before 0.2.0 (no hash) are never documents.
pub fn payload(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    conn.query_row(
        "SELECT r.id, r.test_case_id, coalesce(r.project_id, c.project_id), r.workspace_id, r.revision,
                r.scenario_id, r.title, r.version, r.status, r.priority, r.case_type,
                r.automation_status, r.data, r.content_sha256, r.created_at, r.created_by, r.hlc
           FROM test_case_revisions r LEFT JOIN test_cases c ON c.id = r.test_case_id
          WHERE r.id = ?1 AND r.content_sha256 IS NOT NULL",
        params![id],
        |r| {
            let data: String = r.get(12)?;
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "testCaseId": r.get::<_, String>(1)?,
                "projectId": r.get::<_, Option<String>>(2)?,
                "workspaceId": r.get::<_, Option<String>>(3)?,
                "revision": r.get::<_, i64>(4)?,
                "scenarioId": r.get::<_, Option<String>>(5)?,
                "title": r.get::<_, String>(6)?,
                "version": r.get::<_, Option<String>>(7)?,
                "status": r.get::<_, Option<String>>(8)?,
                "priority": r.get::<_, Option<String>>(9)?,
                "caseType": r.get::<_, Option<String>>(10)?,
                "automationStatus": r.get::<_, Option<String>>(11)?,
                "data": serde_json::from_str::<Value>(&data).unwrap_or_else(|_| json!({})),
                "contentSha256": r.get::<_, String>(13)?,
                "createdAt": r.get::<_, String>(14)?,
                "createdBy": r.get::<_, String>(15)?,
                "hlc": r.get::<_, String>(16)?,
            }))
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// Stores a revision pulled for `user` unless its id is already here. A
/// document whose content does not hash to its id is skipped (logged): it
/// would not be the revision it claims to be.
pub fn insert_if_absent(conn: &Connection, user: &str, p: &Value) -> Result<(), String> {
    let s = |k: &str| p.get(k).and_then(Value::as_str);
    let (Some(id), Some(case_id), Some(revision), Some(sha)) = (
        s("id"),
        s("testCaseId"),
        p.get("revision").and_then(Value::as_i64),
        s("contentSha256"),
    ) else {
        tracing::warn!("skipped a pulled test_case_revision without its required fields");
        return Ok(());
    };
    // A case purged here (SYNC-06): its revisions stay out (SYNC-11).
    let purged = conn
        .query_row(
            "SELECT 1 FROM sync_state WHERE key = ?1",
            params![purged_key(case_id)],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .is_some();
    if purged {
        return Ok(());
    }
    let data = p.get("data").cloned().unwrap_or_else(|| json!({}));
    let content = steps::revision_content(
        s("scenarioId").unwrap_or_default(),
        s("title").unwrap_or_default(),
        s("version").unwrap_or_default(),
        s("status").unwrap_or_default(),
        s("priority").unwrap_or_default(),
        s("caseType"),
        s("automationStatus"),
        &data,
    );
    let actual = steps::content_sha256(&content);
    if actual != sha || steps::revision_id(case_id, revision, sha) != id {
        tracing::warn!(
            id,
            "skipped a pulled test_case_revision whose content does not match its id"
        );
        return Ok(());
    }
    if let Some(hlc) = s("hlc") {
        oplog::observe_hlc(conn, hlc)?;
    }
    conn.execute(
        "INSERT OR IGNORE INTO test_case_revisions (id, test_case_id, revision, title, data,
                created_at, created_by, workspace_id, project_id, scenario_id, version, status,
                priority, case_type, automation_status, content_sha256, hlc)
         VALUES (?1, ?2, ?3, ?4, ?5, coalesce(?6, datetime('now')), ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                 ?14, ?15, ?16, coalesce(?17, ''))",
        params![
            id,
            case_id,
            revision,
            s("title").unwrap_or_default(),
            data.to_string(),
            s("createdAt"),
            user,
            s("workspaceId"),
            s("projectId"),
            s("scenarioId"),
            s("version"),
            s("status"),
            s("priority"),
            s("caseType"),
            s("automationStatus"),
            sha,
            s("hlc"),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// The account a revision syncs with: the owner of its case's project.
pub fn owner(conn: &Connection, id: &str) -> Result<Option<String>, String> {
    let owner: Option<Option<String>> = conn
        .query_row(
            "SELECT p.owner_id FROM test_case_revisions r
               JOIN projects p ON p.id = coalesce(r.project_id,
                    (SELECT c.project_id FROM test_cases c WHERE c.id = r.test_case_id))
              WHERE r.id = ?1",
            params![id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(owner.flatten().filter(|o| !o.is_empty()))
}

/// Normalizes a sync payload's `data` in place (`test_case` documents of the
/// conflict panel and of the pull). True if it changed.
pub fn normalize_payload(case_id: &str, payload: &mut Value) -> bool {
    match payload.get_mut("data") {
        Some(data) => steps::normalize_case_data(case_id, data),
        None => false,
    }
}

/// A case edited while its app was read-only (review B1): the old editor
/// saved `data` without the stash the server had sent, but its previous state,
/// copied to the history by the old `update_case`, still has it. The newest
/// such stash gives the steps the user did not touch their ids back.
fn borrow_stash(conn: &Connection, case_id: &str, data: &mut Value) -> Result<(), String> {
    let Some(obj) = data.as_object_mut() else {
        return Ok(());
    };
    if obj.contains_key(steps::STASH_KEY) {
        return Ok(());
    }
    let stash: Option<String> = conn
        .query_row(
            &format!(
                "SELECT json_extract(data, '$.{}') FROM test_case_revisions
                  WHERE test_case_id = ?1 AND content_sha256 IS NULL AND json_valid(data)
                    AND json_extract(data, '$.{}') IS NOT NULL
                  ORDER BY revision DESC, rowid DESC LIMIT 1",
                steps::STASH_KEY,
                steps::STASH_KEY
            ),
            params![case_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(stash) = stash.and_then(|s| serde_json::from_str::<Value>(&s).ok()) {
        obj.insert(steps::STASH_KEY.into(), stash);
    }
    Ok(())
}

/// Data step of migration 0021 (ADR-0011, "migración de datos determinista").
/// Every case (deleted ones too) gets stable step and row ids, the test_case
/// payloads of open conflicts too, and every case gets the row of its current
/// revision, queued for the push when the case has an owner and is live (the
/// owner's other devices compute the same row, so the server keeps one).
/// `revision` does not move and no test_case change is journaled.
/// Idempotent.
pub fn migrate_stable_steps(conn: &Connection) -> Result<(), String> {
    let cases: Vec<(String, String, String, bool)> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, data, updated_by, deleted_at IS NOT NULL FROM test_cases ORDER BY id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?
    };
    for (id, data, updated_by, deleted) in cases {
        // Data that is not JSON is left as it is: nothing to give ids to.
        if let Ok(mut value) = serde_json::from_str::<Value>(&data) {
            borrow_stash(conn, &id, &mut value)?;
            if steps::normalize_case_data(&id, &mut value) {
                conn.execute(
                    "UPDATE test_cases SET data = ?2 WHERE id = ?1",
                    params![id, value.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        ensure_current(conn, &id, &updated_by, !deleted)?;
    }

    let conflicts: Vec<(String, String, String, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, entity_id, local_payload, remote_payload FROM sync_conflicts
                  WHERE entity = 'test_case' ORDER BY id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?
    };
    for (id, case_id, local, remote) in conflicts {
        for (column, text) in [("local_payload", local), ("remote_payload", remote)] {
            let Ok(mut value) = serde_json::from_str::<Value>(&text) else {
                continue;
            };
            if normalize_payload(&case_id, &mut value) {
                conn.execute(
                    &format!("UPDATE sync_conflicts SET {column} = ?2 WHERE id = ?1"),
                    params![id, value.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{ensure_workspace, run_migrations};

    const U1: &str = "u1";

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        run_migrations(&c).unwrap();
        c
    }

    fn case(c: &Connection, title: &str, revision: i64) {
        let ws = ensure_workspace(c).unwrap();
        c.execute(
            "INSERT OR IGNORE INTO projects (id, workspace_id, owner_id, name, created_by, updated_by,
                    created_at, updated_at, revision) VALUES ('p1', ?1, ?2, 'P', ?2, ?2, 'now', 'now', 1)",
            params![ws, U1],
        )
        .unwrap();
        c.execute(
            "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, author, data,
                    created_by, updated_by, created_at, updated_at, revision)
             VALUES ('c1', ?1, 'p1', 'ATS_001', ?2, 'Ada', '{\"steps\":[{\"id\":\"A\",\"text\":\"x\"}]}',
                    ?3, ?3, 'now', 'now', ?4)
             ON CONFLICT(id) DO UPDATE SET title = excluded.title, revision = excluded.revision",
            params![ws, title, U1, revision],
        )
        .unwrap();
    }

    fn pending_appends(c: &Connection) -> i64 {
        c.query_row(
            "SELECT count(*) FROM oplog WHERE entity = 'test_case_revision' AND op = 'append'",
            [],
            |r| r.get(0),
        )
        .unwrap()
    }

    #[test]
    fn ensure_current_writes_one_row_per_state_and_queues_it_once() {
        let c = conn();
        case(&c, "t", 1);
        let first = ensure_current(&c, "c1", U1, true).unwrap().unwrap();
        assert_eq!(ensure_current(&c, "c1", U1, true).unwrap().unwrap(), first);
        assert_eq!(pending_appends(&c), 1);
        case(&c, "t2", 2);
        let second = ensure_current(&c, "c1", U1, true).unwrap().unwrap();
        assert_ne!(first, second);
        assert_eq!(pending_appends(&c), 2);
        let p = payload(&c, &second).unwrap().unwrap();
        assert_eq!(p["revision"], 2);
        assert_eq!(p["title"], "t2");
        assert_eq!(owner(&c, &second).unwrap().as_deref(), Some(U1));
    }

    #[test]
    fn a_pulled_state_is_not_queued() {
        let c = conn();
        case(&c, "t", 1);
        ensure_current(&c, "c1", U1, false).unwrap();
        assert_eq!(pending_appends(&c), 0);
    }

    #[test]
    fn a_pulled_revision_is_inserted_once_and_only_if_it_matches_its_id() {
        let src = conn();
        case(&src, "t", 1);
        let id = ensure_current(&src, "c1", U1, true).unwrap().unwrap();
        let doc = payload(&src, &id).unwrap().unwrap();

        let dst = conn();
        insert_if_absent(&dst, U1, &doc).unwrap();
        insert_if_absent(&dst, U1, &doc).unwrap();
        let n: i64 = dst
            .query_row("SELECT count(*) FROM test_case_revisions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
        assert_eq!(payload(&dst, &id).unwrap().unwrap()["data"], doc["data"]);

        let mut forged = doc.clone();
        forged["id"] = json!("00000000-0000-5000-8000-000000000000");
        forged["title"] = json!("changed");
        insert_if_absent(&dst, U1, &forged).unwrap();
        let n: i64 = dst
            .query_row("SELECT count(*) FROM test_case_revisions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1, "a document that does not hash to its id is skipped");
    }

    #[test]
    fn a_purged_cases_revisions_do_not_come_back() {
        let src = conn();
        case(&src, "t", 1);
        let id = ensure_current(&src, "c1", U1, true).unwrap().unwrap();
        let doc = payload(&src, &id).unwrap().unwrap();
        let dst = conn();
        remember_purged(&dst, "c1").unwrap();
        insert_if_absent(&dst, U1, &doc).unwrap();
        let n: i64 = dst
            .query_row("SELECT count(*) FROM test_case_revisions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0, "purged here: stays out until SYNC-11");
    }

    #[test]
    fn unparseable_case_data_writes_no_revision() {
        let c = conn();
        case(&c, "t", 1);
        c.execute(
            "UPDATE test_cases SET data = 'not json' WHERE id = 'c1'",
            [],
        )
        .unwrap();
        assert_eq!(ensure_current(&c, "c1", U1, true).unwrap(), None);
    }

    #[test]
    fn legacy_rows_are_never_documents() {
        let c = conn();
        case(&c, "t", 2);
        c.execute(
            "INSERT INTO test_case_revisions (id, test_case_id, revision, title, data, created_at, created_by)
             VALUES ('old', 'c1', 1, 't', '{}', 'now', 'u1')",
            [],
        )
        .unwrap();
        assert!(payload(&c, "old").unwrap().is_none());
    }
}
