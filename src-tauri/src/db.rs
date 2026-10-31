//! Local encrypted SQLite (spec §16 Phase 2). The working database lives in
//! memory; at rest it is persisted to `pharos.db.enc` as an AES-256-GCM blob.
//! The 32-byte key is kept in the OS keychain. SQLCipher was not used because
//! its OpenSSL build did not compile under the former GNU toolchain (see SEC-04).
//!
//! The plaintext image only ever exists in memory: it is moved in and out of
//! SQLite with `deserialize`/`serialize`. The encrypted file is replaced
//! atomically (write `pharos.db.enc.new`, fsync, rename), so a crash mid-save
//! leaves the previous copy intact.
//!
//! Data compatibility (SEC-06, VERSIONING §6): before applying pending
//! migrations to an existing database the encrypted file is copied to
//! `pharos.db.enc.bak-<app version>-<last migration>` (the newest 3 are kept), and a database that already carries
//! migrations this build does not know (written by a newer Pharos) is refused
//! without touching any file.
//!
//! Recovery (SEC-03, ADR-0024): the key can be exported as a recovery key
//! (recovery.rs). A key is only generated on a fresh install: if the keychain
//! entry is missing while an encrypted file exists (new PC, reinstalled
//! Windows), opening fails with `KEY_MISSING_ERROR` instead of silently
//! storing a new key, and `db_recover` opens the file with the recovery key and
//! stores it in the keychain again.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::ptr::NonNull;
use std::sync::Mutex;

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::Engine as _;
use keyring::Entry;
use rusqlite::serialize::OwnedData;
use rusqlite::{Connection, DatabaseName, OptionalExtension};

use crate::recovery;

const KEYCHAIN_SERVICE: &str = "pharos";
const KEYCHAIN_DB_KEY: &str = "db-key";
const B64: base64::engine::general_purpose::GeneralPurpose =
    base64::engine::general_purpose::STANDARD;
const NONCE_LEN: usize = 12;
/// Version stamped on the pre-migration backup (`pharos.db.enc.bak-<version>-<migration>`).
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
const DECRYPT_ERROR: &str = "failed to decrypt local database";

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
];

pub struct Db {
    conn: Mutex<Connection>,
    enc_path: PathBuf,
    key: [u8; 32],
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
    /// there is no encrypted file yet; otherwise a missing or non-matching key
    /// is an error the UI answers with the recovery key.
    fn open_with_store(app_data_dir: &Path, store: &dyn KeyStore) -> Result<Self, String> {
        let enc_path = app_data_dir.join("pharos.db.enc");
        let saved = has_saved_file(&enc_path)?;
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
    /// the store untouched: the saved file must decrypt before anything else.
    pub(crate) fn recover(
        app_data_dir: &Path,
        store: &dyn KeyStore,
        recovery_key: &str,
    ) -> Result<Self, String> {
        let key = recovery::decode(recovery_key)?;
        let wrong = |e: String| {
            if e == DECRYPT_ERROR {
                format!(
                    "{WRONG_RECOVERY_KEY}: this recovery key does not open the local database \
                     (another key, or a damaged file; a pharos.db.enc.bak-* copy may still open)"
                )
            } else {
                e
            }
        };
        if latest_save(&app_data_dir.join("pharos.db.enc"), &key)
            .map_err(wrong)?
            .is_none()
        {
            return Err("there is no local database to recover".to_string());
        }
        let db = Self::open_with_key(app_data_dir, key).map_err(wrong)?;
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

    fn open_with_key(app_data_dir: &Path, key: [u8; 32]) -> Result<Self, String> {
        fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
        let enc_path = app_data_dir.join("pharos.db.enc");
        // Read the latest save without changing any file yet: a database from a
        // newer version must be refused before anything on disk is touched.
        let saved = latest_save(&enc_path, &key)?;
        let mut conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
        if let Some((_, plain)) = &saved {
            load_image(&mut conn, plain)?;
        }

        let unknown = unknown_migrations(&conn)?;
        if !unknown.is_empty() {
            return Err(format!(
                "{NEWER_DB_ERROR}: the local database was written by a newer version of \
                 Pharos (unknown migrations: {}). It was not modified; install that \
                 version or a later one to open it.",
                unknown.join(", ")
            ));
        }
        recover_leftovers(app_data_dir, &enc_path, &key)?;

        let migrate_existing = saved.is_some() && !pending_migrations(&conn)?.is_empty();
        if let Some((blob, _)) = saved.as_ref().filter(|_| migrate_existing) {
            let last = applied_migrations(&conn)?.pop();
            write_backup(&enc_path, blob, last.as_deref())?;
        }
        run_migrations(&conn)?;
        let db = Db {
            conn: Mutex::new(conn),
            enc_path,
            key,
        };
        // Save the migrated image right away, so the backup and the file on
        // disk are always exactly one upgrade apart.
        if migrate_existing {
            db.persist()?;
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

    /// Serializes the in-memory database and writes it encrypted to disk.
    pub fn persist(&self) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "db lock poisoned".to_string())?;
        let image = conn
            .serialize(DatabaseName::Main)
            .map_err(|e| e.to_string())?;
        let blob = encrypt(&self.key, &image)?;
        write_atomic(&self.enc_path, &blob)
    }
}

/// Generates a database key and stores it: only for a fresh install.
fn new_key(store: &dyn KeyStore) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    key.copy_from_slice(Aes256Gcm::generate_key(&mut OsRng).as_slice());
    store.store(&key)?;
    Ok(key)
}

/// True if a database was ever saved here (`pharos.db.enc`, or a first save
/// that never got renamed): then a missing key must not be replaced. An I/O
/// error is an error, not "no file", so it never leads to a new key.
fn has_saved_file(enc_path: &Path) -> Result<bool, String> {
    let exists = |p: &Path| p.try_exists().map_err(|e| e.to_string());
    Ok(exists(enc_path)? || exists(&pending_path(enc_path))?)
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

/// Keeps the still-encrypted pre-migration blob, then prunes old backups. The
/// same backup can already exist only if an earlier start backed up this very
/// file and stopped before saving the migrated one: then it is kept. Anything
/// else at that path (a folder, other bytes) stops the upgrade.
fn write_backup(enc_path: &Path, blob: &[u8], last_migration: Option<&str>) -> Result<(), String> {
    let path = backup_path(enc_path, last_migration);
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    if path.exists() {
        if path.is_file() && fs::read(&path).ok().as_deref() == Some(blob) {
            return Ok(());
        }
        return Err(format!(
            "failed to save the pre-migration backup: {name} already exists and is \
             not a copy of the current database; nothing was migrated"
        ));
    }
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
    conn.deserialize(DatabaseName::Main, data, false)
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

/// Returns the single workspace id, creating a default workspace on first use.
pub(crate) fn ensure_workspace(conn: &Connection) -> Result<String, String> {
    if let Some(id) = conn
        .query_row("SELECT id FROM workspaces LIMIT 1", [], |r| {
            r.get::<_, String>(0)
        })
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

pub(crate) fn run_migrations(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )
    .map_err(|e| e.to_string())?;

    let pending = pending_migrations(conn)?;
    for (name, sql) in MIGRATIONS.iter().filter(|(n, _)| pending.contains(n)) {
        conn.execute_batch(sql)
            .map_err(|e| format!("migration {name} failed: {e}"))?;
        conn.execute("INSERT INTO schema_migrations (name) VALUES (?1)", [name])
            .map_err(|e| e.to_string())?;
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
}

#[tauri::command]
pub fn db_open_error(status: tauri::State<DbStatus>) -> Option<String> {
    status.open_error.lock().ok().and_then(|e| e.clone())
}

/// True for the open errors a recovery key can fix.
fn is_key_error(error: &str) -> bool {
    error.starts_with(KEY_MISSING_ERROR) || error.starts_with(KEY_MISMATCH_ERROR)
}

/// Opens the database with the recovery key the user typed and stores the key
/// in the keychain again (SEC-03). Only allowed while the database failed to
/// open for a key error, so it can never replace the key of an open database.
/// The key is never logged and no error repeats it.
#[tauri::command]
pub fn db_recover(
    app: tauri::AppHandle,
    status: tauri::State<DbStatus>,
    recovery_key: String,
) -> Result<(), String> {
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
            .collect();
        names.sort();
        names
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
        // Writes after a deserialize (memdb-backed) must persist too.
        db.with_conn(|c| {
            c.execute("UPDATE workspaces SET name = 'Renamed'", [])
                .map_err(|e| e.to_string())
        })
        .unwrap();
        db.persist().unwrap();
        drop(db);
        let db = Db::open_with_key(&dir, KEY).unwrap();
        let name: String = db
            .with_conn(|c| {
                c.query_row("SELECT name FROM workspaces", [], |r| r.get(0))
                    .map_err(|e| e.to_string())
            })
            .unwrap();
        assert_eq!(name, "Renamed");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn persist_leaves_only_the_encrypted_file() {
        let dir = temp_dir();
        let db = Db::open_with_key(&dir, KEY).unwrap();
        db.with_conn(ensure_workspace).unwrap();
        db.persist().unwrap();
        assert_eq!(file_names(&dir), vec!["pharos.db.enc"]);
        let blob = fs::read(dir.join("pharos.db.enc")).unwrap();
        let header = b"SQLite format 3";
        assert!(!blob.windows(header.len()).any(|w| w == header));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn open_wipes_legacy_plaintext_copy() {
        let dir = temp_dir();
        fs::write(dir.join("pharos.db.tmp"), b"SQLite format 3\0 plaintext").unwrap();
        Db::open_with_key(&dir, KEY).unwrap();
        assert!(!dir.join("pharos.db.tmp").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn open_promotes_complete_pending_save() {
        let dir = temp_dir();
        let src = Connection::open_in_memory().unwrap();
        src.execute_batch("CREATE TABLE marker (v TEXT); INSERT INTO marker VALUES ('newer');")
            .unwrap();
        let image = src.serialize(DatabaseName::Main).unwrap();
        fs::write(dir.join("pharos.db.enc"), encrypt(&KEY, b"older").unwrap()).unwrap();
        fs::write(
            dir.join("pharos.db.enc.new"),
            encrypt(&KEY, &image).unwrap(),
        )
        .unwrap();

        let db = Db::open_with_key(&dir, KEY).unwrap();
        let v: String = db
            .with_conn(|c| {
                c.query_row("SELECT v FROM marker", [], |r| r.get(0))
                    .map_err(|e| e.to_string())
            })
            .unwrap();
        assert_eq!(v, "newer");
        // The promoted image had no migrations yet, so it was backed up first.
        let backup = format!("pharos.db.enc.bak-{APP_VERSION}-empty");
        assert_eq!(file_names(&dir), vec!["pharos.db.enc".to_string(), backup]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn open_discards_torn_pending_save() {
        let dir = temp_dir();
        {
            let db = Db::open_with_key(&dir, KEY).unwrap();
            db.with_conn(ensure_workspace).unwrap();
            db.persist().unwrap();
        }
        let mut torn = encrypt(&KEY, b"partial").unwrap();
        torn.truncate(torn.len() - 4);
        fs::write(dir.join("pharos.db.enc.new"), torn).unwrap();

        let db = Db::open_with_key(&dir, KEY).unwrap();
        db.with_conn(ensure_workspace).unwrap();
        assert_eq!(file_names(&dir), vec!["pharos.db.enc"]);
        fs::remove_dir_all(&dir).unwrap();
    }

    /// Writes `pharos.db.enc` as an older build would: only the migrations up
    /// to `last` applied. Returns the encrypted bytes on disk.
    fn write_db_migrated_until(dir: &Path, last: &str) -> Vec<u8> {
        let conn = Connection::open_in_memory().unwrap();
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
        let blob = encrypt(&KEY, &conn.serialize(DatabaseName::Main).unwrap()).unwrap();
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
            vec!["pharos.db.enc".to_string(), backup.clone()]
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
        // …and the migrated image was saved at once, so reopening migrates nothing.
        let db = Db::open_with_key(&dir, KEY).unwrap();
        assert_eq!(db.with_conn(pending_migrations).unwrap().len(), 0);
        assert_eq!(fs::read(dir.join(&backup)).unwrap(), before);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn no_backup_on_a_fresh_install_or_an_up_to_date_db() {
        let dir = temp_dir();
        let db = Db::open_with_key(&dir, KEY).unwrap();
        db.with_conn(ensure_workspace).unwrap();
        db.persist().unwrap();
        drop(db);
        Db::open_with_key(&dir, KEY).unwrap();
        assert_eq!(file_names(&dir), vec!["pharos.db.enc"]);
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
            db.persist().unwrap();
        }
        let before = fs::read(dir.join("pharos.db.enc")).unwrap();

        let err = Db::open_with_key(&dir, KEY).err().expect("must refuse");
        assert!(err.starts_with(NEWER_DB_ERROR), "{err}");
        assert!(err.contains("9999_from_the_future.sql"), "{err}");
        assert_eq!(fs::read(dir.join("pharos.db.enc")).unwrap(), before);
        assert_eq!(file_names(&dir), vec!["pharos.db.enc"]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn refuses_a_newer_pending_save_without_promoting_it() {
        let dir = temp_dir();
        write_db_migrated_until(&dir, "0011_sync_conflicts.sql");
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO schema_migrations (name) VALUES ('9999_from_the_future.sql')",
            [],
        )
        .unwrap();
        let newer = encrypt(&KEY, &conn.serialize(DatabaseName::Main).unwrap()).unwrap();
        fs::write(dir.join("pharos.db.enc.new"), &newer).unwrap();
        let before = fs::read(dir.join("pharos.db.enc")).unwrap();

        assert!(Db::open_with_key(&dir, KEY).is_err());
        assert_eq!(fs::read(dir.join("pharos.db.enc")).unwrap(), before);
        assert_eq!(fs::read(dir.join("pharos.db.enc.new")).unwrap(), newer);
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
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn each_upgrade_within_one_version_gets_its_own_backup() {
        let dir = temp_dir();
        let first = write_db_migrated_until(&dir, "0011_sync_conflicts.sql");
        drop(Db::open_with_key(&dir, KEY).unwrap());
        // A later database of the same app version, one migration behind.
        let second = write_db_migrated_until(&dir, "0015_audit_actor_repair.sql");
        drop(Db::open_with_key(&dir, KEY).unwrap());

        let enc = dir.join("pharos.db.enc");
        assert_eq!(
            fs::read(backup_path(&enc, Some("0011_sync_conflicts.sql"))).unwrap(),
            first
        );
        assert_eq!(
            fs::read(backup_path(&enc, Some("0015_audit_actor_repair.sql"))).unwrap(),
            second
        );
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
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_missing_key_with_a_saved_file_is_not_replaced() {
        let dir = temp_dir();
        saved_db(&dir);
        let before = fs::read(dir.join("pharos.db.enc")).unwrap();

        let store = MemStore::default();
        let err = Db::open_with_store(&dir, &store)
            .err()
            .expect("must refuse");
        assert!(err.starts_with(KEY_MISSING_ERROR), "{err}");
        assert_eq!(store.key(), None, "no new key may be stored");
        assert_eq!(fs::read(dir.join("pharos.db.enc")).unwrap(), before);
        assert_eq!(file_names(&dir), vec!["pharos.db.enc"]);

        // A first save that never got renamed counts as a saved file too.
        fs::rename(dir.join("pharos.db.enc"), dir.join("pharos.db.enc.new")).unwrap();
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

    /// Acceptance of SEC-03: on another PC, with only the `.enc` file and the
    /// recovery key, the data comes back and the key is in the keychain again.
    #[test]
    fn the_enc_file_and_the_recovery_key_recover_the_data_on_another_pc() {
        let first_pc = temp_dir();
        let id = saved_db(&first_pc);
        let original = Db::open_with_store(&first_pc, &MemStore::with(KEY)).unwrap();
        let recovery_key = original.recovery_key();
        let first_device = original.with_conn(crate::oplog::device_id).unwrap();
        original.persist().unwrap();
        drop(original);

        let other_pc = temp_dir();
        fs::copy(
            first_pc.join("pharos.db.enc"),
            other_pc.join("pharos.db.enc"),
        )
        .unwrap();
        let keychain = MemStore::default();
        let err = Db::open_with_store(&other_pc, &keychain).err().unwrap();
        assert!(err.starts_with(KEY_MISSING_ERROR), "{err}");

        let typed = recovery_key.to_lowercase().replace('-', " ");
        let db = Db::recover(&other_pc, &keychain, &typed).unwrap();
        assert_eq!(db.with_conn(ensure_workspace).unwrap(), id);
        let name: String = db
            .with_conn(|c| {
                c.query_row("SELECT name FROM workspaces", [], |r| r.get(0))
                    .map_err(|e| e.to_string())
            })
            .unwrap();
        assert_eq!(name, "Recovered");
        assert_eq!(keychain.key(), Some(KEY));
        // AUD-01: the copy gets its own device id, so its audit chain never forks.
        let device = db.with_conn(crate::oplog::device_id).unwrap();
        assert_ne!(device, first_device);
        drop(db);
        // The next start opens normally from the keychain.
        Db::open_with_store(&other_pc, &keychain).unwrap();
        fs::remove_dir_all(&first_pc).unwrap();
        fs::remove_dir_all(&other_pc).unwrap();
    }

    #[test]
    fn a_recovery_key_replaces_a_mismatched_keychain_key() {
        let dir = temp_dir();
        saved_db(&dir);
        let keychain = MemStore::with([3u8; 32]);
        Db::recover(&dir, &keychain, &recovery::encode(&KEY)).unwrap();
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
        saved_db(&dir);
        fs::rename(dir.join("pharos.db.enc"), dir.join("pharos.db.enc.new")).unwrap();
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
        let id = saved_db(&dir);
        fs::rename(dir.join("pharos.db.enc"), dir.join("pharos.db.enc.new")).unwrap();
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

        // The right recovery key promotes it and brings the data back.
        let db = Db::recover(&dir, &keychain, &recovery::encode(&KEY)).unwrap();
        assert_eq!(db.with_conn(ensure_workspace).unwrap(), id);
        assert_eq!(keychain.key(), Some(KEY));
        assert_eq!(file_names(&dir), vec!["pharos.db.enc"]);
        fs::remove_dir_all(&dir).unwrap();
    }

    /// A crash between writing `.new` and the rename leaves a complete, newer
    /// save. A wrong key must not delete it: the right key brings it back.
    #[test]
    fn a_wrong_key_never_deletes_a_complete_pending_save() {
        let dir = temp_dir();
        saved_db(&dir);
        let db = Db::open_with_store(&dir, &MemStore::with(KEY)).unwrap();
        db.with_conn(|c| {
            c.execute("UPDATE workspaces SET name = 'Newest'", [])
                .map_err(|e| e.to_string())
        })
        .unwrap();
        let image = db
            .with_conn(|c| {
                c.serialize(DatabaseName::Main)
                    .map(|d| d.to_vec())
                    .map_err(|e| e.to_string())
            })
            .unwrap();
        drop(db);
        fs::write(
            dir.join("pharos.db.enc.new"),
            encrypt(&KEY, &image).unwrap(),
        )
        .unwrap();
        let enc = fs::read(dir.join("pharos.db.enc")).unwrap();
        let pending = fs::read(dir.join("pharos.db.enc.new")).unwrap();
        let unchanged = || {
            assert_eq!(fs::read(dir.join("pharos.db.enc")).unwrap(), enc);
            assert_eq!(fs::read(dir.join("pharos.db.enc.new")).unwrap(), pending);
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
        let name: String = db
            .with_conn(|c| {
                c.query_row("SELECT name FROM workspaces", [], |r| r.get(0))
                    .map_err(|e| e.to_string())
            })
            .unwrap();
        assert_eq!(name, "Newest");
        assert_eq!(file_names(&dir), vec!["pharos.db.enc"]);
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

        Db::recover(&dir, &keychain, &recovery::encode(&KEY)).unwrap();
        assert_eq!(keychain.key(), Some(KEY));
        assert_eq!(keychain.previous.get(), None);
        Db::open_with_store(&dir, &keychain).unwrap();
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_damaged_keychain_entry_with_nothing_saved_is_replaced() {
        let dir = temp_dir();
        let keychain = MemStore::damaged();
        let db = Db::open_with_store(&dir, &keychain).unwrap();
        assert_eq!(keychain.key(), Some(db.key));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_wrong_recovery_key_changes_nothing() {
        let dir = temp_dir();
        saved_db(&dir);
        let before = fs::read(dir.join("pharos.db.enc")).unwrap();
        let keychain = MemStore::default();

        let other_key = recovery::encode(&[4u8; 32]);
        let err = Db::recover(&dir, &keychain, &other_key).err().unwrap();
        assert!(err.starts_with(WRONG_RECOVERY_KEY), "{err}");
        assert!(!err.contains(&other_key[..9]), "{err}");
        assert_eq!(keychain.key(), None);
        assert_eq!(fs::read(dir.join("pharos.db.enc")).unwrap(), before);
        assert_eq!(file_names(&dir), vec!["pharos.db.enc"]);
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
