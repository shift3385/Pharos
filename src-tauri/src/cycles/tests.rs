//! Test cycles and configurations (CYC-01): repository rules, executing a
//! cycle, progress, and the sync between devices (ADR-0017: two people adding
//! cases to one cycle never conflict; an item pulled before its cycle is kept).

use rusqlite::Connection;
use serde_json::{json, Value};

use super::*;
use crate::db::{in_tx, run_migrations};
use crate::{oplog, purge, requirement, runs, sync, test_case};

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

fn new_case(c: &Connection, project: &str, extra: Value) -> String {
    let mut v = json!({
        "projectId": project, "title": "Pay", "author": "Ada", "userId": U,
        "data": {"steps": ["open", "pay"]}
    });
    if let (Value::Object(m), Value::Object(e)) = (&mut v, extra) {
        m.extend(e);
    }
    let input: test_case::TestCaseInput = serde_json::from_value(v).unwrap();
    test_case::insert_case(c, &input).unwrap()
}

fn config(c: &Connection, p: &str, name: &str, labels: &[&str]) -> String {
    let input: ConfigurationInput = serde_json::from_value(
        json!({"projectId": p, "name": name, "matchLabels": labels, "userId": U}),
    )
    .unwrap();
    create_configuration(c, &input).unwrap()
}

fn cycle_input(p: &str, extra: Value) -> TestCycleInput {
    let mut v = json!({"projectId": p, "title": "Regression 1.4", "userId": U});
    if let (Value::Object(m), Value::Object(e)) = (&mut v, extra) {
        m.extend(e);
    }
    serde_json::from_value(v).unwrap()
}

fn item(case: &str) -> CycleItemInput {
    CycleItemInput {
        test_case_id: case.into(),
        ..Default::default()
    }
}

fn exec(configs: Option<Vec<String>>) -> ExecuteInput {
    ExecuteInput {
        configuration_ids: configs,
        user_id: U.into(),
        ..Default::default()
    }
}

fn count(c: &Connection, sql: &str) -> i64 {
    c.query_row(sql, [], |r| r.get(0)).unwrap()
}

/// A project, one case, two configurations and a cycle with both and the case.
fn setup(c: &Connection) -> (String, String, String, String, String) {
    let p = new_project(c);
    let case = new_case(c, &p, json!({}));
    let chrome = config(c, &p, "Chrome", &["chromium", "Desktop Chrome"]);
    let firefox = config(c, &p, "Firefox", &["firefox"]);
    let cycle = insert_cycle(
        c,
        &cycle_input(&p, json!({"configurationIds": [chrome, firefox]})),
    )
    .unwrap();
    add_items(c, &cycle, U, &[item(&case)]).unwrap();
    (p, case, chrome, firefox, cycle)
}

// ---- configurations ----------------------------------------------------------

#[test]
fn configurations_keep_their_attributes_labels_and_order() {
    let c = device();
    let p = new_project(&c);
    let input: ConfigurationInput = serde_json::from_value(json!({
        "projectId": p, "name": " Chrome · Windows 11 ", "userId": U,
        "attributes": {"browser": "Chrome", "os": " Windows 11 ", "device": "", "locale": null},
        "matchLabels": ["chromium", " Chromium ", "", "Desktop Chrome"]
    }))
    .unwrap();
    let a = create_configuration(&c, &input).unwrap();
    let b = config(&c, &p, "Pixel 8", &["Pixel 8"]);
    let list = list_configurations(&c, &p, U, false).unwrap();
    assert_eq!(list.len(), 2);
    assert_eq!(list[0].name, "Chrome · Windows 11");
    assert_eq!(
        list[0].attributes,
        json!({"browser": "Chrome", "os": "Windows 11"})
    );
    assert_eq!(list[0].match_labels, vec!["chromium", "Desktop Chrome"]);
    assert_eq!((list[0].position, list[1].position), (0, 1));
    // Unknown attribute, missing name, foreign account.
    let bad: ConfigurationInput = serde_json::from_value(
        json!({"projectId": p, "name": "X", "attributes": {"gpu": "x"}, "userId": U}),
    )
    .unwrap();
    assert!(create_configuration(&c, &bad).is_err());
    let bad: ConfigurationInput =
        serde_json::from_value(json!({"projectId": p, "name": " ", "userId": U})).unwrap();
    assert!(create_configuration(&c, &bad).is_err());
    assert!(list_configurations(&c, &p, "someone-else", true)
        .unwrap()
        .is_empty());
    reorder_configurations(&c, &p, std::slice::from_ref(&b), U).unwrap();
    let list = list_configurations(&c, &p, U, false).unwrap();
    assert_eq!(
        (list[0].id.as_str(), list[1].id.as_str()),
        (b.as_str(), a.as_str())
    );
}

#[test]
fn a_match_label_belongs_to_one_live_configuration() {
    let c = device();
    let p = new_project(&c);
    let chrome = config(&c, &p, "Chrome", &["chromium"]);
    let dup: ConfigurationInput = serde_json::from_value(
        json!({"projectId": p, "name": "Edge", "matchLabels": ["CHROMIUM "], "userId": U}),
    )
    .unwrap();
    assert!(create_configuration(&c, &dup)
        .unwrap_err()
        .starts_with("match-label-taken"));
    // Archived, its labels are free; restoring it checks them again.
    set_configuration_archived(&c, &chrome, true, U).unwrap();
    let edge = create_configuration(&c, &dup).unwrap();
    assert!(set_configuration_archived(&c, &chrome, false, U)
        .unwrap_err()
        .starts_with("match-label-taken"));
    assert_eq!(
        match_configuration(&c, &p, " chromium").unwrap().as_deref(),
        Some(edge.as_str())
    );
    // By name when no label matches; nothing for an unknown label.
    assert_eq!(
        match_configuration(&c, &p, "edge").unwrap().as_deref(),
        Some(edge.as_str())
    );
    assert_eq!(match_configuration(&c, &p, "webkit").unwrap(), None);
    assert!(!list_configurations(&c, &p, U, false)
        .unwrap()
        .iter()
        .any(|x| x.id == chrome));
    assert_eq!(list_configurations(&c, &p, U, true).unwrap().len(), 2);
}

#[test]
fn the_same_label_created_offline_on_two_devices_maps_to_one_configuration() {
    let (a, b) = (device(), device());
    let p = new_project(&a);
    pull(&b, &push(&a));
    let x = config(&a, &p, "Chrome A", &["chromium"]);
    let y = config(&b, &p, "Chrome B", &["Chromium"]);
    pull(&b, &push(&a));
    pull(&a, &push(&b));
    let winner = x.clone().min(y.clone());
    for dev in [&a, &b] {
        // The smallest id wins on every device, never two.
        assert_eq!(
            match_configuration(dev, &p, "chromium").unwrap().as_deref(),
            Some(winner.as_str())
        );
        let list = list_configurations(dev, &p, U, false).unwrap();
        for cfg in &list {
            assert_eq!(cfg.label_clashes.len(), 1, "{}", cfg.name);
            assert_eq!(cfg.label_clashes[0].wins, cfg.id == winner);
        }
    }
}

// ---- cycles ----------------------------------------------------------------------

#[test]
fn cycles_get_keys_and_check_their_header() {
    let c = device();
    let p = new_project(&c);
    let a = insert_cycle(
        &c,
        &cycle_input(
            &p,
            json!({"build": "1.4.2", "environment": "staging", "startsOn": "2026-11-02",
                   "endsOn": "2026-11-13", "milestone": "Hito 2", "sprint": "Sprint 5"}),
        ),
    )
    .unwrap();
    let b = insert_cycle(&c, &cycle_input(&p, json!({}))).unwrap();
    let a = get_cycle(&c, &a, U).unwrap().unwrap();
    let b = get_cycle(&c, &b, U).unwrap().unwrap();
    assert_eq!(
        (a.cycle_key.as_str(), b.cycle_key.as_str()),
        ("CYC-001", "CYC-002")
    );
    assert_eq!(a.status, "planned");
    assert_eq!(a.build.as_deref(), Some("1.4.2"));
    for bad in [
        json!({"startsOn": "2026-02-30"}),
        json!({"startsOn": "2026-11-13", "endsOn": "2026-11-02"}),
        json!({"status": "done"}),
        json!({"configurationIds": ["nope"]}),
        json!({"testPlanId": "nope"}),
        json!({"title": " "}),
    ] {
        assert!(
            insert_cycle(&c, &cycle_input(&p, bad.clone())).is_err(),
            "{bad}"
        );
    }
    // Update: a field left out keeps its value, an empty text clears it.
    update_cycle(
        &c,
        &a.id,
        &cycle_input(&p, json!({"build": "", "status": "active"})),
    )
    .unwrap();
    let a2 = get_cycle(&c, &a.id, U).unwrap().unwrap();
    assert_eq!(
        (
            a2.build,
            a2.environment.as_deref(),
            a2.status.as_str(),
            a2.revision
        ),
        (None, Some("staging"), "active", 2)
    );
    assert_eq!(list_cycles(&c, &p, U).unwrap().len(), 2);
    assert!(list_cycles(&c, &p, "someone-else").unwrap().is_empty());
}

#[test]
fn items_are_static_skip_repeats_and_warn_about_cases_not_approved() {
    let c = device();
    let (p, case, _, _, cycle) = setup(&c);
    let approved = new_case(&c, &p, json!({"status": "approved"}));
    let out = add_items(&c, &cycle, U, &[item(&case), item(&approved), item(&case)]).unwrap();
    assert_eq!(out.added.len(), 1);
    assert_eq!(out.skipped, 2);
    assert!(out.not_approved.is_empty());
    let draft = new_case(&c, &p, json!({}));
    let out = add_items(&c, &cycle, U, &[item(&draft)]).unwrap();
    let key: String = c
        .query_row(
            "SELECT scenario_id FROM test_cases WHERE id = ?1",
            [&draft],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(out.not_approved, vec![key]);
    let items = list_items(&c, &cycle, U).unwrap();
    assert_eq!(items.len(), 3);
    assert_eq!(items[0].case_title, "Pay");
    // A flow or row the case does not have, or a case of another project.
    let mut bad = item(&case);
    bad.flow_id = Some("nope".into());
    assert!(add_items(&c, &cycle, U, &[bad]).is_err());
    let other = new_project(&c);
    let foreign = new_case(&c, &other, json!({}));
    assert!(add_items(&c, &cycle, U, &[item(&foreign)]).is_err());
    // One audit event per addition, one oplog row per item.
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM audit_log WHERE entity = 'test_cycle' AND summary LIKE '%itemsAdded%'"
        ),
        3
    );
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM oplog WHERE entity = 'test_cycle_item'"
        ),
        3
    );
    // Assignee, reorder, remove.
    let input = CycleItemUpdate {
        assignee: Some("Ada".into()),
        user_id: U.into(),
    };
    update_item(&c, &items[2].id, &input).unwrap();
    reorder_items(&c, &cycle, std::slice::from_ref(&items[2].id), U).unwrap();
    let now = list_items(&c, &cycle, U).unwrap();
    assert_eq!(now[0].id, items[2].id);
    assert_eq!(now[0].assignee.as_deref(), Some("Ada"));
    assert_eq!(
        remove_items(&c, &cycle, std::slice::from_ref(&items[0].id), U).unwrap(),
        1
    );
    assert_eq!(list_items(&c, &cycle, U).unwrap().len(), 2);
    // A closed cycle takes no items until reopened.
    update_cycle(&c, &cycle, &cycle_input(&p, json!({"status": "closed"}))).unwrap();
    assert_eq!(
        add_items(&c, &cycle, U, &[item(&approved)]).unwrap_err(),
        "cycle-closed"
    );
    assert_eq!(
        execute(&c, &cycle, &exec(None)).unwrap_err(),
        "cycle-closed"
    );
}

#[test]
fn add_by_filter_resolves_once_by_tags_requirements_priority_status_and_risk() {
    let c = device();
    let p = new_project(&c);
    let req = |key: &str| -> String {
        let input: requirement::RequirementInput = serde_json::from_value(
            json!({"projectId": p, "requirementKey": key, "title": key, "userId": U}),
        )
        .unwrap();
        requirement::insert_requirement(&c, &input).unwrap()
    };
    let r1 = req("REQ-001");
    req("REQ-002");
    requirement::set_risk(&c, &r1, Some(4), Some(5), U).unwrap(); // 20
    let smoke = new_case(
        &c,
        &p,
        json!({"priority": "high", "data": {"tags": ["smoke"], "steps": ["a"]}}),
    );
    let risky = new_case(
        &c,
        &p,
        json!({"priority": "low", "data": {"requirementKeys": ["REQ-001"], "steps": ["a"]}}),
    );
    let plain = new_case(
        &c,
        &p,
        json!({"priority": "low", "data": {"requirementKeys": ["REQ-002"], "steps": ["a"]}}),
    );
    let f = |v: Value| -> CycleFilter { serde_json::from_value(v).unwrap() };
    assert_eq!(
        matching_cases(&c, &p, &f(json!({"tags": ["@Smoke"]}))).unwrap(),
        vec![smoke.clone()]
    );
    assert_eq!(
        matching_cases(&c, &p, &f(json!({"minRisk": 13}))).unwrap(),
        vec![risky.clone()]
    );
    assert_eq!(
        matching_cases(
            &c,
            &p,
            &f(json!({"requirementKeys": ["req-002"], "priorities": ["low"]}))
        )
        .unwrap(),
        vec![plain.clone()]
    );
    assert_eq!(matching_cases(&c, &p, &f(json!({}))).unwrap().len(), 3);
    let cycle = insert_cycle(&c, &cycle_input(&p, json!({}))).unwrap();
    let out = add_by_filter(
        &c,
        &cycle,
        U,
        &f(json!({"priorities": ["low"]})),
        Some("Ada"),
    )
    .unwrap();
    assert_eq!(out.added.len(), 2);
    // Static: a case tagged later is not added on its own.
    new_case(&c, &p, json!({"priority": "low"}));
    assert_eq!(list_items(&c, &cycle, U).unwrap().len(), 2);
    assert!(list_items(&c, &cycle, U)
        .unwrap()
        .iter()
        .all(|i| i.assignee.as_deref() == Some("Ada")));
}

#[test]
fn clone_copies_header_configurations_and_items_with_a_new_key() {
    let c = device();
    let (_, _, chrome, firefox, cycle) = setup(&c);
    execute(&c, &cycle, &exec(None)).unwrap();
    let copy = clone_cycle(&c, &cycle, None, U).unwrap();
    let copy = get_cycle(&c, &copy, U).unwrap().unwrap();
    assert_eq!(copy.cycle_key, "CYC-002");
    assert_eq!(copy.title, "Copia de Regression 1.4");
    assert_eq!(copy.status, "planned");
    assert_eq!(copy.configuration_ids, vec![chrome, firefox]);
    assert_eq!(list_items(&c, &copy.id, U).unwrap().len(), 1);
    assert!(cycle_runs_of(&c, &copy.id, U).unwrap().is_empty());
}

// ---- execute, progress ---------------------------------------------------------

fn result(c: &Connection, run_item: &str, status: &str) -> String {
    let input: runs::ResultInput =
        serde_json::from_value(json!({"runItemId": run_item, "status": status, "userId": U}))
            .unwrap();
    runs::record_result(c, &input).unwrap()
}

#[test]
fn executing_a_cycle_creates_one_run_per_configuration_with_frozen_revisions() {
    let c = device();
    let (p, case, chrome, firefox, cycle) = setup(&c);
    let ids = execute(&c, &cycle, &exec(None)).unwrap();
    assert_eq!(ids.len(), 2);
    let runs_now = cycle_runs_of(&c, &cycle, U).unwrap();
    assert_eq!(runs_now.len(), 2);
    let mut configs: Vec<String> = runs_now
        .iter()
        .map(|r| r.configuration_id.clone().unwrap())
        .collect();
    configs.sort();
    let mut want = vec![chrome.clone(), firefox.clone()];
    want.sort();
    assert_eq!(configs, want);
    let run = runs::get_run(&c, &ids[0], U).unwrap().unwrap();
    assert_eq!(run.cycle_id.as_deref(), Some(cycle.as_str()));
    assert!(
        run.title.starts_with("CYC-001 · Regression 1.4 · "),
        "{}",
        run.title
    );
    let frozen = runs::list_items(&c, &ids[0], U).unwrap();
    assert_eq!(frozen.len(), 1);
    assert_eq!(frozen[0].configuration_id, run.configuration_id);
    // Editing the case afterwards does not move the frozen revision; the next
    // execution freezes the new one (ADR-0017 decision 3).
    let input: test_case::TestCaseInput = serde_json::from_value(json!({
        "projectId": p, "title": "Pay v2", "author": "Ada", "userId": U,
        "data": {"steps": ["open", "pay", "receipt"]}
    }))
    .unwrap();
    test_case::update_case(&c, &case, &input).unwrap();
    assert_eq!(
        runs::list_items(&c, &ids[0], U).unwrap()[0].test_case_revision_id,
        frozen[0].test_case_revision_id
    );
    let again = execute(&c, &cycle, &exec(Some(vec![chrome.clone()]))).unwrap();
    assert_eq!(again.len(), 1);
    assert_ne!(
        runs::list_items(&c, &again[0], U).unwrap()[0].test_case_revision_id,
        frozen[0].test_case_revision_id
    );
    assert_eq!(get_cycle(&c, &cycle, U).unwrap().unwrap().status, "active");
    // A configuration outside the cycle; an archived one is skipped.
    let other = config(&c, &p, "Safari", &["webkit"]);
    assert!(execute(&c, &cycle, &exec(Some(vec![other]))).is_err());
    set_configuration_archived(&c, &firefox, true, U).unwrap();
    assert_eq!(execute(&c, &cycle, &exec(None)).unwrap().len(), 1);
}

#[test]
fn execute_is_all_or_nothing_and_needs_items() {
    let c = device();
    let p = new_project(&c);
    let empty = insert_cycle(&c, &cycle_input(&p, json!({}))).unwrap();
    assert_eq!(execute(&c, &empty, &exec(None)).unwrap_err(), "cycle-empty");
    // A case with an open key conflict cannot be frozen: no run at all.
    let ok = new_case(&c, &p, json!({}));
    let blocked = new_case(&c, &p, json!({}));
    let cycle = insert_cycle(&c, &cycle_input(&p, json!({}))).unwrap();
    add_items(&c, &cycle, U, &[item(&ok), item(&blocked)]).unwrap();
    c.execute(
        "INSERT INTO key_conflicts (id, user_id, entity, entity_id, project_id, lost_key, detected_at)
         VALUES ('k', ?1, 'test_case', ?2, ?3, 'ATS_009', datetime('now'))",
        rusqlite::params![U, blocked, p],
    )
    .unwrap();
    let res = in_tx(&c, |tx| execute(tx, &cycle, &exec(None)));
    assert!(res.unwrap_err().starts_with("case-key-conflict"));
    assert_eq!(count(&c, "SELECT count(*) FROM runs"), 0);
    // Without configurations: one run without one.
    c.execute("DELETE FROM key_conflicts", []).unwrap();
    let ids = execute(&c, &cycle, &exec(None)).unwrap();
    assert_eq!(ids.len(), 1);
    assert_eq!(
        runs::get_run(&c, &ids[0], U)
            .unwrap()
            .unwrap()
            .configuration_id,
        None
    );
}

#[test]
fn progress_is_the_latest_final_result_per_item_and_configuration() {
    let c = device();
    let (p, case, chrome, firefox, cycle) = setup(&c);
    let second = new_case(&c, &p, json!({}));
    add_items(&c, &cycle, U, &[item(&second)]).unwrap();
    let empty = cycle_progress(&c, &cycle, U).unwrap().unwrap();
    assert_eq!(empty.cells.len(), 4);
    assert!(empty.cells.iter().all(|x| x.status == "not_run"));
    assert_eq!((empty.summary.total, empty.summary.executed), (4, 0));
    let ids = execute(&c, &cycle, &exec(None)).unwrap();
    for id in &ids {
        let run = runs::get_run(&c, id, U).unwrap().unwrap();
        let items = runs::list_items(&c, id, U).unwrap();
        let first = items.iter().find(|i| i.test_case_id == case).unwrap();
        if run.configuration_id.as_deref() == Some(chrome.as_str()) {
            result(&c, &first.id, "failed");
            result(&c, &first.id, "passed");
        } else {
            result(&c, &first.id, "blocked");
        }
    }
    let progress = cycle_progress(&c, &cycle, U).unwrap().unwrap();
    let items = list_items(&c, &cycle, U).unwrap();
    let cell = |item: &str, cfg: &str| {
        progress
            .cells
            .iter()
            .find(|x| x.item_id == item && x.configuration_id.as_deref() == Some(cfg))
            .unwrap()
            .status
            .clone()
    };
    let first = items.iter().find(|i| i.test_case_id == case).unwrap();
    let other = items.iter().find(|i| i.test_case_id == second).unwrap();
    assert_eq!(cell(&first.id, &chrome), "passed");
    assert_eq!(cell(&first.id, &firefox), "blocked");
    assert_eq!(cell(&other.id, &chrome), "not_run");
    assert_eq!(
        (
            progress.summary.executed,
            progress.summary.passed,
            progress.summary.not_run
        ),
        (2, 1, 2)
    );
    let chrome_col = progress
        .by_configuration
        .iter()
        .find(|b| b.configuration_id.as_deref() == Some(chrome.as_str()))
        .unwrap();
    assert_eq!(
        (chrome_col.summary.total, chrome_col.summary.passed),
        (2, 1)
    );
    // The list carries the same summary.
    let listed = list_cycles(&c, &p, U).unwrap();
    assert_eq!(listed[0].progress, progress.summary);
    assert_eq!((listed[0].items, listed[0].runs), (2, 2));
}

#[test]
fn import_hooks_find_the_configuration_and_the_most_specific_item() {
    let c = device();
    let (p, case, chrome, _, cycle) = setup(&c);
    assert_eq!(
        match_configuration(&c, &p, "Desktop Chrome")
            .unwrap()
            .as_deref(),
        Some(chrome.as_str())
    );
    let whole = list_items(&c, &cycle, U).unwrap()[0].id.clone();
    assert_eq!(
        item_for(&c, &cycle, &case, Some("f1"), Some("r1"))
            .unwrap()
            .as_deref(),
        Some(whole.as_str())
    );
    assert_eq!(
        item_for(&c, &cycle, "other-case", None, None).unwrap(),
        None
    );
}

#[test]
fn a_run_links_only_to_a_live_open_cycle_and_a_configuration_of_its_project() {
    let c = device();
    let (p, _, chrome, _, cycle) = setup(&c);
    let run = |extra: Value| -> runs::RunInput {
        let mut v = json!({"projectId": p, "title": "CI", "userId": U});
        if let (Value::Object(m), Value::Object(e)) = (&mut v, extra) {
            m.extend(e);
        }
        serde_json::from_value(v).unwrap()
    };
    let id = runs::insert_run(
        &c,
        &run(json!({"cycleId": cycle, "configurationId": chrome})),
    )
    .unwrap();
    assert!(runs::insert_run(&c, &run(json!({"cycleId": "nope"}))).is_err());
    assert!(runs::insert_run(&c, &run(json!({"configurationId": "nope"}))).is_err());
    // A run keeps the id of a cycle deleted (and purged) since: editing it
    // still works, and nothing fails on read.
    delete_cycle(&c, &cycle, U).unwrap();
    c.execute("DELETE FROM test_cycles", []).unwrap();
    runs::update_run(&c, &id, &run(json!({"build": "2"}))).unwrap();
    let r = runs::get_run(&c, &id, U).unwrap().unwrap();
    assert_eq!(r.cycle_id.as_deref(), Some(cycle.as_str()));
    assert!(cycle_runs_of(&c, &cycle, U).unwrap().is_empty());
    assert!(cycle_progress(&c, &cycle, U).unwrap().is_none());
    assert!(runs::update_run(&c, &id, &run(json!({"cycleId": "other"}))).is_err());
}

// ---- delete, purge ------------------------------------------------------------------

#[test]
fn deleting_a_cycle_keeps_its_runs_and_the_purge_retires_its_key() {
    let c = device();
    let (p, _, _, _, cycle) = setup(&c);
    let ids = execute(&c, &cycle, &exec(None)).unwrap();
    delete_cycle(&c, &cycle, U).unwrap();
    assert!(get_cycle(&c, &cycle, U).unwrap().is_none());
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM test_cycle_items WHERE deleted_at IS NULL"
        ),
        0
    );
    assert_eq!(runs::list_runs(&c, &p, U).unwrap().len(), ids.len());
    c.execute("UPDATE oplog SET synced_at = datetime('now')", [])
        .unwrap();
    c.execute(
        "UPDATE test_cycles SET deleted_at = '2000-01-01 00:00:00'",
        [],
    )
    .unwrap();
    c.execute(
        "UPDATE test_cycle_items SET deleted_at = '2000-01-01 00:00:00'",
        [],
    )
    .unwrap();
    let summary = purge::purge(&c, U, 30).unwrap();
    assert_eq!(summary.cycles, 2);
    assert_eq!(count(&c, "SELECT count(*) FROM test_cycles"), 0);
    assert_eq!(
        count(
            &c,
            "SELECT count(*) FROM retired_keys WHERE kind = 'cycle' AND key = 'CYC-001'"
        ),
        1
    );
    // The runs keep the dangling id and still list.
    assert_eq!(runs::list_runs(&c, &p, U).unwrap().len(), ids.len());
    // The key is never handed out again (the project is known to the server
    // now: numbers come from a leased block).
    keys::store_block(&c, KeyKind::Cycle, &p, 1, 50).unwrap();
    let next = insert_cycle(&c, &cycle_input(&p, json!({}))).unwrap();
    assert_eq!(
        get_cycle(&c, &next, U).unwrap().unwrap().cycle_key,
        "CYC-002"
    );
}

#[test]
fn a_project_delete_takes_its_configurations_cycles_and_items() {
    let c = device();
    let (p, _, _, _, cycle) = setup(&c);
    project::delete_project(&c, &p, U).unwrap();
    for t in ["configurations", "test_cycles", "test_cycle_items"] {
        assert_eq!(
            count(
                &c,
                &format!("SELECT count(*) FROM {t} WHERE deleted_at IS NULL")
            ),
            0,
            "{t}"
        );
    }
    assert!(get_cycle(&c, &cycle, U).unwrap().is_none());
    let summary: String = c
        .query_row(
            "SELECT summary FROM audit_log WHERE entity = 'project' AND action = 'delete'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(summary.contains("\"test_cycles\":1"), "{summary}");
}

// ---- sync between devices ----------------------------------------------------

fn as_doc(d: &Value) -> sync::RemoteDoc {
    serde_json::from_value(json!({
        "entity": d["entity"], "entityId": d["entityId"], "payload": d["payload"],
        "revision": if d["op"] == "append" { json!(1) } else { d["revision"].clone() },
        "hlc": d["hlc"], "deleted": d["op"] == "delete",
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
fn a_cycle_its_items_and_configurations_travel_to_another_device() {
    let a = device();
    let (p, _, chrome, _, cycle) = setup(&a);
    let docs = push(&a);
    for e in ["configuration", "test_cycle", "test_cycle_item"] {
        assert!(entities(&docs).contains(&e.to_string()), "{e}");
    }
    let b = device();
    pull(&b, &docs);
    let got = get_cycle(&b, &cycle, U).unwrap().unwrap();
    let mine = get_cycle(&a, &cycle, U).unwrap().unwrap();
    assert_eq!(got.cycle_key, mine.cycle_key);
    assert_eq!(got.configuration_ids, mine.configuration_ids);
    assert_eq!(list_items(&b, &cycle, U).unwrap().len(), 1);
    let cfg = list_configurations(&b, &p, U, false).unwrap();
    assert_eq!(
        cfg.iter().find(|x| x.id == chrome).unwrap().match_labels,
        vec!["chromium", "Desktop Chrome"]
    );
    // Round trip: B's payloads equal A's.
    for e in ENTITIES {
        let table = table_for(e).unwrap();
        let mut stmt = a.prepare(&format!("SELECT id FROM {table}")).unwrap();
        let ids: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        for id in ids {
            let strip = |v: Value| {
                let mut v = v;
                for k in ["createdAt", "updatedAt", "workspaceId"] {
                    v.as_object_mut().unwrap().remove(k);
                }
                v
            };
            let x = read_payload(&a, e, &id).unwrap().unwrap().0;
            let y = read_payload(&b, e, &id).unwrap().unwrap().0;
            assert_eq!(strip(x), strip(y), "{e}");
        }
    }
    // Executed on B: its runs point at the cycle on A too.
    execute(&b, &cycle, &exec(None)).unwrap();
    pull(&a, &push(&b));
    assert_eq!(cycle_runs_of(&a, &cycle, U).unwrap().len(), 2);
}

#[test]
fn two_devices_adding_different_cases_to_one_cycle_do_not_conflict() {
    let a = device();
    let (p, _, _, _, cycle) = setup(&a);
    let b = device();
    pull(&b, &push(&a));
    let ca = new_case(&a, &p, json!({}));
    add_items(&a, &cycle, U, &[item(&ca)]).unwrap();
    let pulled_case = push(&a);
    pull(&b, &pulled_case);
    let cb = new_case(&b, &p, json!({}));
    add_items(&b, &cycle, U, &[item(&cb)]).unwrap();
    pull(&a, &push(&b));
    for dev in [&a, &b] {
        assert_eq!(list_items(dev, &cycle, U).unwrap().len(), 3);
        assert_eq!(
            count(
                dev,
                "SELECT count(*) FROM sync_conflicts WHERE resolved_at IS NULL"
            ),
            0
        );
    }
}

#[test]
fn an_item_pulled_before_its_cycle_is_kept() {
    let a = device();
    let (_, _, _, _, cycle) = setup(&a);
    let docs = push(&a);
    let b = device();
    // Items first, then the rest.
    let (items, rest): (Vec<Value>, Vec<Value>) = docs
        .into_iter()
        .partition(|d| d["entity"] == "test_cycle_item");
    pull(&b, &items);
    assert_eq!(count(&b, "SELECT count(*) FROM test_cycle_items"), 1);
    pull(&b, &rest);
    assert_eq!(list_items(&b, &cycle, U).unwrap().len(), 1);
}

#[test]
fn a_pulled_cycle_with_an_unknown_status_or_a_clashing_key_never_fails_the_pull() {
    let (a, b) = (device(), device());
    let p = new_project(&a);
    pull(&b, &push(&a));
    for dev in [&a, &b] {
        keys::store_block(dev, KeyKind::Cycle, &p, 1, 50).unwrap();
    }
    let ca = insert_cycle(&a, &cycle_input(&p, json!({}))).unwrap();
    let cb = insert_cycle(&b, &cycle_input(&p, json!({}))).unwrap();
    let mut docs = push(&a);
    for d in &mut docs {
        if d["entity"] == "test_cycle" {
            d["payload"]["status"] = json!("archived-in-0.9");
        }
    }
    pull(&b, &docs);
    let got = get_cycle(&b, &ca, U).unwrap().unwrap();
    assert_eq!(
        (got.cycle_key.as_str(), got.status.as_str()),
        ("CYC-001", "planned")
    );
    let local = get_cycle(&b, &cb, U).unwrap().unwrap().cycle_key;
    assert!(keys::is_provisional(&local), "{local}");
    assert_eq!(
        count(
            &b,
            "SELECT count(*) FROM key_conflicts WHERE entity = 'test_cycle' AND resolved_at IS NULL"
        ),
        1
    );
}

#[test]
fn nothing_of_it_reaches_a_server_without_cycles() {
    let c = Connection::open_in_memory().unwrap();
    run_migrations(&c).unwrap();
    sync::assume_server_features(
        &c,
        "key-conflicts,append-only,stable-steps,runs,custom-fields",
    );
    let (p, _, _, _, _) = setup(&c);
    let docs = push(&c);
    assert!(
        entities(&docs)
            .iter()
            .all(|e| !ENTITIES.contains(&e.as_str())),
        "{:?}",
        entities(&docs)
    );
    assert_eq!(held_back(&c).unwrap(), 4); // two configurations, the cycle, its item
    let requests = crate::key_sync::lease_requests(&c, U).unwrap();
    assert!(requests.iter().all(|r| r.kind != "cycle"));
    sync::assume_server_features(
        &c,
        "key-conflicts,append-only,stable-steps,runs,custom-fields,cycles",
    );
    let docs = push(&c);
    for e in ENTITIES {
        assert!(entities(&docs).contains(&e.to_string()), "{e}");
    }
    assert_eq!(held_back(&c).unwrap(), 0);
    let requests = crate::key_sync::lease_requests(&c, U).unwrap();
    assert!(requests
        .iter()
        .any(|r| r.kind == "cycle" && r.project_id == p));
}

#[test]
fn a_cursor_stored_before_the_cycle_entities_restarts_at_zero() {
    let c = device();
    sync::cursor_set(&c, U, "42").unwrap();
    c.execute(
        "UPDATE sync_state SET value = '4' WHERE key = ?1",
        [format!("cursor_set:{U}")],
    )
    .unwrap();
    assert_eq!(sync::cursor_get(&c, U).unwrap(), "0");
    let _ = oplog::SYNCED;
}
