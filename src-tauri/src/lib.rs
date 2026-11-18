//! `pharos-core` (CORE-01, ADR-0050): the local database, migrations,
//! repositories, oplog and sync of Pharos. The desktop shell (`app.rs`, the
//! `pharos` package) builds it with the `tauri` feature, which adds the
//! `#[tauri::command]` wrappers; the CLI (INT-01) builds it without Tauri.

// Without Tauri some imports and helpers only the command wrappers use are left
// unused; the desktop build (feature `tauri`) still checks them under clippy.
#![cfg_attr(not(feature = "tauri"), allow(unused_imports, dead_code))]

pub mod ai;
pub mod audit;
pub mod audit_read;
#[cfg(test)]
mod audit_tests;
pub mod blob_sync;
pub mod case_baseline;
pub mod case_review;
pub mod custom_fields;
#[cfg(test)]
mod custom_fields_tests;
pub mod cycles;
pub mod db;
pub mod defects;
// Logs and the diagnostic bundle of the desktop app (BASE-08): Tauri only.
#[cfg(feature = "tauri")]
pub mod diag;
pub mod downloads;
pub mod evidence;
pub mod execution;
pub mod hlc;
pub mod home_metrics;
pub mod instance;
pub mod journal;
pub mod key_sync;
pub mod keychain;
pub mod keys;
pub mod notifications;
pub mod oplog;
pub mod planner;
pub mod profile;
pub mod project;
pub mod project_scan;
pub mod purge;
pub mod recovery;
pub mod requirement;
pub mod requirement_attachments;
pub mod restored_copy;
pub mod revisions;
#[cfg(test)]
mod revisions_sync_tests;
pub mod runs;
pub mod server;
pub mod steps;
pub mod sync;
pub mod sync_class;
// SYNC-02 (ADR-0051): the field-level merge; wired into the conflict path in S4.
pub mod sync_merge;
pub mod template;
pub mod test_case;
pub mod test_plan;
pub mod trash;
pub mod workspaces;

// The session is cached in the OS keychain (Windows Credential Manager) so the
// app can reopen offline without storing the refresh token in plain text (§4).
// The account is `session`, scoped per instance for an E2E profile (instance.rs).
pub const KEYCHAIN_SERVICE: &str = "pharos";
pub const SESSION_ACCOUNT: &str = "session";

/// The access token of the session cached for `origin` (IA-12): Rust sends the
/// AI key with this token, never with one the webview hands over, so the key
/// only goes to the account signed in on the chosen server.
pub fn session_access_token(origin: &str) -> Result<Option<String>, String> {
    let raw = keychain::read(KEYCHAIN_SERVICE, &instance::account(SESSION_ACCOUNT))?;
    Ok(raw
        .and_then(|raw| server::unwrap_session(&raw, origin))
        .and_then(|data| serde_json::from_str::<serde_json::Value>(&data).ok())
        .and_then(|v| v["accessToken"].as_str().map(String::from))
        .filter(|t| !t.is_empty()))
}

/// True while a session is cached, whatever its server: the server can only
/// change while signed out.
pub fn session_cached() -> Result<bool, String> {
    Ok(keychain::read(KEYCHAIN_SERVICE, &instance::account(SESSION_ACCOUNT))?.is_some())
}
