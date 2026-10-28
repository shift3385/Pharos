//! Local encrypted SQLite (spec §16 Phase 2). The working database lives in
//! memory; at rest it is persisted to `pharos.db.enc` as an AES-256-GCM blob.
//! The 32-byte key is kept in the OS keychain. SQLCipher was not used because
//! its OpenSSL build did not compile under the former GNU toolchain (see SEC-04).
//!
//! The plaintext image only ever exists in memory: it is moved in and out of
//! SQLite with `deserialize`/`serialize`. The encrypted file is replaced
//! atomically (write `pharos.db.enc.new`, fsync, rename), so a crash mid-save
//! leaves the previous copy intact.

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

const KEYCHAIN_SERVICE: &str = "pharos";
const KEYCHAIN_DB_KEY: &str = "db-key";
const B64: base64::engine::general_purpose::GeneralPurpose =
    base64::engine::general_purpose::STANDARD;
const NONCE_LEN: usize = 12;

const MIGRATIONS: &[(&str, &str)] = &[
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
];

pub struct Db {
    conn: Mutex<Connection>,
    enc_path: PathBuf,
    key: [u8; 32],
}

impl Db {
    /// Opens (or creates) the encrypted database under `app_data_dir`.
    pub fn open(app_data_dir: &Path) -> Result<Self, String> {
        Self::open_with_key(app_data_dir, load_or_create_key()?)
    }

    fn open_with_key(app_data_dir: &Path, key: [u8; 32]) -> Result<Self, String> {
        fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
        let enc_path = app_data_dir.join("pharos.db.enc");
        recover_leftovers(app_data_dir, &enc_path, &key)?;
        let mut conn = Connection::open_in_memory().map_err(|e| e.to_string())?;

        if enc_path.exists() {
            let blob = fs::read(&enc_path).map_err(|e| e.to_string())?;
            let plain = decrypt(&key, &blob)?;
            load_image(&mut conn, &plain)?;
        }

        run_migrations(&conn)?;
        Ok(Db {
            conn: Mutex::new(conn),
            enc_path,
            key,
        })
    }

    /// Runs a closure with a locked connection.
    pub fn with_conn<T>(
        &self,
        f: impl FnOnce(&Connection) -> Result<T, String>,
    ) -> Result<T, String> {
        let conn = self.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
        f(&conn)
    }

    /// Serializes the in-memory database and writes it encrypted to disk.
    pub fn persist(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|_| "db lock poisoned".to_string())?;
        let image = conn
            .serialize(DatabaseName::Main)
            .map_err(|e| e.to_string())?;
        let blob = encrypt(&self.key, &image)?;
        write_atomic(&self.enc_path, &blob)
    }
}

/// Path of the in-progress copy written before the atomic rename.
fn pending_path(enc_path: &Path) -> PathBuf {
    let mut name = enc_path.as_os_str().to_owned();
    name.push(".new");
    PathBuf::from(name)
}

/// Writes `bytes` to `<path>.new`, fsyncs it and renames it over `path`, so the
/// previous file survives a crash or power cut at any point of the write.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let pending = pending_path(path);
    let written = (|| {
        let mut file = fs::File::create(&pending)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&pending, path)
    })();
    if let Err(e) = written {
        let _ = fs::remove_file(&pending);
        return Err(format!("failed to save local database: {e}"));
    }
    Ok(())
}

/// Cleans up what an interrupted run may have left next to `pharos.db.enc`:
/// - `pharos.db.tmp`: plaintext copy written by versions before the in-memory
///   fix; overwritten with zeros, then deleted.
/// - `pharos.db.enc.new`: a save that never got renamed. AES-GCM authenticates
///   the whole blob, so if it decrypts it is a complete, newer save and is
///   promoted; otherwise it is a torn write and is discarded.
fn recover_leftovers(dir: &Path, enc_path: &Path, key: &[u8; 32]) -> Result<(), String> {
    let legacy_plain = dir.join("pharos.db.tmp");
    if legacy_plain.exists() {
        wipe_file(&legacy_plain)?;
    }

    let pending = pending_path(enc_path);
    if pending.exists() {
        let complete = fs::read(&pending)
            .map(|blob| decrypt(key, &blob).is_ok())
            .unwrap_or(false);
        if complete {
            fs::rename(&pending, enc_path).map_err(|e| e.to_string())?;
        } else {
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

    for (name, sql) in MIGRATIONS {
        let applied = conn
            .query_row(
                "SELECT 1 FROM schema_migrations WHERE name = ?1",
                [name],
                |_| Ok(()),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .is_some();
        if applied {
            continue;
        }
        conn.execute_batch(sql)
            .map_err(|e| format!("migration {name} failed: {e}"))?;
        conn.execute("INSERT INTO schema_migrations (name) VALUES (?1)", [name])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn load_or_create_key() -> Result<[u8; 32], String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_DB_KEY).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(b64) => {
            let bytes = B64.decode(b64).map_err(|e| e.to_string())?;
            bytes
                .try_into()
                .map_err(|_| "stored db key has wrong length".to_string())
        }
        Err(keyring::Error::NoEntry) => {
            let key = Aes256Gcm::generate_key(&mut OsRng);
            entry
                .set_password(&B64.encode(key.as_slice()))
                .map_err(|e| e.to_string())?;
            let mut out = [0u8; 32];
            out.copy_from_slice(key.as_slice());
            Ok(out)
        }
        Err(e) => Err(e.to_string()),
    }
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
        .map_err(|_| "failed to decrypt local database".to_string())
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
        fs::write(dir.join("pharos.db.enc.new"), encrypt(&KEY, &image).unwrap()).unwrap();

        let db = Db::open_with_key(&dir, KEY).unwrap();
        let v: String = db
            .with_conn(|c| {
                c.query_row("SELECT v FROM marker", [], |r| r.get(0))
                    .map_err(|e| e.to_string())
            })
            .unwrap();
        assert_eq!(v, "newer");
        assert_eq!(file_names(&dir), vec!["pharos.db.enc"]);
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
}
