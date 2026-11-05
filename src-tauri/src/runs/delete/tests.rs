//! Deleting a run (EJE-07): what it hides, what it never touches, what it
//! refuses afterwards, how it syncs and how the purge takes it.

use rusqlite::Connection;
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
