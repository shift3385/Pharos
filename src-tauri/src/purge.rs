//! Purge of soft-deleted rows (SYNC-06). A row deleted more than N days ago
//! (Administration → retention, per device) is removed for good, together with
//! its history, attachments, journal rows, sync bases and resolved conflicts.
//!
//! It must never let a record come back nor lose a change the server has not
//! seen:
//! - the server keeps the tombstone, so a pull of it later is a no-op on a
//!   missing row (`sync::write_doc` updates nothing);
//! - a row with an open conflict is kept until the user resolves it;
//! - a row with pending journal rows is kept until its delete is pushed, unless
//!   the server never knew it (no sync base, nothing ever synced): then there
//!   is nothing to tell the server and the pending rows go too;
//! - a child of a project whose delete is still pending or in conflict is kept,
//!   because resolving that conflict may restore the project with its children;
//! - keys of purged cases, requirements and defects stay taken
//!   (`keys::retire`, ADR-0010), so they are never handed out again.
//!
//! Only the signed-in account's rows are purged (FIX-07/08): rows of projects
//! it owns, its planner cards and its templates. Built-in templates are never
//! purged.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;
#[cfg(test)]
use ts_rs::TS;

use crate::db::Db;
use crate::keys::{self, KeyKind};
use crate::oplog;

/// Retention bounds, the same as the Administration setting.
const MIN_DAYS: i64 = 1;
const MAX_DAYS: i64 = 3650;

/// Rows removed by one purge, per kind.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Default, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PurgeSummary {
    pub(crate) projects: usize,
    pub(crate) test_plans: usize,
    pub(crate) test_cases: usize,
    pub(crate) requirements: usize,
    pub(crate) planner_cards: usize,
    /// Runs, run items and unlinked mappings (EJE-01); a run takes its shards,
    /// results and step results with it.
    pub(crate) runs: usize,
    pub(crate) templates: usize,
}

impl PurgeSummary {
    fn total(&self) -> usize {
        self.projects
            + self.test_plans
            + self.test_cases
            + self.requirements
            + self.planner_cards
            + self.runs
            + self.templates
    }
}

/// A purge candidate: id, project id and key ('' when the row has none).
type Candidate = (String, String, String);

fn exists(conn: &Connection, sql: &str, p: &[&dyn rusqlite::ToSql]) -> Result<bool, String> {
    conn.query_row(sql, p, |_| Ok(()))
        .optional()
        .map_err(|e| e.to_string())
        .map(|r| r.is_some())
}

/// True when the entity must wait: an open conflict, or a pending change the
/// server has to receive first.
fn held(conn: &Connection, entity: &str, id: &str) -> Result<bool, String> {
    if exists(
        conn,
        "SELECT 1 FROM sync_conflicts WHERE entity = ?1 AND entity_id = ?2 AND resolved_at IS NULL",
        &[&entity, &id],
    )? {
        return Ok(true);
    }
    let pending = exists(
        conn,
        "SELECT 1 FROM oplog WHERE entity = ?1 AND entity_id = ?2 AND synced_at IS NULL",
        &[&entity, &id],
    )?;
    Ok(pending && oplog::known_to_server(conn, entity, id)?)
}

/// Removes everything this device keeps about one entity besides its row:
/// journal, sync bases, conflicts of version and of key.
fn forget(conn: &Connection, entity: &str, id: &str) -> Result<(), String> {
    for sql in [
        "DELETE FROM oplog WHERE entity = ?1 AND entity_id = ?2",
        "DELETE FROM sync_base WHERE entity = ?1 AND entity_id = ?2",
        "DELETE FROM sync_conflicts WHERE entity = ?1 AND entity_id = ?2",
        "DELETE FROM key_conflicts WHERE entity = ?1 AND entity_id = ?2",
    ] {
        conn.execute(sql, params![entity, id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn candidates(
    conn: &Connection,
    sql: &str,
    user: &str,
    days: i64,
) -> Result<Vec<Candidate>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![user, days], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                r.get::<_, Option<String>>(2)?.unwrap_or_default(),
            ))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())
}

/// `deleted_at` older than `?2` days. `julianday` reads both the
/// `datetime('now')` and the ISO formats.
const EXPIRED: &str =
    "x.deleted_at IS NOT NULL AND julianday(x.deleted_at) <= julianday('now') - ?2";

/// One kind of child row of a project.
struct Child {
    entity: &'static str,
    table: &'static str,
    /// Key column and kind, when the row carries a human-readable key.
    key: Option<(&'static str, KeyKind)>,
    /// History, attachment or result rows to clear first: DELETEs taking the
    /// row id.
    dependents: &'static [&'static str],
}

const CHILDREN: [Child; 7] = [
    Child {
        entity: "test_plan",
        table: "test_plans",
        key: None,
        dependents: &["DELETE FROM test_plan_revisions WHERE test_plan_id = ?1"],
    },
    Child {
        entity: "test_case",
        table: "test_cases",
        key: Some(("scenario_id", KeyKind::Case)),
        dependents: &["DELETE FROM test_case_revisions WHERE test_case_id = ?1"],
    },
    Child {
        entity: "requirement",
        table: "requirements",
        key: Some(("requirement_key", KeyKind::Requirement)),
        dependents: &[],
    },
    Child {
        entity: "planner_card",
        table: "planner_cards",
        key: Some(("card_key", KeyKind::Defect)),
        // Its files go with the next evidence collection (ADR-0014).
        dependents: &["DELETE FROM attachments WHERE owner_entity = 'planner_card' AND owner_id = ?1"],
    },
    // The immutable rows of a run (EJE-01) go only here, with their run: the
    // purge is the one code path that deletes them.
    Child {
        entity: "run",
        table: "runs",
        key: Some(("run_key", KeyKind::Run)),
        dependents: &[
            "DELETE FROM step_results WHERE result_id IN (SELECT id FROM results WHERE run_id = ?1)",
            "DELETE FROM results WHERE run_id = ?1",
            "DELETE FROM run_shards WHERE run_id = ?1",
        ],
    },
    Child {
        entity: "run_item",
        table: "run_items",
        key: None,
        dependents: &["DELETE FROM execution_drafts WHERE run_item_id = ?1"],
    },
    Child {
        entity: "unlinked_mapping",
        table: "unlinked_mappings",
        key: None,
        dependents: &[],
    },
];

fn purge_children(
    conn: &Connection,
    user: &str,
    days: i64,
    child: &Child,
) -> Result<usize, String> {
    let key_col = child
        .key
        .map_or("NULL".to_string(), |k| format!("x.{}", k.0));
    // Planner cards belong to their owner; the other children to the owner of
    // their project (oplog::owner_of).
    let owned = if child.table == "planner_cards" {
        "x.owner_id = ?1"
    } else {
        "x.project_id IN (SELECT id FROM projects WHERE owner_id = ?1)"
    };
    let sql = format!(
        "SELECT x.id, x.project_id, {key_col} FROM {} x WHERE {owned} AND {EXPIRED}",
        child.table
    );
    let mut purged = 0;
    for (id, project_id, key) in candidates(conn, &sql, user, days)? {
        if held(conn, child.entity, &id)? || held(conn, "project", &project_id)? {
            continue;
        }
        // A run whose shards or results have not reached the server yet
        // waits for them, like a pending change of its own.
        if child.entity == "run"
            && crate::runs::has_pending_appends(conn, &id)?
            && oplog::known_to_server(conn, "run", &id)?
        {
            continue;
        }
        if child.entity == "run" {
            // Its shards and results leave their journal rows too.
            for (entity, child_id) in crate::runs::appended_rows(conn, &id)? {
                forget(conn, entity, &child_id)?;
            }
        }
        if let Some((_, kind)) = child.key {
            let (prefix, _) = keys::numbering(conn, kind, &project_id)?;
            keys::retire(conn, kind, &project_id, &prefix, &key)?;
        }
        for sql in child.dependents {
            conn.execute(sql, params![id]).map_err(|e| e.to_string())?;
        }
        conn.execute(
            &format!("DELETE FROM {} WHERE id = ?1", child.table),
            params![id],
        )
        .map_err(|e| e.to_string())?;
        forget(conn, child.entity, &id)?;
        if child.entity == "test_case" {
            // Its revisions stay on the server until SYNC-11: a re-pull must
            // not bring them back here (DAT-02).
            crate::revisions::remember_purged(conn, &id)?;
        }
        if child.entity == "run" {
            // Its shards and results stay on the server (append-only): a
            // re-pull must not bring them back here.
            crate::runs::remember_purged(conn, &id)?;
        }
        purged += 1;
    }
    Ok(purged)
}

/// Shards and results (and their step results) without a run whose project is
/// gone, or deleted and past the retention, and older than it themselves: a
/// pull can bring a result before its run, so only stale ones go. Journal
/// rows go with them. Returns how many results and shards were removed.
fn purge_orphan_results(conn: &Connection, user: &str, days: i64) -> Result<usize, String> {
    let lost = "x.run_id NOT IN (SELECT id FROM runs)
         AND (x.project_id NOT IN (SELECT id FROM projects)
              OR x.project_id IN (SELECT id FROM projects p WHERE p.owner_id = ?1
                                  AND p.deleted_at IS NOT NULL
                                  AND julianday(p.deleted_at) <= julianday('now') - ?2))";
    let mut purged = 0;
    for (entity, table, at) in [
        ("result", "results", "created_at"),
        ("run_shard", "run_shards", "imported_at"),
    ] {
        let sql = format!(
            "SELECT x.id, x.project_id, NULL FROM {table} x
              WHERE {lost} AND julianday(x.{at}) <= julianday('now') - ?2"
        );
        for (id, _, _) in candidates(conn, &sql, user, days)? {
            if entity == "result" {
                conn.execute("DELETE FROM step_results WHERE result_id = ?1", params![id])
                    .map_err(|e| e.to_string())?;
            }
            conn.execute(&format!("DELETE FROM {table} WHERE id = ?1"), params![id])
                .map_err(|e| e.to_string())?;
            forget(conn, entity, &id)?;
            purged += 1;
        }
    }
    Ok(purged)
}

/// A deleted project goes once nothing of it is left (its children are purged
/// first, in the same run). Its key counters stay: they cost nothing and keep
/// its numbers used if the project ever came back.
fn purge_projects(conn: &Connection, user: &str, days: i64) -> Result<usize, String> {
    let sql =
        format!("SELECT x.id, NULL, NULL FROM projects x WHERE x.owner_id = ?1 AND {EXPIRED}");
    let mut purged = 0;
    for (id, _, _) in candidates(conn, &sql, user, days)? {
        let has_rows = CHILDREN.iter().try_fold(false, |found, c| {
            if found {
                return Ok::<_, String>(true);
            }
            exists(
                conn,
                &format!("SELECT 1 FROM {} WHERE project_id = ?1 LIMIT 1", c.table),
                &[&id],
            )
        })?;
        if has_rows || held(conn, "project", &id)? {
            continue;
        }
        conn.execute(
            "DELETE FROM project_members WHERE project_id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM projects WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        forget(conn, "project", &id)?;
        purged += 1;
    }
    Ok(purged)
}

/// Templates do not sync yet (SYNC-04b), so their journal rows never leave
/// this device and never hold a purge.
fn purge_templates(conn: &Connection, user: &str, days: i64) -> Result<usize, String> {
    let sql = format!(
        "SELECT x.id, NULL, NULL FROM templates x WHERE x.owner_id = ?1 AND x.is_builtin = 0 AND {EXPIRED}"
    );
    let mut purged = 0;
    for (id, _, _) in candidates(conn, &sql, user, days)? {
        conn.execute("DELETE FROM templates WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        forget(conn, "template", &id)?;
        purged += 1;
    }
    Ok(purged)
}

/// Purges the account's rows deleted more than `days` days ago (clamped to the
/// Administration bounds).
pub(crate) fn purge(conn: &Connection, user: &str, days: i64) -> Result<PurgeSummary, String> {
    if user.is_empty() {
        return Err("not-authenticated".into());
    }
    let days = days.clamp(MIN_DAYS, MAX_DAYS);
    let mut counts = [0usize; CHILDREN.len()];
    for (n, child) in counts.iter_mut().zip(CHILDREN.iter()) {
        *n = purge_children(conn, user, days, child)?;
    }
    let [test_plans, test_cases, requirements, planner_cards, runs, run_items, mappings] = counts;
    Ok(PurgeSummary {
        test_plans,
        test_cases,
        requirements,
        planner_cards,
        runs: runs + run_items + mappings + purge_orphan_results(conn, user, days)?,
        projects: purge_projects(conn, user, days)?,
        templates: purge_templates(conn, user, days)?,
    })
}

/// Evidence side of the purge (ADR-0014): the account's attachments deleted
/// more than `days` days ago go for good, contents whose retention passed
/// expire (`evidence::expire`), and every content no live attachment needs is
/// released for `collect`. Returns how many attachment rows changed.
pub(crate) fn purge_evidence(conn: &Connection, user: &str, days: i64) -> Result<usize, String> {
    let days = days.clamp(MIN_DAYS, MAX_DAYS);
    let removed = conn
        .execute(
            &format!(
                "DELETE FROM attachments AS x WHERE x.owner_entity = 'planner_card' \
                 AND x.owner_id IN (SELECT id FROM planner_cards WHERE owner_id = ?1) AND {EXPIRED}"
            ),
            params![user, days],
        )
        .map_err(|e| e.to_string())?;
    let expired = crate::evidence::expire(conn)?;
    crate::evidence::release_unreferenced(conn)?;
    Ok(removed + expired)
}

/// Runs the purge for the signed-in account in one transaction; saves the
/// database only when something was removed, then removes the evidence files
/// nothing needs any more.
#[tauri::command]
pub fn purge_deleted(
    db: State<Db>,
    user_id: String,
    retention_days: i64,
) -> Result<PurgeSummary, String> {
    let summary = db.with_conn(|conn| {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        let summary = purge(&tx, &user_id, retention_days)?;
        let evidence = purge_evidence(&tx, &user_id, retention_days)?;
        let released = crate::evidence::has_pending_deletions(&tx)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok((summary, evidence > 0 || released))
    })?;
    let (summary, evidence_changed) = summary;
    if summary.total() > 0 || evidence_changed {
        db.persist_and_collect()?;
    }
    Ok(summary)
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

    fn project(c: &Connection, id: &str, owner: &str) {
        let ws = crate::db::ensure_workspace(c).unwrap();
        c.execute(
            "INSERT INTO projects (id, workspace_id, owner_id, name, created_by, updated_by, \
             created_at, updated_at) VALUES (?1, ?2, ?3, 'P', ?3, ?3, 'now', 'now')",
            params![id, ws, owner],
        )
        .unwrap();
    }

    /// A case of `project` deleted `days_ago` days ago (None: live), with one
    /// history row.
    fn case(c: &Connection, id: &str, project: &str, key: &str, days_ago: Option<i64>) {
        let ws = crate::db::ensure_workspace(c).unwrap();
        c.execute(
            "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, author, \
             created_by, updated_by, created_at, updated_at, deleted_at) \
             VALUES (?1, ?2, ?3, ?4, 't', 'a', 'a', 'a', 'now', 'now', \
                     CASE WHEN ?5 IS NULL THEN NULL ELSE datetime('now', '-' || ?5 || ' days') END)",
            params![id, ws, project, key, days_ago],
        )
        .unwrap();
        c.execute(
            "INSERT INTO test_case_revisions (id, test_case_id, revision, title, data, created_at, \
             created_by) VALUES (?1 || '-r1', ?1, 1, 't', '{}', 'now', 'a')",
            params![id],
        )
        .unwrap();
    }

    fn count(c: &Connection, sql: &str) -> i64 {
        c.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    fn alive(c: &Connection, id: &str) -> bool {
        count(
            c,
            &format!("SELECT count(*) FROM test_cases WHERE id = '{id}'"),
        ) == 1
    }

    /// The entity's delete was pushed: a synced journal row and a sync base.
    fn synced(c: &Connection, entity: &str, id: &str) {
        oplog::record(c, entity, id, "delete", "{}", 2, "a").unwrap();
        c.execute(
            "UPDATE oplog SET synced_at = 'now' WHERE entity_id = ?1",
            params![id],
        )
        .unwrap();
        c.execute(
            "INSERT OR REPLACE INTO sync_base (user_id, entity, entity_id, revision, hlc) \
             VALUES (?1, ?2, ?3, 2, '')",
            params![A, entity, id],
        )
        .unwrap();
    }

    #[test]
    fn removes_only_rows_deleted_before_the_retention() {
        let c = conn();
        project(&c, "p1", A);
        case(&c, "old", "p1", "ATS_001", Some(31));
        case(&c, "recent", "p1", "ATS_002", Some(5));
        case(&c, "live", "p1", "ATS_003", None);
        synced(&c, "test_case", "old");

        let s = purge(&c, A, 30).unwrap();
        assert_eq!(s.test_cases, 1);
        assert!(!alive(&c, "old"));
        assert!(alive(&c, "recent") && alive(&c, "live"));
        // History, journal and sync base of the purged case are gone too.
        assert_eq!(
            count(
                &c,
                "SELECT count(*) FROM test_case_revisions WHERE test_case_id = 'old'"
            ),
            0
        );
        assert_eq!(
            count(&c, "SELECT count(*) FROM oplog WHERE entity_id = 'old'"),
            0
        );
        assert_eq!(
            count(&c, "SELECT count(*) FROM sync_base WHERE entity_id = 'old'"),
            0
        );
        // A second run has nothing left to do.
        assert_eq!(purge(&c, A, 30).unwrap(), PurgeSummary::default());
    }

    #[test]
    fn waits_until_the_server_has_the_delete() {
        let c = conn();
        project(&c, "p1", A);
        case(&c, "c1", "p1", "ATS_001", Some(40));
        synced(&c, "test_case", "c1");
        // Deleted again after a restore: the new delete is still pending.
        oplog::record(&c, "test_case", "c1", "delete", "{}", 3, "a").unwrap();
        assert_eq!(purge(&c, A, 30).unwrap().test_cases, 0);
        assert!(alive(&c, "c1"));

        c.execute("UPDATE oplog SET synced_at = 'now'", []).unwrap();
        assert_eq!(purge(&c, A, 30).unwrap().test_cases, 1);
    }

    #[test]
    fn a_row_the_server_never_saw_goes_with_its_pending_changes() {
        let c = conn();
        project(&c, "p1", A);
        case(&c, "local", "p1", "ATS_001", Some(40));
        oplog::record(&c, "test_case", "local", "upsert", "{}", 1, "a").unwrap();
        oplog::record(&c, "test_case", "local", "delete", "{}", 2, "a").unwrap();
        assert_eq!(purge(&c, A, 30).unwrap().test_cases, 1);
        assert_eq!(count(&c, "SELECT count(*) FROM oplog"), 0);
    }

    #[test]
    fn keeps_a_row_with_an_open_conflict() {
        let c = conn();
        project(&c, "p1", A);
        case(&c, "c1", "p1", "ATS_001", Some(40));
        synced(&c, "test_case", "c1");
        c.execute(
            "INSERT INTO sync_conflicts (id, entity, entity_id, detected_at, user_id) \
             VALUES ('k', 'test_case', 'c1', 'now', ?1)",
            [A],
        )
        .unwrap();
        assert_eq!(purge(&c, A, 30).unwrap().test_cases, 0);
        c.execute(
            "UPDATE sync_conflicts SET resolved_at = 'now', resolution = 'local'",
            [],
        )
        .unwrap();
        assert_eq!(purge(&c, A, 30).unwrap().test_cases, 1);
        assert_eq!(
            count(&c, "SELECT count(*) FROM sync_conflicts"),
            0,
            "the resolved copy goes too"
        );
    }

    #[test]
    fn a_deleted_project_goes_with_its_children_but_not_while_its_delete_is_pending() {
        let c = conn();
        project(&c, "p1", A);
        case(&c, "c1", "p1", "ATS_001", Some(40));
        c.execute(
            "UPDATE projects SET deleted_at = datetime('now', '-40 days') WHERE id = 'p1'",
            [],
        )
        .unwrap();
        c.execute(
            "INSERT INTO project_members (project_id, user_id, role) VALUES ('p1', ?1, 'owner')",
            [A],
        )
        .unwrap();
        synced(&c, "project", "p1");
        // The project's delete is pending (a conflict may still restore it).
        oplog::record(&c, "project", "p1", "delete", "{}", 3, "a").unwrap();
        assert_eq!(purge(&c, A, 30).unwrap(), PurgeSummary::default());
        assert!(alive(&c, "c1"));

        c.execute("UPDATE oplog SET synced_at = 'now'", []).unwrap();
        let s = purge(&c, A, 30).unwrap();
        assert_eq!((s.projects, s.test_cases), (1, 1));
        assert_eq!(count(&c, "SELECT count(*) FROM projects"), 0);
        assert_eq!(count(&c, "SELECT count(*) FROM project_members"), 0);
    }

    #[test]
    fn only_the_signed_in_accounts_rows() {
        let c = conn();
        project(&c, "pa", A);
        project(&c, "pb", B);
        case(&c, "ca", "pa", "ATS_001", Some(40));
        case(&c, "cb", "pb", "ATS_001", Some(40));
        assert_eq!(purge(&c, A, 30).unwrap().test_cases, 1);
        assert!(!alive(&c, "ca"));
        assert!(alive(&c, "cb"), "the other account keeps its row");
        assert_eq!(purge(&c, "", 30).unwrap_err(), "not-authenticated");
    }

    #[test]
    fn a_purged_key_is_never_handed_out_or_accepted_again() {
        let c = conn();
        project(&c, "p1", A);
        case(&c, "c9", "p1", "ATS_009", Some(40));
        purge(&c, A, 30).unwrap();
        assert!(keys::taken(&c, KeyKind::Case, "p1", "ATS_009").unwrap());
        assert_eq!(
            keys::allocate(&c, KeyKind::Case, "p1", "ATS_", 3).unwrap(),
            "ATS_010"
        );
    }

    #[test]
    fn templates_and_defects_are_purged_too() {
        let c = conn();
        project(&c, "p1", A);
        let ws = crate::db::ensure_workspace(&c).unwrap();
        c.execute(
            "INSERT INTO templates (id, workspace_id, kind, language, name, file, is_builtin, \
             owner_id, created_at, updated_at, deleted_at) VALUES \
             ('t-mine', ?1, 'case', 'es', 'T', x'00', 0, ?2, 'now', 'now', datetime('now', '-40 days')), \
             ('t-builtin', ?1, 'case', 'es', 'T', x'00', 1, NULL, 'now', 'now', datetime('now', '-40 days'))",
            params![ws, A],
        )
        .unwrap();
        c.execute(
            "INSERT INTO planner_cards (id, workspace_id, project_id, owner_id, kind, card_key, title, \
             created_by, updated_by, created_at, updated_at, deleted_at) \
             VALUES ('d1', ?1, 'p1', ?2, 'defect', 'DEF-004', 't', 'a', 'a', 'now', 'now', \
                     datetime('now', '-40 days'))",
            params![ws, A],
        )
        .unwrap();
        c.execute(
            "INSERT INTO attachments (id, workspace_id, project_id, sha256, size, name, owner_entity, \
             owner_id, created_by, updated_by, created_at, updated_at) \
             VALUES ('at', ?1, 'p1', 'aa', 1, 'x', 'planner_card', 'd1', 'a', 'a', 'now', 'now')",
            params![ws],
        )
        .unwrap();
        let s = purge(&c, A, 30).unwrap();
        assert_eq!((s.templates, s.planner_cards), (1, 1));
        assert_eq!(
            count(&c, "SELECT count(*) FROM templates"),
            1,
            "the built-in one stays"
        );
        assert_eq!(count(&c, "SELECT count(*) FROM attachments"), 0);
        assert!(keys::taken(&c, KeyKind::Defect, "p1", "DEF-004").unwrap());
    }

    #[test]
    fn a_purged_row_leaves_no_key_conflict_behind() {
        // A never-pushed case lost its key on a pull, then was deleted.
        let c = conn();
        project(&c, "p1", A);
        case(&c, "c1", "p1", "ATS_001", None);
        oplog::record(&c, "test_case", "c1", "upsert", "{}", 1, "a").unwrap();
        crate::key_sync::vacate(&c, A, "test_case", "c1", "remote").unwrap();
        assert_eq!(oplog::sync_state(&c, A).unwrap().conflicts, 1);
        c.execute(
            "UPDATE test_cases SET deleted_at = datetime('now', '-40 days') WHERE id = 'c1'",
            [],
        )
        .unwrap();
        // Deleted: its key no longer matters (the delete itself can sync).
        assert_eq!(oplog::sync_state(&c, A).unwrap().conflicts, 0);
        assert!(crate::key_sync::list(&c, A).unwrap().is_empty());

        assert_eq!(purge(&c, A, 30).unwrap().test_cases, 1);
        assert_eq!(count(&c, "SELECT count(*) FROM key_conflicts"), 0);
    }

    #[test]
    fn retention_is_clamped() {
        let c = conn();
        project(&c, "p1", A);
        case(&c, "today", "p1", "ATS_001", Some(0));
        // 0 days would purge what was deleted a moment ago; the floor is 1 day.
        assert_eq!(purge(&c, A, 0).unwrap().test_cases, 0);
        assert!(alive(&c, "today"));
    }
}
