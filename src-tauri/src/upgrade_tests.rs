//! Upgrade tests (BASE-04, VERSIONING §6): a database written by the previous
//! release must open with HEAD without losing anything. The fixture under
//! `tests/fixtures/0.1.0-alpha.1/` was written by the real 0.1.0-alpha.1 code
//! (see its README); this module also covers the data migrations 0015 (FIX-06),
//! the key counters of 0016 (DAT-01) and the move of the planner attachments
//! into the evidence store, 0022–0023 (DAT-03, ADR-0014).

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
            if table == "planner_attachments" {
                continue; // moved to the evidence store: checked below
            }
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

    // The migrated file was saved: reopening migrates nothing and keeps one
    // backup, next to the evidence folder.
    let db = Db::open_with_key(&dir, FIXTURE_KEY).unwrap();
    assert_eq!(db.with_conn(pending_migrations).unwrap().len(), 0);
    assert_attachments_moved(&old, &db);
    let mut names: Vec<String> = fs::read_dir(&dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    assert_eq!(
        names,
        [
            "evidence".to_string(),
            "pharos.db.enc".to_string(),
            format!("pharos.db.enc.bak-{APP_VERSION}-0011_sync_conflicts"),
        ]
    );
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

    let dir = temp_dir();
    run_migrations_with(&old, Some(&EvidenceStore::new(&dir, &FIXTURE_KEY))).unwrap();
    fs::remove_dir_all(&dir).unwrap();
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
    let pending_before = (
        pending_entities(&old, USER_1),
        pending_entities(&old, USER_2),
    );

    let db = Db::open_with_key(&dir, FIXTURE_KEY).unwrap();

    // SEC-06: the untouched 0.2.0-alpha.1 file was kept before migrating.
    let backup = dir.join(format!(
        "pharos.db.enc.bak-{APP_VERSION}-0018_template_owner"
    ));
    assert_eq!(fs::read(&backup).unwrap(), FIXTURE_020A1);

    db.with_conn(|new| {
        assert_eq!(pending_migrations(new)?.len(), 0);
        // Nothing changes: no migration since 0018 rewrites a row (the
        // attachment BLOBs move to the evidence store: checked below).
        for table in tables(&old) {
            if table == "planner_attachments" {
                continue;
            }
            let cols = columns(&old, &table);
            let before = rows(&old, &table, &cols);
            let after = rows(new, &table, &cols);
            if table == "schema_migrations" {
                assert_eq!(&after[..before.len()], &before[..]);
                continue;
            }
            assert_eq!(after, before, "{table}");
        }
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
        // DAT-03: no attachment is pushed, as before (SYNC-04b).
        assert!(!pending_before.0.iter().any(|(e, _)| e == "attachment"));

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
    assert_attachments_moved(&old, &db);
    fs::remove_dir_all(&dir).unwrap();
}

// ---- DAT-03: planner attachments move into the evidence store (0022–0023) ----

/// One `planner_attachments` row of an old image.
struct OldAttachment {
    id: String,
    card_id: String,
    name: String,
    mime: Option<String>,
    bytes: Vec<u8>,
    created_at: String,
    /// The card's owner; None for a row whose card is gone.
    owner: Option<String>,
}

fn old_attachments(old: &Connection) -> Vec<OldAttachment> {
    let mut stmt = old
        .prepare(
            "SELECT a.id, a.card_id, a.name, a.mime, a.bytes, a.created_at, c.owner_id \
             FROM planner_attachments a LEFT JOIN planner_cards c ON c.id = a.card_id \
             ORDER BY a.rowid",
        )
        .unwrap();
    let rows = stmt
        .query_map([], |r| {
            Ok(OldAttachment {
                id: r.get(0)?,
                card_id: r.get(1)?,
                name: r.get(2)?,
                mime: r.get(3)?,
                bytes: r.get(4)?,
                created_at: r.get(5)?,
                owner: r.get(6)?,
            })
        })
        .unwrap();
    rows.collect::<rusqlite::Result<_>>().unwrap()
}

fn read_evidence(db: &Db, sha256: &str) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let mut out = Vec::new();
    db.evidence()
        .open(sha256)?
        .read_to_end(&mut out)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

/// Every old attachment with a card is an `attachments` row with the same id,
/// name, mime, size and date, created by the card's owner, and its content
/// opens byte for byte; rows without a card are gone; the old table is dropped.
fn assert_attachments_moved(old: &Connection, db: &Db) {
    let olds = old_attachments(old);
    let kept: Vec<&OldAttachment> = olds.iter().filter(|a| a.owner.is_some()).collect();
    db.with_conn(|c| {
        assert!(!tables(c).contains(&"planner_attachments".to_string()));
        assert_eq!(
            count(c, "SELECT count(*) FROM attachments"),
            kept.len() as i64
        );
        for a in &kept {
            let row = c
                .query_row(
                    "SELECT owner_entity, owner_id, name, mime, size, sha256, created_at, \
                     created_by, kind FROM attachments WHERE id = ?1 AND deleted_at IS NULL",
                    params![a.id],
                    |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, String>(2)?,
                            r.get::<_, Option<String>>(3)?,
                            r.get::<_, i64>(4)?,
                            r.get::<_, String>(5)?,
                            r.get::<_, String>(6)?,
                            r.get::<_, String>(7)?,
                            r.get::<_, String>(8)?,
                        ))
                    },
                )
                .unwrap();
            assert_eq!(row.0, "planner_card");
            assert_eq!(row.1, a.card_id);
            assert_eq!((&row.2, &row.3), (&a.name, &a.mime));
            assert_eq!(row.4, a.bytes.len() as i64);
            assert_eq!(row.5, crate::audit::sha256_hex(&a.bytes));
            assert_eq!(row.6, a.created_at);
            assert_eq!(Some(&row.7), a.owner.as_ref());
            assert_eq!(row.8, "evidence");
            assert!(read_evidence(db, &row.5).unwrap() == a.bytes, "{}", a.id);
        }
        // One `present` row per distinct content.
        let distinct: std::collections::HashSet<String> = kept
            .iter()
            .map(|a| crate::audit::sha256_hex(&a.bytes))
            .collect();
        assert_eq!(
            count(
                c,
                "SELECT count(*) FROM blobs WHERE local_state = 'present'"
            ),
            distinct.len() as i64
        );
        Ok(())
    })
    .unwrap();
}

/// `.pev` files under `<dir>/evidence` (not `tmp/`), and files left in `tmp/`.
fn evidence_files(dir: &Path) -> (usize, usize) {
    let (mut pev, mut tmp) = (0, 0);
    for entry in fs::read_dir(dir.join("evidence"))
        .into_iter()
        .flatten()
        .flatten()
    {
        let inner = fs::read_dir(entry.path())
            .into_iter()
            .flatten()
            .flatten()
            .count();
        if entry.file_name() == "tmp" {
            tmp += inner;
        } else {
            pev += inner;
        }
    }
    (pev, tmp)
}

/// A copy of a fixture image with more attachments: a 12 MB file on a live
/// card, a duplicate of the fixture's own attachment, a soft-deleted card with
/// an attachment and a row whose card is gone. The fixture files are never
/// changed: the copy lives in memory and in a temp dir.
fn extended(image: Connection) -> Connection {
    let (card, workspace, project): (String, String, String) = image
        .query_row(
            "SELECT id, workspace_id, project_id FROM planner_cards \
             WHERE owner_id = ?1 AND kind = 'defect' AND deleted_at IS NULL",
            params![USER_1],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    let original: Vec<u8> = image
        .query_row(
            "SELECT bytes FROM planner_attachments WHERE card_id = ?1",
            params![card],
            |r| r.get(0),
        )
        .unwrap();
    image
        .execute(
            "INSERT INTO planner_cards (id, workspace_id, project_id, owner_id, kind, title, \
             created_by, updated_by, created_at, updated_at, deleted_at) \
             VALUES ('gone-card', ?1, ?2, ?3, 'task', 'Deleted', ?3, ?3, 'now', 'now', \
                     datetime('now', '-2 days'))",
            params![workspace, project, USER_1],
        )
        .unwrap();
    let big = crate::evidence::tests::sample(12 * 1024 * 1024 + 3);
    // The orphan needs the foreign key off, as a database written without
    // enforcement could hold it.
    image.execute_batch("PRAGMA foreign_keys = OFF").unwrap();
    for (id, card_id, name, bytes) in [
        ("big", card.as_str(), "trace.zip", big),
        ("dup", card.as_str(), "log copy.txt", original),
        ("on-deleted", "gone-card", "old.png", b"png".to_vec()),
        ("orphan", "no-such-card", "lost.bin", b"lost".to_vec()),
    ] {
        image
            .execute(
                "INSERT INTO planner_attachments (id, card_id, name, mime, bytes) \
                 VALUES (?1, ?2, ?3, 'application/octet-stream', ?4)",
                params![id, card_id, name, bytes],
            )
            .unwrap();
    }
    image.execute_batch("PRAGMA foreign_keys = ON").unwrap();
    image
}

fn write_image(dir: &Path, image: &Connection) -> Vec<u8> {
    let blob = encrypt(&FIXTURE_KEY, &image.serialize(DatabaseName::Main).unwrap()).unwrap();
    fs::write(dir.join("pharos.db.enc"), &blob).unwrap();
    blob
}

fn saved_image_len(dir: &Path) -> usize {
    decrypt(&FIXTURE_KEY, &fs::read(dir.join("pharos.db.enc")).unwrap())
        .unwrap()
        .len()
}

#[test]
fn both_fixtures_move_big_duplicate_and_deleted_card_attachments_and_shrink() {
    for image in [fixture_image(), fixture_020a1_image()] {
        let old = extended(image);
        let before = old.serialize(DatabaseName::Main).unwrap().len();
        let dir = temp_dir();
        write_image(&dir, &old);

        let db = Db::open_with_key(&dir, FIXTURE_KEY).unwrap();
        assert_attachments_moved(&old, &db);
        db.with_conn(|c| {
            // The orphan is gone; the deleted card's file stays, hidden.
            assert_eq!(
                count(c, "SELECT count(*) FROM attachments WHERE id = 'orphan'"),
                0
            );
            assert!(crate::planner::list_attachments(c, "gone-card", USER_1)?.is_empty());
            // The duplicate shares the original's content.
            assert_eq!(
                count(c, "SELECT count(DISTINCT sha256) FROM attachments"),
                count(c, "SELECT count(*) FROM attachments") - 1
            );
            Ok(())
        })
        .unwrap();
        drop(db);
        assert_eq!(
            evidence_files(&dir),
            (3, 0),
            "original, big, png; nothing left in tmp"
        );
        // The image no longer carries the bytes (12 MB of them).
        let after = saved_image_len(&dir);
        assert!(
            before > 12 * 1024 * 1024 && after < 1024 * 1024,
            "{after} vs {before}"
        );
        // Reopening changes nothing.
        let db = Db::open_with_key(&dir, FIXTURE_KEY).unwrap();
        assert_attachments_moved(&old, &db);
        drop(db);
        assert_eq!(evidence_files(&dir), (3, 0));
        fs::remove_dir_all(&dir).unwrap();
    }
}

#[test]
fn a_migration_cut_midway_or_before_0023_resumes_without_duplicates() {
    let old = extended(fixture_020a1_image());
    let movable = old_attachments(&old)
        .iter()
        .filter(|a| a.owner.is_some())
        .count();
    // After one row; then after the whole Rust step, right before 0023 runs.
    for fail_after in [1, movable] {
        let dir = temp_dir();
        let original = write_image(&dir, &old);
        crate::evidence::FAIL_AFTER.with(|f| f.set(Some(fail_after)));
        let err = Db::open_with_key(&dir, FIXTURE_KEY).err().unwrap();
        crate::evidence::FAIL_AFTER.with(|f| f.set(None));
        assert!(err.contains("injected migration failure"), "{err}");
        // Nothing of the database changed on disk; the backup is there.
        assert_eq!(fs::read(dir.join("pharos.db.enc")).unwrap(), original);
        assert!(fs::read_dir(&dir).unwrap().any(|e| e
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("pharos.db.enc.bak-")));
        assert!(evidence_files(&dir).0 >= 1);

        let db = Db::open_with_key(&dir, FIXTURE_KEY).unwrap();
        assert_attachments_moved(&old, &db);
        drop(db);
        assert_eq!(evidence_files(&dir), (3, 0), "fail_after {fail_after}");
        fs::remove_dir_all(&dir).unwrap();
    }
}

#[test]
fn a_database_saved_between_the_rust_step_and_0023_finishes_cleanly() {
    // Defensive: no save happens between them, but an image with 0022 applied
    // and the rows already copied must finish without duplicating anything.
    let old = extended(fixture_020a1_image());
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &FIXTURE_KEY);
    let mut mid = Connection::open_in_memory().unwrap();
    load_image(&mut mid, &old.serialize(DatabaseName::Main).unwrap()).unwrap();
    for (name, sql) in MIGRATIONS {
        if *name == PLANNER_ATTACHMENTS_OUT {
            break;
        }
        if applied_migrations(&mid).unwrap().iter().any(|a| a == name) {
            continue;
        }
        mid.execute_batch(sql).unwrap();
        mid.execute("INSERT INTO schema_migrations (name) VALUES (?1)", [name])
            .unwrap();
    }
    crate::evidence::migrate_planner_attachments(&mid, Some(&store)).unwrap();
    let copied = count(&mid, "SELECT count(*) FROM attachments");
    write_image(&dir, &mid);
    // One of the copied files was cut short: the rerun stores it again.
    let (big_sha, big_size): (String, i64) = mid
        .query_row(
            "SELECT sha256, size FROM attachments WHERE id = 'big'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert!(store.is_stored(&big_sha, big_size as u64));
    let big = store.path_for(&big_sha).unwrap();
    let len = fs::metadata(&big).unwrap().len();
    fs::OpenOptions::new()
        .write(true)
        .open(&big)
        .unwrap()
        .set_len(len / 2)
        .unwrap();
    assert!(!store.is_stored(&big_sha, big_size as u64));

    let db = Db::open_with_key(&dir, FIXTURE_KEY).unwrap();
    assert_attachments_moved(&old, &db);
    assert_eq!(
        db.with_conn(|c| Ok(count(c, "SELECT count(*) FROM attachments")))
            .unwrap(),
        copied
    );
    drop(db);
    assert_eq!(evidence_files(&dir), (3, 0));
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn a_wrong_key_migrates_nothing_and_touches_no_evidence() {
    let dir = temp_dir();
    let original = write_image(&dir, &extended(fixture_020a1_image()));
    let err = Db::open_with_key(&dir, [0x11; 32]).err().unwrap();
    assert_eq!(err, DECRYPT_ERROR);
    assert_eq!(fs::read(dir.join("pharos.db.enc")).unwrap(), original);
    assert!(!dir.join("evidence").exists());
    assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn a_migrated_database_is_newer_than_0_2_0_alpha_1() {
    // 0.2.0-alpha.1 refuses a database with migrations it does not know
    // (`NEWER_DB_ERROR`, SEC-06), so it never runs on one without
    // planner_attachments. Its known set is 0001–0018, as in its fixture.
    let known = applied_migrations(&fixture_020a1_image()).unwrap();
    let dir = temp_dir();
    write_image(&dir, &fixture_020a1_image());
    let db = Db::open_with_key(&dir, FIXTURE_KEY).unwrap();
    let applied = db.with_conn(applied_migrations).unwrap();
    let unknown_to_it: Vec<&String> = applied.iter().filter(|m| !known.contains(m)).collect();
    for m in ["0022_evidence.sql", "0023_planner_attachments_out.sql"] {
        assert!(unknown_to_it.iter().any(|u| u.as_str() == m), "{m}");
    }
    drop(db);
    fs::remove_dir_all(&dir).unwrap();
}

/// A keychain stand-in for `Db::recover` on "another PC".
struct EmptyStore(std::cell::RefCell<Option<[u8; 32]>>);

impl KeyStore for EmptyStore {
    fn load(&self) -> Result<Option<[u8; 32]>, String> {
        Ok(*self.0.borrow())
    }
    fn store(&self, key: &[u8; 32]) -> Result<(), String> {
        *self.0.borrow_mut() = Some(*key);
        Ok(())
    }
    fn keep_previous(&self, _key: &[u8; 32]) -> Result<(), String> {
        Ok(())
    }
}

fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap().flatten() {
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).unwrap();
        }
    }
}

#[test]
fn the_recovery_key_opens_the_evidence_on_another_pc_and_a_missing_folder_is_reported() {
    let old = fixture_020a1_image();
    let here = temp_dir();
    write_image(&here, &old);
    let recovery = Db::open_with_key(&here, FIXTURE_KEY)
        .unwrap()
        .recovery_key();

    // A full backup (pharos.db.enc + evidence/) restored elsewhere.
    let there = temp_dir();
    fs::copy(here.join("pharos.db.enc"), there.join("pharos.db.enc")).unwrap();
    copy_dir(&here.join("evidence"), &there.join("evidence"));
    let keychain = EmptyStore(std::cell::RefCell::new(None));
    let db = Db::recover(&there, &keychain, &recovery).unwrap();
    assert_attachments_moved(&old, &db);
    drop(db);

    // Only the database copied: it opens, and the file is reported missing.
    let bare = temp_dir();
    fs::copy(here.join("pharos.db.enc"), bare.join("pharos.db.enc")).unwrap();
    let db = Db::open_with_key(&bare, FIXTURE_KEY).unwrap();
    let sha: String = db
        .with_conn(|c| {
            c.query_row("SELECT sha256 FROM attachments LIMIT 1", [], |r| r.get(0))
                .map_err(|e| e.to_string())
        })
        .unwrap();
    let err = read_evidence(&db, &sha).unwrap_err();
    assert!(err.starts_with(crate::evidence::EVIDENCE_MISSING), "{err}");
    drop(db);
    for dir in [here, there, bare] {
        fs::remove_dir_all(dir).unwrap();
    }
}
