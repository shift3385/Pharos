//! Entry points without Tauri for other processes on this computer: the CLI
//! (`pharos upload`, INT-01), later the local MCP server (IA-06) and the
//! runner (RUN-01). CORE-01, ADR-0050.
//!
//! Each function does exactly what its desktop command does, through the same
//! code (`runs::import`), so the desktop and the CLI cannot drift apart.
//! Requests are the same JSON the UI sends: build them with `serde_json`.
//!
//! The CLI and the app use the database at the same time (SEC-05b). Opening
//! waits up to 10 s for another process that is opening (converting or
//! migrating) the folder, then fails with `db::DB_IN_USE_ERROR`; a write the
//! other processes keep busy past every retry fails with `db::DB_BUSY_ERROR`.

use std::io::Read;
use std::path::Path;

use serde::Serialize;
use serde_json::Value;

use crate::db::Db;
use crate::evidence::MAX_FILE_BYTES;
use crate::runs::import::{self, ReportImportOutcome, ReportImportPreview, ReportImportRequest};

/// Read size when copying a report or an attachment into the evidence store.
const CHUNK: usize = 64 * 1024;

/// Opens (or creates) the local database in `data_dir`, with its key from
/// the OS keychain, applying pending migrations as the app does (with the
/// same backup first). See `paths::default_data_dir` for the app's folder.
pub fn open(data_dir: &Path) -> Result<Db, String> {
    Db::open(data_dir)
}

/// What importing `request` would do, without changing anything
/// (`run_import_preview`).
pub fn import_preview(
    db: &Db,
    request: &ReportImportRequest,
) -> Result<ReportImportPreview, String> {
    import::preview_rolled_back(db, request)
}

/// Imports a report (`run_import`). `raw` is the report file as read: it is
/// kept encrypted in the evidence store and its sha256 must match
/// `request.sha256`. At most `evidence::MAX_FILE_BYTES`.
pub fn import_report(
    db: &Db,
    request: &ReportImportRequest,
    raw: impl Read,
) -> Result<ReportImportOutcome, String> {
    import::import_upload(db, request, stored(db, raw)?)
}

/// Attaches one file of an imported report to a result or a step result
/// (`run_import_attach`), as listed in the outcome's `attachments`.
#[allow(clippy::too_many_arguments)]
pub fn import_attach(
    db: &Db,
    owner_entity: &str,
    owner_id: &str,
    content: impl Read,
    name: &str,
    mime: Option<&str>,
    kind: Option<&str>,
    user_id: &str,
) -> Result<String, String> {
    import::attach_upload(
        db,
        stored(db, content)?,
        owner_entity,
        owner_id,
        name,
        mime,
        kind,
        user_id,
    )
}

/// Opens the database in `data_dir` with `key` instead of the keychain's, so
/// the CLI's tests never read or create the user's `db-key`. Test builds only.
#[cfg(any(test, feature = "test-support"))]
pub fn open_with_key(data_dir: &Path, key: [u8; 32]) -> Result<Db, String> {
    Db::open_with_key(data_dir, key)
}

/// Seeds for the CLI's tests: a project held by `owner`, saved to disk so a
/// later open finds it. Test builds only.
#[cfg(any(test, feature = "test-support"))]
pub fn create_project_for_tests(
    db: &Db,
    owner: &str,
    name: &str,
    prefix: &str,
) -> Result<String, String> {
    let input: crate::project::ProjectInput = serde_json::from_value(serde_json::json!({
        "name": name, "ownerId": owner, "caseIdPrefix": prefix, "caseIdDigits": 3
    }))
    .map_err(|e| e.to_string())?;
    let id = db.with_conn(|c| crate::project::insert_project(c, &input))?;
    Ok(id)
}

// ---- lookups for the CLI (INT-01, ADR-0054) -----------------------------------

/// The account signed in to the desktop app on this computer: the CLI writes
/// as this user, like the app does (projects are held per account).
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SignedInUser {
    pub id: String,
    pub display_name: String,
    pub email: String,
    /// The server the session belongs to (`None` for a session cached before
    /// SEC-10, which is the build's default server).
    pub server: Option<String>,
}

/// The account the app has signed in (its cached session in the OS
/// keychain), or `None` when nobody is signed in. The tokens of the session
/// are never returned.
pub fn signed_in_user() -> Result<Option<SignedInUser>, String> {
    let raw = crate::keychain::read(
        crate::KEYCHAIN_SERVICE,
        &crate::instance::account(crate::SESSION_ACCOUNT),
    )?;
    Ok(raw.as_deref().and_then(parse_session))
}

/// A cached session: `{ server, session }` (SEC-10) or, before, the session
/// JSON itself.
fn parse_session(raw: &str) -> Option<SignedInUser> {
    let outer: Value = serde_json::from_str(raw).ok()?;
    let (server, session) = match (outer.get("server"), outer.get("session")) {
        (Some(Value::String(server)), Some(Value::String(inner))) => (
            Some(server.clone()),
            serde_json::from_str::<Value>(inner).ok()?,
        ),
        _ => (None, outer),
    };
    let user = session.get("user")?;
    let field = |k: &str| user.get(k).and_then(Value::as_str).unwrap_or_default();
    let id = field("id");
    (!id.is_empty()).then(|| SignedInUser {
        id: id.to_string(),
        display_name: field("displayName").to_string(),
        email: field("email").to_string(),
        server,
    })
}

/// A project of the account, as the CLI names it.
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRef {
    pub id: String,
    pub name: String,
    /// The case-id prefix (`PAG`): how the CLI and the API v1 name a project.
    pub case_id_prefix: String,
}

/// The account's live projects, by name (`project_list`).
pub fn list_projects(db: &Db, user_id: &str) -> Result<Vec<ProjectRef>, String> {
    let list = db.with_conn(|conn| crate::project::list_projects(conn, user_id))?;
    Ok(list
        .into_iter()
        .map(|p| ProjectRef {
            id: p.id,
            name: p.name,
            case_id_prefix: p.case_id_prefix,
        })
        .collect())
}

/// A run or a cycle of a project, found by its key.
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KeyedRef {
    pub id: String,
    pub key: String,
    /// Runs: `in_progress | completed | aborted`; cycles: `planned | active |
    /// closed`.
    pub status: String,
}

/// The project's run with this key (`RUN-12`, also `run-12`), from
/// `run_list`.
pub fn find_run(
    db: &Db,
    project_id: &str,
    user_id: &str,
    run_key: &str,
) -> Result<Option<KeyedRef>, String> {
    let runs = db.with_conn(|conn| crate::runs::list_runs(conn, project_id, user_id))?;
    Ok(runs
        .into_iter()
        .find(|r| r.run_key.eq_ignore_ascii_case(run_key.trim()))
        .map(|r| KeyedRef {
            id: r.id,
            key: r.run_key,
            status: r.status,
        }))
}

/// The project's cycle with this key (`CYC-3`), from `cycle_list`.
pub fn find_cycle(
    db: &Db,
    project_id: &str,
    user_id: &str,
    cycle_key: &str,
) -> Result<Option<KeyedRef>, String> {
    let cycles = db.with_conn(|conn| crate::cycles::list_cycles(conn, project_id, user_id))?;
    Ok(cycles
        .into_iter()
        .map(|c| c.cycle)
        .find(|c| c.cycle_key.eq_ignore_ascii_case(cycle_key.trim()))
        .map(|c| KeyedRef {
            id: c.id,
            key: c.cycle_key,
            status: c.status,
        }))
}

/// True when `data_dir` holds a saved database: the CLI opens only an existing
/// one and never creates a database (or a key) of its own. The file names are
/// `Db::open`'s: `pharos.db` (SEC-05a, N4: on-disk SQLite), or before it
/// `pharos.db.enc` or a first save not yet renamed. N5 may move this next to
/// its files in `db.rs`.
pub fn has_database(data_dir: &Path) -> Result<bool, String> {
    let exists = |name: &str| data_dir.join(name).try_exists().map_err(|e| e.to_string());
    Ok(exists("pharos.db")? || exists("pharos.db.enc")? || exists("pharos.db.enc.new")?)
}

/// Closes a run as `completed` (`run_close`), after the CLI imported several
/// files into it.
pub fn close_run(db: &Db, run_id: &str, user_id: &str) -> Result<(), String> {
    db.with_tx(|conn| crate::runs::manual::close_run(conn, run_id, "completed", false, user_id))?;
    db.persist_and_collect()
}

/// Streams `content` into a new evidence writer, as `evidence_upload_*` does
/// in chunks for the UI.
fn stored(db: &Db, mut content: impl Read) -> Result<crate::evidence::BlobWriter, String> {
    let mut writer = db.evidence().writer(MAX_FILE_BYTES)?;
    let mut buf = vec![0u8; CHUNK];
    loop {
        let n = content.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            return Ok(writer);
        }
        writer.write(&buf[..n])?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const U: &str = "11111111-1111-4111-8111-111111111111";

    fn temp_db() -> (Db, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("pharos-api-cli-{}", uuid::Uuid::new_v4()));
        (open_with_key(&dir, [9u8; 32]).unwrap(), dir)
    }

    fn project(db: &Db, name: &str, prefix: &str, owner: &str) -> String {
        let input: crate::project::ProjectInput = serde_json::from_value(json!({
            "name": name, "ownerId": owner, "caseIdPrefix": prefix, "caseIdDigits": 3
        }))
        .unwrap();
        db.with_conn(|c| crate::project::insert_project(c, &input))
            .unwrap()
    }

    #[test]
    fn a_cached_session_gives_its_user_and_never_its_tokens() {
        let session = json!({
            "accessToken": "secret-a", "refreshToken": "secret-r",
            "user": {"id": U, "displayName": "Ana", "email": "ana@example.com"}
        })
        .to_string();
        let wrapped =
            json!({"server": "https://pharos.example.com", "session": session}).to_string();
        let user = parse_session(&wrapped).unwrap();
        assert_eq!(user.id, U);
        assert_eq!(user.display_name, "Ana");
        assert_eq!(user.server.as_deref(), Some("https://pharos.example.com"));
        assert!(!serde_json::to_string(&user).unwrap().contains("secret"));
        // A session cached before SEC-10 is the session itself.
        assert_eq!(parse_session(&session).unwrap().server, None);
        assert_eq!(parse_session("not json"), None);
        assert_eq!(parse_session(r#"{"user":{"id":""}}"#), None);
    }

    /// Both layouts count: `pharos.db` (SEC-05a, N4) and `pharos.db.enc`
    /// (before it, also as a first save not yet renamed). A folder with
    /// neither, or with other files, has no database.
    #[test]
    fn a_database_is_found_in_either_layout() {
        let base = std::env::temp_dir().join(format!("pharos-api-layout-{}", uuid::Uuid::new_v4()));
        let check = |files: &[&str]| {
            let dir = base.join(files.join("+").replace('.', "_"));
            std::fs::create_dir_all(&dir).unwrap();
            for f in files {
                std::fs::write(dir.join(f), b"x").unwrap();
            }
            has_database(&dir).unwrap()
        };
        assert!(check(&["pharos.db"]), "SEC-05a layout");
        assert!(check(&["pharos.db.enc"]), "0.5 layout");
        assert!(check(&["pharos.db.enc.new"]), "first save not renamed");
        assert!(
            check(&["pharos.db", "pharos.db.enc"]),
            "converted, with the witness"
        );
        assert!(!check(&[]), "empty folder");
        assert!(!check(&["pharos.lock", "evidence"]), "other files only");
        assert!(!has_database(&base.join("missing")).unwrap(), "no folder");
        let _ = std::fs::remove_dir_all(base);
    }

    #[test]
    fn lookups_see_only_the_accounts_projects_and_a_saved_database() {
        let (db, dir) = temp_db();
        assert!(!has_database(&dir.join("elsewhere")).unwrap());
        let pag = project(&db, "Pagos web", "PAG-", U);
        project(&db, "Ajeno", "AJ-", "someone-else");
        let mine = list_projects(&db, U).unwrap();
        assert_eq!(mine.len(), 1);
        assert_eq!(
            (mine[0].id.as_str(), mine[0].case_id_prefix.as_str()),
            (pag.as_str(), "PAG-")
        );
        assert!(has_database(&dir).unwrap());
        assert_eq!(find_run(&db, &pag, U, "RUN-1").unwrap(), None);
        assert_eq!(find_cycle(&db, &pag, U, "CYC-1").unwrap(), None);
        drop(db);
        let _ = std::fs::remove_dir_all(dir);
    }
}
