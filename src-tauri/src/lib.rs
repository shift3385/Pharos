//! Pharos desktop shell (Tauri 2). Kept in a library crate so the future mobile
//! target (v0.0.4) can reuse the same entrypoint.

use keyring::Entry;

// The session is cached in the OS keychain (Windows Credential Manager) so the
// app can reopen offline without storing the refresh token in plain text (§4).
const KEYCHAIN_SERVICE: &str = "pharos";
const KEYCHAIN_ACCOUNT: &str = "session";

#[tauri::command]
fn session_save(data: String) -> Result<(), String> {
    Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
        .and_then(|entry| entry.set_password(&data))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn session_load() -> Result<Option<String>, String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn session_clear() -> Result<(), String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            session_save,
            session_load,
            session_clear
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pharos");
}
