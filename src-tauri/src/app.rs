//! Pharos desktop shell (Tauri 2): builds the app and registers the commands
//! of `pharos-core` (CORE-01, ADR-0050). Everything else lives in the core,
//! which the CLI (INT-01) builds without Tauri. Kept in a library crate so the
//! future mobile target (v0.0.4) can reuse the same entrypoint.

use pharos_core::db::DbStatus;
// The core's modules by name, so the command list below reads as before.
use pharos_core::*;
use tauri::Manager;

// The cached session records the server it belongs to (SEC-10, ADR-0046): a
// session of another server is not offered, so the app never sends one
// server's token to another.
#[tauri::command]
fn session_save(server: tauri::State<server::ServerState>, data: String) -> Result<(), String> {
    let wrapped = server::wrap_session(&server.origin(), &data);
    keychain::write(
        KEYCHAIN_SERVICE,
        &instance::account(SESSION_ACCOUNT),
        &wrapped,
    )
}

#[tauri::command]
fn session_load(server: tauri::State<server::ServerState>) -> Result<Option<String>, String> {
    let raw = keychain::read(KEYCHAIN_SERVICE, &instance::account(SESSION_ACCOUNT))?;
    Ok(raw.and_then(|raw| server::unwrap_session(&raw, &server.origin())))
}

#[tauri::command]
fn session_clear() -> Result<(), String> {
    keychain::delete(KEYCHAIN_SERVICE, &instance::account(SESSION_ACCOUNT))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Who approves a case: the workspace roles (CAS-02, SYNC-07).
            case_review::set_approver_check(Box::new(workspaces::WorkspaceApprover));
            // The main window is built here from its tauri.conf.json entry
            // (`create: false` there), first, as Tauri would build it, so an
            // E2E profile of a debug build can add WebView2 arguments
            // (instance.rs). Same config: label, title, sizes, CSP.
            let config = app
                .config()
                .app
                .windows
                .first()
                .ok_or("no window in tauri.conf.json")?;
            let mut window = tauri::WebviewWindowBuilder::from_config(app.handle(), config)?;
            if let Some(args) = instance::webview_browser_args() {
                window = window.additional_browser_args(&args);
            }
            window.build()?;
            // Without a resolvable log dir Pharos runs without a log file.
            let log_dir = app.path().app_log_dir().ok().map(instance::scoped_dir);
            app.manage(diag::init(log_dir));
            app.manage(evidence::Uploads::default());
            app.manage(evidence::check::EvidenceCheck::default());
            // Project folders picked for the AI requirement extraction (IA-17).
            app.manage(project_scan::ProjectScans::default());
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
            // The server picked at sign-in (SEC-10), remembered per instance.
            let server_file = app
                .path()
                .app_config_dir()
                .ok()
                .map(|dir| instance::scoped_dir(dir).join("server.json"));
            app.manage(server::ServerState::load(server_file));
            let data_dir = instance::scoped_dir(app.path().app_data_dir()?);
            // A database that cannot be opened (e.g. written by a newer Pharos,
            // SEC-06) does not abort startup: the UI asks `db_open_error` and
            // shows why instead of the app silently failing to start; a missing
            // or wrong key is answered with the recovery key (`db_recover`,
            // SEC-03). Converting a `pharos.db.enc` of 0.5 (SEC-05) runs in the
            // background behind its own screen (`db_open_converting`).
            app.manage(DbStatus::new(data_dir));
            db::open_at_startup(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            session_save,
            session_load,
            session_clear,
            server::server_get,
            server::server_check,
            server::server_set,
            server::server_bind_account,
            server::server_pending,
            server::server_request,
            db::db_open_error,
            db::db_open_converting,
            db::db_open_retry,
            db::db_recover,
            db::recovery_key_export,
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
            test_plan::test_plan_review,
            test_plan::test_plan_delete,
            test_plan::test_plan_revisions,
            test_plan::test_plan_revision_get,
            test_plan::test_plan_history,
            test_case::test_case_list,
            test_case::test_case_get,
            test_case::test_case_create,
            test_case::test_case_update,
            test_case::test_case_delete,
            test_case::test_case_revisions,
            test_case::test_case_revision_get,
            test_case::test_case_review,
            test_case::test_case_review_base,
            case_baseline::case_baseline_create,
            case_baseline::case_baseline_list,
            case_baseline::case_baseline_get,
            case_baseline::case_baseline_current,
            shared_library::library_list,
            shared_library::library_get,
            shared_library::library_create,
            shared_library::library_update,
            shared_library::library_impact,
            shared_library::library_set_status,
            shared_library::library_delete,
            shared_library::library_versions,
            shared_library::library_case_status,
            shared_library::library_preview,
            custom_fields::custom_field_list,
            custom_fields::custom_field_create,
            custom_fields::custom_field_update,
            custom_fields::custom_field_archive,
            custom_fields::custom_field_reorder,
            custom_fields::custom_field_copy,
            requirement::requirement_list,
            requirement::requirement_get,
            requirement::requirement_create,
            requirement::requirement_update,
            requirement::requirement_delete,
            requirement::requirement_import,
            requirement_attachments::requirement_attachment_add,
            requirement_attachments::requirement_attachment_list,
            requirement_attachments::requirement_attachment_preview,
            project_scan::project_scan_pick,
            project_scan::project_scan_read,
            project_scan::project_scan_close,
            requirement::requirement_risk_set,
            runs::run_create,
            runs::run_update,
            runs::run_get,
            runs::run_list,
            runs::run_items_add,
            runs::run_items_list,
            runs::result_record,
            runs::results_list,
            runs::findings::run_findings_list,
            runs::findings::run_metrics_list,
            runs::findings::finding_triage_set,
            runs::findings::finding_triage_history,
            runs::unlinked_mapping_set,
            cycles::configuration_list,
            cycles::configuration_create,
            cycles::configuration_update,
            cycles::configuration_archive,
            cycles::configuration_reorder,
            cycles::cycle_list,
            cycles::cycle_get,
            cycles::cycle_create,
            cycles::cycle_update,
            cycles::cycle_clone,
            cycles::cycle_delete,
            cycles::cycle_items_list,
            cycles::cycle_items_add,
            cycles::cycle_items_add_by_filter,
            cycles::cycle_filter_preview,
            cycles::cycle_item_update,
            cycles::cycle_items_remove,
            cycles::cycle_items_reorder,
            cycles::cycle_execute,
            cycles::cycle_runs,
            cycles::cycle_progress_get,
            execution::execution_summary,
            execution::cycle_close,
            home_metrics::home_metrics,
            audit_read::audit_list,
            audit_read::audit_facets,
            audit_read::audit_verify,
            defects::defect_list,
            defects::defect_get,
            defects::defect_create,
            defects::defect_update,
            defects::defect_transition,
            defects::defect_delete,
            defects::defect_link_set,
            defects::defect_draft_from_result,
            defects::defect_result_list,
            defects::defect_attachment_add,
            defects::defect_attachment_list,
            defects::defect_attachment_save,
            defects::defect_attachment_delete,
            runs::import::run_import_preview,
            runs::import::run_import,
            runs::import::run_import_attach,
            runs::import::unlinked_tests_list,
            runs::import::run_counts_list,
            runs::manual::run_overview,
            runs::manual::run_create_manual,
            runs::manual::run_close,
            runs::delete::run_delete_preview,
            runs::delete::run_delete,
            runs::manual::run_item_detail,
            runs::manual::execution_draft_save,
            runs::manual::execution_draft_discard,
            runs::manual::execution_record,
            runs::manual::execution_attach,
            runs::manual::execution_attachment_delete,
            runs::manual::execution_attachment_save,
            runs::manual::execution_attachment_preview,
            planner::planner_list,
            planner::planner_create,
            planner::planner_update,
            planner::planner_delete,
            planner::planner_reorder,
            evidence::evidence_upload_begin,
            evidence::evidence_upload_chunk,
            evidence::evidence_upload_cancel,
            evidence::check::evidence_usage,
            evidence::check::evidence_check_progress,
            evidence::check::evidence_check,
            evidence::check::evidence_check_cancel,
            evidence::check::evidence_orphans_delete,
            evidence::retention::evidence_retention_get,
            evidence::retention::evidence_retention_set,
            evidence::retention::evidence_retention_preview,
            evidence::retention::evidence_retention_copy,
            planner::planner_attachment_add,
            planner::planner_attachment_list,
            planner::planner_attachment_save,
            planner::planner_attachment_delete,
            template::template_list,
            template::template_get,
            template::template_create,
            template::template_update,
            template::template_delete,
            template::template_seed,
            blob_sync::blobs_transfer,
            ai::ai_key_set,
            ai::ai_key_status,
            ai::ai_key_clear,
            ai::ai_chat_online,
            ai::ai_key_test,
            ai::ai_list_models,
            ai::ai_web_access_upload,
            oplog::oplog_pending_count,
            oplog::oplog_compact,
            sync::oplog_pending,
            sync::oplog_mark_synced,
            sync::oplog_mark_rejected,
            sync::apply_remote,
            sync::sync_server_lists,
            workspaces::workspaces_apply,
            workspaces::workspaces_list,
            workspaces::project_workspaces,
            workspaces::workspace_drop,
            workspaces::sync_refused_record,
            workspaces::sync_rejections_list,
            workspaces::sync_rejection_discard,
            sync::sync_cursor_get,
            sync::sync_cursor_set,
            sync::sync_server_features_set,
            sync::sync_conflicts_list,
            sync::sync_conflict_resolve,
            sync::sync_auto_merged_take,
            purge::purge_deleted,
            trash::trash_list,
            trash::trash_restore,
            trash::trash_purge,
            notifications::notifications_list,
            notifications::notifications_cursor,
            notifications::notifications_apply_pull,
            notifications::notifications_add_local,
            notifications::notifications_mark_read,
            notifications::notifications_read_pending,
            notifications::notifications_read_sent,
            notifications::notifications_outbox_add,
            notifications::notifications_outbox_list,
            notifications::notifications_outbox_done,
            key_sync::key_lease_requests,
            key_sync::key_lease_for,
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
