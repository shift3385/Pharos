//! Import (ING-02..05): the normalized ING-01 snapshots the TS parsers commit
//! (`src/shared/contracts/pharos-run/fixtures/ing01/normalized/`) stored end
//! to end: linking by tag, the revision at the run's start, run items, flows,
//! rows and step ids, the tray, re-import as a no-op, two devices converging,
//! the limits, and attachments.

use rusqlite::Connection;
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
        .filter(|r| r.test_case_id.as_deref() == Some(tc3.as_str()))
        .collect();
    assert_eq!(flaky.len(), 2);
    assert!(flaky
        .iter()
        .any(|r| r.is_final && r.flaky && r.status == "passed"));
    // TC-002's rows resolve to the case's row ids; its two attempts of row 2 too.
    let rows = row_ids(&c, &tc2);
    let outline: Vec<_> = results
        .iter()
        .filter(|r| r.test_case_id.as_deref() == Some(tc2.as_str()))
        .collect();
    assert_eq!(outline.len(), 3);
    assert!(outline
        .iter()
        .any(|r| r.example_row_id.as_deref() == Some(rows[0].as_str())));
    assert_eq!(
        outline
            .iter()
            .filter(|r| r.example_row_id.as_deref() == Some(rows[1].as_str()))
            .count(),
        2
    );
    // TC-001's steps match the revision's texts once the keyword is split off.
    let one = results
        .iter()
        .find(|r| r.test_case_id.as_deref() == Some(tc1.as_str()))
        .unwrap();
    assert_eq!(one.steps.len(), 3);
    assert_eq!(one.steps[0].keyword.as_deref(), Some("Given"));
    assert!(
        one.steps.iter().all(|s| s.step_id.is_some()),
        "{:?}",
        one.steps
    );
    // The Outline steps match their `<param>` templates.
    assert!(outline
        .iter()
        .all(|r| r.steps.iter().all(|s| s.step_id.is_some())));
    assert_eq!(one.case_key.as_deref(), Some("TC-001"));
    assert!(one.executed_by.starts_with("tool:"));
    // Ids are deterministic: shard by run and file, steps by result and position.
    assert_eq!(out.shard_id, ids::shard_id(&out.run_id, SHA));
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
        .filter(|r| r.test_case_id.as_deref() == Some(tc3.as_str()))
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
    assert_eq!(r[0].test_case_revision_id.as_deref(), Some(first.as_str()));
    // Before every revision: the current one.
    let req = request(
        &p,
        doc("2020-01-01T00:00:00Z"),
        json!({"newRun": {}, "allowDuplicate": true}),
    );
    let now = import(&c, &req).unwrap();
    let r = list_results(&c, &now.run_id, U).unwrap();
    assert_ne!(r[0].test_case_revision_id.as_deref(), Some(first.as_str()));
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
    assert_eq!(r[0].run_item_id.as_deref(), Some(items[0].as_str()));
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
    assert_eq!(r.flow_id.as_deref(), data["flows"][1]["id"].as_str());
    assert_eq!(
        r.steps[0].step_id.as_deref(),
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
    assert!(step_pattern("inicia con \"<email>\" y <c>").is_match("inicia con \"x@y\" y 3"));
    assert!(!step_pattern("a.b").is_match("axb"));
    assert_eq!(status_of("pending"), "skipped");
    assert_eq!(status_of("weird"), "other");
}
