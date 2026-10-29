//! Upgrade tests (BASE-04, VERSIONING §6): a database written by the previous
//! release must open with HEAD without losing anything. The fixture under
//! `tests/fixtures/0.1.0-alpha.1/` was written by the real 0.1.0-alpha.1 code
//! (see its README); this module also covers the data migrations 0015 (FIX-06)
//! and the key counters of 0016 (DAT-01).

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
        for table in tables(&old) {
            let cols = columns(&old, &table);
            let before = rows(&old, &table, &cols);
            let after = rows(new, &table, &cols);
            if table == "schema_migrations" {
                // Old entries stay; the upgrade only appends.
                assert_eq!(&after[..before.len()], &before[..]);
                continue;
            }
            assert_eq!(after.len(), before.len(), "row count of {table}");
            for ((rowid, old_values), (new_rowid, new_values)) in before.iter().zip(&after) {
                assert_eq!(rowid, new_rowid, "{table}");
                for (i, col) in cols.iter().enumerate() {
                    if !repaired(&table, col) {
                        assert_eq!(old_values[i], new_values[i], "{table}.{col} of row {rowid}");
                    }
                }
            }
        }

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
