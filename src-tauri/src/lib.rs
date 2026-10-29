//! Pharos desktop shell (Tauri 2). Kept in a library crate so the future mobile
//! target (v0.0.4) can reuse the same entrypoint.

mod ai;
mod db;
mod diag;
mod hlc;
mod instance;
mod oplog;
mod planner;
mod profile;
mod project;
mod requirement;
mod sync;
mod template;
mod test_case;
mod test_plan;

use db::Db;
use keyring::Entry;
use tauri::Manager;

// The session is cached in the OS keychain (Windows Credential Manager) so the
// app can reopen offline without storing the refresh token in plain text (§4).
// The account is `session`, or a per-run one for an E2E profile (instance.rs).
const KEYCHAIN_SERVICE: &str = "pharos";

#[tauri::command]
fn session_save(data: String) -> Result<(), String> {
    Entry::new(KEYCHAIN_SERVICE, &instance::session_account())
        .and_then(|entry| entry.set_password(&data))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn session_load() -> Result<Option<String>, String> {
    let entry =
        Entry::new(KEYCHAIN_SERVICE, &instance::session_account()).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn session_clear() -> Result<(), String> {
    let entry =
        Entry::new(KEYCHAIN_SERVICE, &instance::session_account()).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(diag::init(instance::scoped_dir(app.path().app_log_dir()?)));
            let data_dir = instance::scoped_dir(app.path().app_data_dir()?);
            let started = std::time::Instant::now();
            let database = Db::open(&data_dir).map_err(|e| {
                tracing::error!(error = %diag::redact(&e), "local database failed to open");
                std::io::Error::other(e)
            })?;
            tracing::info!(
                elapsed_ms = started.elapsed().as_millis() as u64,
                e2e_profile = instance::e2e_profile().is_some(),
                "local database opened"
            );
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
            test_plan::test_plan_revision_get,
            test_case::test_case_list,
            test_case::test_case_get,
            test_case::test_case_create,
            test_case::test_case_update,
            test_case::test_case_delete,
            test_case::test_case_revisions,
            requirement::requirement_list,
            requirement::requirement_get,
            requirement::requirement_create,
            requirement::requirement_update,
            requirement::requirement_delete,
            requirement::requirement_import,
            planner::planner_list,
            planner::planner_create,
            planner::planner_update,
            planner::planner_delete,
            planner::planner_reorder,
            planner::planner_attachment_add,
            planner::planner_attachment_list,
            planner::planner_attachment_get,
            planner::planner_attachment_delete,
            template::template_list,
            template::template_get,
            template::template_create,
            template::template_update,
            template::template_delete,
            template::template_seed,
            ai::ai_key_set,
            ai::ai_key_status,
            ai::ai_key_clear,
            ai::ai_chat_online,
            ai::ai_list_models,
            oplog::oplog_pending_count,
            sync::oplog_pending,
            sync::oplog_mark_synced,
            sync::apply_remote,
            sync::sync_cursor_get,
            sync::sync_cursor_set,
            sync::sync_conflicts_list,
            sync::sync_conflict_resolve,
            diag::diag_log,
            diag::diag_export
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pharos");
}
