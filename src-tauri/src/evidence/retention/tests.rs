//! DAT-03c: per-project settings and the exceptions of results.

use rusqlite::{params, Connection};
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::*;
use crate::evidence::{expire, record_blob, Stored};

const OWNER: &str = "11111111-1111-4111-8111-111111111111";

fn conn() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    crate::db::run_migrations(&c).unwrap();
    let ws = crate::db::ensure_workspace(&c).unwrap();
    c.execute(
        "INSERT INTO projects (id, workspace_id, owner_id, name, created_by, updated_by, \
         created_at, updated_at) VALUES ('p1', ?1, ?2, 'P', ?2, ?2, datetime('now'), datetime('now'))",
        params![ws, OWNER],
    )
    .unwrap();
    c.execute(
        "INSERT INTO runs (id, workspace_id, project_id, run_key, title, trigger, created_by,
                updated_by, created_at, updated_at)
         SELECT 'run1', id, 'p1', 'RUN-001', 'CI', 'ci', ?1, ?1, datetime('now'), datetime('now')
           FROM workspaces",
        params![OWNER],
    )
    .unwrap();
    c.execute(
        "INSERT INTO run_shards (id, workspace_id, project_id, run_id, source_format,
                source_file_sha256, imported_by, imported_at, hlc)
         SELECT 's1', id, 'p1', 'run1', 'ctrf', ?2, ?1, '2026-01-01T00:00:00Z', 'h' FROM workspaces",
        params![OWNER, "ee".repeat(32)],
    )
    .unwrap();
    c
}

/// A result of `run1`: imported (`shard`) or manual (`None`), at `minute`.
fn result(
    c: &Connection,
    id: &str,
    key: &str,
    attempt: i64,
    status: &str,
    shard: Option<&str>,
    minute: i64,
) {
    c.execute(
        "INSERT INTO results (id, workspace_id, project_id, run_id, shard_id, test_key, attempt,
                status, started_at, executed_by, created_by, created_at, hlc)
         SELECT ?1, id, 'p1', 'run1', ?2, ?3, ?4, ?5,
                '2026-01-01T00:' || printf('%02d', ?6) || ':00Z', ?7, ?7, datetime('now'), ?1
           FROM workspaces",
        params![id, shard, key, attempt, status, minute, OWNER],
    )
    .unwrap();
}

/// An attachment of `owner`, `age` days old; its content is present.
fn attach(c: &Connection, id: &str, owner_entity: &str, owner: &str, kind: &str, age: i64) {
    let stored = Stored {
        sha256: format!("{:x}", Sha256::digest(id.as_bytes())),
        size: 1,
    };
    record_blob(c, &stored, None).unwrap();
    c.execute(
        "INSERT INTO attachments (id, workspace_id, project_id, sha256, size, name, owner_entity,
                owner_id, kind, created_by, updated_by, created_at, updated_at)
         SELECT ?1, id, 'p1', ?2, 1, 'n', ?3, ?4, ?5, ?6, ?6,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || ?7 || ' days'), 'now' FROM workspaces",
        params![id, stored.sha256, owner_entity, owner, kind, OWNER, age],
    )
    .unwrap();
}

fn expired(c: &Connection) -> Vec<String> {
    expire(c).unwrap();
    c.prepare("SELECT id FROM attachments WHERE blob_purged_at IS NOT NULL ORDER BY id")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap()
}

#[test]
fn a_trace_of_a_passed_result_expires_and_one_of_a_failed_result_does_not() {
    let c = conn();
    result(&c, "pass", "t-pass", 0, "passed", Some("s1"), 1);
    result(&c, "fail", "t-fail", 0, "failed", Some("s1"), 1);
    result(&c, "block", "t-block", 0, "blocked", Some("s1"), 1);
    attach(&c, "a-pass", "result", "pass", "trace", 31);
    attach(&c, "a-pass-new", "result", "pass", "trace", 29);
    attach(&c, "a-fail", "result", "fail", "trace", 31);
    attach(&c, "a-block", "result", "block", "video", 31);
    let results = c
        .query_row("SELECT count(*) FROM results", [], |r| r.get::<_, i64>(0))
        .unwrap();
    assert_eq!(expired(&c), ["a-pass"]);
    // Expiry never touches the results.
    assert_eq!(
        c.query_row("SELECT count(*) FROM results", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        results
    );
    let (action, entity): (String, String) = c
        .query_row(
            "SELECT action, entity FROM audit_log WHERE entity_id = 'a-pass'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!((action.as_str(), entity.as_str()), ("redact", "attachment"));
}

#[test]
fn only_the_final_attempt_is_exempt_when_it_failed() {
    let c = conn();
    // Failed, then passed on retry: the failed attempt is no longer final.
    result(&c, "r0", "flaky", 0, "failed", Some("s1"), 1);
    result(&c, "r1", "flaky", 1, "passed", Some("s1"), 2);
    // Passed, then failed: the failed one is final.
    result(&c, "q0", "broken", 0, "passed", Some("s1"), 1);
    result(&c, "q1", "broken", 1, "failed", Some("s1"), 2);
    for (a, r) in [
        ("a-r0", "r0"),
        ("a-r1", "r1"),
        ("a-q0", "q0"),
        ("a-q1", "q1"),
    ] {
        attach(&c, a, "result", r, "trace", 40);
    }
    assert_eq!(expired(&c), ["a-q0", "a-r0", "a-r1"]);
}

#[test]
fn manual_results_never_expire_and_step_evidence_follows_its_result() {
    let c = conn();
    result(&c, "man", "manual:x/-/-", 0, "passed", None, 1);
    result(&c, "imp", "t", 0, "passed", Some("s1"), 1);
    result(&c, "bad", "u", 0, "failed", Some("s1"), 1);
    c.execute_batch(
        "INSERT INTO step_results (id, result_id, position, text, status) VALUES
           ('st-imp', 'imp', 0, 'a', 'passed'), ('st-bad', 'bad', 0, 'a', 'failed'),
           ('st-man', 'man', 0, 'a', 'passed');",
    )
    .unwrap();
    attach(&c, "a-man", "result", "man", "trace", 400);
    attach(&c, "s-man", "step_result", "st-man", "video", 400);
    attach(&c, "s-imp", "step_result", "st-imp", "video", 400);
    attach(&c, "s-bad", "step_result", "st-bad", "video", 400);
    // Drafts, cards and defects keep their files whatever the kind.
    attach(&c, "d", "execution_draft", "item", "trace", 400);
    attach(&c, "card", "planner_card", "c", "trace", 400);
    attach(&c, "def", "defect", "d", "trace", 400);
    assert_eq!(expired(&c), ["s-imp"]);
}

fn defect(c: &Connection, id: &str, status: &str, result: &str) {
    c.execute(
        "INSERT INTO defects (id, workspace_id, project_id, defect_key, title, status, resolution,
                reporter, created_by, updated_by, created_at, updated_at)
         SELECT ?1, id, 'p1', 'DEF-' || ?1, 'Bug', ?2,
                CASE WHEN ?2 IN ('closed', 'rejected') THEN 'fixed' END,
                ?3, ?3, ?3, datetime('now'), datetime('now') FROM workspaces",
        params![id, status, OWNER],
    )
    .unwrap();
    c.execute(
        "INSERT INTO defect_links (id, workspace_id, project_id, defect_id, target_kind, target_id,
                created_by, updated_by, created_at, updated_at)
         SELECT 'l-' || ?1, id, 'p1', ?1, 'result', ?2, ?3, ?3, datetime('now'), datetime('now')
           FROM workspaces",
        params![id, result, OWNER],
    )
    .unwrap();
}

#[test]
fn a_result_linked_to_an_open_defect_keeps_its_evidence_until_the_defect_closes() {
    let c = conn();
    // A failed attempt retried into a pass: only the defect keeps it.
    result(&c, "r0", "k", 0, "failed", Some("s1"), 1);
    result(&c, "r1", "k", 1, "passed", Some("s1"), 2);
    result(&c, "x", "other", 0, "passed", Some("s1"), 1);
    defect(&c, "d1", "open", "r0");
    defect(&c, "d2", "closed", "x");
    attach(&c, "a-r0", "result", "r0", "trace", 60);
    attach(&c, "a-x", "result", "x", "trace", 60);
    assert_eq!(expired(&c), ["a-x"]);
    // Deleting the link (or the defect) or closing it ends the exception.
    c.execute(
        "UPDATE defects SET status = 'closed', resolution = 'fixed' WHERE id = 'd1'",
        [],
    )
    .unwrap();
    assert_eq!(expired(&c), ["a-r0", "a-x"]);
}

#[test]
fn a_superseded_shards_failed_result_is_not_final() {
    let c = conn();
    // The same file read again by a newer normalizer supersedes `s1` (0031).
    c.execute(
        "INSERT INTO run_shards (id, workspace_id, project_id, run_id, source_format,
                source_file_sha256, normalizer_version, imported_by, imported_at, hlc)
         SELECT 's2', id, 'p1', 'run1', 'ctrf', ?2, 2, ?1, '2026-01-02T00:00:00Z', 'h2' FROM workspaces",
        params![OWNER, "ee".repeat(32)],
    )
    .unwrap();
    result(&c, "old", "k", 0, "failed", Some("s1"), 1);
    result(&c, "new", "k", 0, "passed", Some("s2"), 1);
    attach(&c, "a-old", "result", "old", "trace", 60);
    assert_eq!(expired(&c), ["a-old"]);
}

#[test]
fn a_project_setting_changes_the_days_and_is_audited() {
    let c = conn();
    result(&c, "pass", "t", 0, "passed", Some("s1"), 1);
    attach(&c, "nine", "result", "pass", "trace", 9);
    attach(&c, "eleven", "result", "pass", "trace", 11);
    attach(&c, "log", "result", "pass", "log", 100);
    assert_eq!(expired(&c), ["log"]);

    let got = get(&c, "p1", OWNER).unwrap();
    let trace = got.kinds.iter().find(|k| k.kind == "trace").unwrap();
    assert_eq!(
        trace,
        &EvidenceRetentionKind {
            kind: "trace".into(),
            default_days: Some(30),
            days: Some(30),
            custom: false
        }
    );
    assert!(set(
        &c,
        "p1",
        "trace",
        &RetentionPolicy::Days { days: 10 },
        OWNER
    )
    .unwrap());
    // The same value again changes nothing and leaves no event.
    assert!(!set(
        &c,
        "p1",
        "trace",
        &RetentionPolicy::Days { days: 10 },
        OWNER
    )
    .unwrap());
    assert_eq!(expired(&c), ["eleven", "log"]);

    let events: Vec<(String, String, String)> = c
        .prepare(
            "SELECT action, actor, changes FROM audit_log WHERE entity = 'evidence_retention'
              ORDER BY rowid",
        )
        .unwrap()
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].0, "update");
    let changes: Value = serde_json::from_str(&events[0].2).unwrap();
    assert_eq!(changes["trace"], serde_json::json!(["default", 10]));
    // Local: no oplog row.
    assert_eq!(
        c.query_row(
            "SELECT count(*) FROM oplog WHERE entity = 'evidence_retention'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );

    set(&c, "p1", "video", &RetentionPolicy::Always, OWNER).unwrap();
    let video = get(&c, "p1", OWNER).unwrap();
    let video = video.kinds.iter().find(|k| k.kind == "video").unwrap();
    assert_eq!((video.days, video.custom), (None, true));
    set(&c, "p1", "trace", &RetentionPolicy::Default, OWNER).unwrap();
    let trace = get(&c, "p1", OWNER).unwrap();
    let trace = trace.kinds.iter().find(|k| k.kind == "trace").unwrap();
    assert_eq!((trace.days, trace.custom), (Some(30), false));
}

#[test]
fn settings_are_checked() {
    let c = conn();
    assert_eq!(
        get(&c, "p1", "someone-else").unwrap_err(),
        "project-not-found"
    );
    assert!(set(&c, "p1", "trace", &RetentionPolicy::Always, "someone-else").is_err());
    assert!(set(&c, "p1", "photos", &RetentionPolicy::Always, OWNER)
        .unwrap_err()
        .starts_with("unknown evidence kind"));
    for days in [0, -1, MAX_DAYS + 1] {
        assert!(
            set(&c, "p1", "trace", &RetentionPolicy::Days { days }, OWNER)
                .unwrap_err()
                .starts_with("retention-days-out-of-range")
        );
    }
    let policy: RetentionPolicy = serde_json::from_str(r#"{"mode":"days","days":45}"#).unwrap();
    assert_eq!(policy, RetentionPolicy::Days { days: 45 });
}
