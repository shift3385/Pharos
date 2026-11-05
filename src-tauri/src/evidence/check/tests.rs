use std::fs::{File, OpenOptions};
use std::io::{Seek, SeekFrom, Write};
use std::time::Instant;

use super::*;
use crate::db::ensure_workspace;
use crate::evidence::tests::sample;
use crate::evidence::{insert_attachment, record_blob, release, AttachmentRow, Stored, Uploads};

const KEY: [u8; 32] = [7u8; 32];
const OTHER_KEY: [u8; 32] = [8u8; 32];
const OWNER: &str = "u1";

fn temp_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pharos-check-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn conn() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    crate::db::run_migrations(&c).unwrap();
    let ws = ensure_workspace(&c).unwrap();
    c.execute(
        "INSERT INTO projects (id, workspace_id, owner_id, name, created_by, updated_by, \
         created_at, updated_at) VALUES ('p1', ?1, ?2, 'Tienda', ?2, ?2, datetime('now'), datetime('now'))",
        params![ws, OWNER],
    )
    .unwrap();
    c
}

/// Stores `bytes`, records its row and one live attachment of a planner card.
fn attach(c: &Connection, store: &EvidenceStore, bytes: &[u8]) -> Stored {
    let stored = store.put(bytes, u64::MAX).unwrap();
    record_blob(c, &stored, None).unwrap();
    let ws = ensure_workspace(c).unwrap();
    insert_attachment(
        c,
        &AttachmentRow {
            id: &uuid::Uuid::new_v4().to_string(),
            workspace_id: &ws,
            project_id: "p1",
            owner_entity: "planner_card",
            owner_id: "card-1",
            name: "captura.png",
            mime: Some("image/png"),
            kind: "evidence",
            sha256: &stored.sha256,
            size: stored.size as i64,
            user: OWNER,
        },
    )
    .unwrap();
    stored
}

fn state(c: &Connection, sha: &str) -> Option<String> {
    c.query_row(
        "SELECT local_state FROM blobs WHERE sha256 = ?1",
        params![sha],
        |r| r.get(0),
    )
    .optional()
    .unwrap()
}

fn check(c: &Connection, store: &EvidenceStore) -> EvidenceReport {
    let snap = snapshot(c, store).unwrap();
    let scan = scan(store, snap, None);
    reconcile(c, store, scan, Some(OWNER), SystemTime::now()).unwrap()
}

/// Flips one ciphertext byte inside the first block: same length, same header.
fn flip_inside(store: &EvidenceStore, sha: &str) {
    let path = store.path_for(sha).unwrap();
    let mut f = OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .unwrap();
    f.seek(SeekFrom::Start(HEADER_OFFSET)).unwrap();
    let mut b = [0u8; 1];
    f.read_exact(&mut b).unwrap();
    f.seek(SeekFrom::Start(HEADER_OFFSET)).unwrap();
    f.write_all(&[b[0] ^ 0x01]).unwrap();
}
const HEADER_OFFSET: u64 = 20;

/// Makes a file look `days` old.
fn age_file(path: &Path, days: u64) {
    let f = OpenOptions::new().write(true).open(path).unwrap();
    f.set_modified(SystemTime::now() - Duration::from_secs(days * 24 * 3600))
        .unwrap();
}

fn events(c: &Connection, entity: &str) -> i64 {
    c.query_row(
        "SELECT count(*) FROM audit_log WHERE entity = ?1",
        params![entity],
        |r| r.get(0),
    )
    .unwrap()
}

fn audit_oplog_rows(c: &Connection) -> i64 {
    c.query_row(
        "SELECT count(*) FROM oplog WHERE entity = 'audit_event'",
        [],
        |r| r.get(0),
    )
    .unwrap()
}

fn local_chain_holds(c: &Connection) {
    let device = crate::oplog::device_id(c).unwrap();
    let ws = ensure_workspace(c).unwrap();
    let links = crate::audit::verify_chain(c, &device, &ws, "")
        .unwrap()
        .expect("the local chain verifies");
    assert!(links > 0);
}

#[test]
fn a_check_finds_orphans_missing_and_damaged_contents_and_marks_them() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let c = conn();
    let intact = attach(&c, &store, &sample(70_000));
    let missing = attach(&c, &store, b"missing");
    fs::remove_file(store.path_for(&missing.sha256).unwrap()).unwrap();
    let damaged = attach(&c, &store, &sample(3 * BLOCK + 5)[1..]);
    flip_inside(&store, &damaged.sha256);
    // A file no row knows, and a content being deleted (its file gone).
    let orphan = store.put(&b"orphan"[..], u64::MAX).unwrap();
    let deleting = store.put(&b"deleting"[..], u64::MAX).unwrap();
    record_blob(&c, &deleting, None).unwrap();
    release(&c, &deleting.sha256).unwrap();
    store.remove(&deleting.sha256).unwrap();

    let report = check(&c, &store);
    assert_eq!(report.checked, 3);
    assert_eq!(report.orphans.len(), 1);
    let orphan_file = store
        .relative(&store.path_for(&orphan.sha256).unwrap())
        .unwrap();
    assert_eq!(report.orphans[0].file, orphan_file);
    assert!(report.orphans[0].recent, "just written");
    assert_eq!(report.missing.len(), 1);
    assert_eq!(report.damaged.len(), 1);
    assert_eq!((report.marked, report.restored), (2, 0));
    // Where they are used: the card and its project, never the hash.
    let use_ = &report.damaged[0].uses[0];
    assert_eq!(use_.owner_entity, "planner_card");
    assert_eq!(use_.name, "captura.png");
    assert_eq!(use_.project_name.as_deref(), Some("Tienda"));
    let json = serde_json::to_string(&report).unwrap();
    for sha in [&intact.sha256, &missing.sha256, &damaged.sha256] {
        assert!(!json.contains(sha.as_str()));
    }

    assert_eq!(state(&c, &intact.sha256).as_deref(), Some("present"));
    assert_eq!(state(&c, &missing.sha256).as_deref(), Some("missing"));
    assert_eq!(state(&c, &damaged.sha256).as_deref(), Some("damaged"));
    assert_eq!(state(&c, &deleting.sha256).as_deref(), Some("deleting"));
    assert!(store.is_damaged(&damaged.sha256));
    // One local event: hashed into the device chain, no oplog row.
    assert_eq!(events(&c, "evidence_check"), 1);
    assert_eq!(audit_oplog_rows(&c), 0);
    local_chain_holds(&c);
    // Checking again changes nothing and leaves no new event.
    let again = check(&c, &store);
    assert_eq!((again.marked, again.restored), (0, 0));
    assert_eq!(again.missing.len() + again.damaged.len(), 2);
    assert_eq!(events(&c, "evidence_check"), 1);
    // The marks survive a reopen of the store (loaded from the rows).
    let reopened = EvidenceStore::new(&dir, &KEY);
    load_damaged(&c, &reopened).unwrap();
    assert!(reopened.is_damaged(&damaged.sha256));
    assert!(!reopened.is_damaged(&intact.sha256));
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn a_damaged_copy_of_the_same_length_is_repaired_by_attaching_it_again() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let c = conn();
    let bytes = sample(2 * BLOCK + 9);
    let stored = attach(&c, &store, &bytes);
    let path = store.path_for(&stored.sha256).unwrap();
    let len = fs::metadata(&path).unwrap().len();
    flip_inside(&store, &stored.sha256);
    assert_eq!(fs::metadata(&path).unwrap().len(), len);
    // Unmarked, the cheap dedupe check cannot see it: that is why a check marks it.
    let mut writer = store.writer(u64::MAX).unwrap();
    writer.write(&bytes).unwrap();
    assert!(!writer.commit(&store).unwrap().wrote);

    let report = check(&c, &store);
    assert_eq!(report.damaged.len(), 1);
    assert_eq!(state(&c, &stored.sha256).as_deref(), Some("damaged"));

    // Attaching the same file again rewrites it and clears the mark.
    let mut writer = store.writer(u64::MAX).unwrap();
    writer.write(&bytes).unwrap();
    let committed = writer.commit(&store).unwrap();
    assert!(
        committed.wrote,
        "a marked copy is never deduplicated against"
    );
    record_blob(&c, &committed.stored, None).unwrap();
    assert!(!store.is_damaged(&stored.sha256));
    assert_eq!(state(&c, &stored.sha256).as_deref(), Some("present"));
    let mut out = Vec::new();
    store
        .open(&stored.sha256)
        .unwrap()
        .read_to_end(&mut out)
        .unwrap();
    assert_eq!(out, bytes);
    let after = check(&c, &store);
    assert!(after.damaged.is_empty() && after.missing.is_empty());
    assert_eq!((after.marked, after.restored), (0, 0));
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn a_file_that_came_back_is_marked_present_again() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let c = conn();
    let stored = attach(&c, &store, b"comes back");
    let path = store.path_for(&stored.sha256).unwrap();
    let saved = fs::read(&path).unwrap();
    fs::remove_file(&path).unwrap();
    assert_eq!(check(&c, &store).marked, 1);
    assert_eq!(state(&c, &stored.sha256).as_deref(), Some("missing"));
    fs::write(&path, saved).unwrap();
    let report = check(&c, &store);
    assert_eq!((report.marked, report.restored), (0, 1));
    assert!(report.missing.is_empty());
    assert_eq!(state(&c, &stored.sha256).as_deref(), Some("present"));
    assert_eq!(events(&c, "evidence_check"), 2);
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn another_key_is_damaged_and_a_newer_format_is_reported_without_a_mark() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let other = EvidenceStore::new(&dir, &OTHER_KEY);
    let c = conn();
    // The file of `foreign` holds content encrypted with another key.
    let foreign = attach(&c, &store, b"foreign");
    let theirs = other.put(&b"foreign"[..], u64::MAX).unwrap();
    fs::copy(
        other.path_for(&theirs.sha256).unwrap(),
        store.path_for(&foreign.sha256).unwrap(),
    )
    .unwrap();
    let newer = attach(&c, &store, b"newer");
    let path = store.path_for(&newer.sha256).unwrap();
    let mut f = OpenOptions::new().write(true).open(&path).unwrap();
    f.seek(SeekFrom::Start(4)).unwrap();
    f.write_all(&[2]).unwrap();
    drop(f);

    let report = check(&c, &store);
    assert_eq!(report.damaged.len(), 1);
    assert_eq!(report.newer.len(), 1);
    assert_eq!(state(&c, &foreign.sha256).as_deref(), Some("damaged"));
    assert_eq!(state(&c, &newer.sha256).as_deref(), Some("present"));
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn a_check_during_uploads_never_reports_what_they_write() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let c = conn();
    let uploads = Uploads::default();
    let now = Instant::now();
    // Every upload slot taken, each with chunks already written to `tmp/`.
    let ids: Vec<String> = (0..super::super::MAX_OPEN_UPLOADS)
        .map(|i| {
            let id = uploads.begin(store.writer(u64::MAX).unwrap(), now).unwrap();
            uploads.append(&id, &sample(BLOCK + i)[i..], now).unwrap();
            id
        })
        .collect();
    assert!(uploads.begin(store.writer(u64::MAX).unwrap(), now).is_err());
    let collected = attach(&c, &store, b"collected meanwhile");

    // Phase 1, then attaches and a collect land before the scan (as they
    // may: the scan holds no lock).
    let snap = snapshot(&c, &store).unwrap();
    let first = uploads.take(&ids[0]).unwrap();
    let committed = first.commit(&store).unwrap();
    record_blob(&c, &committed.stored, None).unwrap();
    c.execute(
        "UPDATE attachments SET deleted_at = 'x' WHERE sha256 = ?1",
        params![collected.sha256],
    )
    .unwrap();
    release(&c, &collected.sha256).unwrap();
    crate::evidence::collect(&c, &store).unwrap();
    // Phase 2 sees the new file without a known row, and the collected one gone.
    let scan = scan(&store, snap, None);
    assert_eq!(scan.orphans.len(), 1);
    // Phase 3 checks again under the lock: neither is reported.
    let report = reconcile(&c, &store, scan, Some(OWNER), SystemTime::now()).unwrap();
    assert!(report.orphans.is_empty(), "{:?}", report.orphans);
    assert!(report.missing.is_empty());
    assert_eq!(report.marked, 0);

    // The uploads still open were not touched: they go on and commit.
    for id in &ids[1..] {
        uploads.append(id, b"more", Instant::now()).unwrap();
        let committed = uploads.take(id).unwrap().commit(&store).unwrap();
        record_blob(&c, &committed.stored, None).unwrap();
    }
    let after = check(&c, &store);
    assert!(after.orphans.is_empty() && after.damaged.is_empty() && after.missing.is_empty());
    assert!(!dir
        .join("evidence")
        .join(TMP)
        .read_dir()
        .unwrap()
        .any(|_| true));
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn a_check_runs_alongside_saves_and_one_check_runs_at_a_time() {
    let dir = temp_dir();
    let db = Db::open_with_key(&dir, KEY).unwrap();
    db.with_conn(|c| {
        for i in 0..20 {
            let stored = db.evidence().put(&sample(BLOCK + i)[..], u64::MAX)?;
            record_blob(c, &stored, None)?;
        }
        Ok(())
    })
    .unwrap();
    let check = EvidenceCheck::default();
    std::thread::scope(|s| {
        let saver = s.spawn(|| {
            for i in 0..30 {
                let stored = db
                    .evidence()
                    .put(&format!("save {i}").into_bytes()[..], u64::MAX)
                    .unwrap();
                db.with_conn(|c| record_blob(c, &stored, None)).unwrap();
                db.persist_and_collect().unwrap();
            }
        });
        let report = run(&db, &check, Some(OWNER)).unwrap();
        saver.join().unwrap();
        assert!(report.orphans.is_empty() && report.missing.is_empty());
        assert!(report.damaged.is_empty());
    });
    assert!(!check.progress().running);
    assert!(check.last().is_some());
    // While one runs, another (or a repair) is refused.
    let guard = check.guard().unwrap();
    assert!(run(&db, &check, None).unwrap_err().starts_with(CHECK_BUSY));
    drop(guard);
    assert!(run(&db, &check, None).is_ok());
    drop(db);
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn orphans_are_deleted_only_when_confirmed_old_and_still_orphans() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let c = conn();
    let rel = |s: &Stored| store.relative(&store.path_for(&s.sha256).unwrap()).unwrap();
    let old = store.put(&b"old orphan"[..], u64::MAX).unwrap();
    age_file(&store.path_for(&old.sha256).unwrap(), 3);
    let old_len = fs::metadata(store.path_for(&old.sha256).unwrap())
        .unwrap()
        .len();
    let recent = store.put(&b"recent orphan"[..], u64::MAX).unwrap();
    // An orphan in the report that got its row before the user confirmed.
    let adopted = store.put(&b"adopted"[..], u64::MAX).unwrap();
    age_file(&store.path_for(&adopted.sha256).unwrap(), 3);
    record_blob(&c, &adopted, None).unwrap();
    let files = vec![
        rel(&old),
        rel(&old),
        rel(&recent),
        rel(&adopted),
        "../pharos.db.enc".to_string(),
        "zz/notahash.pev".to_string(),
        format!("00/{}.pev", "0".repeat(64)),
    ];
    let out = delete_orphans(
        &c,
        &store,
        &files,
        Some(OWNER),
        SystemTime::now(),
        ORPHAN_MIN_AGE,
    )
    .unwrap();
    assert_eq!(out.deleted, 1);
    assert_eq!(out.bytes, old_len);
    let reasons: Vec<_> = out.skipped.iter().map(|s| s.reason.as_str()).collect();
    assert_eq!(reasons, ["recent", "known", "invalid", "invalid", "gone"]);
    assert!(!store.path_for(&old.sha256).unwrap().exists());
    assert!(store.path_for(&recent.sha256).unwrap().exists());
    assert!(store.path_for(&adopted.sha256).unwrap().exists());
    assert_eq!(events(&c, "evidence_file"), 1);
    assert_eq!(audit_oplog_rows(&c), 0);
    local_chain_holds(&c);
    let (actor, behalf): (String, Option<String>) = c
        .query_row(
            "SELECT actor, on_behalf_of FROM audit_log WHERE entity = 'evidence_file'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(actor, "system:evidence");
    assert_eq!(behalf.as_deref(), Some("user:u1"));
    fs::remove_dir_all(&dir).unwrap();
}

#[cfg(windows)]
#[test]
fn an_orphan_open_by_another_process_is_kept() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let c = conn();
    let orphan = store.put(&b"held open"[..], u64::MAX).unwrap();
    let path = store.path_for(&orphan.sha256).unwrap();
    age_file(&path, 3);
    let file = store.relative(&path).unwrap();
    let held = File::open(&path).unwrap();
    let out = delete_orphans(
        &c,
        &store,
        std::slice::from_ref(&file),
        None,
        SystemTime::now(),
        ORPHAN_MIN_AGE,
    )
    .unwrap();
    assert_eq!(out.deleted, 0);
    assert_eq!(out.skipped[0].reason, "in_use");
    drop(held);
    let out = delete_orphans(&c, &store, &[file], None, SystemTime::now(), ORPHAN_MIN_AGE).unwrap();
    assert_eq!(out.deleted, 1);
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn usage_counts_contents_owners_and_raw_report_retention() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let c = conn();
    attach(&c, &store, b"one");
    attach(&c, &store, b"two");
    c.execute(
        "INSERT INTO evidence_retention (project_id, kind, days) VALUES ('p1', 'raw_report', 30)",
        [],
    )
    .unwrap();
    let u = usage(&c).unwrap();
    assert_eq!(u.blobs, 2);
    assert_eq!(u.bytes, 6);
    assert_eq!(u.by_owner.len(), 1);
    assert_eq!(u.by_owner[0].owner_entity, "planner_card");
    assert_eq!(u.by_owner[0].attachments, 2);
    assert_eq!(u.raw_report_days, Some(90));
    assert_eq!(u.raw_report_overrides[0].days, Some(30));
    assert_eq!(
        u.raw_report_overrides[0].project_name.as_deref(),
        Some("Tienda")
    );
    fs::remove_dir_all(&dir).unwrap();
}
