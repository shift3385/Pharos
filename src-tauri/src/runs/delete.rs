//! Deleting a run (EJE-07, ADR-0013 «Implementación (EJE-07)»): a logical
//! delete with one audit event. The run and its items become tombstones (lww,
//! they sync like any other delete); its drafts and their files are
//! discarded. Its shards, results and step results are **never** touched:
//! they are append-only, stay as they are (here and on the server) and every
//! reader hides them through their run (`runs.deleted_at IS NULL`). The purge
//! takes them with the run once the Administration retention passes
//! (`purge.rs`, `CHILDREN["run"]`, `purged_run:`).
//!
//! A run of a closed cycle cannot be deleted (`cycle-closed`), like it cannot
//! be reopened: a closed cycle is a frozen record. Anything that would write
//! into a deleted run is refused with `run-deleted`.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::json;
use tauri::State;
#[cfg(test)]
use ts_rs::TS;

use super::{err, owned_run, RUN, RUN_ITEM};
use crate::db::Db;
use crate::journal::{self, Action, Actor, Audit, Change};

#[cfg(test)]
mod tests;

/// Error of anything that would write into a deleted run.
pub const RUN_DELETED: &str = "run-deleted";

/// What deleting a run hides, for the confirmation dialog.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunDeletePreview {
    pub run_key: String,
    pub title: String,
    /// Live items of the run.
    pub items: i64,
    /// Attempts (results) of the run.
    pub results: i64,
    /// Imports (shards) of the run.
    pub imports: i64,
    /// Live evidence rows of its results, step results and raw reports.
    pub attachments: i64,
    /// Items with a manual-execution draft (discarded by the delete).
    pub drafts: i64,
    /// The run's cycle, if it is still live.
    pub cycle: Option<RunDeleteCycle>,
    /// Live defect links pointing at one of its results.
    pub linked_defects: i64,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunDeleteCycle {
    pub cycle_key: String,
    pub title: String,
    pub closed: bool,
}

/// `run-deleted` if `run_id` is a deleted run of a live project `user` owns.
/// The callers use it to tell a deleted run from one that does not exist.
pub(crate) fn deleted_error(conn: &Connection, run_id: &str, user: &str) -> Option<String> {
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM runs r JOIN projects p ON p.id = r.project_id
                         WHERE r.id = ?1 AND p.owner_id = ?2 AND r.deleted_at IS NOT NULL
                           AND p.deleted_at IS NULL)",
        params![run_id, user],
        |r| r.get::<_, bool>(0),
    )
    .ok()
    .filter(|deleted| *deleted)
    .map(|_| RUN_DELETED.to_string())
}

/// `run-deleted` if the item belongs to a deleted run (the item itself is a
/// tombstone then too), else `run item not found`.
pub(crate) fn missing_item_error(conn: &Connection, run_item_id: &str, user: &str) -> String {
    let run: Option<String> = conn
        .query_row(
            "SELECT run_id FROM run_items WHERE id = ?1",
            params![run_item_id],
            |r| r.get(0),
        )
        .optional()
        .ok()
        .flatten();
    run.and_then(|run| deleted_error(conn, &run, user))
        .unwrap_or_else(|| "run item not found".to_string())
}

fn count(conn: &Connection, sql: &str, run_id: &str) -> Result<i64, String> {
    conn.query_row(sql, params![run_id], |r| r.get(0))
        .map_err(err)
}

/// The live cycle of a run, with whether it is closed.
fn cycle_of(conn: &Connection, run_id: &str) -> Result<Option<RunDeleteCycle>, String> {
    conn.query_row(
        "SELECT c.cycle_key, c.title, c.status = 'closed' FROM runs r
           JOIN test_cycles c ON c.id = r.cycle_id
          WHERE r.id = ?1 AND c.deleted_at IS NULL",
        params![run_id],
        |r| {
            Ok(RunDeleteCycle {
                cycle_key: r.get(0)?,
                title: r.get(1)?,
                closed: r.get(2)?,
            })
        },
    )
    .optional()
    .map_err(err)
}

/// What deleting the run would hide (see `RunDeletePreview`).
pub(crate) fn preview(
    conn: &Connection,
    run_id: &str,
    user: &str,
) -> Result<RunDeletePreview, String> {
    owned_run(conn, run_id, user)?;
    let (run_key, title): (String, String) = conn
        .query_row(
            "SELECT run_key, title FROM runs WHERE id = ?1",
            params![run_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(err)?;
    Ok(RunDeletePreview {
        run_key,
        title,
        items: count(
            conn,
            "SELECT count(*) FROM run_items WHERE run_id = ?1 AND deleted_at IS NULL",
            run_id,
        )?,
        results: count(
            conn,
            "SELECT count(*) FROM results WHERE run_id = ?1",
            run_id,
        )?,
        imports: count(
            conn,
            "SELECT count(*) FROM run_shards WHERE run_id = ?1",
            run_id,
        )?,
        attachments: count(
            conn,
            "SELECT count(*) FROM attachments a
              WHERE a.deleted_at IS NULL AND (
                    (a.owner_entity = 'result'
                      AND a.owner_id IN (SELECT id FROM results WHERE run_id = ?1))
                 OR (a.owner_entity = 'step_result'
                      AND a.owner_id IN (SELECT s.id FROM step_results s
                                           JOIN results x ON x.id = s.result_id
                                          WHERE x.run_id = ?1))
                 OR (a.owner_entity = 'run_shard'
                      AND a.owner_id IN (SELECT id FROM run_shards WHERE run_id = ?1)))",
            run_id,
        )?,
        drafts: count(
            conn,
            "SELECT count(*) FROM execution_drafts d JOIN run_items i ON i.id = d.run_item_id
              WHERE i.run_id = ?1",
            run_id,
        )?,
        cycle: cycle_of(conn, run_id)?,
        linked_defects: count(
            conn,
            "SELECT count(*) FROM defect_links l JOIN defects d ON d.id = l.defect_id
              WHERE l.deleted_at IS NULL AND d.deleted_at IS NULL AND l.target_kind = 'result'
                AND l.target_id IN (SELECT id FROM results WHERE run_id = ?1)",
            run_id,
        )?,
    })
}

/// Deletes a run (logically) in the caller's transaction: discards its
/// drafts, tombstones its items (folded into the run's event) and the run,
/// with one `delete` event carrying what went with it and what is hidden.
pub(crate) fn delete_run(conn: &Connection, run_id: &str, user: &str) -> Result<(), String> {
    let shown = preview(conn, run_id, user)?;
    if shown.cycle.as_ref().is_some_and(|c| c.closed) {
        return Err("cycle-closed".into());
    }
    let drafts = super::manual::discard_run_drafts(conn, run_id, user)?;
    let items: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT id FROM run_items WHERE run_id = ?1 AND deleted_at IS NULL")
            .map_err(err)?;
        let rows = stmt
            .query_map(params![run_id], |r| r.get::<_, String>(0))
            .map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)?
    };
    for item in &items {
        let revision: i64 = conn
            .query_row(
                "UPDATE run_items SET deleted_at = datetime('now'), revision = revision + 1,
                        updated_by = ?2, updated_at = datetime('now')
                  WHERE id = ?1 RETURNING revision",
                params![item, user],
                |r| r.get(0),
            )
            .map_err(err)?;
        let mut change = Change::new(
            RUN_ITEM,
            item,
            Action::Delete,
            Actor::user(user),
            "delete",
            revision,
            user,
        );
        change.audit = Audit::Folded;
        journal::record(conn, change)?;
    }
    let before = journal::snapshot(conn, RUN, run_id)?;
    let revision: i64 = conn
        .query_row(
            "UPDATE runs SET deleted_at = datetime('now'), revision = revision + 1,
                    updated_by = ?2, updated_at = datetime('now')
              WHERE id = ?1 RETURNING revision",
            params![run_id, user],
            |r| r.get(0),
        )
        .map_err(err)?;
    journal::record(
        conn,
        Change::new(
            RUN,
            run_id,
            Action::Delete,
            Actor::user(user),
            "delete",
            revision,
            user,
        )
        .before(before)
        .summary(json!({
            "cascade": { "run_items": items.len() },
            "hidden": {
                "results": shown.results,
                "shards": shown.imports,
                "attachments": shown.attachments,
            },
            "draftsDiscarded": drafts,
        })),
    )
}

// ---- commands -------------------------------------------------------------

/// What deleting a run hides (read; no event).
#[tauri::command]
pub fn run_delete_preview(
    db: State<Db>,
    run_id: String,
    user_id: String,
) -> Result<RunDeletePreview, String> {
    db.with_conn(|conn| preview(conn, &run_id, &user_id))
}

/// Deletes a run (see `delete_run`); the files of its drafts are released.
#[tauri::command]
pub fn run_delete(db: State<Db>, run_id: String, user_id: String) -> Result<(), String> {
    db.with_tx(|conn| delete_run(conn, &run_id, &user_id))?;
    db.persist_and_collect()
}
