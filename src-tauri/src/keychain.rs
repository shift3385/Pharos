//! The OS keychain (Windows Credential Manager) behind `keyring` — CORE-02.
//! Secrets kept outside the encrypted database live here, never in files,
//! logs or sync (§4, ADR-0006): the cached session (lib.rs) uses these
//! helpers; the AI keys (ai.rs) and the database key (db.rs) still call
//! `keyring` directly with the same semantics. A missing entry is not an
//! error: reading gives `None` and deleting succeeds.
//!
//! Windows stores the secret as UTF-16 in a blob of at most 2560 bytes, so a
//! secret holds at most 1280 UTF-16 code units; a longer one is refused.
//!
//! Calls are serialized: when one process writes and deletes credentials
//! from several threads at once, Credential Manager loses some deletes (the
//! entry comes back), and Tauri runs commands on a thread pool.

use keyring::Entry;
use std::sync::{Mutex, MutexGuard};

static LOCK: Mutex<()> = Mutex::new(());

/// One keychain call at a time in this process. A panic while holding the
/// lock leaves the keychain itself consistent, so a poisoned lock is reused.
fn serialized() -> MutexGuard<'static, ()> {
    LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// The secret stored for `account` of `service`, or `None` if there is none.
pub(crate) fn read(service: &str, account: &str) -> Result<Option<String>, String> {
    let _guard = serialized();
    let entry = Entry::new(service, account).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Stores `secret` for `account` of `service`, replacing any previous one.
pub(crate) fn write(service: &str, account: &str, secret: &str) -> Result<(), String> {
    let _guard = serialized();
    Entry::new(service, account)
        .and_then(|entry| entry.set_password(secret))
        .map_err(|e| e.to_string())
}

/// Removes the secret of `account`; succeeds if there was none.
pub(crate) fn delete(service: &str, account: &str) -> Result<(), String> {
    let _guard = serialized();
    let entry = Entry::new(service, account).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// These tests use the real Credential Manager of the user running them (the
// CI's Windows runner too), on a service of their own with one account per
// test, and remove what they stored even when they fail.
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    const SERVICE: &str = "pharos-test";
    /// Most UTF-16 code units a Windows credential blob holds (2560 bytes).
    const MAX_UNITS: usize = 1280;

    /// A unique account that is deleted when the test ends.
    struct Account(String);

    impl Account {
        fn new(name: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            Account(format!("core02-{name}-{}-{nanos}", std::process::id()))
        }
    }

    impl Drop for Account {
        fn drop(&mut self) {
            let _ = delete(SERVICE, &self.0);
        }
    }

    /// Writes and deletes from several threads at once (Tauri runs commands
    /// on a thread pool). Without the lock, Credential Manager loses some
    /// deletes: the entry is back once the other threads have written.
    #[test]
    fn concurrent_writes_and_deletes_lose_nothing() {
        let accounts: Vec<Account> = (0..8)
            .map(|i| Account::new(&format!("concurrent{i}")))
            .collect();
        std::thread::scope(|scope| {
            for account in &accounts {
                scope.spawn(move || {
                    for round in 0..25 {
                        write(SERVICE, &account.0, &format!("secret-{round}")).unwrap();
                        delete(SERVICE, &account.0).unwrap();
                    }
                });
            }
        });
        let left: Vec<&str> = accounts
            .iter()
            .filter(|a| read(SERVICE, &a.0).unwrap().is_some())
            .map(|a| a.0.as_str())
            .collect();
        assert!(left.is_empty(), "deleted entries came back: {left:?}");
    }

    #[test]
    fn missing_entry_reads_as_none_and_deletes_cleanly() {
        let account = Account::new("missing");
        assert_eq!(read(SERVICE, &account.0), Ok(None));
        assert_eq!(delete(SERVICE, &account.0), Ok(()));
    }

    #[test]
    fn round_trips_overwrites_and_deletes() {
        let account = Account::new("roundtrip");
        write(SERVICE, &account.0, "first").unwrap();
        assert_eq!(read(SERVICE, &account.0), Ok(Some("first".into())));
        write(SERVICE, &account.0, "second").unwrap();
        assert_eq!(read(SERVICE, &account.0), Ok(Some("second".into())));
        delete(SERVICE, &account.0).unwrap();
        assert_eq!(read(SERVICE, &account.0), Ok(None));
        // Deleting twice (sign out with no cached session) is not an error.
        assert_eq!(delete(SERVICE, &account.0), Ok(()));
    }

    #[test]
    fn accounts_and_services_are_independent() {
        let a = Account::new("a");
        let b = Account::new("b");
        write(SERVICE, &a.0, "secret-a").unwrap();
        write(SERVICE, &b.0, "secret-b").unwrap();
        // Same account under another service: a different entry.
        assert_eq!(read("pharos-test-other", &a.0), Ok(None));
        delete(SERVICE, &a.0).unwrap();
        assert_eq!(read(SERVICE, &b.0), Ok(Some("secret-b".into())));
    }

    #[test]
    fn keeps_unicode_and_json_intact() {
        let account = Account::new("unicode");
        let secret =
            r#"{"user":{"displayName":"Zoë Ñúñez — QA 🚀","note":"línea\nnueva \"citada\""}}"#;
        write(SERVICE, &account.0, secret).unwrap();
        assert_eq!(read(SERVICE, &account.0), Ok(Some(secret.to_string())));
    }

    /// A session at the server's field limits (email 254, display name 80,
    /// first and last name 120; HS256 access token, 32-byte refresh token)
    /// fits in a credential.
    #[test]
    fn a_session_at_the_servers_field_limits_fits() {
        let account = Account::new("session");
        // 64 + "@" + 181 + ".example" = 254 characters.
        let email = format!("{}@{}.example", "q".repeat(64), "d".repeat(181));
        let user = format!(
            r#"{{"id":"{id}","email":"{email}","displayName":"{d}","firstName":"{f}","lastName":"{l}","role":"user","createdAt":"2026-10-29T12:00:00.000Z"}}"#,
            id = "6f1c2a9e-0b7d-4c1e-9a55-2d4f8b3c7e10",
            d = "D".repeat(80),
            f = "F".repeat(120),
            l = "L".repeat(120),
        );
        let access = format!("{}.{}.{}", "h".repeat(36), "p".repeat(140), "s".repeat(43));
        let session = format!(
            r#"{{"accessToken":"{access}","refreshToken":"{}","user":{user}}}"#,
            "r".repeat(43)
        );
        assert!(
            session.len() < MAX_UNITS,
            "session is {} chars",
            session.len()
        );
        write(SERVICE, &account.0, &session).unwrap();
        assert_eq!(read(SERVICE, &account.0), Ok(Some(session)));
    }

    #[test]
    fn refuses_a_secret_above_the_windows_limit() {
        let account = Account::new("limit");
        write(SERVICE, &account.0, &"x".repeat(MAX_UNITS)).unwrap();
        assert_eq!(
            read(SERVICE, &account.0).unwrap().map(|s| s.len()),
            Some(MAX_UNITS)
        );
        assert!(write(SERVICE, &account.0, &"x".repeat(MAX_UNITS + 1)).is_err());
        // Characters outside the BMP take two code units each.
        assert!(write(SERVICE, &account.0, &"🚀".repeat(MAX_UNITS / 2 + 1)).is_err());
        // A refused write leaves the previous secret in place.
        assert_eq!(
            read(SERVICE, &account.0).unwrap().map(|s| s.len()),
            Some(MAX_UNITS)
        );
    }
}
