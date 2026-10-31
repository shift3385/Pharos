//! Tests of AUD-01 across modules: `journal::record` (atomicity, the oplog rows
//! it keeps unchanged, one event per change), the hash chain, the triggers,
//! the `append_only` sync class on the desktop, the rule "a missing field keeps
//! the local value", the cursor reset, and the guard that every mutating Tauri
//! command is either audited or exempt with a reason.

use std::time::Instant;

use rusqlite::{params, Connection};
use serde_json::{json, Value};

use crate::audit::{self, ChainBreak};
use crate::db::{ensure_workspace, in_tx, run_migrations};
use crate::journal::{self, Action, Actor};
use crate::{key_sync, oplog, planner, project, purge, requirement, sync, template, test_case};

const U: &str = "11111111-1111-4111-8111-111111111111";
const V: &str = "22222222-2222-4222-8222-222222222222";

fn conn() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    run_migrations(&c).unwrap();
    c
}

fn new_project(c: &Connection, owner: &str) -> String {
    let input: project::ProjectInput =
        serde_json::from_value(json!({"name": "Checkout", "ownerId": owner})).unwrap();
    project::insert_project(c, &input).unwrap()
}

fn case_input(project: &str, user: &str, title: &str, data: Value) -> test_case::TestCaseInput {
    serde_json::from_value(json!({
        "projectId": project, "title": title, "author": "Ada", "priority": "high",
        "data": data, "userId": user
    }))
    .unwrap()
}

fn new_case(c: &Connection, project: &str, user: &str) -> String {
    test_case::insert_case(
        c,
        &case_input(project, user, "Pay", json!({"steps": ["a"]})),
    )
    .unwrap()
}

fn count(c: &Connection, sql: &str) -> i64 {
    c.query_row(sql, [], |r| r.get(0)).unwrap()
}

fn events(c: &Connection) -> i64 {
    count(c, "SELECT count(*) FROM audit_log")
}

/// (action, entity, entity_id) of every event, in chain order.
fn actions(c: &Connection) -> Vec<(String, String, String)> {
    let mut stmt = c
        .prepare("SELECT action, entity, entity_id FROM audit_log ORDER BY chain_owner, chain_seq")
        .unwrap();
    let rows = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .unwrap();
    rows.collect::<rusqlite::Result<_>>().unwrap()
}

fn last_changes(c: &Connection) -> Value {
    let text: String = c
        .query_row(
            "SELECT changes FROM audit_log ORDER BY rowid DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    serde_json::from_str(&text).unwrap()
}

fn chain_ok(c: &Connection, owner: &str) -> usize {
    let device = oplog::device_id(c).unwrap();
    let ws = ensure_workspace(c).unwrap();
    audit::verify_chain(c, &device, &ws, owner)
        .unwrap()
        .unwrap()
}

fn chain(c: &Connection, owner: &str) -> Result<usize, ChainBreak> {
    let device = oplog::device_id(c).unwrap();
    let ws = ensure_workspace(c).unwrap();
    audit::verify_chain(c, &device, &ws, owner).unwrap()
}

/// Lets a test tamper with rows the way only someone editing the file could.
fn drop_triggers(c: &Connection) {
    c.execute_batch("DROP TRIGGER audit_log_no_delete; DROP TRIGGER audit_log_only_redaction;")
        .unwrap();
}

// ---- JCS -----------------------------------------------------------------

#[test]
fn jcs_sorts_keys_and_escapes_like_rfc_8785() {
    let v =
        json!({"b": 1, "a": [true, null, "x\u{1}\n\"é/"], "c": {"z": -5, "y": "Ñandú"}, "A": 0});
    assert_eq!(
        audit::jcs(&v).unwrap(),
        r#"{"A":0,"a":[true,null,"x\u0001\n\"é/"],"b":1,"c":{"y":"Ñandú","z":-5}}"#
    );
    assert_eq!(
        audit::jcs(&json!(u64::MAX)).unwrap(),
        "18446744073709551615"
    );
}

#[test]
fn jcs_refuses_what_is_outside_the_audit_subset() {
    // A float or a non-ASCII key would need the full RFC 8785 rules; refusing
    // them keeps every implementation of the header hash identical.
    assert!(audit::jcs(&json!({"x": 1.5}))
        .unwrap_err()
        .contains("non-integer"));
    assert!(audit::jcs(&json!([0.0])).is_err());
    assert!(audit::jcs(&json!({"ñ": 1}))
        .unwrap_err()
        .contains("non-ASCII key"));
    assert!(audit::jcs(&json!({"ok": {"clé": 1}})).is_err());
}

// ---- journal::record -----------------------------------------------------

#[test]
fn each_mutation_keeps_its_oplog_row_and_adds_one_event() {
    let c = conn();
    let p = new_project(&c, U);
    let id = new_case(&c, &p, U);
    test_case::update_case(
        &c,
        &id,
        &case_input(&p, U, "Pay by card", json!({"steps": ["a"]})),
    )
    .unwrap();
    test_case::delete_case(&c, &id, U).unwrap();

    // The oplog rows are what oplog::record always wrote.
    let mut stmt = c
        .prepare(
            "SELECT op, payload, revision, author, user_id, hlc <> '' FROM oplog
              WHERE entity = 'test_case' AND entity_id = ?1 ORDER BY rowid",
        )
        .unwrap();
    let rows: Vec<(String, String, i64, String, String, bool)> = stmt
        .query_map([&id], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
            ))
        })
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap();
    let row = |op: &str, rev: i64| {
        (
            op.to_string(),
            "{}".to_string(),
            rev,
            U.to_string(),
            U.to_string(),
            true,
        )
    };
    assert_eq!(rows, [row("upsert", 1), row("upsert", 2), row("delete", 0)]);

    let case_events: Vec<String> = actions(&c)
        .into_iter()
        .filter(|(_, e, _)| e == "test_case")
        .map(|(a, ..)| a)
        .collect();
    assert_eq!(case_events, ["create", "update", "delete"]);
    // Each event is pushed through its own oplog row, outside the lww set.
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM oplog WHERE entity = 'audit_event'"
        ),
        events(&c)
    );
    assert_eq!(
        oplog::sync_state(&c, U).unwrap().pending,
        2,
        "project + case, as before"
    );
}

#[test]
fn an_update_records_the_field_diff_and_its_actor() {
    let c = conn();
    let p = new_project(&c, U);
    let id = new_case(&c, &p, U);
    test_case::update_case(
        &c,
        &id,
        &case_input(
            &p,
            U,
            "Pay by card",
            json!({"steps": ["a", "b"], "note": "n"}),
        ),
    )
    .unwrap();
    assert_eq!(
        last_changes(&c),
        json!({"title": ["Pay", "Pay by card"], "data.steps": [["a"], ["a", "b"]], "data.note": [null, "n"]})
    );
    let (actor, project_id, key, at): (String, String, String, String) = c
        .query_row(
            "SELECT actor, project_id, entity_key, at FROM audit_log ORDER BY rowid DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .unwrap();
    assert_eq!(
        (actor.as_str(), project_id.as_str(), key.as_str()),
        (format!("user:{U}").as_str(), p.as_str(), "ATS_001")
    );
    assert!(
        at.ends_with('Z') && at.contains('.'),
        "UTC ISO-8601 with ms: {at}"
    );
}

#[test]
fn an_update_that_changes_nothing_keeps_the_oplog_row_but_writes_no_event() {
    let c = conn();
    let p = new_project(&c, U);
    let id = new_case(&c, &p, U);
    let before = events(&c);
    let ops = count(&c, "SELECT count(*) FROM oplog WHERE entity = 'test_case'");
    test_case::update_case(&c, &id, &case_input(&p, U, "Pay", json!({"steps": ["a"]}))).unwrap();
    assert_eq!(events(&c), before);
    assert_eq!(
        count(&c, "SELECT count(*) FROM oplog WHERE entity = 'test_case'"),
        ops + 1
    );
}

#[test]
fn a_failed_write_leaves_no_change_no_oplog_row_and_no_event() {
    let c = conn();
    let p = new_project(&c, U);
    let id = new_case(&c, &p, U);
    let (ops, evs) = (count(&c, "SELECT count(*) FROM oplog"), events(&c));

    // The command fails after its write and journal (e.g. a later step).
    let res: Result<(), String> = in_tx(&c, |tx| {
        test_case::update_case(tx, &id, &case_input(&p, U, "Changed", json!({})))?;
        Err("boom".into())
    });
    assert!(res.is_err());
    // The audit insert itself fails: the entity write goes with it.
    c.execute_batch(
        "CREATE TEMP TRIGGER fail_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'disk full'); END;",
    )
    .unwrap();
    let res = in_tx(&c, |tx| {
        test_case::update_case(tx, &id, &case_input(&p, U, "Changed", json!({})))
    });
    assert!(res.unwrap_err().contains("disk full"));
    c.execute_batch("DROP TRIGGER fail_audit").unwrap();

    let title: String = c
        .query_row("SELECT title FROM test_cases WHERE id = ?1", [&id], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(title, "Pay");
    assert_eq!(
        (count(&c, "SELECT count(*) FROM oplog"), events(&c)),
        (ops, evs)
    );
    assert_eq!(chain_ok(&c, U) as i64, evs);
}

#[test]
fn two_mutations_with_a_failed_one_between_keep_a_contiguous_chain() {
    let c = conn();
    let p = in_tx(&c, |tx| Ok(new_project(tx, U))).unwrap();
    let id = in_tx(&c, |tx| Ok(new_case(tx, &p, U))).unwrap();
    let failed: Result<(), String> = in_tx(&c, |tx| {
        test_case::update_case(tx, &id, &case_input(&p, U, "Lost", json!({})))?;
        Err("validation failed".into())
    });
    assert!(failed.is_err());
    in_tx(&c, |tx| {
        test_case::update_case(tx, &id, &case_input(&p, U, "Kept", json!({})))
    })
    .unwrap();
    let seqs: Vec<i64> = {
        let mut stmt = c
            .prepare("SELECT chain_seq FROM audit_log ORDER BY chain_seq")
            .unwrap();
        let rows = stmt.query_map([], |r| r.get(0)).unwrap();
        rows.collect::<rusqlite::Result<_>>().unwrap()
    };
    assert_eq!(seqs, [1, 2, 3]);
    assert_eq!(chain_ok(&c, U), 3);
    assert_eq!(last_changes(&c)["title"], json!(["Pay", "Kept"]));
}

#[test]
fn a_project_delete_is_one_event_with_its_cascade() {
    let c = conn();
    let p = new_project(&c, U);
    new_case(&c, &p, U);
    new_case(&c, &p, U);
    let before = events(&c);
    project::delete_project(&c, &p, U).unwrap();
    assert_eq!(events(&c), before + 1);
    let summary: String = c
        .query_row(
            "SELECT summary FROM audit_log ORDER BY rowid DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let summary: Value = serde_json::from_str(&summary).unwrap();
    assert_eq!(summary["cascade"]["test_cases"], 2);
    assert_eq!(last_changes(&c)["name"], json!(["Checkout", null]));
}

#[test]
fn a_csv_import_is_one_event_with_counts() {
    let c = conn();
    let p = new_project(&c, U);
    let rows: Vec<requirement::RequirementImportRow> =
        serde_json::from_value(json!([{"title": "A"}, {"title": "B"}, {"title": "C"}])).unwrap();
    let before = events(&c);
    requirement::import_requirements(&c, &p, U, &rows).unwrap();
    assert_eq!(events(&c), before + 1);
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM oplog WHERE entity = 'requirement'"
        ),
        3,
        "each row still syncs"
    );
    let (action, entity, summary): (String, String, String) = c
        .query_row(
            "SELECT action, entity, summary FROM audit_log ORDER BY rowid DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!((action.as_str(), entity.as_str()), ("import", "project"));
    let summary: Value = serde_json::from_str(&summary).unwrap();
    assert_eq!(
        (summary["created"].as_i64(), summary["rows"].as_i64()),
        (Some(3), Some(3))
    );
}

#[test]
fn a_template_file_is_recorded_by_its_hash_never_its_bytes() {
    let c = conn();
    let input: template::TemplateInput = serde_json::from_value(json!({
        "kind": "case", "language": "es", "name": "Mine", "dataBase64": "U0VDUkVULUZJTEU="
    }))
    .unwrap();
    template::insert_template(&c, &input, U).unwrap();
    let changes = last_changes(&c);
    assert_eq!(changes["fileSha256"][1], audit::sha256_hex(b"SECRET-FILE"));
    let text: String = c
        .query_row(
            "SELECT changes FROM audit_log ORDER BY rowid DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(!text.contains("SECRET") && !text.contains("U0VDUkVU"));
}

#[test]
fn attachments_are_audited_without_bytes_or_an_entity_oplog_row() {
    let c = conn();
    let p = new_project(&c, U);
    let card: planner::PlannerCardInput = serde_json::from_value(
        json!({"projectId": p, "ownerId": U, "kind": "defect", "title": "Bug"}),
    )
    .unwrap();
    let card = planner::insert_card(&c, &card).unwrap();
    let ops = count(
        &c,
        "SELECT count(*) FROM oplog WHERE entity = 'planner_card'",
    );
    planner::add_attachment(
        &c,
        "a1",
        &card,
        U,
        "log.txt",
        Some("text/plain"),
        b"secret log",
    )
    .unwrap();
    assert_eq!(last_changes(&c)["attachment"][1]["size"], 10);
    planner::delete_attachment(&c, "a1", U).unwrap();
    assert_eq!(last_changes(&c)["attachment"][0]["name"], "log.txt");
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM oplog WHERE entity = 'planner_card'"
        ),
        ops
    );
    let tail: Vec<String> = actions(&c).into_iter().rev().take(2).map(|a| a.0).collect();
    assert_eq!(tail, ["unlink", "link"]);
}

// ---- owners and chains ---------------------------------------------------

#[test]
fn owners_are_fixed_when_written_and_system_events_without_a_project_stay_local() {
    let c = conn();
    let p = new_project(&c, U);
    // A system event on a project: its owner.
    journal::record_event(
        &c,
        Actor::System {
            component: "keys",
            on_behalf_of: None,
        },
        Action::Update,
        "project",
        &p,
        serde_json::Map::new(),
        None,
    )
    .unwrap();
    let owner: String = c
        .query_row(
            "SELECT user_id FROM audit_log ORDER BY rowid DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(owner, U);
    // Without a project: '' and no oplog row, so it is never pushed.
    let pushed = count(
        &c,
        "SELECT count(*) FROM oplog WHERE entity = 'audit_event'",
    );
    journal::record_event(
        &c,
        Actor::System {
            component: "migration",
            on_behalf_of: None,
        },
        Action::Update,
        "template",
        "builtin-plan",
        serde_json::Map::new(),
        None,
    )
    .unwrap();
    let owner: String = c
        .query_row(
            "SELECT user_id FROM audit_log ORDER BY rowid DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(owner, "");
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM oplog WHERE entity = 'audit_event'"
        ),
        pushed
    );
    assert_eq!(chain_ok(&c, ""), 1);
}

#[test]
fn two_accounts_on_one_device_have_separate_complete_chains() {
    let c = conn();
    let pu = new_project(&c, U);
    let pv = new_project(&c, V);
    new_case(&c, &pu, U);
    new_case(&c, &pv, V);
    new_case(&c, &pu, U);
    assert_eq!(chain_ok(&c, U), 3);
    assert_eq!(chain_ok(&c, V), 2);
    // Each account pushes only its own, and they link among themselves.
    let pending =
        |user: &str| serde_json::to_value(sync::build_pending_append(&c, user).unwrap()).unwrap();
    let u = pending(U);
    let deltas = u["deltas"].as_array().unwrap();
    assert_eq!(deltas.len(), 3);
    assert!(deltas.iter().all(|d| d["payload"]["chainOwner"] == U));
    assert_eq!(pending(V)["deltas"].as_array().unwrap().len(), 2);
}

#[test]
fn verify_finds_edited_content_edited_fields_removed_and_reordered_rows() {
    let setup = || {
        let c = conn();
        let p = new_project(&c, U);
        for _ in 0..3 {
            new_case(&c, &p, U);
        }
        drop_triggers(&c);
        c
    };
    let c = setup();
    assert_eq!(chain(&c, U), Ok(4));
    c.execute(
        "UPDATE audit_log SET changes = '{}' WHERE chain_seq = 2",
        [],
    )
    .unwrap();
    assert_eq!(chain(&c, U), Err(ChainBreak::Changes { seq: 2 }));

    let c = setup();
    c.execute(
        "UPDATE audit_log SET actor = 'user:mallory' WHERE chain_seq = 3",
        [],
    )
    .unwrap();
    assert_eq!(chain(&c, U), Err(ChainBreak::Hash { seq: 3 }));

    let c = setup();
    c.execute("DELETE FROM audit_log WHERE chain_seq = 2", [])
        .unwrap();
    assert_eq!(
        chain(&c, U),
        Err(ChainBreak::Gap {
            expected: 2,
            found: 3
        })
    );

    let c = setup();
    c.execute_batch(
        "UPDATE audit_log SET chain_seq = -1 WHERE chain_seq = 2;
         UPDATE audit_log SET chain_seq = 2 WHERE chain_seq = 3;
         UPDATE audit_log SET chain_seq = 3 WHERE chain_seq = -1;",
    )
    .unwrap();
    assert_eq!(chain(&c, U), Err(ChainBreak::Link { seq: 2 }));
}

#[test]
fn the_triggers_allow_exactly_a_redaction() {
    let c = conn();
    let p = new_project(&c, U);
    new_case(&c, &p, U);
    let fails = |sql: &str| {
        let err = c.execute(sql, []).unwrap_err().to_string();
        assert!(err.contains("append-only"), "{sql}: {err}");
    };
    fails("DELETE FROM audit_log WHERE chain_seq = 1");
    fails("UPDATE audit_log SET actor = 'user:x' WHERE chain_seq = 1");
    fails("UPDATE audit_log SET changes = '{}' WHERE chain_seq = 1");
    fails("UPDATE audit_log SET workspace_id = 'w2' WHERE chain_seq = 1");
    fails("UPDATE audit_log SET changes = NULL WHERE chain_seq = 1");
    fails("UPDATE audit_log SET changes = NULL, redacted_at = 'now', summary = 'x' WHERE chain_seq = 1");
    // The redaction: content gone, its hash and the chain kept.
    c.execute(
        "UPDATE audit_log SET changes = NULL, redacted_at = 'now' WHERE chain_seq = 1",
        [],
    )
    .unwrap();
    assert_eq!(chain_ok(&c, U), 2);
    // Once.
    fails("UPDATE audit_log SET redacted_at = 'later' WHERE chain_seq = 1");
}

#[test]
fn the_purge_never_touches_the_audit_log() {
    let c = conn();
    let p = new_project(&c, U);
    let id = new_case(&c, &p, U);
    test_case::delete_case(&c, &id, U).unwrap();
    c.execute(
        "UPDATE test_cases SET deleted_at = '2000-01-01 00:00:00'",
        [],
    )
    .unwrap();
    let (evs, pushed) = (
        events(&c),
        count(
            &c,
            "SELECT count(*) FROM oplog WHERE entity = 'audit_event'",
        ),
    );
    let summary = purge::purge(&c, U, 30).unwrap();
    assert_eq!(
        count(&c, "SELECT count(*) FROM test_cases"),
        0,
        "{summary:?}"
    );
    assert_eq!(events(&c), evs);
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM oplog WHERE entity = 'audit_event'"
        ),
        pushed
    );
    assert_eq!(chain_ok(&c, U) as i64, evs);
}

#[test]
fn reordering_200_cards_stays_fast() {
    let c = conn();
    let p = new_project(&c, U);
    let ids: Vec<String> = (0..200)
        .map(|i| {
            let input: planner::PlannerCardInput = serde_json::from_value(
                json!({"projectId": p, "ownerId": U, "kind": "task", "title": format!("Card {i}")}),
            )
            .unwrap();
            planner::insert_card(&c, &input).unwrap()
        })
        .collect();
    let before = events(&c);
    let started = Instant::now();
    in_tx(&c, |tx| planner::reorder(tx, U, "in_progress", &ids)).unwrap();
    let took = started.elapsed();
    eprintln!("reorder of 200 cards (200 events + 400 oplog rows): {took:?}");
    assert_eq!(events(&c), before + 200);
    assert_eq!(
        last_changes(&c),
        json!({"status": ["backlog", "in_progress"]})
    );
    assert!(took.as_secs() < 5, "{took:?}");
    assert_eq!(chain_ok(&c, U) as i64, events(&c));
}

// ---- sync: append_only ---------------------------------------------------

/// The `audit_event` documents a device would push for `user`.
fn pushed_events(c: &Connection, user: &str) -> Vec<Value> {
    let pending = serde_json::to_value(sync::build_pending_append(c, user).unwrap()).unwrap();
    pending["deltas"].as_array().unwrap().clone()
}

fn as_doc(delta: &Value) -> sync::RemoteDoc {
    serde_json::from_value(json!({
        "entity": delta["entity"], "entityId": delta["entityId"], "payload": delta["payload"],
        "revision": 1, "hlc": delta["hlc"],
    }))
    .unwrap()
}

#[test]
fn audit_events_push_as_append_only_and_stay_out_of_the_lww_push() {
    let c = conn();
    let p = new_project(&c, U);
    new_case(&c, &p, U);
    let deltas = pushed_events(&c, U);
    assert_eq!(deltas.len(), 2);
    for d in &deltas {
        assert_eq!(
            (
                d["entity"].as_str(),
                d["op"].as_str(),
                d["revision"].as_i64()
            ),
            (Some("audit_event"), Some("append"), Some(1))
        );
        assert!(d["baseRevision"].is_null());
        assert!(
            d["payload"]["changes"].is_string(),
            "the stored text travels as is"
        );
    }
    let lww = serde_json::to_value(sync::build_pending(&c, U).unwrap()).unwrap();
    assert!(lww["deltas"]
        .as_array()
        .unwrap()
        .iter()
        .all(|d| d["entity"] != "audit_event"));

    // Accepted: marked synced, no base (nothing to rebase), gone from pending.
    let pushed: Vec<sync::PushedDelta> =
        serde_json::from_value(Value::Array(deltas.clone())).unwrap();
    sync::mark_pushed(&c, U, &pushed).unwrap();
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM sync_base WHERE entity = 'audit_event'"
        ),
        0
    );
    assert!(pushed_events(&c, U).is_empty());
    assert_eq!(audit::pending_count(&c).unwrap(), 0);

    // The echo of our own push on the next pull changes nothing.
    let ws = ensure_workspace(&c).unwrap();
    let before = events(&c);
    for d in &deltas {
        sync::apply_doc(&c, &ws, U, &as_doc(d)).unwrap();
    }
    assert_eq!(events(&c), before);
}

#[test]
fn a_pulled_event_is_inserted_once_never_changed_and_never_echoed() {
    let a = conn();
    let p = new_project(&a, U);
    new_case(&a, &p, U);
    let deltas = pushed_events(&a, U);

    let b = conn();
    let ws = ensure_workspace(&b).unwrap();
    for d in &deltas {
        sync::apply_doc(&b, &ws, U, &as_doc(d)).unwrap();
    }
    assert_eq!(events(&b), 2);
    // The other device's chain verifies here, as it was written there.
    let device_a = oplog::device_id(&a).unwrap();
    let ws_a = ensure_workspace(&a).unwrap();
    assert_eq!(audit::verify_chain(&b, &device_a, &ws_a, U).unwrap(), Ok(2));
    // Again: no duplicate. With other content under the same id: kept as it was.
    let mut tampered = deltas[0].clone();
    tampered["payload"]["changes"] = json!("{\"title\":[\"x\",\"y\"]}");
    for d in [&deltas[0], &tampered] {
        sync::apply_doc(&b, &ws, U, &as_doc(d)).unwrap();
    }
    assert_eq!(events(&b), 2);
    assert_eq!(audit::verify_chain(&b, &device_a, &ws_a, U).unwrap(), Ok(2));
    // A tombstone of one changes nothing; a document missing fields is skipped.
    let gone: sync::RemoteDoc = serde_json::from_value(json!({
        "entity": "audit_event", "entityId": deltas[1]["entityId"], "revision": 1, "deleted": true,
        "payload": {}
    }))
    .unwrap();
    sync::apply_doc(&b, &ws, U, &gone).unwrap();
    let broken: sync::RemoteDoc = serde_json::from_value(
        json!({"entity": "audit_event", "entityId": "x", "revision": 1, "payload": {"id": "x"}}),
    )
    .unwrap();
    sync::apply_doc(&b, &ws, U, &broken).unwrap();
    assert_eq!(events(&b), 2);
    // No local event, oplog row or conflict for anything pulled.
    assert_eq!(count(&b, "SELECT count(*) FROM oplog"), 0);
    assert_eq!(count(&b, "SELECT count(*) FROM sync_conflicts"), 0);
    let owner: String = b
        .query_row("SELECT DISTINCT user_id FROM audit_log", [], |r| r.get(0))
        .unwrap();
    assert_eq!(owner, U);
}

// ---- sync: a pulled document is the sender's whole state (review B1) --------

/// Pushes everything pending of `user` on `c` (as accepted) and returns the
/// documents a server with `complete-payload` would store for them.
fn push_all(c: &Connection, user: &str) -> Vec<sync::RemoteDoc> {
    let pending = serde_json::to_value(sync::build_pending(c, user).unwrap()).unwrap();
    let pushed: Vec<sync::PushedDelta> = serde_json::from_value(pending["deltas"].clone()).unwrap();
    sync::mark_pushed(c, user, &pushed).unwrap();
    pending["deltas"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| {
            serde_json::from_value(json!({
                "entity": d["entity"], "entityId": d["entityId"], "payload": d["payload"],
                "revision": d["revision"], "hlc": d["hlc"], "deleted": d["op"] == "delete",
            }))
            .unwrap()
        })
        .collect()
}

#[test]
fn a_key_cleared_on_one_device_is_cleared_on_the_other() {
    let a = conn();
    let p = new_project(&a, U);
    let id = test_case::insert_case(
        &a,
        &case_input(
            &p,
            U,
            "Pay",
            json!({"steps": ["a"], "caseDate": "2026-10-01", "flows": [1]}),
        ),
    )
    .unwrap();
    let first = push_all(&a, U);

    // Device B gets the case as it was.
    let b = conn();
    let ws_b = ensure_workspace(&b).unwrap();
    for d in &first {
        sync::apply_doc(&b, &ws_b, U, d).unwrap();
    }
    let data_of = |c: &Connection| -> Value {
        let s: String = c
            .query_row("SELECT data FROM test_cases WHERE id = ?1", [&id], |r| {
                r.get(0)
            })
            .unwrap();
        serde_json::from_str(&s).unwrap()
    };
    assert_eq!(data_of(&b)["caseDate"], "2026-10-01");

    // A clears the date and goes back to basic: the keys are left out.
    test_case::update_case(&a, &id, &case_input(&p, U, "Pay", json!({"steps": ["a"]}))).unwrap();
    let second = push_all(&a, U);
    assert_eq!(second.len(), 1);
    for d in &second {
        sync::apply_doc(&b, &ws_b, U, d).unwrap();
    }
    assert_eq!(data_of(&b), json!({"steps": ["a"]}));
    assert_eq!(data_of(&a), json!({"steps": ["a"]}));
    // And B's next push sends nothing back: it has no pending change.
    assert!(
        serde_json::to_value(sync::build_pending(&b, U).unwrap()).unwrap()["deltas"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}

#[test]
fn taking_the_server_version_in_the_conflict_panel_clears_what_it_lacks() {
    let (c, ws, conflict) = conflicted();
    sync::resolve_conflict(&c, &ws, U, &conflict, "remote").unwrap();
    let (title, priority): (String, String) = c
        .query_row("SELECT title, priority FROM test_cases", [], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .unwrap();
    // The remote version has no priority: it is the server's whole state.
    assert_eq!((title.as_str(), priority.as_str()), ("Remote", ""));
}

#[test]
fn a_local_tombstone_is_not_merged_into() {
    let c = conn();
    let p = new_project(&c, U);
    let id = new_case(&c, &p, U);
    test_case::delete_case(&c, &id, U).unwrap();
    c.execute("UPDATE oplog SET synced_at = 'now'", []).unwrap();
    let ws = ensure_workspace(&c).unwrap();
    let doc: sync::RemoteDoc = serde_json::from_value(json!({
        "entity": "test_case", "entityId": id, "revision": 9, "hlc": "000009999999999-00000-other",
        "payload": {"projectId": p, "scenarioId": "ATS_001", "title": "Back"}
    }))
    .unwrap();
    sync::apply_doc(&c, &ws, U, &doc).unwrap();
    let (priority, data, deleted): (String, String, Option<String>) = c
        .query_row(
            "SELECT priority, data, deleted_at FROM test_cases WHERE id = ?1",
            [&id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(
        (priority.as_str(), data.as_str(), deleted),
        ("", "{}", None)
    );
}

// ---- sync: cursor reset ----------------------------------------------------

#[test]
fn the_cursor_restarts_once_when_the_applied_set_grows() {
    let c = conn();
    // Written by a build before AUD-01: a cursor, no set version.
    c.execute(
        "INSERT INTO sync_state (key, value) VALUES (?1, '42')",
        params![format!("cursor:{U}")],
    )
    .unwrap();
    assert_eq!(sync::cursor_get(&c, U).unwrap(), "0");
    // The first page of the re-pull stores the cursor and the set: no second reset.
    sync::cursor_set(&c, U, "7").unwrap();
    assert_eq!(sync::cursor_get(&c, U).unwrap(), "7");
    sync::cursor_set(&c, U, "50").unwrap();
    assert_eq!(sync::cursor_get(&c, U).unwrap(), "50");
    // Another account keeps its own.
    assert_eq!(sync::cursor_get(&c, V).unwrap(), "0");
    // A cursor reached under an older set restarts again.
    c.execute(
        "UPDATE sync_state SET value = '0' WHERE key = ?1",
        params![format!("cursor_set:{U}")],
    )
    .unwrap();
    assert_eq!(sync::cursor_get(&c, U).unwrap(), "0");
}

#[test]
fn a_device_upgraded_past_its_cursor_gets_the_documents_it_skipped() {
    // The old build moved its cursor to 3 past an audit_event it did not apply.
    let a = conn();
    let p = new_project(&a, U);
    new_case(&a, &p, U);
    let docs: Vec<sync::RemoteDoc> = pushed_events(&a, U).iter().map(as_doc).collect();
    let b = conn();
    b.execute(
        "INSERT INTO sync_state (key, value) VALUES (?1, '3')",
        params![format!("cursor:{U}")],
    )
    .unwrap();
    // After the upgrade the pull starts at 0, so the page with them comes again.
    assert_eq!(sync::cursor_get(&b, U).unwrap(), "0");
    let ws = ensure_workspace(&b).unwrap();
    for d in &docs {
        sync::apply_doc(&b, &ws, U, d).unwrap();
    }
    sync::cursor_set(&b, U, "3").unwrap();
    assert_eq!(events(&b), 2);
    assert_eq!(sync::cursor_get(&b, U).unwrap(), "3");
}

// ---- conflicts and keys ------------------------------------------------------

/// A case with a local pending edit and a diverging remote version.
fn conflicted() -> (Connection, String, String) {
    let c = conn();
    let p = new_project(&c, U);
    let id = new_case(&c, &p, U);
    let pushed: Vec<sync::PushedDelta> = serde_json::from_value(
        serde_json::to_value(sync::build_pending(&c, U).unwrap()).unwrap()["deltas"].clone(),
    )
    .unwrap();
    sync::mark_pushed(&c, U, &pushed).unwrap();
    test_case::update_case(
        &c,
        &id,
        &case_input(&p, U, "Local", json!({"steps": ["a"]})),
    )
    .unwrap();
    let ws = ensure_workspace(&c).unwrap();
    let remote: sync::RemoteDoc = serde_json::from_value(json!({
        "entity": "test_case", "entityId": id, "revision": 4, "hlc": "000009999999999-00000-other",
        "payload": {"projectId": p, "scenarioId": "ATS_001", "title": "Remote", "data": {"steps": ["a"]}}
    }))
    .unwrap();
    sync::apply_doc(&c, &ws, U, &remote).unwrap();
    let conflict: String = c
        .query_row("SELECT id FROM sync_conflicts", [], |r| r.get(0))
        .unwrap();
    (c, ws, conflict)
}

#[test]
fn resolving_a_conflict_either_way_is_audited() {
    for resolution in ["local", "remote"] {
        let (c, ws, conflict) = conflicted();
        let before = events(&c);
        sync::resolve_conflict(&c, &ws, U, &conflict, resolution).unwrap();
        assert_eq!(events(&c), before + 1, "{resolution}");
        let (action, summary): (String, String) = c
            .query_row(
                "SELECT action, summary FROM audit_log ORDER BY rowid DESC LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(action, "resolve_conflict");
        assert!(summary.contains(resolution));
        if resolution == "remote" {
            assert_eq!(last_changes(&c)["title"], json!(["Local", "Remote"]));
        }
    }
}

#[test]
fn a_key_assigned_by_the_system_names_the_account_it_acted_for() {
    let c = conn();
    let p = new_project(&c, U);
    c.execute(
        "INSERT INTO sync_base (user_id, entity, entity_id, revision, hlc) VALUES (?1, 'project', ?2, 1, '')",
        params![U, p],
    )
    .unwrap();
    let id = new_case(&c, &p, U);
    let provisional: String = c
        .query_row(
            "SELECT scenario_id FROM test_cases WHERE id = ?1",
            [&id],
            |r| r.get(0),
        )
        .unwrap();
    assert!(provisional.contains('?'), "{provisional}");
    let blocks: Vec<key_sync::KeyBlock> =
        serde_json::from_value(json!([{"projectId": p, "kind": "case", "start": 1, "end": 50}]))
            .unwrap();
    key_sync::apply_blocks(&c, U, &blocks).unwrap();
    assert_eq!(key_sync::finalize(&c, U).unwrap(), 1);
    let (actor, behalf, owner): (String, String, String) = c
        .query_row(
            "SELECT actor, on_behalf_of, user_id FROM audit_log ORDER BY rowid DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(
        (actor.as_str(), behalf, owner.as_str()),
        ("system:keys", format!("user:{U}"), U)
    );
    assert_eq!(
        last_changes(&c)["scenarioId"],
        json!([provisional, "ATS_001"])
    );
}

// ---- guard (ADR-0015) --------------------------------------------------------

/// Commands that change data and must leave an audit event: each is exercised
/// below through the repository function it calls, inside `in_tx` like the
/// command (so none of them may open its own transaction).
const AUDITED: &[&str] = &[
    "project::project_create",
    "project::project_update",
    "project::project_delete",
    "test_plan::test_plan_create",
    "test_plan::test_plan_update",
    "test_plan::test_plan_delete",
    "test_case::test_case_create",
    "test_case::test_case_update",
    "test_case::test_case_delete",
    "requirement::requirement_create",
    "requirement::requirement_update",
    "requirement::requirement_delete",
    "requirement::requirement_import",
    "planner::planner_create",
    "planner::planner_update",
    "planner::planner_delete",
    "planner::planner_reorder",
    "planner::planner_attachment_add",
    "planner::planner_attachment_delete",
    "template::template_create",
    "template::template_update",
    "template::template_delete",
    "sync::sync_conflict_resolve",
    "key_sync::key_conflict_resolve",
    "key_sync::key_blocks_apply",
];

/// Commands that leave no event, and why.
const EXEMPT: &[(&str, &str)] = &[
    (
        "session_save",
        "the session token lives in the keychain, not in the data",
    ),
    ("session_load", "read"),
    (
        "session_clear",
        "the session token lives in the keychain, not in the data",
    ),
    ("db::db_open_error", "read"),
    ("db::db_recover", "re-keys the file; no record changes"),
    ("db::recovery_key_export", "read"),
    ("profile::profile_get", "read"),
    (
        "profile::profile_upsert",
        "the device profile does not sync; accounts are audited on the server (0.3.0)",
    ),
    (
        "template::template_seed",
        "built-in templates ship with the app",
    ),
    ("ai::ai_key_set", "a setting in the keychain"),
    ("ai::ai_key_status", "read"),
    ("ai::ai_key_clear", "a setting in the keychain"),
    (
        "ai::ai_chat_online",
        "no data change; what the AI drafts is saved by the person (IA-01)",
    ),
    ("ai::ai_list_models", "read"),
    ("oplog::oplog_pending_count", "read"),
    (
        "sync::oplog_pending",
        "read (stamps an HLC on pre-0011 rows only)",
    ),
    ("sync::oplog_mark_synced", "sync bookkeeping"),
    (
        "sync::oplog_mark_rejected",
        "sync bookkeeping (refused audit events)",
    ),
    (
        "sync::apply_remote",
        "a pull: remote events arrive by sync (ADR-0015)",
    ),
    ("sync::sync_cursor_get", "read"),
    ("sync::sync_cursor_set", "sync bookkeeping"),
    ("sync::sync_conflicts_list", "read"),
    (
        "purge::purge_deleted",
        "removes rows already deleted and audited; SYNC-06 adds `redact`",
    ),
    ("key_sync::key_lease_requests", "read"),
    (
        "key_sync::key_conflicts_record",
        "a server refusal; the user's resolution is audited",
    ),
    ("key_sync::key_conflicts_list", "read"),
    ("diag::diag_log", "logs"),
    ("diag::diag_export", "read"),
    ("downloads::download_dir_get", "read"),
    ("downloads::download_dir_pick", "a setting"),
    ("downloads::download_dir_reset", "a setting"),
    ("downloads::download_save", "writes a file the user exports"),
];

fn registered_commands() -> Vec<String> {
    let lib = include_str!("lib.rs");
    let start = lib.find("generate_handler![").unwrap() + "generate_handler![".len();
    let end = start + lib[start..].find(']').unwrap();
    lib[start..end]
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

#[test]
fn every_registered_command_is_audited_or_exempt_with_a_reason() {
    let commands = registered_commands();
    assert!(commands.len() > 60, "parsed {commands:?}");
    // Reads by name: they change nothing.
    let read = |cmd: &str| {
        [
            "_list",
            "_get",
            "_revisions",
            "_revision_get",
            "_by_project",
        ]
        .iter()
        .any(|s| cmd.ends_with(s))
    };
    for cmd in &commands {
        let audited = AUDITED.contains(&cmd.as_str());
        let exempt = read(cmd) || EXEMPT.iter().any(|(c, why)| c == cmd && !why.is_empty());
        assert!(
            audited ^ exempt,
            "{cmd} must be in exactly one of AUDITED or EXEMPT"
        );
    }
    for cmd in AUDITED.iter().chain(EXEMPT.iter().map(|(c, _)| c)) {
        assert!(
            commands.iter().any(|c| c == cmd),
            "{cmd} is not a registered command"
        );
    }
}

#[test]
fn only_the_journal_writes_the_oplog() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    for entry in std::fs::read_dir(&dir).unwrap() {
        let path = entry.unwrap().path();
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        if !name.ends_with(".rs")
            || [
                "journal.rs",
                "oplog.rs",
                "audit_tests.rs",
                "upgrade_tests.rs",
            ]
            .contains(&name.as_str())
        {
            continue;
        }
        let text = std::fs::read_to_string(&path).unwrap();
        // Everything before the test module, whatever the line endings.
        let production = text.split("mod tests {").next().unwrap();
        let raw_insert = production
            .to_ascii_uppercase()
            .contains("INSERT INTO OPLOG");
        assert!(
            !production.contains("oplog::record(") && !raw_insert,
            "{name} writes the oplog directly; go through journal::record"
        );
    }
}

#[test]
fn every_audited_command_leaves_an_event() {
    let c = conn();
    let p = new_project(&c, U);
    let case = new_case(&c, &p, U);
    let plan_input = |title: &str| -> crate::test_plan::TestPlanInput {
        serde_json::from_value(
            json!({"projectId": p, "title": title, "author": "Ada", "userId": U}),
        )
        .unwrap()
    };
    let req_input = |title: &str| -> requirement::RequirementInput {
        serde_json::from_value(json!({"projectId": p, "title": title, "userId": U})).unwrap()
    };
    let card_input = |title: &str| -> planner::PlannerCardInput {
        serde_json::from_value(
            json!({"projectId": p, "ownerId": U, "kind": "task", "title": title}),
        )
        .unwrap()
    };
    let tpl: template::TemplateInput = serde_json::from_value(
        json!({"kind": "case", "language": "es", "name": "T", "dataBase64": "eA=="}),
    )
    .unwrap();
    let meta: template::TemplateMeta = serde_json::from_value(json!({"name": "T2"})).unwrap();

    let mut covered = Vec::new();
    let mut step = |cmd: &str, f: &mut dyn FnMut(&Connection) -> Result<(), String>| {
        let before = events(&c);
        in_tx(&c, |tx| f(tx)).unwrap_or_else(|e| panic!("{cmd}: {e}"));
        assert!(events(&c) > before, "{cmd} left no audit event");
        covered.push(cmd.to_string());
    };
    let project_update: project::ProjectInput =
        serde_json::from_value(json!({"name": "Renamed", "ownerId": U})).unwrap();
    step("project::project_update", &mut |tx| {
        project::update_project(tx, &p, &project_update)
    });
    step("project::project_create", &mut |tx| {
        project::insert_project(tx, &project_update).map(drop)
    });
    let plan = in_tx(&c, |tx| crate::test_plan::insert_plan(tx, &plan_input("P"))).unwrap();
    step("test_plan::test_plan_create", &mut |tx| {
        crate::test_plan::insert_plan(tx, &plan_input("Q")).map(drop)
    });
    step("test_plan::test_plan_update", &mut |tx| {
        crate::test_plan::update_plan(tx, &plan, &plan_input("P2"))
    });
    step("test_plan::test_plan_delete", &mut |tx| {
        crate::test_plan::delete_plan(tx, &plan, U)
    });
    step("test_case::test_case_create", &mut |tx| {
        test_case::insert_case(tx, &case_input(&p, U, "X", json!({}))).map(drop)
    });
    step("test_case::test_case_update", &mut |tx| {
        test_case::update_case(tx, &case, &case_input(&p, U, "Y", json!({})))
    });
    let req = in_tx(&c, |tx| {
        requirement::insert_requirement(tx, &req_input("R"))
    })
    .unwrap();
    step("requirement::requirement_create", &mut |tx| {
        requirement::insert_requirement(tx, &req_input("S")).map(drop)
    });
    step("requirement::requirement_update", &mut |tx| {
        requirement::update_requirement(tx, &req, &req_input("R2"))
    });
    step("requirement::requirement_delete", &mut |tx| {
        requirement::delete_requirement(tx, &req, U)
    });
    let card = in_tx(&c, |tx| planner::insert_card(tx, &card_input("C"))).unwrap();
    step("planner::planner_create", &mut |tx| {
        planner::insert_card(tx, &card_input("D")).map(drop)
    });
    step("planner::planner_update", &mut |tx| {
        planner::update_card(tx, &card, &card_input("C2"))
    });
    step("planner::planner_reorder", &mut |tx| {
        planner::reorder(tx, U, "done", std::slice::from_ref(&card))
    });
    step("planner::planner_attachment_add", &mut |tx| {
        planner::add_attachment(tx, "att", &card, U, "a", None, b"x")
    });
    step("planner::planner_attachment_delete", &mut |tx| {
        planner::delete_attachment(tx, "att", U)
    });
    step("planner::planner_delete", &mut |tx| {
        planner::delete_card(tx, &card, U)
    });
    let t = in_tx(&c, |tx| template::insert_template(tx, &tpl, U)).unwrap();
    step("template::template_create", &mut |tx| {
        template::insert_template(tx, &tpl, U).map(drop)
    });
    step("template::template_update", &mut |tx| {
        template::update_template(tx, &t, &meta, U)
    });
    step("template::template_delete", &mut |tx| {
        template::delete_template(tx, &t, U)
    });
    step("test_case::test_case_delete", &mut |tx| {
        test_case::delete_case(tx, &case, U)
    });
    step("project::project_delete", &mut |tx| {
        project::delete_project(tx, &p, U)
    });
    // The import keeps its own transaction (the command calls it outside in_tx).
    let p2 = new_project(&c, U);
    let before = events(&c);
    let rows: Vec<requirement::RequirementImportRow> =
        serde_json::from_value(json!([{"title": "I"}])).unwrap();
    requirement::import_requirements(&c, &p2, U, &rows).unwrap();
    assert!(events(&c) > before);
    covered.push("requirement::requirement_import".into());
    // Conflict and key commands keep their own transaction too; covered above by
    // `resolving_a_conflict_either_way_is_audited` and
    // `a_key_assigned_by_the_system_names_the_account_it_acted_for`; the user's
    // key rename goes through the same `set_key`.
    covered.extend(
        [
            "sync::sync_conflict_resolve",
            "key_sync::key_conflict_resolve",
            "key_sync::key_blocks_apply",
        ]
        .map(String::from),
    );
    let mut expected: Vec<String> = AUDITED.iter().map(|s| s.to_string()).collect();
    expected.sort();
    covered.sort();
    assert_eq!(covered, expected);
    assert_eq!(chain_ok(&c, U) as i64, events(&c));
}

#[test]
fn a_key_conflict_renamed_by_the_user_is_audited_as_the_user() {
    let c = conn();
    let p = new_project(&c, U);
    let input: requirement::RequirementInput =
        serde_json::from_value(json!({"projectId": p, "title": "R", "userId": U})).unwrap();
    let r = requirement::insert_requirement(&c, &input).unwrap();
    let refused: Vec<key_sync::RejectedKey> =
        serde_json::from_value(json!([{"entity": "requirement", "entityId": r, "takenBy": "x"}]))
            .unwrap();
    key_sync::record_rejected(&c, U, &refused).unwrap();
    let conflict: String = c
        .query_row("SELECT id FROM key_conflicts", [], |r| r.get(0))
        .unwrap();
    let before = events(&c);
    in_tx(&c, |tx| {
        key_sync::resolve(tx, U, &conflict, Some("REQ-777"))
    })
    .unwrap();
    assert_eq!(events(&c), before + 1);
    let actor: String = c
        .query_row(
            "SELECT actor FROM audit_log ORDER BY rowid DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(actor, format!("user:{U}"));
    assert_eq!(last_changes(&c)["requirementKey"][1], "REQ-777");
}

#[test]
fn an_insert_or_replace_cannot_overwrite_an_event() {
    let c = conn();
    let p = new_project(&c, U);
    new_case(&c, &p, U);
    let id: String = c
        .query_row("SELECT id FROM audit_log WHERE chain_seq = 1", [], |r| {
            r.get(0)
        })
        .unwrap();
    let err = c
        .execute(
            "INSERT OR REPLACE INTO audit_log (id, workspace_id, at, hlc, device_id, actor, action, entity,
                entity_id, changes_sha256, chain_workspace_id, chain_seq, hash)
             VALUES (?1, 'w', 'now', 'h', 'd', 'user:x', 'update', 'test_case', 'c', 's', 'w', 1, 'x')",
            [&id],
        )
        .unwrap_err()
        .to_string();
    assert!(err.contains("append-only"), "{err}");
    assert_eq!(chain_ok(&c, U), 2);
}

#[test]
fn a_rejected_event_is_not_sent_again_and_is_counted_apart() {
    let c = conn();
    let p = new_project(&c, U);
    new_case(&c, &p, U);
    let deltas = pushed_events(&c, U);
    assert_eq!(deltas.len(), 2);
    let op_ids: Vec<String> = deltas[1]["opIds"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().to_string())
        .collect();
    sync::mark_rejected(&c, U, &op_ids).unwrap();
    assert_eq!(pushed_events(&c, U).len(), 1);
    assert_eq!(
        (
            audit::pending_count(&c).unwrap(),
            audit::rejected_count(&c).unwrap()
        ),
        (1, 1)
    );
    // Entity rows are never marked.
    let case_ops: Vec<String> = {
        let mut stmt = c
            .prepare("SELECT id FROM oplog WHERE entity = 'test_case'")
            .unwrap();
        let rows = stmt.query_map([], |r| r.get(0)).unwrap();
        rows.collect::<rusqlite::Result<_>>().unwrap()
    };
    sync::mark_rejected(&c, U, &case_ops).unwrap();
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM oplog WHERE entity = 'test_case' AND payload = '{}'"
        ),
        1
    );
}
