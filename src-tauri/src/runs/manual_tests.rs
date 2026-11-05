//! Manual execution (EJE-02): targets, narrowing, drafts with their files,
//! recording from a draft, reopening, cycle progress per target, and the
//! exit criterion of 0.2.0 (editing an executed case changes none of its
//! results).

use rusqlite::Connection;
use serde_json::{json, Value};

use super::*;
use crate::db::{in_tx, run_migrations};
use crate::runs::{add_items, insert_run, update_run, RunInput, RunItemInput};
use crate::{cycles, project, purge, sync, test_case};

const U: &str = "11111111-1111-4111-8111-111111111111";

fn device() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    run_migrations(&c).unwrap();
    sync::assume_stable_steps_server(&c);
    c
}

fn new_project(c: &Connection) -> String {
    let input: project::ProjectInput =
        serde_json::from_value(json!({"name": "Checkout", "ownerId": U})).unwrap();
    project::insert_project(c, &input).unwrap()
}

fn case_input(project: &str, title: &str, data: Value) -> test_case::TestCaseInput {
    serde_json::from_value(json!({
        "projectId": project, "title": title, "author": "Ada", "data": data, "userId": U
    }))
    .unwrap()
}

fn new_case(c: &Connection, project: &str, data: Value) -> String {
    test_case::insert_case(c, &case_input(project, "Pay", data)).unwrap()
}

fn case_data(c: &Connection, id: &str) -> Value {
    let s: String = c
        .query_row("SELECT data FROM test_cases WHERE id = ?1", [id], |r| {
            r.get(0)
        })
        .unwrap();
    serde_json::from_str(&s).unwrap()
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

fn attempt(item: &str, status: &str, extra: Value) -> ResultInput {
    let mut v = json!({"runItemId": item, "status": status, "userId": U});
    if let (Value::Object(m), Value::Object(e)) = (&mut v, extra) {
        m.extend(e);
    }
    serde_json::from_value(v).unwrap()
}

/// Records an attempt as the executor does: the target's draft carries the
/// attempt's id (kept if it already has one), then `execution_record`.
fn exec(c: &Connection, input: &ResultInput) -> Result<String, String> {
    let mut input = input.clone();
    let (flow, row): (Option<String>, Option<String>) = c
        .query_row(
            "SELECT flow_id, example_row_id FROM run_items WHERE id = ?1",
            [&input.run_item_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let key = target_key(
        input.flow_id.clone().or(flow).as_deref(),
        input.example_row_id.clone().or(row).as_deref(),
    );
    let mut target = stored_state(c, &input.run_item_id)?
        .and_then(|(s, _)| s["targets"].get(&key).cloned())
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}));
    if target.get("attemptId").is_none() {
        target["attemptId"] = json!(Uuid::new_v4().to_string());
    }
    input.attempt_id = target["attemptId"].as_str().map(String::from);
    // A closed run refuses the save; the record then says why.
    let _ = save_draft(c, &input.run_item_id, &key, Some(&target), U);
    record_from_draft(c, &input)
}

fn count(c: &Connection, sql: &str) -> i64 {
    c.query_row(sql, [], |r| r.get(0)).unwrap()
}

fn stored(byte: &str) -> evidence::Stored {
    evidence::Stored {
        sha256: byte.repeat(32),
        size: 10,
    }
}

/// A two-step case, an open run and its item.
fn simple(c: &Connection) -> (String, String, String, String) {
    let p = new_project(c);
    let case = new_case(
        c,
        &p,
        json!({"steps": ["open", {"text": "pay", "expected": "paid"}]}),
    );
    let run = insert_run(c, &run_input(&p, json!({}))).unwrap();
    let item = add_items(c, &run, U, &[whole(&case)]).unwrap().remove(0);
    (p, case, run, item)
}

/// Main flow with two Outline rows and one flow with one row.
fn advanced(c: &Connection, p: &str) -> String {
    new_case(
        c,
        p,
        json!({
            "background": ["logged in"],
            "steps": ["main step <user>"],
            "examples": {"headers": ["user"], "rows": [["ana"], ["bo"]]},
            "flows": [{"name": "Refund", "steps": ["flow step"],
                       "examples": {"headers": ["card"], "rows": [["visa"]]}}]
        }),
    )
}

fn id_at(v: &Value, path: &[&str]) -> String {
    let mut cur = v;
    for p in path {
        cur = match p.parse::<usize>() {
            Ok(i) => &cur[i],
            Err(_) => &cur[*p],
        };
    }
    cur["id"].as_str().unwrap().to_string()
}

// ---- targets -------------------------------------------------------------------

#[test]
fn an_item_expands_to_one_target_per_flow_and_outline_row() {
    let c = device();
    let p = new_project(&c);
    let case = advanced(&c, &p);
    let data = case_data(&c, &case);
    let flow = data["flows"][0]["id"].as_str().unwrap().to_string();
    let row_a = id_at(&data, &["examples", "rows", "0"]);
    let flow_row = id_at(&data, &["flows", "0", "examples", "rows", "0"]);

    let all = targets_of(&case, &data, None, None);
    let keys: Vec<&str> = all.iter().map(|t| t.key.as_str()).collect();
    assert_eq!(all.len(), 3, "{keys:?}");
    assert_eq!(all[0].flow_id, None);
    assert_eq!(all[0].example_row, Some(0));
    assert_eq!(all[0].values, Some(json!({"user": "ana"})));
    assert_eq!(all[1].values, Some(json!({"user": "bo"})));
    assert_eq!(all[2].flow_id.as_deref(), Some(flow.as_str()));
    assert_eq!(all[2].flow_name.as_deref(), Some("Refund"));
    assert_eq!(all[2].values, Some(json!({"card": "visa"})));
    assert_eq!(
        all[2].test_key,
        ids::manual_test_key(&case, Some(&flow), Some(&flow_row))
    );
    // A flow item is that flow's rows; a row item is that row.
    assert_eq!(targets_of(&case, &data, Some(&flow), None).len(), 1);
    let one = targets_of(&case, &data, None, Some(&row_a));
    assert_eq!(one.len(), 1);
    assert_eq!(one[0].key, target_key(None, Some(&row_a)));
    // A simple case is one target; a case whose flows carry all the steps
    // (an advanced case without main steps) has no main target.
    let simple = json!({"steps": [{"id": "S1", "text": "a"}]});
    assert_eq!(targets_of("c", &simple, None, None).len(), 1);
    let only_flows = json!({"flows": [{"id": "F1", "name": "Main", "steps": [{"id": "S", "text": "x"}]},
                                      {"id": "F2", "name": "Alt", "steps": [{"id": "T", "text": "y"}]}]});
    let t = targets_of("c", &only_flows, None, None);
    assert_eq!(
        t.iter().map(|t| t.key.as_str()).collect::<Vec<_>>(),
        vec!["F1/-", "F2/-"]
    );
}

#[test]
fn an_attempt_narrows_a_whole_case_item_to_its_flow_and_row() {
    let c = device();
    let p = new_project(&c);
    let case = advanced(&c, &p);
    let data = case_data(&c, &case);
    let flow = data["flows"][0]["id"].as_str().unwrap().to_string();
    let row_b = id_at(&data, &["examples", "rows", "1"]);
    let flow_row = id_at(&data, &["flows", "0", "examples", "rows", "0"]);
    let flow_step = id_at(&data, &["flows", "0", "steps", "0"]);
    let run = insert_run(&c, &run_input(&p, json!({}))).unwrap();
    let item = add_items(&c, &run, U, &[whole(&case)]).unwrap().remove(0);

    let main = record_result(
        &c,
        &attempt(&item, "passed", json!({"exampleRowId": row_b})),
    )
    .unwrap();
    let refund = record_result(
        &c,
        &attempt(
            &item,
            "failed",
            json!({"flowId": flow, "exampleRowId": flow_row,
                   "steps": [{"stepId": flow_step, "text": "flow step", "status": "failed"}]}),
        ),
    )
    .unwrap();
    let stored_row = |id: &str| -> (
        String,
        Option<String>,
        Option<String>,
        Option<i64>,
        Option<String>,
    ) {
        c.query_row(
            "SELECT test_key, flow_id, example_row_id, example_row, example_values
               FROM results WHERE id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .unwrap()
    };
    let m = stored_row(&main);
    assert_eq!(m.0, ids::manual_test_key(&case, None, Some(&row_b)));
    assert_eq!((m.1, m.3), (None, Some(1)));
    assert_eq!(m.4.as_deref(), Some(r#"{"user":"bo"}"#));
    let r = stored_row(&refund);
    assert_eq!(r.1.as_deref(), Some(flow.as_str()));
    assert_eq!(r.2.as_deref(), Some(flow_row.as_str()));
    // The flow's step is checked against the narrowed flow, not the main one.
    assert!(record_result(
        &c,
        &attempt(
            &item,
            "passed",
            json!({"exampleRowId": row_b,
            "steps": [{"stepId": flow_step, "text": "x", "status": "passed"}]})
        )
    )
    .is_err());
    // A row of another flow, an unknown flow, or leaving a narrower item: refused.
    assert!(record_result(
        &c,
        &attempt(&item, "passed", json!({"exampleRowId": flow_row}))
    )
    .is_err());
    assert!(record_result(&c, &attempt(&item, "passed", json!({"flowId": "nope"}))).is_err());
    // In another run (the same case twice in one run is refused, S5).
    let other = insert_run(&c, &run_input(&p, json!({}))).unwrap();
    let flow_item = add_items(
        &c,
        &other,
        U,
        &[serde_json::from_value(json!({"testCaseId": case, "flowId": flow})).unwrap()],
    )
    .unwrap()
    .remove(0);
    assert!(record_result(
        &c,
        &attempt(&flow_item, "passed", json!({"exampleRowId": row_b}))
    )
    .unwrap_err()
    .contains("example row not in that flow"));
    // The overview counts targets: 2 of 3 run on the whole item.
    let o = overview(&c, &run, U).unwrap().unwrap();
    assert_eq!(o.items[0].targets, 3);
    assert_eq!(o.items[0].done, 2);
    assert_eq!(o.items[0].status, "failed");
    assert_eq!(
        o.counts,
        TargetCounts {
            passed: 1,
            failed: 1,
            not_run: 1,
            total: 3,
            ..Default::default()
        }
    );
    let o = overview(&c, &other, U).unwrap().unwrap();
    assert_eq!(o.items[0].status, "not_run");
    assert_eq!(o.items[0].flow_name.as_deref(), Some("Refund"));
}

#[test]
fn cycle_progress_counts_a_narrowed_attempt_against_its_exact_flow_and_row() {
    let c = device();
    let p = new_project(&c);
    let case = advanced(&c, &p);
    let data = case_data(&c, &case);
    let flow = data["flows"][0]["id"].as_str().unwrap().to_string();
    let row_a = id_at(&data, &["examples", "rows", "0"]);
    let flow_row = id_at(&data, &["flows", "0", "examples", "rows", "0"]);
    let cycle_input: cycles::TestCycleInput =
        serde_json::from_value(json!({"projectId": p, "title": "R1", "userId": U})).unwrap();
    let cycle = cycles::insert_cycle(&c, &cycle_input).unwrap();
    let whole_case = cycles::CycleItemInput {
        test_case_id: case.clone(),
        ..Default::default()
    };
    cycles::add_items(&c, &cycle, U, &[whole_case]).unwrap();
    let exec_in = cycles::ExecuteInput {
        user_id: U.into(),
        ..Default::default()
    };
    let run = cycles::execute(&c, &cycle, &exec_in)
        .unwrap()
        .run_ids
        .remove(0);
    let item = crate::runs::list_items(&c, &run, U).unwrap().remove(0).id;
    let cell = |c: &Connection| {
        let progress = cycles::cycle_progress(c, &cycle, U).unwrap().unwrap();
        assert_eq!(progress.cells.len(), 1);
        let cell = &progress.cells[0];
        (cell.status.clone(), cell.result_id.clone())
    };
    assert_eq!(cell(&c).0, "not_run");
    exec(
        &c,
        &attempt(&item, "passed", json!({"exampleRowId": row_a})),
    )
    .unwrap();
    assert_eq!(cell(&c).0, "passed");
    let refund = exec(
        &c,
        &attempt(
            &item,
            "failed",
            json!({"flowId": flow, "exampleRowId": flow_row}),
        ),
    )
    .unwrap();
    assert_eq!(cell(&c), ("failed".into(), Some(refund.clone())));
    // A later pass of the main row is that row's final, not the flow's: the
    // flow still fails.
    exec(
        &c,
        &attempt(&item, "passed", json!({"exampleRowId": row_a})),
    )
    .unwrap();
    assert_eq!(cell(&c), ("failed".into(), Some(refund)));
    // Re-executing the flow's row replaces its final.
    exec(
        &c,
        &attempt(
            &item,
            "passed",
            json!({"flowId": flow, "exampleRowId": flow_row}),
        ),
    )
    .unwrap();
    assert_eq!(cell(&c).0, "passed");
}

// ---- drafts --------------------------------------------------------------------

#[test]
fn a_draft_is_local_survives_a_restart_and_writes_no_journal() {
    let dir = std::env::temp_dir().join(format!("pharos-draft-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("db.sqlite");
    let (item, oplog, events) = {
        let c = Connection::open(&path).unwrap();
        run_migrations(&c).unwrap();
        sync::assume_stable_steps_server(&c);
        let (_, _, _, item) = simple(&c);
        let oplog = count(&c, "SELECT count(*) FROM oplog");
        let events = count(&c, "SELECT count(*) FROM audit_log");
        save_draft(
            &c,
            &item,
            "-/-",
            Some(&json!({"steps": {"a": "failed"}, "notes": "x"})),
            U,
        )
        .unwrap();
        (item, oplog, events)
    };
    let c = Connection::open(&path).unwrap();
    let draft = read_draft(&c, &item).unwrap().unwrap();
    assert_eq!(draft.targets["-/-"]["notes"], "x");
    assert_eq!(count(&c, "SELECT count(*) FROM oplog"), oplog);
    assert_eq!(count(&c, "SELECT count(*) FROM audit_log"), events);
    // A target the item does not have, or a draft too large: refused.
    assert!(save_draft(&c, &item, "F/-", Some(&json!({})), U).is_err());
    let big = json!({"notes": "x".repeat(MAX_DRAFT_BYTES)});
    assert!(save_draft(&c, &item, "-/-", Some(&big), U)
        .unwrap_err()
        .starts_with("draft-too-large"));
    // Another account cannot read or write it.
    assert!(item_detail(&c, &item, "someone-else").unwrap().is_none());
    assert!(save_draft(&c, &item, "-/-", Some(&json!({})), "someone-else").is_err());
    // Discarding the last target removes the row.
    save_draft(&c, &item, "-/-", None, U).unwrap();
    assert!(read_draft(&c, &item).unwrap().is_none());
    drop(c);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn recording_moves_the_drafts_files_to_the_result_and_its_steps_in_one_transaction() {
    let c = device();
    let (_, case, run, item) = simple(&c);
    let data = case_data(&c, &case);
    let pay = id_at(&data, &["steps", "1"]);
    let attempt_id = Uuid::new_v4().to_string();
    save_draft(
        &c,
        &item,
        "-/-",
        Some(&json!({"notes": "draft", "attemptId": attempt_id})),
        U,
    )
    .unwrap();
    let step_file = add_draft_attachment(
        &c,
        "att-step",
        &item,
        "-/-",
        Some(&pay),
        "shot.png",
        Some("image/png"),
        "screenshot",
        &stored("aa"),
        U,
    )
    .unwrap();
    assert_eq!(step_file.kind, "screenshot");
    add_draft_attachment(
        &c,
        "att-result",
        &item,
        "-/-",
        None,
        "log.txt",
        Some("text/plain"),
        "anything",
        &stored("bb"),
        U,
    )
    .unwrap();
    // A step of no flow of the item is refused.
    assert!(add_draft_attachment(
        &c,
        "att-bad",
        &item,
        "-/-",
        Some("NOPE"),
        "x",
        None,
        "evidence",
        &stored("cc"),
        U,
    )
    .is_err());
    let detail = item_detail(&c, &item, U).unwrap().unwrap();
    let draft = detail.draft.unwrap();
    assert_eq!(draft.attachments.len(), 2);
    assert_eq!(
        draft.attachments[1].kind, "evidence",
        "unknown kinds become evidence"
    );
    assert_eq!(draft.attachments[0].step_id.as_deref(), Some(pay.as_str()));

    // Closed run: nothing is written and the files stay the draft's.
    update_run(&c, &run, &run_input("", json!({"status": "completed"}))).unwrap();
    let input = attempt(
        &item,
        "failed",
        json!({"steps": [
            {"stepId": id_at(&data, &["steps", "0"]), "text": "open", "status": "passed"},
            {"stepId": pay, "text": "pay", "status": "failed", "actual": "declined"}],
               "attemptId": attempt_id}),
    );
    assert_eq!(
        in_tx(&c, |tx| record_from_draft(tx, &input)).unwrap_err(),
        "run-closed"
    );
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM attachments WHERE owner_entity = 'execution_draft'"
        ),
        2
    );
    assert_eq!(count(&c, "SELECT count(*) FROM results"), 0);

    update_run(&c, &run, &run_input("", json!({"status": "in_progress"}))).unwrap();
    let links = count(&c, "SELECT count(*) FROM audit_log WHERE action = 'link'");
    let id = in_tx(&c, |tx| record_from_draft(tx, &input)).unwrap();
    let step_result: String = c
        .query_row(
            "SELECT id FROM step_results WHERE result_id = ?1 AND step_id = ?2",
            [&id, &pay],
            |r| r.get(0),
        )
        .unwrap();
    let owner = |att: &str| -> (String, String) {
        c.query_row(
            "SELECT owner_entity, owner_id FROM attachments WHERE id = ?1",
            [att],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap()
    };
    assert_eq!(owner("att-step"), ("step_result".into(), step_result));
    assert_eq!(owner("att-result"), ("result".into(), id.clone()));
    assert_eq!(
        count(&c, "SELECT count(*) FROM audit_log WHERE action = 'link'"),
        links + 2
    );
    assert!(
        read_draft(&c, &item).unwrap().is_none(),
        "the target's draft is gone"
    );
    let detail = item_detail(&c, &item, U).unwrap().unwrap();
    assert_eq!(detail.attachments.len(), 2);
    assert_eq!(detail.results.len(), 1);
    assert_eq!(
        detail.results[0].steps[1].actual.as_deref(),
        Some("declined")
    );
    // Attachments never reach the oplog (SYNC-04b).
    assert_eq!(
        count(&c, "SELECT count(*) FROM oplog WHERE entity = 'attachment'"),
        0
    );
}

#[test]
fn discarding_a_draft_releases_its_files_and_only_draft_files_can_be_deleted() {
    let c = device();
    let p = new_project(&c);
    let case = advanced(&c, &p);
    let run = insert_run(&c, &run_input(&p, json!({}))).unwrap();
    let item = add_items(&c, &run, U, &[whole(&case)]).unwrap().remove(0);
    let targets = item_detail(&c, &item, U).unwrap().unwrap().targets;
    let (a, b) = (targets[0].key.clone(), targets[2].key.clone());
    save_draft(&c, &item, &a, Some(&json!({"n": 1})), U).unwrap();
    save_draft(&c, &item, &b, Some(&json!({"n": 2})), U).unwrap();
    add_draft_attachment(
        &c,
        "fa",
        &item,
        &a,
        None,
        "a.png",
        None,
        "screenshot",
        &stored("aa"),
        U,
    )
    .unwrap();
    add_draft_attachment(
        &c,
        "fb",
        &item,
        &b,
        None,
        "b.png",
        None,
        "screenshot",
        &stored("bb"),
        U,
    )
    .unwrap();
    add_draft_attachment(
        &c,
        "fc",
        &item,
        &b,
        None,
        "c.png",
        None,
        "screenshot",
        &stored("cc"),
        U,
    )
    .unwrap();
    let state = |sha: &str| -> String {
        c.query_row(
            "SELECT local_state FROM blobs WHERE sha256 = ?1",
            [sha.repeat(32)],
            |r| r.get(0),
        )
        .unwrap()
    };
    save_draft(&c, &item, &a, None, U).unwrap();
    assert_eq!(state("aa"), "deleting");
    assert_eq!(state("bb"), "present");
    let draft = read_draft(&c, &item).unwrap().unwrap();
    assert!(draft.targets.get(&a).is_none() && draft.targets.get(&b).is_some());
    assert_eq!(draft.attachments.len(), 2);
    delete_draft_attachment(&c, "fc", U).unwrap();
    assert_eq!(state("cc"), "deleting");
    assert_eq!(read_draft(&c, &item).unwrap().unwrap().attachments.len(), 1);
    // A recorded attachment is not a draft's: it cannot be deleted here.
    let id = exec(
        &c,
        &attempt(
            &item,
            "passed",
            json!({"flowId":
        targets[2].flow_id, "exampleRowId": targets[2].example_row_id}),
        ),
    )
    .unwrap();
    assert_eq!(
        c.query_row(
            "SELECT owner_id FROM attachments WHERE id = 'fb'",
            [],
            |r| r.get::<_, String>(0)
        )
        .unwrap(),
        id
    );
    assert!(delete_draft_attachment(&c, "fb", U).is_err());
}

#[test]
fn a_closed_run_can_be_reopened_and_executed_again() {
    let c = device();
    let (p, _, run, item) = simple(&c);
    exec(&c, &attempt(&item, "failed", json!({}))).unwrap();
    update_run(&c, &run, &run_input(&p, json!({"status": "aborted"}))).unwrap();
    assert!(save_draft(&c, &item, "-/-", Some(&json!({})), U).is_err());
    assert!(exec(&c, &attempt(&item, "passed", json!({}))).is_err());
    let events = count(&c, "SELECT count(*) FROM audit_log WHERE entity = 'run'");
    // Reopening changes only the status, even if other fields come along.
    update_run(
        &c,
        &run,
        &run_input(&p, json!({"status": "in_progress", "build": "9"})),
    )
    .unwrap();
    let r = crate::runs::get_run(&c, &run, U).unwrap().unwrap();
    assert_eq!(r.status, "in_progress");
    assert!(r.finished_at.is_none());
    assert_ne!(r.build.as_deref(), Some("9"));
    assert_eq!(
        count(&c, "SELECT count(*) FROM audit_log WHERE entity = 'run'"),
        events + 1
    );
    let second = exec(&c, &attempt(&item, "passed", json!({}))).unwrap();
    let detail = item_detail(&c, &item, U).unwrap().unwrap();
    assert_eq!(detail.results.len(), 2);
    let last = detail.results.iter().find(|r| r.id == second).unwrap();
    assert!(last.is_final);
    assert_eq!(last.attempt, 1);
}

#[test]
fn the_purge_of_a_run_takes_its_drafts_and_their_files() {
    let c = device();
    let (p, _, _, item) = simple(&c);
    save_draft(&c, &item, "-/-", Some(&json!({})), U).unwrap();
    add_draft_attachment(
        &c,
        "f",
        &item,
        "-/-",
        None,
        "a.png",
        None,
        "screenshot",
        &stored("aa"),
        U,
    )
    .unwrap();
    project::delete_project(&c, &p, U).unwrap();
    c.execute(
        "UPDATE oplog SET synced_at = datetime('now') WHERE synced_at IS NULL",
        [],
    )
    .unwrap();
    for t in ["runs", "run_items", "test_cases", "projects"] {
        c.execute(
            &format!("UPDATE {t} SET deleted_at = '2000-01-01 00:00:00'"),
            [],
        )
        .unwrap();
    }
    purge::purge(&c, U, 30).unwrap();
    assert_eq!(count(&c, "SELECT count(*) FROM execution_drafts"), 0);
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM attachments WHERE owner_entity = 'execution_draft'"
        ),
        0
    );
}

// ---- exit criterion of 0.2.0 -----------------------------------------------------

/// Design §5, ROADMAP §3: «editar un caso ejecutado no altera sus resultados».
/// Execute a case by hand with notes and a step file, then edit everything the
/// editor can edit: what the run shows and the cycle counts stays the same.
#[test]
fn editing_an_executed_case_does_not_change_its_results() {
    let c = device();
    let p = new_project(&c);
    let case = new_case(
        &c,
        &p,
        json!({"steps": ["open the cart", {"text": "pay", "expected": "paid"}, "see receipt"]}),
    );
    let cycle_input: cycles::TestCycleInput =
        serde_json::from_value(json!({"projectId": p, "title": "R1", "userId": U})).unwrap();
    let cycle = cycles::insert_cycle(&c, &cycle_input).unwrap();
    cycles::add_items(
        &c,
        &cycle,
        U,
        &[cycles::CycleItemInput {
            test_case_id: case.clone(),
            ..Default::default()
        }],
    )
    .unwrap();
    let run = cycles::execute(
        &c,
        &cycle,
        &cycles::ExecuteInput {
            user_id: U.into(),
            ..Default::default()
        },
    )
    .unwrap()
    .run_ids
    .remove(0);
    let item = crate::runs::list_items(&c, &run, U).unwrap().remove(0).id;
    let data = case_data(&c, &case);
    let step = |i: usize| id_at(&data, &["steps", &i.to_string()]);
    save_draft(&c, &item, "-/-", Some(&json!({"notes": "in progress"})), U).unwrap();
    add_draft_attachment(
        &c,
        "shot",
        &item,
        "-/-",
        Some(&step(1)),
        "declined.png",
        Some("image/png"),
        "screenshot",
        &stored("aa"),
        U,
    )
    .unwrap();
    let id = exec(
        &c,
        &attempt(
            &item,
            "failed",
            json!({"attributes": {"notes": "card declined"}, "durationMs": 61000,
                   "steps": [
                {"stepId": step(0), "text": "open the cart", "status": "passed"},
                {"stepId": step(1), "text": "pay", "status": "failed", "actual": "declined"},
                {"stepId": step(2), "text": "see receipt", "status": "skipped"}]}),
        ),
    )
    .unwrap();
    let snapshot = |c: &Connection| {
        let detail = item_detail(c, &item, U).unwrap().unwrap();
        let progress = cycles::cycle_progress(c, &cycle, U).unwrap().unwrap();
        let payload = crate::runs::result_payload(c, &id).unwrap().unwrap();
        (
            serde_json::to_value(&detail.results).unwrap(),
            serde_json::to_value(&detail.attachments).unwrap(),
            detail.revision.clone(),
            detail.targets.clone(),
            detail.item.test_case_revision_id.clone(),
            serde_json::to_value(&progress.cells).unwrap(),
            payload,
        )
    };
    let before = snapshot(&c);
    assert!(!item_detail(&c, &item, U).unwrap().unwrap().case_changed);

    // Edit the case: rename a step, drop another, add one, a flow, a new title.
    let mut edited = case_data(&c, &case);
    edited["steps"][1]["text"] = json!("pay by card");
    edited["steps"][1]["expected"] = json!("receipt sent");
    edited["steps"].as_array_mut().unwrap().remove(2);
    edited["steps"]
        .as_array_mut()
        .unwrap()
        .push(json!({"text": "log out"}));
    edited["flows"] = json!([{"name": "Refund", "steps": [{"text": "refund"}]}]);
    test_case::update_case(&c, &case, &case_input(&p, "Pay with a card", edited)).unwrap();

    let after = snapshot(&c);
    assert_eq!(before, after, "the executed case's results changed");
    let detail = item_detail(&c, &item, U).unwrap().unwrap();
    assert!(detail.case_changed);
    assert_eq!(detail.case_title, "Pay with a card");
    assert!(detail.current_revision > detail.frozen_revision);
    assert_eq!(detail.revision["steps"][1]["text"], "pay");
    assert_eq!(after.0[0]["steps"][1]["text"], "pay");
    assert_eq!(after.0[0]["attributes"]["notes"], "card declined");
}

// ---- review (S10) -----------------------------------------------------------

fn draft_with(c: &Connection, item: &str, key: &str, attempt: &str) {
    save_draft(c, item, key, Some(&json!({"attemptId": attempt})), U).unwrap();
}

#[test]
fn recording_twice_or_retrying_records_one_attempt() {
    let c = device();
    let (_, _, _, item) = simple(&c);
    let attempt_id = Uuid::new_v4().to_string();
    draft_with(&c, &item, "-/-", &attempt_id);
    let input = attempt(&item, "failed", json!({"attemptId": attempt_id}));
    let first = in_tx(&c, |tx| record_from_draft(tx, &input)).unwrap();
    assert_eq!(first, attempt_id, "the result id is the draft's attempt id");
    let events = count(&c, "SELECT count(*) FROM audit_log");
    // A double submit, or a retry after a persist that failed: same result.
    let again = in_tx(&c, |tx| record_from_draft(tx, &input)).unwrap();
    assert_eq!(again, first);
    assert_eq!(count(&c, "SELECT count(*) FROM results"), 1);
    assert_eq!(count(&c, "SELECT count(*) FROM audit_log"), events);
    // Without an attempt id, or with one whose draft is gone: refused.
    let bare = attempt(&item, "passed", json!({}));
    assert_eq!(
        record_from_draft(&c, &bare).unwrap_err(),
        "attempt-id-required"
    );
    let gone = attempt(
        &item,
        "passed",
        json!({"attemptId": Uuid::new_v4().to_string()}),
    );
    assert!(record_from_draft(&c, &gone)
        .unwrap_err()
        .starts_with("draft-stale"));
    // The id of another item's result is not this item's.
    let (_, _, _, other_item) = simple(&c);
    let stolen = attempt(&other_item, "passed", json!({"attemptId": first}));
    assert_eq!(record_result(&c, &stolen).unwrap_err(), "attempt-id-taken");
}

#[test]
fn a_stale_draft_cannot_come_back_after_its_attempt_is_recorded() {
    let c = device();
    let (_, _, _, item) = simple(&c);
    let a = Uuid::new_v4().to_string();
    draft_with(&c, &item, "-/-", &a);
    exec(&c, &attempt(&item, "passed", json!({}))).unwrap();
    assert!(read_draft(&c, &item).unwrap().is_none());
    // A second window (or a late autosave) saves the recorded attempt again.
    let late = json!({"attemptId": a, "notes": "late"});
    assert!(save_draft(&c, &item, "-/-", Some(&late), U)
        .unwrap_err()
        .starts_with("draft-stale"));
    assert!(read_draft(&c, &item).unwrap().is_none());
    // A new attempt is fine; another window's different attempt is refused.
    let b = Uuid::new_v4().to_string();
    draft_with(&c, &item, "-/-", &b);
    let other = json!({"attemptId": Uuid::new_v4().to_string()});
    assert!(save_draft(&c, &item, "-/-", Some(&other), U)
        .unwrap_err()
        .starts_with("draft-stale"));
    save_draft(
        &c,
        &item,
        "-/-",
        Some(&json!({"attemptId": b, "notes": "x"})),
        U,
    )
    .unwrap();
}

#[test]
fn an_item_with_flows_or_rows_takes_no_untargeted_attempt() {
    let c = device();
    let p = new_project(&c);
    let case = advanced(&c, &p);
    let run = insert_run(&c, &run_input(&p, json!({}))).unwrap();
    let item = add_items(&c, &run, U, &[whole(&case)]).unwrap().remove(0);
    // "-/-" is not one of its targets (the main flow has rows).
    assert_eq!(
        record_result(&c, &attempt(&item, "passed", json!({}))).unwrap_err(),
        "target-not-in-item: -/-"
    );
    let data = case_data(&c, &case);
    let flow = data["flows"][0]["id"].as_str().unwrap().to_string();
    assert!(
        record_result(&c, &attempt(&item, "passed", json!({"flowId": flow})))
            .unwrap_err()
            .starts_with("target-not-in-item")
    );
    assert_eq!(count(&c, "SELECT count(*) FROM results"), 0);
}

#[test]
fn overlapping_items_of_one_case_are_refused_in_a_run_and_a_cycle_run() {
    let c = device();
    let p = new_project(&c);
    let case = advanced(&c, &p);
    let data = case_data(&c, &case);
    let flow = data["flows"][0]["id"].as_str().unwrap().to_string();
    let row_a = id_at(&data, &["examples", "rows", "0"]);
    let flow_row = id_at(&data, &["flows", "0", "examples", "rows", "0"]);
    let item = |f: Option<&str>, r: Option<&str>| -> RunItemInput {
        serde_json::from_value(json!({"testCaseId": case, "flowId": f, "exampleRowId": r})).unwrap()
    };
    let run = insert_run(&c, &run_input(&p, json!({}))).unwrap();
    add_items(&c, &run, U, &[item(Some(&flow), None)]).unwrap();
    // The whole case, or the flow's row, overlaps the flow; the main row does not.
    for overlapping in [
        item(None, None),
        item(Some(&flow), Some(&flow_row)),
        item(Some(&flow), None),
    ] {
        assert!(add_items(&c, &run, U, &[overlapping])
            .unwrap_err()
            .starts_with("item-overlap: "));
    }
    add_items(&c, &run, U, &[item(None, Some(&row_a))]).unwrap();
    // Within one call too, and nothing of it is kept.
    let run2 = insert_run(&c, &run_input(&p, json!({}))).unwrap();
    assert!(in_tx(&c, |tx| add_items(
        tx,
        &run2,
        U,
        &[item(None, None), item(None, Some(&row_a))]
    ))
    .is_err());
    assert!(crate::runs::list_items(&c, &run2, U).unwrap().is_empty());
    // A cycle refuses overlapping items, so «Ejecutar» never creates them.
    let cycle_input: cycles::TestCycleInput =
        serde_json::from_value(json!({"projectId": p, "title": "R1", "userId": U})).unwrap();
    let cycle = cycles::insert_cycle(&c, &cycle_input).unwrap();
    let ci = |f: Option<&str>| cycles::CycleItemInput {
        test_case_id: case.clone(),
        flow_id: f.map(String::from),
        ..Default::default()
    };
    let added = cycles::add_items(&c, &cycle, U, &[ci(Some(&flow)), ci(None)]).unwrap();
    assert_eq!(added.overlapping.len(), 1);
    let exec_in = cycles::ExecuteInput {
        user_id: U.into(),
        ..Default::default()
    };
    let run = cycles::execute(&c, &cycle, &exec_in)
        .unwrap()
        .run_ids
        .remove(0);
    assert_eq!(crate::runs::list_items(&c, &run, U).unwrap().len(), 1);
}

#[test]
fn a_run_of_a_closed_cycle_cannot_be_reopened() {
    let c = device();
    let p = new_project(&c);
    let case = new_case(&c, &p, json!({"steps": ["a"]}));
    let cycle_input: cycles::TestCycleInput =
        serde_json::from_value(json!({"projectId": p, "title": "R1", "userId": U})).unwrap();
    let cycle = cycles::insert_cycle(&c, &cycle_input).unwrap();
    cycles::add_items(
        &c,
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
    let run = cycles::execute(&c, &cycle, &exec_in)
        .unwrap()
        .run_ids
        .remove(0);
    close_run(&c, &run, "completed", false, U).unwrap();
    let closed: cycles::TestCycleInput = serde_json::from_value(
        json!({"projectId": p, "title": "R1", "status": "closed", "userId": U}),
    )
    .unwrap();
    cycles::update_cycle(&c, &cycle, &closed).unwrap();
    assert_eq!(
        update_run(&c, &run, &run_input(&p, json!({"status": "in_progress"}))).unwrap_err(),
        "cycle-closed"
    );
    // Reopen the cycle, then the run.
    let active: cycles::TestCycleInput = serde_json::from_value(
        json!({"projectId": p, "title": "R1", "status": "active", "userId": U}),
    )
    .unwrap();
    cycles::update_cycle(&c, &cycle, &active).unwrap();
    update_run(&c, &run, &run_input(&p, json!({"status": "in_progress"}))).unwrap();
}

#[test]
fn a_manual_run_is_created_with_its_items_or_not_at_all() {
    let c = device();
    let p = new_project(&c);
    let case = new_case(&c, &p, json!({"steps": ["a"]}));
    let input = || -> RunInput { run_input(&p, json!({"trigger": "ci"})) };
    let id = in_tx(&c, |tx| create_manual(tx, input(), &[whole(&case)])).unwrap();
    let run = crate::runs::get_run(&c, &id, U).unwrap().unwrap();
    assert_eq!(run.trigger, "manual");
    assert_eq!(crate::runs::list_items(&c, &id, U).unwrap().len(), 1);
    let runs = count(&c, "SELECT count(*) FROM runs");
    let bad: RunItemInput = serde_json::from_value(json!({"testCaseId": "no-such-case"})).unwrap();
    assert!(in_tx(&c, |tx| create_manual(tx, input(), &[whole(&case), bad])).is_err());
    assert_eq!(
        count(&c, "SELECT count(*) FROM runs"),
        runs,
        "no empty run left"
    );
}

#[test]
fn closing_as_aborted_discards_drafts_and_completed_on_request() {
    let c = device();
    let (p, _, run, item) = simple(&c);
    let a = Uuid::new_v4().to_string();
    draft_with(&c, &item, "-/-", &a);
    add_draft_attachment(
        &c,
        "f",
        &item,
        "-/-",
        None,
        "a.png",
        None,
        "screenshot",
        &stored("aa"),
        U,
    )
    .unwrap();
    let state = || -> String {
        c.query_row(
            "SELECT local_state FROM blobs WHERE sha256 = ?1",
            ["aa".repeat(32)],
            |r| r.get(0),
        )
        .unwrap()
    };
    // Completed without the option keeps them.
    close_run(&c, &run, "completed", false, U).unwrap();
    assert!(read_draft(&c, &item).unwrap().is_some());
    assert_eq!(state(), "present");
    update_run(&c, &run, &run_input(&p, json!({"status": "in_progress"}))).unwrap();
    close_run(&c, &run, "aborted", false, U).unwrap();
    assert!(read_draft(&c, &item).unwrap().is_none());
    assert_eq!(state(), "deleting");
    assert_eq!(
        count(&c, "SELECT count(*) FROM attachments WHERE owner_entity = 'execution_draft' AND deleted_at IS NULL"),
        0
    );
    assert!(close_run(&c, &run, "in_progress", false, U).is_err());
}

#[test]
fn a_draft_file_whose_step_is_not_recorded_goes_to_the_result() {
    let c = device();
    let (_, case, _, item) = simple(&c);
    let data = case_data(&c, &case);
    let pay = id_at(&data, &["steps", "1"]);
    let a = Uuid::new_v4().to_string();
    draft_with(&c, &item, "-/-", &a);
    add_draft_attachment(
        &c,
        "f",
        &item,
        "-/-",
        Some(&pay),
        "a.png",
        None,
        "screenshot",
        &stored("aa"),
        U,
    )
    .unwrap();
    // The attempt records only the first step.
    let input = attempt(
        &item,
        "passed",
        json!({"attemptId": a, "steps": [{"stepId": id_at(&data, &["steps", "0"]), "text": "open", "status": "passed"}]}),
    );
    let id = record_from_draft(&c, &input).unwrap();
    let owner: (String, String) = c
        .query_row(
            "SELECT owner_entity, owner_id FROM attachments WHERE id = 'f'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(owner, ("result".to_string(), id));
}

#[test]
fn attaching_to_a_closed_run_removes_the_file_it_wrote() {
    let c = device();
    let (_, _, run, item) = simple(&c);
    let dir = std::env::temp_dir().join(format!("pharos-attach-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let store = evidence::EvidenceStore::new(&dir, &[7u8; 32]);
    let file = |name: &'static str| DraftFile {
        run_item_id: &item,
        target_key: "-/-",
        step_id: None,
        name,
        mime: Some("image/png"),
        kind: "screenshot",
        user: U,
    };
    let upload = |bytes: &[u8]| {
        let mut w = store.writer(1024 * 1024).unwrap();
        w.write(bytes).unwrap();
        w
    };
    let ok = attach_upload(&c, &store, upload(b"first capture"), &file("a.png")).unwrap();
    let kept: String = c
        .query_row(
            "SELECT sha256 FROM attachments WHERE id = ?1",
            [&ok.id],
            |r| r.get(0),
        )
        .unwrap();
    assert!(store.exists(&kept));
    close_run(&c, &run, "completed", false, U).unwrap();
    let before = std::fs::read_dir(&dir).unwrap().count();
    assert!(attach_upload(&c, &store, upload(b"a new capture"), &file("b.png")).is_err());
    // The refused upload left no file; the existing one is untouched.
    let sha = {
        use sha2::{Digest, Sha256};
        evidence::hex(&Sha256::digest(b"a new capture"))
    };
    assert!(!store.exists(&sha));
    assert!(store.exists(&kept));
    assert_eq!(std::fs::read_dir(&dir).unwrap().count(), before);
    drop(store);
    let _ = std::fs::remove_dir_all(&dir);
}
