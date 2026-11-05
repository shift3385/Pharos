//! The web's runs API (EJE-06) against the desktop: the shared vectors of the
//! targets (`execution-target-vectors.json`, also read by the server's
//! `runs-targets.ts`) and the interop fixture (`web-run-interop.json`): the
//! desktop writes the same documents the web writes, and reads what the web
//! wrote as the web reads it. Also: a run cancelled elsewhere takes its local
//! drafts and their files when it is pulled.

use std::collections::HashMap;

use rusqlite::Connection;
use serde_json::{json, Value};

use super::manual::{self, save_draft, target_key, targets_of};
use super::*;
use crate::db::run_migrations;
use crate::{evidence, revisions, sync};

const U: &str = "11111111-1111-4111-8111-111111111111";

fn device() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    run_migrations(&c).unwrap();
    sync::assume_stable_steps_server(&c);
    c
}

fn fixture(name: &str) -> Value {
    let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn opt(v: &Value) -> Option<String> {
    v.as_str().map(String::from)
}

// ---- targets ---------------------------------------------------------------------

#[test]
fn execution_target_vectors() {
    let v = fixture("execution-target-vectors.json");
    let c = device();
    for case in v["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let id = case["caseId"].as_str().unwrap();
        let data = &case["data"];
        let targets = |flow: &Value, row: &Value| targets_of(id, data, flow.as_str(), row.as_str());
        for item in case["items"].as_array().unwrap() {
            let got = serde_json::to_value(targets(&item["flowId"], &item["rowId"])).unwrap();
            assert_eq!(got, item["targets"], "{name}: targets");
        }
        // `narrow` reads the frozen revision from the store.
        let revision = format!("rev-{id}");
        c.execute(
            "INSERT OR REPLACE INTO test_case_revisions (id, test_case_id, revision, title, data,
                    created_at, created_by)
             VALUES (?1, ?2, 1, 't', ?3, datetime('now'), ?4)",
            rusqlite::params![revision, id, data.to_string(), U],
        )
        .unwrap();
        for n in case["narrow"].as_array().unwrap() {
            let mut item = ItemContext {
                project_id: "p".into(),
                run_id: "r".into(),
                test_case_id: id.into(),
                revision_id: revision.clone(),
                flow_id: opt(&n["item"]["flowId"]),
                example_row_id: opt(&n["item"]["exampleRowId"]),
                example_row: n["item"]["exampleRow"].as_i64(),
                configuration_id: None,
                example_values: None,
            };
            let got = match narrow(&c, &mut item, &opt(&n["flowId"]), &opt(&n["rowId"])) {
                Ok(()) => json!({
                    "flowId": item.flow_id, "exampleRowId": item.example_row_id,
                    "exampleRow": item.example_row, "exampleValues": item.example_values,
                }),
                Err(e) => json!({ "error": e }),
            };
            assert_eq!(got, n["expect"], "{name}: narrow {n}");
        }
        // `check_no_overlap`: two items overlap when their target keys meet.
        for o in case["overlap"].as_array().unwrap() {
            let keys = |x: &Value| -> std::collections::HashSet<String> {
                targets(&x["flowId"], &x["rowId"])
                    .into_iter()
                    .map(|t| t.key)
                    .collect()
            };
            let got = !keys(&o["a"]).is_disjoint(&keys(&o["b"]));
            assert_eq!(got, o["expect"].as_bool().unwrap(), "{name}: overlap {o}");
        }
    }
}

// ---- interop ---------------------------------------------------------------------

/// Ids made here become the fixture's names; bookkeeping keys become "*".
fn normalized(v: &Value, names: &HashMap<String, String>, keys: &[String]) -> Value {
    fn walk(
        v: &Value,
        key: Option<&str>,
        names: &HashMap<String, String>,
        keys: &[String],
    ) -> Value {
        if key.is_some_and(|k| keys.iter().any(|x| x == k)) && !v.is_null() {
            return json!("*");
        }
        match v {
            Value::String(s) => json!(names.get(s).cloned().unwrap_or_else(|| s.clone())),
            Value::Array(a) => Value::Array(a.iter().map(|x| walk(x, None, names, keys)).collect()),
            Value::Object(m) => Value::Object(
                m.iter()
                    .map(|(k, x)| (k.clone(), walk(x, Some(k), names, keys)))
                    .collect(),
            ),
            other => other.clone(),
        }
    }
    walk(v, None, names, keys)
}

fn keys_of(f: &Value) -> Vec<String> {
    f["normalize"]["keys"]
        .as_array()
        .unwrap()
        .iter()
        .map(|k| k.as_str().unwrap().to_string())
        .collect()
}

fn pulled(c: &Connection, entity: &str, payload: &Value, hlc: &str) {
    let ws = crate::db::ensure_workspace(c).unwrap();
    let doc: sync::RemoteDoc = serde_json::from_value(json!({
        "entity": entity, "entityId": payload["id"], "payload": payload,
        "revision": payload["revision"].as_i64().unwrap_or(1), "hlc": hlc,
    }))
    .unwrap();
    sync::apply_doc(c, &ws, U, &doc).unwrap();
}

/// The project and the cases both sides start from, as pulled documents.
fn start(c: &Connection, f: &Value) {
    let mut project = f["project"].clone();
    project["ownerId"] = json!(U);
    pulled(c, "project", &project, "000000000000100-00000-web");
    for case in f["cases"].as_array().unwrap() {
        let mut case = case.clone();
        case["revision"] = json!(1);
        pulled(c, "test_case", &case, "000000000000101-00000-web");
    }
}

fn with_run_started(mut docs: Value) -> Value {
    for d in docs.as_array_mut().unwrap() {
        if d["entity"] == "run" {
            d["payload"]["startedAt"] = json!("*");
        }
    }
    docs
}

#[test]
fn what_the_desktop_writes_is_what_the_web_writes() {
    let f = fixture("web-run-interop.json");
    let keys = keys_of(&f);
    let c = device();
    start(&c, &f);
    let mut run_json = f["run"].clone();
    run_json["userId"] = json!(U);
    let input: RunInput = serde_json::from_value(run_json).unwrap();
    let items: Vec<RunItemInput> = serde_json::from_value(f["items"].clone()).unwrap();
    let run = manual::create_manual(&c, input, &items).unwrap();
    let item_ids: Vec<String> = list_items(&c, &run, U)
        .unwrap()
        .into_iter()
        .map(|i| i.id)
        .collect();
    for a in f["attempts"].as_array().unwrap() {
        let mut v = a["input"].clone();
        let item = &item_ids[a["item"].as_u64().unwrap() as usize];
        v["runItemId"] = json!(item);
        v["userId"] = json!(U);
        let input: ResultInput = serde_json::from_value(v).unwrap();
        // As the executor: the target's draft carries the attempt id.
        let (flow, row): (Option<String>, Option<String>) = c
            .query_row(
                "SELECT flow_id, example_row_id FROM run_items WHERE id = ?1",
                [item],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        let key = target_key(
            input.flow_id.clone().or(flow).as_deref(),
            input.example_row_id.clone().or(row).as_deref(),
        );
        save_draft(
            &c,
            item,
            &key,
            Some(&json!({"attemptId": input.attempt_id})),
            U,
        )
        .unwrap();
        manual::record_from_draft(&c, &input).unwrap();
    }
    // The names of what this side made.
    let mut names = HashMap::from([(run.clone(), "run".to_string())]);
    for (n, id) in item_ids.iter().enumerate() {
        names.insert(id.clone(), format!("item-{n}"));
    }
    let mut written = Vec::new();
    for id in &item_ids {
        let revision: String = c
            .query_row(
                "SELECT test_case_revision_id FROM run_items WHERE id = ?1",
                [id],
                |r| r.get(0),
            )
            .unwrap();
        let p = revisions::payload(&c, &revision).unwrap().unwrap();
        written.push(json!({"entity": "test_case_revision", "entityId": revision, "payload": p}));
    }
    let (p, _, _) = read_payload(&c, RUN, &run).unwrap().unwrap();
    written.push(json!({"entity": "run", "entityId": run, "payload": p}));
    for id in &item_ids {
        let (p, _, _) = read_payload(&c, RUN_ITEM, id).unwrap().unwrap();
        written.push(json!({"entity": "run_item", "entityId": id, "payload": p}));
    }
    for a in f["attempts"].as_array().unwrap() {
        let id = a["input"]["attemptId"].as_str().unwrap();
        let p = result_payload(&c, id).unwrap().unwrap();
        for s in p["steps"].as_array().unwrap() {
            names.insert(
                s["id"].as_str().unwrap().to_string(),
                format!("{id}:{}", s["position"]),
            );
        }
        written.push(json!({"entity": "result", "entityId": id, "payload": p}));
    }
    let got = normalized(&with_run_started(Value::Array(written)), &names, &keys);
    let want = normalized(
        &with_run_started(f["documents"].clone()),
        &HashMap::new(),
        &keys,
    );
    assert_eq!(got, want);
}

#[test]
fn what_the_web_wrote_reads_on_the_desktop_as_on_the_web() {
    let f = fixture("web-run-interop.json");
    let keys = keys_of(&f);
    let c = device();
    start(&c, &f);
    for (n, d) in f["documents"].as_array().unwrap().iter().enumerate() {
        let entity = d["entity"].as_str().unwrap();
        let hlc = d["payload"]["hlc"]
            .as_str()
            .map(String::from)
            .unwrap_or_else(|| format!("000000000000{}-00000-web", 200 + n));
        pulled(&c, entity, &d["payload"], &hlc);
    }
    let mut overview =
        serde_json::to_value(manual::overview(&c, "run", U).unwrap().unwrap()).unwrap();
    overview["run"]["startedAt"] = json!("*");
    let mut details = Vec::new();
    for n in 0..f["items"].as_array().unwrap().len() {
        let d = manual::item_detail(&c, &format!("item-{n}"), U)
            .unwrap()
            .unwrap();
        details.push(serde_json::to_value(d).unwrap());
    }
    let got = normalized(
        &json!({"overview": overview, "items": details}),
        &HashMap::new(),
        &keys,
    );
    let want = normalized(&f["views"], &HashMap::new(), &keys);
    assert_eq!(got, want);
    // And what it pushes back is the very document the web wrote.
    for d in f["documents"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|d| d["entity"] == "result")
    {
        let id = d["entityId"].as_str().unwrap();
        let again = result_payload(&c, id).unwrap().unwrap();
        assert_eq!(
            normalized(&again, &HashMap::new(), &keys),
            normalized(&d["payload"], &HashMap::new(), &keys),
            "{id}"
        );
    }
}

// ---- a run cancelled elsewhere ---------------------------------------------------

#[test]
fn a_pulled_cancelled_run_takes_its_drafts_and_their_files() {
    let f = fixture("web-run-interop.json");
    let c = device();
    start(&c, &f);
    let mut run_json = f["run"].clone();
    run_json["userId"] = json!(U);
    let input: RunInput = serde_json::from_value(run_json).unwrap();
    let items: Vec<RunItemInput> = serde_json::from_value(f["items"].clone()).unwrap();
    let run = manual::create_manual(&c, input, &items).unwrap();
    let item = list_items(&c, &run, U).unwrap()[1].id.clone();
    save_draft(
        &c,
        &item,
        "-/-",
        Some(&json!({"attemptId": Uuid::new_v4().to_string(), "notes": "x"})),
        U,
    )
    .unwrap();
    let stored = evidence::Stored {
        sha256: "ab".repeat(32),
        size: 10,
    };
    manual::add_draft_attachment(
        &c,
        "att-1",
        &item,
        "-/-",
        Some("s1"),
        "shot.png",
        Some("image/png"),
        "screenshot",
        &stored,
        U,
    )
    .unwrap();
    let drafts = |c: &Connection| -> i64 {
        c.query_row("SELECT count(*) FROM execution_drafts", [], |r| r.get(0))
            .unwrap()
    };
    let live_files = |c: &Connection| -> i64 {
        c.query_row(
            "SELECT count(*) FROM attachments WHERE owner_entity = 'execution_draft' AND deleted_at IS NULL",
            [],
            |r| r.get(0),
        )
        .unwrap()
    };
    assert_eq!((drafts(&c), live_files(&c)), (1, 1));
    // The run and its items reached the server (a change still pending here
    // would make the pulled one a conflict instead).
    c.execute("UPDATE oplog SET synced_at = datetime('now')", [])
        .unwrap();
    // Completed elsewhere: the draft stays (read only, as a local close).
    let (mut p, revision, _) = read_payload(&c, RUN, &run).unwrap().unwrap();
    p["status"] = json!("completed");
    p["revision"] = json!(revision + 1);
    pulled(&c, RUN, &p, "000000000000900-00000-web");
    assert_eq!((drafts(&c), live_files(&c)), (1, 1));
    // Cancelled elsewhere: the drafts and their files go.
    p["status"] = json!("aborted");
    p["revision"] = json!(revision + 2);
    pulled(&c, RUN, &p, "000000000000901-00000-web");
    assert_eq!((drafts(&c), live_files(&c)), (0, 0));
    let state: String = c
        .query_row(
            "SELECT local_state FROM blobs WHERE sha256 = ?1",
            [&stored.sha256],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(state, "deleting", "the file's content is released");
}
