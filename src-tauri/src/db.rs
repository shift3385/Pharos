//! Local encrypted SQLite (spec §16 Phase 2). The working database lives in
//! memory; at rest it is persisted to `pharos.db.enc` as an AES-256-GCM blob.
//! The 32-byte key is kept in the OS keychain. SQLCipher is intentionally not
//! used because its OpenSSL build does not compile under the GNU toolchain.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::Engine as _;
use keyring::Entry;
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
];

pub struct Db {
    conn: Mutex<Connection>,
    enc_path: PathBuf,
    key: [u8; 32],
}

impl Db {
    /// Opens (or creates) the encrypted database under `app_data_dir`.
    pub fn open(app_data_dir: &Path) -> Result<Self, String> {
        fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
        let enc_path = app_data_dir.join("pharos.db.enc");
        let key = load_or_create_key()?;
        let mut conn = Connection::open_in_memory().map_err(|e| e.to_string())?;

        if enc_path.exists() {
            let blob = fs::read(&enc_path).map_err(|e| e.to_string())?;
            let plain = decrypt(&key, &blob)?;
            let tmp = app_data_dir.join("pharos.db.tmp");
            fs::write(&tmp, &plain).map_err(|e| e.to_string())?;
            let restored = conn
                .restore(
                    DatabaseName::Main,
                    &tmp,
                    None::<fn(rusqlite::backup::Progress)>,
                )
                .map_err(|e| e.to_string());
            let _ = fs::remove_file(&tmp);
            restored?;
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
        let tmp = self.enc_path.with_extension("tmp");
        conn.backup(DatabaseName::Main, &tmp, None)
            .map_err(|e| e.to_string())?;
        let bytes = fs::read(&tmp).map_err(|e| e.to_string())?;
        let _ = fs::remove_file(&tmp);
        let blob = encrypt(&self.key, &bytes)?;
        fs::write(&self.enc_path, blob).map_err(|e| e.to_string())?;
        Ok(())
    }
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
        assert_eq!(applied, 1);
    }
}
