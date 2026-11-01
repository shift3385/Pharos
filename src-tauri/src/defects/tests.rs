//! Defects (DEF-01, ADR-0016): repository rules, links, creation from a
//! result, the conversion of planner defect cards (local and pulled) and the
//! sync between devices.

use rusqlite::Connection;
use serde_json::{json, Value};

use super::*;
use crate::db::{in_tx, run_migrations};
use crate::{oplog, purge, runs, sync, test_case};

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

fn new_case(c: &Connection, project: &str) -> String {
    let input: test_case::TestCaseInput = serde_json::from_value(json!({
        "projectId": project, "title": "Pay", "author": "Ada",
        "data": {"steps": [{"text": "open"}, {"text": "pay", "expected": "paid"}]}, "userId": U
    }))
    .unwrap();
    test_case::insert_case(c, &input).unwrap()
}

fn input(project: &str, extra: Value) -> DefectInput {
    let mut v = json!({"projectId": project, "title": "Login fails", "userId": U});
    if let (Value::Object(m), Value::Object(e)) = (&mut v, extra) {
        m.extend(e);
    }
    serde_json::from_value(v).unwrap()
}

fn count(c: &Connection, sql: &str) -> i64 {
    c.query_row(sql, [], |r| r.get(0)).unwrap()
}

fn events(c: &Connection, action: &str) -> i64 {
    c.query_row(
        "SELECT count(*) FROM audit_log WHERE entity = 'defect' AND action = ?1",
        [action],
        |r| r.get(0),
    )
    .unwrap()
}

// ---- repository -------------------------------------------------------------

#[test]
fn defects_get_keys_defaults_and_belong_to_the_project_owner() {
    let c = device();
    let p = new_project(&c);
    let a = insert_defect(&c, &input(&p, json!({}))).unwrap();
    let b = insert_defect(
        &c,
        &input(&p, json!({"severity": "critical", "priority": "high"})),
    )
    .unwrap();
    let a = get_defect(&c, &a, U).unwrap().unwrap();
    let b = get_defect(&c, &b, U).unwrap().unwrap();
    assert_eq!(
        (a.defect_key.as_str(), b.defect_key.as_str()),
        ("DEF-001", "DEF-002")
    );
    assert_eq!(
        (a.severity.as_str(), a.priority.as_str(), a.status.as_str()),
        ("major", "medium", "new")
    );
    assert_eq!(
        (b.severity.as_str(), b.priority.as_str()),
        ("critical", "high")
    );
    assert_eq!(a.reporter, U);
    assert_eq!(list_defects(&c, &p, U).unwrap().len(), 2);
    assert!(get_defect(&c, &a.id, "someone-else").unwrap().is_none());
    let mut foreign = input(&p, json!({}));
    foreign.user_id = "someone-else".into();
    assert!(insert_defect(&c, &foreign).is_err());
    for bad in [
        json!({"severity": "blocker"}),
        json!({"status": "done"}),
        json!({"status": "closed"}),
        json!({"title": " "}),
        json!({"title": "x".repeat(MAX_TITLE + 1)}),
        json!({"data": [1]}),
    ] {
        assert!(insert_defect(&c, &input(&p, bad.clone())).is_err(), "{bad}");
    }
    assert_eq!(events(&c, "create"), 2);
}

#[test]
fn the_lifecycle_and_the_resolution_are_enforced() {
    let c = device();
    let p = new_project(&c);
    let d = insert_defect(&c, &input(&p, json!({}))).unwrap();
    assert!(transition(&c, &d, U, "fixed", None, None).is_err());
    for s in ["open", "in_progress", "fixed", "retest"] {
        transition(&c, &d, U, s, None, None).unwrap();
    }
    assert_eq!(
        transition(&c, &d, U, "closed", None, None).unwrap_err(),
        "defect-resolution-required"
    );
    transition(&c, &d, U, "closed", Some("fixed"), Some("1.4.3")).unwrap();
    let x = get_defect(&c, &d, U).unwrap().unwrap();
    assert_eq!(
        (x.status.as_str(), x.resolution.as_deref()),
        ("closed", Some("fixed"))
    );
    assert_eq!(x.fixed_in_build.as_deref(), Some("1.4.3"));
    // Reopening drops the resolution; an edit keeps the status rules.
    let mut edit = input(&p, json!({"status": "open", "title": "Reopened"}));
    update_defect(&c, &d, &edit).unwrap();
    let x = get_defect(&c, &d, U).unwrap().unwrap();
    assert_eq!((x.status.as_str(), x.resolution), ("open", None));
    edit.status = Some("closed".into());
    assert!(update_defect(&c, &d, &edit).is_err());
    edit.status = Some("deferred".into());
    update_defect(&c, &d, &edit).unwrap();
    transition(&c, &d, U, "open", None, None).unwrap();
    transition(&c, &d, U, "rejected", Some("duplicate"), None).unwrap();
    transition(&c, &d, U, "open", None, None).unwrap();
    // Each status change is one update event, with the status in its diff.
    let diffs: Vec<String> = {
        let mut stmt = c
            .prepare("SELECT changes FROM audit_log WHERE entity = 'defect' AND action = 'update'")
            .unwrap();
        let rows = stmt.query_map([], |r| r.get(0)).unwrap();
        rows.collect::<rusqlite::Result<_>>().unwrap()
    };
    assert_eq!(diffs.len(), 10);
    assert!(diffs.iter().all(|d| d.contains("status")));
}

#[test]
fn links_are_deterministic_revived_and_checked() {
    let c = device();
    let p = new_project(&c);
    let case = new_case(&c, &p);
    let d = insert_defect(&c, &input(&p, json!({}))).unwrap();
    let t = LinkTarget {
        target_kind: "test_case".into(),
        target_id: case.clone(),
    };
    set_link(&c, &d, U, &t, true).unwrap();
    set_link(&c, &d, U, &t, true).unwrap(); // twice: nothing new
    let x = get_defect(&c, &d, U).unwrap().unwrap();
    assert_eq!(x.links.len(), 1);
    assert_eq!(x.links[0].id, ids::link_id(&d, "test_case", &case));
    assert_eq!(x.case_ids, vec![case.clone()]);
    assert!(x.links[0].label.as_deref().unwrap().starts_with("ATS_"));
    set_link(&c, &d, U, &t, false).unwrap();
    assert!(get_defect(&c, &d, U).unwrap().unwrap().links.is_empty());
    set_link(&c, &d, U, &t, true).unwrap();
    assert_eq!(count(&c, "SELECT count(*) FROM defect_links"), 1);
    assert_eq!(count(&c, "SELECT revision FROM defect_links"), 3);
    assert_eq!(events(&c, "link"), 2);
    assert_eq!(events(&c, "unlink"), 1);
    // Unknown targets, another project's case, and kinds without a table yet.
    let other = new_project(&c);
    let foreign = new_case(&c, &other);
    for (kind, id) in [
        ("test_case", "nope"),
        ("test_case", foreign.as_str()),
        ("finding", "f1"),
        ("bug", "x"),
    ] {
        let t = LinkTarget {
            target_kind: kind.into(),
            target_id: id.into(),
        };
        assert!(set_link(&c, &d, U, &t, true).is_err(), "{kind}");
    }
}

/// A project with a case, a run with its item and a failed manual attempt
/// whose second step failed, with an attachment on the result and one on
/// the step.
fn failed_result(c: &Connection) -> (String, String, String) {
    let p = new_project(c);
    let case = new_case(c, &p);
    let run_input: runs::RunInput = serde_json::from_value(json!({
        "projectId": p, "title": "Smoke", "userId": U, "build": "1.4.2", "environment": "staging"
    }))
    .unwrap();
    let run = runs::insert_run(c, &run_input).unwrap();
    let item: runs::RunItemInput = serde_json::from_value(json!({"testCaseId": case})).unwrap();
    let items = runs::add_items(c, &run, U, &[item]).unwrap();
    let data: String = c
        .query_row("SELECT data FROM test_cases WHERE id = ?1", [&case], |r| {
            r.get(0)
        })
        .unwrap();
    let data: Value = serde_json::from_str(&data).unwrap();
    let s0 = data["steps"][0]["id"].as_str().unwrap().to_string();
    let s1 = data["steps"][1]["id"].as_str().unwrap().to_string();
    let result: runs::ResultInput = serde_json::from_value(json!({
        "runItemId": items[0], "status": "failed", "userId": U, "errorMessage": "boom",
        "steps": [
            {"stepId": s0, "text": "open", "status": "passed"},
            {"stepId": s1, "text": "pay", "status": "failed", "actual": "Error 500"}
        ]
    }))
    .unwrap();
    let rid = runs::record_result(c, &result).unwrap();
    let step_row: String = c
        .query_row(
            "SELECT id FROM step_results WHERE result_id = ?1 AND position = 1",
            [&rid],
            |r| r.get(0),
        )
        .unwrap();
    for (n, (entity, owner)) in [("result", rid.as_str()), ("step_result", step_row.as_str())]
        .into_iter()
        .enumerate()
    {
        let stored = evidence::Stored {
            sha256: crate::audit::sha256_hex(format!("shot{n}").as_bytes()),
            size: 5,
        };
        evidence::record_blob(c, &stored, Some("image/png")).unwrap();
        evidence::insert_attachment(
            c,
            &evidence::AttachmentRow {
                id: &format!("att{n}"),
                workspace_id: &ensure_workspace(c).unwrap(),
                project_id: &p,
                owner_entity: entity,
                owner_id: owner,
                name: "shot.png",
                mime: Some("image/png"),
                kind: "screenshot",
                sha256: &stored.sha256,
                size: 5,
                user: U,
            },
        )
        .unwrap();
    }
    (p, case, rid)
}

#[test]
fn a_defect_from_a_failed_result_is_prefilled_and_shares_its_evidence() {
    let c = device();
    let (p, case, rid) = failed_result(&c);
    let draft = draft_from_result(&c, &rid, None, U).unwrap();
    assert_eq!(draft.project_id, p);
    assert!(draft.title.ends_with("· pay"), "{}", draft.title);
    assert_eq!(draft.steps_to_reproduce.as_deref(), Some("1. open\n2. pay"));
    assert_eq!(draft.expected.as_deref(), Some("paid"));
    assert_eq!(draft.actual.as_deref(), Some("Error 500"));
    assert_eq!(draft.found_in_build.as_deref(), Some("1.4.2"));
    assert_eq!(draft.found_in_environment.as_deref(), Some("staging"));
    assert!(draft.from_result.as_ref().unwrap().step_id.is_some());
    // Nothing written by the draft.
    assert_eq!(count(&c, "SELECT count(*) FROM defects"), 0);
    let blobs = count(&c, "SELECT count(*) FROM blobs");
    let id = insert_defect(&c, &draft).unwrap();
    let d = get_defect(&c, &id, U).unwrap().unwrap();
    let kinds: Vec<&str> = d.links.iter().map(|l| l.target_kind.as_str()).collect();
    assert_eq!(kinds, ["result", "test_case"]);
    assert_eq!(d.case_ids, vec![case]);
    assert!(d.links[0]
        .label
        .as_deref()
        .unwrap()
        .starts_with("RUN-001 · "));
    let atts = list_attachments(&c, &id, U).unwrap();
    assert_eq!(atts.len(), 2);
    // Same contents, no new blob, and the result keeps its own attachments.
    assert_eq!(count(&c, "SELECT count(*) FROM blobs"), blobs);
    assert_eq!(
        count(&c, "SELECT count(DISTINCT sha256) FROM attachments"),
        2
    );
    assert_eq!(count(&c, "SELECT count(*) FROM attachments"), 4);
    assert_eq!(events(&c, "create"), 1);
    // Only failed attempts are offered.
    let candidates = result_candidates(&c, &p, U).unwrap();
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].run_key, "RUN-001");
    assert!(result_candidates(&c, &p, "someone-else")
        .unwrap()
        .is_empty());
}

#[test]
fn deleting_a_defect_takes_its_links_and_releases_its_evidence() {
    let c = device();
    let (_, _, rid) = failed_result(&c);
    let draft = draft_from_result(&c, &rid, None, U).unwrap();
    let id = insert_defect(&c, &draft).unwrap();
    delete_defect(&c, &id, U).unwrap();
    assert!(get_defect(&c, &id, U).unwrap().is_none());
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM defect_links WHERE deleted_at IS NULL"
        ),
        0
    );
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM attachments WHERE owner_entity = 'defect' AND deleted_at IS NULL"
        ),
        0
    );
    // The result's attachments still need the contents.
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM blobs WHERE local_state = 'deleting'"
        ),
        0
    );
    assert_eq!(events(&c, "delete"), 1);
    assert!(delete_defect(&c, &id, U).is_err());
}

#[test]
fn attachments_of_a_defect_are_owner_scoped() {
    let c = device();
    let p = new_project(&c);
    let d = insert_defect(&c, &input(&p, json!({}))).unwrap();
    let stored = evidence::Stored {
        sha256: crate::audit::sha256_hex(b"log"),
        size: 3,
    };
    add_attachment(&c, "a1", &d, U, "log.txt", Some("text/plain"), &stored).unwrap();
    assert!(add_attachment(&c, "a2", &d, "someone-else", "x", None, &stored).is_err());
    assert_eq!(list_attachments(&c, &d, U).unwrap().len(), 1);
    assert!(list_attachments(&c, &d, "someone-else").unwrap().is_empty());
    assert!(delete_attachment(&c, "a1", "someone-else").is_err());
    delete_attachment(&c, "a1", U).unwrap();
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM blobs WHERE local_state = 'deleting'"
        ),
        1
    );
    assert_eq!(events(&c, "link") + events(&c, "unlink"), 2);
    // Attachments never reach the oplog (SYNC-04b).
    assert_eq!(
        count(&c, "SELECT count(*) FROM oplog WHERE entity = 'attachment'"),
        0
    );
}

// ---- sync between devices ----------------------------------------------------

fn as_doc(d: &Value) -> sync::RemoteDoc {
    serde_json::from_value(json!({
        "entity": d["entity"], "entityId": d["entityId"], "payload": d["payload"],
        "revision": d["revision"], "hlc": d["hlc"], "deleted": d["op"] == "delete",
    }))
    .unwrap()
}

fn push(from: &Connection) -> Vec<Value> {
    let lww = serde_json::to_value(sync::build_pending(from, U).unwrap()).unwrap();
    let pushed: Vec<sync::PushedDelta> = serde_json::from_value(lww["deltas"].clone()).unwrap();
    sync::mark_pushed(from, U, &pushed).unwrap();
    lww["deltas"].as_array().unwrap().clone()
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
fn defects_and_links_travel_and_the_same_link_is_one_row() {
    let (a, b) = (device(), device());
    let p = new_project(&a);
    let case = new_case(&a, &p);
    pull(&b, &push(&a));
    let d = insert_defect(
        &a,
        &input(
            &p,
            json!({"severity": "minor", "data": {"labels": ["ui"]},
                   "links": [{"targetKind": "test_case", "targetId": case}]}),
        ),
    )
    .unwrap();
    let docs = push(&a);
    assert_eq!(entities(&docs), ["defect", "defect_link"]);
    pull(&b, &docs);
    let x = get_defect(&b, &d, U).unwrap().unwrap();
    let y = get_defect(&a, &d, U).unwrap().unwrap();
    assert_eq!(
        (x.defect_key, x.severity, x.data),
        (y.defect_key, y.severity, y.data)
    );
    assert_eq!(x.case_ids, vec![case.clone()]);
    // Linking the same case again on B gives the same row.
    let t = LinkTarget {
        target_kind: "test_case".into(),
        target_id: case,
    };
    set_link(&b, &d, U, &t, false).unwrap();
    set_link(&b, &d, U, &t, true).unwrap();
    assert_eq!(count(&b, "SELECT count(*) FROM defect_links"), 1);
    // Nothing pending is left on A after pulling its own echo.
    pull(&a, &docs);
    assert_eq!(count(&a, "SELECT count(*) FROM sync_conflicts"), 0);
}

#[test]
fn a_link_pulled_before_its_defect_is_kept() {
    let (a, b) = (device(), device());
    let p = new_project(&a);
    let case = new_case(&a, &p);
    pull(&b, &push(&a));
    insert_defect(
        &a,
        &input(
            &p,
            json!({"links": [{"targetKind": "test_case", "targetId": case}]}),
        ),
    )
    .unwrap();
    let mut docs = push(&a);
    docs.reverse();
    pull(&b, &docs);
    assert_eq!(count(&b, "SELECT count(*) FROM defect_links"), 1);
    assert_eq!(count(&b, "SELECT count(*) FROM defects"), 1);
}

#[test]
fn a_pulled_defect_key_that_clashes_becomes_a_key_conflict() {
    let (a, b) = (device(), device());
    let p = new_project(&a);
    pull(&b, &push(&a));
    for dev in [&a, &b] {
        keys::store_block(dev, KeyKind::Defect, &p, 1, 50).unwrap();
    }
    let da = insert_defect(&a, &input(&p, json!({}))).unwrap();
    let db_ = insert_defect(&b, &input(&p, json!({}))).unwrap();
    pull(&b, &push(&a));
    assert_eq!(
        get_defect(&b, &da, U).unwrap().unwrap().defect_key,
        "DEF-001"
    );
    let local = get_defect(&b, &db_, U).unwrap().unwrap().defect_key;
    assert!(keys::is_provisional(&local), "{local}");
    assert_eq!(
        count(
            &b,
            "SELECT count(*) FROM key_conflicts WHERE entity = 'defect' AND resolved_at IS NULL"
        ),
        1
    );
}

#[test]
fn nothing_of_it_reaches_a_server_without_defects() {
    let c = Connection::open_in_memory().unwrap();
    run_migrations(&c).unwrap();
    sync::assume_server_features(
        &c,
        "key-conflicts,append-only,stable-steps,runs,custom-fields",
    );
    let p = new_project(&c);
    let case = new_case(&c, &p);
    insert_defect(
        &c,
        &input(
            &p,
            json!({"links": [{"targetKind": "test_case", "targetId": case}]}),
        ),
    )
    .unwrap();
    let docs = push(&c);
    assert!(entities(&docs)
        .iter()
        .all(|e| !ENTITIES.contains(&e.as_str())));
    assert_eq!(held_back(&c).unwrap(), 2);
    sync::assume_server_features(
        &c,
        "key-conflicts,append-only,stable-steps,runs,custom-fields,defects",
    );
    assert_eq!(entities(&push(&c)), ["defect", "defect_link"]);
    assert_eq!(held_back(&c).unwrap(), 0);
}

#[test]
fn a_cursor_stored_before_defects_restarts_at_zero() {
    let c = device();
    sync::cursor_set(&c, U, "42").unwrap();
    c.execute(
        "UPDATE sync_state SET value = '4' WHERE key = ?1",
        [format!("cursor_set:{U}")],
    )
    .unwrap();
    assert_eq!(sync::cursor_get(&c, U).unwrap(), "0");
}

#[test]
fn a_project_delete_and_the_purge_take_defects_links_and_attachments() {
    let c = device();
    let p = new_project(&c);
    let case = new_case(&c, &p);
    let d = insert_defect(
        &c,
        &input(
            &p,
            json!({"links": [{"targetKind": "test_case", "targetId": case}]}),
        ),
    )
    .unwrap();
    let stored = evidence::Stored {
        sha256: crate::audit::sha256_hex(b"log"),
        size: 3,
    };
    add_attachment(&c, "a1", &d, U, "log.txt", None, &stored).unwrap();
    project::delete_project(&c, &p, U).unwrap();
    assert!(get_defect(&c, &d, U).unwrap().is_none());
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM defect_links WHERE deleted_at IS NULL"
        ),
        0
    );
    c.execute("UPDATE oplog SET synced_at = datetime('now')", [])
        .unwrap();
    for t in [
        "defects",
        "defect_links",
        "test_cases",
        "projects",
        "attachments",
    ] {
        c.execute(
            &format!("UPDATE {t} SET deleted_at = '2000-01-01 00:00:00'"),
            [],
        )
        .unwrap();
    }
    let s = purge::purge(&c, U, 30).unwrap();
    assert_eq!(s.defects, 2);
    for t in ["defects", "defect_links", "projects"] {
        assert_eq!(count(&c, &format!("SELECT count(*) FROM {t}")), 0, "{t}");
    }
    purge::purge_evidence(&c, U, 30).unwrap();
    assert_eq!(count(&c, "SELECT count(*) FROM attachments"), 0);
    // The key stays taken.
    assert!(keys::taken(&c, KeyKind::Defect, &p, "DEF-001").unwrap());
}

// ---- conversion of planner defect cards ---------------------------------------------

/// A defect card as a pre-0029 build left it.
fn old_card(c: &Connection, p: &str, id: &str, key: &str, status: &str, data: Value) {
    c.execute(
        "INSERT INTO planner_cards (id, workspace_id, project_id, owner_id, kind, card_key, title,
                status, priority, position, data, created_by, updated_by, created_at, updated_at,
                revision)
         VALUES (?1, ?2, ?3, ?4, 'defect', ?5, 'Bug ' || ?1, ?6, 'high', 0, ?7, ?4, ?4,
                '2026-10-01 10:00:00', '2026-10-02 10:00:00', 4)",
        rusqlite::params![
            id,
            ensure_workspace(c).unwrap(),
            p,
            U,
            key,
            status,
            data.to_string()
        ],
    )
    .unwrap();
}

#[test]
fn planner_defect_cards_become_defects_without_loss() {
    let c = device();
    let p = new_project(&c);
    let case = new_case(&c, &p);
    old_card(
        &c,
        &p,
        "k-backlog",
        "DEF-001",
        "backlog",
        json!({"testCaseIds": [case], "description": "d"}),
    );
    old_card(&c, &p, "k-progress", "DEF-002", "in_progress", json!({}));
    old_card(
        &c,
        &p,
        "k-review",
        "DEF-003",
        "in_review",
        json!({"labels": ["ui"]}),
    );
    old_card(&c, &p, "k-done", "DEF-004", "done", json!({}));
    old_card(&c, &p, "k-gone", "DEF-005", "backlog", json!({}));
    c.execute(
        "UPDATE planner_cards SET deleted_at = '2026-10-03' WHERE id = 'k-gone'",
        [],
    )
    .unwrap();
    // A task that was once a defect: its key stays taken.
    c.execute(
        "INSERT INTO planner_cards (id, workspace_id, project_id, owner_id, kind, card_key, title,
                status, priority, position, data, created_by, updated_by, created_at, updated_at)
         SELECT 'k-task', workspace_id, project_id, owner_id, 'task', 'DEF-006', 'T', 'backlog',
                'low', 0, '{}', owner_id, owner_id, created_at, updated_at
           FROM planner_cards WHERE id = 'k-done'",
        [],
    )
    .unwrap();
    // An attachment of a card, and a synced card with a pending edit.
    c.execute(
        "INSERT INTO attachments (id, workspace_id, project_id, sha256, size, name, owner_entity,
                owner_id, created_by, updated_by, created_at, updated_at)
         VALUES ('att', 'w', ?1, 'aa', 1, 'a.png', 'planner_card', 'k-backlog', ?2, ?2, 'n', 'n')",
        rusqlite::params![p, U],
    )
    .unwrap();
    c.execute(
        "INSERT INTO sync_base (user_id, entity, entity_id, revision, hlc)
         VALUES (?1, 'planner_card', 'k-review', 4, 'H-review')",
        [U],
    )
    .unwrap();
    in_tx(&c, |tx| {
        oplog::record(tx, "planner_card", "k-review", "upsert", "{}", 4, U).map(drop)
    })
    .unwrap();
    in_tx(&c, |tx| {
        oplog::record(tx, "planner_card", "k-backlog", "upsert", "{}", 1, U).map(drop)
    })
    .unwrap();
    in_tx(&c, migrate_planner_defects).unwrap();
    in_tx(&c, migrate_planner_defects).unwrap(); // idempotent

    let all = list_defects(&c, &p, U).unwrap();
    let by = |id: &str| all.iter().find(|d| d.id == id).cloned().unwrap();
    let row = |id: &str| (by(id).defect_key, by(id).status, by(id).resolution);
    assert_eq!(row("k-backlog"), ("DEF-001".into(), "new".into(), None));
    assert_eq!(
        row("k-progress"),
        ("DEF-002".into(), "in_progress".into(), None)
    );
    assert_eq!(row("k-review"), ("DEF-003".into(), "retest".into(), None));
    assert_eq!(
        row("k-done"),
        ("DEF-004".into(), "closed".into(), Some("fixed".into()))
    );
    assert_eq!(all.len(), 4, "the deleted card is a deleted defect");
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM defects WHERE id = 'k-gone' AND deleted_at IS NOT NULL"
        ),
        1
    );
    let b = by("k-backlog");
    assert_eq!(
        (
            b.description.as_str(),
            b.priority.as_str(),
            b.severity.as_str()
        ),
        ("d", "high", "major")
    );
    assert_eq!(b.case_ids, vec![case]);
    assert_eq!(
        (b.created_at.as_str(), b.revision),
        ("2026-10-01 10:00:00", 4)
    );
    assert_eq!(by("k-review").data, json!({"labels": ["ui"]}));
    // Attachments, cards, keys.
    assert_eq!(
        count(&c, "SELECT count(*) FROM attachments WHERE owner_entity = 'defect' AND owner_id = 'k-backlog'"),
        1
    );
    assert_eq!(list_attachments(&c, "k-backlog", U).unwrap().len(), 1);
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM planner_cards WHERE kind = 'defect' AND deleted_at IS NULL"
        ),
        0
    );
    assert!(keys::taken(&c, KeyKind::Defect, &p, "DEF-006").unwrap());
    assert_eq!(
        insert_defect(&c, &input(&p, json!({})))
            .map(|id| get_defect(&c, &id, U).unwrap().unwrap().defect_key)
            .unwrap(),
        "DEF-007"
    );
    // Sync: the pending edits now belong to the defects; the synced card's
    // base is the defect's; the never-synced card's link will be pushed.
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM oplog WHERE entity = 'planner_card' AND synced_at IS NULL"
        ),
        0
    );
    assert_eq!(
        count(&c, "SELECT count(*) FROM sync_base WHERE entity = 'defect' AND entity_id = 'k-review' AND revision = 4 AND hlc = 'H-review'"),
        1
    );
    let docs = push(&c);
    let review = docs.iter().find(|d| d["entityId"] == "k-review").unwrap();
    assert_eq!(
        (review["entity"].as_str(), review["baseRevision"].as_i64()),
        (Some("defect"), Some(4))
    );
    assert!(docs.iter().any(|d| d["entity"] == "defect_link"));
    assert!(docs.iter().all(|d| d["entity"] != "planner_card"));
}

/// The card document the server converts in its migration 0010.
fn card_doc(p: &str, id: &str, revision: i64, hlc: &str, title: &str) -> Value {
    json!({
        "entity": "planner_card", "entityId": id, "revision": revision, "hlc": hlc, "op": "upsert",
        "payload": {"id": id, "workspaceId": "w", "projectId": p, "ownerId": U, "kind": "defect",
                    "cardKey": "DEF-001", "title": title, "status": "in_review", "priority": "low",
                    "position": 0, "data": {}, "createdAt": "c", "updatedAt": "u"},
    })
}

#[test]
fn a_card_pulled_from_an_older_server_is_converted_and_a_stale_one_is_ignored() {
    let c = device();
    let p = new_project(&c);
    pull(&c, &[card_doc(&p, "k1", 3, "H1", "Bug")]);
    let d = get_defect(&c, "k1", U).unwrap().unwrap();
    assert_eq!(
        (d.status.as_str(), d.defect_key.as_str(), d.revision),
        ("retest", "DEF-001", 3)
    );
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM planner_cards WHERE deleted_at IS NULL"
        ),
        0
    );
    // A newer local edit is never overwritten by an older card.
    transition(&c, "k1", U, "closed", Some("fixed"), None).unwrap();
    push(&c);
    pull(&c, &[card_doc(&p, "k1", 3, "H0", "Old title")]);
    let d = get_defect(&c, "k1", U).unwrap().unwrap();
    assert_eq!((d.status.as_str(), d.title.as_str()), ("closed", "Bug"));
    // Nothing of the card is pushed back.
    assert!(push(&c).iter().all(|d| d["entity"] != "planner_card"));
}

#[test]
fn a_local_conversion_and_the_server_conversion_converge() {
    // The card was synced at revision 4 / H; the server converts it to a
    // defect with the same revision and HLC and tombstones the card.
    let c = device();
    let p = new_project(&c);
    push(&c);
    old_card(&c, &p, "k1", "DEF-001", "backlog", json!({}));
    c.execute(
        "INSERT INTO sync_base (user_id, entity, entity_id, revision, hlc)
         VALUES (?1, 'planner_card', 'k1', 4, 'H')",
        [U],
    )
    .unwrap();
    in_tx(&c, migrate_planner_defects).unwrap();
    assert!(push(&c).is_empty(), "nothing to push for a synced card");
    let card = card_doc(&p, "k1", 4, "H", "Bug k1");
    let (defect, _) = convert::from_card(&card["payload"]);
    let docs = vec![
        json!({"entity": "defect", "entityId": "k1", "revision": 4, "hlc": "H", "op": "upsert", "payload": defect}),
        json!({"entity": "planner_card", "entityId": "k1", "revision": 5, "hlc": "H", "op": "delete", "payload": card["payload"]}),
    ];
    pull(&c, &docs);
    assert_eq!(count(&c, "SELECT count(*) FROM sync_conflicts"), 0);
    assert_eq!(
        count(&c, "SELECT count(*) FROM defects WHERE deleted_at IS NULL"),
        1
    );
    assert!(push(&c).is_empty());
}
