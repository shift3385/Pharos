//! Local observability (BASE-08, ADR-0022): structured logs and the
//! diagnostic bundle.
//!
//! Logs are JSON lines in a daily rotating file (`pharos.YYYY-MM-DD.log`, 7
//! kept) under the app log dir. The filter is `info` unless `PHAROS_LOG` holds
//! an `EnvFilter` directive. Log statements never interpolate user content —
//! only ids, command names, counts and error kinds — and anything that comes
//! from outside that rule (frontend errors, error strings) goes through
//! [`redact`] first. A panic is also appended synchronously to
//! `pharos.panic.log`, because the non-blocking writer may not flush it.
//!
//! The diagnostic bundle carries the app version, OS, WebView2, applied
//! migrations and the recent logs (redacted again). It never carries the
//! database, keys, tokens, the profile or any entity content. It still works
//! when the database failed to open: it then reports why, without migrations.

use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use regex::{Captures, Regex};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{fmt, EnvFilter, Layer};

use crate::db::Db;

const LOG_PREFIX: &str = "pharos";
const LOG_SUFFIX: &str = "log";
const LOG_FILES_KEPT: usize = 7;
const PANIC_LOG: &str = "pharos.panic.log";
/// Log files, lines per file and bytes read from the end of each file that go
/// into a diagnostic bundle.
const BUNDLE_LOG_FILES: usize = 3;
const BUNDLE_LOG_LINES: usize = 2000;
const BUNDLE_LOG_TAIL_BYTES: u64 = 1024 * 1024;
/// Longest frontend message accepted by `diag_log`.
const MAX_CLIENT_MESSAGE: usize = 2000;
/// `diag_log` writes at most this many messages per window, so an error loop
/// in the frontend cannot grow the day's log without bound.
const CLIENT_LOG_MAX: u32 = 20;
const CLIENT_LOG_WINDOW: Duration = Duration::from_secs(10);
/// Longest database-open error kept for the bundle.
const MAX_OPEN_ERROR: usize = 300;

/// Managed state: where the logs live, why the database did not open (if it
/// did not), the `diag_log` throttle, and the guard that flushes the
/// non-blocking writer.
pub struct DiagState {
    log_dir: Option<PathBuf>,
    db_open_error: Mutex<Option<String>>,
    throttle: Mutex<Throttle>,
    _guard: Option<WorkerGuard>,
}

impl DiagState {
    /// Keeps a redacted, truncated copy of why the database failed to open, so
    /// a later diagnostic export can report it.
    pub fn record_db_open_error(&self, error: &str) {
        let kept: String = redact(error).chars().take(MAX_OPEN_ERROR).collect();
        if let Ok(mut slot) = self.db_open_error.lock() {
            *slot = Some(kept);
        }
    }

    fn db_open_error(&self) -> Option<String> {
        self.db_open_error.lock().ok().and_then(|slot| slot.clone())
    }
}

/// The daily rotating appender in `log_dir`, or `None` if the dir cannot be
/// created or written.
fn file_appender(log_dir: &Path) -> Option<RollingFileAppender> {
    fs::create_dir_all(log_dir).ok()?;
    RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix(LOG_PREFIX)
        .filename_suffix(LOG_SUFFIX)
        .max_log_files(LOG_FILES_KEPT)
        .build(log_dir)
        .ok()
}

/// Starts logging into `log_dir`. Never fails the app: without a log dir, or
/// with one that cannot be written, Pharos runs without a log file.
pub fn init(log_dir: Option<PathBuf>) -> DiagState {
    let filter =
        || EnvFilter::try_from_env("PHAROS_LOG").unwrap_or_else(|_| EnvFilter::new("info"));
    let (file_layer, guard) = match log_dir.as_deref().and_then(file_appender) {
        Some(appender) => {
            let (writer, guard) = tracing_appender::non_blocking(appender);
            let layer = fmt::layer()
                .json()
                .with_writer(writer)
                .with_current_span(false)
                .with_filter(filter());
            (Some(layer), Some(guard))
        }
        None => (None, None),
    };
    let has_file = file_layer.is_some();
    let stderr_layer = cfg!(debug_assertions).then(|| {
        fmt::layer()
            .with_writer(std::io::stderr)
            .with_filter(filter())
    });
    // A second init (tests, hot restart) keeps the first subscriber.
    let _ = tracing_subscriber::registry()
        .with(file_layer)
        .with(stderr_layer)
        .try_init();

    install_panic_hook(log_dir.clone().filter(|_| has_file));
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        build = build_profile(),
        os = %os_info::get(),
        webview = tauri::webview_version().ok().as_deref().unwrap_or("unknown"),
        log_file = has_file,
        "pharos started"
    );
    DiagState {
        log_dir,
        db_open_error: Mutex::new(None),
        throttle: Mutex::new(Throttle::default()),
        _guard: guard,
    }
}

fn install_panic_hook(log_dir: Option<PathBuf>) {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_default();
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_default();
        let message = redact(&payload);
        if let Some(dir) = &log_dir {
            write_panic_line(dir, &location, &message);
        }
        tracing::error!(target: "panic", location, %message, "panic");
        previous(info);
    }));
}

/// Appends one JSON line to `pharos.panic.log` and syncs it. A panic may end
/// the process before the non-blocking writer flushes, so this path does not
/// go through it.
fn write_panic_line(log_dir: &Path, location: &str, message: &str) {
    let unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default();
    let line = serde_json::json!({
        "unixMs": unix_ms,
        "level": "ERROR",
        "target": "panic",
        "fields": { "message": "panic", "location": location, "panic": message },
    });
    // If even this fails there is nothing else to do: stderr still has it.
    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join(PANIC_LOG))
        .and_then(|mut file| {
            writeln!(file, "{line}")?;
            file.sync_all()
        });
}

fn build_profile() -> &'static str {
    if cfg!(debug_assertions) {
        "debug"
    } else {
        "release"
    }
}

/// Fixed-window limit for `diag_log`.
#[derive(Default)]
struct Throttle {
    window_start: Option<Instant>,
    admitted: u32,
    dropped: u32,
}

impl Throttle {
    /// `Some(n)` when a message may be written, where `n` messages were
    /// dropped in the previous window (to report once); `None` to drop it.
    fn admit(&mut self, now: Instant) -> Option<u32> {
        let fresh = self
            .window_start
            .map_or(true, |start| now.duration_since(start) >= CLIENT_LOG_WINDOW);
        let mut dropped_before = 0;
        if fresh {
            dropped_before = self.dropped;
            *self = Throttle {
                window_start: Some(now),
                admitted: 0,
                dropped: 0,
            };
        }
        if self.admitted < CLIENT_LOG_MAX {
            self.admitted += 1;
            Some(dropped_before)
        } else {
            self.dropped += 1;
            None
        }
    }
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

struct Rule {
    re: Regex,
    with: &'static str,
}

fn rules() -> &'static [Rule] {
    static RULES: OnceLock<Vec<Rule>> = OnceLock::new();
    RULES.get_or_init(|| {
        let rule = |pattern: &str, with: &'static str| Rule {
            re: Regex::new(pattern).expect("valid redaction pattern"),
            with,
        };
        // Order matters: specific token shapes before the generic ones.
        vec![
            rule(
                r"eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}",
                "<token>",
            ),
            rule(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+", "Bearer <token>"),
            rule(
                r"\b(?:sk-(?:ant-|or-)?[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{30,})",
                "<key>",
            ),
            rule(
                r#"(?i)((?:api[_-]?key|x-goog-api-key|x-api-key|access[_-]?token|refresh[_-]?token|token|password|secret|authorization)["']?\s*[:=]\s*["']?)[^\s"',&}]+"#,
                "${1}<redacted>",
            ),
            rule(
                r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
                "<email>",
            ),
            rule(r#"(?i)\b([A-Z]:[\\/]+Users[\\/]+)[^\\/\s"']+"#, "${1}<user>"),
        ]
    })
}

/// The shape of a recovery key (SEC-03, ADR-0024): 14 groups of 4 base32
/// characters, as written (`-`) or as typed (spaces).
fn recovery_key_run() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)\b[0-9A-Z]{4}(?:[ -][0-9A-Z]{4}){13}\b").expect("valid pattern")
    })
}

/// True if `run` mixes ASCII letters and digits, as keys do and words don't.
fn mixed(run: &str) -> bool {
    run.chars().any(|ch| ch.is_ascii_digit()) && run.chars().any(|ch| ch.is_ascii_alphabetic())
}

/// Long opaque runs (keys, hashes, base64 blobs) that mix letters and digits.
fn opaque_run() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[A-Za-z0-9+_=-]{32,}").expect("valid pattern"))
}

/// Entity ids are UUIDs: they identify a row, not a person, and are kept.
fn uuid() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^(?i)[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$").expect("valid pattern")
    })
}

/// Masks emails, tokens, API keys, secrets in `key=value` form, long opaque
/// strings, recovery keys and the Windows user name in profile paths. A safety
/// net, not a licence: free text (a person's name in a provider error) is not
/// detected.
pub fn redact(text: &str) -> String {
    let mut out = text.to_string();
    for rule in rules() {
        out = rule.re.replace_all(&out, rule.with).into_owned();
    }
    out = recovery_key_run()
        .replace_all(&out, |c: &Captures| {
            if mixed(&c[0]) {
                "<recovery-key>".to_string()
            } else {
                c[0].to_string()
            }
        })
        .into_owned();
    opaque_run()
        .replace_all(&out, |c: &Captures| {
            let run = &c[0];
            if mixed(run) && !uuid().is_match(run) {
                "<redacted>".to_string()
            } else {
                run.to_string()
            }
        })
        .into_owned()
}

// ---------------------------------------------------------------------------
// Diagnostic bundle
// ---------------------------------------------------------------------------

/// Non-identifying UI facts the frontend adds to the bundle.
#[derive(Deserialize, Serialize, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClientInfo {
    #[serde(default)]
    language: String,
    #[serde(default)]
    theme: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticBundle {
    manifest: Manifest,
    logs: Vec<LogFile>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    app: AppInfo,
    os: OsInfo,
    webview: String,
    ui: ClientInfo,
    database: DatabaseInfo,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: &'static str,
    version: &'static str,
    build: &'static str,
    tauri: &'static str,
    target: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct OsInfo {
    name: String,
    version: String,
    arch: &'static str,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct DatabaseInfo {
    migrations: Vec<AppliedMigration>,
    /// Audit events of any account on this device not yet on the server
    /// (AUD-01). They are not in the pending badge; a number that keeps growing
    /// points at a server without the `append-only` feature. Absent when the
    /// database is not open.
    #[serde(skip_serializing_if = "Option::is_none")]
    pending_audit_events: Option<i64>,
    /// Audit events the server refused for other content under their id: never
    /// resent; a number above 0 points at a bug or a tampered copy.
    #[serde(skip_serializing_if = "Option::is_none")]
    rejected_audit_events: Option<i64>,
    /// Test cases with pending changes this device holds back because the
    /// server has not listed `stable-steps` (DAT-02): an older server would
    /// serve their stable steps to clients that only know text steps. They go
    /// out on the first sync with a server that lists it. Absent when the
    /// database is not open.
    #[serde(skip_serializing_if = "Option::is_none")]
    held_back_cases: Option<i64>,
    /// Why they are held back; absent when nothing is.
    #[serde(skip_serializing_if = "Option::is_none")]
    held_back_reason: Option<&'static str>,
    /// Why the local database is not open; absent when it is.
    #[serde(skip_serializing_if = "Option::is_none")]
    open_error: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct AppliedMigration {
    name: String,
    applied_at: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct LogFile {
    name: String,
    content: String,
}

fn applied_migrations(conn: &Connection) -> Result<Vec<AppliedMigration>, String> {
    let mut stmt = conn
        .prepare("SELECT name, applied_at FROM schema_migrations ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(AppliedMigration {
                name: row.get(0)?,
                applied_at: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string());
    rows
}

fn is_log_name(name: &str) -> bool {
    name.starts_with(&format!("{LOG_PREFIX}.")) && name.ends_with(&format!(".{LOG_SUFFIX}"))
}

/// The last `max_lines` lines of `path`, reading at most `max_bytes` from its
/// end (a partial first line is dropped), so a huge log is never loaded whole.
fn read_tail(path: &Path, max_bytes: u64, max_lines: usize) -> Option<String> {
    let mut file = fs::File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let start = len.saturating_sub(max_bytes);
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    let text = String::from_utf8_lossy(&bytes);
    let text = if start > 0 {
        text.split_once('\n').map(|(_, rest)| rest).unwrap_or("")
    } else {
        &text
    };
    let lines: Vec<&str> = text.lines().collect();
    Some(lines[lines.len().saturating_sub(max_lines)..].join("\n"))
}

/// The newest `BUNDLE_LOG_FILES` logs in `log_dir` (not its subdirectories,
/// where E2E profiles log), each cut to its tail and redacted. Names sort
/// newest first, and `pharos.panic.log` before the dated files. A missing dir
/// gives no logs.
fn recent_logs(log_dir: &Path) -> Vec<LogFile> {
    let Ok(entries) = fs::read_dir(log_dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| is_log_name(n))
        .collect();
    names.sort_unstable_by(|a, b| b.cmp(a));
    names
        .into_iter()
        .take(BUNDLE_LOG_FILES)
        .filter_map(|name| {
            let tail = read_tail(
                &log_dir.join(&name),
                BUNDLE_LOG_TAIL_BYTES,
                BUNDLE_LOG_LINES,
            )?;
            Some(LogFile {
                name,
                content: redact(&tail),
            })
        })
        .collect()
}

/// The bundle. `conn` is `None` when the database failed to open; the bundle
/// then carries `open_error` instead of the migrations.
fn build_bundle(
    conn: Option<&Connection>,
    open_error: Option<String>,
    log_dir: Option<&Path>,
    client: ClientInfo,
    webview: String,
) -> Result<DiagnosticBundle, String> {
    let os = os_info::get();
    let database = match conn {
        Some(conn) => DatabaseInfo {
            migrations: applied_migrations(conn)?,
            pending_audit_events: Some(crate::audit::pending_count(conn)?),
            rejected_audit_events: Some(crate::audit::rejected_count(conn)?),
            held_back_cases: Some(crate::sync::held_back_cases(conn)?),
            held_back_reason: (crate::sync::held_back_cases(conn)? > 0)
                .then_some("server-without-stable-steps"),
            open_error: None,
        },
        None => DatabaseInfo {
            migrations: Vec::new(),
            pending_audit_events: None,
            rejected_audit_events: None,
            held_back_cases: None,
            held_back_reason: None,
            open_error: Some(redact(open_error.as_deref().unwrap_or("database not open"))),
        },
    };
    Ok(DiagnosticBundle {
        manifest: Manifest {
            app: AppInfo {
                name: "Pharos",
                version: env!("CARGO_PKG_VERSION"),
                build: build_profile(),
                tauri: tauri::VERSION,
                target: format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS),
            },
            os: OsInfo {
                name: os.os_type().to_string(),
                version: os.version().to_string(),
                arch: std::env::consts::ARCH,
            },
            webview,
            ui: ClientInfo {
                language: redact(&client.language),
                theme: redact(&client.theme),
            },
            database,
        },
        logs: log_dir.map(recent_logs).unwrap_or_default(),
    })
}

/// The level and the redacted, truncated text `diag_log` writes for a
/// frontend message. Unknown levels are logged as info.
fn client_event(level: &str, message: &str) -> (tracing::Level, String) {
    let level = match level {
        "error" => tracing::Level::ERROR,
        "warn" => tracing::Level::WARN,
        _ => tracing::Level::INFO,
    };
    let text = redact(message).chars().take(MAX_CLIENT_MESSAGE).collect();
    (level, text)
}

/// Writes a frontend error or warning into the log: redacted, truncated and
/// throttled (`CLIENT_LOG_MAX` per `CLIENT_LOG_WINDOW`).
#[tauri::command]
pub fn diag_log(diag: State<DiagState>, level: String, message: String) {
    let admitted = match diag.throttle.lock() {
        Ok(mut throttle) => throttle.admit(Instant::now()),
        Err(_) => None,
    };
    let Some(dropped_before) = admitted else {
        return;
    };
    if dropped_before > 0 {
        tracing::warn!(target: "frontend", dropped = dropped_before, "frontend messages dropped by the throttle");
    }
    let (level, message) = client_event(&level, &message);
    match level {
        tracing::Level::ERROR => tracing::error!(target: "frontend", %message),
        tracing::Level::WARN => tracing::warn!(target: "frontend", %message),
        _ => tracing::info!(target: "frontend", %message),
    }
}

/// Builds the diagnostic bundle; the frontend zips and saves it. Works without
/// a database, so it is available exactly when the database failed to open.
#[tauri::command]
pub fn diag_export(
    app: AppHandle,
    diag: State<DiagState>,
    client: ClientInfo,
) -> Result<DiagnosticBundle, String> {
    let webview = tauri::webview_version().unwrap_or_else(|_| "unknown".to_string());
    let log_dir = diag.log_dir.as_deref();
    let bundle = match app.try_state::<Db>() {
        Some(db) => {
            db.with_conn(|conn| build_bundle(Some(conn), None, log_dir, client, webview))?
        }
        None => build_bundle(None, diag.db_open_error(), log_dir, client, webview)?,
    };
    tracing::info!(
        logs = bundle.logs.len(),
        database_open = bundle.manifest.database.open_error.is_none(),
        "diagnostic bundle exported"
    );
    Ok(bundle)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Markers that stand for user data; none may leave in a bundle.
    const PROJECT: &str = "Proyecto-Confidencial-Zafiro";
    const CASE: &str = "Caso secreto de pago con tarjeta";
    const EMAIL: &str = "ana.perez@cliente.example";
    const FIRST_NAME: &str = "Anabel";
    const JWT: &str = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJlLXNlY3JldA";
    const OPENAI_KEY: &str = "sk-proj-AbCdEf0123456789GhIjKl";
    const GEMINI_KEY: &str = "AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q";
    const REFRESH: &str = "f3a9c1d2e4b5a6978877665544332211aabbccdd";

    /// Cases shared with the frontend redactor (redact.test.ts).
    const FIXTURE: &str = include_str!("../../src/shared/diagnostics/redaction-fixture.json");

    fn tmp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pharos-diag-{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// An in-memory database with migrations applied and user data in it.
    fn conn_with_user_data() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        let ws = crate::db::ensure_workspace(&c).unwrap();
        c.execute(
            "INSERT INTO projects (id, workspace_id, name, owner_id, created_by, updated_by,
                                   created_at, updated_at)
             VALUES ('p1', ?1, ?2, 'u1', 'u1', 'u1', datetime('now'), datetime('now'))",
            [&ws, PROJECT],
        )
        .unwrap();
        c.execute(
            "INSERT INTO test_cases (id, workspace_id, scenario_id, title, author, project_id,
                                     created_by, updated_by, created_at, updated_at)
             VALUES ('c1', ?1, 'TC001', ?2, ?3, 'p1', 'u1', 'u1', datetime('now'),
                     datetime('now'))",
            [&ws, CASE, EMAIL],
        )
        .unwrap();
        c.execute(
            "INSERT INTO profiles (id, workspace_id, display_name, first_name, last_name,
                                   created_by, updated_by, created_at, updated_at)
             VALUES ('u1', ?1, ?2, ?3, 'Perez', 'u1', 'u1', datetime('now'), datetime('now'))",
            [&ws, EMAIL, FIRST_NAME],
        )
        .unwrap();
        c
    }

    fn write_log(dir: &Path, name: &str, lines: &[String]) {
        fs::write(dir.join(name), lines.join("\n")).unwrap();
    }

    fn strings(value: &serde_json::Value) -> Vec<String> {
        value
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .collect()
    }

    #[test]
    fn redact_agrees_with_the_shared_fixture() {
        let fixture: serde_json::Value = serde_json::from_str(FIXTURE).unwrap();
        for case in fixture["masked"].as_array().unwrap() {
            let input = case["input"].as_str().unwrap();
            let out = redact(input);
            for secret in strings(&case["secrets"]) {
                assert!(!out.contains(&secret), "{secret} leaked in: {out}");
            }
            for expected in strings(&case["expect"]) {
                assert!(out.contains(&expected), "{expected:?} missing in: {out}");
            }
        }
        for kept in strings(&fixture["kept"]) {
            assert_eq!(redact(&kept), kept);
        }
    }

    #[test]
    fn unwritable_log_dir_gives_no_file_appender() {
        let dir = tmp_dir("unwritable");
        let file = dir.join("a-file");
        fs::write(&file, "not a dir").unwrap();
        // A dir cannot be created under a regular file.
        assert!(file_appender(&file.join("logs")).is_none());
        assert!(file_appender(&dir.join("logs")).is_some());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn panic_lines_are_appended_synchronously() {
        let dir = tmp_dir("panic");
        write_panic_line(&dir, "src/x.rs:1", "first");
        write_panic_line(&dir, "src/y.rs:2", "second");
        let text = fs::read_to_string(dir.join(PANIC_LOG)).unwrap();
        let lines: Vec<serde_json::Value> = text
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[1]["fields"]["location"], "src/y.rs:2");
        assert_eq!(lines[1]["fields"]["panic"], "second");
        assert!(is_log_name(PANIC_LOG), "the bundle picks it up");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn client_event_maps_levels_redacts_and_truncates() {
        assert_eq!(client_event("error", "x").0, tracing::Level::ERROR);
        assert_eq!(client_event("warn", "x").0, tracing::Level::WARN);
        assert_eq!(client_event("info", "x").0, tracing::Level::INFO);
        assert_eq!(client_event("bogus", "x").0, tracing::Level::INFO);
        assert_eq!(
            client_event("error", &format!("hi {EMAIL}")).1,
            "hi <email>"
        );
        let long = "é".repeat(MAX_CLIENT_MESSAGE + 50);
        assert_eq!(
            client_event("error", &long).1.chars().count(),
            MAX_CLIENT_MESSAGE
        );
    }

    #[test]
    fn throttle_limits_each_window_and_reports_drops_once() {
        let mut throttle = Throttle::default();
        let t0 = Instant::now();
        for _ in 0..CLIENT_LOG_MAX {
            assert_eq!(throttle.admit(t0), Some(0));
        }
        assert_eq!(throttle.admit(t0), None);
        assert_eq!(throttle.admit(t0 + Duration::from_secs(1)), None);
        // Next window: admitted again, and the 2 drops are reported once.
        let t1 = t0 + CLIENT_LOG_WINDOW;
        assert_eq!(throttle.admit(t1), Some(2));
        assert_eq!(throttle.admit(t1), Some(0));
    }

    #[test]
    fn read_tail_reads_only_the_end_of_a_big_file() {
        let dir = tmp_dir("tail");
        let path = dir.join("pharos.2026-10-28.log");
        let lines: Vec<String> = (0..1000).map(|i| format!("line-{i:04}")).collect();
        write_log(&dir, "pharos.2026-10-28.log", &lines);
        // 100 bytes from the end: a partial first line is dropped.
        let tail = read_tail(&path, 100, 2000).unwrap();
        let got: Vec<&str> = tail.lines().collect();
        assert!(got.len() < 12, "only the end was read: {} lines", got.len());
        assert_eq!(got.last(), Some(&"line-0999"));
        assert!(got.iter().all(|l| l.len() == "line-0000".len()));
        // Whole small file, cut to the last lines.
        let tail = read_tail(&path, u64::MAX, 3).unwrap();
        assert_eq!(tail, "line-0997\nline-0998\nline-0999");
        assert!(read_tail(&dir.join("missing.log"), 100, 10).is_none());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn recent_logs_takes_newest_files_and_last_lines() {
        let dir = tmp_dir("logs");
        for day in ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"] {
            write_log(
                &dir,
                &format!("pharos.{day}.log"),
                &[format!("line of {day}")],
            );
        }
        let many: Vec<String> = (0..BUNDLE_LOG_LINES + 10)
            .map(|i| format!("n{i}"))
            .collect();
        write_log(&dir, "pharos.2026-10-28.log", &many);
        fs::write(dir.join("other.txt"), "not a log").unwrap();
        fs::create_dir_all(dir.join("e2e")).unwrap();
        write_log(
            &dir.join("e2e"),
            "pharos.2026-10-29.log",
            &["e2e".to_string()],
        );

        let logs = recent_logs(&dir);
        let names: Vec<&str> = logs.iter().map(|l| l.name.as_str()).collect();
        assert_eq!(
            names,
            [
                "pharos.2026-10-28.log",
                "pharos.2026-10-27.log",
                "pharos.2026-10-26.log"
            ]
        );
        let newest: Vec<&str> = logs[0].content.lines().collect();
        assert_eq!(newest.len(), BUNDLE_LOG_LINES);
        assert_eq!(newest.first(), Some(&"n10"));
        assert!(recent_logs(&dir.join("missing")).is_empty());
        fs::remove_dir_all(dir).unwrap();
    }

    /// BASE-08 acceptance: the exported diagnostic contains no user data.
    #[test]
    fn bundle_excludes_user_data() {
        let conn = conn_with_user_data();
        let dir = tmp_dir("bundle");
        write_log(
            &dir,
            "pharos.2026-10-28.log",
            &[
                format!(r#"{{"level":"ERROR","fields":{{"message":"login failed for {EMAIL}"}}}}"#),
                format!(r#"{{"level":"WARN","fields":{{"message":"Authorization: Bearer {JWT}"}}}}"#),
                format!(r#"{{"level":"WARN","fields":{{"message":"ai key {OPENAI_KEY} {GEMINI_KEY}"}}}}"#),
                format!(r#"{{"level":"INFO","fields":{{"message":"refresh_token={REFRESH}"}}}}"#),
                r#"{"level":"INFO","fields":{"message":"opened C:\\Users\\anabel\\AppData\\Roaming\\com.pharos.desktop"}}"#.to_string(),
            ],
        );
        let client = ClientInfo {
            language: "es".into(),
            theme: "dark".into(),
        };
        let bundle =
            build_bundle(Some(&conn), None, Some(&dir), client, "156.0.0.0".into()).unwrap();
        let json = serde_json::to_string(&bundle).unwrap();

        for marker in [
            PROJECT, CASE, EMAIL, FIRST_NAME, JWT, OPENAI_KEY, GEMINI_KEY, REFRESH, "anabel",
        ] {
            assert!(!json.contains(marker), "{marker} leaked into the bundle");
        }
        // What the bundle is for is still there.
        assert!(json.contains(env!("CARGO_PKG_VERSION")));
        assert!(json.contains("0001_init.sql"));
        assert!(json.contains("0011_sync_conflicts.sql"));
        assert!(json.contains("156.0.0.0"));
        assert!(json.contains("login failed for <email>"));
        assert!(!json.contains("openError"), "the database is open");
        assert_eq!(bundle.logs.len(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn bundle_without_logs_still_reports_versions() {
        let conn = conn_with_user_data();
        let bundle = build_bundle(
            Some(&conn),
            None,
            Some(Path::new("does-not-exist")),
            ClientInfo::default(),
            "unknown".into(),
        )
        .unwrap();
        assert!(bundle.logs.is_empty());
        assert_eq!(bundle.manifest.app.version, env!("CARGO_PKG_VERSION"));
        assert!(!bundle.manifest.database.migrations.is_empty());
        // AUD-01: pending audit events are counted (no ids, no content).
        assert_eq!(bundle.manifest.database.pending_audit_events, Some(0));
        assert_eq!(bundle.manifest.database.rejected_audit_events, Some(0));
        let no_log_dir =
            build_bundle(Some(&conn), None, None, ClientInfo::default(), "x".into()).unwrap();
        assert!(no_log_dir.logs.is_empty());
    }

    /// The export is most needed when the database did not open.
    #[test]
    fn bundle_when_the_database_failed_to_open() {
        let dir = tmp_dir("noopen");
        write_log(&dir, "pharos.2026-10-28.log", &["boot".to_string()]);
        let error = format!(r"decrypt failed for C:\Users\anabel\AppData\pharos.db.enc ({EMAIL})");
        let bundle = build_bundle(
            None,
            Some(error),
            Some(&dir),
            ClientInfo::default(),
            "156.0.0.0".into(),
        )
        .unwrap();
        let json = serde_json::to_value(&bundle).unwrap();
        let db = &json["manifest"]["database"];
        assert_eq!(db["migrations"], serde_json::json!([]));
        let open_error = db["openError"].as_str().unwrap();
        assert!(open_error.starts_with("decrypt failed for C:\\Users\\<user>\\"));
        assert!(!open_error.contains("anabel") && !open_error.contains(EMAIL));
        assert_eq!(bundle.logs.len(), 1, "logs still travel");

        let unknown = build_bundle(None, None, None, ClientInfo::default(), "x".into()).unwrap();
        assert_eq!(
            unknown.manifest.database.open_error.as_deref(),
            Some("database not open")
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn open_error_is_kept_redacted_and_short() {
        let state = DiagState {
            log_dir: None,
            db_open_error: Mutex::new(None),
            throttle: Mutex::new(Throttle::default()),
            _guard: None,
        };
        assert_eq!(state.db_open_error(), None);
        state.record_db_open_error(&format!("keychain error for {EMAIL} {}", "x".repeat(400)));
        let kept = state.db_open_error().unwrap();
        assert!(kept.starts_with("keychain error for <email>"));
        assert_eq!(kept.chars().count(), MAX_OPEN_ERROR);
    }
}
