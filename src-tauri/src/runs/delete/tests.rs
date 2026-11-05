//! Deleting a run (EJE-07): what it hides, what it never touches, what it
//! refuses afterwards, how it syncs and how the purge takes it.

use rusqlite::{params, Connection};
use serde_json::{json, Value};

use super::*;
use crate::db::{ensure_workspace, in_tx, run_migrations};
use crate::evidence::Stored;
use crate::runs::import::{self, ReportImportRequest};
use crate::runs::{
    add_items, get_run, insert_run, list_results, list_runs, record_result, update_run,
    ResultInput, RunInput, RunItemInput,
};
use crate::{cycles, project, purge, sync, test_case};

const U: &str = "11111111-1111-4111-8111-111111111111";
const SHA: &str = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

fn device() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    run_migrations(&c).unwrap();
    sync::assume_stable_steps_server(&c);
    c
}

fn new_project(c: &Connection) -> String {
    let input: project::ProjectInput = serde_json::from_value(
        json!({"name": "Auth", "ownerId": U, "caseIdPrefix": "TC-", "caseIdDigits": 3}),
    )
    .unwrap();
    project::insert_project(c, &input).unwrap()
}

fn new_case(c: &Connection, project: &str, key: &str) -> String {
    let input: test_case::TestCaseInput = serde_json::from_value(json!({
        "projectId": project, "scenarioId": key, "title": key, "author": "Ada",
        "data": {"steps": ["a", "b"]}, "userId": U
    }))
    .unwrap();
    test_case::insert_case(c, &input).unwrap()
}

fn run_input(project: &str, extra: Value) -> RunInput {
    let mut v = json!({"projectId": project, "title": "Manual", "userId": U});
    if let (Value::Object(m), Value::Object(e)) = (&mut v, extra) {
        m.extend(e);
    }
    serde_json::from_value(v).unwrap()
}

fn whole(case: &str) -> RunItemInput {
    serde_json::from_value(json!({ "testCaseId": case })).unwrap()
}

fn attempt(item: &str, status: &str) -> ResultInput {
    serde_json::from_value(json!({"runItemId": item, "status": status, "userId": U})).unwrap()
}

fn count(c: &Connection, sql: &str) -> i64 {
    c.query_row(sql, [], |r| r.get(0)).unwrap()
}

/// A manual run of one case with one recorded attempt.
fn manual_run(c: &Connection) -> (String, String, String, String) {
    let p = new_project(c);
    let case = new_case(c, &p, "TC-001");
    let run = insert_run(c, &run_input(&p, json!({}))).unwrap();
    let item = add_items(c, &run, U, &[whole(&case)]).unwrap().remove(0);
    record_result(c, &attempt(&item, "failed")).unwrap();
    (p, case, run, item)
}

/// A Pharos Run JSON: one passed result of `TC-001`, one for the tray.
fn pharos_doc() -> Value {
    json!({"schemaVersion": "1.0.0",
    "shards": [{"sourceFormat": "pharos_run_json", "normalizerVersion": 1}],
    "results": [
        {"name": "a", "testKey": "login", "status": "passed", "tags": ["@TC-001"]},
        {"name": "b", "testKey": "stray", "status": "failed", "tags": ["@TC-404"]}
    ]})
}

fn request(p: &str, extra: Value) -> ReportImportRequest {
    let mut v = json!({"projectId": p, "userId": U, "doc": pharos_doc(), "sha256": SHA,
                       "fileName": "report.json"});
    if let (Value::Object(m), Value::Object(e)) = (&mut v, extra) {
        m.extend(e);
    }
    serde_json::from_value(v).unwrap()
}

fn stored() -> Stored {
    Stored {
        sha256: SHA.into(),
        size: 10,
    }
}

fn import_into(
    c: &Connection,
    req: &ReportImportRequest,
) -> Result<import::ReportImportOutcome, String> {
    in_tx(c, |tx| import::commit(tx, req, &stored()))
}

#[test]
fn deleting_hides_the_run_and_never_touches_its_results() {
    let c = device();
    let (p, _, run, item) = manual_run(&c);
    let results = count(&c, "SELECT count(*) FROM results");
    let steps = count(&c, "SELECT count(*) FROM step_results");
    assert_eq!(results, 1);
    delete_run(&c, &run, U).unwrap();

    // Gone from every list.
    assert!(list_runs(&c, &p, U).unwrap().is_empty());
    assert!(get_run(&c, &run, U).unwrap().is_none());
    assert!(list_results(&c, &run, U).unwrap().is_empty());
    assert!(import::run_counts(&c, &p, U).unwrap().is_empty());
    // Its results stay as they were.
    assert_eq!(count(&c, "SELECT count(*) FROM results"), results);
    assert_eq!(count(&c, "SELECT count(*) FROM step_results"), steps);
    // The run and its item are tombstones with their oplog rows.
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM run_items WHERE deleted_at IS NOT NULL"
        ),
        1
    );
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM oplog WHERE op = 'delete' AND entity IN ('run', 'run_item')"
        ),
        2
    );
    // One event for the intent, with what went and what is hidden.
    let summary: String = c
        .query_row(
            "SELECT summary FROM audit_log WHERE entity = 'run' AND action = 'delete'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let summary: Value = serde_json::from_str(&summary).unwrap();
    assert_eq!(summary["cascade"]["run_items"], 1);
    assert_eq!(summary["hidden"]["results"], 1);
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM audit_log WHERE entity = 'run_item' AND action = 'delete'"
        ),
        0
    );
    // Deleting it again: it no longer exists for the user.
    assert_eq!(delete_run(&c, &run, U).unwrap_err(), RUN_DELETED);
    let _ = item;
}

#[test]
fn a_deleted_run_refuses_records_reopening_items_and_imports() {
    let c = device();
    let (p, case, run, item) = manual_run(&c);
    let other = new_case(&c, &p, "TC-002");
    delete_run(&c, &run, U).unwrap();
    assert_eq!(
        record_result(&c, &attempt(&item, "passed")).unwrap_err(),
        RUN_DELETED
    );
    assert_eq!(
        crate::runs::manual::save_draft(&c, &item, "-/-", Some(&json!({})), U).unwrap_err(),
        RUN_DELETED
    );
    assert_eq!(
        update_run(&c, &run, &run_input(&p, json!({"status": "in_progress"}))).unwrap_err(),
        RUN_DELETED
    );
    assert_eq!(
        update_run(&c, &run, &run_input(&p, json!({"build": "2"}))).unwrap_err(),
        RUN_DELETED
    );
    assert_eq!(
        add_items(&c, &run, U, &[whole(&other)]).unwrap_err(),
        RUN_DELETED
    );
    let into_deleted = request(&p, json!({"runId": run}));
    assert_eq!(import::preview(&c, &into_deleted).unwrap_err(), RUN_DELETED);
    assert_eq!(import_into(&c, &into_deleted).unwrap_err(), RUN_DELETED);
    // An unknown run is still "not found".
    assert_eq!(
        add_items(&c, "no-such-run", U, &[whole(&case)]).unwrap_err(),
        "run not found"
    );
}

#[test]
fn a_file_of_a_deleted_run_goes_into_a_new_run_again() {
    let c = device();
    let p = new_project(&c);
    new_case(&c, &p, "TC-001");
    let first = import_into(&c, &request(&p, json!({"newRun": {"keepOpen": true}}))).unwrap();
    // While the run is live, the same file as a new run is a duplicate.
    assert!(import_into(&c, &request(&p, json!({"newRun": {}})))
        .unwrap_err()
        .starts_with("already-imported"));
    delete_run(&c, &first.run_id, U).unwrap();
    // Re-importing it into the deleted run is refused…
    assert_eq!(
        import_into(&c, &request(&p, json!({"runId": first.run_id}))).unwrap_err(),
        RUN_DELETED
    );
    // …and a new run takes it with no duplicate warning.
    let preview = import::preview(&c, &request(&p, json!({}))).unwrap();
    assert!(preview.duplicate_of.is_none());
    let again = import_into(&c, &request(&p, json!({"newRun": {}}))).unwrap();
    assert_ne!(again.run_id, first.run_id);
    assert_eq!(list_runs(&c, &p, U).unwrap().len(), 1);
    // The unlinked tray and the counts only see the live run.
    assert_eq!(import::run_counts(&c, &p, U).unwrap().len(), 1);
}

#[test]
fn deleting_discards_the_drafts_and_releases_their_files() {
    let c = device();
    let (_, _, run, item) = manual_run(&c);
    crate::runs::manual::save_draft(&c, &item, "-/-", Some(&json!({})), U).unwrap();
    crate::runs::manual::add_draft_attachment(
        &c,
        "f",
        &item,
        "-/-",
        None,
        "a.png",
        None,
        "screenshot",
        &Stored {
            sha256: "aa".repeat(32),
            size: 10,
        },
        U,
    )
    .unwrap();
    let shown = preview(&c, &run, U).unwrap();
    assert_eq!((shown.items, shown.results, shown.drafts), (1, 1, 1));
    delete_run(&c, &run, U).unwrap();
    assert_eq!(count(&c, "SELECT count(*) FROM execution_drafts"), 0);
    let state: String = c
        .query_row(
            "SELECT local_state FROM blobs WHERE sha256 = ?1",
            ["aa".repeat(32)],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(state, "deleting");
}

fn cycle_with_run(c: &Connection) -> (String, String, String, String) {
    let p = new_project(c);
    let case = new_case(c, &p, "TC-001");
    let input: cycles::TestCycleInput =
        serde_json::from_value(json!({"projectId": p, "title": "R1", "userId": U})).unwrap();
    let cycle = cycles::insert_cycle(c, &input).unwrap();
    cycles::add_items(
        c,
        &cycle,
        U,
        &[cycles::CycleItemInput {
            test_case_id: case,
            ..Default::default()
        }],
    )
    .unwrap();
    let exec_in = cycles::ExecuteInput {
        user_id: U.into(),
        ..Default::default()
    };
    let run = cycles::execute(c, &cycle, &exec_in)
        .unwrap()
        .run_ids
        .remove(0);
    let item = crate::runs::list_items(c, &run, U).unwrap().remove(0).id;
    record_result(c, &attempt(&item, "passed")).unwrap();
    (p, cycle, run, item)
}

#[test]
fn a_run_of_an_open_cycle_can_be_deleted_and_stops_counting() {
    let c = device();
    let (_, cycle, run, _) = cycle_with_run(&c);
    let before = cycles::cycle_progress(&c, &cycle, U)
        .unwrap()
        .unwrap()
        .summary;
    assert_eq!(before.passed, 1);
    let shown = preview(&c, &run, U).unwrap();
    assert_eq!(shown.cycle.as_ref().map(|c| c.closed), Some(false));
    delete_run(&c, &run, U).unwrap();
    let after = cycles::cycle_progress(&c, &cycle, U)
        .unwrap()
        .unwrap()
        .summary;
    assert_eq!((after.passed, after.not_run), (0, after.total));
}

#[test]
fn a_run_of_a_closed_cycle_cannot_be_deleted() {
    let c = device();
    let (p, cycle, run, _) = cycle_with_run(&c);
    crate::runs::manual::close_run(&c, &run, "completed", false, U).unwrap();
    let closed: cycles::TestCycleInput = serde_json::from_value(
        json!({"projectId": p, "title": "R1", "status": "closed", "userId": U}),
    )
    .unwrap();
    cycles::update_cycle(&c, &cycle, &closed).unwrap();
    assert!(preview(&c, &run, U).unwrap().cycle.unwrap().closed);
    assert_eq!(delete_run(&c, &run, U).unwrap_err(), "cycle-closed");
    assert!(get_run(&c, &run, U).unwrap().is_some());
}

// ---- sync -------------------------------------------------------------------

fn as_doc(d: &Value) -> sync::RemoteDoc {
    let revision = if d["op"] == "append" {
        json!(1)
    } else {
        d["revision"].clone()
    };
    serde_json::from_value(json!({
        "entity": d["entity"], "entityId": d["entityId"], "payload": d["payload"],
        "revision": revision, "hlc": d["hlc"], "deleted": d["op"] == "delete",
    }))
    .unwrap()
}

fn push(from: &Connection) -> Vec<Value> {
    let lww = serde_json::to_value(sync::build_pending(from, U).unwrap()).unwrap();
    let pushed: Vec<sync::PushedDelta> = serde_json::from_value(lww["deltas"].clone()).unwrap();
    sync::mark_pushed(from, U, &pushed).unwrap();
    let append = serde_json::to_value(sync::build_pending_append(from, U).unwrap()).unwrap();
    let pushed: Vec<sync::PushedDelta> = serde_json::from_value(append["deltas"].clone()).unwrap();
    sync::mark_pushed(from, U, &pushed).unwrap();
    lww["deltas"]
        .as_array()
        .unwrap()
        .iter()
        .chain(append["deltas"].as_array().unwrap())
        .cloned()
        .collect()
}

fn pull(into: &Connection, docs: &[Value]) {
    let ws = ensure_workspace(into).unwrap();
    in_tx(into, |tx| {
        for d in docs {
            sync::apply_doc(tx, &ws, U, &as_doc(d))?;
        }
        Ok(())
    })
    .unwrap();
}

#[test]
fn a_deleted_run_hides_its_results_on_other_devices_also_late_ones() {
    let (a, b, late) = (device(), device(), device());
    let p = new_project(&a);
    new_case(&a, &p, "TC-001");
    let first = import_into(&a, &request(&p, json!({"newRun": {"keepOpen": true}}))).unwrap();
    let created = push(&a);
    pull(&b, &created);
    pull(&late, &created);
    assert_eq!(import::run_counts(&b, &p, U).unwrap().len(), 1);
    assert_eq!(import::unlinked_list(&b, &p, U).unwrap().len(), 1);

    delete_run(&a, &first.run_id, U).unwrap();
    let deleted = push(&a);
    // The run travels as a tombstone (an imported run has no items); no shard
    // or result is pushed again (they stay as they are on the server).
    let ops: Vec<(String, String)> = deleted
        .iter()
        .map(|d| {
            (
                d["entity"].as_str().unwrap().to_string(),
                d["op"].as_str().unwrap().to_string(),
            )
        })
        .collect();
    assert!(ops.contains(&("run".into(), "delete".into())), "{ops:?}");
    assert!(
        !ops.iter().any(|(e, _)| e == "run_shard" || e == "result"),
        "{ops:?}"
    );
    pull(&b, &deleted);
    assert!(list_runs(&b, &p, U).unwrap().is_empty());
    assert!(import::run_counts(&b, &p, U).unwrap().is_empty());
    assert!(import::unlinked_list(&b, &p, U).unwrap().is_empty());

    // Another device that had not seen the delete imports a second file into
    // the run; its shard and result reach `b` after the tombstone.
    let req = request(
        &p,
        json!({"runId": first.run_id, "sha256": "bb".repeat(32)}),
    );
    in_tx(&late, |tx| {
        import::commit(
            tx,
            &req,
            &Stored {
                sha256: "bb".repeat(32),
                size: 1,
            },
        )
    })
    .unwrap();
    let results_before = count(&b, "SELECT count(*) FROM results");
    pull(&b, &push(&late));
    assert!(count(&b, "SELECT count(*) FROM results") > results_before);
    assert!(list_runs(&b, &p, U).unwrap().is_empty());
    assert!(list_results(&b, &first.run_id, U).unwrap().is_empty());
    assert!(import::run_counts(&b, &p, U).unwrap().is_empty());
    assert!(import::unlinked_list(&b, &p, U).unwrap().is_empty());
}

#[test]
fn the_purge_takes_a_deleted_run_with_its_results_and_a_re_pull_does_not_bring_them_back() {
    let (a, b) = (device(), device());
    let p = new_project(&a);
    new_case(&a, &p, "TC-001");
    let first = import_into(&a, &request(&p, json!({"newRun": {}}))).unwrap();
    let created = push(&a);
    delete_run(&a, &first.run_id, U).unwrap();
    let deleted = push(&a);
    pull(&b, &created);
    pull(&b, &deleted);
    for c in [&a, &b] {
        // Not yet: the retention has not passed.
        purge::purge(c, U, 30).unwrap();
        assert!(count(c, "SELECT count(*) FROM results") > 0);
        for t in ["runs", "run_items"] {
            c.execute(
                &format!("UPDATE {t} SET deleted_at = '2000-01-01 00:00:00' WHERE deleted_at IS NOT NULL"),
                [],
            )
            .unwrap();
        }
        c.execute(
            "UPDATE oplog SET synced_at = datetime('now') WHERE synced_at IS NULL",
            [],
        )
        .unwrap();
        purge::purge(c, U, 30).unwrap();
        for t in ["runs", "run_items", "run_shards", "results", "step_results"] {
            assert_eq!(count(c, &format!("SELECT count(*) FROM {t}")), 0, "{t}");
        }
        assert_eq!(
            count(c, "SELECT count(*) FROM attachments WHERE owner_entity IN ('run_shard', 'result', 'step_result')"),
            0
        );
    }
    // A re-pull (cursor reset: the server's current documents, the run's
    // tombstone and its live append-only rows) brings no result back.
    let current: Vec<Value> = created
        .iter()
        .filter(|d| d["op"] == "append")
        .chain(deleted.iter())
        .cloned()
        .collect();
    pull(&b, &current);
    assert_eq!(count(&b, "SELECT count(*) FROM results"), 0);
}

// ---- review round (M3 and sync paths) ----------------------------------------

/// A manual run of one case, pushed from `a` and pulled by `b`.
fn shared_manual_run(a: &Connection, b: &Connection) -> (String, String, String) {
    let (p, _, run, item) = manual_run(a);
    pull(b, &push(a));
    (p, run, item)
}

fn conflict_of(c: &Connection, entity: &str) -> String {
    c.query_row(
        "SELECT id FROM sync_conflicts WHERE entity = ?1 AND resolved_at IS NULL",
        [entity],
        |r| r.get(0),
    )
    .unwrap()
}

fn live_items(c: &Connection, run: &str) -> i64 {
    c.query_row(
        "SELECT count(*) FROM run_items WHERE run_id = ?1 AND deleted_at IS NULL",
        [run],
        |r| r.get(0),
    )
    .unwrap()
}

#[test]
fn a_tombstone_pulled_on_another_device_drops_its_drafts_and_their_files() {
    let (a, b) = (device(), device());
    let (_, run, item) = shared_manual_run(&a, &b);
    crate::runs::manual::save_draft(&b, &item, "-/-", Some(&json!({})), U).unwrap();
    crate::runs::manual::add_draft_attachment(
        &b,
        "f",
        &item,
        "-/-",
        None,
        "a.png",
        None,
        "screenshot",
        &Stored {
            sha256: "bb".repeat(32),
            size: 10,
        },
        U,
    )
    .unwrap();
    delete_run(&a, &run, U).unwrap();
    pull(&b, &push(&a));
    assert!(list_runs(&b, &get_project(&b, &run), U).unwrap().is_empty());
    assert_eq!(count(&b, "SELECT count(*) FROM execution_drafts"), 0);
    let state: String = b
        .query_row(
            "SELECT local_state FROM blobs WHERE sha256 = ?1",
            ["bb".repeat(32)],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(state, "deleting");
}

fn get_project(c: &Connection, run: &str) -> String {
    c.query_row("SELECT project_id FROM runs WHERE id = ?1", [run], |r| {
        r.get(0)
    })
    .unwrap()
}

#[test]
fn keeping_an_edit_over_a_delete_brings_the_run_back_with_its_items_on_both_devices() {
    let (a, b) = (device(), device());
    let (p, run, _) = shared_manual_run(&a, &b);
    // B edits the header while A deletes the run.
    update_run(&b, &run, &run_input(&p, json!({"build": "2.0"}))).unwrap();
    delete_run(&a, &run, U).unwrap();
    pull(&b, &push(&a));
    // B: a conflict on the run (its edit is pending); the items followed the
    // delete (B had no change of its own on them).
    let conflict = conflict_of(&b, "run");
    assert_eq!(live_items(&b, &run), 0);
    let ws = ensure_workspace(&b).unwrap();
    sync::resolve_conflict(&b, &ws, U, &conflict, "local").unwrap();
    assert_eq!(
        get_run(&b, &run, U).unwrap().unwrap().build.as_deref(),
        Some("2.0")
    );
    assert_eq!(live_items(&b, &run), 1);
    // A gets the run and its item back from B.
    pull(&a, &push(&b));
    assert_eq!(
        get_run(&a, &run, U).unwrap().unwrap().build.as_deref(),
        Some("2.0")
    );
    assert_eq!(live_items(&a, &run), 1);
    assert_eq!(crate::runs::list_items(&a, &run, U).unwrap().len(), 1);
}

#[test]
fn taking_the_server_version_over_a_pending_delete_brings_the_items_back_on_both_devices() {
    let (a, b) = (device(), device());
    let (p, run, _) = shared_manual_run(&a, &b);
    // B's edit reaches the server first; A deleted the run meanwhile.
    update_run(&b, &run, &run_input(&p, json!({"build": "3.0"}))).unwrap();
    let from_b = push(&b);
    delete_run(&a, &run, U).unwrap();
    pull(&a, &from_b);
    let conflict = conflict_of(&a, "run");
    let ws = ensure_workspace(&a).unwrap();
    sync::resolve_conflict(&a, &ws, U, &conflict, "remote").unwrap();
    assert_eq!(
        get_run(&a, &run, U).unwrap().unwrap().build.as_deref(),
        Some("3.0")
    );
    assert_eq!(live_items(&a, &run), 1);
    // What A pushes now keeps the item alive on B too.
    pull(&b, &push(&a));
    assert_eq!(live_items(&b, &run), 1);
    assert!(get_run(&b, &run, U).unwrap().is_some());
}

#[test]
fn restoring_a_project_does_not_bring_back_a_run_deleted_before_it() {
    let (a, b) = (device(), device());
    let (p, _, gone, _) = manual_run(&a);
    let case = new_case(&a, &p, "TC-002");
    let kept = insert_run(&a, &run_input(&p, json!({"title": "Kept"}))).unwrap();
    add_items(&a, &kept, U, &[whole(&case)]).unwrap();
    delete_run(&a, &gone, U).unwrap();
    // The run was deleted well before the project.
    for t in ["runs", "run_items"] {
        a.execute(
            &format!(
                "UPDATE {t} SET deleted_at = '2026-01-01 00:00:00' WHERE deleted_at IS NOT NULL"
            ),
            [],
        )
        .unwrap();
    }
    pull(&b, &push(&a));
    // B renames the project and pushes; A deletes it meanwhile.
    let rename: project::ProjectInput =
        serde_json::from_value(json!({"name": "Auth 2", "ownerId": U})).unwrap();
    project::update_project(&b, &p, &rename).unwrap();
    let from_b = push(&b);
    project::delete_project(&a, &p, U).unwrap();
    pull(&a, &from_b);
    let conflict = conflict_of(&a, "project");
    let ws = ensure_workspace(&a).unwrap();
    sync::resolve_conflict(&a, &ws, U, &conflict, "remote").unwrap();
    // The project's cascade comes back; the run deleted on its own does not.
    assert!(get_run(&a, &kept, U).unwrap().is_some());
    assert_eq!(live_items(&a, &kept), 1);
    assert!(get_run(&a, &gone, U).unwrap().is_none());
    assert_eq!(live_items(&a, &gone), 0);
}

#[test]
fn a_defect_cannot_be_made_from_a_result_of_a_deleted_run() {
    let c = device();
    let (_, _, run, _) = manual_run(&c);
    let result: String = c
        .query_row("SELECT id FROM results WHERE run_id = ?1", [&run], |r| {
            r.get(0)
        })
        .unwrap();
    assert!(crate::defects::draft_from_result(&c, &result, None, U).is_ok());
    delete_run(&c, &run, U).unwrap();
    assert_eq!(
        crate::defects::draft_from_result(&c, &result, None, U).unwrap_err(),
        RUN_DELETED
    );
}

// ---- review round 2: only the run's own cascade comes back -------------------

/// A run with two items (cases TC-001 and TC-002), pushed from `a` and
/// pulled by `b`.
fn two_item_run(a: &Connection, b: &Connection) -> (String, String, String, String) {
    let p = new_project(a);
    let one = new_case(a, &p, "TC-001");
    let two = new_case(a, &p, "TC-002");
    let run = insert_run(a, &run_input(&p, json!({}))).unwrap();
    let items = add_items(a, &run, U, &[whole(&one), whole(&two)]).unwrap();
    pull(b, &push(a));
    (p, run, items[0].clone(), items[1].clone())
}

/// Removes one item on its own, an hour ago (what a future «remove an item»
/// would write: a tombstone with its own oplog `delete` and HLC).
fn remove_item_an_hour_ago(c: &Connection, item: &str) {
    let revision: i64 = c
        .query_row(
            "UPDATE run_items SET deleted_at = datetime('now', '-1 hour'), revision = revision + 1
              WHERE id = ?1 RETURNING revision",
            [item],
            |r| r.get(0),
        )
        .unwrap();
    let mut change = Change::new(
        RUN_ITEM,
        item,
        Action::Delete,
        Actor::user(U),
        "delete",
        revision,
        U,
    );
    change.audit = Audit::Folded;
    journal::record(c, change).unwrap();
    let hlc: String = c
        .query_row(
            "SELECT hlc FROM oplog WHERE entity = 'run_item' AND entity_id = ?1 ORDER BY rowid DESC LIMIT 1",
            [item],
            |r| r.get(0),
        )
        .unwrap();
    let mut old = crate::hlc::Hlc::parse(&hlc).unwrap();
    old.wall_ms -= 3_600_000;
    c.execute(
        "UPDATE oplog SET hlc = ?2 WHERE entity = 'run_item' AND entity_id = ?1 AND hlc = ?3",
        params![item, old.encode(), hlc],
    )
    .unwrap();
}

fn item_live(c: &Connection, item: &str) -> bool {
    c.query_row(
        "SELECT deleted_at IS NULL FROM run_items WHERE id = ?1",
        [item],
        |r| r.get(0),
    )
    .unwrap()
}

#[test]
fn an_item_removed_before_the_run_stays_removed_when_the_run_comes_back_keeping_the_edit() {
    let (a, b) = (device(), device());
    let (p, run, gone, kept) = two_item_run(&a, &b);
    remove_item_an_hour_ago(&a, &gone);
    pull(&b, &push(&a));
    assert!(!item_live(&b, &gone));
    // B edits the header while A deletes the run; B keeps its edit.
    update_run(&b, &run, &run_input(&p, json!({"build": "2.0"}))).unwrap();
    delete_run(&a, &run, U).unwrap();
    pull(&b, &push(&a));
    let conflict = conflict_of(&b, "run");
    let ws = ensure_workspace(&b).unwrap();
    sync::resolve_conflict(&b, &ws, U, &conflict, "local").unwrap();
    assert!(item_live(&b, &kept), "the run's cascade comes back on B");
    assert!(!item_live(&b, &gone), "the earlier removal stays on B");
    pull(&a, &push(&b));
    assert!(item_live(&a, &kept), "and on A");
    assert!(!item_live(&a, &gone), "and on A");
}

#[test]
fn an_item_removed_before_the_run_stays_removed_when_the_run_comes_back_taking_the_server_version()
{
    let (a, b) = (device(), device());
    let (p, run, gone, kept) = two_item_run(&a, &b);
    remove_item_an_hour_ago(&a, &gone);
    pull(&b, &push(&a));
    // B's edit reaches the server first; A deleted the run meanwhile.
    update_run(&b, &run, &run_input(&p, json!({"build": "3.0"}))).unwrap();
    let from_b = push(&b);
    delete_run(&a, &run, U).unwrap();
    pull(&a, &from_b);
    let conflict = conflict_of(&a, "run");
    let ws = ensure_workspace(&a).unwrap();
    sync::resolve_conflict(&a, &ws, U, &conflict, "remote").unwrap();
    assert!(item_live(&a, &kept), "the run's cascade comes back on A");
    assert!(!item_live(&a, &gone), "the earlier removal stays on A");
    pull(&b, &push(&a));
    assert!(item_live(&b, &kept), "and on B");
    assert!(!item_live(&b, &gone), "and on B");
}
