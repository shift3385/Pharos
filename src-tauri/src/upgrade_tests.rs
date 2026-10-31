//! Upgrade tests (BASE-04, VERSIONING §6): a database written by the previous
//! release must open with HEAD without losing anything. The fixture under
//! `tests/fixtures/0.1.0-alpha.1/` was written by the real 0.1.0-alpha.1 code
//! (see its README); this module also covers the data migrations 0015 (FIX-06),
//! the key counters of 0016 (DAT-01) and the stable steps of 0021 (DAT-02).

use std::fs;
use std::path::PathBuf;

use rusqlite::types::Value;
use rusqlite::{params, Connection};

use super::*;

const FIXTURE: &[u8] = include_bytes!("../tests/fixtures/0.1.0-alpha.1/pharos.db.enc");
/// Test-only key the fixture was encrypted with (see the generator).
const FIXTURE_KEY: [u8; 32] = [0x5A; 32];
const USER_1: &str = "11111111-1111-4111-8111-111111111111";
const USER_2: &str = "22222222-2222-4222-8222-222222222222";

/// Columns a migration is allowed to rewrite: the audit fields FIX-06 repairs.
fn repaired(table: &str, column: &str) -> bool {
    match table {
        "projects" | "test_plans" | "test_cases" => matches!(column, "created_by" | "updated_by"),
        "test_plan_revisions" | "test_case_revisions" => column == "created_by",
        _ => false,
    }
}

fn temp_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pharos-upgrade-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    dir
}

/// The fixture as alpha.1 left it, without running any migration.
fn fixture_image() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    load_image(&mut conn, &decrypt(&FIXTURE_KEY, FIXTURE).unwrap()).unwrap();
    conn
}

fn tables(conn: &Connection) -> Vec<String> {
    let mut stmt = conn
        .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' \
             AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .unwrap();
    let names = stmt.query_map([], |r| r.get(0)).unwrap();
    names.collect::<rusqlite::Result<_>>().unwrap()
}

fn columns(conn: &Connection, table: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .unwrap();
    let names = stmt.query_map([], |r| r.get::<_, String>(1)).unwrap();
    names.collect::<rusqlite::Result<_>>().unwrap()
}

/// Every row of `table` (by rowid), restricted to `cols`.
fn rows(conn: &Connection, table: &str, cols: &[String]) -> Vec<(i64, Vec<Value>)> {
    let sql = format!(
        "SELECT rowid, {} FROM {table} ORDER BY rowid",
        cols.join(", ")
    );
    let mut stmt = conn.prepare(&sql).unwrap();
    let rows = stmt
        .query_map([], |r| {
            let values = (1..=cols.len())
                .map(|i| r.get::<_, Value>(i))
                .collect::<rusqlite::Result<_>>()?;
            Ok((r.get(0)?, values))
        })
        .unwrap();
    rows.collect::<rusqlite::Result<_>>().unwrap()
}

fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap()
}

/// Tables an upgrade may only append to: the migration record, the revision
/// rows of 0021 (one per case) and the oplog rows that push them.
const GROWS: [&str; 3] = ["schema_migrations", "test_case_revisions", "oplog"];

/// JSON columns 0021 rewrites into the stable-steps shape (DAT-02).
fn stable_steps_column(table: &str, column: &str) -> bool {
    matches!(
        (table, column),
        ("test_cases", "data") | ("sync_conflicts", "local_payload" | "remote_payload")
    )
}

fn text(v: &Value) -> String {
    match v {
        Value::Text(s) => s.clone(),
        other => panic!("not text: {other:?}"),
    }
}

fn json_of(v: &Value) -> serde_json::Value {
    serde_json::from_str(&text(v)).unwrap()
}

/// Every string of a JSON value.
fn strings(v: &serde_json::Value, out: &mut Vec<String>) {
    match v {
        serde_json::Value::String(s) => out.push(s.clone()),
        serde_json::Value::Array(items) => items.iter().for_each(|i| strings(i, out)),
        serde_json::Value::Object(map) => map.values().for_each(|i| strings(i, out)),
        _ => {}
    }
}

/// 0021 rewrote `old` (a case `data` or a conflict payload) into `new`:
/// exactly the deterministic normalization, and not a character lost. Every
/// old string is still a string of the new value, or inside the canonical
/// JSON text of an element that had no text of its own.
fn assert_stable_rewrite(
    table: &str,
    case_id: &str,
    old: &serde_json::Value,
    new: &serde_json::Value,
) {
    let mut expected = old.clone();
    if table == "test_cases" {
        crate::steps::normalize_case_data(case_id, &mut expected);
    } else {
        crate::revisions::normalize_payload(case_id, &mut expected);
    }
    assert_eq!(new, &expected, "{table} of {case_id}");
    let (mut before, mut after) = (Vec::new(), Vec::new());
    strings(old, &mut before);
    strings(new, &mut after);
    for s in before {
        let escaped = serde_json::to_string(&s).unwrap();
        let inner = &escaped[1..escaped.len() - 1];
        assert!(
            after.iter().any(|a| a == &s || a.contains(inner)),
            "{table} of {case_id} lost {s:?}"
        );
    }
}

/// Compares every table of `old` with `new` after an upgrade: rows keep their
/// values, except the audit fields of FIX-06 (`repaired`, when `repairs`) and
/// the stable-steps rewrite of 0021; the tables in `GROWS` only gain rows.
fn assert_rows_kept(old: &Connection, new: &Connection, repairs: bool) {
    let mut rewritten = 0;
    for table in tables(old) {
        let cols = columns(old, &table);
        let before = rows(old, &table, &cols);
        let after = rows(new, &table, &cols);
        if GROWS.contains(&table.as_str()) {
            assert!(after.len() >= before.len(), "{table} lost rows");
        } else {
            assert_eq!(after.len(), before.len(), "row count of {table}");
        }
        let case_col = cols
            .iter()
            .position(|c| c == "entity_id")
            .or_else(|| cols.iter().position(|c| c == "id"));
        for ((rowid, old_values), (new_rowid, new_values)) in before.iter().zip(&after) {
            assert_eq!(rowid, new_rowid, "{table}");
            for (i, col) in cols.iter().enumerate() {
                if repairs && repaired(&table, col) {
                    continue;
                }
                if stable_steps_column(&table, col) && old_values[i] != new_values[i] {
                    let case_id = text(&old_values[case_col.unwrap()]);
                    assert_stable_rewrite(
                        &table,
                        &case_id,
                        &json_of(&old_values[i]),
                        &json_of(&new_values[i]),
                    );
                    rewritten += 1;
                    continue;
                }
                // The clock only moves forward: 0021 stamps the revision rows.
                if table == "sync_state"
                    && col == "value"
                    && old_values[0] == Value::Text("hlc_last".into())
                {
                    assert!(
                        text(&new_values[i]) >= text(&old_values[i]),
                        "the HLC went back"
                    );
                    continue;
                }
                assert_eq!(old_values[i], new_values[i], "{table}.{col} of row {rowid}");
            }
        }
    }
    assert!(rewritten > 0, "the fixture has steps to migrate");
}

/// Every step and row id of a case data, in visiting order.
fn step_ids(data: &serde_json::Value) -> Vec<String> {
    let mut ids = Vec::new();
    let mut list = |v: &serde_json::Value| {
        for el in v.as_array().into_iter().flatten() {
            ids.push(
                el["id"]
                    .as_str()
                    .expect("every step and row has an id")
                    .to_string(),
            );
        }
    };
    for key in ["preconditions", "background", "steps"] {
        list(&data[key]);
    }
    list(&data["examples"]["rows"]);
    for flow in data["flows"].as_array().into_iter().flatten() {
        list(&flow["preconditions"]);
        list(&flow["steps"]);
        list(&flow["examples"]["rows"]);
    }
    ids
}

type Snapshot = Vec<(String, Vec<(i64, Vec<Value>)>)>;

fn snapshot(c: &Connection) -> Snapshot {
    tables(c)
        .into_iter()
        .map(|t| {
            let cols = columns(c, &t);
            let r = rows(c, &t, &cols);
            (t, r)
        })
        .collect()
}

/// The state 0021 leaves (DAT-02): every case, deleted ones too, has stable
/// unique ids and the row of its current revision; live cases with an owner
/// have that row queued for the push; running the step again changes nothing.
fn assert_stable_steps(new: &Connection) {
    let cases: Vec<(String, String, bool, bool)> = new
        .prepare(
            "SELECT c.id, c.data, c.deleted_at IS NULL, p.owner_id IS NOT NULL
               FROM test_cases c LEFT JOIN projects p ON p.id = c.project_id ORDER BY c.id",
        )
        .unwrap()
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap();
    assert!(!cases.is_empty());
    for (id, data, live, owned) in &cases {
        let mut data: serde_json::Value = serde_json::from_str(data).unwrap();
        assert!(
            !crate::steps::normalize_case_data(id, &mut data),
            "{id} is stable"
        );
        let ids = step_ids(&data);
        let unique: std::collections::HashSet<&String> = ids.iter().collect();
        assert_eq!(unique.len(), ids.len(), "ids of {id} are unique");
        let (rev_id, sha) = crate::revisions::current_id(new, id).unwrap().unwrap();
        let stored: String = new
            .query_row(
                "SELECT content_sha256 FROM test_case_revisions WHERE id = ?1",
                [&rev_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(stored, sha, "current revision of {id}");
        let queued = count(
            new,
            &format!(
                "SELECT count(*) FROM oplog WHERE entity = 'test_case_revision'                  AND entity_id = '{rev_id}' AND user_id <> ''"
            ),
        );
        assert_eq!(
            queued,
            i64::from(*live && *owned),
            "push of the revision of {id}"
        );
    }
    assert_eq!(
        count(
            new,
            "SELECT count(*) FROM test_case_revisions WHERE content_sha256 IS NOT NULL"
        ),
        cases.len() as i64,
        "one current row per case, no other hashed row"
    );
    // Idempotent: a second run changes no row anywhere.
    let before = snapshot(new);
    crate::revisions::migrate_stable_steps(new).unwrap();
    assert_eq!(snapshot(new), before);
}

#[test]
fn the_fixture_really_is_an_alpha_1_database() {
    let old = fixture_image();
    let applied = applied_migrations(&old).unwrap();
    assert_eq!(applied.len(), 11);
    assert_eq!(
        applied.last().map(String::as_str),
        Some("0011_sync_conflicts.sql")
    );
    // It carries the FIX-06 bug it is meant to exercise…
    assert!(count(&old, "SELECT count(*) FROM projects WHERE created_by = id") > 0);
    assert!(
        count(
            &old,
            "SELECT count(*) FROM test_cases WHERE created_by = id"
        ) > 0
    );
    assert!(
        count(
            &old,
            "SELECT count(*) FROM test_cases WHERE created_by = author"
        ) > 0
    );
    assert!(
        count(
            &old,
            "SELECT count(*) FROM test_case_revisions WHERE created_by = test_case_id"
        ) > 0
    );
    // …and data in every table a user can fill.
    for table in [
        "profiles",
        "projects",
        "test_plans",
        "test_plan_revisions",
        "test_cases",
        "test_case_revisions",
        "requirements",
        "planner_cards",
        "planner_attachments",
        "templates",
        "oplog",
        "sync_state",
        "sync_base",
        "sync_conflicts",
    ] {
        assert!(
            count(&old, &format!("SELECT count(*) FROM {table}")) > 0,
            "{table} is empty"
        );
    }
}

#[test]
fn opening_the_alpha_1_fixture_with_head_keeps_every_row() {
    let dir = temp_dir();
    fs::write(dir.join("pharos.db.enc"), FIXTURE).unwrap();
    let old = fixture_image();

    let db = Db::open_with_key(&dir, FIXTURE_KEY).unwrap();

    // SEC-06: the untouched alpha.1 file was kept before migrating.
    let backup = dir.join(format!(
        "pharos.db.enc.bak-{APP_VERSION}-0011_sync_conflicts"
    ));
    assert_eq!(fs::read(&backup).unwrap(), FIXTURE);

    db.with_conn(|new| {
        assert_eq!(pending_migrations(new)?.len(), 0);
        assert_rows_kept(&old, new, true);
        assert_stable_steps(new);

        // FIX-06: every audit field now names the owner of the row's project.
        for sql in [
            "SELECT count(*) FROM projects WHERE created_by <> owner_id OR updated_by <> owner_id",
            "SELECT count(*) FROM test_plans t JOIN projects p ON p.id = t.project_id \
             WHERE t.created_by <> p.owner_id OR t.updated_by <> p.owner_id",
            "SELECT count(*) FROM test_cases c JOIN projects p ON p.id = c.project_id \
             WHERE c.created_by <> p.owner_id OR c.updated_by <> p.owner_id",
            "SELECT count(*) FROM test_plan_revisions r JOIN test_plans t ON t.id = r.test_plan_id \
             JOIN projects p ON p.id = t.project_id WHERE r.created_by <> p.owner_id",
            "SELECT count(*) FROM test_case_revisions r JOIN test_cases c ON c.id = r.test_case_id \
             JOIN projects p ON p.id = c.project_id WHERE r.created_by <> p.owner_id",
        ] {
            assert_eq!(count(new, sql), 0, "{sql}");
        }
        let owners: Vec<String> = new
            .prepare("SELECT DISTINCT created_by FROM test_cases ORDER BY 1")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(owners, vec![USER_1, USER_2]);

        // DAT-01: the next case key skips ATS_003 (deleted) and ATS_004 (pulled).
        let project_1: String = new
            .query_row(
                "SELECT id FROM projects WHERE owner_id = ?1",
                params![USER_1],
                |r| r.get(0),
            )
            .unwrap();
        // The project is known to the server, so it numbers from a leased block.
        crate::keys::store_block(new, crate::keys::KeyKind::Case, &project_1, 1, 50)?;
        let key = crate::keys::allocate(new, crate::keys::KeyKind::Case, &project_1, "ATS_", 3)?;
        assert_eq!(key, "ATS_005");
        Ok(())
    })
    .unwrap();
    drop(db);

    // The migrated file was saved: reopening migrates nothing and keeps one backup.
    let db = Db::open_with_key(&dir, FIXTURE_KEY).unwrap();
    assert_eq!(db.with_conn(pending_migrations).unwrap().len(), 0);
    assert_eq!(fs::read_dir(&dir).unwrap().count(), 2);
    fs::remove_dir_all(&dir).unwrap();
}

/// Values of `field` in the JSON the UI receives for `items`.
fn field_of<T: serde::Serialize>(items: &[T], field: &str) -> Vec<String> {
    items
        .iter()
        .map(|i| {
            serde_json::to_value(i).unwrap()[field]
                .as_str()
                .unwrap_or_default()
                .to_string()
        })
        .collect()
}

#[test]
fn the_migrated_fixture_reads_back_through_the_owner_scoped_commands() {
    let dir = temp_dir();
    fs::write(dir.join("pharos.db.enc"), FIXTURE).unwrap();
    let db = Db::open_with_key(&dir, FIXTURE_KEY).unwrap();
    db.with_conn(|c| {
        let project_of = |owner: &str| -> String {
            c.query_row(
                "SELECT id FROM projects WHERE owner_id = ?1",
                params![owner],
                |r| r.get(0),
            )
            .unwrap()
        };
        let (p1, p2) = (project_of(USER_1), project_of(USER_2));

        // Cases: the owner sees its live ones (incl. the pulled ATS_004), nobody else does.
        let cases = crate::test_case::list_cases(c, &p1, USER_1)?;
        assert_eq!(
            field_of(&cases, "scenarioId"),
            vec!["ATS_001", "ATS_002", "ATS_004"]
        );
        assert!(crate::test_case::list_cases(c, &p1, USER_2)?.is_empty());
        assert_eq!(crate::test_case::list_cases(c, &p2, USER_2)?.len(), 1);

        // Requirements: REQ-001 live, REQ-002 deleted.
        let reqs = crate::requirement::list_requirements(c, &p1, USER_1)?;
        assert_eq!(field_of(&reqs, "requirementKey"), vec!["REQ-001"]);
        assert!(crate::requirement::list_requirements(c, &p1, USER_2)?.is_empty());

        // Plans: one per user, each visible only to its owner.
        assert_eq!(
            field_of(&crate::test_plan::list_plans(c, USER_1)?, "title"),
            vec!["Plan checkout v2"]
        );
        assert_eq!(
            field_of(&crate::test_plan::list_plans(c, USER_2)?, "title"),
            vec!["Plan billing"]
        );
        assert!(crate::test_plan::get_plan_by_project(c, &p1, USER_2)?.is_none());

        // Planner: the defect keeps DEF-001 and its attachment, for its owner only.
        let cards = crate::planner::list_cards(c, &p1, USER_1)?;
        assert_eq!(cards.len(), 2);
        let defect = cards
            .iter()
            .map(|card| serde_json::to_value(card).unwrap())
            .find(|v| v["kind"] == "defect")
            .unwrap();
        assert_eq!(defect["cardKey"], "DEF-001");
        let defect_id = defect["id"].as_str().unwrap();
        let files = crate::planner::list_attachments(c, defect_id, USER_1)?;
        assert_eq!(field_of(&files, "name"), vec!["log.txt"]);
        assert!(crate::planner::list_attachments(c, defect_id, USER_2)?.is_empty());
        assert!(crate::planner::list_cards(c, &p1, USER_2)?.is_empty());
        Ok(())
    })
    .unwrap();
    drop(db);
    fs::remove_dir_all(&dir).unwrap();
}

/// Applies the migrations up to and including `last`, as an older build would.
fn migrate_until(conn: &Connection, last: &str) {
    conn.execute_batch(
        "CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, \
         applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
    )
    .unwrap();
    for (name, sql) in MIGRATIONS {
        conn.execute_batch(sql).unwrap();
        conn.execute("INSERT INTO schema_migrations (name) VALUES (?1)", [name])
            .unwrap();
        if *name == last {
            return;
        }
    }
}

#[test]
fn audit_repair_leaves_rows_without_a_known_owner_alone() {
    let c = Connection::open_in_memory().unwrap();
    migrate_until(&c, "0011_sync_conflicts.sql");
    let ws = ensure_workspace(&c).unwrap();
    c.execute(
        "INSERT INTO test_plans (id, workspace_id, title, author, created_by, updated_by, \
         created_at, updated_at) VALUES ('orphan', ?1, 'T', 'Ada', 'orphan', 'orphan', 'now', 'now')",
        params![ws],
    )
    .unwrap();
    run_migrations(&c).unwrap();
    let by: String = c
        .query_row(
            "SELECT created_by FROM test_plans WHERE id = 'orphan'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(by, "orphan");
}

#[test]
fn an_alpha_1_database_with_duplicate_and_empty_keys_still_opens() {
    // DAT-01: two devices numbered offline before key blocks existed, and
    // pulls that wrote '' keys. Migration 0017 must repair them, not fail on
    // its unique indexes.
    let old = fixture_image();
    let (project, workspace): (String, String) = old
        .query_row(
            "SELECT id, workspace_id FROM projects WHERE owner_id = ?1",
            params![USER_1],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    for (id, key) in [
        ("dup-a", "ATS_900"),
        ("dup-b", "ATS_900"),
        ("empty-a", ""),
        ("empty-b", ""),
    ] {
        old.execute(
            "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, author, \
             created_by, updated_by, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, 't', 'a', 'a', 'a', 'now', 'now')",
            params![id, workspace, project, key],
        )
        .unwrap();
    }
    for id in ["card-a", "card-b"] {
        old.execute(
            "INSERT INTO planner_cards (id, workspace_id, project_id, owner_id, kind, card_key, title, \
             created_by, updated_by, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, 'defect', 'DEF-900', 't', 'a', 'a', 'now', 'now')",
            params![id, workspace, project, USER_1],
        )
        .unwrap();
    }

    run_migrations(&old).unwrap();
    let keys: Vec<String> = old
        .prepare("SELECT scenario_id FROM test_cases WHERE id LIKE 'dup-%' ORDER BY id")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap();
    assert_eq!(keys, ["ATS_900", "ATS_900-dup1"]);
    assert_eq!(
        count(
            &old,
            "SELECT count(*) FROM test_cases WHERE scenario_id = '' AND deleted_at IS NULL"
        ),
        2
    );
    assert_eq!(
        count(
            &old,
            "SELECT count(*) FROM planner_cards WHERE card_key LIKE 'DEF-900%'"
        ),
        2
    );
}

// ---- 0.2.0-alpha.1 (the previous published minor, VERSIONING §6.2) ----------

const FIXTURE_020A1: &[u8] = include_bytes!("../tests/fixtures/0.2.0-alpha.1/pharos.db.enc");

fn fixture_020a1_image() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    load_image(&mut conn, &decrypt(&FIXTURE_KEY, FIXTURE_020A1).unwrap()).unwrap();
    conn
}

/// (entity, entity_id) of every delta an account's next lww push would send.
fn pending_entities(conn: &Connection, user: &str) -> Vec<(String, String)> {
    let pending = serde_json::to_value(crate::sync::build_pending(conn, user).unwrap()).unwrap();
    let mut out: Vec<(String, String)> = pending["deltas"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| {
            (
                d["entity"].as_str().unwrap().into(),
                d["entityId"].as_str().unwrap().into(),
            )
        })
        .collect();
    out.sort();
    out
}

#[test]
fn the_fixture_really_is_a_0_2_0_alpha_1_database() {
    let old = fixture_020a1_image();
    let applied = applied_migrations(&old).unwrap();
    assert_eq!(applied.len(), 17);
    assert_eq!(
        applied.last().map(String::as_str),
        Some("0018_template_owner.sql")
    );
    assert!(!tables(&old).contains(&"audit_log".to_string()));
    for table in [
        "profiles",
        "projects",
        "test_plans",
        "test_plan_revisions",
        "test_cases",
        "test_case_revisions",
        "requirements",
        "planner_cards",
        "planner_attachments",
        "templates",
        "oplog",
        "sync_state",
        "sync_base",
        "sync_conflicts",
        "key_counters",
    ] {
        assert!(
            count(&old, &format!("SELECT count(*) FROM {table}")) > 0,
            "{table} is empty"
        );
    }
    assert!(
        count(
            &old,
            "SELECT count(*) FROM test_cases WHERE scenario_id LIKE '%?%'"
        ) > 0
    );
    assert!(count(&old, "SELECT count(*) FROM oplog WHERE synced_at IS NULL") > 0);
}

#[test]
fn opening_the_0_2_0_alpha_1_fixture_with_head_keeps_every_row_and_starts_the_audit_log() {
    let dir = temp_dir();
    fs::write(dir.join("pharos.db.enc"), FIXTURE_020A1).unwrap();
    let old = fixture_020a1_image();
    // What 0.2.0-alpha.1 would push, measured on a copy: the probe records a
    // server with stable-steps, which `old` must not get.
    let probe = fixture_020a1_image();
    crate::sync::assume_stable_steps_server(&probe);
    let pending_before = (
        pending_entities(&probe, USER_1),
        pending_entities(&probe, USER_2),
    );

    let db = Db::open_with_key(&dir, FIXTURE_KEY).unwrap();

    // SEC-06: the untouched 0.2.0-alpha.1 file was kept before migrating.
    let backup = dir.join(format!(
        "pharos.db.enc.bak-{APP_VERSION}-0018_template_owner"
    ));
    assert_eq!(fs::read(&backup).unwrap(), FIXTURE_020A1);

    db.with_conn(|new| {
        assert_eq!(pending_migrations(new)?.len(), 0);
        // Nothing changes but the stable-steps rewrite of 0021 and its rows.
        assert_rows_kept(&old, new, false);
        assert_stable_steps(new);
        // Until the server lists stable-steps, the pending cases wait (DAT-02).
        assert!(
            crate::sync::held_back_cases(new)? > 0,
            "the fixture has pending cases"
        );
        assert!(pending_entities(new, USER_1)
            .iter()
            .all(|(e, _)| e != "test_case"));
        crate::sync::assume_stable_steps_server(new);
        assert_eq!(crate::sync::held_back_cases(new)?, 0);
        // The audit log starts empty: nothing is backfilled (ADR-0015).
        assert_eq!(count(new, "SELECT count(*) FROM audit_log"), 0);
        // Both accounts' pending changes still push as before, open conflicts stay.
        assert_eq!(
            (pending_entities(new, USER_1), pending_entities(new, USER_2)),
            pending_before
        );
        assert!(
            count(
                new,
                "SELECT count(*) FROM sync_conflicts WHERE resolved_at IS NULL"
            ) > 0
        );
        // The cursor advanced by 0.2.0-alpha.1 restarts once (VERSIONING §6.5).
        assert_eq!(crate::sync::cursor_get(new, USER_1)?, "0");

        // The first audited change starts the account's chain at 1.
        let case: String = new
            .query_row(
                "SELECT c.id FROM test_cases c JOIN projects p ON p.id = c.project_id \
             WHERE p.owner_id = ?1 AND c.deleted_at IS NULL AND c.scenario_id = 'ATS_002'",
                params![USER_1],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        crate::test_case::delete_case(new, &case, USER_1)?;
        let (seq, prev, owner): (i64, Option<String>, String) = new
            .query_row(
                "SELECT chain_seq, prev_hash, user_id FROM audit_log",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|e| e.to_string())?;
        assert_eq!((seq, prev, owner.as_str()), (1, None, USER_1));
        Ok(())
    })
    .unwrap();
    drop(db);

    let db = Db::open_with_key(&dir, FIXTURE_KEY).unwrap();
    assert_eq!(db.with_conn(pending_migrations).unwrap().len(), 0);
    fs::remove_dir_all(&dir).unwrap();
}

// ---- DAT-02: cases of every Gherkin level, as 0.1 wrote them ---------------

#[test]
fn every_gherkin_level_written_by_0_1_migrates_to_stable_ids_without_loss() {
    // The fixtures only hold basic cases, so outline, advanced (flows,
    // background, featureSource) and odd shapes are added to the alpha.1
    // image the way the 0.1 editor stored them, plus an open conflict.
    let old = fixture_image();
    let (project, workspace): (String, String) = old
        .query_row(
            "SELECT id, workspace_id FROM projects WHERE owner_id = ?1",
            params![USER_1],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    let outline = serde_json::json!({
        "gherkinLevel": "outline",
        "preconditions": ["the user <user> exists"],
        "steps": ["I log in as <user>", "I open the cart"],
        "expectedResult": "I see <result>",
        "examples": {"headers": ["user", "result"], "rows": [["ana", "ok"], ["bob", "denied"], ["ana", "ok"]]}
    });
    let advanced = serde_json::json!({
        "gherkinLevel": "advanced",
        "background": ["the shop is open", "prices in EUR"],
        "flows": [
            {"id": "f-main", "name": "Pay", "preconditions": ["a cart"], "steps": ["I pay", "I confirm"],
             "expectedResult": "paid", "tags": ["smoke"]},
            {"id": "f-alt", "name": "Declined", "steps": ["I pay with <card>"], "expectedResult": "declined",
             "examples": {"headers": ["card"], "rows": [["expired"], ["stolen"]]}},
            {"name": "No id", "steps": ["retry"], "expectedResult": ""}
        ],
        "featureSource": "Feature: Checkout\n  Background:\n    Given the shop is open\n  Scenario: Pay\n    When I pay\n"
    });
    let odd = serde_json::json!({"steps": ["", "  spaced  ", "ünïcödé €", {"given": "g"}, 3], "notes": "kept"});
    for (id, data) in [
        ("lvl-outline", &outline),
        ("lvl-advanced", &advanced),
        ("lvl-odd", &odd),
    ] {
        old.execute(
            "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, author, data, \
             created_by, updated_by, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?1, 't', 'a', ?4, ?5, ?5, 'now', 'now')",
            params![id, workspace, project, data.to_string(), USER_1],
        )
        .unwrap();
    }
    old.execute(
        "INSERT INTO sync_conflicts (id, entity, entity_id, local_payload, remote_payload, detected_at) \
         VALUES ('cf-lvl', 'test_case', 'lvl-outline', ?1, ?2, 'now')",
        params![
            serde_json::json!({"title": "t", "data": outline}).to_string(),
            serde_json::json!({"title": "t2", "data": {"steps": ["remote step"]}}).to_string()
        ],
    )
    .unwrap();

    let new = Connection::open_in_memory().unwrap();
    let image = old.serialize(rusqlite::DatabaseName::Main).unwrap();
    let mut new = new;
    load_image(&mut new, &image).unwrap();
    run_migrations(&new).unwrap();

    assert_rows_kept(&old, &new, true);
    assert_stable_steps(&new);

    let data_of = |id: &str| -> serde_json::Value {
        let s: String = new
            .query_row("SELECT data FROM test_cases WHERE id = ?1", [id], |r| {
                r.get(0)
            })
            .unwrap();
        serde_json::from_str(&s).unwrap()
    };
    let texts = |v: &serde_json::Value| -> Vec<String> {
        v.as_array()
            .unwrap()
            .iter()
            .map(|s| s["text"].as_str().unwrap().to_string())
            .collect()
    };
    // Outline: steps, preconditions and every row (duplicates too) have ids.
    let o = data_of("lvl-outline");
    assert_eq!(
        texts(&o["steps"]),
        ["I log in as <user>", "I open the cart"]
    );
    assert_eq!(texts(&o["preconditions"]), ["the user <user> exists"]);
    let rows = o["examples"]["rows"].as_array().unwrap();
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[2]["values"], serde_json::json!(["ana", "ok"]));
    assert_ne!(rows[0]["id"], rows[2]["id"]);
    assert_eq!(o["expectedResult"], "I see <result>");
    // Advanced: flows keep their ids (one is derived), the raw Gherkin is untouched.
    let a = data_of("lvl-advanced");
    assert_eq!(
        texts(&a["background"]),
        ["the shop is open", "prices in EUR"]
    );
    assert_eq!(a["flows"][0]["id"], "f-main");
    assert_eq!(a["flows"][1]["id"], "f-alt");
    assert!(a["flows"][2]["id"].as_str().is_some_and(|s| s.len() == 8));
    assert_eq!(texts(&a["flows"][0]["steps"]), ["I pay", "I confirm"]);
    assert_eq!(
        a["flows"][1]["examples"]["rows"][1]["values"],
        serde_json::json!(["stolen"])
    );
    assert_eq!(a["flows"][0]["tags"], serde_json::json!(["smoke"]));
    assert_eq!(a["featureSource"], advanced["featureSource"]);
    // Odd shapes: empty and spaced texts stay as they were; an object is kept
    // as its canonical JSON; other keys are untouched.
    let d = data_of("lvl-odd");
    assert_eq!(
        texts(&d["steps"]),
        ["", "  spaced  ", "ünïcödé €", r#"{"given":"g"}"#, "3"]
    );
    assert_eq!(d["notes"], "kept");
    // Two devices that migrate the same case get the same ids.
    let mut again = outline.clone();
    crate::steps::normalize_case_data("lvl-outline", &mut again);
    assert_eq!(again, o);
    // The open conflict's two sides were migrated too.
    let (local, remote): (String, String) = new
        .query_row(
            "SELECT local_payload, remote_payload FROM sync_conflicts WHERE id = 'cf-lvl'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    let local: serde_json::Value = serde_json::from_str(&local).unwrap();
    let remote: serde_json::Value = serde_json::from_str(&remote).unwrap();
    assert_eq!(local["data"], o);
    assert_eq!(texts(&remote["data"]["steps"]), ["remote step"]);
}
