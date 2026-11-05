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
    // The upgrade happened long ago: no grace in these tests unless one sets it.
    since_upgrade(&c, 3650);
    c
}

/// Sets when DAT-03c started on this device, `days` ago.
fn since_upgrade(c: &Connection, days: i64) {
    set_state_ms(c, ENABLED_KEY, wall_ms() - days * DAY_MS).unwrap();
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
    let sha = format!("{:x}", Sha256::digest(id.as_bytes()));
    attach_sha(c, id, &sha, owner_entity, owner, kind, age);
}

/// `attach` with a given content (two uses of one file).
fn attach_sha(
    c: &Connection,
    id: &str,
    sha256: &str,
    owner_entity: &str,
    owner: &str,
    kind: &str,
    age: i64,
) {
    let stored = Stored {
        sha256: sha256.to_string(),
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

fn blob_state(c: &Connection, sha256: &str) -> String {
    c.query_row(
        "SELECT local_state FROM blobs WHERE sha256 = ?1",
        [sha256],
        |r| r.get(0),
    )
    .unwrap()
}

// ---- review round (H1, M1, L2, L3) --------------------------------------------

#[test]
fn an_upgrade_expires_no_result_evidence_before_one_full_window() {
    let c = conn();
    result(&c, "pass", "t", 0, "passed", Some("s1"), 1);
    attach(&c, "old-trace", "result", "pass", "trace", 400);
    attach(&c, "old-report", "run_shard", "s1", "raw_report", 400);
    c.execute("DELETE FROM sync_state WHERE key = ?1", [ENABLED_KEY])
        .unwrap();
    // The first pass after the upgrade records it and keeps the old trace;
    // the raw report already expired before DAT-03c and still does.
    assert_eq!(expired(&c), ["old-report"]);
    assert!(state_ms(&c, ENABLED_KEY).unwrap().is_some());
    // 29 days later: still kept. 31 days later: the window passed.
    since_upgrade(&c, 29);
    assert_eq!(expired(&c), ["old-report"]);
    since_upgrade(&c, 31);
    assert_eq!(expired(&c), ["old-report", "old-trace"]);
}

#[test]
fn a_clock_far_ahead_advances_the_expiry_at_most_a_week_per_pass() {
    let c = conn();
    result(&c, "pass", "t", 0, "passed", Some("s1"), 1);
    attach(&c, "a40", "result", "pass", "trace", 40);
    attach(&c, "a400", "result", "pass", "trace", 400);
    // The last pass was a year ago: this pass counts as a week after it.
    set_state_ms(&c, LAST_PASS_KEY, wall_ms() - 365 * DAY_MS).unwrap();
    c.execute("DELETE FROM sync_state WHERE key = 'hlc_last'", [])
        .unwrap();
    assert_eq!(expired(&c), ["a400"]);
    let last = state_ms(&c, LAST_PASS_KEY).unwrap().unwrap();
    let expected = wall_ms() - (365 - MAX_CLOCK_STEP_DAYS) * DAY_MS;
    assert!((last - expected).abs() < 60_000, "{last} vs {expected}");
    // A recent HLC (this device or one it synced with) is a reference too.
    let hlc = crate::hlc::Hlc {
        wall_ms: wall_ms() as u64,
        counter: 0,
        device_id: "d".into(),
    };
    c.execute(
        "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('hlc_last', ?1)",
        [hlc.encode()],
    )
    .unwrap();
    assert_eq!(expired(&c), ["a40", "a400"]);
}

#[test]
fn one_pass_expires_at_most_its_cap_and_the_next_goes_on() {
    let c = conn();
    result(&c, "pass", "t", 0, "passed", Some("s1"), 1);
    for n in 0..=MAX_PER_PASS {
        attach(&c, &format!("a{n:04}"), "result", "pass", "trace", 60);
    }
    assert_eq!(expire(&c).unwrap(), MAX_PER_PASS);
    assert_eq!(expire(&c).unwrap(), 1);
    assert_eq!(expire(&c).unwrap(), 0);
}

#[test]
fn a_link_that_arrives_before_its_defect_keeps_the_evidence() {
    let c = conn();
    result(&c, "x", "k", 0, "passed", Some("s1"), 1);
    attach(&c, "a-x", "result", "x", "trace", 60);
    c.execute(
        "INSERT INTO defect_links (id, workspace_id, project_id, defect_id, target_kind, target_id,
                created_by, updated_by, created_at, updated_at)
         SELECT 'l1', id, 'p1', 'late', 'result', 'x', ?1, ?1, datetime('now'),
                datetime('now') FROM workspaces",
        [OWNER],
    )
    .unwrap();
    assert!(expired(&c).is_empty());
    // The defect arrives, closed: the exception ends.
    defect(&c, "late", "closed", "other");
    assert_eq!(expired(&c), ["a-x"]);
}

#[test]
fn a_content_shared_with_a_use_that_never_expires_stays_on_disk() {
    let c = conn();
    result(&c, "pass", "t-pass", 0, "passed", Some("s1"), 1);
    result(&c, "fail", "t-fail", 0, "failed", Some("s1"), 1);
    let sha = "ab".repeat(32);
    attach_sha(&c, "a-pass", &sha, "result", "pass", "trace", 60);
    attach_sha(&c, "a-fail", &sha, "result", "fail", "trace", 60);
    assert_eq!(expired(&c), ["a-pass"]);
    // The failed result's use keeps the file.
    assert_eq!(blob_state(&c, &sha), "present");
}

#[test]
fn a_defect_copy_of_a_result_file_keeps_it_when_the_result_use_expires() {
    let c = conn();
    result(&c, "pass", "t", 0, "passed", Some("s1"), 1);
    let sha = "cd".repeat(32);
    attach_sha(&c, "a-result", &sha, "result", "pass", "trace", 60);
    // «Crear defecto» copies the result's evidence as a row of the defect.
    attach_sha(&c, "a-defect", &sha, "defect", "d1", "trace", 60);
    assert_eq!(expired(&c), ["a-result"]);
    assert_eq!(blob_state(&c, &sha), "present");
    // The defect's own row never expires.
    assert_eq!(expired(&c), ["a-result"]);
}

#[test]
fn a_final_attempt_that_changes_after_a_sync_ends_the_exception() {
    let c = conn();
    result(&c, "r0", "k", 0, "failed", Some("s1"), 1);
    attach(&c, "a-r0", "result", "r0", "trace", 60);
    assert!(expired(&c).is_empty());
    // Another device's retry, later, arrives by sync (an append-only insert).
    c.execute(
        "INSERT INTO run_shards (id, workspace_id, project_id, run_id, source_format,
                source_file_sha256, imported_by, imported_at, hlc)
         SELECT 's9', id, 'p1', 'run1', 'ctrf', ?2, ?1, '2026-01-02T00:00:00Z', 'h9' FROM workspaces",
        params![OWNER, "99".repeat(32)],
    )
    .unwrap();
    result(&c, "r1", "k", 1, "passed", Some("s9"), 5);
    assert_eq!(expired(&c), ["a-r0"]);
}

#[test]
fn the_preview_counts_what_a_shorter_setting_would_expire() {
    let c = conn();
    result(&c, "pass", "t", 0, "passed", Some("s1"), 1);
    result(&c, "fail", "u", 0, "failed", Some("s1"), 1);
    attach(&c, "a5", "result", "pass", "trace", 5);
    attach(&c, "a15", "result", "pass", "trace", 15);
    attach(&c, "f15", "result", "fail", "trace", 15);
    assert_eq!(would_expire(&c, "p1", "trace", Some(10), OWNER).unwrap(), 1);
    assert_eq!(would_expire(&c, "p1", "trace", Some(1), OWNER).unwrap(), 2);
    assert_eq!(would_expire(&c, "p1", "trace", None, OWNER).unwrap(), 0);
    assert_eq!(would_expire(&c, "p1", "video", Some(1), OWNER).unwrap(), 0);
    assert!(would_expire(&c, "p1", "trace", Some(1), "someone-else").is_err());
    // It writes nothing.
    assert!(expired(&c).is_empty());
}
