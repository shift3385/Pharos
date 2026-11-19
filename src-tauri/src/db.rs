//! Local SQLite on disk, encrypted per page (SEC-05, ADR-0050). The database
//! is `pharos.db` (+ `-wal`/`-shm`, WAL mode), encrypted with SQLite3 Multiple
//! Ciphers in the SQLCipher 4 scheme (pharos-sqlite3mc-sys, SEC-04). Every
//! page is encrypted, the WAL too, and temporary tables stay in memory: no
//! plaintext reaches disk. Saving is SQLite's commit: it writes the pages that
//! changed, not the whole database.
//!
//! Key: the 32-byte `db-key` in the OS keychain stays the only secret. The
//! page key is `HKDF-SHA256(db_key, "pharos-page-v1")`, given raw (no PBKDF),
//! so the recovery keys already exported (ADR-0024) and `evidence/` (ADR-0014)
//! keep working.
//!
//! Before 0.6 the database lived in memory and was saved whole to
//! `pharos.db.enc` as one AES-256-GCM blob. On the first open it is converted
//! (`convert_legacy`): the blob is kept byte for byte as
//! `pharos.db.enc.bak-<version>-<last migration>`, pending migrations run in
//! memory, `VACUUM INTO` writes `pharos.db.convert`, which is checked and
//! renamed to `pharos.db`, and `pharos.db.enc` becomes a small witness whose
//! unknown migration `disk-format-v2` makes a 0.5 refuse it with its usual
//! message instead of starting empty. Every step can be resumed.
//!
//! Data compatibility (SEC-06, VERSIONING §6): before applying pending
//! migrations to an existing database it is copied (encrypted, SQLite's backup
//! API) to `pharos.db.bak-<app version>-<last migration>` (the newest 3 are
//! kept), and a database that already carries migrations this build does not
//! know (written by a newer Pharos) is refused without writing anything.
//!
//! Recovery (SEC-03, ADR-0024): the key can be exported as a recovery key
//! (recovery.rs). A key is only generated on a fresh install: if the keychain
//! entry is missing while a database exists (new PC, reinstalled Windows),
//! opening fails with `KEY_MISSING_ERROR` instead of silently storing a new
//! key, and `db_recover` opens the database with the recovery key and stores
//! it in the keychain again.
//!
//! Evidence (DAT-03, ADR-0014): attachment contents live next to the database
//! in `evidence/` (evidence.rs), keyed from the same key; `Db` owns that store,
//! migration 0023 moves the old planner attachment BLOBs into it, and
//! `persist_and_collect` removes files only after the commit that released them.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::ptr::NonNull;
use std::sync::Mutex;

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::Engine as _;
use hkdf::Hkdf;
use keyring::Entry;
use rusqlite::serialize::OwnedData;
use rusqlite::{params, Connection, ErrorCode, OptionalExtension, MAIN_DB};
use sha2::{Digest, Sha256};

use crate::evidence::{self, EvidenceStore};
use crate::recovery;

const KEYCHAIN_SERVICE: &str = "pharos";
const KEYCHAIN_DB_KEY: &str = "db-key";
const B64: base64::engine::general_purpose::GeneralPurpose =
    base64::engine::general_purpose::STANDARD;
const NONCE_LEN: usize = 12;
/// Version stamped on the backups (`pharos.db.bak-<version>-<migration>`).
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
/// Prefix of the `Db::open` error for a database written by a newer Pharos. The
/// UI matches it to show a translated, blocking message.
pub const NEWER_DB_ERROR: &str = "db-newer-than-app";
/// Prefix of the `Db::open` error when the keychain has no key but an
/// encrypted database exists: the UI offers to enter the recovery key.
pub const KEY_MISSING_ERROR: &str = "db-key-missing";
/// Prefix of the `Db::open` error when the keychain key does not decrypt the
/// database (another key, or a damaged file): the UI offers recovery too.
pub const KEY_MISMATCH_ERROR: &str = "db-key-mismatch";
/// Prefix of the `db_recover` error for a well-formed recovery key that does
/// not decrypt the database.
pub const WRONG_RECOVERY_KEY: &str = "recovery-key-wrong";
/// Prefix of the `Db::open` error when there is not enough free space to
/// convert `pharos.db.enc` safely; nothing was changed.
pub const CONVERT_NO_SPACE_ERROR: &str = "db-convert-no-space";
/// Prefix of the `Db::open` error when converting `pharos.db.enc` failed; the
/// original file and its backup are intact.
pub const CONVERT_FAILED_ERROR: &str = "db-convert-failed";
/// Prefix of the `Db::open` error when `pharos.db.enc` is a witness but
/// `pharos.db`, where the data moved, is not there.
pub const DB_MISSING_ERROR: &str = "db-missing";
const DECRYPT_ERROR: &str = "failed to decrypt local database";

/// The database, encrypted per page (SEC-05).
const DB_FILE: &str = "pharos.db";
/// The database before 0.6: one encrypted image, now a witness.
const LEGACY_FILE: &str = "pharos.db.enc";
/// What a conversion writes before it is checked and renamed to `DB_FILE`.
const CONVERT_FILE: &str = "pharos.db.convert";
/// The migration a converted `pharos.db.enc` (the witness) carries, unknown to
/// every Pharos before 0.6, so they refuse it (SEC-06).
const WITNESS_MIGRATION: &str = "disk-format-v2";
/// Where the sha256 of the converted `pharos.db.enc` is kept in `sync_state`.
const CONVERTED_FROM_KEY: &str = "converted_from";
/// HKDF info of the page key.
const PAGE_KEY_INFO: &[u8] = b"pharos-page-v1";
/// How long a write waits for another connection's write (WAL).
const BUSY_TIMEOUT_MS: u32 = 5_000;

pub(crate) const MIGRATIONS: &[(&str, &str)] = &[
    ("0001_init.sql", include_str!("../migrations/0001_init.sql")),
    (
        "0002_test_plans.sql",
        include_str!("../migrations/0002_test_plans.sql"),
    ),
    (
        "0003_test_cases.sql",
        include_str!("../migrations/0003_test_cases.sql"),
    ),
    (
        "0004_projects.sql",
        include_str!("../migrations/0004_projects.sql"),
    ),
    (
        "0005_project_ownership.sql",
        include_str!("../migrations/0005_project_ownership.sql"),
    ),
    (
        "0006_planner.sql",
        include_str!("../migrations/0006_planner.sql"),
    ),
    (
        "0007_templates.sql",
        include_str!("../migrations/0007_templates.sql"),
    ),
    (
        "0008_oplog.sql",
        include_str!("../migrations/0008_oplog.sql"),
    ),
    (
        "0009_sync_state.sql",
        include_str!("../migrations/0009_sync_state.sql"),
    ),
    (
        "0010_traceability.sql",
        include_str!("../migrations/0010_traceability.sql"),
    ),
    (
        "0011_sync_conflicts.sql",
        include_str!("../migrations/0011_sync_conflicts.sql"),
    ),
    (
        "0012_sync_per_user.sql",
        include_str!("../migrations/0012_sync_per_user.sql"),
    ),
    (
        "0013_requirement_key_collisions.sql",
        include_str!("../migrations/0013_requirement_key_collisions.sql"),
    ),
    (
        "0015_audit_actor_repair.sql",
        include_str!("../migrations/0015_audit_actor_repair.sql"),
    ),
    (
        "0016_key_counters.sql",
        include_str!("../migrations/0016_key_counters.sql"),
    ),
    (
        "0017_keys_and_purge.sql",
        include_str!("../migrations/0017_keys_and_purge.sql"),
    ),
    (
        "0018_template_owner.sql",
        include_str!("../migrations/0018_template_owner.sql"),
    ),
    (
        "0019_audit_log.sql",
        include_str!("../migrations/0019_audit_log.sql"),
    ),
    (
        "0020_test_case_revisions.sql",
        include_str!("../migrations/0020_test_case_revisions.sql"),
    ),
    (
        "0021_stable_steps.sql",
        include_str!("../migrations/0021_stable_steps.sql"),
    ),
    (
        "0022_evidence.sql",
        include_str!("../migrations/0022_evidence.sql"),
    ),
    (
        "0023_planner_attachments_out.sql",
        include_str!("../migrations/0023_planner_attachments_out.sql"),
    ),
    (
        "0024_execution.sql",
        include_str!("../migrations/0024_execution.sql"),
    ),
    (
        "0026_case_fields.sql",
        include_str!("../migrations/0026_case_fields.sql"),
    ),
    (
        "0027_case_fields_restore.sql",
        include_str!("../migrations/0027_case_fields_restore.sql"),
    ),
    (
        "0028_cycles.sql",
        include_str!("../migrations/0028_cycles.sql"),
    ),
    (
        "0029_defects.sql",
        include_str!("../migrations/0029_defects.sql"),
    ),
    (
        "0031_import_review.sql",
        include_str!("../migrations/0031_import_review.sql"),
    ),
    (
        "0037_plan_export_history.sql",
        include_str!("../migrations/0037_plan_export_history.sql"),
    ),
    (
        "0038_requirement_data.sql",
        include_str!("../migrations/0038_requirement_data.sql"),
    ),
    (
        "0039_risk_bands.sql",
        include_str!("../migrations/0039_risk_bands.sql"),
    ),
    (
        "0040_workspaces.sql",
        include_str!("../migrations/0040_workspaces.sql"),
    ),
    (
        "0042_case_baselines.sql",
        include_str!("../migrations/0042_case_baselines.sql"),
    ),
    (
        "0043_notifications.sql",
        include_str!("../migrations/0043_notifications.sql"),
    ),
    (
        "0046_blobs_sync.sql",
        include_str!("../migrations/0046_blobs_sync.sql"),
    ),
];

/// Migration whose SQL runs only after Rust moved the planner attachment BLOBs
/// into the evidence store (DAT-03, ADR-0014); the image is vacuumed after it.
const PLANNER_ATTACHMENTS_OUT: &str = "0023_planner_attachments_out.sql";

/// Data migrations written in Rust (VERSIONING §6.1), run right after the SQL
/// of the migration they are named after, in the same savepoint. Each one is
/// deterministic and idempotent.
type RustStep = fn(&Connection) -> Result<(), String>;
const RUST_STEPS: &[(&str, RustStep)] = &[
    (
        "0021_stable_steps.sql",
        crate::revisions::migrate_stable_steps,
    ),
    (
        "0027_case_fields_restore.sql",
        crate::custom_fields::migrate_restore,
    ),
    ("0029_defects.sql", crate::defects::migrate_planner_defects),
];

pub struct Db {
    conn: Mutex<Connection>,
    /// `pharos.db`.
    db_path: PathBuf,
    key: [u8; 32],
    /// `evidence/` next to the database, keyed from `key` (ADR-0014).
    evidence: EvidenceStore,
    /// `PRAGMA data_version` as this process last left the database: it
    /// changes only when another connection commits, so a change by another
    /// process can be told (DAT-03b: deleting orphan evidence refuses then).
    seen_version: Mutex<i64>,
    /// `pharos.lock`, held open while this `Db` lives (D4, ADR-0050).
    _lock: fs::File,
}

/// Prefix of the `Db::open` error when another process (the app or the CLI)
/// has this data folder open. Until SEC-05b only one process may use it.
pub const DB_IN_USE_ERROR: &str = "db-in-use";

/// Name of the lock file next to the database.
const LOCK_FILE: &str = "pharos.lock";

/// Opens `pharos.lock` sharing only deletion, so a second process fails to
/// open it until this one closes it (on exit too, so a crash never leaves it
/// locked), while the folder can still be removed. Windows is the shipped
/// target; elsewhere the file is opened without a lock.
fn lock_data_dir(dir: &Path) -> Result<fs::File, String> {
    let path = dir.join(LOCK_FILE);
    let mut options = fs::OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // FILE_SHARE_DELETE only: no other reader or writer.
        options.share_mode(0x4);
    }
    options.open(&path).map_err(|e| {
        // ERROR_SHARING_VIOLATION: another process holds the file.
        if e.raw_os_error() == Some(32) {
            format!(
                "{DB_IN_USE_ERROR}: another Pharos process (the app or the CLI) is using \
                 this data folder. Close it and try again."
            )
        } else {
            format!("failed to lock the data folder: {e}")
        }
    })
}

/// Where the database key is kept: the OS keychain in the app, memory in tests.
pub(crate) trait KeyStore {
    /// The stored key. An entry that is not a valid key is a
    /// `KEY_MISMATCH_ERROR`, so the recovery key can replace it.
    fn load(&self) -> Result<Option<[u8; 32]>, String>;
    fn store(&self, key: &[u8; 32]) -> Result<(), String>;
    /// Keeps the key a recovery replaces, once (the older one is dropped).
    fn keep_previous(&self, key: &[u8; 32]) -> Result<(), String>;
}

/// The `db-key` account of the OS keychain. It is shared by every local
/// instance, E2E profiles included (instance.rs).
pub(crate) struct Keychain;

/// Account that keeps the key replaced by the last recovery (ADR-0024).
const KEYCHAIN_PREVIOUS_DB_KEY: &str = "db-key.prev";

impl Keychain {
    fn entry(account: &str) -> Result<Entry, String> {
        Entry::new(KEYCHAIN_SERVICE, account).map_err(|e| e.to_string())
    }
}

impl KeyStore for Keychain {
    fn load(&self) -> Result<Option<[u8; 32]>, String> {
        match Self::entry(KEYCHAIN_DB_KEY)?.get_password() {
            Ok(b64) => B64
                .decode(b64)
                .ok()
                .and_then(|bytes| <[u8; 32]>::try_from(bytes).ok())
                .map(Some)
                .ok_or_else(|| {
                    format!(
                        "{KEY_MISMATCH_ERROR}: the key in the system keychain is damaged. \
                         Enter the recovery key."
                    )
                }),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    fn store(&self, key: &[u8; 32]) -> Result<(), String> {
        Self::entry(KEYCHAIN_DB_KEY)?
            .set_password(&B64.encode(key))
            .map_err(|e| e.to_string())
    }

    fn keep_previous(&self, key: &[u8; 32]) -> Result<(), String> {
        Self::entry(KEYCHAIN_PREVIOUS_DB_KEY)?
            .set_password(&B64.encode(key))
            .map_err(|e| e.to_string())
    }
}

impl Db {
    /// Opens (or creates) the encrypted database under `app_data_dir`.
    pub fn open(app_data_dir: &Path) -> Result<Self, String> {
        Self::open_with_store(app_data_dir, &Keychain)
    }

    /// Opens with the key in `store`. A key is generated and stored only when
    /// there is no database yet; otherwise a missing or non-matching key is an
    /// error the UI answers with the recovery key.
    fn open_with_store(app_data_dir: &Path, store: &dyn KeyStore) -> Result<Self, String> {
        let saved = has_saved_file(app_data_dir)?;
        let key = match store.load() {
            Ok(Some(key)) => key,
            Ok(None) if saved => {
                return Err(format!(
                    "{KEY_MISSING_ERROR}: the key of the local database is not in the \
                     system keychain. Enter the recovery key to open it."
                ))
            }
            // A damaged entry with nothing saved here opens nothing: replace it
            // like a missing one.
            Ok(None) => new_key(store)?,
            Err(e) if e.starts_with(KEY_MISMATCH_ERROR) && !saved => new_key(store)?,
            Err(e) => return Err(e),
        };
        Self::open_with_key(app_data_dir, key).map_err(|e| {
            if e == DECRYPT_ERROR {
                format!(
                    "{KEY_MISMATCH_ERROR}: the key in the system keychain does not open the \
                     local database (another key, or a damaged file). Enter the recovery key."
                )
            } else {
                e
            }
        })
    }

    /// Opens an existing database with a typed recovery key and, once it
    /// decrypts, stores the key in `store` (SEC-03). The key it replaces is kept
    /// once with `keep_previous`. A malformed or wrong key leaves the files and
    /// the store untouched: the database must decrypt before anything else.
    pub(crate) fn recover(
        app_data_dir: &Path,
        store: &dyn KeyStore,
        recovery_key: &str,
    ) -> Result<Self, String> {
        let key = recovery::decode(recovery_key)?;
        if !has_saved_file(app_data_dir)? {
            return Err("there is no local database to recover".to_string());
        }
        let db = Self::open_with_key(app_data_dir, key).map_err(|e| {
            if e == DECRYPT_ERROR {
                format!(
                    "{WRONG_RECOVERY_KEY}: this recovery key does not open the local database \
                     (another key, or a damaged file; a pharos.db.bak-* copy may still open)"
                )
            } else {
                e
            }
        })?;
        // A recovered file is a copy (another PC, a reinstall): it gets a new
        // device id, so its audit chain (AUD-01) and HLCs never fork the ones the
        // original device may still extend.
        db.with_conn(crate::oplog::rotate_device_id)?;
        db.persist()?;
        if let Ok(Some(old)) = store.load() {
            if old != key {
                store.keep_previous(&old)?;
            }
        }
        store.store(&key)?;
        Ok(db)
    }

    /// The recovery key of this database (ADR-0024). Only for an explicit
    /// export by the user: never log or send it.
    pub fn recovery_key(&self) -> String {
        recovery::encode(&self.key)
    }

    /// Opens `pharos.db` in `app_data_dir` with `key`, converting a
    /// `pharos.db.enc` of an earlier version first. Nothing is written before
    /// the key is known to open the database and its migrations are known.
    pub fn open_with_key(app_data_dir: &Path, key: [u8; 32]) -> Result<Self, String> {
        fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
        // Before anything is read: another process may be writing (D4, ADR-0050).
        let lock = lock_data_dir(app_data_dir)?;
        let db_path = app_data_dir.join(DB_FILE);
        let store = EvidenceStore::new(app_data_dir, &key);
        convert_legacy(app_data_dir, &key, &store)?;

        let existed = db_path.try_exists().map_err(|e| e.to_string())?;
        let conn = open_disk(&db_path, &key, !existed)?;
        let unknown = unknown_migrations(&conn)?;
        if !unknown.is_empty() {
            return Err(format!(
                "{NEWER_DB_ERROR}: the local database was written by a newer version of \
                 Pharos (unknown migrations: {}). It was not modified; install that \
                 version or a later one to open it.",
                unknown.join(", ")
            ));
        }
        // A plaintext copy written by versions before the in-memory fix (only
        // once the database is known to be ours to change).
        let legacy_plain = app_data_dir.join("pharos.db.tmp");
        if legacy_plain.try_exists().map_err(|e| e.to_string())? {
            wipe_file(&legacy_plain)?;
        }
        store.clean_tmp();
        if existed && !pending_migrations(&conn)?.is_empty() {
            let last = applied_migrations(&conn)?.pop();
            let label = last
                .as_deref()
                .map_or("empty", |m| m.trim_end_matches(".sql"));
            backup_disk(&conn, &db_path, &key, label)
                .map_err(|e| format!("{e}; nothing was migrated"))?;
        }
        run_migrations_with(&conn, Some(&store))?;
        evidence::check::load_damaged(&conn, &store)?;
        // A copy put back by hand gets a new device id (AUD-01c); every open
        // is counted, inside and next to the file.
        if existed {
            crate::restored_copy::check(&conn, &db_path)?;
        }
        mark_open(&conn, &db_path)?;
        let seen = data_version(&conn)?;
        let db = Db {
            conn: Mutex::new(conn),
            db_path,
            key,
            evidence: store,
            seen_version: Mutex::new(seen),
            _lock: lock,
        };
        // Finish the evidence deletions an earlier run committed but did not
        // complete (ADR-0014).
        if db.with_conn(evidence::has_pending_deletions)? {
            db.persist_and_collect()?;
        }
        Ok(db)
    }

    /// Runs a closure with a locked connection.
    pub fn with_conn<T>(
        &self,
        f: impl FnOnce(&Connection) -> Result<T, String>,
    ) -> Result<T, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "db lock poisoned".to_string())?;
        f(&conn)
    }

    /// Runs a write in one transaction: committed if the closure succeeds,
    /// rolled back otherwise, so an entity change, its oplog row and its audit
    /// event (journal) are all kept or all dropped. The closure must not open a
    /// transaction of its own (repositories that need one, like the CSV import,
    /// are called through `with_conn`). The lock is held only for the closure,
    /// which is synchronous.
    pub fn with_tx<T>(
        &self,
        f: impl FnOnce(&Connection) -> Result<T, String>,
    ) -> Result<T, String> {
        self.with_conn(|conn| in_tx(conn, f))
    }

    /// The evidence store of this database (ADR-0014).
    pub(crate) fn evidence(&self) -> &EvidenceStore {
        &self.evidence
    }

    /// Removes the evidence files the committed changes released, then their
    /// rows: all under one lock, so every `deleting` row `collect` sees is
    /// committed. Use it instead of `persist` after a change that may release
    /// evidence.
    pub(crate) fn persist_and_collect(&self) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "db lock poisoned".to_string())?;
        // Any `deleting` row changes in `collect`: its removal, or its return to
        // `present` / `damaged` when it was referenced again.
        if evidence::has_pending_deletions(&conn)? {
            evidence::collect(&conn, &self.evidence)?;
        }
        self.seen(&conn)
    }

    /// Keeps an encrypted copy of the database as
    /// `pharos.db.bak-<app version>-<label>` before a change of many rows that
    /// is not a migration (the first sync with workspaces moving the device's
    /// rows, SYNC-07). The newest 3 backups are kept.
    pub(crate) fn backup_now(&self, label: &str) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "db lock poisoned".to_string())?;
        backup_disk(&conn, &self.db_path, &self.key, label)
            .map_err(|e| format!("backup before {label}: {e}"))?;
        // The copy must count below the live database (AUD-01c).
        mark_open(&conn, &self.db_path)?;
        self.seen(&conn)
    }

    /// Every change is committed to disk as it is made (SEC-05): this only
    /// records that this process has seen the database as it is now (see
    /// `changed_on_disk`). The calls go when SEC-05b lets other processes write.
    pub fn persist(&self) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "db lock poisoned".to_string())?;
        self.seen(&conn)
    }

    fn seen(&self, conn: &Connection) -> Result<(), String> {
        let version = data_version(conn)?;
        if let Ok(mut seen) = self.seen_version.lock() {
            *seen = version;
        }
        Ok(())
    }

    /// True if another connection (another process on the same data folder)
    /// committed since this process last saved. `conn` is this database's
    /// connection, already locked by the caller.
    pub(crate) fn changed_on_disk(&self, conn: &Connection) -> bool {
        let now = data_version(conn).ok();
        self.seen_version
            .lock()
            .map(|seen| now != Some(*seen))
            .unwrap_or(true)
    }
}

/// Generates a database key and stores it: only for a fresh install.
fn new_key(store: &dyn KeyStore) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    key.copy_from_slice(Aes256Gcm::generate_key(&mut OsRng).as_slice());
    store.store(&key)?;
    Ok(key)
}

/// True if a database was ever saved here (`pharos.db`, `pharos.db.enc`, or
/// a first save that never got renamed): then a missing key must not be
/// replaced. An I/O error is an error, not "no file", so it never leads to a
/// new key.
fn has_saved_file(dir: &Path) -> Result<bool, String> {
    let exists = |p: &Path| p.try_exists().map_err(|e| e.to_string());
    let legacy = dir.join(LEGACY_FILE);
    Ok(exists(&dir.join(DB_FILE))? || exists(&legacy)? || exists(&pending_path(&legacy))?)
}

/// `HKDF-SHA256(db_key, "pharos-page-v1")`: the raw key of the pages.
fn page_key(key: &[u8; 32]) -> [u8; 32] {
    let mut out = [0u8; 32];
    Hkdf::<Sha256>::new(None, key)
        .expand(PAGE_KEY_INFO, &mut out)
        .expect("32 bytes is a valid HKDF output");
    out
}

/// The raw-key literal of SQLCipher: exactly `x'` + 64 hex digits + `'`
/// (any other length would be taken as a passphrase and run PBKDF2).
fn raw_key_literal(key: &[u8; 32]) -> String {
    format!("x'{}'", evidence::hex(&page_key(key)))
}

/// Opens `path` with the page key and checks it decrypts (a wrong key only
/// fails on the first read: `DECRYPT_ERROR`), then sets the pragmas. A new
/// file gets `auto_vacuum=INCREMENTAL` before its first table.
pub(crate) fn open_disk(path: &Path, key: &[u8; 32], new: bool) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("failed to open local database: {e}"))?;
    conn.execute_batch(&format!("PRAGMA key = \"{}\";", raw_key_literal(key)))
        .map_err(|_| "failed to set the database key".to_string())?;
    let probe = conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| {
        r.get::<_, i64>(0)
    });
    match probe {
        Ok(_) => {}
        Err(rusqlite::Error::SqliteFailure(e, _)) if e.code == ErrorCode::NotADatabase => {
            return Err(DECRYPT_ERROR.to_string())
        }
        Err(e) => return Err(format!("failed to read local database: {e}")),
    }
    if new {
        conn.execute_batch("PRAGMA auto_vacuum = INCREMENTAL;")
            .map_err(|e| e.to_string())?;
    }
    let mode: String = conn
        .query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if !mode.eq_ignore_ascii_case("wal") {
        return Err(format!(
            "failed to put the local database in WAL mode ({mode})"
        ));
    }
    conn.execute_batch(&format!(
        "PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY; \
         PRAGMA foreign_keys = ON; PRAGMA busy_timeout = {BUSY_TIMEOUT_MS};"
    ))
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

/// `PRAGMA data_version`: changes when another connection commits.
fn data_version(conn: &Connection) -> Result<i64, String> {
    conn.query_row("PRAGMA data_version", [], |r| r.get(0))
        .map_err(|e| e.to_string())
}

/// Counts this open (or backup) inside the database and next to it, so a copy
/// put back by hand reads as older (AUD-01c, `restored_copy`).
fn mark_open(conn: &Connection, db_path: &Path) -> Result<(), String> {
    let seq = crate::restored_copy::bump(conn)?;
    crate::restored_copy::write_mark(db_path, seq);
    Ok(())
}

/// Copies the encrypted database with SQLite's backup API to
/// `pharos.db.bak-<app version>-<label>` (`-2`, `-3`… if taken; never over
/// another copy), then keeps the newest 3. The copy has the same key.
fn backup_disk(
    conn: &Connection,
    db_path: &Path,
    key: &[u8; 32],
    label: &str,
) -> Result<(), String> {
    let base = backup_path(db_path, Some(label));
    let mut path = base.clone();
    let mut n = 1;
    while path.try_exists().map_err(|e| e.to_string())? {
        n += 1;
        if n > BACKUP_NAME_TRIES {
            return Err(format!(
                "failed to save the backup: {} and the names after it are taken",
                base.display()
            ));
        }
        let mut next = base.as_os_str().to_owned();
        next.push(format!("-{n}"));
        path = PathBuf::from(next);
    }
    let pending = pending_path(&path);
    let copied = (|| {
        let _ = fs::remove_file(&pending);
        let mut dst = Connection::open(&pending).map_err(|e| e.to_string())?;
        dst.execute_batch(&format!("PRAGMA key = \"{}\";", raw_key_literal(key)))
            .map_err(|_| "failed to set the backup key".to_string())?;
        {
            let backup =
                rusqlite::backup::Backup::new(conn, &mut dst).map_err(|e| e.to_string())?;
            backup
                .run_to_completion(256, std::time::Duration::ZERO, None)
                .map_err(|e| e.to_string())?;
        }
        dst.close().map_err(|(_, e)| e.to_string())?;
        sync_file(&pending).map_err(|e| e.to_string())?;
        fs::rename(&pending, &path).map_err(|e| e.to_string())
    })();
    if let Err(e) = copied {
        let _ = fs::remove_file(&pending);
        return Err(format!("failed to save the backup {}: {e}", path.display()));
    }
    prune_backups(db_path);
    Ok(())
}

/// Converts a `pharos.db.enc` of a version before 0.6 to `pharos.db`
/// (SEC-05, ADR-0050 §4). Does nothing when there is none, or when it is the
/// witness of an earlier conversion. Resumable at every step:
/// - `pharos.db.convert` left by an interrupted run is discarded;
/// - a `pharos.db` converted from this very file (its `converted_from`) only
///   lacks the witness;
/// - a `pharos.db` next to a different `pharos.db.enc` means the user went
///   back to 0.5 and kept working: that `pharos.db` is put aside as a backup
///   and the newer file is converted.
fn convert_legacy(dir: &Path, key: &[u8; 32], store: &EvidenceStore) -> Result<(), String> {
    let enc_path = dir.join(LEGACY_FILE);
    let db_path = dir.join(DB_FILE);
    let convert_path = dir.join(CONVERT_FILE);
    // Read without changing any file yet: a database from a newer version, or
    // under another key, must be refused before anything on disk is touched.
    let Some((blob, plain)) = latest_save(&enc_path, key)? else {
        return Ok(());
    };
    let mut mem = Connection::open_in_memory().map_err(|e| e.to_string())?;
    load_image(&mut mem, &plain)?;
    let applied = applied_migrations(&mem)?;
    let db_exists = db_path.try_exists().map_err(|e| e.to_string())?;
    if applied.iter().any(|m| m == WITNESS_MIGRATION) {
        if !db_exists {
            return Err(format!(
                "{DB_MISSING_ERROR}: the local data moved to pharos.db, which is not in \
                 the data folder. Put it (or a pharos.db.bak-* copy) back there."
            ));
        }
        return Ok(());
    }
    let unknown = unknown_migrations(&mem)?;
    if !unknown.is_empty() {
        return Err(format!(
            "{NEWER_DB_ERROR}: the local database was written by a newer version of \
             Pharos (unknown migrations: {}). It was not modified; install that \
             version or a later one to open it.",
            unknown.join(", ")
        ));
    }
    let source_sha = evidence::hex(&Sha256::digest(&blob));
    if db_exists {
        let converted_from = {
            let conn = open_disk(&db_path, key, false)?;
            converted_from(&conn)?
        };
        if converted_from.as_deref() == Some(source_sha.as_str()) {
            // Stopped between the rename and the witness: only the witness is missing.
            return write_witness(&enc_path, key, &applied);
        }
        put_aside(&db_path, key)?;
    }
    recover_leftovers(dir, &enc_path, key)?;
    if convert_path.try_exists().map_err(|e| e.to_string())? {
        fs::remove_file(&convert_path).map_err(|e| e.to_string())?;
    }
    check_space(dir, (blob.len() + 2 * plain.len()) as u64, free_space(dir))?;
    // The original file, byte for byte, before anything changes (SEC-06).
    write_backup(&enc_path, &blob, applied.last().map(String::as_str))
        .map_err(|e| format!("{CONVERT_FAILED_ERROR}: {e}"))?;
    run_migrations_with(&mem, Some(store))?;
    // A copy put back by hand before the update (AUD-01c, the old mark).
    crate::restored_copy::check(&mem, &enc_path)?;
    mem.execute(
        "INSERT INTO sync_state (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![CONVERTED_FROM_KEY, source_sha],
    )
    .map_err(|e| e.to_string())?;
    let written = write_converted(&mem, &convert_path, key);
    if let Err(e) = written {
        let _ = fs::remove_file(&convert_path);
        return Err(format!(
            "{CONVERT_FAILED_ERROR}: {e}; pharos.db.convert was discarded and \
             pharos.db.enc was not modified"
        ));
    }
    fs::rename(&convert_path, &db_path)
        .map_err(|e| format!("{CONVERT_FAILED_ERROR}: renaming pharos.db.convert: {e}"))?;
    write_witness(&enc_path, key, &applied_migrations(&mem)?)
}

/// `VACUUM INTO` an encrypted file (the backup API cannot copy a plain
/// database into an encrypted one, SEC-04), then checks it against `mem`:
/// integrity, the same tables with the same row counts. The key travels in the
/// URI, so SQLite's messages are never passed on.
fn write_converted(mem: &Connection, path: &Path, key: &[u8; 32]) -> Result<(), String> {
    mem.execute_batch("PRAGMA auto_vacuum = INCREMENTAL;")
        .map_err(|e| e.to_string())?;
    let uri = format!(
        "{}?cipher=sqlcipher&legacy=4&key={}",
        file_uri(path),
        raw_key_literal(key).replace('\'', "%27")
    );
    mem.execute("VACUUM INTO ?1", [&uri]).map_err(|e| match e {
        rusqlite::Error::SqliteFailure(f, _) => {
            format!("writing the converted database failed ({:?})", f.code)
        }
        _ => "writing the converted database failed".to_string(),
    })?;
    let conn = open_disk(path, key, false)?;
    let ok: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if ok != "ok" {
        return Err(format!(
            "the converted database fails its integrity check ({ok})"
        ));
    }
    for table in tables(mem)? {
        let count = |c: &Connection| {
            c.query_row(&format!("SELECT count(*) FROM \"{table}\""), [], |r| {
                r.get::<_, i64>(0)
            })
            .map_err(|e| e.to_string())
        };
        let (before, after) = (count(mem)?, count(&conn)?);
        if before != after {
            return Err(format!(
                "row count differs in table {table} ({before} → {after})"
            ));
        }
    }
    if tables(mem)? != tables(&conn)? {
        return Err("the converted database does not have the same tables".to_string());
    }
    conn.close().map_err(|(_, e)| e.to_string())?;
    sync_file(path).map_err(|e| e.to_string())
}

/// fsync of a file just written (Windows needs a handle with write access).
fn sync_file(path: &Path) -> std::io::Result<()> {
    fs::OpenOptions::new().write(true).open(path)?.sync_all()
}

/// The user tables of a database, sorted.
fn tables(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' \
             AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

/// `converted_from` of a converted database, if any.
fn converted_from(conn: &Connection) -> Result<Option<String>, String> {
    let has_state = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sync_state'",
            [],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .is_some();
    if !has_state {
        return Ok(None);
    }
    conn.query_row(
        "SELECT value FROM sync_state WHERE key = ?1",
        [CONVERTED_FROM_KEY],
        |r| r.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// Moves a `pharos.db` aside as `pharos.db.bak-<version>-superseded`, after
/// folding its WAL into it, so its data stays openable with the same key.
fn put_aside(db_path: &Path, key: &[u8; 32]) -> Result<(), String> {
    {
        let conn = open_disk(db_path, key, false)?;
        conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))
            .map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA journal_mode = DELETE;")
            .map_err(|e| e.to_string())?;
    }
    let base = backup_path(db_path, Some("superseded"));
    let mut path = base.clone();
    let mut n = 1;
    while path.try_exists().map_err(|e| e.to_string())? {
        n += 1;
        let mut next = base.as_os_str().to_owned();
        next.push(format!("-{n}"));
        path = PathBuf::from(next);
    }
    fs::rename(db_path, &path).map_err(|e| format!("failed to put pharos.db aside: {e}"))
}

/// Replaces `pharos.db.enc` with the witness: an image holding only
/// `schema_migrations` with the migrations it had plus `disk-format-v2`, so a
/// Pharos before 0.6 refuses it (SEC-06) instead of starting empty.
fn write_witness(enc_path: &Path, key: &[u8; 32], applied: &[String]) -> Result<(), String> {
    let mut conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )
    .map_err(|e| e.to_string())?;
    for name in applied
        .iter()
        .map(String::as_str)
        .chain([WITNESS_MIGRATION])
    {
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (name) VALUES (?1)",
            [name],
        )
        .map_err(|e| e.to_string())?;
    }
    let image = conn.serialize(MAIN_DB).map_err(|e| e.to_string())?;
    write_atomic(enc_path, &encrypt(key, &image)?)
}

/// Fails with `CONVERT_NO_SPACE_ERROR` when `free` is known and below `need`.
fn check_space(dir: &Path, need: u64, free: Option<u64>) -> Result<(), String> {
    match free {
        Some(free) if free < need => {
            let mb = |b: u64| b.div_ceil(1024 * 1024);
            Err(format!(
                "{CONVERT_NO_SPACE_ERROR}: need {} MB, {} MB free in {}",
                mb(need),
                mb(free),
                dir.display()
            ))
        }
        _ => Ok(()),
    }
}

/// Bytes the user can still write in `dir`'s volume (None when unknown).
#[cfg(windows)]
fn free_space(dir: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn GetDiskFreeSpaceExW(
            directory: *const u16,
            available: *mut u64,
            total: *mut u64,
            free: *mut u64,
        ) -> i32;
    }
    let wide: Vec<u16> = dir.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut available = 0u64;
    // SAFETY: a NUL-terminated wide path and a valid out pointer; the other
    // two outputs are optional (null).
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    (ok != 0).then_some(available)
}

#[cfg(not(windows))]
fn free_space(_dir: &Path) -> Option<u64> {
    None
}

/// A `file:` URI for SQLite (`SQLITE_USE_URI`): forward slashes, and every
/// byte outside the unreserved set percent-encoded.
fn file_uri(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    let mut out = String::from(if raw.starts_with('/') {
        "file://"
    } else {
        "file:///"
    });
    for b in raw.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' | b':' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Path of the in-progress copy written before the atomic rename.
fn pending_path(enc_path: &Path) -> PathBuf {
    let mut name = enc_path.as_os_str().to_owned();
    name.push(".new");
    PathBuf::from(name)
}

/// Path of the copy kept before migrating:
/// `pharos.db.enc.bak-<app version>-<last migration applied to it>`. The
/// migration part keeps two upgrades within one app version apart (the version
/// only changes in release commits).
fn backup_path(enc_path: &Path, last_migration: Option<&str>) -> PathBuf {
    let stem = last_migration.map_or("empty", |m| m.trim_end_matches(".sql"));
    let mut name = enc_path.as_os_str().to_owned();
    name.push(format!(".bak-{APP_VERSION}-{stem}"));
    PathBuf::from(name)
}

/// Most copies kept under one base name (`-2`, `-3`…) before giving up.
const BACKUP_NAME_TRIES: u32 = 100;

/// Keeps the still-encrypted pre-migration blob, then prunes old backups.
/// - The same backup can already exist if an earlier start backed up this
///   very file and stopped before saving the migrated one: then it is kept.
/// - Another file under the name is another database of the same app version
///   and last migration: a migration numbered below the last applied one that
///   landed later (local 0040 after 0043, SYNC-07). It is never overwritten:
///   this copy takes the next free name (`…-2`, `…-3`).
/// - Anything else at the path (a folder) stops the upgrade.
fn write_backup(enc_path: &Path, blob: &[u8], last_migration: Option<&str>) -> Result<(), String> {
    let base = backup_path(enc_path, last_migration);
    let file_name = |p: &Path| {
        p.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned()
    };
    let mut path = base.clone();
    let mut n = 1;
    while path.exists() {
        let name = file_name(&path);
        if !path.is_file() {
            return Err(format!(
                "failed to save the pre-migration backup: {name} already exists and is \
                 not a file; nothing was migrated"
            ));
        }
        if fs::read(&path).ok().as_deref() == Some(blob) {
            return Ok(());
        }
        n += 1;
        if n > BACKUP_NAME_TRIES {
            return Err(format!(
                "failed to save the pre-migration backup: {name} and the names before it \
                 already hold other copies; nothing was migrated"
            ));
        }
        let mut next = base.as_os_str().to_owned();
        next.push(format!("-{n}"));
        path = PathBuf::from(next);
    }
    let name = file_name(&path);
    write_atomic_io(&path, blob).map_err(|e| {
        format!("failed to save the pre-migration backup {name}: {e}; nothing was migrated")
    })?;
    prune_backups(enc_path);
    Ok(())
}

/// Pre-migration backups kept next to the database; older ones are deleted.
const BACKUPS_KEPT: usize = 3;

/// Deletes all but the `BACKUPS_KEPT` newest backups. Best effort: a backup
/// that cannot be deleted never blocks opening the database.
fn prune_backups(enc_path: &Path) {
    let (Some(dir), Some(base)) = (enc_path.parent(), enc_path.file_name()) else {
        return;
    };
    let prefix = format!("{}.bak-", base.to_string_lossy());
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut backups: Vec<(std::time::SystemTime, PathBuf)> = entries
        .filter_map(Result::ok)
        .filter(|e| e.file_name().to_string_lossy().starts_with(&prefix))
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .collect();
    backups.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(&a.1)));
    for (_, old) in backups.into_iter().skip(BACKUPS_KEPT) {
        let _ = fs::remove_file(old);
    }
}

/// An encrypted blob and the plaintext image it decrypts to.
type Saved = (Vec<u8>, Vec<u8>);

/// Encrypted blob and plaintext image of the latest save: a complete
/// `pharos.db.enc.new` (promoted later by `recover_leftovers`), or else
/// `pharos.db.enc`. None on a fresh install. Reads only; changes no file.
///
/// A `.new` that does not decrypt while there is no `pharos.db.enc` is
/// `DECRYPT_ERROR`, never a fresh install: AES-GCM cannot tell a torn first
/// save from another key, and that file may be the only copy of the data.
fn latest_save(enc_path: &Path, key: &[u8; 32]) -> Result<Option<Saved>, String> {
    let pending = pending_path(enc_path);
    let enc_exists = enc_path.try_exists().map_err(|e| e.to_string())?;
    match fs::read(&pending) {
        Ok(blob) => {
            if let Ok(plain) = decrypt(key, &blob) {
                return Ok(Some((blob, plain)));
            }
            if !enc_exists {
                return Err(DECRYPT_ERROR.to_string());
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.to_string()),
    }
    if !enc_exists {
        return Ok(None);
    }
    let blob = fs::read(enc_path).map_err(|e| e.to_string())?;
    let plain = decrypt(key, &blob)?;
    Ok(Some((blob, plain)))
}

/// Writes `bytes` to `<path>.new`, fsyncs it and renames it over `path`, so the
/// previous file survives a crash or power cut at any point of the write.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    write_atomic_io(path, bytes).map_err(|e| format!("failed to save local database: {e}"))
}

fn write_atomic_io(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let pending = pending_path(path);
    let written = (|| {
        let mut file = fs::File::create(&pending)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&pending, path)
    })();
    if written.is_err() {
        let _ = fs::remove_file(&pending);
    }
    written
}

/// Cleans up what an interrupted run may have left next to `pharos.db.enc`:
/// - `pharos.db.tmp`: plaintext copy written by versions before the in-memory
///   fix; overwritten with zeros, then deleted.
/// - `pharos.db.enc.new`: a save that never got renamed. AES-GCM authenticates
///   the whole blob, so if it decrypts it is a complete, newer save and is
///   promoted; otherwise, next to a `pharos.db.enc` this key opens, it is a
///   torn write and is discarded. It is never deleted without that proof (no
///   `pharos.db.enc`, or one this key does not open): it may be a complete,
///   newer save under another key, and both files are left as they are.
fn recover_leftovers(dir: &Path, enc_path: &Path, key: &[u8; 32]) -> Result<(), String> {
    let legacy_plain = dir.join("pharos.db.tmp");
    if legacy_plain.exists() {
        wipe_file(&legacy_plain)?;
    }

    let pending = pending_path(enc_path);
    if pending.try_exists().map_err(|e| e.to_string())? {
        let complete = fs::read(&pending)
            .map(|blob| decrypt(key, &blob).is_ok())
            .unwrap_or(false);
        if complete {
            fs::rename(&pending, enc_path).map_err(|e| e.to_string())?;
        } else {
            let enc = match fs::read(enc_path) {
                Ok(blob) => blob,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    return Err(DECRYPT_ERROR.to_string())
                }
                Err(e) => return Err(e.to_string()),
            };
            decrypt(key, &enc)?;
            fs::remove_file(&pending).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Overwrites a file with zeros before deleting it. Best effort against
/// recovery: SSD wear levelling and shadow copies may still keep old blocks.
fn wipe_file(path: &Path) -> Result<(), String> {
    let len = fs::metadata(path).map_err(|e| e.to_string())?.len();
    {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .open(path)
            .map_err(|e| e.to_string())?;
        let zeros = vec![0u8; 64 * 1024];
        let mut left = len;
        while left > 0 {
            let n = left.min(zeros.len() as u64) as usize;
            file.write_all(&zeros[..n]).map_err(|e| e.to_string())?;
            left -= n as u64;
        }
        file.sync_all().map_err(|e| e.to_string())?;
    }
    fs::remove_file(path).map_err(|e| e.to_string())
}

/// Loads a plaintext database image into `conn` without touching disk.
fn load_image(conn: &mut Connection, image: &[u8]) -> Result<(), String> {
    if image.is_empty() {
        return Ok(());
    }
    // SAFETY: the buffer comes from `sqlite3_malloc64`, as `OwnedData` requires,
    // and is fully initialised by the copy before SQLite takes ownership of it.
    let data = unsafe {
        let ptr = rusqlite::ffi::sqlite3_malloc64(image.len() as u64) as *mut u8;
        let ptr = NonNull::new(ptr).ok_or("out of memory loading local database")?;
        std::ptr::copy_nonoverlapping(image.as_ptr(), ptr.as_ptr(), image.len());
        OwnedData::from_raw_nonnull(ptr, image.len())
    };
    conn.deserialize(MAIN_DB, data, false)
        .map_err(|e| format!("failed to load local database: {e}"))
}

/// `Db::with_tx` on a bare connection (also what tests use).
pub(crate) fn in_tx<T>(
    conn: &Connection,
    f: impl FnOnce(&Connection) -> Result<T, String>,
) -> Result<T, String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let out = f(&tx)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(out)
}

/// Returns the device's own (`local`) workspace id, creating it on first use.
/// New rows are stamped with it; a row under a project then takes its
/// project's workspace (triggers of migration 0040), and the account's
/// projects move to its personal workspace on the next sync (SYNC-07).
pub(crate) fn ensure_workspace(conn: &Connection) -> Result<String, String> {
    // Before migration 0040 (a data step of an older migration, or an old
    // image in the tests) there is no `kind`: the only workspace is the local one.
    let has_kind = conn
        .query_row(
            "SELECT 1 FROM pragma_table_info('workspaces') WHERE name = 'kind'",
            [],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .is_some();
    let sql = if has_kind {
        "SELECT id FROM workspaces WHERE kind = 'local' ORDER BY created_at LIMIT 1"
    } else {
        "SELECT id FROM workspaces LIMIT 1"
    };
    if let Some(id) = conn
        .query_row(sql, [], |r| r.get::<_, String>(0))
        .optional()
        .map_err(|e| e.to_string())?
    {
        return Ok(id);
    }
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO workspaces (id, name) VALUES (?1, ?2)",
        rusqlite::params![id, "My workspace"],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

/// Applies pending migrations to a connection without an evidence store
/// (tests, fresh in-memory databases): it fails if planner attachments would
/// have to be moved.
#[cfg(test)]
pub(crate) fn run_migrations(conn: &Connection) -> Result<(), String> {
    run_migrations_with(conn, None)
}

/// Applies pending migrations; `store` receives the planner attachment BLOBs
/// before 0023 drops them (ADR-0014).
pub(crate) fn run_migrations_with(
    conn: &Connection,
    store: Option<&EvidenceStore>,
) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )
    .map_err(|e| e.to_string())?;

    let pending = pending_migrations(conn)?;
    let mut vacuum = false;
    for (name, sql) in MIGRATIONS.iter().filter(|(n, _)| pending.contains(n)) {
        // The planner attachment BLOBs leave for the evidence store before 0023
        // drops them; files written outside the database cannot roll back.
        if *name == crate::blob_sync::TEMPLATES_OUT {
            vacuum = true;
        }
        if *name == PLANNER_ATTACHMENTS_OUT {
            evidence::migrate_planner_attachments(conn, store)
                .map_err(|e| format!("migration {name} failed: {e}"))?;
            vacuum = true;
        }
        // One savepoint per migration: its SQL, its Rust step and its record
        // land together or not at all.
        conn.execute_batch("SAVEPOINT migration")
            .map_err(|e| e.to_string())?;
        let applied = (|| {
            conn.execute_batch(sql)
                .map_err(|e| format!("migration {name} failed: {e}"))?;
            if let Some((_, step)) = RUST_STEPS.iter().find(|(n, _)| n == name) {
                step(conn).map_err(|e| format!("migration {name} failed: {e}"))?;
            }
            // The template files move into the evidence store (SYNC-04b).
            if *name == crate::blob_sync::TEMPLATES_OUT {
                crate::blob_sync::migrate(conn, store)
                    .map_err(|e| format!("migration {name} failed: {e}"))?;
            }
            conn.execute("INSERT INTO schema_migrations (name) VALUES (?1)", [name])
                .map_err(|e| e.to_string())?;
            Ok::<(), String>(())
        })();
        match applied {
            Ok(()) => conn.execute_batch("RELEASE migration"),
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK TO migration; RELEASE migration");
                return Err(e);
            }
        }
        .map_err(|e| e.to_string())?;
    }
    // The dropped BLOBs leave free pages: compact so the saved image shrinks.
    if vacuum {
        conn.execute_batch("VACUUM").map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Names recorded in `schema_migrations` (none for a database without it).
fn applied_migrations(conn: &Connection) -> Result<Vec<String>, String> {
    let has_table = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
            [],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .is_some();
    if !has_table {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare("SELECT name FROM schema_migrations ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

/// Migrations applied to the database that this build does not ship: the
/// database was written by a newer version of Pharos.
fn unknown_migrations(conn: &Connection) -> Result<Vec<String>, String> {
    Ok(applied_migrations(conn)?
        .into_iter()
        .filter(|name| !MIGRATIONS.iter().any(|(known, _)| known == name))
        .collect())
}

/// Migrations of this build not yet applied to the database, in order.
fn pending_migrations(conn: &Connection) -> Result<Vec<&'static str>, String> {
    let applied = applied_migrations(conn)?;
    Ok(MIGRATIONS
        .iter()
        .map(|(name, _)| *name)
        .filter(|name| !applied.iter().any(|a| a == name))
        .collect())
}

/// Why the local database could not be opened at startup (None when it
/// opened). The app keeps running so the UI can explain it (SEC-06), or, for a
/// key error, recover it (SEC-03).
pub struct DbStatus {
    pub open_error: Mutex<Option<String>>,
    pub data_dir: PathBuf,
    /// True while the database is being opened. Converting a `pharos.db.enc`
    /// (SEC-05) runs in the background so the window can say so; every other
    /// open finishes before the UI asks.
    opening: Mutex<bool>,
    opened: std::sync::Condvar,
    /// The open in progress converts a `pharos.db.enc` of 0.5.
    converting: std::sync::atomic::AtomicBool,
}

impl DbStatus {
    /// A status for `data_dir` whose open has not finished yet.
    pub fn new(data_dir: PathBuf) -> Self {
        DbStatus {
            open_error: Mutex::new(None),
            data_dir,
            opening: Mutex::new(true),
            opened: std::sync::Condvar::new(),
            converting: std::sync::atomic::AtomicBool::new(false),
        }
    }

    /// Records how the open ended and wakes whoever waits for it.
    pub fn finish(&self, error: Option<String>) {
        if let Ok(mut open_error) = self.open_error.lock() {
            *open_error = error;
        }
        self.converting
            .store(false, std::sync::atomic::Ordering::SeqCst);
        if let Ok(mut opening) = self.opening.lock() {
            *opening = false;
        }
        self.opened.notify_all();
    }

    /// The open error, once the open has finished.
    fn wait(&self) -> Option<String> {
        let mut opening = match self.opening.lock() {
            Ok(guard) => guard,
            Err(_) => return Some("db status lock poisoned".to_string()),
        };
        while *opening {
            opening = match self.opened.wait(opening) {
                Ok(guard) => guard,
                Err(_) => return Some("db status lock poisoned".to_string()),
            };
        }
        drop(opening);
        self.open_error.lock().ok().and_then(|e| e.clone())
    }
}

/// True when `dir` holds a `pharos.db.enc` that is probably not converted
/// yet (no `pharos.db`, or larger than any witness): opening it will take a
/// while, so it runs in the background behind a progress screen. Only a hint
/// for the UI; `Db::open` decides.
pub fn conversion_pending(dir: &Path) -> bool {
    const WITNESS_MAX: u64 = 64 * 1024;
    let legacy = fs::metadata(dir.join(LEGACY_FILE)).map(|m| m.len()).ok();
    match legacy {
        None => false,
        Some(len) => !dir.join(DB_FILE).exists() || len > WITNESS_MAX,
    }
}

/// Opens the database of `status` and hands it to the app, or records why it
/// failed (logged, and kept for a diagnostics export). A database that cannot
/// be opened does not stop the app: the UI asks `db_open_error` and explains.
#[cfg(feature = "tauri")]
pub fn open_and_manage(app: &tauri::AppHandle) {
    use tauri::Manager;
    let status = app.state::<DbStatus>();
    let started = std::time::Instant::now();
    let error = match Db::open(&status.data_dir) {
        Ok(database) => {
            tracing::info!(
                elapsed_ms = started.elapsed().as_millis() as u64,
                e2e_profile = crate::instance::e2e_profile().is_some(),
                "local database opened"
            );
            app.manage(database);
            None
        }
        Err(e) => {
            tracing::error!(error = %crate::diag::redact(&e), "local database failed to open");
            app.state::<crate::diag::DiagState>()
                .record_db_open_error(&e);
            Some(e)
        }
    };
    status.finish(error);
}

/// Opens the database at startup: at once, or in the background when a
/// `pharos.db.enc` has to be converted first (SEC-05).
#[cfg(feature = "tauri")]
pub fn open_at_startup(app: &tauri::AppHandle) {
    use tauri::Manager;
    let status = app.state::<DbStatus>();
    if conversion_pending(&status.data_dir) {
        status
            .converting
            .store(true, std::sync::atomic::Ordering::SeqCst);
        let app = app.clone();
        std::thread::spawn(move || open_and_manage(&app));
    } else {
        open_and_manage(app);
    }
}

/// Why the local database could not be opened (None when it opened), once
/// the open has finished.
#[cfg(feature = "tauri")]
#[tauri::command(async)]
pub fn db_open_error(status: tauri::State<'_, DbStatus>) -> Option<String> {
    status.wait()
}

/// True while the open converts a `pharos.db.enc` of 0.5 (SEC-05): the UI
/// shows the conversion screen instead of the plain splash.
#[cfg(feature = "tauri")]
#[tauri::command]
pub fn db_open_converting(status: tauri::State<'_, DbStatus>) -> bool {
    status.converting.load(std::sync::atomic::Ordering::SeqCst)
}

/// Opens again after an error that may go away (space freed, the other
/// Pharos closed, a conversion that failed). Key errors go through
/// `db_recover`; a newer database never opens here.
#[cfg(feature = "tauri")]
#[tauri::command(async)]
pub fn db_open_retry(app: tauri::AppHandle, status: tauri::State<'_, DbStatus>) -> Option<String> {
    let error = status.wait()?;
    if is_key_error(&error) || error.starts_with(NEWER_DB_ERROR) {
        return Some(error);
    }
    if let Ok(mut opening) = status.opening.lock() {
        *opening = true;
    }
    status.converting.store(
        conversion_pending(&status.data_dir),
        std::sync::atomic::Ordering::SeqCst,
    );
    open_and_manage(&app);
    status.wait()
}

/// True for the open errors a recovery key can fix.
fn is_key_error(error: &str) -> bool {
    error.starts_with(KEY_MISSING_ERROR) || error.starts_with(KEY_MISMATCH_ERROR)
}

/// Opens the database with the recovery key the user typed and stores the key
/// in the keychain again (SEC-03). Only allowed while the database failed to
/// open for a key error, so it can never replace the key of an open database.
/// The key is never logged and no error repeats it.
#[cfg(feature = "tauri")]
#[tauri::command]
pub fn db_recover(
    app: tauri::AppHandle,
    status: tauri::State<DbStatus>,
    recovery_key: String,
) -> Result<(), String> {
    #[cfg(feature = "tauri")]
    use tauri::Manager;
    let mut open_error = status
        .open_error
        .lock()
        .map_err(|_| "db status lock poisoned".to_string())?;
    if !open_error.as_deref().is_some_and(is_key_error) {
        return Err("the recovery key is only needed when the database key is missing".into());
    }
    let db = Db::recover(&status.data_dir, &Keychain, &recovery_key)?;
    app.manage(db);
    *open_error = None;
    tracing::info!("local database recovered with the recovery key");
    Ok(())
}

/// The recovery key of the open database, shown once to the user who asked
/// for it (Profile). It goes to the UI only; never to logs or sync.
#[cfg(feature = "tauri")]
#[tauri::command]
pub fn recovery_key_export(db: tauri::State<Db>) -> String {
    db.recovery_key()
}

fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|e| e.to_string())?;
    let mut out = nonce.to_vec();
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

fn decrypt(key: &[u8; 32], blob: &[u8]) -> Result<Vec<u8>, String> {
    if blob.len() < NONCE_LEN {
        return Err("encrypted database is too short".to_string());
    }
    let (nonce_bytes, ciphertext) = blob.split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| DECRYPT_ERROR.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = [7u8; 32];
        let data = b"pharos local database bytes";
        let blob = encrypt(&key, data).unwrap();
        assert_ne!(&blob[NONCE_LEN..], &data[..]); // ciphertext differs from plaintext
        assert_eq!(decrypt(&key, &blob).unwrap(), data);
    }

    #[test]
    fn decrypt_with_wrong_key_fails() {
        let blob = encrypt(&[1u8; 32], b"secret").unwrap();
        assert!(decrypt(&[2u8; 32], &blob).is_err());
    }

    #[test]
    fn migrations_create_expected_tables() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let tables: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('workspaces', 'profiles')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tables, 2);
    }

    #[test]
    fn migrations_are_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        run_migrations(&conn).unwrap(); // second run is a no-op
        let applied: i64 = conn
            .query_row("SELECT count(*) FROM schema_migrations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(applied, MIGRATIONS.len() as i64);
    }

    const KEY: [u8; 32] = [9u8; 32];

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pharos-db-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn file_names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            // The open counts next to the files (AUD-01c) have their own tests.
            .filter(|n| n != "pharos.db.enc.seq" && n != "pharos.db.seq")
            // The lock held while the database is open (ADR-0050) has its own test.
            .filter(|n| n != LOCK_FILE)
            .collect();
        names.sort();
        names
    }

    /// The image of a pre-0.6 database (every migration of this build, one
    /// workspace named `name`) and its workspace id.
    fn legacy_image(name: &str) -> (Vec<u8>, String) {
        let mut conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let id = ensure_workspace(&conn).unwrap();
        conn.execute("UPDATE workspaces SET name = ?1", [name])
            .unwrap();
        (conn.serialize(MAIN_DB).unwrap().to_vec(), id)
    }

    /// Writes a pre-0.6 `pharos.db.enc` (or `file`) encrypted with `KEY`.
    fn write_legacy(dir: &Path, file: &str, name: &str) -> (Vec<u8>, String) {
        let (image, id) = legacy_image(name);
        let blob = encrypt(&KEY, &image).unwrap();
        fs::write(dir.join(file), &blob).unwrap();
        (blob, id)
    }

    fn workspace_name(db: &Db) -> String {
        db.with_conn(|c| {
            c.query_row("SELECT name FROM workspaces", [], |r| r.get(0))
                .map_err(|e| e.to_string())
        })
        .unwrap()
    }

    #[test]
    fn persist_and_reopen_keeps_data() {
        let dir = temp_dir();
        let id = {
            let db = Db::open_with_key(&dir, KEY).unwrap();
            let id = db.with_conn(ensure_workspace).unwrap();
            db.persist().unwrap();
            id
        };
        let db = Db::open_with_key(&dir, KEY).unwrap();
        assert_eq!(db.with_conn(ensure_workspace).unwrap(), id);
        // Every write is committed to disk as it is made.
        db.with_conn(|c| {
            c.execute("UPDATE workspaces SET name = 'Renamed'", [])
                .map_err(|e| e.to_string())
        })
        .unwrap();
        drop(db);
        let db = Db::open_with_key(&dir, KEY).unwrap();
        assert_eq!(workspace_name(&db), "Renamed");
        drop(db);
        fs::remove_dir_all(&dir).unwrap();
    }

    /// AUD-01c: a copy put back by hand gets a new device id; an ordinary
    /// reopen keeps it.
    #[test]
    fn a_restored_copy_gets_a_new_device_id() {
        let dir = temp_dir();
        let file = dir.join(DB_FILE);
        let db = Db::open_with_key(&dir, KEY).unwrap();
        db.with_conn(ensure_workspace).unwrap();
        let device = db.with_conn(crate::oplog::device_id).unwrap();
        drop(db);
        let copy = fs::read(&file).unwrap();
        // The mark holds only the count of opens.
        let mark = fs::read_to_string(dir.join("pharos.db.seq")).unwrap();
        assert!(mark.trim().parse::<u64>().is_ok(), "{mark}");

        let db = Db::open_with_key(&dir, KEY).unwrap();
        assert_eq!(db.with_conn(crate::oplog::device_id).unwrap(), device);
        drop(db);

        fs::write(&file, &copy).unwrap();
        let db = Db::open_with_key(&dir, KEY).unwrap();
        let rotated = db.with_conn(crate::oplog::device_id).unwrap();
        assert_ne!(rotated, device);
        assert!(db
            .with_conn(crate::restored_copy::detected_at)
            .unwrap()
            .is_some());
        drop(db);
        // Counted at once and ahead of the mark again: the next open keeps it.
        let db = Db::open_with_key(&dir, KEY).unwrap();
        assert_eq!(db.with_conn(crate::oplog::device_id).unwrap(), rotated);
        drop(db);

        // Without the mark nothing can be told, and nothing changes.
        fs::write(&file, &copy).unwrap();
        fs::remove_file(dir.join("pharos.db.seq")).unwrap();
        let db = Db::open_with_key(&dir, KEY).unwrap();
        assert_eq!(db.with_conn(crate::oplog::device_id).unwrap(), device);
        drop(db);
        fs::remove_dir_all(&dir).unwrap();
    }

    /// D4, ADR-0050: while one `Db` has the folder open, a second open fails
    /// without reading or writing anything; once the first is gone it opens.
    #[cfg(windows)]
    #[test]
    fn a_second_open_of_the_same_folder_is_refused_until_the_first_closes() {
        let dir = temp_dir();
        let db = Db::open_with_key(&dir, KEY).unwrap();
        db.with_conn(ensure_workspace).unwrap();
        let before = file_names(&dir);
        let err = Db::open_with_key(&dir, KEY).err().unwrap();
        assert!(err.starts_with(DB_IN_USE_ERROR), "{err}");
        assert!(!err.contains("  "), "{err}");
        assert_eq!(file_names(&dir), before);
        drop(db);
        drop(Db::open_with_key(&dir, KEY).unwrap());
        fs::remove_dir_all(&dir).unwrap();
    }

    /// SEC-05: every file of the folder is encrypted, the WAL too, while the
    /// database is open and after it is closed.
    #[test]
    fn no_plaintext_reaches_disk() {
        const MARKER: &str = "PHAROS-MARKER-7f3a9c";
        let dir = temp_dir();
        let db = Db::open_with_key(&dir, KEY).unwrap();
        db.with_conn(ensure_workspace).unwrap();
        db.with_conn(|c| {
            for _ in 0..200 {
                c.execute("UPDATE workspaces SET name = ?1", [MARKER])
                    .map_err(|e| e.to_string())?;
            }
            Ok(())
        })
        .unwrap();
        let scan = |dir: &Path| {
            for entry in fs::read_dir(dir).unwrap() {
                let path = entry.unwrap().path();
                let name = path.file_name().unwrap().to_string_lossy().into_owned();
                // The lock is empty and held without sharing.
                if !path.is_file() || name == LOCK_FILE {
                    continue;
                }
                let Ok(bytes) = fs::read(&path) else {
                    // The WAL index is mapped by SQLite while open (no row data).
                    assert!(name.ends_with("-shm"), "cannot read {name}");
                    continue;
                };
                {
                    for needle in [MARKER.as_bytes(), b"SQLite format 3"] {
                        assert!(
                            !bytes.windows(needle.len()).any(|w| w == needle),
                            "plaintext in {}",
                            path.display()
                        );
                    }
                }
            }
        };
        assert!(dir.join("pharos.db-wal").exists());
        scan(&dir);
        drop(db);
        scan(&dir);
        assert_eq!(file_names(&dir), vec![DB_FILE]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_new_database_is_wal_with_incremental_vacuum() {
        let dir = temp_dir();
        let db = Db::open_with_key(&dir, KEY).unwrap();
        let (mode, vacuum): (String, i64) = db
            .with_conn(|c| {
                let mode = c
                    .query_row("PRAGMA journal_mode", [], |r| r.get(0))
                    .map_err(|e| e.to_string())?;
                let vacuum = c
                    .query_row("PRAGMA auto_vacuum", [], |r| r.get(0))
                    .map_err(|e| e.to_string())?;
                Ok((mode, vacuum))
            })
            .unwrap();
        assert_eq!((mode.as_str(), vacuum), ("wal", 2));
        drop(db);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn open_wipes_legacy_plaintext_copy() {
        let dir = temp_dir();
        fs::write(dir.join("pharos.db.tmp"), b"SQLite format 3\0 plaintext").unwrap();
        drop(Db::open_with_key(&dir, KEY).unwrap());
        assert!(!dir.join("pharos.db.tmp").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    /// SEC-05, ADR-0050 §4: a `pharos.db.enc` of 0.5 is converted on the first
    /// open: the data is in `pharos.db`, the original is kept byte for byte,
    /// and `pharos.db.enc` is a witness a 0.5 refuses.
    #[test]
    fn a_legacy_database_is_converted_with_its_backup_and_a_witness() {
        let dir = temp_dir();
        let (blob, id) = write_legacy(&dir, LEGACY_FILE, "Converted");
        let db = Db::open_with_key(&dir, KEY).unwrap();
        assert_eq!(db.with_conn(ensure_workspace).unwrap(), id);
        assert_eq!(workspace_name(&db), "Converted");
        drop(db);
        let last = MIGRATIONS.last().unwrap().0.trim_end_matches(".sql");
        let backup = format!("pharos.db.enc.bak-{APP_VERSION}-{last}");
        assert_eq!(
            file_names(&dir),
            vec![DB_FILE.to_string(), LEGACY_FILE.to_string(), backup.clone()]
        );
        assert_eq!(fs::read(dir.join(&backup)).unwrap(), blob);
        // The witness: what a Pharos before 0.6 reads refuses with its message.
        let witness = decrypt(&KEY, &fs::read(dir.join(LEGACY_FILE)).unwrap()).unwrap();
        let mut old = Connection::open_in_memory().unwrap();
        load_image(&mut old, &witness).unwrap();
        assert_eq!(unknown_migrations(&old).unwrap(), vec![WITNESS_MIGRATION]);
        assert_eq!(tables(&old).unwrap(), vec!["schema_migrations"]);
        // Reopening converts nothing again.
        let db = Db::open_with_key(&dir, KEY).unwrap();
        assert_eq!(workspace_name(&db), "Converted");
        drop(db);
        fs::remove_dir_all(&dir).unwrap();
    }

    /// Stopped after `pharos.db` was renamed but before the witness: the next
    /// open only writes the witness.
    #[test]
    fn a_conversion_stopped_before_the_witness_finishes_it() {
        let dir = temp_dir();
        let (blob, _) = write_legacy(&dir, LEGACY_FILE, "Once");
        drop(Db::open_with_key(&dir, KEY).unwrap());
        // As if the witness had not been written yet.
        fs::write(dir.join(LEGACY_FILE), &blob).unwrap();
        let db = Db::open_with_key(&dir, KEY).unwrap();
        assert_eq!(workspace_name(&db), "Once");
        drop(db);
        let witness = decrypt(&KEY, &fs::read(dir.join(LEGACY_FILE)).unwrap()).unwrap();
        let mut old = Connection::open_in_memory().unwrap();
        load_image(&mut old, &witness).unwrap();
        assert_eq!(unknown_migrations(&old).unwrap(), vec![WITNESS_MIGRATION]);
        assert!(!file_names(&dir).iter().any(|n| n.contains("superseded")));
        fs::remove_dir_all(&dir).unwrap();
    }

    /// The user went back to 0.5 (restoring the backup) and kept working: the
    /// newer `pharos.db.enc` is converted and the old `pharos.db` is kept aside.
    #[test]
    fn going_back_to_0_5_and_up_again_converts_the_newer_file_and_keeps_the_old_one() {
        let dir = temp_dir();
        write_legacy(&dir, LEGACY_FILE, "Before");
        drop(Db::open_with_key(&dir, KEY).unwrap());
        write_legacy(&dir, LEGACY_FILE, "Worked on in 0.5");
        let db = Db::open_with_key(&dir, KEY).unwrap();
        assert_eq!(workspace_name(&db), "Worked on in 0.5");
        drop(db);
        let aside = format!("pharos.db.bak-{APP_VERSION}-superseded");
        assert!(file_names(&dir).contains(&aside), "{:?}", file_names(&dir));
        let conn = open_disk(&dir.join(&aside), &KEY, false).unwrap();
        let name: String = conn
            .query_row("SELECT name FROM workspaces", [], |r| r.get(0))
            .unwrap();
        assert_eq!(name, "Before");
        drop(conn);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_witness_without_its_database_is_reported_not_replaced() {
        let dir = temp_dir();
        write_legacy(&dir, LEGACY_FILE, "Moved");
        drop(Db::open_with_key(&dir, KEY).unwrap());
        fs::remove_file(dir.join(DB_FILE)).unwrap();
        let err = Db::open_with_key(&dir, KEY).err().unwrap();
        assert!(err.starts_with(DB_MISSING_ERROR), "{err}");
        assert!(!dir.join(DB_FILE).exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_full_disk_stops_the_conversion_before_anything_changes() {
        let dir = temp_dir();
        let err = check_space(&dir, 3 * 1024 * 1024, Some(1024 * 1024)).unwrap_err();
        assert!(err.starts_with(CONVERT_NO_SPACE_ERROR), "{err}");
        assert!(err.contains("need 3 MB, 1 MB free"), "{err}");
        assert!(check_space(&dir, 10, Some(10)).is_ok());
        assert!(check_space(&dir, 10, None).is_ok());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_file_uri_escapes_what_sqlite_would_misread() {
        assert_eq!(
            file_uri(Path::new(r"C:\Users\Ana María\AppData\pharos.db.convert")),
            "file:///C:/Users/Ana%20Mar%C3%ADa/AppData/pharos.db.convert"
        );
        assert_eq!(file_uri(Path::new("/tmp/a?b#c")), "file:///tmp/a%3Fb%23c");
    }

    #[test]
    fn open_promotes_complete_pending_save() {
        let dir = temp_dir();
        fs::write(dir.join(LEGACY_FILE), encrypt(&KEY, b"older").unwrap()).unwrap();
        write_legacy(&dir, "pharos.db.enc.new", "Newer");

        let db = Db::open_with_key(&dir, KEY).unwrap();
        assert_eq!(workspace_name(&db), "Newer");
        drop(db);
        let last = MIGRATIONS.last().unwrap().0.trim_end_matches(".sql");
        let backup = format!("pharos.db.enc.bak-{APP_VERSION}-{last}");
        assert_eq!(
            file_names(&dir),
            vec![DB_FILE.to_string(), LEGACY_FILE.to_string(), backup]
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn open_discards_torn_pending_save() {
        let dir = temp_dir();
        write_legacy(&dir, LEGACY_FILE, "Saved");
        let mut torn = encrypt(&KEY, b"partial").unwrap();
        torn.truncate(torn.len() - 4);
        fs::write(dir.join("pharos.db.enc.new"), torn).unwrap();

        let db = Db::open_with_key(&dir, KEY).unwrap();
        assert_eq!(workspace_name(&db), "Saved");
        drop(db);
        assert!(!dir.join("pharos.db.enc.new").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    /// Writes `pharos.db.enc` as an older build would: only the migrations up
    /// to `last` applied. Returns the encrypted bytes on disk.
    fn write_db_migrated_until(dir: &Path, last: &str) -> Vec<u8> {
        let mut conn = Connection::open_in_memory().unwrap();
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
                break;
            }
        }
        ensure_workspace(&conn).unwrap();
        let blob = encrypt(&KEY, &conn.serialize(MAIN_DB).unwrap()).unwrap();
        fs::write(dir.join("pharos.db.enc"), &blob).unwrap();
        blob
    }

    fn applied_count(db: &Db) -> usize {
        db.with_conn(applied_migrations).unwrap().len()
    }

    #[test]
    fn migrating_keeps_an_encrypted_backup_of_the_previous_file() {
        let dir = temp_dir();
        let before = write_db_migrated_until(&dir, "0011_sync_conflicts.sql");

        let db = Db::open_with_key(&dir, KEY).unwrap();
        assert_eq!(applied_count(&db), MIGRATIONS.len());
        drop(db);

        let backup = format!("pharos.db.enc.bak-{APP_VERSION}-0011_sync_conflicts");
        assert_eq!(
            file_names(&dir),
            vec![DB_FILE.to_string(), LEGACY_FILE.to_string(), backup.clone()]
        );
        // The backup is the untouched encrypted file from before the upgrade…
        let kept = fs::read(dir.join(&backup)).unwrap();
        assert_eq!(kept, before);
        let mut old = Connection::open_in_memory().unwrap();
        load_image(&mut old, &decrypt(&KEY, &kept).unwrap()).unwrap();
        assert_eq!(
            pending_migrations(&old).unwrap().len(),
            MIGRATIONS.len() - 11
        );
        // …and the migrated database is on disk, so reopening migrates nothing.
        let db = Db::open_with_key(&dir, KEY).unwrap();
        assert_eq!(db.with_conn(pending_migrations).unwrap().len(), 0);
        assert_eq!(fs::read(dir.join(&backup)).unwrap(), before);
        drop(db);
        fs::remove_dir_all(&dir).unwrap();
    }

    /// SEC-06 on the new format: before migrating `pharos.db` it is copied,
    /// encrypted with the same key, and the copy opens as it was.
    #[test]
    fn migrating_the_disk_database_keeps_an_encrypted_backup() {
        let dir = temp_dir();
        // A pharos.db written by a build one migration behind.
        let last = MIGRATIONS.last().unwrap().0;
        {
            let conn = open_disk(&dir.join(DB_FILE), &KEY, true).unwrap();
            conn.execute_batch(
                "CREATE TABLE schema_migrations (name TEXT PRIMARY KEY,                  applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
            )
            .unwrap();
            for (name, sql) in &MIGRATIONS[..MIGRATIONS.len() - 1] {
                conn.execute_batch(sql).unwrap();
                conn.execute("INSERT INTO schema_migrations (name) VALUES (?1)", [name])
                    .unwrap();
            }
            ensure_workspace(&conn).unwrap();
        }
        let before = MIGRATIONS[MIGRATIONS.len() - 2].0.trim_end_matches(".sql");
        let db = Db::open_with_key(&dir, KEY).unwrap();
        assert_eq!(db.with_conn(pending_migrations).unwrap().len(), 0);
        drop(db);
        let backup = format!("pharos.db.bak-{APP_VERSION}-{before}");
        assert!(file_names(&dir).contains(&backup), "{:?}", file_names(&dir));
        let conn = open_disk(&dir.join(&backup), &KEY, false).unwrap();
        assert_eq!(pending_migrations(&conn).unwrap(), vec![last]);
        drop(conn);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn no_backup_on_a_fresh_install_or_an_up_to_date_db() {
        let dir = temp_dir();
        let db = Db::open_with_key(&dir, KEY).unwrap();
        db.with_conn(ensure_workspace).unwrap();
        drop(db);
        drop(Db::open_with_key(&dir, KEY).unwrap());
        assert_eq!(file_names(&dir), vec![DB_FILE]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn evidence_is_removed_after_the_commit_that_released_it() {
        let dir = temp_dir();
        let db = Db::open_with_key(&dir, KEY).unwrap();
        let stored = db
            .evidence()
            .put(&b"evidence"[..], evidence::MAX_FILE_BYTES)
            .unwrap();
        db.with_conn(|c| {
            evidence::record_blob(c, &stored, None)?;
            evidence::release(c, &stored.sha256)
        })
        .unwrap();
        assert!(db.evidence().exists(&stored.sha256));
        // The release is committed: the file goes, and so does its row.
        db.persist_and_collect().unwrap();
        assert!(!db.evidence().exists(&stored.sha256));
        drop(db);
        let db = Db::open_with_key(&dir, KEY).unwrap();
        let rows: i64 = db
            .with_conn(|c| {
                c.query_row("SELECT count(*) FROM blobs", [], |r| r.get(0))
                    .map_err(|e| e.to_string())
            })
            .unwrap();
        assert_eq!(rows, 0);
        drop(db);
        fs::remove_dir_all(&dir).unwrap();
    }

    /// DAT-03b on the new format: another connection's commit (a process from
    /// before the folder lock, or any other writer) is seen until this process
    /// saves again.
    #[test]
    fn a_commit_by_another_connection_is_seen_as_a_change_on_disk() {
        let dir = temp_dir();
        let db = Db::open_with_key(&dir, KEY).unwrap();
        db.with_conn(ensure_workspace).unwrap();
        db.persist().unwrap();
        assert!(!db.with_conn(|c| Ok(db.changed_on_disk(c))).unwrap());
        // Our own writes are not a change by someone else.
        db.with_conn(|c| {
            c.execute("UPDATE workspaces SET name = 'Mine'", [])
                .map_err(|e| e.to_string())
        })
        .unwrap();
        assert!(!db.with_conn(|c| Ok(db.changed_on_disk(c))).unwrap());
        let other = open_disk(&dir.join(DB_FILE), &KEY, false).unwrap();
        other
            .execute("UPDATE workspaces SET name = 'Theirs'", [])
            .unwrap();
        drop(other);
        assert!(db.with_conn(|c| Ok(db.changed_on_disk(c))).unwrap());
        db.persist().unwrap();
        assert!(!db.with_conn(|c| Ok(db.changed_on_disk(c))).unwrap());
        drop(db);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn refuses_a_db_from_a_newer_version_without_touching_it() {
        let dir = temp_dir();
        {
            let db = Db::open_with_key(&dir, KEY).unwrap();
            db.with_conn(|c| {
                c.execute(
                    "INSERT INTO schema_migrations (name) VALUES ('9999_from_the_future.sql')",
                    [],
                )
                .map_err(|e| e.to_string())
            })
            .unwrap();
        }
        let before = fs::read(dir.join(DB_FILE)).unwrap();

        let err = Db::open_with_key(&dir, KEY).err().expect("must refuse");
        assert!(err.starts_with(NEWER_DB_ERROR), "{err}");
        assert!(err.contains("9999_from_the_future.sql"), "{err}");
        assert_eq!(fs::read(dir.join(DB_FILE)).unwrap(), before);
        assert_eq!(file_names(&dir), vec![DB_FILE]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn refuses_a_newer_pending_save_without_promoting_it() {
        let dir = temp_dir();
        write_db_migrated_until(&dir, "0011_sync_conflicts.sql");
        let mut conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO schema_migrations (name) VALUES ('9999_from_the_future.sql')",
            [],
        )
        .unwrap();
        let newer = encrypt(&KEY, &conn.serialize(MAIN_DB).unwrap()).unwrap();
        fs::write(dir.join("pharos.db.enc.new"), &newer).unwrap();
        let before = fs::read(dir.join("pharos.db.enc")).unwrap();

        assert!(Db::open_with_key(&dir, KEY).is_err());
        assert_eq!(fs::read(dir.join("pharos.db.enc")).unwrap(), before);
        assert_eq!(fs::read(dir.join("pharos.db.enc.new")).unwrap(), newer);
        assert!(!dir.join(DB_FILE).exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_failed_backup_stops_the_upgrade_and_leaves_the_file_alone() {
        let dir = temp_dir();
        let before = write_db_migrated_until(&dir, "0011_sync_conflicts.sql");
        // Something squats the backup path: it must not be skipped silently.
        let squatter = backup_path(&dir.join("pharos.db.enc"), Some("0011_sync_conflicts.sql"));
        fs::create_dir(&squatter).unwrap();

        let err = Db::open_with_key(&dir, KEY)
            .err()
            .expect("must refuse to migrate");
        assert!(err.contains("pre-migration backup"), "{err}");
        assert_eq!(fs::read(dir.join("pharos.db.enc")).unwrap(), before);
        assert!(squatter.is_dir());
        assert!(!dir.join(DB_FILE).exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_backup_name_taken_by_another_copy_gets_the_next_name_and_keeps_it() {
        // An install that applied 0043 before 0040 landed (SYNC-07): its
        // backup was named after 0043; the next start, still with 0043 as the
        // last migration but another database, must neither stop nor
        // overwrite it.
        let dir = temp_dir();
        let enc = dir.join("pharos.db.enc");
        let older = backup_path(&enc, Some("0011_sync_conflicts.sql"));
        fs::write(&older, b"an earlier copy under the same name").unwrap();
        let current = write_db_migrated_until(&dir, "0011_sync_conflicts.sql");

        drop(Db::open_with_key(&dir, KEY).unwrap());

        assert_eq!(
            fs::read(&older).unwrap(),
            b"an earlier copy under the same name"
        );
        let mut next = older.as_os_str().to_owned();
        next.push("-2");
        assert_eq!(fs::read(PathBuf::from(next)).unwrap(), current);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn only_the_newest_backups_are_kept() {
        let dir = temp_dir();
        let old = std::time::SystemTime::now() - std::time::Duration::from_secs(3600);
        for i in 0..4u64 {
            let path = dir.join(format!("pharos.db.enc.bak-0.0.{i}-old"));
            fs::write(&path, b"old backup").unwrap();
            let file = fs::File::options().write(true).open(&path).unwrap();
            file.set_modified(old + std::time::Duration::from_secs(i))
                .unwrap();
        }
        write_db_migrated_until(&dir, "0011_sync_conflicts.sql");
        drop(Db::open_with_key(&dir, KEY).unwrap());

        let mut kept: Vec<String> = file_names(&dir)
            .into_iter()
            .filter(|n| n.starts_with("pharos.db.enc.bak-"))
            .collect();
        kept.sort();
        assert_eq!(
            kept,
            vec![
                "pharos.db.enc.bak-0.0.2-old".to_string(),
                "pharos.db.enc.bak-0.0.3-old".to_string(),
                format!("pharos.db.enc.bak-{APP_VERSION}-0011_sync_conflicts"),
            ]
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    /// An in-memory keychain, so recovery is tested without the real one.
    #[derive(Default)]
    struct MemStore {
        slot: std::cell::Cell<Option<[u8; 32]>>,
        previous: std::cell::Cell<Option<[u8; 32]>>,
        /// The entry exists but is not a valid key (`Keychain::load`).
        damaged: std::cell::Cell<bool>,
    }

    impl MemStore {
        fn with(key: [u8; 32]) -> Self {
            let store = MemStore::default();
            store.slot.set(Some(key));
            store
        }
        fn damaged() -> Self {
            let store = MemStore::default();
            store.damaged.set(true);
            store
        }
        fn key(&self) -> Option<[u8; 32]> {
            self.slot.get()
        }
    }

    impl KeyStore for MemStore {
        fn load(&self) -> Result<Option<[u8; 32]>, String> {
            if self.damaged.get() {
                return Err(format!("{KEY_MISMATCH_ERROR}: damaged entry"));
            }
            Ok(self.key())
        }
        fn store(&self, key: &[u8; 32]) -> Result<(), String> {
            self.damaged.set(false);
            self.slot.set(Some(*key));
            Ok(())
        }
        fn keep_previous(&self, key: &[u8; 32]) -> Result<(), String> {
            self.previous.set(Some(*key));
            Ok(())
        }
    }

    /// A database with one renamed workspace, saved in `dir` with `KEY`.
    fn saved_db(dir: &Path) -> String {
        let db = Db::open_with_store(dir, &MemStore::with(KEY)).unwrap();
        let id = db.with_conn(ensure_workspace).unwrap();
        db.with_conn(|c| {
            c.execute("UPDATE workspaces SET name = 'Recovered'", [])
                .map_err(|e| e.to_string())
        })
        .unwrap();
        db.persist().unwrap();
        id
    }

    #[test]
    fn a_fresh_install_generates_and_stores_a_key() {
        let dir = temp_dir();
        let store = MemStore::default();
        let db = Db::open_with_store(&dir, &store).unwrap();
        assert_eq!(store.key(), Some(db.key));
        drop(db);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_missing_key_with_a_saved_file_is_not_replaced() {
        let dir = temp_dir();
        saved_db(&dir);
        let before = fs::read(dir.join(DB_FILE)).unwrap();

        let store = MemStore::default();
        let err = Db::open_with_store(&dir, &store)
            .err()
            .expect("must refuse");
        assert!(err.starts_with(KEY_MISSING_ERROR), "{err}");
        assert_eq!(store.key(), None, "no new key may be stored");
        assert_eq!(fs::read(dir.join(DB_FILE)).unwrap(), before);
        assert_eq!(file_names(&dir), vec![DB_FILE]);

        // A pre-0.6 file, or a first save of it that never got renamed,
        // counts as a saved file too.
        fs::remove_file(dir.join(DB_FILE)).unwrap();
        write_legacy(&dir, LEGACY_FILE, "Old");
        let err = Db::open_with_store(&dir, &store).err().unwrap();
        assert!(err.starts_with(KEY_MISSING_ERROR), "{err}");
        fs::rename(dir.join(LEGACY_FILE), dir.join("pharos.db.enc.new")).unwrap();
        let err = Db::open_with_store(&dir, &store).err().unwrap();
        assert!(err.starts_with(KEY_MISSING_ERROR), "{err}");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_keychain_key_that_does_not_decrypt_is_a_mismatch() {
        let dir = temp_dir();
        saved_db(&dir);
        let store = MemStore::with([3u8; 32]);
        let err = Db::open_with_store(&dir, &store).err().unwrap();
        assert!(err.starts_with(KEY_MISMATCH_ERROR), "{err}");
        assert!(is_key_error(&err));
        assert_eq!(store.key(), Some([3u8; 32]));
        assert!(!is_key_error(NEWER_DB_ERROR));
        fs::remove_dir_all(&dir).unwrap();
    }

    /// Acceptance of SEC-03: on another PC, with only the database file and
    /// the recovery key, the data comes back and the key is in the keychain
    /// again.
    #[test]
    fn the_database_file_and_the_recovery_key_recover_the_data_on_another_pc() {
        let first_pc = temp_dir();
        let id = saved_db(&first_pc);
        let original = Db::open_with_store(&first_pc, &MemStore::with(KEY)).unwrap();
        let recovery_key = original.recovery_key();
        let first_device = original.with_conn(crate::oplog::device_id).unwrap();
        drop(original);

        let other_pc = temp_dir();
        fs::copy(first_pc.join(DB_FILE), other_pc.join(DB_FILE)).unwrap();
        let keychain = MemStore::default();
        let err = Db::open_with_store(&other_pc, &keychain).err().unwrap();
        assert!(err.starts_with(KEY_MISSING_ERROR), "{err}");

        let typed = recovery_key.to_lowercase().replace('-', " ");
        let db = Db::recover(&other_pc, &keychain, &typed).unwrap();
        assert_eq!(db.with_conn(ensure_workspace).unwrap(), id);
        assert_eq!(workspace_name(&db), "Recovered");
        assert_eq!(keychain.key(), Some(KEY));
        // AUD-01: the copy gets its own device id, so its audit chain never forks.
        let device = db.with_conn(crate::oplog::device_id).unwrap();
        assert_ne!(device, first_device);
        drop(db);
        // The next start opens normally from the keychain.
        drop(Db::open_with_store(&other_pc, &keychain).unwrap());
        fs::remove_dir_all(&first_pc).unwrap();
        fs::remove_dir_all(&other_pc).unwrap();
    }

    #[test]
    fn a_recovery_key_replaces_a_mismatched_keychain_key() {
        let dir = temp_dir();
        saved_db(&dir);
        let keychain = MemStore::with([3u8; 32]);
        drop(Db::recover(&dir, &keychain, &recovery::encode(&KEY)).unwrap());
        assert_eq!(keychain.key(), Some(KEY));
        // The replaced key is kept once: it may open another instance's data.
        assert_eq!(keychain.previous.get(), Some([3u8; 32]));
        fs::remove_dir_all(&dir).unwrap();
    }

    /// A first save that never got renamed may be the only copy of the data:
    /// a key that does not open it must never make it look like a fresh install.
    #[test]
    fn a_wrong_recovery_key_never_deletes_a_lone_first_save() {
        let dir = temp_dir();
        write_legacy(&dir, "pharos.db.enc.new", "Only copy");
        let before = fs::read(dir.join("pharos.db.enc.new")).unwrap();
        let keychain = MemStore::default();

        let err = Db::recover(&dir, &keychain, &recovery::encode(&[4u8; 32]))
            .err()
            .expect("must refuse");
        assert!(err.starts_with(WRONG_RECOVERY_KEY), "{err}");
        assert_eq!(keychain.key(), None);
        assert_eq!(keychain.previous.get(), None);
        assert_eq!(file_names(&dir), vec!["pharos.db.enc.new"]);
        assert_eq!(fs::read(dir.join("pharos.db.enc.new")).unwrap(), before);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_keychain_key_that_does_not_open_a_lone_first_save_is_a_mismatch() {
        let dir = temp_dir();
        let (_, id) = write_legacy(&dir, "pharos.db.enc.new", "Only copy");
        let before = fs::read(dir.join("pharos.db.enc.new")).unwrap();
        let keychain = MemStore::with([3u8; 32]);

        let err = Db::open_with_store(&dir, &keychain).err().unwrap();
        assert!(err.starts_with(KEY_MISMATCH_ERROR), "{err}");
        assert_eq!(file_names(&dir), vec!["pharos.db.enc.new"]);
        assert_eq!(fs::read(dir.join("pharos.db.enc.new")).unwrap(), before);
        // Opening with the key itself (no keychain) does not discard it either.
        let err = Db::open_with_key(&dir, [3u8; 32]).err().unwrap();
        assert_eq!(err, DECRYPT_ERROR);
        assert_eq!(file_names(&dir), vec!["pharos.db.enc.new"]);

        // The right recovery key promotes it, converts it and brings the data back.
        let db = Db::recover(&dir, &keychain, &recovery::encode(&KEY)).unwrap();
        assert_eq!(db.with_conn(ensure_workspace).unwrap(), id);
        assert_eq!(keychain.key(), Some(KEY));
        drop(db);
        let names = file_names(&dir);
        assert!(names.contains(&DB_FILE.to_string()), "{names:?}");
        assert!(names.contains(&LEGACY_FILE.to_string()), "{names:?}");
        assert!(
            !names.contains(&"pharos.db.enc.new".to_string()),
            "{names:?}"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    /// A crash between writing `.new` and the rename leaves a complete, newer
    /// save. A wrong key must not delete it: the right key brings it back.
    #[test]
    fn a_wrong_key_never_deletes_a_complete_pending_save() {
        let dir = temp_dir();
        write_legacy(&dir, LEGACY_FILE, "Older");
        write_legacy(&dir, "pharos.db.enc.new", "Newest");
        let enc = fs::read(dir.join("pharos.db.enc")).unwrap();
        let pending = fs::read(dir.join("pharos.db.enc.new")).unwrap();
        let unchanged = || {
            assert_eq!(fs::read(dir.join("pharos.db.enc")).unwrap(), enc);
            assert_eq!(fs::read(dir.join("pharos.db.enc.new")).unwrap(), pending);
            assert!(!dir.join(DB_FILE).exists());
        };

        // The cleanup itself needs proof that the key opens `pharos.db.enc`.
        let err = recover_leftovers(&dir, &dir.join("pharos.db.enc"), &[3u8; 32]).unwrap_err();
        assert_eq!(err, DECRYPT_ERROR);
        unchanged();
        let err = Db::open_with_store(&dir, &MemStore::with([3u8; 32]))
            .err()
            .unwrap();
        assert!(err.starts_with(KEY_MISMATCH_ERROR), "{err}");
        unchanged();

        let keychain = MemStore::with([3u8; 32]);
        let db = Db::recover(&dir, &keychain, &recovery::encode(&KEY)).unwrap();
        assert_eq!(workspace_name(&db), "Newest");
        drop(db);
        assert!(!dir.join("pharos.db.enc.new").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_damaged_keychain_entry_is_a_mismatch_the_recovery_key_fixes() {
        let dir = temp_dir();
        saved_db(&dir);
        let keychain = MemStore::damaged();
        let err = Db::open_with_store(&dir, &keychain).err().unwrap();
        assert!(is_key_error(&err), "{err}");
        assert_eq!(keychain.key(), None, "a damaged entry is not overwritten");

        drop(Db::recover(&dir, &keychain, &recovery::encode(&KEY)).unwrap());
        assert_eq!(keychain.key(), Some(KEY));
        assert_eq!(keychain.previous.get(), None);
        drop(Db::open_with_store(&dir, &keychain).unwrap());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_damaged_keychain_entry_with_nothing_saved_is_replaced() {
        let dir = temp_dir();
        let keychain = MemStore::damaged();
        let db = Db::open_with_store(&dir, &keychain).unwrap();
        assert_eq!(keychain.key(), Some(db.key));
        drop(db);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_wrong_recovery_key_changes_nothing() {
        let dir = temp_dir();
        saved_db(&dir);
        let before = fs::read(dir.join(DB_FILE)).unwrap();
        let keychain = MemStore::default();

        let other_key = recovery::encode(&[4u8; 32]);
        let err = Db::recover(&dir, &keychain, &other_key).err().unwrap();
        assert!(err.starts_with(WRONG_RECOVERY_KEY), "{err}");
        assert!(!err.contains(&other_key[..9]), "{err}");
        assert_eq!(keychain.key(), None);
        assert_eq!(fs::read(dir.join(DB_FILE)).unwrap(), before);
        assert_eq!(file_names(&dir), vec![DB_FILE]);
        fs::remove_dir_all(&dir).unwrap();
    }

    /// SEC-05: `db_open_error` waits for an open running in the background
    /// and gets its outcome; a retry waits again.
    #[test]
    fn the_open_status_waits_for_a_background_open() {
        let status = std::sync::Arc::new(DbStatus::new(temp_dir()));
        let waiting = status.clone();
        let waiter = std::thread::spawn(move || waiting.wait());
        std::thread::sleep(std::time::Duration::from_millis(50));
        assert!(!waiter.is_finished(), "must wait while opening");
        status.finish(Some(format!("{DB_IN_USE_ERROR}: busy")));
        assert_eq!(
            waiter.join().unwrap(),
            Some(format!("{DB_IN_USE_ERROR}: busy"))
        );
        // Finished: it answers at once, until a retry opens again.
        assert!(status.wait().is_some());
        *status.opening.lock().unwrap() = true;
        let waiting = status.clone();
        let waiter = std::thread::spawn(move || waiting.wait());
        status.finish(None);
        assert_eq!(waiter.join().unwrap(), None);
        fs::remove_dir_all(&status.data_dir).unwrap();
    }

    #[test]
    fn a_conversion_is_pending_only_for_a_real_legacy_file() {
        let dir = temp_dir();
        assert!(!conversion_pending(&dir));
        write_legacy(&dir, LEGACY_FILE, "Pending");
        assert!(conversion_pending(&dir));
        drop(Db::open_with_key(&dir, KEY).unwrap());
        // Converted: pharos.db is there and pharos.db.enc is a small witness.
        assert!(!conversion_pending(&dir));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_recovery_key_with_a_typo_is_rejected_before_touching_anything() {
        let dir = temp_dir();
        saved_db(&dir);
        let keychain = MemStore::default();
        let good = recovery::encode(&KEY);
        let last = if good.ends_with('Z') { 'Y' } else { 'Z' };
        let typo = format!("{}{last}", &good[..good.len() - 1]);

        let err = Db::recover(&dir, &keychain, &typo).err().unwrap();
        assert!(err.starts_with(recovery::INVALID_RECOVERY_KEY), "{err}");
        assert_eq!(keychain.key(), None);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn recovery_needs_a_saved_database() {
        let dir = temp_dir();
        let keychain = MemStore::default();
        assert!(Db::recover(&dir, &keychain, &recovery::encode(&KEY)).is_err());
        assert_eq!(keychain.key(), None);
        assert!(file_names(&dir).is_empty());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn refusing_a_newer_db_leaves_the_legacy_plaintext_file_alone() {
        let dir = temp_dir();
        {
            let db = Db::open_with_key(&dir, KEY).unwrap();
            db.with_conn(|c| {
                c.execute(
                    "INSERT INTO schema_migrations (name) VALUES ('9999_future.sql')",
                    [],
                )
                .map_err(|e| e.to_string())
            })
            .unwrap();
            db.persist().unwrap();
        }
        fs::write(dir.join("pharos.db.tmp"), b"legacy").unwrap();
        assert!(Db::open_with_key(&dir, KEY).is_err());
        assert_eq!(fs::read(dir.join("pharos.db.tmp")).unwrap(), b"legacy");
        fs::remove_dir_all(&dir).unwrap();
    }
}

#[cfg(test)]
#[path = "upgrade_tests.rs"]
mod upgrade_tests;
