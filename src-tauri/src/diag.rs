//! Local observability (BASE-08, ADR-0022): structured logs and the
//! diagnostic bundle.
//!
//! Logs are JSON lines in a daily rotating file (`pharos.YYYY-MM-DD.log`, 7
//! kept) under the app log dir. The filter is `info` unless `PHAROS_LOG` holds
//! an `EnvFilter` directive. Log statements never interpolate user content —
//! only ids, command names, counts and error kinds — and anything that comes
//! from outside that rule (frontend errors, error strings) goes through
//! [`redact`] first.
//!
//! The diagnostic bundle carries the app version, OS, WebView2, applied
//! migrations and the recent logs (redacted again). It never carries the
//! database, keys, tokens, the profile or any entity content.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use regex::{Captures, Regex};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{fmt, EnvFilter, Layer};

use crate::db::Db;

const LOG_PREFIX: &str = "pharos";
const LOG_SUFFIX: &str = "log";
const LOG_FILES_KEPT: usize = 7;
/// Log files and lines per file that go into a diagnostic bundle.
const BUNDLE_LOG_FILES: usize = 3;
const BUNDLE_LOG_LINES: usize = 2000;
/// Longest frontend message accepted by `diag_log`.
const MAX_CLIENT_MESSAGE: usize = 2000;

/// Managed state: where the logs live, plus the guard that flushes the
/// non-blocking writer when the app exits.
pub struct DiagState {
    log_dir: PathBuf,
    _guard: Option<WorkerGuard>,
}

/// Starts logging into `log_dir`. Never fails the app: without a writable log
/// dir Pharos runs without a log file.
pub fn init(log_dir: PathBuf) -> DiagState {
    let filter =
        || EnvFilter::try_from_env("PHAROS_LOG").unwrap_or_else(|_| EnvFilter::new("info"));
    let file = fs::create_dir_all(&log_dir).ok().and_then(|_| {
        RollingFileAppender::builder()
            .rotation(Rotation::DAILY)
            .filename_prefix(LOG_PREFIX)
            .filename_suffix(LOG_SUFFIX)
            .max_log_files(LOG_FILES_KEPT)
            .build(&log_dir)
            .ok()
    });
    let (file_layer, guard) = match file {
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

    install_panic_hook();
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        build = build_profile(),
        os = %os_info::get(),
        webview = tauri::webview_version().ok().as_deref().unwrap_or("unknown"),
        "pharos started"
    );
    DiagState {
        log_dir,
        _guard: guard,
    }
}

fn install_panic_hook() {
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
        tracing::error!(target: "panic", location, message = %redact(&payload), "panic");
        previous(info);
    }));
}

fn build_profile() -> &'static str {
    if cfg!(debug_assertions) {
        "debug"
    } else {
        "release"
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
/// strings and the Windows user name in profile paths.
pub fn redact(text: &str) -> String {
    let mut out = text.to_string();
    for rule in rules() {
        out = rule.re.replace_all(&out, rule.with).into_owned();
    }
    opaque_run()
        .replace_all(&out, |c: &Captures| {
            let run = &c[0];
            let mixed = run.chars().any(|ch| ch.is_ascii_digit())
                && run.chars().any(|ch| ch.is_ascii_alphabetic());
            if mixed && !uuid().is_match(run) {
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

/// The newest `BUNDLE_LOG_FILES` logs in `log_dir` (not its subdirectories,
/// where E2E profiles log), each cut to its last `BUNDLE_LOG_LINES` lines and
/// redacted. A missing dir gives no logs.
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
    // Date-stamped names sort chronologically; newest first.
    names.sort_unstable_by(|a, b| b.cmp(a));
    names
        .into_iter()
        .take(BUNDLE_LOG_FILES)
        .filter_map(|name| {
            let bytes = fs::read(log_dir.join(&name)).ok()?;
            let text = String::from_utf8_lossy(&bytes);
            let lines: Vec<&str> = text.lines().collect();
            let tail = lines[lines.len().saturating_sub(BUNDLE_LOG_LINES)..].join("\n");
            Some(LogFile {
                name,
                content: redact(&tail),
            })
        })
        .collect()
}

fn build_bundle(
    conn: &Connection,
    log_dir: &Path,
    client: ClientInfo,
    webview: String,
) -> Result<DiagnosticBundle, String> {
    let os = os_info::get();
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
            database: DatabaseInfo {
                migrations: applied_migrations(conn)?,
            },
        },
        logs: recent_logs(log_dir),
    })
}

/// Writes a frontend error or warning into the log, redacted and truncated.
#[tauri::command]
pub fn diag_log(level: String, message: String) {
    let message: String = redact(&message).chars().take(MAX_CLIENT_MESSAGE).collect();
    match level.as_str() {
        "error" => tracing::error!(target: "frontend", %message),
        "warn" => tracing::warn!(target: "frontend", %message),
        _ => tracing::info!(target: "frontend", %message),
    }
}

/// Builds the diagnostic bundle; the frontend zips and saves it.
#[tauri::command]
pub fn diag_export(
    db: State<Db>,
    diag: State<DiagState>,
    client: ClientInfo,
) -> Result<DiagnosticBundle, String> {
    let webview = tauri::webview_version().unwrap_or_else(|_| "unknown".to_string());
    let bundle = db.with_conn(|conn| build_bundle(conn, &diag.log_dir, client, webview))?;
    tracing::info!(logs = bundle.logs.len(), "diagnostic bundle exported");
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

    #[test]
    fn redact_masks_secrets_and_identifiers() {
        let text = format!(
            "user {EMAIL} Authorization: Bearer {JWT} key={OPENAI_KEY} g={GEMINI_KEY} \
             refresh_token={REFRESH} path C:\\Users\\anabel\\AppData\\Roaming jwt {JWT} \
             json \"password\":\"hunter2\" C:\\\\Users\\\\anabel\\\\x"
        );
        let out = redact(&text);
        for secret in [
            EMAIL, JWT, OPENAI_KEY, GEMINI_KEY, REFRESH, "anabel", "hunter2",
        ] {
            assert!(!out.contains(secret), "{secret} leaked in: {out}");
        }
        assert!(out.contains("<email>"));
        assert!(out.contains("C:\\Users\\<user>\\AppData"));
    }

    #[test]
    fn redact_keeps_ordinary_diagnostics() {
        let text = "migration 0011_sync_conflicts.sql applied in 12 ms; \
                    id 3f2504e0-4f89-11d3-9a0c-0305e82c3301 at src/modules/test-cases/ui/TestCaseEditor.tsx:42";
        assert_eq!(redact(text), text);
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
        let bundle = build_bundle(&conn, &dir, client, "156.0.0.0".into()).unwrap();
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
        assert_eq!(bundle.logs.len(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn bundle_without_logs_still_reports_versions() {
        let conn = conn_with_user_data();
        let bundle = build_bundle(
            &conn,
            Path::new("does-not-exist"),
            ClientInfo::default(),
            "unknown".into(),
        )
        .unwrap();
        assert!(bundle.logs.is_empty());
        assert_eq!(bundle.manifest.app.version, env!("CARGO_PKG_VERSION"));
        assert!(!bundle.manifest.database.migrations.is_empty());
    }
}
