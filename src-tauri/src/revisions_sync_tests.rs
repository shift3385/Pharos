//! Case revisions and stable steps across devices (DAT-02, ADR-0011): two
//! devices converge on the same revision ids, two offline "revision 2" live
//! side by side, a case an older client wrote gets the same ids everywhere,
//! and nothing of the new shape reaches a server without `stable-steps`.

use rusqlite::Connection;
use serde_json::{json, Value};

use crate::db::{ensure_workspace, run_migrations};
use crate::{project, revisions, steps, sync, test_case};

const U: &str = "11111111-1111-4111-8111-111111111111";

fn device() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    run_migrations(&c).unwrap();
    sync::assume_stable_steps_server(&c);
    c
}

fn case_input(project: &str, title: &str, data: Value) -> test_case::TestCaseInput {
    serde_json::from_value(json!({
        "projectId": project, "title": title, "author": "Ada", "data": data, "userId": U
    }))
    .unwrap()
}

fn as_doc(d: &Value, revision: &Value) -> sync::RemoteDoc {
    serde_json::from_value(json!({
        "entity": d["entity"], "entityId": d["entityId"], "payload": d["payload"],
        "revision": revision, "hlc": d["hlc"], "deleted": d["op"] == "delete",
    }))
    .unwrap()
}

/// Everything `from` would push (lww, then append-only), as the server hands
/// it back on a pull; the lww part is marked synced on `from`.
fn push(from: &Connection) -> Vec<sync::RemoteDoc> {
    let (mut lww, append) = push_split(from);
    lww.extend(append);
    lww
}

/// `push`, as (lww documents, append-only documents).
fn push_split(from: &Connection) -> (Vec<sync::RemoteDoc>, Vec<sync::RemoteDoc>) {
    let lww = serde_json::to_value(sync::build_pending(from, U).unwrap()).unwrap();
    let pushed: Vec<sync::PushedDelta> = serde_json::from_value(lww["deltas"].clone()).unwrap();
    sync::mark_pushed(from, U, &pushed).unwrap();
    let append = serde_json::to_value(sync::build_pending_append(from, U).unwrap()).unwrap();
    let one = json!(1);
    let docs = |v: &Value, append: bool| -> Vec<sync::RemoteDoc> {
        v["deltas"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|d| !append || d["entity"] == revisions::ENTITY)
            .map(|d| as_doc(d, if append { &one } else { &d["revision"] }))
            .collect()
    };
    (docs(&lww, false), docs(&append, true))
}

fn pull(into: &Connection, docs: &[sync::RemoteDoc]) {
    let ws = ensure_workspace(into).unwrap();
    for d in docs {
        sync::apply_doc(into, &ws, U, d).unwrap();
    }
}

/// (revision, id) of every hashed revision row of a case, sorted.
fn revision_rows(c: &Connection, case_id: &str) -> Vec<(i64, String)> {
    c.prepare(
        "SELECT revision, id FROM test_case_revisions
          WHERE test_case_id = ?1 AND content_sha256 IS NOT NULL ORDER BY revision, id",
    )
    .unwrap()
    .query_map([case_id], |r| Ok((r.get(0)?, r.get(1)?)))
    .unwrap()
    .collect::<rusqlite::Result<_>>()
    .unwrap()
}

fn data_of(c: &Connection, case_id: &str) -> Value {
    let s: String = c
        .query_row(
            "SELECT data FROM test_cases WHERE id = ?1",
            [case_id],
            |r| r.get(0),
        )
        .unwrap();
    serde_json::from_str(&s).unwrap()
}

fn new_project(c: &Connection) -> String {
    let input: project::ProjectInput =
        serde_json::from_value(json!({"name": "Checkout", "ownerId": U})).unwrap();
    project::insert_project(c, &input).unwrap()
}

#[test]
fn two_devices_converge_on_the_same_revisions_and_step_ids() {
    let a = device();
    let p = new_project(&a);
    let id = test_case::insert_case(
        &a,
        &case_input(&p, "Pay", json!({"steps": ["open", "pay"]})),
    )
    .unwrap();
    let mut data = data_of(&a, &id);
    data["steps"][1]["text"] = json!("pay by card");
    test_case::update_case(&a, &id, &case_input(&p, "Pay", data)).unwrap();

    let b = device();
    pull(&b, &push(&a));
    assert_eq!(data_of(&b, &id), data_of(&a, &id));
    assert_eq!(revision_rows(&b, &id), revision_rows(&a, &id));
    assert_eq!(revision_rows(&b, &id).len(), 2);
    assert_eq!(
        revisions::current_id(&b, &id).unwrap(),
        revisions::current_id(&a, &id).unwrap()
    );
    // B pushes nothing back: a pulled state's revision stays local.
    let back = serde_json::to_value(sync::build_pending_append(&b, U).unwrap()).unwrap();
    assert!(back["deltas"]
        .as_array()
        .unwrap()
        .iter()
        .all(|d| d["entity"] != revisions::ENTITY));
}

#[test]
fn two_offline_revision_twos_live_side_by_side() {
    let a = device();
    let p = new_project(&a);
    let id = test_case::insert_case(&a, &case_input(&p, "Pay", json!({"steps": ["x"]}))).unwrap();
    let b = device();
    pull(&b, &push(&a));

    // Both edit revision 1 offline.
    let data = data_of(&a, &id);
    test_case::update_case(&a, &id, &case_input(&p, "Pay on A", data.clone())).unwrap();
    test_case::update_case(&b, &id, &case_input(&p, "Pay on B", data)).unwrap();
    let ((_, revs_a), (_, revs_b)) = (push_split(&a), push_split(&b));
    // The case itself becomes a conflict for the user; the revisions never do.
    pull(&a, &revs_b);
    pull(&b, &revs_a);
    let rows_a = revision_rows(&a, &id);
    assert_eq!(rows_a, revision_rows(&b, &id));
    let twos: Vec<_> = rows_a.iter().filter(|(rev, _)| *rev == 2).collect();
    assert_eq!(twos.len(), 2, "two different revision 2, both kept");
    assert_ne!(twos[0].1, twos[1].1);
}

#[test]
fn a_case_an_older_client_wrote_gets_the_same_ids_on_every_device() {
    let legacy = json!({
        "gherkinLevel": "outline",
        "steps": ["I log in as <user>"],
        "examples": {"headers": ["user"], "rows": [["ana"], ["bob"]]}
    });
    let project_doc: sync::RemoteDoc = serde_json::from_value(json!({
        "entity": "project", "entityId": "p1", "revision": 1, "hlc": "001730000000000-00000-old",
        "payload": {"id": "p1", "name": "P", "ownerId": U, "caseIdPrefix": "ATS_", "caseIdDigits": 3}
    }))
    .unwrap();
    let case_doc: sync::RemoteDoc = serde_json::from_value(json!({
        "entity": "test_case", "entityId": "c-old", "revision": 3, "hlc": "001730000000001-00000-old",
        "payload": {"id": "c-old", "projectId": "p1", "scenarioId": "ATS_001", "title": "Login",
                    "version": "1.0", "status": "draft", "priority": "medium", "author": "Ada",
                    "data": legacy}
    }))
    .unwrap();
    let (a, b) = (device(), device());
    for d in [&a, &b] {
        pull(d, &[project_doc.clone(), case_doc.clone()]);
    }
    let mut expected = legacy.clone();
    steps::normalize_case_data("c-old", &mut expected);
    assert_eq!(data_of(&a, "c-old"), expected);
    assert_eq!(data_of(&b, "c-old"), expected);
    assert_eq!(revision_rows(&a, "c-old"), revision_rows(&b, "c-old"));
    assert_eq!(revision_rows(&a, "c-old")[0].0, 3);
}

#[test]
fn nothing_of_the_new_shape_goes_to_a_server_without_stable_steps() {
    let c = Connection::open_in_memory().unwrap();
    run_migrations(&c).unwrap();
    let p = new_project(&c);
    test_case::insert_case(&c, &case_input(&p, "Pay", json!({"steps": ["x"]}))).unwrap();
    let entities = |v: Value| -> Vec<String> {
        v["deltas"]
            .as_array()
            .unwrap()
            .iter()
            .map(|d| d["entity"].as_str().unwrap().to_string())
            .collect()
    };
    let lww = entities(serde_json::to_value(sync::build_pending(&c, U).unwrap()).unwrap());
    let append =
        entities(serde_json::to_value(sync::build_pending_append(&c, U).unwrap()).unwrap());
    assert_eq!(lww, ["project"], "the case waits");
    assert!(append.iter().all(|e| e == "audit_event"), "{append:?}");
    assert_eq!(sync::held_back_cases(&c).unwrap(), 1);
    // A server without the feature (an older one) changes nothing.
    sync::assume_server_features(&c, "key-conflicts,append-only");
    assert_eq!(sync::held_back_cases(&c).unwrap(), 1);
    // Once the server lists it, both go out.
    sync::assume_stable_steps_server(&c);
    assert_eq!(sync::held_back_cases(&c).unwrap(), 0);
    let lww = entities(serde_json::to_value(sync::build_pending(&c, U).unwrap()).unwrap());
    let append =
        entities(serde_json::to_value(sync::build_pending_append(&c, U).unwrap()).unwrap());
    assert!(lww.contains(&"test_case".to_string()));
    assert!(append.contains(&revisions::ENTITY.to_string()));
}
