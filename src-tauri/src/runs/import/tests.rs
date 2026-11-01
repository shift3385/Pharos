//! Import (ING-02..05): the normalized ING-01 snapshots the TS parsers commit
//! (`src/shared/contracts/pharos-run/fixtures/ing01/normalized/`) stored end
//! to end: linking by tag, the revision at the run's start, run items, flows,
//! rows and step ids, the tray, re-import as a no-op, two devices converging,
//! the limits, and attachments.

use rusqlite::{params, Connection};
use serde_json::{json, Value};

use super::*;
use crate::db::{in_tx, run_migrations};
use crate::runs::{add_items, get_run, list_results, set_mapping, RunItemInput};
use crate::{sync, test_case};

const U: &str = "11111111-1111-4111-8111-111111111111";
const SHA: &str = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

macro_rules! snapshot {
    ($name:literal) => {
        include_str!(concat!(
            "../../../../src/shared/contracts/pharos-run/fixtures/ing01/normalized/",
            $name,
            ".json"
        ))
    };
}

fn doc_of(snapshot: &str) -> Value {
    serde_json::from_str::<Value>(snapshot).unwrap()["doc"].clone()
}

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

fn new_case(c: &Connection, project: &str, key: &str, data: Value) -> String {
    let input: test_case::TestCaseInput = serde_json::from_value(json!({
        "projectId": project, "scenarioId": key, "title": key, "author": "Ada", "data": data,
        "userId": U
    }))
    .unwrap();
    test_case::insert_case(c, &input).unwrap()
}

/// The three cases of the ING-01 fixture: TC-001 (three steps), TC-002 (an
/// Outline with two rows), TC-003.
fn ing01_cases(c: &Connection, p: &str) -> (String, String, String) {
    let a = new_case(
        c,
        p,
        "TC-001",
        json!({"steps": [
            "el usuario \"qa@pharos.dev\" esta registrado",
            "inicia sesion con contrasena valida",
            "ve el panel principal"
        ]}),
    );
    let b = new_case(
        c,
        p,
        "TC-002",
        json!({"gherkinLevel": "outline",
               "steps": ["inicia sesion con \"<email>\" y \"<clave>\"", "el resultado es \"<esperado>\""],
               "examples": {"headers": ["email", "clave", "esperado"],
                            "rows": [["x@y", "mala", "ok"], ["z@y", "peor", "fallo"]]}}),
    );
    let d = new_case(
        c,
        p,
        "TC-003",
        json!({"steps": ["la sesion esta expirada", "la sesion se renueva al segundo intento"]}),
    );
    (a, b, d)
}

fn request(p: &str, doc: Value, extra: Value) -> ReportImportRequest {
    let mut v = json!({"projectId": p, "userId": U, "doc": doc, "sha256": SHA,
                       "fileName": "report.json"});
    if let (Value::Object(m), Value::Object(e)) = (&mut v, extra) {
        m.extend(e);
    }
    serde_json::from_value(v).unwrap()
}

fn new_run(p: &str, doc: Value) -> ReportImportRequest {
    request(
        p,
        doc,
        json!({"newRun": {"title": "CI #12", "build": "1.4.2"}}),
    )
}

fn stored() -> Stored {
    Stored {
        sha256: SHA.into(),
        size: 1234,
    }
}

fn import(c: &Connection, req: &ReportImportRequest) -> Result<ReportImportOutcome, String> {
    in_tx(c, |tx| commit(tx, req, &stored()))
}

fn count(c: &Connection, sql: &str) -> i64 {
    c.query_row(sql, [], |r| r.get(0)).unwrap()
}

fn row_ids(c: &Connection, case: &str) -> Vec<String> {
    let data: String = c
        .query_row("SELECT data FROM test_cases WHERE id = ?1", [case], |r| {
            r.get(0)
        })
        .unwrap();
    let data: Value = serde_json::from_str(&data).unwrap();
    data["examples"]["rows"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["id"].as_str().unwrap().to_string())
        .collect()
}

// ---- linking ---------------------------------------------------------------------

#[test]
fn a_ctrf_report_links_by_tag_rows_and_steps_into_a_new_closed_run() {
    let c = device();
    let p = new_project(&c);
    let (tc1, tc2, tc3) = ing01_cases(&c, &p);
    let out = import(&c, &new_run(&p, doc_of(snapshot!("single__ctrf.json")))).unwrap();
    assert!(!out.already_imported);
    assert_eq!((out.results, out.linked, out.unlinked), (6, 6, 0));
    let run = get_run(&c, &out.run_id, U).unwrap().unwrap();
    assert_eq!(
        (
            run.trigger.as_str(),
            run.status.as_str(),
            run.run_key.as_str()
        ),
        ("import", "completed", "RUN-001")
    );
    assert_eq!(run.title, "CI #12");
    assert_eq!(run.build.as_deref(), Some("1.4.2"));
    assert_eq!(run.source_tool.as_deref(), Some("playwright"));
    let results = list_results(&c, &out.run_id, U).unwrap();
    // TC-003: failed then passed, declared flaky by the tool.
    let flaky: Vec<_> = results
        .iter()
        .filter(|r| r.effective_test_case_id.as_deref() == Some(tc3.as_str()))
        .collect();
    assert_eq!(flaky.len(), 2);
    assert!(flaky
        .iter()
        .any(|r| r.is_final && r.flaky && r.status == "passed"));
    // TC-002's rows resolve to the case's row ids; its two attempts of row 2 too.
    let rows = row_ids(&c, &tc2);
    let outline: Vec<_> = results
        .iter()
        .filter(|r| r.effective_test_case_id.as_deref() == Some(tc2.as_str()))
        .collect();
    assert_eq!(outline.len(), 3);
    assert!(outline
        .iter()
        .any(|r| r.effective_example_row_id.as_deref() == Some(rows[0].as_str())));
    assert_eq!(
        outline
            .iter()
            .filter(|r| r.effective_example_row_id.as_deref() == Some(rows[1].as_str()))
            .count(),
        2
    );
    // TC-001's steps match the revision's texts once the keyword is split off.
    let one = results
        .iter()
        .find(|r| r.effective_test_case_id.as_deref() == Some(tc1.as_str()))
        .unwrap();
    assert_eq!(one.steps.len(), 3);
    assert_eq!(one.steps[0].keyword.as_deref(), Some("Given"));
    assert!(
        one.effective_step_ids.iter().all(Option::is_some),
        "{:?}",
        one.effective_step_ids
    );
    // The Outline steps match their `<param>` templates.
    assert!(outline
        .iter()
        .all(|r| r.effective_step_ids.iter().all(Option::is_some)));
    // The link is derived (B1): nothing of it is stored in the result.
    assert!(results.iter().all(|r| r.test_case_id.is_none()
        && r.test_case_revision_id.is_none()
        && r.steps.iter().all(|s| s.step_id.is_none())));
    assert!(one.effective_revision_id.is_some());
    assert!(one.executed_by.starts_with("tool:"));
    // Ids are deterministic: shard by run and file, steps by result and position.
    assert_eq!(out.shard_id, ids::shard_id(&out.run_id, SHA, 1));
    assert_eq!(
        one.id,
        ids::imported_result_id(&out.shard_id, &one.test_key, None, 0)
    );
    assert_eq!(one.steps[1].id, ids::imported_step_result_id(&one.id, 1));
    // One shard, its raw report and one `import` event with the counts.
    assert_eq!(count(&c, "SELECT count(*) FROM run_shards"), 1);
    assert_eq!(
        count(&c, "SELECT count(*) FROM attachments WHERE owner_entity = 'run_shard' AND kind = 'raw_report'"),
        1
    );
    let summary: String = c
        .query_row(
            "SELECT summary FROM audit_log WHERE action = 'import'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let summary: Value = serde_json::from_str(&summary).unwrap();
    assert_eq!(
        (summary["results"].as_i64(), summary["linked"].as_i64()),
        (Some(6), Some(6))
    );
    // The report's attachments come back as targets.
    assert!(out.attachments.iter().all(|a| a.owner_entity == "result"));
    assert_eq!(out.attachments.len(), 3);
}

#[test]
fn messages_attempts_hooks_and_step_attachments_are_kept() {
    let c = device();
    let p = new_project(&c);
    let (_, _, tc3) = ing01_cases(&c, &p);
    let out = import(
        &c,
        &new_run(&p, doc_of(snapshot!("single__cucumber-messages.ndjson"))),
    )
    .unwrap();
    assert_eq!(out.results, 6);
    let results = list_results(&c, &out.run_id, U).unwrap();
    let three: Vec<_> = results
        .iter()
        .filter(|r| r.effective_test_case_id.as_deref() == Some(tc3.as_str()))
        .collect();
    assert_eq!(
        three.iter().map(|r| r.attempt).collect::<Vec<_>>(),
        vec![0, 1]
    );
    // Derived flaky: failed, then passed (the After Hooks SKIPPED is ignored).
    assert!(three
        .iter()
        .any(|r| r.is_final && r.flaky && r.status == "passed"));
    assert!(results
        .iter()
        .all(|r| r.steps.iter().all(|s| s.gherkin_line.is_some())));
}

#[test]
fn junit_links_only_with_the_test_id_property() {
    let c = device();
    let p = new_project(&c);
    ing01_cases(&c, &p);
    let plain = import(&c, &new_run(&p, doc_of(snapshot!("single__pw-junit.xml")))).unwrap();
    assert_eq!(plain.linked, 0);
    let req = request(
        &p,
        doc_of(snapshot!("ann__pw-junit.xml")),
        json!({"newRun": {}, "sha256": "aa".repeat(32)}),
    );
    let ann = in_tx(&c, |tx| {
        commit(
            tx,
            &req,
            &Stored {
                sha256: "aa".repeat(32),
                size: 1,
            },
        )
    })
    .unwrap();
    assert_eq!(ann.linked, ann.results);
}

#[test]
fn tests_without_one_case_tag_go_to_the_tray_with_their_reason() {
    let c = device();
    let p = new_project(&c);
    let (tc1, _, _) = ing01_cases(&c, &p);
    let doc = json!({"schemaVersion": "1.0.0", "shards": [{"sourceFormat": "pharos_run_json"}],
    "results": [
        {"name": "none", "status": "passed", "testKey": "a::none"},
        {"name": "two", "status": "failed", "testKey": "a::two", "tags": ["@TC-001", "@TC-002"]},
        {"name": "gone", "status": "passed", "testKey": "a::gone", "tags": ["@TC-999"]},
        {"name": "other prefix", "status": "passed", "testKey": "a::x", "tags": ["@TC-0011x", "@REQ-1"]},
        {"name": "ok", "status": "passed", "testKey": "a::ok", "tags": ["@TC-001"]}
    ]});
    let out = import(&c, &new_run(&p, doc)).unwrap();
    assert_eq!((out.linked, out.unlinked), (1, 4));
    let codes: Vec<_> = out.warnings.iter().map(|w| w.code.as_str()).collect();
    assert!(codes.contains(&"two-case-tags") && codes.contains(&"unknown-case"));
    let tray = unlinked_list(&c, &p, U).unwrap();
    let reason = |k: &str| {
        tray.iter()
            .find(|t| t.test_key == k)
            .and_then(|t| t.reason.clone())
    };
    assert_eq!(tray.len(), 4);
    assert_eq!(reason("a::none").as_deref(), Some("no-tag"));
    assert_eq!(reason("a::two").as_deref(), Some("two-case-tags"));
    assert_eq!(reason("a::gone").as_deref(), Some("unknown-case"));
    assert_eq!(reason("a::x").as_deref(), Some("no-tag"));
    assert_eq!(
        tray.iter()
            .find(|t| t.test_key == "a::gone")
            .unwrap()
            .case_key
            .as_deref(),
        Some("TC-999")
    );
    // A later link (ING-05) shows in the tray and in the results, which stay as they were.
    in_tx(&c, |tx| set_mapping(tx, &p, "a::none", Some(&tc1), U)).unwrap();
    let tray = unlinked_list(&c, &p, U).unwrap();
    assert_eq!(
        tray.iter()
            .find(|t| t.test_key == "a::none")
            .unwrap()
            .mapped_case_id
            .as_deref(),
        Some(tc1.as_str())
    );
    let r = list_results(&c, &out.run_id, U).unwrap();
    let none = r.iter().find(|x| x.test_key == "a::none").unwrap();
    assert_eq!(
        (
            none.test_case_id.as_deref(),
            none.effective_test_case_id.as_deref()
        ),
        (None, Some(tc1.as_str()))
    );
    // Nobody else sees the tray.
    assert!(unlinked_list(&c, &p, "someone-else").unwrap().is_empty());
}

#[test]
fn the_revision_is_the_one_current_when_the_run_started() {
    let c = device();
    let p = new_project(&c);
    let (tc1, _, _) = ing01_cases(&c, &p);
    let first: String = c
        .query_row(
            "SELECT id FROM test_case_revisions WHERE test_case_id = ?1 AND content_sha256 IS NOT NULL",
            [&tc1],
            |r| r.get(0),
        )
        .unwrap();
    c.execute(
        "UPDATE test_case_revisions SET created_at = '2026-01-01 00:00:00'",
        [],
    )
    .unwrap();
    let input: test_case::TestCaseInput = serde_json::from_value(json!({
        "projectId": p, "scenarioId": "TC-001", "title": "TC-001 v2", "author": "Ada",
        "data": {"steps": ["something else"]}, "userId": U
    }))
    .unwrap();
    test_case::update_case(&c, &tc1, &input).unwrap();
    let doc = |at: &str| {
        json!({"schemaVersion": "1.0.0", "run": {"startedAt": at},
               "shards": [{"sourceFormat": "pharos_run_json"}],
               "results": [{"name": "t", "status": "passed", "testKey": "k", "tags": ["@TC-001"]}]})
    };
    let old = import(&c, &new_run(&p, doc("2026-06-01T00:00:00Z"))).unwrap();
    let r = list_results(&c, &old.run_id, U).unwrap();
    assert_eq!(r[0].effective_revision_id.as_deref(), Some(first.as_str()));
    // Before every revision: the oldest one, never the current state (S2).
    let req = request(
        &p,
        doc("2020-01-01T00:00:00Z"),
        json!({"newRun": {}, "allowDuplicate": true}),
    );
    let early = import(&c, &req).unwrap();
    let r = list_results(&c, &early.run_id, U).unwrap();
    assert_eq!(r[0].effective_revision_id.as_deref(), Some(first.as_str()));
    // After the edit: the edited revision.
    let req = request(
        &p,
        doc("2099-01-01T00:00:00Z"),
        json!({"newRun": {}, "allowDuplicate": true, "sha256": "cc".repeat(32)}),
    );
    let late = in_tx(&c, |tx| {
        commit(
            tx,
            &req,
            &Stored {
                sha256: "cc".repeat(32),
                size: 1,
            },
        )
    })
    .unwrap();
    let r = list_results(&c, &late.run_id, U).unwrap();
    assert_ne!(r[0].effective_revision_id.as_deref(), Some(first.as_str()));
    assert_eq!(r[0].effective_case_revision, Some(2));
}

#[test]
fn a_result_fulfils_the_target_runs_item_against_its_frozen_revision() {
    let c = device();
    let p = new_project(&c);
    let (tc1, _, _) = ing01_cases(&c, &p);
    let run = crate::runs::insert_run(
        &c,
        &serde_json::from_value(json!({"projectId": p, "title": "Cycle run", "userId": U}))
            .unwrap(),
    )
    .unwrap();
    let item: RunItemInput = serde_json::from_value(json!({"testCaseId": tc1})).unwrap();
    let items = add_items(&c, &run, U, &[item]).unwrap();
    let doc = json!({"schemaVersion": "1.0.0", "shards": [{"sourceFormat": "pharos_run_json"}],
        "results": [{"name": "t", "status": "failed", "testKey": "k", "tags": ["@TC-001"]}]});
    let out = import(&c, &request(&p, doc, json!({"runId": run}))).unwrap();
    let r = list_results(&c, &out.run_id, U).unwrap();
    assert_eq!(
        r[0].effective_run_item_id.as_deref(),
        Some(items[0].as_str())
    );
    // Importing into an existing run leaves it open.
    assert_eq!(get_run(&c, &run, U).unwrap().unwrap().status, "in_progress");
}

#[test]
fn advanced_cases_link_by_flow_name() {
    let c = device();
    let p = new_project(&c);
    let tc = new_case(
        &c,
        &p,
        "TC-001",
        json!({"gherkinLevel": "advanced", "flows": [
            {"name": "Pago ok", "steps": ["paga"], "expectedResult": ""},
            {"name": "Pago rechazado", "steps": ["paga mal"], "expectedResult": ""}]}),
    );
    let doc = json!({"schemaVersion": "1.0.0", "shards": [{"sourceFormat": "pharos_run_json"}],
        "results": [{"name": "Pago rechazado", "status": "failed", "testKey": "f::Pago rechazado",
                     "tags": ["@TC-001"], "steps": [{"text": "paga mal", "keyword": "When", "status": "failed"}]}]});
    let out = import(&c, &new_run(&p, doc)).unwrap();
    let r = &list_results(&c, &out.run_id, U).unwrap()[0];
    let data: String = c
        .query_row("SELECT data FROM test_cases WHERE id = ?1", [&tc], |r| {
            r.get(0)
        })
        .unwrap();
    let data: Value = serde_json::from_str(&data).unwrap();
    assert_eq!(
        r.effective_flow_id.as_deref(),
        data["flows"][1]["id"].as_str()
    );
    assert_eq!(
        r.effective_step_ids[0].as_deref(),
        data["flows"][1]["steps"][0]["id"].as_str()
    );
}

// ---- idempotence and devices ----------------------------------------------------

#[test]
fn re_importing_the_same_file_into_the_run_writes_nothing() {
    let c = device();
    let p = new_project(&c);
    ing01_cases(&c, &p);
    let doc = doc_of(snapshot!("shard1__ctrf.json"));
    let req = request(&p, doc.clone(), json!({"newRun": {"keepOpen": true}}));
    let first = import(&c, &req).unwrap();
    assert_eq!(
        get_run(&c, &first.run_id, U).unwrap().unwrap().status,
        "in_progress"
    );
    let before = (
        count(&c, "SELECT count(*) FROM results"),
        count(&c, "SELECT count(*) FROM oplog"),
        count(&c, "SELECT count(*) FROM audit_log"),
    );
    let again = import(
        &c,
        &request(&p, doc.clone(), json!({"runId": first.run_id})),
    )
    .unwrap();
    assert!(again.already_imported);
    assert_eq!(again.shard_id, first.shard_id);
    assert_eq!(again.attachments, first.attachments);
    let after = (
        count(&c, "SELECT count(*) FROM results"),
        count(&c, "SELECT count(*) FROM oplog"),
        count(&c, "SELECT count(*) FROM audit_log"),
    );
    assert_eq!(before, after);
    // As a new run, the same file is refused unless the user says so.
    let dup = import(&c, &new_run(&p, doc.clone())).unwrap_err();
    assert_eq!(dup, "already-imported: RUN-001");
    let req = request(&p, doc, json!({"newRun": {}, "allowDuplicate": true}));
    assert_ne!(import(&c, &req).unwrap().run_id, first.run_id);
    // The second shard of the same CI run goes into the same run.
    let req = request(
        &p,
        doc_of(snapshot!("shard2__ctrf.json")),
        json!({"runId": first.run_id, "sha256": "bb".repeat(32)}),
    );
    let two = in_tx(&c, |tx| {
        commit(
            tx,
            &req,
            &Stored {
                sha256: "bb".repeat(32),
                size: 1,
            },
        )
    })
    .unwrap();
    assert_ne!(two.shard_id, first.shard_id);
    let index: (i64, i64) = c
        .query_row(
            "SELECT shard_index, shard_total FROM run_shards WHERE id = ?1",
            [&two.shard_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(index, (2, 2));
}

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

/// What the server compares of an append-only document.
fn content(mut v: Value) -> Value {
    for k in [
        "createdAt",
        "createdBy",
        "hlc",
        "importedAt",
        "importedBy",
        "workspaceId",
    ] {
        v.as_object_mut().unwrap().remove(k);
    }
    v
}

#[test]
fn two_devices_importing_the_same_file_into_one_run_write_the_same_documents() {
    let (a, b) = (device(), device());
    let p = new_project(&a);
    ing01_cases(&a, &p);
    let run = crate::runs::insert_run(
        &a,
        &serde_json::from_value(
            json!({"projectId": p, "title": "CI", "trigger": "ci", "userId": U}),
        )
        .unwrap(),
    )
    .unwrap();
    pull(&b, &push(&a));
    let doc = doc_of(snapshot!("single__cucumber-messages.ndjson"));
    let (on_a, on_b) = (
        import(&a, &request(&p, doc.clone(), json!({"runId": run}))).unwrap(),
        import(&b, &request(&p, doc, json!({"runId": run}))).unwrap(),
    );
    assert_eq!(on_a.shard_id, on_b.shard_id);
    let ids: Vec<String> = list_results(&a, &run, U)
        .unwrap()
        .into_iter()
        .map(|r| r.id)
        .collect();
    assert_eq!(ids.len(), 6);
    for id in &ids {
        let pa = content(crate::runs::result_payload(&a, id).unwrap().unwrap());
        let pb = content(crate::runs::result_payload(&b, id).unwrap().unwrap());
        assert_eq!(pa, pb, "result {id} differs between devices");
    }
    assert_eq!(
        content(
            crate::runs::shard_payload(&a, &on_a.shard_id)
                .unwrap()
                .unwrap()
        ),
        content(
            crate::runs::shard_payload(&b, &on_b.shard_id)
                .unwrap()
                .unwrap()
        )
    );
    // Exchanging them leaves one copy on each.
    let (from_a, from_b) = (push(&a), push(&b));
    pull(&a, &from_b);
    pull(&b, &from_a);
    for dev in [&a, &b] {
        assert_eq!(count(dev, "SELECT count(*) FROM results"), 6);
        assert_eq!(count(dev, "SELECT count(*) FROM run_shards"), 1);
    }
}

// ---- preview, limits, attachments ---------------------------------------------

#[test]
fn the_preview_counts_and_writes_nothing() {
    let c = device();
    let p = new_project(&c);
    ing01_cases(&c, &p);
    let before = (
        count(&c, "SELECT count(*) FROM test_case_revisions"),
        count(&c, "SELECT count(*) FROM oplog"),
    );
    let req = new_run(&p, doc_of(snapshot!("single__pw.json")));
    c.execute_batch("SAVEPOINT t").unwrap();
    let pv = preview(&c, &req).unwrap();
    c.execute_batch("ROLLBACK TO t; RELEASE t").unwrap();
    assert_eq!(pv.format, "playwright_json");
    assert_eq!((pv.tests, pv.results, pv.linked), (4, 6, 6));
    assert_eq!(pv.statuses, json!({"passed": 3, "failed": 1}));
    assert_eq!(pv.duplicate_of, None);
    assert_eq!(
        before,
        (
            count(&c, "SELECT count(*) FROM test_case_revisions"),
            count(&c, "SELECT count(*) FROM oplog")
        )
    );
    import(&c, &req).unwrap();
    assert_eq!(
        preview(&c, &req).unwrap().duplicate_of.as_deref(),
        Some("RUN-001")
    );
}

#[test]
fn long_texts_are_cut_and_oversized_keys_stay_unique() {
    let c = device();
    let p = new_project(&c);
    let long_key = "k".repeat(MAX_TEST_KEY + 10);
    let doc = json!({"schemaVersion": "1.0.0", "shards": [{"sourceFormat": "pharos_run_json"}],
    "results": [
        {"name": "t", "status": "failed", "testKey": long_key, "message": "m".repeat(20_000),
         "trace": "t".repeat(100_000), "steps": [{"text": "s".repeat(10_000), "status": "failed"}]},
        {"name": "t", "status": "passed", "testKey": format!("{long_key}x")},
        {"name": "dup", "status": "passed", "testKey": "same"},
        {"name": "dup", "status": "failed", "testKey": "same"}
    ]});
    let out = import(&c, &new_run(&p, doc)).unwrap();
    assert_eq!(out.results, 4);
    let r = list_results(&c, &out.run_id, U).unwrap();
    assert!(r
        .iter()
        .all(|x| x.test_key.encode_utf16().count() <= MAX_TEST_KEY));
    assert_eq!(
        r.iter().map(|x| &x.test_key).collect::<HashSet<_>>().len(),
        4
    );
    assert!(r.iter().any(|x| x.test_key == "same #2"));
    let big = &r[0];
    assert_eq!(
        big.error_message.as_ref().unwrap().encode_utf16().count(),
        MAX_ERROR_MESSAGE
    );
    assert!(big.error_message.as_ref().unwrap().ends_with('…'));
    assert_eq!(big.steps[0].text.encode_utf16().count(), MAX_STEP_TEXT);
    let codes: Vec<_> = out.warnings.iter().map(|w| w.code.as_str()).collect();
    assert!(
        codes.contains(&"key-too-long")
            && codes.contains(&"text-truncated")
            && codes.contains(&"duplicate-test")
    );
    let doc_len = crate::runs::result_payload(&c, &big.id)
        .unwrap()
        .unwrap()
        .to_string()
        .len();
    assert!(doc_len < MAX_RESULT_DOC);
    // A file other than the one read, another account's project and a
    // newer major are refused.
    let doc = json!({"schemaVersion": "1.0.0", "results": []});
    let other = request(
        &p,
        doc.clone(),
        json!({"newRun": {}, "sha256": "cc".repeat(32)}),
    );
    assert!(import(&c, &other)
        .unwrap_err()
        .starts_with("report-changed"));
    let mut foreign = new_run(&p, doc.clone());
    foreign.user_id = "someone-else".into();
    assert!(import(&c, &foreign).is_err());
    assert!(import(&c, &new_run(&p, json!({"schemaVersion": "2.0.0"})))
        .unwrap_err()
        .starts_with("unsupported-version"));
}

#[test]
fn a_closed_run_refuses_a_new_file() {
    let c = device();
    let p = new_project(&c);
    let out = import(
        &c,
        &new_run(&p, json!({"schemaVersion": "1.0.0", "results": []})),
    )
    .unwrap();
    let req = request(
        &p,
        json!({"schemaVersion": "1.0.0", "results": []}),
        json!({"runId": out.run_id, "sha256": "dd".repeat(32)}),
    );
    let e = in_tx(&c, |tx| {
        commit(
            tx,
            &req,
            &Stored {
                sha256: "dd".repeat(32),
                size: 1,
            },
        )
    })
    .unwrap_err();
    assert_eq!(e, "run-closed");
}

#[test]
fn attachments_go_to_their_owner_once() {
    let c = device();
    let p = new_project(&c);
    ing01_cases(&c, &p);
    let out = import(
        &c,
        &new_run(&p, doc_of(snapshot!("single__cucumber-messages.ndjson"))),
    )
    .unwrap();
    assert!(!out.attachments.is_empty());
    let t = &out.attachments[0];
    let blob = Stored {
        sha256: "ee".repeat(32),
        size: 10,
    };
    let attach_once = || {
        in_tx(&c, |tx| {
            attach(
                tx,
                &t.owner_entity,
                &t.owner_id,
                &blob,
                "error-context",
                Some("text/markdown"),
                "log",
                U,
            )
        })
    };
    let first = attach_once().unwrap();
    assert_eq!(attach_once().unwrap(), first);
    assert_eq!(
        count(&c, "SELECT count(*) FROM attachments WHERE kind = 'log'"),
        1
    );
    assert_eq!(count(&c, "SELECT count(*) FROM blobs WHERE sha256 = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'"), 1);
    // Someone else's result, or an owner kind that takes no attachments, is refused.
    assert!(in_tx(&c, |tx| attach(
        tx,
        &t.owner_entity,
        &t.owner_id,
        &blob,
        "x",
        None,
        "log",
        "x"
    ))
    .is_err());
    assert!(in_tx(&c, |tx| attach(
        tx,
        "run",
        &out.run_id,
        &blob,
        "x",
        None,
        "log",
        U
    ))
    .is_err());
    // Attachments never reach the oplog (ADR-0014).
    assert_eq!(
        count(&c, "SELECT count(*) FROM oplog WHERE entity = 'attachment'"),
        0
    );
}

#[test]
fn helpers_cut_and_convert_deterministically() {
    assert_eq!(clip("abcdef", 4), ("abc…".to_string(), true));
    assert_eq!(clip("ab", 4), ("ab".to_string(), false));
    assert_eq!(clip("ñandú😀x", 6).0.encode_utf16().count(), 6);
    assert_eq!(iso_of_ms(1_793_073_127_111), "2026-10-27T03:52:07.111Z");
    assert_eq!(iso_of_ms(0), "1970-01-01T00:00:00.000Z");
    assert_eq!(iso_of_ms(951_782_400_000), "2000-02-29T00:00:00.000Z");
    assert_eq!(
        split_keyword(None, "Given a b"),
        (Some("Given".into()), "a b".into())
    );
    assert_eq!(
        split_keyword(Some("When"), "x"),
        (Some("When".into()), "x".into())
    );
    assert_eq!(split_keyword(None, "Givenx"), (None, "Givenx".into()));
    assert!(
        crate::runs::link::step_pattern("inicia con \"<email>\" y <c>")
            .is_match("inicia con \"x@y\" y 3")
    );
    assert!(!crate::runs::link::step_pattern("a.b").is_match("axb"));
    assert_eq!(status_of("pending"), "skipped");
    assert_eq!(status_of("weird"), "other");
}

// ---- review of step 9 ------------------------------------------------------------

fn pharos_doc(results: Value) -> Value {
    json!({"schemaVersion": "1.0.0",
           "shards": [{"sourceFormat": "pharos_run_json", "normalizerVersion": 1}],
           "results": results})
}

#[test]
fn tags_link_to_any_live_key_of_the_project() {
    let c = device();
    let p = new_project(&c);
    let free = new_case(&c, &p, "LOGIN_OK", json!({"steps": ["entra"]}));
    let old = new_case(&c, &p, "ATS_007", json!({"steps": ["sale"]}));
    let doc = pharos_doc(json!([
        {"name": "a", "status": "passed", "testKey": "k1", "tags": ["@LOGIN_OK", "@smoke"]},
        {"name": "b", "status": "passed", "testKey": "k2", "tags": ["ATS_007"]},
        {"name": "c", "status": "passed", "testKey": "k3", "tags": ["@TC-404"]},
        {"name": "d", "status": "passed", "testKey": "k4", "tags": ["@LOGIN_OK", "@TC-404"]}
    ]));
    let out = import(&c, &new_run(&p, doc)).unwrap();
    let r = list_results(&c, &out.run_id, U).unwrap();
    let case_of = |k: &str| {
        r.iter()
            .find(|x| x.test_key == k)
            .unwrap()
            .effective_test_case_id
            .clone()
    };
    assert_eq!(case_of("k1"), Some(free));
    assert_eq!(case_of("k2"), Some(old));
    // A tag that only looks like a key of the project names an unknown case.
    assert_eq!(case_of("k3"), None);
    assert_eq!(
        case_of("k4"),
        None,
        "a live key and an unknown one are two tags"
    );
    let tray = unlinked_list(&c, &p, U).unwrap();
    let reason = |k: &str| {
        tray.iter()
            .find(|t| t.test_key == k)
            .and_then(|t| t.reason.clone())
    };
    assert_eq!(reason("k3").as_deref(), Some("unknown-case"));
    assert_eq!(reason("k4").as_deref(), Some("two-case-tags"));
}

#[test]
fn the_shard_is_the_documents_and_must_be_valid() {
    let c = device();
    let p = new_project(&c);
    let bad = json!({"schemaVersion": "1.0.0",
        "shards": [{"sourceFormat": "ctrf", "shardIndex": 3, "shardTotal": 2}], "results": []});
    assert!(import(&c, &new_run(&p, bad))
        .unwrap_err()
        .starts_with("invalid-shard"));
    let half = json!({"schemaVersion": "1.0.0",
        "shards": [{"sourceFormat": "ctrf", "shardIndex": 1}], "results": []});
    assert!(import(&c, &new_run(&p, half))
        .unwrap_err()
        .starts_with("invalid-shard"));
}

#[test]
fn a_test_tagged_later_leaves_the_tray() {
    let c = device();
    let p = new_project(&c);
    let (tc1, _, _) = ing01_cases(&c, &p);
    // Explicit, distinct times: the later result decides.
    let first = pharos_doc(json!([{"name": "t", "status": "failed", "testKey": "k",
                                   "startedAt": "2026-10-01T10:00:00Z"}]));
    let out = import(
        &c,
        &request(&p, first, json!({"newRun": {"keepOpen": true}})),
    )
    .unwrap();
    assert_eq!(unlinked_list(&c, &p, U).unwrap().len(), 1);
    let tagged = pharos_doc(json!([{"name": "t", "status": "passed", "testKey": "k",
                                    "tags": ["@TC-001"], "startedAt": "2026-10-01T11:00:00Z"}]));
    let req = request(
        &p,
        tagged,
        json!({"runId": out.run_id, "sha256": "bb".repeat(32)}),
    );
    in_tx(&c, |tx| {
        commit(
            tx,
            &req,
            &Stored {
                sha256: "bb".repeat(32),
                size: 1,
            },
        )
    })
    .unwrap();
    assert!(unlinked_list(&c, &p, U).unwrap().is_empty());
    let r = list_results(&c, &out.run_id, U).unwrap();
    assert!(r
        .iter()
        .any(|x| x.effective_test_case_id.as_deref() == Some(tc1.as_str())));
}

/// Imports two reports into one run; `second` goes in as another shard.
fn two_shards(c: &Connection, p: &str, first: Value, second: Value) {
    let out = import(c, &request(p, first, json!({"newRun": {"keepOpen": true}}))).unwrap();
    let req = request(
        p,
        second,
        json!({"runId": out.run_id, "sha256": "bb".repeat(32)}),
    );
    let stored = Stored {
        sha256: "bb".repeat(32),
        size: 1,
    };
    in_tx(c, |tx| commit(tx, &req, &stored)).unwrap();
}

#[test]
fn an_untagged_later_result_puts_the_test_back_in_the_tray() {
    let c = device();
    let p = new_project(&c);
    ing01_cases(&c, &p);
    two_shards(
        &c,
        &p,
        pharos_doc(json!([{"name": "t", "status": "passed", "testKey": "k",
                            "tags": ["@TC-001"], "startedAt": "2026-10-01T10:00:00Z"}])),
        pharos_doc(json!([{"name": "t", "status": "failed", "testKey": "k",
                            "startedAt": "2026-10-01T11:00:00Z"}])),
    );
    let tray = unlinked_list(&c, &p, U).unwrap();
    assert_eq!(
        (tray.len(), tray[0].last_status.as_str(), tray[0].results),
        (1, "failed", 2)
    );
}

/// Two shards of one run whose results have no times of their own tie for
/// latest: the test leaves the tray if any of them names a case, whatever
/// their ids and the order they were imported in.
#[test]
fn results_tied_for_latest_leave_the_tray_if_any_names_a_case() {
    let untagged = pharos_doc(json!([{"name": "t", "status": "failed", "testKey": "k"}]));
    let tagged = pharos_doc(json!([{"name": "t", "status": "passed", "testKey": "k",
                                     "tags": ["@TC-001"]}]));
    for (first, second) in [
        (untagged.clone(), tagged.clone()),
        (tagged.clone(), untagged.clone()),
    ] {
        let c = device();
        let p = new_project(&c);
        ing01_cases(&c, &p);
        two_shards(&c, &p, first, second);
        assert!(unlinked_list(&c, &p, U).unwrap().is_empty());
    }
    // Tied and none names a case: one row, with every result counted.
    let c = device();
    let p = new_project(&c);
    let other = pharos_doc(json!([{"name": "t", "status": "passed", "testKey": "k"}]));
    two_shards(&c, &p, untagged, other);
    let tray = unlinked_list(&c, &p, U).unwrap();
    assert_eq!((tray.len(), tray[0].results), (1, 2));
}

#[test]
fn a_device_that_pulled_the_shard_keeps_the_upload_as_its_raw_report() {
    let (a, b) = (device(), device());
    let p = new_project(&a);
    let run = crate::runs::insert_run(
        &a,
        &serde_json::from_value(json!({"projectId": p, "title": "CI", "userId": U})).unwrap(),
    )
    .unwrap();
    pull(&b, &push(&a));
    let doc = pharos_doc(json!([{"name": "t", "status": "passed", "testKey": "k"}]));
    import(&a, &request(&p, doc.clone(), json!({"runId": run}))).unwrap();
    pull(&b, &push(&a));
    assert_eq!(count(&b, "SELECT count(*) FROM run_shards"), 1);
    assert_eq!(count(&b, "SELECT count(*) FROM attachments"), 0);
    let again = import(&b, &request(&p, doc, json!({"runId": run}))).unwrap();
    assert!(again.already_imported);
    // The bytes B just uploaded are its raw report now: no orphan file.
    assert_eq!(
        count(&b, "SELECT count(*) FROM attachments WHERE owner_entity = 'run_shard' AND kind = 'raw_report'"),
        1
    );
    assert_eq!(count(&b, "SELECT count(*) FROM blobs"), 1);
    assert_eq!(
        count(&b, "SELECT count(*) FROM oplog WHERE synced_at IS NULL"),
        0
    );
}

#[test]
fn purging_a_run_removes_its_evidence_rows() {
    let c = device();
    let p = new_project(&c);
    ing01_cases(&c, &p);
    let out = import(
        &c,
        &new_run(&p, doc_of(snapshot!("single__cucumber-messages.ndjson"))),
    )
    .unwrap();
    let blob = Stored {
        sha256: "ee".repeat(32),
        size: 10,
    };
    for t in &out.attachments {
        in_tx(&c, |tx| {
            attach(
                tx,
                &t.owner_entity,
                &t.owner_id,
                &blob,
                "x.md",
                None,
                "log",
                U,
            )
        })
        .unwrap();
    }
    assert!(count(&c, "SELECT count(*) FROM attachments") > 1);
    c.execute("UPDATE oplog SET synced_at = datetime('now')", [])
        .unwrap();
    for t in ["runs", "run_items", "test_cases", "projects"] {
        c.execute(
            &format!("UPDATE {t} SET deleted_at = '2000-01-01 00:00:00'"),
            [],
        )
        .unwrap();
    }
    in_tx(&c, |tx| {
        crate::purge::purge(tx, U, 30)?;
        crate::purge::purge_evidence(tx, U, 30)
    })
    .unwrap();
    assert_eq!(count(&c, "SELECT count(*) FROM results"), 0);
    assert_eq!(count(&c, "SELECT count(*) FROM attachments"), 0);
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM blobs WHERE local_state <> 'deleting'"
        ),
        0
    );
}

#[test]
fn run_counts_are_of_final_results() {
    let c = device();
    let p = new_project(&c);
    ing01_cases(&c, &p);
    let out = import(&c, &new_run(&p, doc_of(snapshot!("single__ctrf.json")))).unwrap();
    let counts = run_counts(&c, &p, U).unwrap();
    assert_eq!(
        counts,
        vec![RunCounts {
            run_id: out.run_id,
            passed: 3,
            failed: 1,
            other: 0,
            unlinked: 0
        }]
    );
    assert!(run_counts(&c, &p, "someone-else").unwrap().is_empty());
}

// ---- B1: the link is derived when read --------------------------------------------

fn tagged(test_key: &str, tag: &str) -> Value {
    pharos_doc(json!([{"name": "t", "status": "passed", "testKey": test_key, "tags": [tag]}]))
}

/// Gives a case a new key and freezes the revision that carries it, as a
/// prefix change does.
fn rekey(c: &Connection, case: &str, key: &str) {
    c.execute(
        "UPDATE test_cases SET scenario_id = ?2, revision = revision + 1 WHERE id = ?1",
        params![case, key],
    )
    .unwrap();
    crate::revisions::ensure_current(c, case, U, true).unwrap();
}

#[test]
fn an_edit_between_two_devices_freezes_and_pulls_converges_to_one_revision() {
    // A edits TC-001 and a run starts after the edit; B has the run but not
    // yet the edit. Both import the same file: the same content, and after
    // the pull the same derived revision.
    let (a, b) = (device(), device());
    let p = new_project(&a);
    let (tc1, _, _) = ing01_cases(&a, &p);
    a.execute(
        "UPDATE test_case_revisions SET created_at = '2026-10-31 09:00:00'",
        [],
    )
    .unwrap();
    pull(&b, &push(&a));
    let input: test_case::TestCaseInput = serde_json::from_value(json!({
        "projectId": p, "scenarioId": "TC-001", "title": "TC-001 v2", "author": "Ada",
        "data": {"steps": ["otra cosa"]}, "userId": U
    }))
    .unwrap();
    test_case::update_case(&a, &tc1, &input).unwrap();
    a.execute(
        "UPDATE test_case_revisions SET created_at = '2026-10-31 10:00:00' WHERE revision = 2",
        [],
    )
    .unwrap();
    let run = crate::runs::insert_run(
        &a,
        &serde_json::from_value(json!({"projectId": p, "title": "CI", "userId": U,
                                        "startedAt": "2026-10-31T10:05:00Z"}))
        .unwrap(),
    )
    .unwrap();
    let docs = push(&a);
    let (later, now): (Vec<Value>, Vec<Value>) = docs
        .into_iter()
        .partition(|d| d["entity"] == "test_case_revision" || d["entity"] == "test_case");
    pull(&b, &now);
    let doc = tagged("k", "@TC-001");
    import(&a, &request(&p, doc.clone(), json!({"runId": run}))).unwrap();
    import(&b, &request(&p, doc, json!({"runId": run}))).unwrap();
    let id = list_results(&a, &run, U).unwrap()[0].id.clone();
    assert_eq!(
        content(crate::runs::result_payload(&a, &id).unwrap().unwrap()),
        content(crate::runs::result_payload(&b, &id).unwrap().unwrap()),
        "the stored content never depends on local data"
    );
    let rev = |dev: &Connection| list_results(dev, &run, U).unwrap()[0].effective_case_revision;
    assert_eq!(rev(&a), Some(2));
    assert_eq!(rev(&b), Some(1), "B does not have the edit yet");
    pull(&b, &later);
    assert_eq!(rev(&b), Some(2), "after the pull B derives what A does");
}

#[test]
fn the_same_revision_frozen_on_two_devices_converges_to_the_servers_time() {
    let (a, b) = (device(), device());
    let p = new_project(&a);
    let case = new_case(&a, &p, "TC-001", json!({"steps": ["x"]}));
    a.execute(
        "UPDATE test_case_revisions SET created_at = '2026-01-01 00:00:00'",
        [],
    )
    .unwrap();
    let docs = push(&a);
    let (revs, rest): (Vec<Value>, Vec<Value>) = docs
        .into_iter()
        .partition(|d| d["entity"] == "test_case_revision");
    pull(&b, &rest);
    // B freezes the same state itself: the same id, another time.
    let id = crate::revisions::ensure_current(&b, &case, U, false)
        .unwrap()
        .unwrap();
    let at = |dev: &Connection| -> String {
        dev.query_row(
            "SELECT created_at FROM test_case_revisions WHERE id = ?1",
            [&id],
            |r| r.get(0),
        )
        .unwrap()
    };
    assert_ne!(at(&a), at(&b));
    // The server kept A's (the first stored): B takes it on the pull.
    pull(&b, &revs);
    assert_eq!(at(&a), at(&b));
}

#[test]
fn a_prefix_change_keeps_an_old_import_on_its_case() {
    let c = device();
    let p = new_project(&c);
    let (tc1, _, _) = ing01_cases(&c, &p);
    let out = import(&c, &new_run(&p, tagged("k", "@TC-001"))).unwrap();
    rekey(&c, &tc1, "ATS_001");
    let r = &list_results(&c, &out.run_id, U).unwrap()[0];
    assert_eq!(r.effective_test_case_id.as_deref(), Some(tc1.as_str()));
    assert!(unlinked_list(&c, &p, U).unwrap().is_empty());
    assert_eq!(run_counts(&c, &p, U).unwrap()[0].unlinked, 0);
    // A new report with the new key links to the same case.
    let req = request(
        &p,
        tagged("k2", "@ATS_001"),
        json!({"newRun": {}, "sha256": "dd".repeat(32)}),
    );
    let again = in_tx(&c, |tx| {
        commit(
            tx,
            &req,
            &Stored {
                sha256: "dd".repeat(32),
                size: 1,
            },
        )
    })
    .unwrap();
    let r = &list_results(&c, &again.run_id, U).unwrap()[0];
    assert_eq!(r.effective_test_case_id.as_deref(), Some(tc1.as_str()));
}

#[test]
fn a_key_links_to_the_case_wearing_it_now_else_to_its_only_former_wearer() {
    let c = device();
    let p = new_project(&c);
    let (tc1, tc2, _) = ing01_cases(&c, &p);
    let out = import(&c, &new_run(&p, tagged("k", "@TC-001"))).unwrap();
    let case_of = |c: &Connection| list_results(c, &out.run_id, U).unwrap()[0].clone();
    // TC-001 moves to ATS_001: nobody wears TC-001 now, its only former
    // wearer is TC-001's case.
    rekey(&c, &tc1, "ATS_001");
    assert_eq!(
        case_of(&c).effective_test_case_id.as_deref(),
        Some(tc1.as_str())
    );
    // Another case takes TC-001: the case wearing it now wins.
    rekey(&c, &tc2, "TC-001");
    assert_eq!(
        case_of(&c).effective_test_case_id.as_deref(),
        Some(tc2.as_str())
    );
    // It leaves TC-001 too: two former wearers and nobody now, never a guess.
    rekey(&c, &tc2, "ATS_002");
    let r = case_of(&c);
    assert_eq!(r.effective_test_case_id, None);
    assert_eq!(r.link_reason.as_deref(), Some("two-case-tags"));
}

#[test]
fn an_open_key_conflict_unlinks_on_this_device_until_resolved() {
    let c = device();
    let p = new_project(&c);
    let (tc1, _, _) = ing01_cases(&c, &p);
    let out = import(&c, &new_run(&p, tagged("k", "@TC-001"))).unwrap();
    c.execute(
        "INSERT INTO key_conflicts (id, user_id, entity, entity_id, project_id, lost_key, detected_at)
         VALUES ('kc', ?1, 'test_case', ?2, ?3, 'TC-001', datetime('now'))",
        params![U, tc1, p],
    )
    .unwrap();
    let r = &list_results(&c, &out.run_id, U).unwrap()[0];
    assert_eq!(r.link_reason.as_deref(), Some("case-key-conflict"));
    // Renamed and resolved: the old import follows its case.
    rekey(&c, &tc1, "TC-004");
    c.execute(
        "UPDATE key_conflicts SET resolved_at = datetime('now'), resolution = 'renamed'",
        [],
    )
    .unwrap();
    let r = &list_results(&c, &out.run_id, U).unwrap()[0];
    assert_eq!(r.effective_test_case_id.as_deref(), Some(tc1.as_str()));
}

#[test]
fn local_only_revisions_are_never_chosen_and_ties_go_to_the_latest_written() {
    let c = device();
    let p = new_project(&c);
    let (tc1, _, _) = ing01_cases(&c, &p);
    c.execute(
        "UPDATE test_case_revisions SET created_at = '2026-01-01 00:00:00'",
        [],
    )
    .unwrap();
    let synced: String = c
        .query_row(
            "SELECT id FROM test_case_revisions WHERE test_case_id = ?1",
            [&tc1],
            |r| r.get(0),
        )
        .unwrap();
    // A provisional-key revision this device never pushes.
    c.execute(
        "UPDATE test_cases SET scenario_id = 'TC-900', revision = revision + 1 WHERE id = ?1",
        [&tc1],
    )
    .unwrap();
    crate::revisions::ensure_current_local(&c, &tc1).unwrap();
    c.execute(
        "UPDATE test_case_revisions SET created_at = '2026-02-01 00:00:00' WHERE local_only = 1",
        [],
    )
    .unwrap();
    let doc = json!({"schemaVersion": "1.0.0", "run": {"startedAt": "2026-06-01T00:00:00Z"},
        "shards": [{"sourceFormat": "pharos_run_json", "normalizerVersion": 1}],
        "results": [{"name": "t", "status": "passed", "testKey": "k", "tags": ["@TC-001"]}]});
    let out = import(&c, &new_run(&p, doc)).unwrap();
    let r = &list_results(&c, &out.run_id, U).unwrap()[0];
    assert_eq!(r.effective_revision_id.as_deref(), Some(synced.as_str()));
    // The provisional key is no key of the case for the link either.
    let req = request(
        &p,
        tagged("k2", "@TC-900"),
        json!({"newRun": {}, "sha256": "ee".repeat(32)}),
    );
    let other = in_tx(&c, |tx| {
        commit(
            tx,
            &req,
            &Stored {
                sha256: "ee".repeat(32),
                size: 1,
            },
        )
    })
    .unwrap();
    let r = &list_results(&c, &other.run_id, U).unwrap()[0];
    assert_eq!(
        r.effective_test_case_id.as_deref(),
        Some(tc1.as_str()),
        "TC-900 is its current key"
    );
}

#[test]
fn the_tray_orders_by_report_times_the_same_on_every_device() {
    // A imports an untagged attempt that ran at 10:00; B, earlier in wall
    // time, imports a tagged one that ran at 11:00. After the exchange both
    // agree the latest one is tagged: the key is not in either tray.
    let (a, b) = (device(), device());
    let p = new_project(&a);
    ing01_cases(&a, &p);
    pull(&b, &push(&a));
    let doc = |at: &str, tags: Value| {
        pharos_doc(json!([{"name": "t", "status": "passed", "testKey": "k",
                            "startedAt": at, "tags": tags}]))
    };
    let req = request(
        &p,
        doc("2026-10-31T11:00:00Z", json!(["@TC-001"])),
        json!({"newRun": {}}),
    );
    in_tx(&b, |tx| commit(tx, &req, &stored())).unwrap();
    let req = request(
        &p,
        doc("2026-10-31T10:00:00Z", json!([])),
        json!({"newRun": {}, "sha256": "ff".repeat(32)}),
    );
    in_tx(&a, |tx| {
        commit(
            tx,
            &req,
            &Stored {
                sha256: "ff".repeat(32),
                size: 1,
            },
        )
    })
    .unwrap();
    let (from_a, from_b) = (push(&a), push(&b));
    pull(&a, &from_b);
    pull(&b, &from_a);
    assert!(unlinked_list(&a, &p, U).unwrap().is_empty());
    assert!(unlinked_list(&b, &p, U).unwrap().is_empty());
}

#[test]
fn a_newer_normalizer_makes_another_shard_and_readers_keep_only_it() {
    let c = device();
    let p = new_project(&c);
    ing01_cases(&c, &p);
    let doc = |v: i64, status: &str| {
        json!({"schemaVersion": "1.0.0",
               "shards": [{"sourceFormat": "pharos_run_json", "normalizerVersion": v}],
               "results": [{"name": "t", "status": status, "testKey": "k", "tags": ["@TC-001"]}]})
    };
    let first = import(
        &c,
        &request(&p, doc(1, "failed"), json!({"newRun": {"keepOpen": true}})),
    )
    .unwrap();
    // The same file again on the same build: nothing.
    assert!(
        import(
            &c,
            &request(&p, doc(1, "failed"), json!({"runId": first.run_id}))
        )
        .unwrap()
        .already_imported
    );
    // The same file read by a newer normalizer: another shard (another id),
    // and the readers keep only it.
    let newer = import(
        &c,
        &request(&p, doc(2, "passed"), json!({"runId": first.run_id})),
    )
    .unwrap();
    assert!(!newer.already_imported);
    assert_ne!(newer.shard_id, first.shard_id);
    assert_eq!(newer.shard_id, ids::shard_id(&first.run_id, SHA, 2));
    let r = list_results(&c, &first.run_id, U).unwrap();
    assert_eq!(r.len(), 1);
    assert_eq!(r[0].status, "passed");
    let counts = run_counts(&c, &p, U).unwrap();
    assert_eq!((counts[0].passed, counts[0].failed), (1, 0));
    let version: i64 = c
        .query_row(
            "SELECT normalizer_version FROM run_shards WHERE id = ?1",
            [&newer.shard_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(version, 2);
    assert_eq!(
        crate::runs::shard_payload(&c, &newer.shard_id)
            .unwrap()
            .unwrap()["normalizerVersion"],
        2
    );
}

#[test]
fn a_deleted_case_keeps_its_results_and_stays_out_of_the_tray() {
    let c = device();
    let p = new_project(&c);
    let (tc1, _, _) = ing01_cases(&c, &p);
    let out = import(&c, &new_run(&p, tagged("k", "@TC-001"))).unwrap();
    test_case::delete_case(&c, &tc1, U).unwrap();
    let r = &list_results(&c, &out.run_id, U).unwrap()[0];
    assert_eq!(r.effective_test_case_id.as_deref(), Some(tc1.as_str()));
    assert!(r.case_deleted);
    assert!(unlinked_list(&c, &p, U).unwrap().is_empty());
}

#[test]
fn a_later_link_wins_over_the_tag() {
    let c = device();
    let p = new_project(&c);
    let (tc1, tc2, _) = ing01_cases(&c, &p);
    let out = import(&c, &new_run(&p, tagged("k", "@TC-001"))).unwrap();
    in_tx(&c, |tx| set_mapping(tx, &p, "k", Some(&tc2), U)).unwrap();
    let r = &list_results(&c, &out.run_id, U).unwrap()[0];
    assert_eq!(r.effective_test_case_id.as_deref(), Some(tc2.as_str()));
    // Retired, the tag decides again.
    in_tx(&c, |tx| set_mapping(tx, &p, "k", None, U)).unwrap();
    let r = &list_results(&c, &out.run_id, U).unwrap()[0];
    assert_eq!(r.effective_test_case_id.as_deref(), Some(tc1.as_str()));
}

#[test]
fn twenty_thousand_results_resolve_in_set_queries() {
    let c = device();
    let p = new_project(&c);
    for n in 0..200 {
        new_case(
            &c,
            &p,
            &format!("TC-{:03}", n + 1),
            json!({"steps": ["a", "b"]}),
        );
    }
    let results: Vec<Value> = (0..MAX_IMPORT_RESULTS)
        .map(|i| {
            json!({"name": format!("t{i}"), "status": if i % 7 == 0 { "failed" } else { "passed" },
                   "testKey": format!("f.spec.ts::t{i}"),
                   "tags": [format!("@TC-{:03}", i % 250 + 1)],
                   "steps": [{"text": "a", "status": "passed"}, {"text": "b", "status": "passed"}]})
        })
        .collect();
    let out = import(&c, &new_run(&p, pharos_doc(json!(results)))).unwrap();
    assert_eq!(out.results, MAX_IMPORT_RESULTS);
    let t = std::time::Instant::now();
    let counts = run_counts(&c, &p, U).unwrap();
    let counted = t.elapsed();
    let t = std::time::Instant::now();
    let views = list_results(&c, &out.run_id, U).unwrap();
    let listed = t.elapsed();
    let t = std::time::Instant::now();
    let tray = unlinked_list(&c, &p, U).unwrap();
    let trayed = t.elapsed();
    eprintln!("20k results: counts {counted:?}, list {listed:?}, tray {trayed:?}");
    // One tag in five names TC-201..250, which do not exist.
    let unknown = MAX_IMPORT_RESULTS / 250 * 50;
    assert_eq!(counts[0].unlinked, unknown as i64);
    assert_eq!(tray.len(), unknown);
    assert!(views
        .iter()
        .filter(|v| v.effective_test_case_id.is_some())
        .all(|v| v.effective_step_ids.iter().all(Option::is_some)));
    // Generous bounds for a debug build on CI: a query per result would take
    // far longer.
    for d in [counted, listed, trayed] {
        assert!(d < std::time::Duration::from_secs(15), "{d:?}");
    }
}
