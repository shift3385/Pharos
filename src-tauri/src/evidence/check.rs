//! «Verificar evidencias» (DAT-03b, ADR-0014): a manual check of the evidence
//! store and the hand repairs it offers. Nothing here runs by itself.
//!
//! - **What it finds.** `.pev` files no `blobs` row knows (orphans), contents
//!   whose file is gone (`missing`) and files that do not decrypt or whose
//!   plaintext does not hash to their content (`damaged`). A file written by a
//!   newer Pharos is reported apart and never marked.
//! - **Never racing a save or the GC.** A check runs in three phases: a
//!   snapshot of `blobs` under the database lock; the scan and the decryption
//!   of every file *without* the lock (saving, attaching and `collect` go on);
//!   and a reconciliation under the lock that checks every finding again
//!   before keeping it. A file an attach committed meanwhile has its row by
//!   then (the store commit and the row share one lock), a content `collect`
//!   removed meanwhile has no row, and a damaged candidate is decrypted again,
//!   so a repair halfway through the scan is no false positive. Uploads still
//!   open write in `tmp/`, which the check never reads.
//! - **Marks.** `present → missing | damaged`, and back to `present` once the
//!   file is there and decrypts; `deleting` and `remote_only` are never
//!   touched. A content marked `damaged` is never deduplicated against
//!   (`EvidenceStore::is_damaged`, used by `BlobWriter::commit`), so attaching
//!   the same file again rewrites it and `record_blob` clears the mark.
//! - **Orphans are deleted by hand only**, the files the user confirmed, under
//!   the database lock, and never a file modified in the last 24 hours or open
//!   by another process: it may belong to an upload of another instance or to
//!   a database the user moved aside.
//! - **Audit.** Each deleted orphan and each check that changed a mark leaves
//!   an event through `journal::record_event_in`, as `system:evidence` on
//!   behalf of the user and with no project: in the device's local chain
//!   (hashed like every other), with no oplog row, since nothing of the store
//!   syncs yet (SYNC-04b).
//!
//! One check or repair at a time (`EvidenceCheck`). Logs carry counts only.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, TryLockError};
use std::time::{Duration, SystemTime};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Map};
use tauri::State;
#[cfg(test)]
use ts_rs::TS;

use super::{EvidenceStore, BLOCK, EVIDENCE_MISSING, EVIDENCE_NEWER, TMP};
use crate::db::{in_tx, Db};
use crate::journal::{self, Action, Actor};

/// Error prefix while another check or repair runs.
pub const CHECK_BUSY: &str = "evidence-check-busy";
/// An orphan modified more recently than this is never deleted.
pub(crate) const ORPHAN_MIN_AGE: Duration = Duration::from_secs(24 * 60 * 60);

// ---- the damaged marks the store honours ----------------------------------

impl EvidenceStore {
    /// True if a check marked this content `damaged`: its file must not be
    /// trusted for dedupe. A poisoned lock answers true (rewriting is safe).
    pub(crate) fn is_damaged(&self, sha256: &str) -> bool {
        self.damaged
            .lock()
            .map(|set| set.contains(sha256))
            .unwrap_or(true)
    }

    /// Forgets the mark of a content once its file was rewritten.
    pub(crate) fn forget_damaged(&self, sha256: &str) {
        if let Ok(mut set) = self.damaged.lock() {
            set.remove(sha256);
        }
    }

    fn set_damaged(&self, sha256: &str, damaged: bool) {
        if let Ok(mut set) = self.damaged.lock() {
            if damaged {
                set.insert(sha256.to_string());
            } else {
                set.remove(sha256);
            }
        }
    }

    /// `ab/ab…cd.pev` of a file under the store, with `/`.
    fn relative(&self, path: &Path) -> Option<String> {
        let rel = path.strip_prefix(&self.dir).ok()?;
        let parts: Vec<_> = rel.iter().map(|p| p.to_string_lossy()).collect();
        Some(parts.join("/"))
    }

    /// The path of `ab/<64 hex>.pev`, or None if the name is not one.
    fn orphan_path(&self, file: &str) -> Option<PathBuf> {
        let (folder, name) = file.split_once('/')?;
        let stem = name.strip_suffix(".pev")?;
        let hex = |s: &str| {
            s.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        };
        (folder.len() == 2 && stem.len() == 64 && hex(folder) && hex(stem) && stem[..2] == *folder)
            .then(|| self.dir.join(folder).join(name))
    }

    /// Every `.pev` under `evidence/<2 hex>/`, `tmp/` aside.
    fn pev_files(&self) -> Vec<PathBuf> {
        let mut out = Vec::new();
        let Ok(folders) = fs::read_dir(&self.dir) else {
            return out;
        };
        for folder in folders.filter_map(Result::ok) {
            if folder.file_name() == TMP || !folder.path().is_dir() {
                continue;
            }
            for file in fs::read_dir(folder.path()).into_iter().flatten().flatten() {
                let path = file.path();
                if path.extension().is_some_and(|e| e == "pev") && path.is_file() {
                    out.push(path);
                }
            }
        }
        out.sort();
        out
    }
}

/// Loads the `damaged` marks into the store (when the database opens).
pub(crate) fn load_damaged(conn: &Connection, store: &EvidenceStore) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT sha256 FROM blobs WHERE local_state = 'damaged'")
        .map_err(|e| e.to_string())?;
    let shas = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<HashSet<_>>>()
        .map_err(|e| e.to_string())?;
    if let Ok(mut set) = store.damaged.lock() {
        *set = shas;
    }
    Ok(())
}

/// Path of every content a `blobs` row knows.
fn known_paths(conn: &Connection, store: &EvidenceStore) -> Result<HashSet<PathBuf>, String> {
    let mut stmt = conn
        .prepare("SELECT sha256 FROM blobs")
        .map_err(|e| e.to_string())?;
    let shas = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(shas
        .iter()
        .filter_map(|sha| store.path_for(sha).ok())
        .collect())
}

// ---- verifying one file ---------------------------------------------------

/// What reading a content back gave.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Outcome {
    Intact,
    Missing,
    /// It does not decrypt, is truncated, or its plaintext does not match.
    Damaged,
    /// Written by a newer Pharos: not judged.
    Newer,
    /// The file could not be read (locked, no permission): not judged.
    Unreadable,
}

/// Reads a content back whole (streamed, one block at a time), reporting the
/// plaintext bytes read to `progress`.
pub(crate) fn verify_content(
    store: &EvidenceStore,
    sha256: &str,
    size: u64,
    progress: &mut dyn FnMut(u64),
) -> Outcome {
    let mut reader = match store.open(sha256) {
        Ok(r) => r,
        Err(e) if e.starts_with(EVIDENCE_MISSING) => return Outcome::Missing,
        Err(e) if e.starts_with(EVIDENCE_NEWER) => return Outcome::Newer,
        Err(e) if e.starts_with(super::EVIDENCE_UNREADABLE) => return Outcome::Damaged,
        Err(_) => return Outcome::Unreadable,
    };
    let mut buf = vec![0u8; BLOCK];
    let mut total = 0u64;
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                total += n as u64;
                progress(n as u64);
            }
            Err(e)
                if matches!(
                    e.kind(),
                    io::ErrorKind::InvalidData | io::ErrorKind::UnexpectedEof
                ) =>
            {
                return Outcome::Damaged
            }
            Err(_) => return Outcome::Unreadable,
        }
    }
    if total == size {
        Outcome::Intact
    } else {
        Outcome::Damaged
    }
}

// ---- the report -----------------------------------------------------------

/// A `.pev` no row knows.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceOrphan {
    /// `ab/<hmac>.pev`: the HMAC name, which reveals nothing of the content.
    pub file: String,
    pub size: u64,
    /// RFC 3339, UTC.
    pub modified: Option<String>,
    /// Modified in the last 24 hours: it will not be deleted.
    pub recent: bool,
}

/// One use of a content: an attachment and what it belongs to.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceUse {
    pub attachment_id: String,
    pub name: String,
    pub kind: String,
    pub owner_entity: String,
    pub owner_id: String,
    /// The card title, the defect key and title, the run key…: when found.
    pub owner_label: Option<String>,
    pub project_id: String,
    pub project_name: Option<String>,
}

/// A content with a problem, and where it is used.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceProblem {
    /// The file name (`ab/<hmac>.pev`), never the content hash.
    pub file: String,
    pub size: u64,
    pub uses: Vec<EvidenceUse>,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceReport {
    pub checked_at: String,
    /// Contents read back and bytes decrypted.
    pub checked: usize,
    pub bytes: u64,
    pub orphans: Vec<EvidenceOrphan>,
    pub missing: Vec<EvidenceProblem>,
    pub damaged: Vec<EvidenceProblem>,
    /// Written by a newer Pharos.
    pub newer: Vec<EvidenceProblem>,
    /// Could not be read this time (locked, no permission).
    pub unreadable: Vec<EvidenceProblem>,
    /// Marks this check set (`missing`/`damaged`) and cleared (`present`).
    pub marked: usize,
    pub restored: usize,
}

/// Progress of the check in course, for the UI.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceProgress {
    pub running: bool,
    pub files_done: usize,
    pub files_total: usize,
    pub bytes_done: u64,
    pub bytes_total: u64,
}

/// One check or repair at a time, its progress and its last report.
#[derive(Default)]
pub struct EvidenceCheck {
    busy: Mutex<()>,
    progress: Mutex<EvidenceProgress>,
    last: Mutex<Option<EvidenceReport>>,
}

impl EvidenceCheck {
    pub(crate) fn guard(&self) -> Result<MutexGuard<'_, ()>, String> {
        match self.busy.try_lock() {
            Ok(g) => Ok(g),
            Err(TryLockError::Poisoned(p)) => Ok(p.into_inner()),
            Err(TryLockError::WouldBlock) => Err(format!(
                "{CHECK_BUSY}: a check or a repair of the evidence is running"
            )),
        }
    }

    fn update(&self, f: impl FnOnce(&mut EvidenceProgress)) {
        if let Ok(mut p) = self.progress.lock() {
            f(&mut p);
        }
    }

    pub(crate) fn progress(&self) -> EvidenceProgress {
        self.progress.lock().map(|p| p.clone()).unwrap_or_default()
    }

    pub(crate) fn last(&self) -> Option<EvidenceReport> {
        self.last.lock().ok().and_then(|l| l.clone())
    }

    fn keep(&self, report: Option<EvidenceReport>) {
        if let Ok(mut l) = self.last.lock() {
            *l = report;
        }
    }
}

// ---- the three phases -----------------------------------------------------

/// Phase 1 (lock held): the rows to read back and the paths rows know.
pub(crate) struct Snapshot {
    /// (sha256, size, local_state) of every content with a file to check.
    blobs: Vec<(String, u64, String)>,
    known: HashSet<PathBuf>,
}

pub(crate) fn snapshot(conn: &Connection, store: &EvidenceStore) -> Result<Snapshot, String> {
    let mut stmt = conn
        .prepare(
            "SELECT sha256, size, local_state FROM blobs \
             WHERE local_state IN ('present', 'missing', 'damaged') ORDER BY sha256",
        )
        .map_err(|e| e.to_string())?;
    let blobs = stmt
        .query_map([], |r| {
            Ok((r.get(0)?, r.get::<_, i64>(1)?.max(0) as u64, r.get(2)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(Snapshot {
        blobs,
        known: known_paths(conn, store)?,
    })
}

/// Phase 2 (no lock): what the disk says.
pub(crate) struct Scan {
    orphans: Vec<PathBuf>,
    outcomes: Vec<(String, u64, String, Outcome)>,
    bytes: u64,
}

pub(crate) fn scan(store: &EvidenceStore, snap: Snapshot, check: Option<&EvidenceCheck>) -> Scan {
    if let Some(c) = check {
        let bytes_total = snap.blobs.iter().map(|b| b.1).sum();
        c.update(|p| {
            *p = EvidenceProgress {
                running: true,
                files_total: snap.blobs.len(),
                bytes_total,
                ..EvidenceProgress::default()
            }
        });
    }
    let orphans = store
        .pev_files()
        .into_iter()
        .filter(|p| !snap.known.contains(p))
        .collect();
    let mut bytes = 0;
    let mut outcomes = Vec::with_capacity(snap.blobs.len());
    for (sha, size, state) in snap.blobs {
        let outcome = verify_content(store, &sha, size, &mut |n| {
            bytes += n;
            if let Some(c) = check {
                c.update(|p| p.bytes_done += n);
            }
        });
        if let Some(c) = check {
            c.update(|p| p.files_done += 1);
        }
        outcomes.push((sha, size, state, outcome));
    }
    Scan {
        orphans,
        outcomes,
        bytes,
    }
}

fn rfc3339(conn: &Connection, t: SystemTime) -> Option<String> {
    let secs = t.duration_since(SystemTime::UNIX_EPOCH).ok()?.as_secs() as i64;
    conn.query_row(
        "SELECT strftime('%Y-%m-%dT%H:%M:%SZ', ?1, 'unixepoch')",
        params![secs],
        |r| r.get(0),
    )
    .ok()
}

/// True unless the file was modified at least `min` ago (an unknown or future
/// time counts as recent).
fn is_recent(path: &Path, now: SystemTime, min: Duration) -> bool {
    !matches!(age(path, now), Some(a) if a >= min)
}

fn age(path: &Path, now: SystemTime) -> Option<Duration> {
    let modified = fs::metadata(path).and_then(|m| m.modified()).ok()?;
    now.duration_since(modified).ok()
}

/// The live uses of a content, with what they belong to.
fn uses(conn: &Connection, sha256: &str) -> Result<Vec<EvidenceUse>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.name, a.kind, a.owner_entity, a.owner_id, a.project_id, p.name \
             FROM attachments a LEFT JOIN projects p ON p.id = a.project_id \
             WHERE a.sha256 = ?1 AND a.deleted_at IS NULL AND a.blob_purged_at IS NULL \
             ORDER BY a.created_at, a.id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![sha256], |r| {
            Ok(EvidenceUse {
                attachment_id: r.get(0)?,
                name: r.get(1)?,
                kind: r.get(2)?,
                owner_entity: r.get(3)?,
                owner_id: r.get(4)?,
                owner_label: None,
                project_id: r.get(5)?,
                project_name: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|mut u| {
            u.owner_label = owner_label(conn, &u.owner_entity, &u.owner_id);
            u
        })
        .collect())
}

/// A readable name for what an attachment belongs to; None if unknown.
fn owner_label(conn: &Connection, entity: &str, id: &str) -> Option<String> {
    let sql = match entity {
        "planner_card" => "SELECT title FROM planner_cards WHERE id = ?1",
        "defect" => {
            "SELECT CASE WHEN defect_key = '' THEN title ELSE defect_key || ' · ' || title END \
             FROM defects WHERE id = ?1"
        }
        "test_case" => "SELECT title FROM test_cases WHERE id = ?1",
        "run_shard" => {
            "SELECT r.run_key || ' · ' || r.title FROM run_shards s \
             JOIN runs r ON r.id = s.run_id WHERE s.id = ?1"
        }
        "result" => {
            "SELECT r.run_key || ' · ' || x.test_key FROM results x \
             JOIN runs r ON r.id = x.run_id WHERE x.id = ?1"
        }
        "step_result" => {
            "SELECT r.run_key || ' · ' || x.test_key FROM step_results s \
             JOIN results x ON x.id = s.result_id JOIN runs r ON r.id = x.run_id WHERE s.id = ?1"
        }
        _ => return None,
    };
    conn.query_row(sql, params![id], |r| r.get::<_, String>(0))
        .optional()
        .ok()
        .flatten()
}

fn problem(
    conn: &Connection,
    store: &EvidenceStore,
    sha: &str,
    size: u64,
) -> Result<EvidenceProblem, String> {
    let path = store.path_for(sha)?;
    Ok(EvidenceProblem {
        file: store.relative(&path).unwrap_or_default(),
        size,
        uses: uses(conn, sha)?,
    })
}

fn system(user: Option<&str>) -> Actor {
    Actor::System {
        component: "evidence",
        on_behalf_of: user.filter(|u| !u.is_empty()).map(String::from),
    }
}

/// Phase 3 (lock held): every finding checked again, the marks written in one
/// transaction, and the report.
pub(crate) fn reconcile(
    conn: &Connection,
    store: &EvidenceStore,
    scan: Scan,
    user: Option<&str>,
    now: SystemTime,
) -> Result<EvidenceReport, String> {
    let known = known_paths(conn, store)?;
    let mut report = EvidenceReport {
        checked_at: rfc3339(conn, now).unwrap_or_default(),
        checked: scan.outcomes.len(),
        bytes: scan.bytes,
        ..EvidenceReport::default()
    };
    for path in scan.orphans {
        if known.contains(&path) || !path.is_file() {
            continue;
        }
        let modified = fs::metadata(&path).and_then(|m| m.modified()).ok();
        report.orphans.push(EvidenceOrphan {
            file: store.relative(&path).unwrap_or_default(),
            size: fs::metadata(&path).map(|m| m.len()).unwrap_or(0),
            modified: modified.and_then(|m| rfc3339(conn, m)),
            recent: is_recent(&path, now, ORPHAN_MIN_AGE),
        });
    }
    let mut marks: Vec<(String, &'static str)> = Vec::new();
    for (sha, size, _, outcome) in scan.outcomes {
        let state: Option<String> = conn
            .query_row(
                "SELECT local_state FROM blobs WHERE sha256 = ?1",
                params![sha],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        // Gone (collected) or released meanwhile: nothing to say.
        let Some(state) = state.filter(|s| matches!(s.as_str(), "present" | "missing" | "damaged"))
        else {
            continue;
        };
        // A finding is only kept if it still holds now, with the lock held.
        let outcome = if outcome == Outcome::Intact {
            outcome
        } else {
            verify_content(store, &sha, size, &mut |_| {})
        };
        // Not judged (newer format, unreadable now): the mark stays as it is.
        let Some(target) = (match outcome {
            Outcome::Intact => Some("present"),
            Outcome::Missing => Some("missing"),
            Outcome::Damaged => Some("damaged"),
            Outcome::Newer | Outcome::Unreadable => None,
        }) else {
            match outcome {
                Outcome::Newer => report.newer.push(problem(conn, store, &sha, size)?),
                _ => report.unreadable.push(problem(conn, store, &sha, size)?),
            }
            continue;
        };
        match outcome {
            Outcome::Missing => report.missing.push(problem(conn, store, &sha, size)?),
            Outcome::Damaged => report.damaged.push(problem(conn, store, &sha, size)?),
            _ => {}
        }
        if target != state {
            if target == "present" {
                report.restored += 1;
            } else {
                report.marked += 1;
            }
            marks.push((sha, target));
        }
    }
    if !marks.is_empty() {
        in_tx(conn, |tx| {
            for (sha, target) in &marks {
                tx.execute(
                    "UPDATE blobs SET local_state = ?2 WHERE sha256 = ?1 \
                     AND local_state IN ('present', 'missing', 'damaged')",
                    params![sha, target],
                )
                .map_err(|e| e.to_string())?;
            }
            journal::record_event_in(
                tx,
                system(user),
                Action::Update,
                "evidence_check",
                &uuid::Uuid::new_v4().to_string(),
                None,
                Map::new(),
                Some(json!({
                    "checked": report.checked,
                    "orphans": report.orphans.len(),
                    "missing": report.missing.len(),
                    "damaged": report.damaged.len(),
                    "marked": report.marked,
                    "restored": report.restored,
                })),
            )
        })?;
        for (sha, target) in &marks {
            store.set_damaged(sha, *target == "damaged");
        }
    }
    tracing::info!(
        checked = report.checked,
        orphans = report.orphans.len(),
        missing = report.missing.len(),
        damaged = report.damaged.len(),
        marked = report.marked,
        restored = report.restored,
        "evidence checked"
    );
    Ok(report)
}

/// A whole check against an open database.
pub(crate) fn run(
    db: &Db,
    check: &EvidenceCheck,
    user: Option<&str>,
) -> Result<EvidenceReport, String> {
    let _guard = check.guard()?;
    let outcome = (|| {
        let snap = db.with_conn(|c| snapshot(c, db.evidence()))?;
        let scan = scan(db.evidence(), snap, Some(check));
        let report =
            db.with_conn(|c| reconcile(c, db.evidence(), scan, user, SystemTime::now()))?;
        if report.marked + report.restored > 0 {
            db.persist()?;
        }
        Ok(report)
    })();
    check.update(|p| p.running = false);
    if let Ok(report) = &outcome {
        check.keep(Some(report.clone()));
    }
    outcome
}

// ---- deleting orphans by hand ---------------------------------------------

/// Why an orphan the user chose was not deleted.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceSkipped {
    pub file: String,
    /// `invalid` | `gone` | `known` (a row has it now) | `recent` | `in_use` | `error`.
    pub reason: String,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceDeleted {
    pub deleted: usize,
    pub bytes: u64,
    pub skipped: Vec<EvidenceSkipped>,
}

/// True if another process has the file open (Windows: an open without
/// sharing fails). Any failure counts as in use, so the file stays.
#[cfg(windows)]
fn in_use(path: &Path) -> bool {
    use std::os::windows::fs::OpenOptionsExt;
    fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(path)
        .is_err()
}

/// Elsewhere an open file can be unlinked safely (its reader keeps it).
#[cfg(not(windows))]
fn in_use(_path: &Path) -> bool {
    false
}

/// Deletes the orphans the user confirmed, with the lock held: each must still
/// be an orphan, older than `min_age` and not open. One local audit event per
/// deleted file.
pub(crate) fn delete_orphans(
    conn: &Connection,
    store: &EvidenceStore,
    files: &[String],
    user: Option<&str>,
    now: SystemTime,
    min_age: Duration,
) -> Result<EvidenceDeleted, String> {
    let known = known_paths(conn, store)?;
    let mut out = EvidenceDeleted::default();
    let mut seen = HashSet::new();
    for file in files {
        if !seen.insert(file.as_str()) {
            continue;
        }
        let skip = |reason: &str| EvidenceSkipped {
            file: file.clone(),
            reason: reason.to_string(),
        };
        let Some(path) = store.orphan_path(file) else {
            out.skipped.push(skip("invalid"));
            continue;
        };
        if !path.is_file() {
            out.skipped.push(skip("gone"));
            continue;
        }
        if known.contains(&path) {
            out.skipped.push(skip("known"));
            continue;
        }
        if is_recent(&path, now, min_age) {
            out.skipped.push(skip("recent"));
            continue;
        }
        if in_use(&path) {
            out.skipped.push(skip("in_use"));
            continue;
        }
        let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        if fs::remove_file(&path).is_err() {
            out.skipped.push(skip("error"));
            continue;
        }
        if let Some(parent) = path.parent() {
            let _ = fs::remove_dir(parent);
        }
        let mut changes = Map::new();
        changes.insert("file".into(), json!([file, null]));
        journal::record_event_in(
            conn,
            system(user),
            Action::Delete,
            "evidence_file",
            file,
            None,
            changes,
            Some(json!({"reason": "orphan", "size": size})),
        )?;
        out.deleted += 1;
        out.bytes += size;
    }
    tracing::info!(
        deleted = out.deleted,
        skipped = out.skipped.len(),
        "evidence orphans deleted by hand"
    );
    Ok(out)
}

// ---- usage ----------------------------------------------------------------

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceOwnerUsage {
    pub owner_entity: String,
    pub attachments: i64,
    pub bytes: i64,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceStateCount {
    pub state: String,
    pub blobs: i64,
    pub bytes: i64,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceRetentionOverride {
    pub project_id: String,
    pub project_name: Option<String>,
    pub days: Option<i64>,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceUsage {
    /// Contents and bytes on this device (rows not `deleting`).
    pub blobs: i64,
    pub bytes: i64,
    pub by_state: Vec<EvidenceStateCount>,
    /// Live attachments by what they belong to.
    pub by_owner: Vec<EvidenceOwnerUsage>,
    /// Attachments whose content expired by retention (the row stays).
    pub expired: i64,
    /// Raw reports: the default days (None = always) and project overrides.
    pub raw_report_days: Option<i64>,
    pub raw_report_overrides: Vec<EvidenceRetentionOverride>,
    pub raw_reports: i64,
    pub raw_reports_expired: i64,
    pub last: Option<EvidenceReport>,
}

fn count(conn: &Connection, sql: &str) -> Result<i64, String> {
    conn.query_row(sql, [], |r| r.get(0))
        .map_err(|e| e.to_string())
}

pub(crate) fn usage(conn: &Connection) -> Result<EvidenceUsage, String> {
    let by_state = {
        let mut stmt = conn
            .prepare(
                "SELECT local_state, count(*), coalesce(sum(size), 0) FROM blobs \
                 GROUP BY local_state ORDER BY local_state",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(EvidenceStateCount {
                    state: r.get(0)?,
                    blobs: r.get(1)?,
                    bytes: r.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())?
    };
    let by_owner = {
        let mut stmt = conn
            .prepare(
                "SELECT owner_entity, count(*), coalesce(sum(size), 0) FROM attachments \
                 WHERE deleted_at IS NULL AND blob_purged_at IS NULL \
                 GROUP BY owner_entity ORDER BY owner_entity",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(EvidenceOwnerUsage {
                    owner_entity: r.get(0)?,
                    attachments: r.get(1)?,
                    bytes: r.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())?
    };
    let raw_report_overrides = {
        let mut stmt = conn
            .prepare(
                "SELECT r.project_id, p.name, r.days FROM evidence_retention r \
                 LEFT JOIN projects p ON p.id = r.project_id \
                 WHERE r.kind = 'raw_report' ORDER BY p.name, r.project_id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(EvidenceRetentionOverride {
                    project_id: r.get(0)?,
                    project_name: r.get(1)?,
                    days: r.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())?
    };
    let live = |s: &&EvidenceStateCount| s.state != "deleting";
    Ok(EvidenceUsage {
        blobs: by_state.iter().filter(live).map(|s| s.blobs).sum(),
        bytes: by_state.iter().filter(live).map(|s| s.bytes).sum(),
        by_state,
        by_owner,
        expired: count(
            conn,
            "SELECT count(*) FROM attachments WHERE deleted_at IS NULL AND blob_purged_at IS NOT NULL",
        )?,
        raw_report_days: super::DEFAULT_RETENTION
            .iter()
            .find(|(k, _)| *k == "raw_report")
            .and_then(|(_, d)| *d),
        raw_report_overrides,
        raw_reports: count(
            conn,
            "SELECT count(*) FROM attachments WHERE kind = 'raw_report' \
             AND deleted_at IS NULL AND blob_purged_at IS NULL",
        )?,
        raw_reports_expired: count(
            conn,
            "SELECT count(*) FROM attachments WHERE kind = 'raw_report' \
             AND deleted_at IS NULL AND blob_purged_at IS NOT NULL",
        )?,
        last: None,
    })
}

// ---- commands -------------------------------------------------------------

/// Usage of the evidence store, and the last check of this session.
#[tauri::command]
pub fn evidence_usage(db: State<Db>, check: State<EvidenceCheck>) -> Result<EvidenceUsage, String> {
    let mut usage = db.with_conn(usage)?;
    usage.last = check.last();
    Ok(usage)
}

/// Progress of the check in course.
#[tauri::command]
pub fn evidence_check_progress(check: State<EvidenceCheck>) -> EvidenceProgress {
    check.progress()
}

/// «Verificar evidencias»: reads every content back and marks what is missing
/// or damaged. Long: it runs off the main thread and without the database lock
/// while it decrypts.
#[tauri::command(async)]
pub fn evidence_check(
    db: State<'_, Db>,
    check: State<'_, EvidenceCheck>,
    user_id: Option<String>,
) -> Result<EvidenceReport, String> {
    run(&db, &check, user_id.as_deref())
}

/// Deletes the orphans the user confirmed (see `delete_orphans`).
#[tauri::command(async)]
pub fn evidence_orphans_delete(
    db: State<'_, Db>,
    check: State<'_, EvidenceCheck>,
    files: Vec<String>,
    user_id: Option<String>,
) -> Result<EvidenceDeleted, String> {
    let _guard = check.guard()?;
    let out = db.with_conn(|c| {
        delete_orphans(
            c,
            db.evidence(),
            &files,
            user_id.as_deref(),
            SystemTime::now(),
            ORPHAN_MIN_AGE,
        )
    })?;
    if out.deleted > 0 {
        db.persist()?;
        // The orphans just deleted leave the last report.
        if let Some(mut last) = check.last() {
            let gone: HashSet<&str> = files.iter().map(String::as_str).collect();
            let kept: HashMap<&str, &EvidenceSkipped> =
                out.skipped.iter().map(|s| (s.file.as_str(), s)).collect();
            last.orphans
                .retain(|o| !gone.contains(o.file.as_str()) || kept.contains_key(o.file.as_str()));
            check.keep(Some(last));
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests;
