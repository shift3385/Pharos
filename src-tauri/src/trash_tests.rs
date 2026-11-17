//! The trash (RED-W3): list, restore and purge now.

use super::*;
use rusqlite::{params, Connection};

const A: &str = "user-a";
const B: &str = "user-b";

fn conn() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    crate::db::run_migrations(&c).unwrap();
    c
}

fn project(c: &Connection, id: &str, owner: &str) {
    let ws = crate::db::ensure_workspace(c).unwrap();
    c.execute(
        "INSERT INTO projects (id, workspace_id, owner_id, name, created_by, updated_by, \
         created_at, updated_at) VALUES (?1, ?2, ?3, 'Banca', ?3, ?3, 'now', 'now')",
        params![id, ws, owner],
    )
    .unwrap();
}

fn case(c: &Connection, id: &str, project: &str, key: &str) {
    let ws = crate::db::ensure_workspace(c).unwrap();
    c.execute(
        "INSERT INTO test_cases (id, workspace_id, project_id, scenario_id, title, author, \
         created_by, updated_by, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, 'Pago QR', 'a', 'a', 'a', 'now', 'now')",
        params![id, ws, project, key],
    )
    .unwrap();
}

fn deleted(c: &Connection, table: &str, id: &str) -> bool {
    c.query_row(
        &format!("SELECT deleted_at IS NOT NULL FROM {table} WHERE id = ?1"),
        params![id],
        |r| r.get(0),
    )
    .unwrap()
}

fn exists(c: &Connection, table: &str, id: &str) -> bool {
    c.query_row(
        &format!("SELECT count(*) FROM {table} WHERE id = ?1"),
        params![id],
        |r| r.get::<_, i64>(0),
    )
    .unwrap()
        == 1
}

fn r(entity: &str, id: &str) -> TrashRef {
    TrashRef {
        entity: entity.into(),
        id: id.into(),
    }
}

#[test]
fn lists_only_the_accounts_deleted_rows() {
    let c = conn();
    project(&c, "p1", A);
    project(&c, "p2", B);
    case(&c, "c1", "p1", "BM-CP-0151");
    case(&c, "live", "p1", "BM-CP-0152");
    case(&c, "other", "p2", "X-1");
    crate::test_case::delete_case(&c, "c1", A).unwrap();
    crate::test_case::delete_case(&c, "other", B).unwrap();

    let items = list(&c, A).unwrap();
    assert_eq!(items.len(), 1);
    let it = &items[0];
    assert_eq!((it.entity.as_str(), it.id.as_str()), ("test_case", "c1"));
    assert_eq!(it.key.as_deref(), Some("BM-CP-0151"));
    assert_eq!(it.project_name.as_deref(), Some("Banca"));
    assert!(!it.with_project);
    // Its delete has not been pushed and the server never knew it: not held.
    assert!(!it.held);
}

#[test]
fn restoring_a_case_is_a_new_change_that_syncs_and_is_audited() {
    let c = conn();
    project(&c, "p1", A);
    case(&c, "c1", "p1", "BM-CP-0151");
    crate::test_case::delete_case(&c, "c1", A).unwrap();
    let rev_before: i64 = c
        .query_row("SELECT revision FROM test_cases WHERE id = 'c1'", [], |r| {
            r.get(0)
        })
        .unwrap();

    let s = restore(&c, A, &[r("test_case", "c1")]).unwrap();
    assert_eq!(
        s,
        RestoreSummary {
            restored: 1,
            with_them: 0
        }
    );
    assert!(!deleted(&c, "test_cases", "c1"));
    let (rev, op): (i64, String) = c
        .query_row(
            "SELECT revision, op FROM oplog WHERE entity_id = 'c1' ORDER BY rowid DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!((rev, op.as_str()), (rev_before + 1, "upsert"));
    let action: String = c
        .query_row(
            "SELECT action FROM audit_log WHERE entity_id = 'c1' ORDER BY rowid DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(action, "restore");
    assert!(list(&c, A).unwrap().is_empty());
}

#[test]
fn a_project_comes_back_with_what_went_with_it() {
    let c = conn();
    project(&c, "p1", A);
    case(&c, "early", "p1", "K-1");
    case(&c, "c1", "p1", "K-2");
    case(&c, "c2", "p1", "K-3");
    // Deleted on its own before the project: it stays in the trash.
    crate::test_case::delete_case(&c, "early", A).unwrap();
    c.execute(
        "UPDATE test_cases SET deleted_at = datetime('now', '-1 day') WHERE id = 'early'",
        [],
    )
    .unwrap();
    c.execute(
        "UPDATE oplog SET created_at = datetime('now', '-1 day') WHERE entity_id = 'early'",
        [],
    )
    .unwrap();
    crate::project::delete_project(&c, "p1", A).unwrap();

    let items = list(&c, A).unwrap();
    let p = items.iter().find(|i| i.entity == "project").unwrap();
    assert_eq!(p.children, 2);
    assert!(items.iter().find(|i| i.id == "c1").unwrap().with_project);
    assert!(!items.iter().find(|i| i.id == "early").unwrap().with_project);

    // A row of a project in the trash waits for the project.
    assert_eq!(
        restore(&c, A, &[r("test_case", "c1")]).unwrap_err(),
        "project-in-trash"
    );

    let s = restore(&c, A, &[r("project", "p1"), r("test_case", "c1")]).unwrap();
    assert_eq!(
        s,
        RestoreSummary {
            restored: 2,
            with_them: 1
        }
    );
    assert!(!deleted(&c, "projects", "p1"));
    assert!(!deleted(&c, "test_cases", "c1") && !deleted(&c, "test_cases", "c2"));
    assert!(deleted(&c, "test_cases", "early"));
}

#[test]
fn someone_elses_row_is_not_found() {
    let c = conn();
    project(&c, "p1", B);
    case(&c, "c1", "p1", "K-1");
    crate::test_case::delete_case(&c, "c1", B).unwrap();
    assert_eq!(
        restore(&c, A, &[r("test_case", "c1")]).unwrap_err(),
        "not-found"
    );
    assert!(deleted(&c, "test_cases", "c1"));
}

#[test]
fn deleting_forever_removes_only_the_chosen_rows_and_emptying_removes_all() {
    let c = conn();
    project(&c, "p1", A);
    case(&c, "c1", "p1", "K-1");
    case(&c, "c2", "p1", "K-2");
    case(&c, "live", "p1", "K-3");
    crate::test_case::delete_case(&c, "c1", A).unwrap();
    crate::test_case::delete_case(&c, "c2", A).unwrap();

    let only: Selection = [("test_case".to_string(), "c1".to_string())].into();
    assert_eq!(purge::purge_now(&c, A, Some(&only)).unwrap().test_cases, 1);
    assert!(!exists(&c, "test_cases", "c1") && exists(&c, "test_cases", "c2"));

    assert_eq!(purge::purge_now(&c, A, None).unwrap().test_cases, 1);
    assert!(!exists(&c, "test_cases", "c2"));
    assert!(exists(&c, "test_cases", "live"));
}

#[test]
fn a_held_row_is_marked_and_kept_when_emptying() {
    let c = conn();
    project(&c, "p1", A);
    case(&c, "c1", "p1", "K-1");
    crate::test_case::delete_case(&c, "c1", A).unwrap();
    // The server knows the case (a sync base) and its delete is not pushed.
    c.execute(
        "INSERT INTO sync_base (user_id, entity, entity_id, revision, hlc) \
         VALUES (?1, 'test_case', 'c1', 1, '')",
        params![A],
    )
    .unwrap();
    assert!(list(&c, A).unwrap()[0].held);
    assert_eq!(purge::purge_now(&c, A, None).unwrap().test_cases, 0);
    assert!(exists(&c, "test_cases", "c1"));
}
