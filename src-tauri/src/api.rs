//! Entry points without Tauri for other processes on this computer: the CLI
//! (`pharos upload`, INT-01), later the local MCP server (IA-06) and the
//! runner (RUN-01). CORE-01, ADR-0050.
//!
//! Each function does exactly what its desktop command does, through the same
//! code (`runs::import`), so the desktop and the CLI cannot drift apart.
//! Requests are the same JSON the UI sends: build them with `serde_json`.
//!
//! Until SEC-05b, opening the database takes the data folder for this process
//! only (`db::DB_IN_USE_ERROR` while the app or another CLI has it open), so a
//! CLI never overwrites what the app is saving.

use std::io::Read;
use std::path::Path;

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
