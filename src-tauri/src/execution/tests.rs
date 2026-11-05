//! The execution derivation (step 10): the shared vectors, the loader end to
//! end, and the exit criterion of 0.2.0 — a manual run and a Playwright run
//! of the same case in one matrix, the latest final winning, and editing the
//! case afterwards changing none of it.

use rusqlite::Connection;
use serde_json::{json, Value};
use uuid::Uuid;

use super::derive::{self, ExecutionFilter, HomeRequest, ProjectData};
use super::*;
use crate::db::{in_tx, run_migrations};
use crate::evidence::Stored;
use crate::runs::import::{commit, ReportImportRequest};
use crate::runs::manual::{record_from_draft, save_draft, target_key};
use crate::runs::{add_items, insert_run, RunInput, RunItemInput};
use crate::{project, requirement, sync, test_case};

const U: &str = "11111111-1111-4111-8111-111111111111";
const OTHER: &str = "22222222-2222-4222-8222-222222222222";
const SHA: &str = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

/// Every key of `expected` is equal in `actual` (arrays element by element,
/// same length). The server's vitest applies the same rule.
fn assert_subset(expected: &Value, actual: &Value, path: &str) {
    match (expected, actual) {
        (Value::Object(e), Value::Object(a)) => {
            for (k, v) in e {
                let got = a.get(k).unwrap_or(&Value::Null);
                assert_subset(v, got, &format!("{path}.{k}"));
            }
        }
        (Value::Array(e), Value::Array(a)) => {
            assert_eq!(e.len(), a.len(), "{path}: length (got {actual})");
            for (i, (x, y)) in e.iter().zip(a).enumerate() {
                assert_subset(x, y, &format!("{path}[{i}]"));
            }
        }
        (Value::Number(e), Value::Number(a)) => {
            assert_eq!(e.as_f64(), a.as_f64(), "{path}");
        }
        _ => assert_eq!(expected, actual, "{path}"),
    }
}

#[test]
fn the_shared_vectors_hold() {
    let raw = include_str!("../../tests/fixtures/execution-vectors.json");
    let file: Value = serde_json::from_str(raw).unwrap();
    for case in file["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let got = match case["kind"].as_str().unwrap() {
            "summary" => {
                let data: ProjectData = serde_json::from_value(case["project"].clone()).unwrap();
                let filter: ExecutionFilter =
                    serde_json::from_value(case["filter"].clone()).unwrap();
                serde_json::to_value(derive::summarize(&data, &filter)).unwrap()
            }
            "home" => {
                let projects: Vec<ProjectData> =
                    serde_json::from_value(case["projects"].clone()).unwrap();
                let request: HomeRequest = serde_json::from_value(case["request"].clone()).unwrap();
                serde_json::to_value(derive::home(&projects, &request)).unwrap()
            }
            other => panic!("unknown kind {other}"),
        };
        assert_subset(&case["expected"], &got, name);
    }
}

#[test]
fn the_order_attempts_are_read_in_does_not_matter() {
    let raw = include_str!("../../tests/fixtures/execution-vectors.json");
    let file: Value = serde_json::from_str(raw).unwrap();
    for case in file["cases"].as_array().unwrap() {
        if case["kind"] != "summary" {
            continue;
        }
        let mut data: ProjectData = serde_json::from_value(case["project"].clone()).unwrap();
        let filter: ExecutionFilter = serde_json::from_value(case["filter"].clone()).unwrap();
        let a = derive::summarize(&data, &filter);
        data.attempts.reverse();
        data.defects.reverse();
        data.cases.reverse();
        data.runs.reverse();
        let b = derive::summarize(&data, &filter);
        assert_eq!(a, b, "{}", case["name"]);
    }
}

// ---- end to end -------------------------------------------------------------------

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

fn case_input(project: &str, key: &str, title: &str, data: Value) -> test_case::TestCaseInput {
    serde_json::from_value(json!({
        "projectId": project, "scenarioId": key, "title": title, "author": "Ada",
        "data": data, "userId": U
    }))
    .unwrap()
}

fn tc1_data() -> Value {
    json!({"requirementKeys": ["REQ-014"], "steps": [
        "el usuario \"qa@pharos.dev\" esta registrado",
        "inicia sesion con contrasena valida",
        "ve el panel principal"
    ]})
}

/// The ING-01 Playwright report, its times moved to `day` so it is newer
/// (or older) than the manual attempt.
fn playwright_doc(day: &str) -> Value {
    let raw = include_str!(
        "../../../src/shared/contracts/pharos-run/fixtures/ing01/normalized/single__pw.json.json"
    );
    let mut doc = serde_json::from_str::<Value>(raw).unwrap()["doc"].clone();
    doc["run"]["startedAt"] = json!(format!("{day}T09:00:00Z"));
    doc["run"]["finishedAt"] = json!(format!("{day}T09:10:00Z"));
    for (i, r) in doc["results"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .enumerate()
    {
        r["startedAt"] = json!(format!("{day}T09:00:{:02}Z", i * 2));
        r["finishedAt"] = json!(format!("{day}T09:00:{:02}Z", i * 2 + 1));
    }
    doc
}

fn import(c: &Connection, p: &str, doc: Value) -> String {
    let req: ReportImportRequest = serde_json::from_value(json!({
        "projectId": p, "userId": U, "doc": doc, "sha256": SHA, "fileName": "pw.json",
        "newRun": {"title": "CI", "build": "1.4.2", "environment": "staging"}
    }))
    .unwrap();
    let stored = Stored {
        sha256: SHA.into(),
        size: 1234,
    };
    in_tx(c, |tx| commit(tx, &req, &stored)).unwrap().run_id
}

/// A manual attempt through the executor's path (draft, then record).
fn manual(c: &Connection, p: &str, case: &str, status: &str, finished: &str) -> (String, String) {
    let run_input: RunInput =
        serde_json::from_value(json!({"projectId": p, "title": "Manual", "userId": U})).unwrap();
    let run = insert_run(c, &run_input).unwrap();
    let item: RunItemInput = serde_json::from_value(json!({ "testCaseId": case })).unwrap();
    let item = add_items(c, &run, U, &[item]).unwrap().remove(0);
    let attempt = Uuid::new_v4().to_string();
    save_draft(
        c,
        &item,
        &target_key(None, None),
        Some(&json!({"attemptId": attempt})),
        U,
    )
    .unwrap();
    let input: crate::runs::ResultInput = serde_json::from_value(json!({
        "runItemId": item, "status": status, "attemptId": attempt,
        "finishedAt": finished, "userId": U
    }))
    .unwrap();
    let id = in_tx(c, |tx| record_from_draft(tx, &input)).unwrap();
    (run, id)
}

fn summary(c: &Connection, p: &str) -> derive::ExecutionSummary {
    let filter = ExecutionFilter {
        project_id: p.into(),
        ..Default::default()
    };
    execution_summary_of(c, &filter, U).unwrap().unwrap()
}

fn case_row<'a>(s: &'a derive::ExecutionSummary, id: &str) -> &'a derive::CaseExecution {
    s.cases.iter().find(|c| c.case_id == id).unwrap()
}

#[test]
fn a_manual_and_a_playwright_run_share_the_matrix() {
    let c = device();
    let p = new_project(&c);
    let req_input: requirement::RequirementInput = serde_json::from_value(json!({
        "projectId": p, "requirementKey": "REQ-014", "title": "Login", "userId": U
    }))
    .unwrap();
    let req = requirement::insert_requirement(&c, &req_input).unwrap();
    requirement::set_risk(&c, &req, Some(4), Some(5), U).unwrap();
    let tc1 = test_case::insert_case(&c, &case_input(&p, "TC-001", "Login", tc1_data())).unwrap();

    // 1. A manual attempt fails on 1 Nov.
    let (manual_run, manual_id) = manual(&c, &p, &tc1, "failed", "2026-11-01T10:00:00Z");
    let s = summary(&c, &p);
    assert_eq!(case_row(&s, &tc1).status, "failed");
    assert_eq!(
        case_row(&s, &tc1).last.as_ref().unwrap().result_id,
        manual_id
    );

    // 2. The Playwright report of 2 Nov passes it: both runs, the latest wins.
    let pw_run = import(&c, &p, playwright_doc("2026-11-02"));
    let s = summary(&c, &p);
    let run_ids: Vec<&str> = s.runs.iter().map(|r| r.id.as_str()).collect();
    assert!(run_ids.contains(&manual_run.as_str()) && run_ids.contains(&pw_run.as_str()));
    let row = case_row(&s, &tc1);
    let last = row.last.as_ref().unwrap();
    assert_eq!(row.status, "passed");
    assert_eq!(last.run_id, pw_run);
    assert_eq!(last.origin, "imported");
    assert_eq!(last.source_tool.as_deref(), Some("playwright"));
    let r = &s.requirements[0];
    assert_eq!(
        (r.requirement_key.as_str(), r.status.as_str()),
        ("REQ-014", "passed")
    );
    assert_eq!((r.risk_level, r.risk_band.as_str()), (Some(20), "high"));
    assert_eq!(s.options.builds, vec!["1.4.2"]);

    // 3. A newer manual attempt (3 Nov) wins again.
    let (retest_run, retest_id) = manual(&c, &p, &tc1, "blocked", "2026-11-03T08:00:00Z");
    let s = summary(&c, &p);
    let last = case_row(&s, &tc1).last.clone().unwrap();
    assert_eq!(case_row(&s, &tc1).status, "blocked");
    assert_eq!(
        (last.run_id.as_str(), last.result_id.as_str()),
        (retest_run.as_str(), retest_id.as_str())
    );
    assert!(!last.stale);
    // The filters: the CI build alone shows the Playwright result.
    let ci = execution_summary_of(
        &c,
        &ExecutionFilter {
            project_id: p.clone(),
            build: Some(" 1.4.2 ".into()),
            ..Default::default()
        },
        U,
    )
    .unwrap()
    .unwrap();
    assert_eq!(case_row(&ci, &tc1).status, "passed");
    assert_eq!(ci.runs.len(), 1);

    // 4. Editing the case changes none of the results; they become stale.
    let before = summary(&c, &p);
    let mut edited = tc1_data();
    edited["steps"][1] = json!("inicia sesion con otra contrasena");
    edited["flows"] = json!([{"name": "Logout", "steps": [{"text": "cierra sesion"}]}]);
    test_case::update_case(&c, &tc1, &case_input(&p, "TC-001", "Login renamed", edited)).unwrap();
    let after = summary(&c, &p);
    let (b, a) = (case_row(&before, &tc1), case_row(&after, &tc1));
    assert_eq!(a.status, b.status);
    let (lb, la) = (b.last.as_ref().unwrap(), a.last.as_ref().unwrap());
    assert_eq!(
        (&la.result_id, &la.run_id, &la.revision_id, &la.status),
        (&lb.result_id, &lb.run_id, &lb.revision_id, &lb.status)
    );
    assert!(
        la.stale,
        "the executed revision is no longer the current one"
    );
    assert_eq!(after.targets.len(), before.targets.len());
    assert_eq!(after.progress, before.progress);
}

#[test]
fn a_superseded_shard_and_other_users_projects_are_left_out() {
    let c = device();
    let p = new_project(&c);
    let tc1 = test_case::insert_case(&c, &case_input(&p, "TC-001", "Login", tc1_data())).unwrap();
    let run = import(&c, &p, playwright_doc("2026-11-02"));
    // A newer normalizer read the same file of the same run: the old shard's
    // results stop counting (ADR-0013).
    c.execute_batch(&format!(
        "CREATE TEMP TABLE newer AS SELECT * FROM run_shards WHERE run_id = '{run}';
         UPDATE newer SET id = 'newer', normalizer_version = normalizer_version + 1;
         INSERT INTO run_shards SELECT * FROM newer;"
    ))
    .unwrap();
    let s = summary(&c, &p);
    assert_eq!(case_row(&s, &tc1).status, "not_run");
    assert!(execution_summary_of(
        &c,
        &ExecutionFilter {
            project_id: p.clone(),
            ..Default::default()
        },
        OTHER
    )
    .unwrap()
    .is_none());
}

#[test]
fn home_metrics_read_every_project_of_the_user() {
    let c = device();
    let p = new_project(&c);
    let tc1 = test_case::insert_case(&c, &case_input(&p, "TC-001", "Login", tc1_data())).unwrap();
    manual(&c, &p, &tc1, "passed", "2026-11-05T10:00:00Z");
    let request: HomeRequest = serde_json::from_value(json!({
        "dayStarts": [1793833200000_i64], "now": 1793966400000_i64,
        "windows": [{"id": "today", "fromIndex": 0}]
    }))
    .unwrap();
    let m = home_metrics(&c, U, &request).unwrap();
    assert_eq!(m.projects.len(), 1);
    assert_eq!(m.projects[0].counts.counts.passed, 1);
    assert_eq!(m.daily[0].manual, 1);
    assert_eq!(m.windows["today"].executed, 1);
    assert!(home_metrics(&c, OTHER, &request)
        .unwrap()
        .projects
        .is_empty());
}
