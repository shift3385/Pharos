//! The server this desktop talks to (SEC-10, ADR-0046). The user picks it at
//! sign-in; it is kept here, in Rust, and every request to it goes through
//! `server_request`. The webview never opens a connection to a server: its
//! CSP allows none, so injected script cannot send data anywhere either.
//!
//! - **Only https, except loopback.** `localhost`, `127.0.0.0/8` and `[::1]`
//!   may use http; any other host must be https, with a certificate Windows
//!   trusts (rustls with the platform verifier: an internal CA works once
//!   Windows trusts it). No redirect is followed.
//! - **Only routes.** A request names a path on the chosen server (`/sync/pull`),
//!   never a URL, and carries only the headers Pharos uses.
//! - **One server per session.** The server changes only while no session is
//!   cached (signed out). The cached session records its server, and a session
//!   of another server is ignored.
//! - **Each account belongs to one server.** Local data is already kept per
//!   account (FIX-07, ADR-0020); `accounts.json` also ties each account to the
//!   server it signed in to, so a copy of a server with the same account ids
//!   never receives another server's local changes.

use std::collections::BTreeMap;
use std::fs;
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};
use url::Url;

use crate::db::Db;

/// The build's server (the same `VITE_API_URL` the frontend is built with),
/// used until the user picks one.
pub const BUILD_DEFAULT: &str = match option_env!("VITE_API_URL") {
    Some(url) => url,
    None => "http://localhost:3000",
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const CHECK_TIMEOUT: Duration = Duration::from_secs(10);
/// Accounts remembered for «Usados en este equipo».
const MAX_ACCOUNTS: usize = 20;

/// Why a server could not be used. Serialized as `{ kind, message, origin? }`
/// so the sign-in screen shows the matching state (E1–E5, account binding).
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServerError {
    pub kind: ErrorKind,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    /// Not a server address (E1).
    Invalid,
    /// http to a host other than this computer (E2).
    Insecure,
    /// No answer: unknown name, refused, no route (E3).
    Unreachable,
    /// The answer took too long (E3).
    Timeout,
    /// The certificate is not trusted (E4).
    Tls,
    /// It answers, but it is not a Pharos server (E5).
    NotPharos,
    /// The server cannot change while a session is cached.
    SessionOpen,
    /// The account already belongs to another server on this computer.
    AccountOtherServer,
    /// A path that is not a route on the server.
    BadPath,
    /// Local storage (the server choice, the accounts file) failed.
    Storage,
}

impl ServerError {
    fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            origin: None,
        }
    }
}

/// The origin (`scheme://host[:port]`) of a server address the user typed.
/// A bare name gets `https://`; a path, query, fragment or credentials are
/// refused, and http only goes to this computer.
pub fn normalize_origin(input: &str) -> Result<String, ServerError> {
    let raw = input.trim();
    let invalid = || ServerError::new(ErrorKind::Invalid, "not a server address");
    if raw.is_empty() || raw.chars().any(char::is_whitespace) {
        return Err(invalid());
    }
    let with_scheme = if raw.contains("://") {
        raw.to_string()
    } else {
        format!("https://{raw}")
    };
    let url = Url::parse(&with_scheme).map_err(|_| invalid())?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || !matches!(url.path(), "" | "/")
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(invalid());
    }
    if url.scheme() == "http" && !is_loopback(&url) {
        return Err(ServerError::new(
            ErrorKind::Insecure,
            "http is only allowed to this computer (localhost)",
        ));
    }
    Ok(url.origin().ascii_serialization())
}

fn is_loopback(url: &Url) -> bool {
    match url.host() {
        Some(url::Host::Domain(name)) => name.eq_ignore_ascii_case("localhost"),
        Some(url::Host::Ipv4(ip)) => IpAddr::V4(ip).is_loopback(),
        Some(url::Host::Ipv6(ip)) => IpAddr::V6(ip).is_loopback(),
        None => false,
    }
}

/// True when the origin is this computer (no padlock on the sign-in line).
pub fn origin_is_local(origin: &str) -> bool {
    Url::parse(origin).map(|u| is_loopback(&u)).unwrap_or(false)
}

/// A route on the server: one leading `/`, no scheme, no host, no `..`.
fn check_path(path: &str) -> Result<(), ServerError> {
    let ok = path.starts_with('/')
        && !path.starts_with("//")
        && !path.contains('\\')
        && !path.contains("://")
        && !path.split(['/', '?']).any(|seg| seg == "..");
    if ok {
        Ok(())
    } else {
        Err(ServerError::new(
            ErrorKind::BadPath,
            "not a route on the server",
        ))
    }
}

/// Headers a request may carry: what Pharos itself sends.
fn allowed_header(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    matches!(name.as_str(), "authorization" | "content-type" | "accept")
        || name.starts_with("x-pharos-")
}

/// Turns a transport failure into E3 or E4. The URL is dropped from every
/// message (it may carry nothing secret, but the UI names the server itself).
fn classify(e: &reqwest::Error) -> ServerError {
    if e.is_timeout() {
        return ServerError::new(ErrorKind::Timeout, "the server did not answer in time");
    }
    let mut chain = String::new();
    let mut source: Option<&dyn std::error::Error> = Some(e);
    while let Some(err) = source {
        chain.push_str(&err.to_string().to_ascii_lowercase());
        chain.push(' ');
        source = err.source();
    }
    if [
        "certificate",
        "tls",
        "handshake",
        "unknownissuer",
        "notvalidforname",
        "expired",
    ]
    .iter()
    .any(|word| chain.contains(word))
    {
        return ServerError::new(ErrorKind::Tls, "the server's certificate is not trusted");
    }
    ServerError::new(ErrorKind::Unreachable, "the server does not answer")
}

/// One account that signed in on this computer, and to which server.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnownAccount {
    pub user_id: String,
    pub email: String,
    pub origin: String,
    pub last_used: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Saved {
    #[serde(default)]
    origin: Option<String>,
    #[serde(default)]
    accounts: Vec<KnownAccount>,
}

/// The chosen server and the accounts seen, kept in `server.json` under the
/// instance's config dir (E2E profiles get their own, ADR-0022).
pub struct ServerState {
    file: Option<PathBuf>,
    saved: Mutex<Saved>,
    client: reqwest::Client,
}

impl ServerState {
    pub fn load(file: Option<PathBuf>) -> Self {
        let saved = file
            .as_ref()
            .and_then(|f| fs::read_to_string(f).ok())
            .and_then(|text| serde_json::from_str::<Saved>(&text).ok())
            .unwrap_or_default();
        let client = reqwest::Client::builder()
            .redirect(Policy::none())
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(CONNECT_TIMEOUT)
            .build()
            .expect("the HTTP client builds with its default TLS");
        Self {
            file,
            saved: Mutex::new(saved),
            client,
        }
    }

    /// The chosen server, or the build's. A saved value that no longer passes
    /// the rules (edited by hand) falls back to the build's.
    pub fn origin(&self) -> String {
        let saved = self.saved.lock().unwrap().origin.clone();
        saved
            .and_then(|o| normalize_origin(&o).ok())
            .unwrap_or_else(|| {
                normalize_origin(BUILD_DEFAULT).unwrap_or_else(|_| BUILD_DEFAULT.to_string())
            })
    }

    fn persist(&self, saved: &Saved) -> Result<(), ServerError> {
        let Some(file) = &self.file else {
            return Ok(());
        };
        let storage = |e: std::io::Error| ServerError::new(ErrorKind::Storage, e.to_string());
        if let Some(dir) = file.parent() {
            fs::create_dir_all(dir).map_err(storage)?;
        }
        let text = serde_json::to_string_pretty(saved).expect("server.json serializes");
        let tmp = file.with_extension("json.tmp");
        fs::write(&tmp, text).map_err(storage)?;
        fs::rename(&tmp, file).map_err(storage)
    }

    fn set_origin(&self, origin: String) -> Result<(), ServerError> {
        let mut saved = self.saved.lock().unwrap();
        let previous = saved.origin.replace(origin);
        if let Err(e) = self.persist(&saved) {
            saved.origin = previous;
            return Err(e);
        }
        Ok(())
    }

    /// Ties `user_id` to `origin` (and refreshes its email and last use), or
    /// refuses when that account already belongs to another server.
    fn bind(&self, user_id: &str, email: &str, origin: &str, now: &str) -> Result<(), ServerError> {
        let mut saved = self.saved.lock().unwrap();
        if let Some(other) = saved
            .accounts
            .iter()
            .find(|a| a.user_id == user_id && a.origin != origin)
        {
            return Err(ServerError {
                kind: ErrorKind::AccountOtherServer,
                message: "this account's local data belongs to another server".into(),
                origin: Some(other.origin.clone()),
            });
        }
        saved.accounts.retain(|a| a.user_id != user_id);
        saved.accounts.insert(
            0,
            KnownAccount {
                user_id: user_id.into(),
                email: email.into(),
                origin: origin.into(),
                last_used: now.into(),
            },
        );
        saved.accounts.truncate(MAX_ACCOUNTS);
        self.persist(&saved)
    }

    fn accounts(&self) -> Vec<KnownAccount> {
        self.saved.lock().unwrap().accounts.clone()
    }
}

/// What the sign-in line shows.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub origin: String,
    pub local: bool,
    pub recent: Vec<RecentServer>,
}

/// One entry of «Usados en este equipo»: a server and its last account.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecentServer {
    pub origin: String,
    pub local: bool,
    pub email: String,
    pub last_used: String,
}

fn recent_servers(accounts: &[KnownAccount]) -> Vec<RecentServer> {
    let mut seen = BTreeMap::new();
    let mut out = Vec::new();
    for a in accounts {
        if seen.insert(a.origin.clone(), ()).is_none() {
            out.push(RecentServer {
                origin: a.origin.clone(),
                local: origin_is_local(&a.origin),
                email: a.email.clone(),
                last_used: a.last_used.clone(),
            });
        }
    }
    out
}

#[tauri::command]
pub fn server_get(state: State<ServerState>) -> ServerInfo {
    let origin = state.origin();
    ServerInfo {
        local: origin_is_local(&origin),
        recent: recent_servers(&state.accounts()),
        origin,
    }
}

/// The answer of a server's `/health`, for the sign-in screen to judge
/// (E5 not Pharos, E6 version).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    pub origin: String,
    pub local: bool,
    pub health: Value,
}

/// Checks an address before it is saved: valid, https unless local, and
/// answering `/health` like a Pharos server. Saves nothing.
#[tauri::command]
pub async fn server_check(
    state: State<'_, ServerState>,
    url: String,
) -> Result<CheckResult, ServerError> {
    let origin = normalize_origin(&url)?;
    let resp = state
        .client
        .get(format!("{origin}/health"))
        .timeout(CHECK_TIMEOUT)
        .send()
        .await
        .map_err(|e| classify(&e))?;
    let not_pharos = || {
        ServerError::new(
            ErrorKind::NotPharos,
            "it answers, but it is not a Pharos server",
        )
    };
    if !resp.status().is_success() {
        return Err(not_pharos());
    }
    let text = resp.text().await.map_err(|e| classify(&e))?;
    let health: Value = serde_json::from_str(&text).map_err(|_| not_pharos())?;
    if health.get("status").and_then(Value::as_str) != Some("ok") {
        return Err(not_pharos());
    }
    Ok(CheckResult {
        local: origin_is_local(&origin),
        origin,
        health,
    })
}

/// Picks the server. Only while signed out: a cached session belongs to the
/// server it was created on.
#[tauri::command]
pub fn server_set(state: State<ServerState>, url: String) -> Result<String, ServerError> {
    let origin = normalize_origin(&url)?;
    if crate::session_cached().map_err(|e| ServerError::new(ErrorKind::Storage, e))? {
        return Err(ServerError::new(
            ErrorKind::SessionOpen,
            "sign out before changing the server",
        ));
    }
    state.set_origin(origin.clone())?;
    tracing::info!(local = origin_is_local(&origin), "server changed");
    Ok(origin)
}

/// Records that `user_id` signed in to the current server, or refuses when
/// its local data belongs to another one.
#[tauri::command]
pub fn server_bind_account(
    state: State<ServerState>,
    user_id: String,
    email: String,
) -> Result<(), ServerError> {
    if user_id.is_empty() {
        return Ok(());
    }
    let now = chrono_now();
    state.bind(&user_id, &email, &state.origin(), &now)
}

/// Local changes not yet sent, per account of the current server (E8).
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PendingChanges {
    pub email: String,
    pub count: u32,
}

#[tauri::command]
pub fn server_pending(app: AppHandle, state: State<ServerState>) -> Vec<PendingChanges> {
    let origin = state.origin();
    let accounts: Vec<KnownAccount> = state
        .accounts()
        .into_iter()
        .filter(|a| a.origin == origin)
        .collect();
    let Some(db) = app.try_state::<Db>() else {
        return Vec::new();
    };
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare("SELECT COUNT(*) FROM oplog WHERE user_id = ?1 AND synced_at IS NULL")
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for a in &accounts {
            let count: u32 = stmt
                .query_row([&a.user_id], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            if count > 0 {
                out.push(PendingChanges {
                    email: a.email.clone(),
                    count,
                });
            }
        }
        Ok(out)
    })
    .unwrap_or_default()
}

/// A request to the chosen server.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerRequest {
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerResponse {
    pub status: u16,
    pub content_type: Option<String>,
    pub body: String,
}

#[tauri::command]
pub async fn server_request(
    state: State<'_, ServerState>,
    request: ServerRequest,
) -> Result<ServerResponse, ServerError> {
    check_path(&request.path)?;
    let method = match request.method.to_ascii_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "PATCH" => reqwest::Method::PATCH,
        "DELETE" => reqwest::Method::DELETE,
        _ => return Err(ServerError::new(ErrorKind::BadPath, "unsupported method")),
    };
    let origin = state.origin();
    let mut req = state
        .client
        .request(method, format!("{origin}{}", request.path));
    for (name, value) in request.headers.iter().filter(|(n, _)| allowed_header(n)) {
        req = req.header(name.as_str(), value.as_str());
    }
    if let Some(body) = request.body {
        req = req.body(body);
    }
    let resp = req.send().await.map_err(|e| classify(&e))?;
    let status = resp.status().as_u16();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let body = resp.text().await.map_err(|e| classify(&e))?;
    Ok(ServerResponse {
        status,
        content_type,
        body,
    })
}

/// The cached session as stored in the keychain: the session JSON the
/// frontend gave, and the server it belongs to.
#[derive(Serialize, Deserialize)]
struct StoredSession {
    server: String,
    session: String,
}

/// Wraps a session for the keychain with its server.
pub fn wrap_session(origin: &str, data: &str) -> String {
    serde_json::to_string(&StoredSession {
        server: origin.into(),
        session: data.into(),
    })
    .expect("session wraps")
}

/// The session for `origin`, or None when it belongs to another server. A
/// session cached before SEC-10 (plain session JSON) belongs to the build's
/// server.
pub fn unwrap_session(raw: &str, origin: &str) -> Option<String> {
    match serde_json::from_str::<StoredSession>(raw) {
        Ok(stored) => (stored.server == origin).then_some(stored.session),
        Err(_) => {
            let build = normalize_origin(BUILD_DEFAULT).ok()?;
            (build == origin).then(|| raw.to_string())
        }
    }
}

fn chrono_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    secs.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bare_name_becomes_https() {
        assert_eq!(
            normalize_origin("pharos.example.com").unwrap(),
            "https://pharos.example.com"
        );
        assert_eq!(
            normalize_origin(" https://Pharos.Example.com/ ").unwrap(),
            "https://pharos.example.com"
        );
        assert_eq!(
            normalize_origin("https://pharos.example.com:8443").unwrap(),
            "https://pharos.example.com:8443"
        );
    }

    #[test]
    fn http_only_goes_to_this_computer() {
        for ok in [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://127.8.0.1",
            "http://[::1]:3000",
        ] {
            assert!(normalize_origin(ok).is_ok(), "{ok}");
        }
        for bad in [
            "http://10.0.4.21:3000",
            "http://pharos.example.com",
            "http://localhost.evil.com",
        ] {
            assert_eq!(
                normalize_origin(bad).unwrap_err().kind,
                ErrorKind::Insecure,
                "{bad}"
            );
        }
    }

    #[test]
    fn anything_but_an_origin_is_invalid() {
        for bad in [
            "",
            "pharos example",
            "ftp://pharos.example.com",
            "https://pharos.example.com/api",
            "https://pharos.example.com/?x=1",
            "https://pharos.example.com/#a",
            "https://user:pw@pharos.example.com",
            "https://",
        ] {
            assert_eq!(
                normalize_origin(bad).unwrap_err().kind,
                ErrorKind::Invalid,
                "{bad:?}"
            );
        }
    }

    #[test]
    fn only_routes_are_requested() {
        assert!(check_path("/sync/pull?since=3").is_ok());
        assert!(check_path("/auth/login").is_ok());
        for bad in [
            "sync/pull",
            "//evil.com/x",
            "https://evil.com/x",
            "/a/../b",
            "/a\\b",
            "/x?u=https://evil.com",
        ] {
            assert!(check_path(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn only_pharos_headers_pass() {
        assert!(allowed_header("Authorization"));
        assert!(allowed_header("content-type"));
        assert!(allowed_header("x-pharos-version"));
        assert!(!allowed_header("cookie"));
        assert!(!allowed_header("host"));
    }

    #[test]
    fn a_session_belongs_to_its_server() {
        let wrapped = wrap_session("https://a.example.com", "{\"t\":1}");
        assert_eq!(
            unwrap_session(&wrapped, "https://a.example.com").as_deref(),
            Some("{\"t\":1}")
        );
        assert_eq!(unwrap_session(&wrapped, "https://b.example.com"), None);
        let build = normalize_origin(BUILD_DEFAULT).unwrap();
        assert_eq!(
            unwrap_session("{\"t\":1}", &build).as_deref(),
            Some("{\"t\":1}")
        );
        assert_eq!(unwrap_session("{\"t\":1}", "https://b.example.com"), None);
    }

    #[test]
    fn an_account_stays_with_its_server() {
        let dir = std::env::temp_dir().join(format!("pharos-server-{}", uuid::Uuid::new_v4()));
        let file = dir.join("server.json");
        let state = ServerState::load(Some(file.clone()));
        state
            .bind("u1", "ana@example.com", "https://a.example.com", "1")
            .unwrap();
        state
            .bind("u1", "ana@example.com", "https://a.example.com", "2")
            .unwrap();
        let err = state
            .bind("u1", "ana@example.com", "https://b.example.com", "3")
            .unwrap_err();
        assert_eq!(err.kind, ErrorKind::AccountOtherServer);
        assert_eq!(err.origin.as_deref(), Some("https://a.example.com"));
        state
            .bind("u2", "luis@example.com", "https://b.example.com", "4")
            .unwrap();

        let reloaded = ServerState::load(Some(file));
        let recent = recent_servers(&reloaded.accounts());
        assert_eq!(recent.len(), 2);
        assert_eq!(recent[0].origin, "https://b.example.com");
        assert_eq!(recent[1].last_used, "2");
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn the_chosen_server_survives_a_restart() {
        let dir = std::env::temp_dir().join(format!("pharos-server-{}", uuid::Uuid::new_v4()));
        let file = dir.join("server.json");
        let state = ServerState::load(Some(file.clone()));
        assert_eq!(state.origin(), normalize_origin(BUILD_DEFAULT).unwrap());
        state.set_origin("https://a.example.com".into()).unwrap();
        assert_eq!(
            ServerState::load(Some(file)).origin(),
            "https://a.example.com"
        );
        fs::remove_dir_all(dir).ok();
    }
}
