//! Findings and metrics (ING-06, ADR-0053): the normalized documents the TS
//! parsers commit for real axe, SARIF and k6 samples
//! (`packages/formats/src/fixtures/*/normalized/`) stored end to end through
//! the importer, re-imported as a no-op, converged on a second device through
//! their sync documents, refused when malformed, and held back from a server
//! without `findings`.

use rusqlite::Connection;
use serde_json::{json, Value};

use super::*;
use crate::db::{in_tx, run_migrations};
use crate::evidence::Stored;
use crate::runs::import::{commit, preview, ReportImportOutcome, ReportImportRequest};
use crate::{project, sync};

const U: &str = "11111111-1111-4111-8111-111111111111";
const SHA: &str = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
const ALL_FEATURES: &str =
    "key-conflicts,append-only,stable-steps,runs,custom-fields,cycles,defects,findings";

macro_rules! normalized {
    ($path:literal) => {
        include_str!(concat!("../../../../packages/formats/src/fixtures/", $path))
    };
}

fn doc_of(snapshot: &str) -> Value {
    serde_json::from_str::<Value>(snapshot).unwrap()["doc"].clone()
}

fn device() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    run_migrations(&c).unwrap();
    sync::assume_server_features(&c, ALL_FEATURES);
    c
}

fn new_project(c: &Connection) -> String {
    let input: project::ProjectInput = serde_json::from_value(
        json!({"name": "Tienda", "ownerId": U, "caseIdPrefix": "TC-", "caseIdDigits": 3}),
    )
    .unwrap();
    project::insert_project(c, &input).unwrap()
}

fn new_run(p: &str, doc: Value) -> ReportImportRequest {
    serde_json::from_value(json!({
        "projectId": p, "userId": U, "doc": doc, "sha256": SHA, "fileName": "report.json",
        "newRun": {"title": "CI #7"}
    }))
    .unwrap()
}

fn into_run(p: &str, run: &str, doc: Value) -> ReportImportRequest {
    serde_json::from_value(json!({
        "projectId": p, "userId": U, "doc": doc, "sha256": SHA, "runId": run
    }))
    .unwrap()
}

fn import(c: &Connection, req: &ReportImportRequest) -> Result<ReportImportOutcome, String> {
    let raw = Stored {
        sha256: SHA.into(),
        size: 1234,
    };
    in_tx(c, |tx| commit(tx, req, &raw))
}

fn count(c: &Connection, sql: &str) -> i64 {
    c.query_row(sql, [], |r| r.get(0)).unwrap()
}

/// Every column but the device's own workspace, row by row in id order.
fn rows(c: &Connection, table: &str) -> Vec<Value> {
    let mut stmt = c
        .prepare(&format!("SELECT * FROM {table} ORDER BY id"))
        .unwrap();
    let names: Vec<String> = stmt.column_names().map(|s| s.to_string()).collect();
    stmt.query_map([], |r| {
        let mut m = serde_json::Map::new();
        for (i, n) in names.iter().enumerate() {
            if n == "workspace_id" {
                continue;
            }
            let v: rusqlite::types::Value = r.get(i)?;
            m.insert(
                n.clone(),
                match v {
                    rusqlite::types::Value::Null => Value::Null,
                    rusqlite::types::Value::Integer(x) => json!(x),
                    rusqlite::types::Value::Real(x) => json!(x),
                    rusqlite::types::Value::Text(x) => json!(x),
                    rusqlite::types::Value::Blob(_) => json!("<blob>"),
                },
            );
        }
        Ok(Value::Object(m))
    })
    .unwrap()
    .collect::<rusqlite::Result<_>>()
    .unwrap()
}

#[test]
fn an_axe_report_previews_and_stores_its_findings_and_metrics() {
    let c = device();
    let p = new_project(&c);
    let doc = doc_of(normalized!("axe/normalized/checkout-broken.json"));
    let pre = preview(&c, &new_run(&p, doc.clone())).unwrap();
    assert_eq!(pre.format, "axe");
    assert_eq!((pre.results, pre.findings, pre.metrics), (0, 9, 3));
    assert_eq!(
        pre.finding_severities,
        json!({"critical": 3, "high": 3, "info": 3})
    );
    let out = import(&c, &new_run(&p, doc)).unwrap();
    assert_eq!((out.findings, out.metrics, out.results), (9, 3, 0));
    assert_eq!(count(&c, "SELECT count(*) FROM findings"), 9);
    assert_eq!(count(&c, "SELECT count(*) FROM metrics"), 3);
    // One append per row, for the push.
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM oplog WHERE entity IN ('finding','metric') AND op = 'append'"
        ),
        12
    );
    // The review findings keep their flag; the html is stored as it came.
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM findings WHERE severity = 'info'
                    AND json_extract(attributes, '$.needsReview') = 1"
        ),
        3
    );
    // The import event counts them.
    let summary: String = c
        .query_row(
            "SELECT summary FROM audit_log WHERE action = 'import' ORDER BY rowid DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let summary: Value = serde_json::from_str(&summary).unwrap();
    assert_eq!(summary["findings"], 9);
    assert_eq!(summary["metrics"], 3);
}

#[test]
fn the_same_file_again_in_the_same_run_writes_nothing() {
    let c = device();
    let p = new_project(&c);
    let doc = doc_of(normalized!("sarif/normalized/trivy-misconfig.sarif.json"));
    let first = import(&c, &new_run(&p, doc.clone())).unwrap();
    assert_eq!(first.findings, 2);
    // Keep the run open to import into it again.
    c.execute("UPDATE runs SET status = 'in_progress'", [])
        .unwrap();
    let again = import(&c, &into_run(&p, &first.run_id, doc)).unwrap();
    assert!(again.already_imported);
    assert_eq!(count(&c, "SELECT count(*) FROM findings"), 2);
}

#[test]
fn k6_thresholds_are_stored_with_their_result() {
    let c = device();
    let p = new_project(&c);
    let doc = doc_of(normalized!("k6/normalized/handle-summary.json"));
    let pre = preview(&c, &new_run(&p, doc.clone())).unwrap();
    assert_eq!((pre.metrics, pre.thresholds_failed), (85, 1));
    import(&c, &new_run(&p, doc)).unwrap();
    let failed: (String, Option<String>, f64, String) = c
        .query_row(
            "SELECT name, aggregation, value, threshold FROM metrics WHERE passed = 0",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .unwrap();
    assert_eq!(
        failed,
        (
            "http_req_failed".into(),
            Some("rate".into()),
            0.5,
            "rate<0.0001".into()
        )
    );
    assert_eq!(
        count(&c, "SELECT count(*) FROM metrics WHERE passed = 1"),
        3
    );
    assert_eq!(
        count(&c, "SELECT count(*) FROM metrics WHERE passed IS NULL"),
        81
    );
}

#[test]
fn a_second_device_converges_from_the_sync_documents() {
    let a = device();
    let p = new_project(&a);
    let doc = doc_of(normalized!("axe/normalized/checkout-broken.json"));
    import(&a, &new_run(&p, doc)).unwrap();
    let b = device();
    for (entity, table, read, insert) in [
        (
            FINDING,
            "findings",
            finding_payload as fn(&Connection, &str) -> Result<Option<Value>, String>,
            finding_insert_if_absent as fn(&Connection, &str, &Value) -> Result<(), String>,
        ),
        (METRIC, "metrics", metric_payload, metric_insert_if_absent),
    ] {
        let ids: Vec<String> = a
            .prepare(&format!("SELECT id FROM {table}"))
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        for id in ids {
            let doc = read(&a, &id).unwrap().unwrap();
            assert_eq!(doc["id"], json!(id), "{entity}");
            insert(&b, U, &doc).unwrap();
            // Twice is the same as once.
            insert(&b, U, &doc).unwrap();
        }
        assert_eq!(rows(&a, table), rows(&b, table), "{entity}");
    }
}

#[test]
fn a_malformed_finding_refuses_the_whole_import() {
    let c = device();
    let p = new_project(&c);
    let mut doc = doc_of(normalized!("sarif/normalized/trivy-misconfig.sarif.json"));
    doc["findings"][1]
        .as_object_mut()
        .unwrap()
        .remove("fingerprint");
    let e = import(&c, &new_run(&p, doc)).unwrap_err();
    assert!(
        e.starts_with("invalid-report: findings.1.fingerprint"),
        "{e}"
    );
    assert_eq!(count(&c, "SELECT count(*) FROM runs"), 0);
    assert_eq!(count(&c, "SELECT count(*) FROM findings"), 0);
}

#[test]
fn a_repeated_metric_keeps_the_first_and_says_so() {
    let c = device();
    let p = new_project(&c);
    let mut doc = doc_of(normalized!("axe/normalized/checkout-broken.json"));
    let first = doc["metrics"][0].clone();
    doc["metrics"].as_array_mut().unwrap().push(first);
    let out = import(&c, &new_run(&p, doc)).unwrap();
    assert_eq!(out.metrics, 3);
    assert!(out.warnings.iter().any(|w| w.code == "duplicate-metric"));
}

#[test]
fn findings_wait_for_a_server_that_lists_findings() {
    let c = device();
    let p = new_project(&c);
    let doc = doc_of(normalized!("axe/normalized/checkout-broken.json"));
    import(&c, &new_run(&p, doc)).unwrap();
    let entities = |c: &Connection| -> Vec<String> {
        let pending = serde_json::to_value(sync::build_pending_append(c, U).unwrap()).unwrap();
        pending["deltas"]
            .as_array()
            .unwrap()
            .iter()
            .map(|d| d["entity"].as_str().unwrap().to_string())
            .collect()
    };
    sync::assume_server_features(
        &c,
        "key-conflicts,append-only,stable-steps,runs,custom-fields,cycles,defects",
    );
    let held = entities(&c);
    assert!(held.contains(&"run_shard".to_string()));
    assert!(!held.iter().any(|e| e == FINDING || e == METRIC));
    sync::assume_server_features(&c, ALL_FEATURES);
    let sent = entities(&c);
    assert_eq!(sent.iter().filter(|e| *e == FINDING).count(), 9);
    assert_eq!(sent.iter().filter(|e| *e == METRIC).count(), 3);
}

const FP: &str = "sarif:trivy:DS002:primaryLocationLineHash=abc:1";

#[test]
fn a_triage_decision_needs_a_known_state_and_a_reason() {
    let c = device();
    let p = new_project(&c);
    let add = |state: &str, reason: Option<&str>| triage_add(&c, &p, U, FP, state, reason, None);
    assert_eq!(
        add("false_positive", None).unwrap_err(),
        "invalid-triage: reason"
    );
    assert_eq!(
        add("false_positive", Some("  ")).unwrap_err(),
        "invalid-triage: reason"
    );
    assert!(add("ignored", Some("x"))
        .unwrap_err()
        .starts_with("invalid-triage: state"));
    assert_eq!(
        triage_add(&c, &p, U, " ", "open", None, None).unwrap_err(),
        "invalid-triage: fingerprint"
    );
    assert_eq!(
        triage_add(&c, &p, "someone-else", FP, "open", None, None).unwrap_err(),
        "project-not-found"
    );
    // Taking a decision back needs no reason.
    add("open", None).unwrap();
}

#[test]
fn the_latest_decision_is_the_current_one_and_the_rest_is_history() {
    let c = device();
    let p = new_project(&c);
    triage_add(
        &c,
        &p,
        U,
        FP,
        "false_positive",
        Some("Validado en el esquema"),
        None,
    )
    .unwrap();
    triage_add(
        &c,
        &p,
        U,
        FP,
        "accepted_risk",
        Some("Hasta 0.7.0"),
        Some("d1"),
    )
    .unwrap();
    triage_add(&c, &p, U, "other", "fixed", Some("Corregido en #120"), None).unwrap();
    let history = triage_history(&c, &p, FP).unwrap();
    assert_eq!(
        history.iter().map(|e| e.state.as_str()).collect::<Vec<_>>(),
        ["accepted_risk", "false_positive"]
    );
    let current = triage_current(&c, &p).unwrap();
    assert_eq!(current.len(), 2);
    assert_eq!(current[FP].state, "accepted_risk");
    assert_eq!(current[FP].defect_id.as_deref(), Some("d1"));
    assert_eq!(current["other"].state, "fixed");
    // Each decision is one append for the push.
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM oplog WHERE entity = 'finding_triage' AND op = 'append'"
        ),
        3
    );
}

#[test]
fn two_devices_agree_on_the_current_decision() {
    let a = device();
    let p = new_project(&a);
    let b = device();
    let doc_a = {
        let id = triage_add(&a, &p, U, FP, "false_positive", Some("A"), None).unwrap();
        triage_payload(&a, &id).unwrap().unwrap()
    };
    // b knows the same project (as a pull would bring it) and decides later,
    // on its own clock.
    let pb = new_project(&b);
    b.execute(
        "UPDATE projects SET id = ?1 WHERE id = ?2",
        rusqlite::params![p, pb],
    )
    .unwrap();
    let doc_b = {
        let id = triage_add(&b, &p, U, FP, "fixed", Some("B"), None).unwrap();
        triage_payload(&b, &id).unwrap().unwrap()
    };
    triage_insert_if_absent(&a, U, &doc_b).unwrap();
    triage_insert_if_absent(&b, U, &doc_a).unwrap();
    triage_insert_if_absent(&b, U, &doc_a).unwrap();
    let on_a = triage_current(&a, &p).unwrap();
    let on_b = triage_current(&b, &p).unwrap();
    assert_eq!(on_a[FP], on_b[FP]);
    assert_eq!(
        triage_history(&a, &p, FP).unwrap(),
        triage_history(&b, &p, FP).unwrap()
    );
    assert_eq!(triage_history(&a, &p, FP).unwrap().len(), 2);
}

#[test]
fn triage_waits_for_a_server_that_lists_findings() {
    let c = device();
    let p = new_project(&c);
    triage_add(&c, &p, U, FP, "open", None, None).unwrap();
    let has_triage = |c: &Connection| {
        let pending = serde_json::to_value(sync::build_pending_append(c, U).unwrap()).unwrap();
        pending["deltas"]
            .as_array()
            .unwrap()
            .iter()
            .any(|d| d["entity"] == FINDING_TRIAGE)
    };
    sync::assume_server_features(&c, "key-conflicts,append-only,stable-steps,runs");
    assert!(!has_triage(&c));
    sync::assume_server_features(&c, ALL_FEATURES);
    assert!(has_triage(&c));
}

fn with_sha(req: ReportImportRequest, sha: &str) -> ReportImportRequest {
    serde_json::from_value(json!({
        "projectId": req.project_id, "userId": req.user_id, "doc": req.doc,
        "sha256": sha, "fileName": "report.json", "newRun": {"title": "CI"}
    }))
    .unwrap()
}

#[test]
fn the_run_detail_lists_findings_worst_first_with_triage_and_what_is_new() {
    let c = device();
    let p = new_project(&c);
    let doc = doc_of(normalized!("axe/normalized/checkout-broken.json"));
    let first = import(&c, &new_run(&p, doc.clone())).unwrap();
    // The first run of the tool: nothing is new.
    let one = list_findings(&c, &first.run_id, U).unwrap();
    assert_eq!(one.len(), 9);
    assert!(one.iter().all(|f| !f.is_new));
    let ranks: Vec<usize> = one.iter().map(|f| severity_rank(&f.severity)).collect();
    assert!(ranks.windows(2).all(|w| w[0] <= w[1]), "{ranks:?}");
    // A later run of the same tool where one finding moved to another node.
    let mut later = doc;
    later["findings"][0]["fingerprint"] = json!("pharos:moved");
    later["run"]["startedAt"] = json!("2030-01-01T00:00:00.000Z");
    let sha2 = "1111111111111111111111111111111111111111111111111111111111111111";
    let raw = Stored {
        sha256: sha2.into(),
        size: 1,
    };
    let second = in_tx(&c, |tx| {
        commit(tx, &with_sha(new_run(&p, later), sha2), &raw)
    })
    .unwrap();
    let two = list_findings(&c, &second.run_id, U).unwrap();
    let new: Vec<&str> = two
        .iter()
        .filter(|f| f.is_new)
        .map(|f| f.fingerprint.as_str())
        .collect();
    assert_eq!(new, ["pharos:moved"]);
    // A triage decision shows on every run with that fingerprint.
    let fp = one[1].fingerprint.clone();
    triage_add(
        &c,
        &p,
        U,
        &fp,
        "accepted_risk",
        Some("Diseño aprobado"),
        None,
    )
    .unwrap();
    for run in [&first.run_id, &second.run_id] {
        let f = list_findings(&c, run, U).unwrap();
        let t = f
            .iter()
            .find(|x| x.fingerprint == fp)
            .unwrap()
            .triage
            .clone();
        assert_eq!(t.map(|t| t.state), Some("accepted_risk".to_string()));
    }
    // Someone else sees nothing.
    assert!(list_findings(&c, &first.run_id, "someone-else")
        .unwrap()
        .is_empty());
}

#[test]
fn the_run_detail_lists_failed_thresholds_first() {
    let c = device();
    let p = new_project(&c);
    let doc = doc_of(normalized!("k6/normalized/handle-summary.json"));
    let out = import(&c, &new_run(&p, doc)).unwrap();
    let m = list_metrics(&c, &out.run_id, U).unwrap();
    assert_eq!(m.len(), 85);
    assert_eq!(m[0].passed, Some(false));
    assert_eq!(m[0].name, "http_req_failed");
    assert!(m[1..].iter().all(|x| x.passed != Some(false)));
    assert!(list_metrics(&c, &out.run_id, "someone-else")
        .unwrap()
        .is_empty());
}
