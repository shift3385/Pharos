//! Pharos desktop shell (Tauri 2). Kept in a library crate so the future mobile
//! target (v0.0.4) can reuse the same entrypoint.

mod ai;
mod db;
mod diag;
mod downloads;
mod hlc;
mod instance;
mod key_sync;
mod keys;
mod oplog;
mod planner;
mod profile;
mod project;
mod purge;
mod requirement;
mod sync;
mod template;
mod test_case;
mod test_plan;

use db::{Db, DbStatus};
use keyring::Entry;
use tauri::Manager;

// The session is cached in the OS keychain (Windows Credential Manager) so the
// app can reopen offline without storing the refresh token in plain text (§4).
// The account is `session`, scoped per instance for an E2E profile (instance.rs).
const KEYCHAIN_SERVICE: &str = "pharos";
const SESSION_ACCOUNT: &str = "session";

#[tauri::command]
fn session_save(data: String) -> Result<(), String> {
    Entry::new(KEYCHAIN_SERVICE, &instance::account(SESSION_ACCOUNT))
        .and_then(|entry| entry.set_password(&data))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn session_load() -> Result<Option<String>, String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, &instance::account(SESSION_ACCOUNT))
        .map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn session_clear() -> Result<(), String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, &instance::account(SESSION_ACCOUNT))
        .map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Without a resolvable log dir Pharos runs without a log file.
            let log_dir = app.path().app_log_dir().ok().map(instance::scoped_dir);
            app.manage(diag::init(log_dir));
            // Download folder for exports (UX-02), remembered per instance.
            let prefs_file = app
                .path()
                .app_config_dir()
                .ok()
                .map(|dir| instance::scoped_dir(dir).join("downloads.json"));
            app.manage(downloads::Downloads::load(
                prefs_file,
                app.path().download_dir().ok(),
            ));
            let data_dir = instance::scoped_dir(app.path().app_data_dir()?);
            let started = std::time::Instant::now();
            // A database that cannot be opened (e.g. written by a newer Pharos,
            // SEC-06) does not abort startup: the UI asks `db_open_error` and
            // shows why instead of the app silently failing to start. The
            // failure is logged so a diagnostics export can explain it.
            let open_error = match Db::open(&data_dir) {
                Ok(database) => {
                    tracing::info!(
                        elapsed_ms = started.elapsed().as_millis() as u64,
                        e2e_profile = instance::e2e_profile().is_some(),
                        "local database opened"
                    );
                    app.manage(database);
                    None
                }
                Err(e) => {
                    tracing::error!(error = %diag::redact(&e), "local database failed to open");
                    app.state::<diag::DiagState>().record_db_open_error(&e);
                    Some(e)
                }
            };
            app.manage(DbStatus { open_error });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            session_save,
            session_load,
            session_clear,
            db::db_open_error,
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
            purge::purge_deleted,
            key_sync::key_lease_requests,
            key_sync::key_blocks_apply,
            key_sync::key_conflicts_record,
            key_sync::key_conflicts_list,
            key_sync::key_conflict_resolve,
            diag::diag_log,
            diag::diag_export,
            downloads::download_dir_get,
            downloads::download_dir_pick,
            downloads::download_dir_reset,
            downloads::download_save
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pharos");
}
