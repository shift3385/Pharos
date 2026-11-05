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

thread_local! {
    /// Makes `remove_orphan` fail on this thread.
    pub(super) static FAIL_REMOVE: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

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
    link(c, &stored);
    stored
}

/// One more live attachment (a planner card's) of a stored content.
fn link(c: &Connection, stored: &Stored) {
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

/// Three days from now: files written by a test are «old» by then.
fn later() -> SystemTime {
    SystemTime::now() + Duration::from_secs(3 * 24 * 3600)
}

/// Sets a file's modification time.
fn touch(path: &Path, at: SystemTime) {
    let f = OpenOptions::new().write(true).open(path).unwrap();
    f.set_modified(at).unwrap();
}

/// Sets a file's modification and creation times (Windows keeps both).
#[cfg(windows)]
fn set_times(path: &Path, at: SystemTime) {
    use std::fs::FileTimes;
    use std::os::windows::fs::FileTimesExt;
    let f = OpenOptions::new().write(true).open(path).unwrap();
    f.set_times(FileTimes::new().set_modified(at).set_created(at))
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
                // Stored and recorded under one lock, as an attach does
                // (the store commit and the row share it).
                db.with_conn(|c| {
                    let stored = db
                        .evidence()
                        .put(&format!("save {i}").into_bytes()[..], u64::MAX)?;
                    record_blob(c, &stored, None)
                })
                .unwrap();
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
    let old_len = fs::metadata(store.path_for(&old.sha256).unwrap())
        .unwrap()
        .len();
    let recent = store.put(&b"recent orphan"[..], u64::MAX).unwrap();
    let now = later();
    touch(&store.path_for(&recent.sha256).unwrap(), now);
    // An orphan in the report that got its row before the user confirmed.
    let adopted = store.put(&b"adopted"[..], u64::MAX).unwrap();
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
    let out = delete_orphans(&c, &store, &files, Some(OWNER), now, ORPHAN_MIN_AGE).unwrap();
    assert_eq!(out.deleted, 1);
    assert_eq!(out.bytes, old_len);
    assert!(out.saved);
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
    let file = store.relative(&path).unwrap();
    let held = File::open(&path).unwrap();
    let out = delete_orphans(
        &c,
        &store,
        std::slice::from_ref(&file),
        None,
        later(),
        ORPHAN_MIN_AGE,
    )
    .unwrap();
    assert_eq!(out.deleted, 0);
    assert_eq!(out.skipped[0].reason, "in_use");
    drop(held);
    let out = delete_orphans(&c, &store, &[file], None, later(), ORPHAN_MIN_AGE).unwrap();
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
    let gone = attach(&c, &store, b"gone!");
    c.execute(
        "UPDATE blobs SET local_state = 'missing' WHERE sha256 = ?1",
        params![gone.sha256],
    )
    .unwrap();
    c.execute(
        "INSERT INTO evidence_retention (project_id, kind, days) VALUES ('p1', 'raw_report', 30)",
        [],
    )
    .unwrap();
    let u = usage(&c).unwrap();
    // A missing content is not on this disk: counted apart, by state.
    assert_eq!(u.blobs, 2);
    assert_eq!(u.bytes, 6);
    let missing = u.by_state.iter().find(|s| s.state == "missing").unwrap();
    assert_eq!((missing.blobs, missing.bytes), (1, 5));
    assert_eq!(u.by_owner.len(), 1);
    assert_eq!(u.by_owner[0].owner_entity, "planner_card");
    assert_eq!(u.by_owner[0].attachments, 3);
    assert_eq!(u.raw_report_days, Some(90));
    assert_eq!(u.raw_report_overrides[0].days, Some(30));
    assert_eq!(
        u.raw_report_overrides[0].project_name.as_deref(),
        Some("Tienda")
    );
    fs::remove_dir_all(&dir).unwrap();
}

#[cfg(windows)]
#[test]
fn a_copied_or_restored_orphan_counts_as_new() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let old = store.put(&b"from a backup"[..], u64::MAX).unwrap();
    let path = store.path_for(&old.sha256).unwrap();
    let long_ago = SystemTime::now() - Duration::from_secs(30 * 24 * 3600);
    set_times(&path, long_ago);
    assert!(!is_recent(&path, SystemTime::now(), ORPHAN_MIN_AGE));
    // A copy keeps the modification time but is created now.
    let copy = dir
        .join("evidence")
        .join("ab")
        .join(format!("ab{}.pev", "1".repeat(62)));
    fs::create_dir_all(copy.parent().unwrap()).unwrap();
    fs::copy(&path, &copy).unwrap();
    let meta = fs::metadata(&copy).unwrap();
    assert!(meta.modified().unwrap() < SystemTime::now() - ORPHAN_MIN_AGE);
    assert!(is_recent(&copy, SystemTime::now(), ORPHAN_MIN_AGE));
    let c = conn();
    let report = check(&c, &store);
    let copied = report
        .orphans
        .iter()
        .find(|o| o.file.starts_with("ab/"))
        .unwrap();
    assert!(copied.recent);
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn only_names_the_store_writes_are_listed_as_orphans() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let c = conn();
    fs::create_dir_all(dir.join("evidence").join("zz")).unwrap();
    fs::write(dir.join("evidence").join("zz").join("notes.pev"), b"x").unwrap();
    let ours = store.put(&b"ours"[..], u64::MAX).unwrap();
    let report = check(&c, &store);
    assert_eq!(report.orphans.len(), 1);
    assert_eq!(
        report.orphans[0].file,
        store
            .relative(&store.path_for(&ours.sha256).unwrap())
            .unwrap()
    );
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn a_file_that_changes_after_it_was_read_is_reported_not_marked() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let c = conn();
    let stored = attach(&c, &store, &sample(BLOCK + 3));
    flip_inside(&store, &stored.sha256);
    let snap = snapshot(&c, &store).unwrap();
    let scan = scan(&store, snap, None);
    // Rewritten (a repair, say) between the scan and the reconciliation.
    touch(&store.path_for(&stored.sha256).unwrap(), later());
    let report = reconcile(&c, &store, scan, Some(OWNER), SystemTime::now()).unwrap();
    assert!(report.damaged.is_empty());
    assert_eq!(report.unreadable.len(), 1);
    assert_eq!(report.marked, 0);
    assert_eq!(state(&c, &stored.sha256).as_deref(), Some("present"));
    assert!(!store.is_damaged(&stored.sha256));
    // Checked again, it is judged.
    assert_eq!(check(&c, &store).damaged.len(), 1);
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn a_cancelled_check_judges_only_what_it_read() {
    let dir = temp_dir();
    let db = Db::open_with_key(&dir, KEY).unwrap();
    let missing = db
        .with_conn(|c| {
            attach(c, db.evidence(), b"one");
            attach(c, db.evidence(), b"two");
            Ok(attach(c, db.evidence(), b"three"))
        })
        .unwrap();
    fs::remove_file(db.evidence().path_for(&missing.sha256).unwrap()).unwrap();
    let check = EvidenceCheck::default();
    // Cancelled before its first file: nothing read, nothing marked.
    check.request_cancel();
    let snap = db.with_conn(|c| snapshot(c, db.evidence())).unwrap();
    let scanned = scan(db.evidence(), snap, Some(&check));
    let report = db
        .with_conn(|c| reconcile(c, db.evidence(), scanned, None, SystemTime::now()))
        .unwrap();
    assert!(report.cancelled);
    assert_eq!((report.checked, report.total), (0, 3));
    assert_eq!(report.marked, 0);
    // A new check starts uncancelled and reads everything.
    let full = run(&db, &check, None).unwrap();
    assert!(!full.cancelled);
    assert_eq!((full.checked, full.total, full.missing.len()), (3, 3, 1));
    drop(db);
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn the_damaged_mark_survives_release_collect_and_a_restart() {
    let dir = temp_dir();
    let db = Db::open_with_key(&dir, KEY).unwrap();
    let bytes = sample(BLOCK + 11);
    let stored = db
        .with_conn(|c| Ok(attach(c, db.evidence(), &bytes)))
        .unwrap();
    flip_inside(db.evidence(), &stored.sha256);
    let check = EvidenceCheck::default();
    assert_eq!(run(&db, &check, None).unwrap().damaged.len(), 1);
    // Its only use is deleted (released), then a new use appears before the
    // collect (a defect created from a result, say).
    db.with_conn(|c| {
        c.execute(
            "UPDATE attachments SET deleted_at = 'x' WHERE sha256 = ?1",
            params![stored.sha256],
        )
        .map_err(|e| e.to_string())?;
        release(c, &stored.sha256)?;
        assert_eq!(state(c, &stored.sha256).as_deref(), Some("deleting"));
        link(c, &stored);
        Ok(())
    })
    .unwrap();
    db.persist_and_collect().unwrap();
    db.with_conn(|c| {
        assert_eq!(state(c, &stored.sha256).as_deref(), Some("damaged"));
        Ok(())
    })
    .unwrap();
    drop(db);
    // After a restart the mark is still there, and attaching again repairs it.
    let db = Db::open_with_key(&dir, KEY).unwrap();
    assert!(db.evidence().is_damaged(&stored.sha256));
    db.with_conn(|c| {
        assert_eq!(state(c, &stored.sha256).as_deref(), Some("damaged"));
        let mut writer = db.evidence().writer(u64::MAX)?;
        writer.write(&bytes)?;
        let committed = writer.commit(db.evidence())?;
        assert!(committed.wrote);
        record_blob(c, &committed.stored, None)?;
        assert_eq!(state(c, &stored.sha256).as_deref(), Some("present"));
        Ok(())
    })
    .unwrap();
    drop(db);
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn orphans_are_not_deleted_when_another_process_saved_the_database() {
    let dir = temp_dir();
    let db = Db::open_with_key(&dir, KEY).unwrap();
    db.persist().unwrap();
    let orphan = db.evidence().put(&b"orphan"[..], u64::MAX).unwrap();
    let file = db
        .evidence()
        .relative(&db.evidence().path_for(&orphan.sha256).unwrap())
        .unwrap();
    // A second Pharos on the same data folder saves its database.
    std::thread::sleep(Duration::from_millis(20));
    let other = Db::open_with_key(&dir, KEY).unwrap();
    other.with_conn(ensure_workspace).unwrap();
    other.persist().unwrap();
    drop(other);
    let check = EvidenceCheck::default();
    let files = [file];
    let err = delete_confirmed(&db, &check, &files, None, later(), ORPHAN_MIN_AGE).unwrap_err();
    assert!(err.starts_with(DB_CHANGED), "{err}");
    assert!(db.evidence().path_for(&orphan.sha256).unwrap().exists());
    // Once this process has written the file again, it is its own state.
    db.persist().unwrap();
    let out = delete_confirmed(&db, &check, &files, None, later(), ORPHAN_MIN_AGE).unwrap();
    assert_eq!(out.deleted, 1);
    drop(db);
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn deleted_orphans_are_reported_even_if_saving_fails() {
    let dir = temp_dir();
    let db = Db::open_with_key(&dir, KEY).unwrap();
    db.persist().unwrap();
    let orphan = db.evidence().put(&b"orphan"[..], u64::MAX).unwrap();
    let file = db
        .evidence()
        .relative(&db.evidence().path_for(&orphan.sha256).unwrap())
        .unwrap();
    // The save's temp path is taken by a folder: saving fails.
    fs::create_dir(dir.join("pharos.db.enc.new")).unwrap();
    let check = EvidenceCheck::default();
    let out = delete_confirmed(&db, &check, &[file], Some(OWNER), later(), ORPHAN_MIN_AGE).unwrap();
    assert_eq!(out.deleted, 1);
    assert!(!out.saved);
    assert!(!db.evidence().path_for(&orphan.sha256).unwrap().exists());
    // The event is kept in memory, for the next save.
    assert_eq!(db.with_conn(|c| Ok(events(c, "evidence_file"))).unwrap(), 1);
    fs::remove_dir(dir.join("pharos.db.enc.new")).unwrap();
    drop(db);
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn a_file_that_cannot_be_removed_leaves_no_event() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let c = conn();
    let orphan = store.put(&b"stays"[..], u64::MAX).unwrap();
    let path = store.path_for(&orphan.sha256).unwrap();
    let file = store.relative(&path).unwrap();
    FAIL_REMOVE.with(|f| f.set(true));
    let out = delete_orphans(
        &c,
        &store,
        std::slice::from_ref(&file),
        None,
        later(),
        ORPHAN_MIN_AGE,
    );
    FAIL_REMOVE.with(|f| f.set(false));
    let out = out.unwrap();
    assert_eq!(out.deleted, 0);
    assert_eq!(out.skipped[0].reason, "error");
    assert!(path.exists());
    // The event written first was rolled back with its savepoint.
    assert_eq!(events(&c, "evidence_file"), 0);
    assert!(c.is_autocommit());
    // The next file goes through normally, with its event.
    let out = delete_orphans(&c, &store, &[file], None, later(), ORPHAN_MIN_AGE).unwrap();
    assert_eq!(out.deleted, 1);
    assert_eq!(events(&c, "evidence_file"), 1);
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn a_file_whose_event_cannot_be_written_is_kept() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let c = conn();
    let orphan = store.put(&b"kept"[..], u64::MAX).unwrap();
    let path = store.path_for(&orphan.sha256).unwrap();
    let file = store.relative(&path).unwrap();
    c.execute_batch("ALTER TABLE audit_log RENAME TO audit_log_away")
        .unwrap();
    let out = delete_orphans(&c, &store, &[file], None, later(), ORPHAN_MIN_AGE).unwrap();
    assert_eq!((out.deleted, out.skipped[0].reason.as_str()), (0, "error"));
    assert!(path.exists());
    assert!(c.is_autocommit());
    fs::remove_dir_all(&dir).unwrap();
}
