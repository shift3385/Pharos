//! Custom fields, case type and automation status (FLD-01, ADR-0018): the
//! shared validation vectors, the definitions repository, case saves, the
//! revision invariants and the sync between devices and with older servers.

use rusqlite::{params, Connection};
use serde_json::{json, Value};

use crate::custom_fields::{self, FieldOption, FieldRule};
use crate::db::{ensure_workspace, run_migrations};
use crate::{project, revisions, steps, sync, test_case};

const U: &str = "11111111-1111-4111-8111-111111111111";
const VECTORS: &str = include_str!("../tests/fixtures/custom-field-vectors.json");

fn device() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    run_migrations(&c).unwrap();
    sync::assume_stable_steps_server(&c);
    c
}

fn new_project(c: &Connection, name: &str) -> String {
    let input: project::ProjectInput =
        serde_json::from_value(json!({"name": name, "ownerId": U})).unwrap();
    project::insert_project(c, &input).unwrap()
}

fn field_input(
    project: &str,
    key: &str,
    field_type: &str,
    extra: Value,
) -> custom_fields::CustomFieldInput {
    let mut v = json!({
        "projectId": project, "fieldKey": key, "label": key, "fieldType": field_type, "userId": U
    });
    for (k, val) in extra.as_object().unwrap() {
        v[k] = val.clone();
    }
    serde_json::from_value(v).unwrap()
}

fn case_input(project: &str, extra: Value) -> test_case::TestCaseInput {
    let mut v = json!({
        "projectId": project, "title": "Pay", "author": "Ada", "data": {"steps": ["a"]}, "userId": U
    });
    for (k, val) in extra.as_object().unwrap() {
        v[k] = val.clone();
    }
    serde_json::from_value(v).unwrap()
}

fn data_of(c: &Connection, id: &str) -> Value {
    let s: String = c
        .query_row("SELECT data FROM test_cases WHERE id = ?1", [id], |r| {
            r.get(0)
        })
        .unwrap();
    serde_json::from_str(&s).unwrap()
}

fn columns_of(c: &Connection, id: &str) -> (Option<String>, Option<String>) {
    c.query_row(
        "SELECT case_type, automation_status FROM test_cases WHERE id = ?1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .unwrap()
}

fn count(c: &Connection, sql: &str) -> i64 {
    c.query_row(sql, [], |r| r.get(0)).unwrap()
}

// ------------------------------------------------------------------ vectors

fn rule_of(v: &Value) -> FieldRule {
    FieldRule {
        field_key: v["fieldKey"].as_str().unwrap().into(),
        field_type: v["fieldType"].as_str().unwrap().into(),
        options: serde_json::from_value::<Vec<FieldOption>>(v["options"].clone()).unwrap(),
        applies_to_case_types: serde_json::from_value(v["appliesToCaseTypes"].clone()).unwrap(),
        archived: v["archived"].as_bool().unwrap(),
    }
}

#[test]
fn the_validator_agrees_with_the_shared_vectors() {
    let vectors: Value = serde_json::from_str(VECTORS).unwrap();
    for id in vectors["ids"].as_array().unwrap() {
        assert_eq!(
            custom_fields::field_id(
                id["projectId"].as_str().unwrap(),
                id["entity"].as_str().unwrap(),
                id["fieldKey"].as_str().unwrap()
            ),
            id["id"].as_str().unwrap()
        );
    }
    for k in vectors["keys"].as_array().unwrap() {
        let key = k["key"].as_str().unwrap();
        assert_eq!(
            custom_fields::valid_key(key),
            k["valid"].as_bool().unwrap(),
            "{key}"
        );
    }
    for v in vectors["values"].as_array().unwrap() {
        let got =
            custom_fields::validate_value(&rule_of(&v["field"]), &v["value"], v.get("previous"));
        assert_eq!(got.err(), v["error"].as_str(), "{v}");
    }
    let rules: Vec<FieldRule> = vectors["caseFields"]
        .as_array()
        .unwrap()
        .iter()
        .map(rule_of)
        .collect();
    for case in vectors["cases"].as_array().unwrap() {
        let mut data = case["data"].clone();
        let got = custom_fields::validate_values(
            &rules,
            case["caseType"].as_str().unwrap(),
            &mut data,
            case.get("previous"),
        );
        let name = case["name"].as_str().unwrap();
        match case["error"].as_str() {
            Some(e) => assert_eq!(got, Err(e.to_string()), "{name}"),
            None => {
                assert_eq!(got, Ok(()), "{name}");
                assert_eq!(data, case["expected"], "{name}");
            }
        }
    }
}

// -------------------------------------------------------------- definitions

#[test]
fn a_definition_has_a_deterministic_id_and_its_key_and_type_never_change() {
    let c = device();
    let p = new_project(&c, "Checkout");
    let f = custom_fields::create_field(
        &c,
        field_input(
            &p,
            "browser",
            "select",
            json!({"options": [{"label": "Chrome"}, {"label": "Firefox"}]}),
        ),
    )
    .unwrap();
    assert_eq!(f.id, custom_fields::field_id(&p, "test_case", "browser"));
    assert_eq!(f.position, 0);
    assert!(f.options.iter().all(|o| o.id.len() == 8), "options get ids");
    assert_eq!(
        custom_fields::create_field(&c, field_input(&p, "browser", "text", json!({}))).err(),
        Some("custom_field.duplicate_key".into())
    );
    assert_eq!(
        custom_fields::create_field(&c, field_input(&p, "Bad Key", "text", json!({}))).err(),
        Some("custom_field.key".into())
    );
    assert_eq!(
        custom_fields::create_field(&c, field_input(&p, "x", "colour", json!({}))).err(),
        Some("custom_field.field_type".into())
    );
    assert_eq!(
        custom_fields::create_field(&c, field_input(&p, "sel", "select", json!({}))).err(),
        Some("custom_field.options".into()),
        "a select needs options"
    );
    // The type and the key are immutable.
    assert_eq!(
        custom_fields::update_field(&c, &f.id, field_input(&p, "browser", "text", json!({}))).err(),
        Some("custom_field.type_immutable".into())
    );
    assert_eq!(
        custom_fields::update_field(
            &c,
            &f.id,
            field_input(&p, "browser2", "select", json!({"options": f.options}))
        )
        .err(),
        Some("custom_field.key_immutable".into())
    );
    // An option left out stays, archived: values may point at it.
    let kept = vec![f.options[0].clone()];
    let g = custom_fields::update_field(
        &c,
        &f.id,
        field_input(
            &p,
            "browser",
            "select",
            json!({"options": kept, "label": "Navegador"}),
        ),
    )
    .unwrap();
    assert_eq!(g.label, "Navegador");
    assert_eq!(g.options.len(), 2);
    assert!(g.options[1].archived);
    assert_eq!(g.revision, 2);
    // A default value must fit the type.
    assert_eq!(
        custom_fields::create_field(
            &c,
            field_input(&p, "points", "integer", json!({"defaultValue": "3"}))
        )
        .err(),
        Some("custom_field.default.type".into())
    );
}

#[test]
fn archive_reorder_and_copy() {
    let c = device();
    let p = new_project(&c, "Checkout");
    let a = custom_fields::create_field(&c, field_input(&p, "a", "text", json!({}))).unwrap();
    let b = custom_fields::create_field(&c, field_input(&p, "b", "boolean", json!({}))).unwrap();
    let z = custom_fields::create_field(&c, field_input(&p, "z", "date", json!({}))).unwrap();
    let archived = custom_fields::set_archived(&c, &b.id, true, U).unwrap();
    assert!(archived.archived_at.is_some());
    assert!(custom_fields::set_archived(&c, &b.id, false, U)
        .unwrap()
        .archived_at
        .is_none());
    custom_fields::set_archived(&c, &b.id, true, U).unwrap();

    let order =
        custom_fields::reorder(&c, &p, "test_case", &[z.id.clone(), a.id.clone()], U).unwrap();
    let keys: Vec<_> = order.iter().map(|f| f.field_key.as_str()).collect();
    assert_eq!(keys, ["z", "a", "b"], "left-out fields go after, in order");

    let q = new_project(&c, "Other");
    custom_fields::create_field(&c, field_input(&q, "a", "integer", json!({}))).unwrap();
    let summary = custom_fields::copy_fields(&c, &p, &q, "test_case", U).unwrap();
    assert_eq!(
        serde_json::to_value(&summary).unwrap(),
        json!({"copied": 1, "skipped": ["a"]}),
        "z copied; a already there; archived b not copied"
    );
    let copied = custom_fields::list_fields(&c, &q, "test_case", U).unwrap();
    assert_eq!(copied[1].field_key, "z");
    assert_eq!(copied[1].id, custom_fields::field_id(&q, "test_case", "z"));
    // Someone else's project: nothing.
    assert!(
        custom_fields::list_fields(&c, &p, "test_case", "someone-else")
            .unwrap()
            .is_empty()
    );
}

// ---------------------------------------------------------------- case save

#[test]
fn a_case_save_checks_its_values_and_keeps_what_it_does_not_know() {
    let c = device();
    let p = new_project(&c, "Checkout");
    let browser = custom_fields::create_field(
        &c,
        field_input(
            &p,
            "browser",
            "select",
            json!({"options": [{"id": "OPT00001", "label": "Chrome"}]}),
        ),
    )
    .unwrap();
    custom_fields::create_field(
        &c,
        field_input(&p, "points", "integer", json!({"required": true})),
    )
    .unwrap();

    // A new case gets explicit defaults; `required` does not block a save
    // outside the editor.
    let id = test_case::insert_case(
        &c,
        &case_input(
            &p,
            json!({"data": {"custom": {"browser": "OPT00001", "elsewhere": 1}}}),
        ),
    )
    .unwrap();
    assert_eq!(
        columns_of(&c, &id),
        (Some("standard".into()), Some("manual".into()))
    );
    assert_eq!(
        data_of(&c, &id)["custom"],
        json!({"browser": "OPT00001", "elsewhere": 1})
    );

    // A wrong type is refused and changes nothing.
    let bad = test_case::update_case(
        &c,
        &id,
        &case_input(&p, json!({"data": {"custom": {"points": "x"}}})),
    );
    assert_eq!(bad, Err("custom_field.type:points".into()));
    assert_eq!(
        test_case::update_case(&c, &id, &case_input(&p, json!({"caseType": "exploratory"}))),
        Err("invalid case type: exploratory".into())
    );

    // An update that does not send the fields keeps them (import, AI).
    test_case::update_case(
        &c,
        &id,
        &case_input(&p, json!({"automationStatus": "automated"})),
    )
    .unwrap();
    test_case::update_case(&c, &id, &case_input(&p, json!({"title": "Pay v2"}))).unwrap();
    assert_eq!(
        columns_of(&c, &id),
        (Some("standard".into()), Some("automated".into()))
    );
    assert_eq!(data_of(&c, &id)["custom"]["browser"], "OPT00001");

    // `{}` clears; an archived field's value stays valid untouched.
    custom_fields::set_archived(&c, &browser.id, true, U).unwrap();
    test_case::update_case(
        &c,
        &id,
        &case_input(&p, json!({"data": {"custom": {"browser": "gone-option"}}})),
    )
    .unwrap();
    assert_eq!(
        data_of(&c, &id)["custom"],
        json!({"browser": "gone-option"})
    );
    test_case::update_case(&c, &id, &case_input(&p, json!({"data": {"custom": {}}}))).unwrap();
    assert!(data_of(&c, &id).get("custom").is_none());

    // The server's stash for read-only clients never survives a save.
    test_case::update_case(
        &c,
        &id,
        &case_input(
            &p,
            json!({"data": {"__caseFields": {"caseType": "checklist"}}}),
        ),
    )
    .unwrap();
    assert!(data_of(&c, &id).get(custom_fields::STASH_KEY).is_none());
}

#[test]
fn a_stored_case_type_this_build_does_not_know_never_blocks_a_save() {
    let c = device();
    let p = new_project(&c, "Checkout");
    let id = test_case::insert_case(&c, &case_input(&p, json!({}))).unwrap();
    // Pulled from a newer device.
    c.execute(
        "UPDATE test_cases SET case_type = 'exploratory', automation_status = 'flaky' WHERE id = ?1",
        [&id],
    )
    .unwrap();
    test_case::update_case(&c, &id, &case_input(&p, json!({"title": "Pay v2"}))).unwrap();
    assert_eq!(
        columns_of(&c, &id),
        (Some("exploratory".into()), Some("flaky".into())),
        "kept as it came"
    );
    // What the caller sends is still checked.
    assert!(
        test_case::update_case(&c, &id, &case_input(&p, json!({"caseType": "other"}))).is_err()
    );
}

// ---------------------------------------------------------------- revisions

fn revision_rows(c: &Connection, case_id: &str) -> Vec<(i64, String, String)> {
    c.prepare(
        "SELECT revision, id, content_sha256 FROM test_case_revisions
          WHERE test_case_id = ?1 AND content_sha256 IS NOT NULL ORDER BY revision, id",
    )
    .unwrap()
    .query_map([case_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
    .unwrap()
    .collect::<rusqlite::Result<_>>()
    .unwrap()
}

#[test]
fn a_case_that_never_set_its_type_hashes_as_before_and_new_values_are_in_the_hash() {
    let c = device();
    let p = new_project(&c, "Checkout");
    let ws = ensure_workspace(&c).unwrap();
    // A case written before 0026: NULL columns.
    c.execute(
        "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, author, data,
                created_by, updated_by, created_at, updated_at, revision)
         VALUES ('old', ?1, ?2, 'ATS_900', 'Pay', 'Ada', '{\"steps\":[{\"id\":\"A0000000\",\"text\":\"x\"}]}',
                ?3, ?3, 'now', 'now', 3)",
        params![ws, p, U],
    )
    .unwrap();
    let id = revisions::ensure_current(&c, "old", U, false)
        .unwrap()
        .unwrap();
    let content = steps::revision_content(
        "ATS_900",
        "Pay",
        "1.0",
        "draft",
        "medium",
        None,
        None,
        &json!({"steps": [{"id": "A0000000", "text": "x"}]}),
    );
    assert_eq!(
        id,
        steps::revision_id("old", 3, &steps::content_sha256(&content))
    );

    // Setting a value is a new state with the value in its content.
    test_case::update_case(&c, "old", &case_input(&p, json!({"caseType": "checklist"}))).unwrap();
    let rows = revision_rows(&c, "old");
    let latest = &rows.last().unwrap().1;
    let payload = revisions::payload(&c, latest).unwrap().unwrap();
    assert_eq!(payload["caseType"], "checklist");
    assert_eq!(
        payload["automationStatus"],
        Value::Null,
        "never set: stays null"
    );
}

#[test]
fn changing_definitions_never_touches_a_revision() {
    let c = device();
    let p = new_project(&c, "Checkout");
    let f = custom_fields::create_field(
        &c,
        field_input(
            &p,
            "browser",
            "select",
            json!({"options": [{"id": "OPT00001", "label": "Chrome"}]}),
        ),
    )
    .unwrap();
    let id = test_case::insert_case(
        &c,
        &case_input(&p, json!({"data": {"custom": {"browser": "OPT00001"}}})),
    )
    .unwrap();
    let before = revision_rows(&c, &id);
    let data_before = data_of(&c, &id);
    custom_fields::update_field(
        &c,
        &f.id,
        field_input(
            &p,
            "browser",
            "select",
            json!({"options": [{"id": "OPT00001", "label": "Chromium"}], "label": "Nav"}),
        ),
    )
    .unwrap();
    custom_fields::set_archived(&c, &f.id, true, U).unwrap();
    custom_fields::reorder(&c, &p, "test_case", std::slice::from_ref(&f.id), U).unwrap();
    assert_eq!(revision_rows(&c, &id), before);
    assert_eq!(
        data_of(&c, &id),
        data_before,
        "the value stays the option id"
    );
}

// --------------------------------------------------------------------- sync

fn as_doc(d: &Value) -> sync::RemoteDoc {
    serde_json::from_value(json!({
        "entity": d["entity"], "entityId": d["entityId"], "payload": d["payload"],
        "revision": d["revision"], "hlc": d["hlc"], "deleted": d["op"] == "delete",
    }))
    .unwrap()
}

/// The lww deltas `from` pushes (JSON), marked synced there.
fn push(from: &Connection) -> Vec<Value> {
    let pending = serde_json::to_value(sync::build_pending(from, U).unwrap()).unwrap();
    let pushed: Vec<sync::PushedDelta> = serde_json::from_value(pending["deltas"].clone()).unwrap();
    sync::mark_pushed(from, U, &pushed).unwrap();
    pending["deltas"].as_array().unwrap().clone()
}

/// Applies deltas as the server hands them back on a pull.
fn pull(into: &Connection, deltas: &[Value]) {
    let ws = ensure_workspace(into).unwrap();
    for d in deltas {
        sync::apply_doc(into, &ws, U, &as_doc(d)).unwrap();
    }
}

#[test]
fn definitions_and_case_fields_travel_between_devices() {
    let a = device();
    let p = new_project(&a, "Checkout");
    custom_fields::create_field(
        &a,
        field_input(
            &p,
            "browser",
            "select",
            json!({"options": [{"id": "OPT00001", "label": "Chrome"}]}),
        ),
    )
    .unwrap();
    let id = test_case::insert_case(
        &a,
        &case_input(
            &p,
            json!({"caseType": "checklist", "automationStatus": "to_automate",
                   "data": {"steps": ["a"], "custom": {"browser": "OPT00001"}}}),
        ),
    )
    .unwrap();
    let docs = push(&a);
    let entities: Vec<_> = docs.iter().map(|d| d["entity"].as_str().unwrap()).collect();
    assert_eq!(entities, ["project", "custom_field", "test_case"]);

    let b = device();
    pull(&b, &docs);
    let fields = custom_fields::list_fields(&b, &p, "test_case", U).unwrap();
    assert_eq!(fields.len(), 1);
    assert_eq!(fields[0].options[0].label, "Chrome");
    assert_eq!(
        columns_of(&b, &id),
        (Some("checklist".into()), Some("to_automate".into()))
    );
    assert_eq!(data_of(&b, &id)["custom"]["browser"], "OPT00001");
    // Both devices hold the same current revision.
    assert_eq!(
        revisions::current_id(&a, &id).unwrap(),
        revisions::current_id(&b, &id).unwrap()
    );

    // Deleting the project tombstones its fields too.
    project::delete_project(&a, &p, U).unwrap();
    assert_eq!(
        count(
            &a,
            "SELECT count(*) FROM custom_fields WHERE deleted_at IS NULL"
        ),
        0
    );
}

#[test]
fn a_server_without_custom_fields_gets_no_definition() {
    let c = Connection::open_in_memory().unwrap();
    run_migrations(&c).unwrap();
    sync::assume_server_features(&c, "key-conflicts,append-only,stable-steps");
    let p = new_project(&c, "Checkout");
    custom_fields::create_field(&c, field_input(&p, "browser", "text", json!({}))).unwrap();
    let id = test_case::insert_case(&c, &case_input(&p, json!({"caseType": "checklist"}))).unwrap();
    let pending = serde_json::to_value(sync::build_pending(&c, U).unwrap()).unwrap();
    let entities: Vec<_> = pending["deltas"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| d["entity"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(entities, ["project", "test_case"], "the field waits");
    assert_eq!(sync::held_back_fields(&c).unwrap(), 1);
    // The case itself goes: its payload carries the new keys, which an
    // older server stores as they come.
    assert_eq!(pending["deltas"][1]["payload"]["caseType"], "checklist");
    assert_eq!(pending["deltas"][1]["entityId"], id.as_str());
}

#[test]
fn a_pulled_case_without_the_fields_reads_as_never_set() {
    let a = device();
    let p = new_project(&a, "Checkout");
    let id = test_case::insert_case(&a, &case_input(&p, json!({"caseType": "checklist"}))).unwrap();
    let mut docs = push(&a);
    // The server stores what a current client sends; a web save of a client
    // without the fields would have kept them (server test). A document
    // without them is whole state: NULL here.
    for d in docs.iter_mut().filter(|d| d["entity"] == "test_case") {
        let obj = d["payload"].as_object_mut().unwrap();
        obj.remove("caseType");
        obj.remove("automationStatus");
    }
    let b = device();
    pull(&b, &docs);
    assert_eq!(columns_of(&b, &id), (None, None));
}

// ------------------------------------------------------------ migration 0027

#[test]
fn migration_0027_restores_the_stash_and_is_idempotent() {
    let c = device();
    let p = new_project(&c, "Checkout");
    let ws = ensure_workspace(&c).unwrap();
    c.execute(
        "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, author, data,
                created_by, updated_by, created_at, updated_at, revision)
         VALUES ('s1', ?1, ?2, 'ATS_901', 'Pay', 'Ada',
                 '{\"steps\":[],\"__caseFields\":{\"caseType\":\"checklist\",\"automationStatus\":null}}',
                 ?3, ?3, 'now', 'now', 2)",
        params![ws, p, U],
    )
    .unwrap();
    // As 0021 left it: a queued revision row for the content with the stash.
    let stale = revisions::ensure_current(&c, "s1", U, true)
        .unwrap()
        .unwrap();
    custom_fields::migrate_restore(&c).unwrap();
    assert_eq!(columns_of(&c, "s1"), (Some("checklist".into()), None));
    assert!(data_of(&c, "s1").get(custom_fields::STASH_KEY).is_none());
    let rows = revision_rows(&c, "s1");
    assert_eq!(rows.len(), 1, "the stale row went");
    assert_ne!(rows[0].1, stale);
    assert_eq!(
        count(
            &c,
            &format!("SELECT count(*) FROM oplog WHERE entity_id = '{stale}'")
        ),
        0
    );
    custom_fields::migrate_restore(&c).unwrap();
    assert_eq!(revision_rows(&c, "s1"), rows, "idempotent");
}
