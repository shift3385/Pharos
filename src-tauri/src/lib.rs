//! Pharos desktop shell (Tauri 2). Kept in a library crate so the future mobile
//! target (v0.0.4) can reuse the same entrypoint.

mod db;
mod profile;
mod project;
mod test_case;
mod test_plan;

use db::Db;
use keyring::Entry;
use tauri::Manager;

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
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let database = Db::open(&data_dir)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            session_save,
            session_load,
            session_clear,
            profile::profile_get,
            profile::profile_upsert,
            project::project_list,
            project::project_get,
            project::project_create,
            project::project_update,
            project::project_delete,
            test_plan::test_plan_list,
            test_plan::test_plan_get,
            test_plan::test_plan_by_project,
            test_plan::test_plan_create,
            test_plan::test_plan_update,
            test_plan::test_plan_delete,
            test_plan::test_plan_revisions,
            test_case::test_case_list,
            test_case::test_case_get,
            test_case::test_case_create,
            test_case::test_case_update,
            test_case::test_case_delete,
            test_case::test_case_revisions
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pharos");
}
