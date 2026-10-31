//! Runs, items and results (EJE-01): repository rules, immutability, the
//! derived final and flaky, and the sync between devices (ADR-0013 "Tests de
//! actualización": the same import on two devices leaves one copy, two
//! simultaneous manual attempts are both kept and the pull does not fail).

use rusqlite::Connection;
use serde_json::{json, Value};

use super::*;
use crate::db::{in_tx, run_migrations};
use crate::{purge, requirement, revisions, sync, test_case};

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

fn new_case(c: &Connection, project: &str, data: Value) -> String {
    let input: test_case::TestCaseInput = serde_json::from_value(json!({
        "projectId": project, "title": "Pay", "author": "Ada", "data": data, "userId": U
    }))
    .unwrap();
    test_case::insert_case(c, &input).unwrap()
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
    let mut v = json!({"projectId": project, "title": "Smoke", "userId": U});
    if let (Value::Object(m), Value::Object(e)) = (&mut v, extra) {
        m.extend(e);
    }
    serde_json::from_value(v).unwrap()
}

fn item(case: &str) -> RunItemInput {
    serde_json::from_value(json!({ "testCaseId": case })).unwrap()
}

fn result(item: &str, status: &str, extra: Value) -> ResultInput {
    let mut v = json!({"runItemId": item, "status": status, "userId": U});
    if let (Value::Object(m), Value::Object(e)) = (&mut v, extra) {
        m.extend(e);
    }
    serde_json::from_value(v).unwrap()
}

fn count(c: &Connection, sql: &str) -> i64 {
    c.query_row(sql, [], |r| r.get(0)).unwrap()
}

/// A project with one case of two steps, a run and an item of it.
fn setup(c: &Connection) -> (String, String, String, String) {
    let p = new_project(c);
    let case = new_case(c, &p, json!({"steps": ["open", "pay"]}));
    let run = insert_run(c, &run_input(&p, json!({}))).unwrap();
    let items = add_items(c, &run, U, &[item(&case)]).unwrap();
    (p, case, run, items[0].clone())
}

fn step_ids(c: &Connection, case: &str) -> Vec<String> {
    case_data(c, case)["steps"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["id"].as_str().unwrap().to_string())
        .collect()
}

// ---- repository -------------------------------------------------------------

#[test]
fn runs_get_run_keys_and_their_context() {
    let c = device();
    let p = new_project(&c);
    let a = insert_run(
        &c,
        &run_input(
            &p,
            json!({"environment": "staging", "build": "1.4.2", "commitSha": "abc123",
                   "dataset": "users@3", "trigger": "ci", "context": {"node": "20"}}),
        ),
    )
    .unwrap();
    let b = insert_run(&c, &run_input(&p, json!({}))).unwrap();
    let a = get_run(&c, &a, U).unwrap().unwrap();
    let b = get_run(&c, &b, U).unwrap().unwrap();
    assert_eq!(
        (a.run_key.as_str(), b.run_key.as_str()),
        ("RUN-001", "RUN-002")
    );
    assert_eq!(a.status, "in_progress");
    assert_eq!(a.environment.as_deref(), Some("staging"));
    assert_eq!(a.trigger, "ci");
    assert_eq!(a.context, json!({"node": "20"}));
    assert!(a.started_at.is_some());
    assert_eq!(list_runs(&c, &p, U).unwrap().len(), 2);
    // Another account sees nothing and cannot write.
    assert!(get_run(&c, &a.id, "someone-else").unwrap().is_none());
    let mut foreign = run_input(&p, json!({}));
    foreign.user_id = "someone-else".into();
    assert!(insert_run(&c, &foreign).is_err());
    assert!(insert_run(&c, &run_input(&p, json!({"trigger": "cron"}))).is_err());
}

#[test]
fn a_run_header_is_edited_only_while_it_is_in_progress() {
    let c = device();
    let p = new_project(&c);
    let id = insert_run(&c, &run_input(&p, json!({}))).unwrap();
    update_run(&c, &id, &run_input(&p, json!({"build": "2.0"}))).unwrap();
    let r = get_run(&c, &id, U).unwrap().unwrap();
    assert_eq!(
        (r.build.as_deref(), r.revision, r.title.as_str()),
        (Some("2.0"), 2, "Smoke")
    );
    update_run(&c, &id, &run_input(&p, json!({"status": "completed"}))).unwrap();
    let r = get_run(&c, &id, U).unwrap().unwrap();
    assert_eq!(r.status, "completed");
    assert!(r.finished_at.is_some());
    assert_eq!(
        update_run(&c, &id, &run_input(&p, json!({"build": "3"}))).unwrap_err(),
        "run-closed"
    );
}

#[test]
fn an_item_freezes_the_case_revision_and_editing_the_case_does_not_move_it() {
    let c = device();
    let (p, case, run, item_id) = setup(&c);
    let frozen = revisions::current_id(&c, &case).unwrap().unwrap().0;
    let items = list_items(&c, &run, U).unwrap();
    assert_eq!(items[0].id, item_id);
    assert_eq!(items[0].test_case_revision_id, frozen);
    // Edit the case: the item still points at the revision it froze.
    let mut data = case_data(&c, &case);
    data["steps"][1]["text"] = json!("pay by card");
    let input: test_case::TestCaseInput = serde_json::from_value(json!({
        "projectId": p, "title": "Pay", "author": "Ada", "data": data, "userId": U
    }))
    .unwrap();
    test_case::update_case(&c, &case, &input).unwrap();
    assert_ne!(revisions::current_id(&c, &case).unwrap().unwrap().0, frozen);
    assert_eq!(
        list_items(&c, &run, U).unwrap()[0].test_case_revision_id,
        frozen
    );
    // A flow or row that is not in the revision is refused.
    let mut bad = item(&case);
    bad.flow_id = Some("no-such-flow".into());
    assert!(add_items(&c, &run, U, &[bad]).is_err());
    // A case of another project, too.
    let other = new_project(&c);
    let foreign = new_case(&c, &other, json!({}));
    assert!(add_items(&c, &run, U, &[item(&foreign)]).is_err());
}

#[test]
fn adding_items_is_one_audit_event_with_an_oplog_row_per_item() {
    let c = device();
    let p = new_project(&c);
    let a = new_case(&c, &p, json!({}));
    let b = new_case(&c, &p, json!({}));
    let run = insert_run(&c, &run_input(&p, json!({}))).unwrap();
    let events = count(&c, "SELECT count(*) FROM audit_log");
    add_items(&c, &run, U, &[item(&a), item(&b)]).unwrap();
    assert_eq!(count(&c, "SELECT count(*) FROM audit_log"), events + 1);
    let summary: String = c
        .query_row(
            "SELECT summary FROM audit_log ORDER BY rowid DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&summary).unwrap()["itemsAdded"],
        2
    );
    assert_eq!(
        count(&c, "SELECT count(*) FROM oplog WHERE entity = 'run_item'"),
        2
    );
}

#[test]
fn a_result_is_written_with_its_steps_and_one_execute_event() {
    let c = device();
    let (_, case, run, item_id) = setup(&c);
    let ids = step_ids(&c, &case);
    let id = record_result(
        &c,
        &result(
            &item_id,
            "failed",
            json!({"steps": [
                {"stepId": ids[0], "text": "open", "status": "passed"},
                {"stepId": ids[1], "text": "pay", "status": "failed", "actual": "500"}
            ], "errorMessage": "boom"}),
        ),
    )
    .unwrap();
    let views = list_results(&c, &run, U).unwrap();
    assert_eq!(views.len(), 1);
    let v = &views[0];
    assert_eq!(v.id, id);
    assert_eq!(v.test_key, format!("manual:{case}/-/-"));
    assert_eq!(v.attempt, 0);
    assert_eq!(v.case_key.as_deref(), Some("ATS_001"));
    assert_eq!(v.case_revision, Some(1));
    assert_eq!(v.executed_by, format!("user:{U}"));
    assert_eq!(v.steps.len(), 2);
    assert_eq!(v.steps[1].step_id.as_deref(), Some(ids[1].as_str()));
    assert_eq!(v.steps[1].actual.as_deref(), Some("500"));
    assert!(v.is_final && !v.flaky);
    let (action, entity): (String, String) = c
        .query_row(
            "SELECT action, entity FROM audit_log ORDER BY rowid DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!((action.as_str(), entity.as_str()), ("execute", "result"));
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM oplog WHERE entity = 'result' AND op = 'append'"
        ),
        1
    );
    // A step that is not in the frozen revision, or an unknown status: refused.
    let bad = json!({"steps": [{"stepId": "nope", "text": "x", "status": "passed"}]});
    assert!(record_result(&c, &result(&item_id, "passed", bad)).is_err());
    assert!(record_result(&c, &result(&item_id, "green", json!({}))).is_err());
    // A closed run takes no more attempts.
    update_run(
        &c,
        &run,
        &RunInput {
            status: Some("aborted".into()),
            user_id: U.into(),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(
        record_result(&c, &result(&item_id, "passed", json!({}))).unwrap_err(),
        "run-closed"
    );
}

#[test]
fn results_and_steps_never_change_once_written() {
    let c = device();
    let (_, case, _, item_id) = setup(&c);
    let ids = step_ids(&c, &case);
    let steps = json!({"steps": [{"stepId": ids[0], "text": "open", "status": "passed"}]});
    let id = record_result(&c, &result(&item_id, "passed", steps)).unwrap();
    for sql in [
        "UPDATE results SET status = 'failed' WHERE id = ?1",
        "UPDATE results SET attributes = '{\"x\":1}' WHERE id = ?1",
        "UPDATE step_results SET status = 'failed' WHERE result_id = ?1",
    ] {
        let e = c.execute(sql, [&id]).unwrap_err().to_string();
        assert!(e.contains("append-only"), "{sql}: {e}");
    }
    // The location may move (ADR-0019).
    c.execute(
        "UPDATE results SET workspace_id = 'w2' WHERE id = ?1",
        [&id],
    )
    .unwrap();
    // A pulled document with other content under the same id changes nothing.
    let mut doc = result_payload(&c, &id).unwrap().unwrap();
    doc["status"] = json!("failed");
    result_insert_if_absent(&c, U, &doc).unwrap();
    assert_eq!(list_results_status(&c, &id), "passed");
    // A shard too.
    c.execute(
        "INSERT INTO run_shards (id, workspace_id, project_id, run_id, source_format,
                source_file_sha256, imported_by, imported_at, hlc)
         VALUES ('s1', 'w', 'p', 'r', 'ctrf', 'aa', 'u', 'now', 'h')",
        [],
    )
    .unwrap();
    let e = c
        .execute(
            "UPDATE run_shards SET source_format = 'junit' WHERE id = 's1'",
            [],
        )
        .unwrap_err();
    assert!(e.to_string().contains("append-only"));
}

fn list_results_status(c: &Connection, id: &str) -> String {
    c.query_row("SELECT status FROM results WHERE id = ?1", [id], |r| {
        r.get(0)
    })
    .unwrap()
}

#[test]
fn a_new_attempt_is_the_final_one_and_failed_then_passed_is_flaky() {
    let c = device();
    let (_, _, run, item_id) = setup(&c);
    let first = record_result(
        &c,
        &result(
            &item_id,
            "failed",
            json!({"finishedAt": "2026-10-31T10:00:00Z"}),
        ),
    )
    .unwrap();
    let second = record_result(
        &c,
        &result(
            &item_id,
            "passed",
            json!({"finishedAt": "2026-10-31T10:05:00Z"}),
        ),
    )
    .unwrap();
    let views = list_results(&c, &run, U).unwrap();
    let by_id = |id: &str| views.iter().find(|v| v.id == id).unwrap().clone();
    assert_eq!((by_id(&first).attempt, by_id(&second).attempt), (0, 1));
    assert!(!by_id(&first).is_final);
    assert!(by_id(&second).is_final);
    assert!(by_id(&second).flaky);
}

#[test]
fn a_mapping_links_results_without_touching_them() {
    let c = device();
    let p = new_project(&c);
    let case = new_case(&c, &p, json!({}));
    let run = insert_run(&c, &run_input(&p, json!({"trigger": "import"}))).unwrap();
    let shard = ids::shard_id(&run, "aa");
    let rid = ids::imported_result_id(&shard, "tests/a.spec.ts::untagged", None, 0);
    let doc = json!({
        "id": rid, "projectId": p, "runId": run, "shardId": shard,
        "testKey": "tests/a.spec.ts::untagged", "status": "passed", "attempt": 0,
        "executedBy": "playwright", "createdBy": U, "createdAt": "2026-10-31 10:00:00", "hlc": "h",
    });
    result_insert_if_absent(&c, U, &doc).unwrap();
    assert_eq!(
        list_results(&c, &run, U).unwrap()[0].effective_test_case_id,
        None
    );
    let m = set_mapping(&c, &p, "tests/a.spec.ts::untagged", Some(&case), U).unwrap();
    assert_eq!(m, ids::unlinked_mapping_id(&p, "tests/a.spec.ts::untagged"));
    let v = &list_results(&c, &run, U).unwrap()[0];
    assert_eq!(v.effective_test_case_id.as_deref(), Some(case.as_str()));
    assert_eq!(v.test_case_id, None);
    // Withdrawn: the same rule, a new revision.
    assert_eq!(
        set_mapping(&c, &p, "tests/a.spec.ts::untagged", None, U).unwrap(),
        m
    );
    assert_eq!(
        list_results(&c, &run, U).unwrap()[0].effective_test_case_id,
        None
    );
    assert_eq!(count(&c, "SELECT revision FROM unlinked_mappings"), 2);
}

#[test]
fn requirement_risk_is_set_validated_and_synced() {
    let c = device();
    let p = new_project(&c);
    let input: requirement::RequirementInput =
        serde_json::from_value(json!({"projectId": p, "title": "R", "userId": U})).unwrap();
    let r = requirement::insert_requirement(&c, &input).unwrap();
    requirement::set_risk(&c, &r, Some(4), Some(5), U).unwrap();
    assert!(requirement::set_risk(&c, &r, Some(6), Some(1), U).is_err());
    let (payload, revision, _) = sync::read_payload(&c, "requirement", &r).unwrap().unwrap();
    assert_eq!(
        (
            payload["riskLikelihood"].clone(),
            payload["riskImpact"].clone()
        ),
        (json!(4), json!(5))
    );
    assert_eq!(revision, 2);
    assert_eq!(derive::risk_level(Some(4), Some(5)), Some(20));
}

// ---- sync between devices ----------------------------------------------------

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

/// Everything `from` pushes (lww, then append-only), as a pull hands it back.
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

fn entities(docs: &[Value]) -> Vec<String> {
    let mut e: Vec<String> = docs
        .iter()
        .map(|d| d["entity"].as_str().unwrap().to_string())
        .collect();
    e.sort();
    e.dedup();
    e
}

#[test]
fn a_run_its_items_and_results_travel_to_another_device() {
    let a = device();
    let (p, case, run, item_id) = setup(&a);
    let ids = step_ids(&a, &case);
    let rid = record_result(
        &a,
        &result(
            &item_id,
            "passed",
            json!({"steps": [{"stepId": ids[0], "text": "open", "status": "passed"}]}),
        ),
    )
    .unwrap();
    set_mapping(&a, &p, "k", Some(&case), U).unwrap();
    let docs = push(&a);
    for e in ["run", "run_item", "result", "unlinked_mapping"] {
        assert!(
            entities(&docs).contains(&e.to_string()),
            "{e} missing: {:?}",
            entities(&docs)
        );
    }
    let b = device();
    pull(&b, &docs);
    let run_b = get_run(&b, &run, U).unwrap().unwrap();
    assert_eq!(run_b.run_key, "RUN-001");
    assert_eq!(list_items(&b, &run, U).unwrap().len(), 1);
    let on_b = list_results(&b, &run, U).unwrap();
    assert_eq!(on_b.len(), 1);
    assert_eq!(on_b[0].id, rid);
    assert_eq!(on_b[0].steps.len(), 1);
    assert_eq!(on_b[0].steps[0].step_id.as_deref(), Some(ids[0].as_str()));
    // The same documents again change nothing.
    pull(&b, &docs);
    assert_eq!(count(&b, "SELECT count(*) FROM results"), 1);
    assert_eq!(count(&b, "SELECT count(*) FROM step_results"), 1);
    // B pushes nothing of it back.
    assert!(push(&b).is_empty());
}

#[test]
fn a_result_pulled_before_its_run_is_kept() {
    let a = device();
    let (_, _, run, item_id) = setup(&a);
    record_result(&a, &result(&item_id, "blocked", json!({}))).unwrap();
    let mut docs = push(&a);
    // The run header's later edit gives it a newer seq: results come first.
    docs.sort_by_key(|d| d["entity"] != "result");
    let b = device();
    pull(&b, &docs);
    assert_eq!(list_results(&b, &run, U).unwrap().len(), 1);
}

#[test]
fn the_same_import_on_two_devices_leaves_one_copy() {
    let (a, b) = (device(), device());
    let p = new_project(&a);
    let run = insert_run(&a, &run_input(&p, json!({"trigger": "import"}))).unwrap();
    pull(&b, &push(&a));
    // Both import the same file: deterministic shard and result ids.
    let shard = ids::shard_id(&run, "ab");
    for dev in [&a, &b] {
        let doc = json!({
            "id": shard, "projectId": p, "runId": run, "sourceFormat": "ctrf",
            "sourceFileSha256": "ab", "importedBy": U, "importedAt": "2026-10-31 10:00:00",
            "hlc": oplog::next_hlc(dev).unwrap(),
        });
        shard_insert_if_absent(dev, U, &doc).unwrap();
        let rid = ids::imported_result_id(&shard, "t", Some("chromium"), 0);
        let doc = json!({
            "id": rid, "projectId": p, "runId": run, "shardId": shard, "testKey": "t",
            "configurationLabel": "chromium", "attempt": 0, "status": "passed",
            "executedBy": "playwright", "createdBy": U, "createdAt": "now",
            "hlc": oplog::next_hlc(dev).unwrap(),
        });
        result_insert_if_absent(dev, U, &doc).unwrap();
        in_tx(dev, |tx| {
            journal::record_append(tx, RUN_SHARD, &shard, U)?;
            journal::record_append(tx, RESULT, &rid, U)
        })
        .unwrap();
    }
    let (from_a, from_b) = (push(&a), push(&b));
    pull(&a, &from_b);
    pull(&b, &from_a);
    for dev in [&a, &b] {
        assert_eq!(count(dev, "SELECT count(*) FROM run_shards"), 1);
        assert_eq!(count(dev, "SELECT count(*) FROM results"), 1);
    }
}

#[test]
fn two_simultaneous_manual_attempts_are_both_kept() {
    let a = device();
    let (_, _, run, item_id) = setup(&a);
    let b = device();
    pull(&b, &push(&a));
    // Both record "attempt 0" offline.
    record_result(&a, &result(&item_id, "failed", json!({}))).unwrap();
    record_result(&b, &result(&item_id, "passed", json!({}))).unwrap();
    let (from_a, from_b) = (push(&a), push(&b));
    pull(&a, &from_b);
    pull(&b, &from_a);
    for dev in [&a, &b] {
        let views = list_results(dev, &run, U).unwrap();
        assert_eq!(views.len(), 2);
        assert!(views.iter().all(|v| v.attempt == 0));
        // Both devices agree on the final one (time, attempt, then HLC).
        assert_eq!(views.iter().filter(|v| v.is_final).count(), 1);
    }
    let final_of = |dev: &Connection| {
        list_results(dev, &run, U)
            .unwrap()
            .into_iter()
            .find(|v| v.is_final)
            .unwrap()
            .id
    };
    assert_eq!(final_of(&a), final_of(&b));
}

#[test]
fn nothing_of_it_reaches_a_server_without_runs() {
    let c = Connection::open_in_memory().unwrap();
    run_migrations(&c).unwrap();
    sync::assume_server_features(&c, "key-conflicts,append-only,stable-steps");
    let (p, _, run, item_id) = setup(&c);
    record_result(&c, &result(&item_id, "passed", json!({}))).unwrap();
    let docs = push(&c);
    assert!(
        entities(&docs)
            .iter()
            .all(|e| !LWW_ENTITIES.contains(&e.as_str()) && !APPEND_ENTITIES.contains(&e.as_str())),
        "{:?}",
        entities(&docs)
    );
    assert_eq!(held_back(&c).unwrap(), 3); // run, run item, result
                                           // No run key blocks either.
    let requests = crate::key_sync::lease_requests(&c, U).unwrap();
    assert!(requests.iter().all(|r| r.kind != "run"));
    assert_eq!(get_run(&c, &run, U).unwrap().unwrap().run_key, "RUN-001"); // project unknown to the server
                                                                           // Once the server lists `runs`, they go out.
    sync::assume_server_features(&c, "key-conflicts,append-only,stable-steps,runs");
    let docs = push(&c);
    for e in ["run", "run_item", "result"] {
        assert!(entities(&docs).contains(&e.to_string()));
    }
    assert_eq!(held_back(&c).unwrap(), 0);
    let requests = crate::key_sync::lease_requests(&c, U).unwrap();
    assert!(requests
        .iter()
        .any(|r| r.kind == "run" && r.project_id == p));
}

#[test]
fn a_pulled_run_key_that_clashes_becomes_a_key_conflict() {
    let (a, b) = (device(), device());
    let p = new_project(&a);
    pull(&b, &push(&a));
    // The same number on both (a manual key, or a server that lost its
    // blocks): the pull must still not fail.
    for dev in [&a, &b] {
        keys::store_block(dev, KeyKind::Run, &p, 1, 50).unwrap();
    }
    let ra = insert_run(&a, &run_input(&p, json!({}))).unwrap();
    let rb = insert_run(&b, &run_input(&p, json!({}))).unwrap();
    // Both handed out RUN-001 (the project was never leased): B pulls A's.
    pull(&b, &push(&a));
    assert_eq!(get_run(&b, &ra, U).unwrap().unwrap().run_key, "RUN-001");
    let local = get_run(&b, &rb, U).unwrap().unwrap().run_key;
    assert!(keys::is_provisional(&local), "{local}");
    assert_eq!(
        count(
            &b,
            "SELECT count(*) FROM key_conflicts WHERE entity = 'run' AND resolved_at IS NULL"
        ),
        1
    );
}

#[test]
fn a_project_delete_takes_its_runs_and_the_purge_their_results() {
    let a = device();
    let (p, _, run, item_id) = setup(&a);
    record_result(&a, &result(&item_id, "passed", json!({}))).unwrap();
    let b = device();
    pull(&b, &push(&a));
    project::delete_project(&a, &p, U).unwrap();
    assert!(get_run(&a, &run, U).unwrap().is_none());
    assert_eq!(
        count(
            &a,
            "SELECT count(*) FROM run_items WHERE deleted_at IS NULL"
        ),
        0
    );
    // The server's cascade: tombstones for the project and its children.
    let mut docs = push(&a);
    for (entity, id) in [("run", run.clone()), ("run_item", item_id.clone())] {
        docs.push(json!({
            "entity": entity, "entityId": id, "payload": {}, "revision": 9,
            "hlc": oplog::next_hlc(&a).unwrap(), "op": "delete",
        }));
    }
    let rid: String = a
        .query_row("SELECT id FROM results", [], |r| r.get(0))
        .unwrap();
    docs.push(json!({
        "entity": "result", "entityId": rid, "payload": {}, "revision": 2,
        "hlc": oplog::next_hlc(&a).unwrap(), "op": "delete",
    }));
    pull(&b, &docs);
    assert!(get_run(&b, &run, U).unwrap().is_none());
    // The purge removes the run with its immutable rows, and a re-pull of the
    // result does not bring it back.
    for dev in [&a, &b] {
        // Everything already reached the server.
        dev.execute(
            "UPDATE oplog SET synced_at = datetime('now') WHERE synced_at IS NULL",
            [],
        )
        .unwrap();
        dev.execute("UPDATE runs SET deleted_at = '2000-01-01 00:00:00'", [])
            .unwrap();
        dev.execute(
            "UPDATE run_items SET deleted_at = '2000-01-01 00:00:00'",
            [],
        )
        .unwrap();
        dev.execute(
            "UPDATE test_cases SET deleted_at = '2000-01-01 00:00:00'",
            [],
        )
        .unwrap();
        dev.execute("UPDATE projects SET deleted_at = '2000-01-01 00:00:00'", [])
            .unwrap();
        purge::purge(dev, U, 30).unwrap();
        for t in ["runs", "run_items", "results", "step_results", "run_shards"] {
            assert_eq!(count(dev, &format!("SELECT count(*) FROM {t}")), 0, "{t}");
        }
    }
    let doc = result_payload(&a, &rid).unwrap();
    assert!(doc.is_none());
    let mut stale = json!({
        "id": rid, "projectId": p, "runId": run, "testKey": "k", "status": "passed",
    });
    result_insert_if_absent(&b, U, &stale).unwrap();
    assert_eq!(count(&b, "SELECT count(*) FROM results"), 0);
    stale["runId"] = json!("another-run");
    result_insert_if_absent(&b, U, &stale).unwrap();
    assert_eq!(count(&b, "SELECT count(*) FROM results"), 1);
}

#[test]
fn a_cursor_stored_before_the_execution_entities_restarts_at_zero() {
    let c = device();
    sync::cursor_set(&c, U, "42").unwrap();
    assert_eq!(sync::cursor_get(&c, U).unwrap(), "42");
    // As a build with the previous set of applied entities left it.
    c.execute(
        "UPDATE sync_state SET value = '2' WHERE key = ?1",
        [format!("cursor_set:{U}")],
    )
    .unwrap();
    assert_eq!(sync::cursor_get(&c, U).unwrap(), "0");
}

// ---- review: ids by kind, limits, purge, orphans -------------------------------

/// An advanced case: background, main steps and rows, and one flow with its
/// own steps and rows.
fn advanced_case(c: &Connection, p: &str) -> (String, Value) {
    let case = new_case(
        c,
        p,
        json!({
            "background": ["logged in"],
            "steps": ["main step"],
            "examples": {"rows": [["a"]]},
            "flows": [{"name": "Refund", "steps": ["flow step"], "examples": {"rows": [["x"]]}}]
        }),
    );
    (case.clone(), case_data(c, &case))
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

#[test]
fn flows_rows_and_steps_are_checked_by_kind() {
    let c = device();
    let p = new_project(&c);
    let (case, data) = advanced_case(&c, &p);
    let flow = data["flows"][0]["id"].as_str().unwrap().to_string();
    let background = id_at(&data, &["background", "0"]);
    let main_step = id_at(&data, &["steps", "0"]);
    let main_row = id_at(&data, &["examples", "rows", "0"]);
    let flow_step = id_at(&data, &["flows", "0", "steps", "0"]);
    let flow_row = id_at(&data, &["flows", "0", "examples", "rows", "0"]);
    let run = insert_run(&c, &run_input(&p, json!({}))).unwrap();
    let item_with = |flow: Option<&str>, row: Option<&str>| -> RunItemInput {
        serde_json::from_value(json!({"testCaseId": case, "flowId": flow, "exampleRowId": row}))
            .unwrap()
    };
    // A step id is not a flow; a flow's row is not a main row, nor the reverse.
    for (flow_id, row) in [
        (Some(main_step.as_str()), None),
        (None, Some(flow_row.as_str())),
        (Some(flow.as_str()), Some(main_row.as_str())),
        (None, Some(main_step.as_str())),
    ] {
        assert!(
            add_items(&c, &run, U, &[item_with(flow_id, row)]).is_err(),
            "{flow_id:?} {row:?}"
        );
    }
    let main_item = add_items(&c, &run, U, &[item_with(None, Some(&main_row))]).unwrap();
    let flow_item = add_items(&c, &run, U, &[item_with(Some(&flow), Some(&flow_row))]).unwrap();
    let steps = |id: &str| json!({"steps": [{"stepId": id, "text": "x", "status": "passed"}]});
    // The main flow takes the background and its steps, not a flow's.
    assert!(record_result(&c, &result(&main_item[0], "passed", steps(&background))).is_ok());
    assert!(record_result(&c, &result(&main_item[0], "passed", steps(&main_step))).is_ok());
    assert!(record_result(&c, &result(&main_item[0], "passed", steps(&flow_step))).is_err());
    assert!(record_result(&c, &result(&main_item[0], "passed", steps(&main_row))).is_err());
    // A flow takes the background and its own steps, not the main ones.
    assert!(record_result(&c, &result(&flow_item[0], "passed", steps(&background))).is_ok());
    assert!(record_result(&c, &result(&flow_item[0], "passed", steps(&flow_step))).is_ok());
    assert!(record_result(&c, &result(&flow_item[0], "passed", steps(&main_step))).is_err());
    assert!(record_result(&c, &result(&flow_item[0], "passed", steps(&flow))).is_err());
}

#[test]
fn the_server_limits_are_checked_before_writing() {
    let c = device();
    let p = new_project(&c);
    let long = "x".repeat(MAX_TITLE + 1);
    assert!(insert_run(&c, &run_input(&p, json!({ "title": long })))
        .unwrap_err()
        .starts_with("title-too-long"));
    // UTF-16 units, as the server counts: 250 emoji are 500 units.
    let emoji = "😀".repeat(MAX_TITLE / 2);
    let run = insert_run(&c, &run_input(&p, json!({ "title": emoji }))).unwrap();
    let longer = format!("{emoji}a");
    assert!(update_run(&c, &run, &run_input(&p, json!({ "title": longer }))).is_err());
    let case = new_case(&c, &p, json!({}));
    let item_ids = add_items(&c, &run, U, &[item(&case)]).unwrap();
    let many: Vec<Value> = (0..=MAX_STEPS)
        .map(|_| json!({"text": "s", "status": "passed"}))
        .collect();
    assert!(record_result(
        &c,
        &result(&item_ids[0], "passed", json!({ "steps": many }))
    )
    .unwrap_err()
    .starts_with("steps-too-many"));
    let key = "k".repeat(MAX_TEST_KEY + 1);
    assert!(set_mapping(&c, &p, &key, None, U)
        .unwrap_err()
        .starts_with("testKey-too-long"));
    assert_eq!(count(&c, "SELECT count(*) FROM results"), 0);
}

#[test]
fn a_case_with_an_open_key_conflict_cannot_be_frozen() {
    let c = device();
    let p = new_project(&c);
    let case = new_case(&c, &p, json!({}));
    let run = insert_run(&c, &run_input(&p, json!({}))).unwrap();
    crate::key_sync::vacate(&c, U, "test_case", &case, "other").unwrap();
    assert!(add_items(&c, &run, U, &[item(&case)])
        .unwrap_err()
        .starts_with("case-key-conflict"));
}

/// Marks everything synced, as if the server had it all.
fn all_synced(c: &Connection) {
    c.execute(
        "UPDATE oplog SET synced_at = datetime('now') WHERE synced_at IS NULL",
        [],
    )
    .unwrap();
    c.execute(
        "INSERT OR IGNORE INTO sync_base (user_id, entity, entity_id, revision, hlc)
         SELECT ?1, 'run', id, revision, '' FROM runs",
        [U],
    )
    .unwrap();
}

fn expire_project(c: &Connection) {
    for t in ["runs", "run_items", "test_cases", "projects"] {
        c.execute(
            &format!("UPDATE {t} SET deleted_at = '2000-01-01 00:00:00'"),
            [],
        )
        .unwrap();
    }
}

#[test]
fn the_purge_waits_for_pending_results_and_forgets_their_journal() {
    let c = device();
    let (p, _, _, item_id) = setup(&c);
    all_synced(&c);
    record_result(&c, &result(&item_id, "passed", json!({}))).unwrap();
    project::delete_project(&c, &p, U).unwrap();
    // Everything but the result reached the server.
    c.execute(
        "UPDATE oplog SET synced_at = datetime('now') WHERE entity <> 'result'",
        [],
    )
    .unwrap();
    expire_project(&c);
    purge::purge(&c, U, 30).unwrap();
    assert_eq!(
        count(&c, "SELECT count(*) FROM runs"),
        1,
        "held by its result"
    );
    assert_eq!(count(&c, "SELECT count(*) FROM results"), 1);
    // Once the result is pushed, the run goes with it and leaves no journal.
    all_synced(&c);
    purge::purge(&c, U, 30).unwrap();
    for t in ["runs", "results", "step_results"] {
        assert_eq!(count(&c, &format!("SELECT count(*) FROM {t}")), 0, "{t}");
    }
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM oplog WHERE entity IN ('result', 'run_shard', 'run', 'run_item')"
        ),
        0
    );
}

#[test]
fn stale_results_without_a_run_are_swept_fresh_ones_wait() {
    let c = device();
    let p = new_project(&c);
    let doc = |id: &str, run: &str, project: &str, at: &str| {
        json!({"id": id, "projectId": project, "runId": run, "testKey": "t", "status": "passed",
               "createdAt": at, "steps": [{"text": "s", "status": "passed"}]})
    };
    // Pulled before its run: fresh, kept.
    result_insert_if_absent(&c, U, &doc("fresh", "r-later", &p, "2999-01-01 00:00:00")).unwrap();
    // Its project is gone and it is old: swept, with its steps and journal.
    result_insert_if_absent(
        &c,
        U,
        &doc("stale", "r-gone", "p-gone", "2000-01-01 00:00:00"),
    )
    .unwrap();
    c.execute(
        "INSERT INTO oplog (id, entity, entity_id, op, payload, revision, author, created_at, hlc, user_id)
         VALUES ('o1', 'result', 'stale', 'append', '{}', 1, 'a', 'now', 'h', ?1)",
        [U],
    )
    .unwrap();
    // A live project whose run is missing: kept, however old.
    result_insert_if_absent(&c, U, &doc("live", "r-x", &p, "2000-01-01 00:00:00")).unwrap();
    purge::purge(&c, U, 30).unwrap();
    let left: Vec<String> = c
        .prepare("SELECT id FROM results ORDER BY id")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap();
    assert_eq!(left, vec!["fresh", "live"]);
    assert_eq!(count(&c, "SELECT count(*) FROM step_results"), 2);
    assert_eq!(
        count(&c, "SELECT count(*) FROM oplog WHERE entity_id = 'stale'"),
        0
    );
}

#[test]
fn only_the_purge_deletes_immutable_rows() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = vec![];
    for d in [dir.clone(), dir.join("runs")] {
        for entry in std::fs::read_dir(&d).unwrap() {
            files.push(entry.unwrap().path());
        }
    }
    for path in files {
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        if !name.ends_with(".rs") || name == "purge.rs" || name.contains("tests") {
            continue;
        }
        let text = std::fs::read_to_string(&path).unwrap();
        let production = text
            .split("mod tests {")
            .next()
            .unwrap()
            .to_ascii_uppercase();
        for table in ["RESULTS", "STEP_RESULTS", "RUN_SHARDS"] {
            assert!(
                !production.contains(&format!("DELETE FROM {table}")),
                "{name} deletes from {table}; only purge.rs may"
            );
        }
    }
}
