//! Remote mode (INT-01 L2, ADR-0054 §1): the API v1 of a Pharos server
//! (ADR-0052, `docs/formats/openapi-v1.json` 1.1.x).
//!
//! - **Upload:** each report goes as it is to `POST /projects/{p}/results`.
//!   The CLI does not parse or detect it: the server does, with
//!   `@pharos/formats`; `--format` is only a check (`format_mismatch`). Bodies
//!   over 64 KB travel gzipped.
//! - **Retries:** only network errors, 429 (with `Retry-After`), 502, 503 and
//!   504, three attempts at most. A repeated upload is a no-op on the server
//!   (the shard id comes from the file's content), so retrying is safe.
//! - **Tokens:** `--token-stdin`, then `PHAROS_TOKEN`, then the one `pharos
//!   login` stored in the OS keychain for that server. Never an option, never
//!   a file, never printed (only its visible prefix).
//! - **TLS** with rustls; `http://` only for loopback; a private CA through
//!   `PHAROS_CA_CERT`. No redirects are followed (the token would go along).

use std::io::{Read, Write};
use std::path::Path;
use std::time::Duration;

use flate2::write::GzEncoder;
use flate2::Compression;
use serde_json::{json, Value};

use crate::args::Opts;
use crate::config::{Config, Env};
use crate::exit::{Exit, Failure};
use crate::files::expand;
use crate::output::{Mark, Printer};

/// The keychain service of the tokens `pharos login` stores; the account is
/// the server's origin.
pub const KEYCHAIN_SERVICE: &str = "Pharos CLI";
/// Bodies larger than this travel gzipped.
const GZIP_FROM: usize = 64 * 1024;
/// The largest report the CLI sends (the server's own limits are lower:
/// 25 MiB compressed, 100 MiB uncompressed by default).
const MAX_REPORT_BYTES: u64 = 200 * 1024 * 1024;

// ---- the server and the token ----------------------------------------------------------

/// The server's origin (`https://pharos.example.com[:port]`) from what the
/// user wrote: a bare name is https; `http://` only for loopback, where the
/// token cannot be read on the way.
pub fn origin(input: &str) -> Result<String, Failure> {
    let raw = input.trim();
    let with_scheme = if raw.contains("://") {
        raw.to_string()
    } else {
        format!("https://{raw}")
    };
    let bad = || Failure::usage("bad-server", "err.bad-server").arg(raw);
    let url = url::Url::parse(&with_scheme).map_err(|_| bad())?;
    let host = url.host_str().ok_or_else(bad)?.to_ascii_lowercase();
    if !matches!(url.path(), "" | "/") || url.query().is_some() || !url.username().is_empty() {
        return Err(bad());
    }
    match url.scheme() {
        "https" => {}
        "http" if ["localhost", "127.0.0.1", "[::1]", "::1"].contains(&host.as_str()) => {}
        "http" => return Err(Failure::usage("insecure-server", "err.insecure-server").arg(raw)),
        _ => return Err(bad()),
    }
    Ok(match url.port() {
        Some(port) => format!("{}://{host}:{port}", url.scheme()),
        None => format!("{}://{host}", url.scheme()),
    })
}

/// What may be shown of a token: its first 12 characters (`phr_prj_Ab3k…`).
pub fn mask(token: &str) -> String {
    let shown: String = token.chars().take(12).collect();
    format!("{shown}…")
}

/// The keychain, through pharos-core in the Windows build. The remote-only
/// build (Linux) has none: `login` refuses and points at `PHAROS_TOKEN`.
mod keychain {
    /// The service: `Pharos CLI`, or a test's own in a debug build.
    fn service() -> String {
        if cfg!(debug_assertions) {
            if let Ok(s) = std::env::var("PHAROS_CLI_KEYCHAIN_SERVICE") {
                if !s.is_empty() {
                    return s;
                }
            }
        }
        super::KEYCHAIN_SERVICE.to_string()
    }

    #[cfg(feature = "local")]
    pub fn read(account: &str) -> Result<Option<String>, String> {
        pharos_core::keychain::read(&service(), account)
    }
    #[cfg(feature = "local")]
    pub fn write(account: &str, secret: &str) -> Result<(), String> {
        pharos_core::keychain::write(&service(), account, secret)
    }
    #[cfg(feature = "local")]
    pub fn delete(account: &str) -> Result<(), String> {
        pharos_core::keychain::delete(&service(), account)
    }
    #[cfg(not(feature = "local"))]
    pub fn read(_account: &str) -> Result<Option<String>, String> {
        let _ = service();
        Ok(None)
    }
    #[cfg(not(feature = "local"))]
    pub fn write(_account: &str, _secret: &str) -> Result<(), String> {
        Err("no-keychain".into())
    }
    #[cfg(not(feature = "local"))]
    pub fn delete(_account: &str) -> Result<(), String> {
        Ok(())
    }
}

/// The token for `origin`: `--token-stdin`, `PHAROS_TOKEN`, then the keychain.
pub fn token(opts: &Opts, env: &Env, origin: &str) -> Result<String, Failure> {
    let token = if opts.token_stdin {
        Some(read_stdin(env)?)
    } else if let Some(t) = env.var("PHAROS_TOKEN") {
        Some(t)
    } else {
        keychain::read(origin)
            .map_err(|e| Failure::new(Exit::Auth, "keychain", "err.keychain").detail(e))?
    };
    let token = token
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .ok_or_else(|| Failure::new(Exit::Auth, "no-token", "err.no-token").arg(origin))?;
    if !token.starts_with("phr_") {
        return Err(Failure::new(Exit::Auth, "bad-token", "err.bad-token"));
    }
    Ok(token)
}

fn read_stdin(env: &Env) -> Result<String, Failure> {
    if let Some(s) = &env.stdin {
        return Ok(s.clone());
    }
    let mut s = String::new();
    std::io::stdin()
        .read_to_string(&mut s)
        .map_err(|e| Failure::usage("stdin", "err.internal").detail(e.to_string()))?;
    Ok(s)
}

/// The server of a remote command: `--server`, `PHAROS_URL`, the files.
pub fn server(opts: &Opts, env: &Env, cfg: &Config) -> Result<String, Failure> {
    let given = opts
        .server
        .clone()
        .or_else(|| cfg.server(env))
        .ok_or_else(|| Failure::usage("no-server", "err.no-server"))?;
    origin(&given)
}

// ---- the client -----------------------------------------------------------------------

/// An API failure: an HTTP answer with its body, or no answer at all.
#[derive(Debug)]
pub enum ApiError {
    Status { status: u16, body: Value },
    Network(String),
}

impl ApiError {
    /// The stable code of the error body (`token_expired`), if any.
    pub fn code(&self) -> Option<&str> {
        match self {
            ApiError::Status { body, .. } => body.get("code").and_then(Value::as_str),
            ApiError::Network(_) => None,
        }
    }
}

pub struct Client {
    origin: String,
    token: String,
    http: reqwest::blocking::Client,
    /// How a retry waits (tests do not).
    pub sleep: fn(Duration),
}

impl Client {
    pub fn new(origin: &str, token: &str, env: &Env) -> Result<Client, Failure> {
        let mut builder = reqwest::blocking::Client::builder()
            .user_agent(concat!("pharos-cli/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(300))
            .redirect(reqwest::redirect::Policy::none());
        if let Some(path) = env.var("PHAROS_CA_CERT") {
            let pem = std::fs::read(env.cwd.join(&path)).map_err(|e| {
                Failure::usage("ca-cert", "err.ca-cert")
                    .arg(path.as_str())
                    .detail(e.to_string())
            })?;
            let cert = reqwest::Certificate::from_pem(&pem).map_err(|e| {
                Failure::usage("ca-cert", "err.ca-cert")
                    .arg(path.as_str())
                    .detail(e.to_string())
            })?;
            builder = builder.add_root_certificate(cert);
        }
        let http = builder.build().map_err(|e| {
            Failure::new(Exit::Internal, "internal", "err.internal").detail(e.to_string())
        })?;
        // Tests of a debug build retry without waiting.
        let no_wait = cfg!(debug_assertions) && env.var("PHAROS_CLI_TEST_NO_WAIT").is_some();
        Ok(Client {
            origin: origin.to_string(),
            token: token.to_string(),
            http,
            sleep: if no_wait { |_| {} } else { std::thread::sleep },
        })
    }

    /// `<origin>/api/v1/<segments…>?<query>`, every segment encoded.
    fn url(&self, segments: &[&str], query: &[(&str, String)]) -> String {
        let mut url = url::Url::parse(&self.origin).expect("an origin parses");
        {
            let mut path = url.path_segments_mut().expect("an origin has a path");
            path.clear().push("api").push("v1");
            for s in segments {
                path.push(s);
            }
        }
        if !query.is_empty() {
            let mut q = url.query_pairs_mut();
            for (k, v) in query {
                q.append_pair(k, v);
            }
        }
        url.to_string()
    }

    /// One call, retried on network errors, 429, 502, 503 and 504.
    fn call(
        &self,
        method: reqwest::Method,
        segments: &[&str],
        query: &[(&str, String)],
        body: Option<(Vec<u8>, &str, bool)>,
    ) -> Result<(u16, Value), ApiError> {
        let url = self.url(segments, query);
        const ATTEMPTS: u32 = 3;
        let mut attempt = 0;
        loop {
            attempt += 1;
            let mut req = self
                .http
                .request(method.clone(), &url)
                .header("Authorization", format!("Bearer {}", self.token))
                .header("Accept", "application/json");
            if let Some((bytes, content_type, gzip)) = &body {
                req = req
                    .header("Content-Type", *content_type)
                    .body(bytes.clone());
                if *gzip {
                    req = req.header("Content-Encoding", "gzip");
                }
            }
            let wait = match req.send() {
                Ok(res) => {
                    let status = res.status().as_u16();
                    let retry_after = res
                        .headers()
                        .get("retry-after")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.trim().parse::<u64>().ok());
                    let text = res.text().unwrap_or_default();
                    let body: Value = serde_json::from_str(&text).unwrap_or_else(|_| json!({}));
                    if (200..300).contains(&status) {
                        return Ok((status, body));
                    }
                    if !matches!(status, 429 | 502 | 503 | 504) || attempt >= ATTEMPTS {
                        return Err(ApiError::Status { status, body });
                    }
                    Duration::from_secs(retry_after.unwrap_or(1 << (2 * (attempt - 1))).min(30))
                }
                Err(e) => {
                    if attempt >= ATTEMPTS {
                        return Err(ApiError::Network(network_text(&e)));
                    }
                    Duration::from_secs(1 << (2 * (attempt - 1)))
                }
            };
            (self.sleep)(wait);
        }
    }

    pub fn me(&self) -> Result<Value, ApiError> {
        self.call(reqwest::Method::GET, &["me"], &[], None)
            .map(|(_, v)| v)
    }

    pub fn projects(&self) -> Result<Value, ApiError> {
        self.call(reqwest::Method::GET, &["projects"], &[], None)
            .map(|(_, v)| v)
    }

    /// Uploads one report file; gzipped when large.
    pub fn upload(
        &self,
        project: &str,
        bytes: &[u8],
        query: &[(&str, String)],
    ) -> Result<Value, ApiError> {
        let body = if bytes.len() > GZIP_FROM {
            let mut gz = GzEncoder::new(Vec::new(), Compression::default());
            gz.write_all(bytes)
                .and_then(|_| gz.finish())
                .map(|b| (b, true))
        } else {
            Ok((bytes.to_vec(), false))
        }
        .map_err(|e| ApiError::Network(e.to_string()))?;
        self.call(
            reqwest::Method::POST,
            &["projects", project, "results"],
            query,
            Some((body.0, "application/octet-stream", body.1)),
        )
        .map(|(_, v)| v)
    }

    /// The run of `external_id`: created once, found afterwards.
    pub fn run_by_external_id(&self, project: &str, external_id: &str) -> Result<Value, ApiError> {
        self.create_run(project, &json!({ "externalId": external_id }))
    }

    /// `POST /projects/{p}/runs` (`createRun`): an empty run, open until it is
    /// closed. With `externalId`, the run of that id.
    pub fn create_run(&self, project: &str, run: &Value) -> Result<Value, ApiError> {
        let body = serde_json::to_vec(run).expect("json");
        self.call(
            reqwest::Method::POST,
            &["projects", project, "runs"],
            &[],
            Some((body, "application/json", false)),
        )
        .map(|(_, v)| v)
    }

    pub fn close(&self, project: &str, run_key: &str, status: &str) -> Result<Value, ApiError> {
        let body = serde_json::to_vec(&json!({ "status": status })).expect("json");
        self.call(
            reqwest::Method::POST,
            &["projects", project, "runs", run_key, "close"],
            &[],
            Some((body, "application/json", false)),
        )
        .map(|(_, v)| v)
    }
}

/// A network error without the URL (it could hold a query worth keeping out
/// of logs) and without the token (never in it).
fn network_text(e: &reqwest::Error) -> String {
    let kind = if e.is_timeout() {
        "timeout"
    } else if e.is_connect() {
        "connection refused or unreachable"
    } else {
        "network error"
    };
    let mut source = std::error::Error::source(e);
    let mut detail = String::new();
    while let Some(s) = source {
        detail = s.to_string();
        source = s.source();
    }
    if detail.is_empty() {
        kind.to_string()
    } else {
        format!("{kind}: {detail}")
    }
}

/// The CLI's failure for an API error (ADR-0054 §2 exit codes; the codes of
/// ADR-0052 §2 and the plan's §5.2).
pub fn failure(e: &ApiError, origin: &str) -> Failure {
    let (status, body) = match e {
        ApiError::Network(text) => {
            return Failure::new(Exit::Unreachable, "unreachable", "err.unreachable")
                .arg(origin)
                .detail(text.clone())
        }
        ApiError::Status { status, body } => (*status, body),
    };
    let code = body
        .get("code")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let message = body
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let reason = body.get("reason").and_then(Value::as_str);
    let detail = match reason {
        Some(r) => format!("{message} ({r})"),
        None => message,
    };
    let (exit, key) = match (status, code.as_str()) {
        (401, _) | (403, "account_disabled") => (Exit::Auth, "err.api-auth"),
        (403, _) => (Exit::Auth, "err.api-forbidden"),
        (404, _) => (Exit::NotFound, "err.api-not-found"),
        (409, "run_closed") => (Exit::NotFound, "err.api-run-closed"),
        (409, "ambiguous_project") => (Exit::Usage, "err.ambiguous-project"),
        (400, "format_mismatch") | (413, _) | (415, _) | (422, _) => {
            (Exit::Report, "err.api-report")
        }
        (400, _) => (Exit::Usage, "err.api-usage"),
        (429, _) | (500..=599, _) => (Exit::Unreachable, "err.api-server"),
        _ => (Exit::Internal, "err.api-other"),
    };
    let code = if code.is_empty() {
        format!("http-{status}")
    } else {
        code
    };
    // An ambiguous prefix lists the candidates.
    let detail = match body.get("candidates") {
        Some(c) => format!("{detail} {c}"),
        None => detail,
    };
    Failure::new(exit, &code, key)
        .arg(status.to_string())
        .detail(detail)
}

// ---- GitHub Actions --------------------------------------------------------------------

/// What GitHub Actions gives a job: the run that a matrix converges on and a
/// readable name.
pub struct GitHub {
    pub external_id: String,
    pub run_name: String,
    pub summary: Option<String>,
    pub output: Option<String>,
}

impl GitHub {
    pub fn from_env(env: &Env) -> Option<GitHub> {
        if env.var("GITHUB_ACTIONS").as_deref() != Some("true") {
            return None;
        }
        let repo = env.var("GITHUB_REPOSITORY").unwrap_or_default();
        let run_id = env.var("GITHUB_RUN_ID").unwrap_or_default();
        let attempt = env.var("GITHUB_RUN_ATTEMPT").unwrap_or_else(|| "1".into());
        let branch = env
            .var("GITHUB_HEAD_REF")
            .or_else(|| env.var("GITHUB_REF_NAME"))
            .unwrap_or_default();
        let sha: String = env
            .var("GITHUB_SHA")
            .unwrap_or_default()
            .chars()
            .take(7)
            .collect();
        let workflow = env.var("GITHUB_WORKFLOW").unwrap_or_else(|| "CI".into());
        let name = [workflow, branch, sha]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" · ");
        Some(GitHub {
            external_id: format!("github:{repo}:{run_id}:{attempt}"),
            run_name: name,
            summary: env.var("GITHUB_STEP_SUMMARY"),
            output: env.var("GITHUB_OUTPUT"),
        })
    }
}

fn append(path: &str, text: &str) {
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = f.write_all(text.as_bytes());
    }
}

/// A GitHub annotation (`::warning title=Pharos::…`), escaped as GitHub asks.
fn annotation(level: &str, text: &str) -> String {
    let text = text
        .replace('%', "%25")
        .replace('\r', "%0D")
        .replace('\n', "%0A");
    format!("::{level} title=Pharos::{text}")
}

// ---- formats ---------------------------------------------------------------------------

/// The display name of a `shard.format`.
pub fn format_name(format: &str) -> &str {
    match format {
        "junit" => "JUnit",
        "sarif" => "SARIF",
        "k6" => "k6",
        "axe" => "axe",
        "ctrf" => "CTRF",
        "playwright_json" => "Playwright JSON",
        "cucumber_messages" => "Cucumber Messages",
        "pharos_run_json" => "Pharos Run JSON",
        "allure" => "Allure",
        "trx" => "TRX",
        other => other,
    }
}

/// `--format` as the API names it (`auto` sends none).
fn api_format(format: &str) -> Option<String> {
    let f = format.trim().to_ascii_lowercase().replace('-', "_");
    match f.as_str() {
        "auto" | "" => None,
        "pharos" | "pharos_run" => Some("pharos_run_json".into()),
        "playwright" => Some("playwright_json".into()),
        "cucumber" => Some("cucumber_messages".into()),
        _ => Some(f),
    }
}

// ---- commands --------------------------------------------------------------------------

fn n(v: &Value) -> u64 {
    v.as_u64().unwrap_or(0)
}

struct Uploaded {
    shown: String,
    format: String,
    counts: Value,
    created: bool,
}

/// `pharos upload` in remote mode.
pub fn upload(opts: &Opts, cfg: &Config, env: &Env, p: &mut Printer) -> Exit {
    match upload_inner(opts, cfg, env, p) {
        Ok(exit) => exit,
        Err(f) => {
            report_failure(p, env, &f);
            f.exit
        }
    }
}

fn report_failure(p: &mut Printer, env: &Env, f: &Failure) {
    p.failure(f);
    if GitHub::from_env(env).is_some() && !p.json {
        let text = p.t(f.key, &f.args);
        p.always(&annotation("error", &format!("{text} [{}]", f.code)));
    }
}

fn upload_inner(opts: &Opts, cfg: &Config, env: &Env, p: &mut Printer) -> Result<Exit, Failure> {
    if opts.run.is_some() && opts.external_id.is_some() {
        return Err(Failure::usage(
            "run-and-external-id",
            "err.run-and-external-id",
        ));
    }
    let origin = server(opts, env, cfg)?;
    let project = cfg
        .project(opts, env)
        .ok_or_else(|| Failure::usage("project-required", "err.project-required"))?;
    let files = expand(&opts.files, &env.cwd)?;
    let total = files.len();
    let token = token(opts, env, &origin)?;
    let client = Client::new(&origin, &token, env)?;
    upload_with(
        opts, cfg, env, p, &client, &origin, &project, &token, files, total,
    )
}

#[allow(clippy::too_many_arguments)]
fn upload_with(
    opts: &Opts,
    cfg: &Config,
    env: &Env,
    p: &mut Printer,
    client: &Client,
    origin: &str,
    project: &str,
    token: &str,
    files: Vec<(String, std::path::PathBuf)>,
    total: usize,
) -> Result<Exit, Failure> {
    let github = GitHub::from_env(env);
    // In GitHub Actions the jobs of a matrix converge on one run, unless a
    // run is named.
    let external_id = match (&opts.run, &opts.external_id, &github) {
        (Some(_), _, _) => None,
        (None, Some(id), _) => Some(id.clone()),
        (None, None, Some(gh)) => Some(gh.external_id.clone()),
        (None, None, None) => None,
    };
    let run_name = opts
        .run_name
        .clone()
        .or_else(|| github.as_ref().map(|g| g.run_name.clone()));
    let line = p.t(
        "out.mode-remote",
        &[origin.to_string(), project.to_string(), mask(token)],
    );
    let line = p.dim(&line);
    p.line(&line);
    if let Some(id) = &external_id {
        let text = p.t("out.external-id", std::slice::from_ref(id));
        let text = p.dim(&text);
        p.line(&text);
    }
    p.line("");

    let mut run_key: Option<String> = opts.run.clone();
    let mut run_url: Option<String> = None;
    let mut created_here = false;
    let mut failures: Vec<Failure> = Vec::new();
    let mut done: Vec<Uploaded> = Vec::new();
    // The run's status after the last upload (a run an upload creates on its
    // own is closed at once by the server).
    let mut run_status = String::from("in_progress");

    // Several files without a run to go to: the run is created first, empty
    // and open, so every file lands in it; it is closed at the end.
    if run_key.is_none() && external_id.is_none() && files.len() > 1 {
        let mut body = serde_json::Map::new();
        if let Some(name) = &run_name {
            body.insert("name".into(), json!(name));
        }
        if let Some(c) = cfg.cycle(opts) {
            body.insert("cycleKey".into(), json!(c));
        }
        let run = client
            .create_run(project, &Value::Object(body))
            .map_err(|e| failure(&e, origin))?;
        let key = run["runKey"]
            .as_str()
            .or_else(|| run["run"]["runKey"].as_str())
            .unwrap_or_default();
        if !key.is_empty() {
            run_key = Some(key.to_string());
            created_here = true;
        }
    }

    for (shown, path) in &files {
        let bytes = match read_report(shown, path) {
            Ok(b) => b,
            Err(f) => {
                report_failure(p, env, &f);
                p.json_line(&json!({"file": shown, "ok": false, "error": {"code": f.code, "exit": f.exit.code()}}));
                failures.push(f);
                continue;
            }
        };
        let mut query: Vec<(&str, String)> = Vec::new();
        if let Some(f) = opts.format.as_deref().and_then(api_format) {
            query.push(("format", f));
        }
        match (&run_key, &external_id) {
            (Some(key), _) => query.push(("runKey", key.clone())),
            (None, Some(id)) => query.push(("externalId", id.clone())),
            (None, None) => {}
        }
        if run_key.is_none() {
            if let Some(name) = &run_name {
                query.push(("runName", name.clone()));
            }
            if let Some(c) = cfg.cycle(opts) {
                query.push(("cycleKey", c));
            }
        }
        if let Some(c) = cfg.configuration(opts) {
            query.push(("configuration", c));
        }
        if let Some(c) = &opts.case {
            query.push(("caseKey", c.clone()));
        }
        if let Some(name) = path.file_name() {
            query.push(("fileName", name.to_string_lossy().to_string()));
        }
        match client.upload(project, &bytes, &query) {
            Ok(out) => {
                let key = out["run"]["key"].as_str().unwrap_or_default().to_string();
                // The first file named the run: created by this command.
                let first = run_key.is_none() || (created_here && done.is_empty());
                run_key = Some(key.clone());
                if let Some(st) = out["run"]["status"].as_str() {
                    run_status = st.to_string();
                }
                if let Some(u) = out["run"]["url"].as_str() {
                    run_url = Some(u.to_string());
                }
                let format = out["shard"]["format"].as_str().unwrap_or("").to_string();
                let created = out["shard"]["created"].as_bool().unwrap_or(true);
                print_uploaded(
                    p,
                    shown,
                    &format,
                    &key,
                    first && external_id.is_none() && opts.run.is_none(),
                    created,
                    &out,
                );
                done.push(Uploaded {
                    shown: shown.clone(),
                    format,
                    counts: out["counts"].clone(),
                    created,
                });
            }
            Err(e) => {
                let f = failure(&e, origin);
                if !p.json {
                    let mark = p.mark(Mark::Fail);
                    p.line(&format!("  {mark} {shown}"));
                }
                report_failure(p, env, &f);
                p.json_line(&json!({"file": shown, "ok": false, "error": {"code": f.code, "exit": f.exit.code(), "detail": f.detail}}));
                // Without the token or the project nothing else can go.
                let stop = matches!(
                    f.exit,
                    Exit::Auth | Exit::NotFound | Exit::Unreachable | Exit::Usage
                );
                failures.push(f);
                if stop {
                    break;
                }
            }
        }
    }

    // `--close`, or a run this command created for several files.
    let should_close = (opts.close || created_here) && run_status == "in_progress";
    if should_close && !done.is_empty() {
        if let Some(key) = &run_key {
            match client.close(project, key, "completed") {
                Ok(_) => {
                    let text = p.t("out.closed", std::slice::from_ref(key));
                    let text = p.dim(&text);
                    p.line(&text);
                }
                Err(e) => {
                    let f = failure(&e, origin);
                    report_failure(p, env, &f);
                    failures.push(f);
                }
            }
        }
    }

    p.line("");
    let exit = if failures.is_empty() {
        Exit::Ok
    } else if done.is_empty() {
        failures[0].exit
    } else {
        Exit::Partial
    };
    let summary = if done.is_empty() {
        p.t("out.summary-none", &[])
    } else {
        p.t(
            "out.summary-remote",
            &[
                done.len().to_string(),
                total.to_string(),
                run_key.clone().unwrap_or_default(),
            ],
        )
    };
    let summary = p.bold(&summary);
    let url_text = run_url
        .clone()
        .map(|u| format!(" · {u}"))
        .unwrap_or_default();
    p.line(&format!("{summary}{url_text}"));
    let unlinked: u64 = done.iter().map(|d| n(&d.counts["unlinked"])).sum();
    if unlinked > 0 {
        let text = p.t("out.unlinked-hint-remote", &[unlinked.to_string()]);
        let dim = p.dim(&text);
        p.line(&dim);
        if github.is_some() && !p.json {
            p.always(&annotation("warning", &text));
        }
    }
    if exit == Exit::Partial {
        let text = p.t(
            "err.partial",
            &[failures.len().to_string(), total.to_string()],
        );
        p.warn(&text);
    }
    p.json_line(&json!({"summary": {
        "mode": "remote", "server": origin, "project": project, "run": run_key, "url": run_url,
        "uploaded": done.len(), "failed": failures.len(), "exit": exit.code()
    }}));

    if let Some(gh) = &github {
        if let Some(path) = &gh.summary {
            append(
                path,
                &step_summary(
                    p,
                    project,
                    run_key.as_deref(),
                    run_url.as_deref(),
                    &done,
                    &failures,
                ),
            );
        }
        if let Some(path) = &gh.output {
            let mut out = String::new();
            if let Some(k) = &run_key {
                out.push_str(&format!("run-key={k}\n"));
            }
            if let Some(u) = &run_url {
                out.push_str(&format!("run-url={u}\n"));
            }
            out.push_str(&format!(
                "uploaded={}\nfailed={}\n",
                done.len(),
                failures.len()
            ));
            append(path, &out);
        }
    }
    Ok(exit)
}

fn read_report(shown: &str, path: &Path) -> Result<Vec<u8>, Failure> {
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if size > MAX_REPORT_BYTES {
        return Err(Failure::new(Exit::Report, "too-large", "err.too-big")
            .arg(shown)
            .arg((MAX_REPORT_BYTES / (1024 * 1024)).to_string()));
    }
    std::fs::read(path).map_err(|e| {
        Failure::usage("unreadable", "err.unreadable")
            .arg(shown)
            .detail(e.to_string())
    })
}

fn print_uploaded(
    p: &mut Printer,
    shown: &str,
    format: &str,
    key: &str,
    first_new: bool,
    created: bool,
    out: &Value,
) {
    let c = &out["counts"];
    let by = &c["byStatus"];
    let mark = p.mark(Mark::Ok);
    let kind = p.dim(format_name(format));
    if !created {
        let note = p.t("out.already", &[key.to_string()]);
        let note = p.dim(&note);
        p.line(&format!("  {mark} {shown}   {kind}   {note}"));
    } else {
        let target = if first_new {
            p.t("out.created", &[key.to_string()])
        } else {
            key.to_string()
        };
        let target = p.bold(&target);
        p.line(&format!("  {mark} {shown}   {kind}   {target}"));
        if n(&c["results"]) > 0 {
            let counts = p.t(
                "out.counts",
                &[
                    n(&c["results"]).to_string(),
                    n(&by["passed"]).to_string(),
                    n(&by["failed"]).to_string(),
                    n(&by["skipped"]).to_string(),
                    n(&c["linked"]).to_string(),
                    n(&c["unlinked"]).to_string(),
                ],
            );
            p.line(&format!("      {counts}"));
        }
        if n(&c["findings"]) > 0 || n(&c["metrics"]) > 0 {
            let text = p.t(
                "out.findings-metrics",
                &[n(&c["findings"]).to_string(), n(&c["metrics"]).to_string()],
            );
            p.line(&format!("      {text}"));
        }
    }
    for w in out["warnings"].as_array().into_iter().flatten().take(5) {
        let line = format!(
            "        {} {}",
            w["code"].as_str().unwrap_or_default(),
            w["testKey"]
                .as_str()
                .or_else(|| w["detail"].as_str())
                .unwrap_or_default()
        );
        let line = p.dim(&line);
        p.line(&line);
    }
    p.json_line(&json!({
        "file": shown, "ok": true, "format": format, "run": out["run"], "shard": out["shard"],
        "counts": out["counts"], "warnings": out["warnings"],
    }));
}

/// The table GitHub shows on the job's page (`$GITHUB_STEP_SUMMARY`).
fn step_summary(
    p: &Printer,
    project: &str,
    run_key: Option<&str>,
    run_url: Option<&str>,
    done: &[Uploaded],
    failures: &[Failure],
) -> String {
    let mut s = format!("### Pharos · {}\n\n", run_key.unwrap_or("—"));
    let open = run_url
        .map(|u| format!(" · [{}]({u})", p.t("gh.open", &[])))
        .unwrap_or_default();
    s.push_str(&format!("{} {project}{open}\n\n", p.t("gh.project", &[])));
    s.push_str(&format!(
        "{}\n|---|---|---:|---:|---:|---:|---:|\n",
        p.t("gh.head", &[])
    ));
    for d in done {
        let c = &d.counts;
        let cell = |v: &Value| {
            if n(v) == 0 {
                "—".to_string()
            } else {
                n(v).to_string()
            }
        };
        let note = if d.created {
            String::new()
        } else {
            format!(" ({})", p.t("gh.already", &[]))
        };
        s.push_str(&format!(
            "| `{}`{note} | {} | {} | {} | {} | {} | {} |\n",
            d.shown.replace('|', "\\|"),
            format_name(&d.format),
            cell(&c["byStatus"]["passed"]),
            cell(&c["byStatus"]["failed"]),
            cell(&c["byStatus"]["skipped"]),
            cell(&c["findings"]),
            cell(&c["metrics"]),
        ));
    }
    for f in failures {
        s.push_str(&format!("\n> ✗ {} `[{}]`\n", p.t(f.key, &f.args), f.code));
    }
    s.push('\n');
    s
}

/// `pharos projects` in remote mode.
pub fn projects(opts: &Opts, cfg: &Config, env: &Env, p: &mut Printer) -> Exit {
    let run = || -> Result<Value, Failure> {
        let origin = server(opts, env, cfg)?;
        let token = token(opts, env, &origin)?;
        Client::new(&origin, &token, env)?
            .projects()
            .map_err(|e| failure(&e, &origin))
    };
    match run() {
        Ok(list) => {
            let projects = list["projects"].as_array().cloned().unwrap_or_default();
            if p.json {
                p.json_line(&json!({"projects": projects}));
            } else if projects.is_empty() {
                let text = p.t("out.projects-none", &[]);
                p.line(&text);
            } else {
                let head = p.t("out.projects-head-remote", &[]);
                let head = p.dim(&head);
                p.line(&head);
                for project in &projects {
                    let prefix = project["caseIdPrefix"]
                        .as_str()
                        .unwrap_or("")
                        .trim_end_matches('-');
                    p.line(&format!(
                        "{prefix:<9} {}  ·  {}",
                        project["name"].as_str().unwrap_or(""),
                        project["workspace"]["name"].as_str().unwrap_or("")
                    ));
                }
            }
            Exit::Ok
        }
        Err(f) => {
            p.failure(&f);
            f.exit
        }
    }
}

/// `pharos run close [RUN-n] [--external-id <id>] [--status completed|aborted]`.
pub fn run_close(key: Option<&str>, opts: &Opts, cfg: &Config, env: &Env, p: &mut Printer) -> Exit {
    let run = || -> Result<(String, String), Failure> {
        let status = opts.status.clone().unwrap_or_else(|| "completed".into());
        if !["completed", "aborted"].contains(&status.as_str()) {
            return Err(Failure::usage("bad-status", "err.bad-status").arg(status));
        }
        let origin = server(opts, env, cfg)?;
        let project = cfg
            .project(opts, env)
            .ok_or_else(|| Failure::usage("project-required", "err.project-required"))?;
        let token = token(opts, env, &origin)?;
        let client = Client::new(&origin, &token, env)?;
        let external = opts
            .external_id
            .clone()
            .or_else(|| GitHub::from_env(env).map(|g| g.external_id));
        let key = match (key, external) {
            (Some(k), _) => k.to_string(),
            (None, Some(id)) => client
                .run_by_external_id(&project, &id)
                .map_err(|e| failure(&e, &origin))?["runKey"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            (None, None) => return Err(Failure::usage("run-required", "err.run-required")),
        };
        client
            .close(&project, &key, &status)
            .map_err(|e| failure(&e, &origin))?;
        Ok((key, status))
    };
    match run() {
        Ok((key, status)) => {
            let text = p.t(
                if status == "aborted" {
                    "out.closed-aborted"
                } else {
                    "out.closed"
                },
                std::slice::from_ref(&key),
            );
            p.line(&text);
            p.json_line(&json!({"run": key, "status": status}));
            Exit::Ok
        }
        Err(f) => {
            report_failure(p, env, &f);
            f.exit
        }
    }
}

/// Days from 1970-01-01 to a civil date (H. Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Whole days until an ISO date (`2027-02-16T…`), from `now_days`.
pub fn days_left(iso: &str, now_days: i64) -> Option<i64> {
    let date = iso.get(..10)?;
    let mut parts = date.split('-').map(|x| x.parse::<i64>().ok());
    let (y, m, d) = (parts.next()??, parts.next()??, parts.next()??);
    Some(days_from_civil(y, m, d) - now_days)
}

pub fn today_days() -> i64 {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    secs.div_euclid(86_400)
}

/// What `login` and `doctor` show of a token (`GET /me`).
pub fn describe_me(p: &Printer, me: &Value) -> (String, Option<String>) {
    let t = &me["token"];
    let kind = p.t(
        if t["kind"] == "project" {
            "out.token-project"
        } else {
            "out.token-personal"
        },
        &[],
    );
    let line = p.t(
        "out.token-of",
        &[
            kind,
            me["owner"]["name"].as_str().unwrap_or("").to_string(),
            t["prefix"].as_str().unwrap_or("").to_string(),
            t["scopes"]
                .as_array()
                .map(|s| {
                    s.iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .unwrap_or_default(),
            t["expiresAt"]
                .as_str()
                .unwrap_or("")
                .get(..10)
                .unwrap_or("")
                .to_string(),
        ],
    );
    let warn = t["expiresAt"]
        .as_str()
        .and_then(|e| days_left(e, today_days()))
        .filter(|d| *d < 7)
        .map(|d| p.t("out.token-expires-soon", &[d.max(0).to_string()]));
    (line, warn)
}

/// `pharos login [--server URL] [--token-stdin]`.
pub fn login(opts: &Opts, cfg: &Config, env: &Env, p: &mut Printer) -> Exit {
    let run = |p: &mut Printer| -> Result<String, Failure> {
        let origin = server(opts, env, cfg)?;
        let raw = if opts.token_stdin {
            read_stdin(env)?
        } else {
            let prompt = p.t("out.paste-token", &[]);
            prompt_hidden(&prompt)?
        };
        let token = raw.trim().to_string();
        if !token.starts_with("phr_") {
            return Err(Failure::new(Exit::Auth, "bad-token", "err.bad-token"));
        }
        let me = Client::new(&origin, &token, env)?
            .me()
            .map_err(|e| failure(&e, &origin))?;
        let (line, warn) = describe_me(p, &me);
        let mark = p.mark(Mark::Ok);
        p.line(&format!("{mark} {line}"));
        if let Some(w) = warn {
            p.warn(&w);
        }
        keychain::write(&origin, &token).map_err(|e| {
            if e == "no-keychain" {
                Failure::new(Exit::Auth, "no-keychain", "err.no-keychain")
            } else {
                Failure::new(Exit::Auth, "keychain", "err.keychain").detail(e)
            }
        })?;
        save_default_server(env, &origin);
        Ok(origin)
    };
    match run(p) {
        Ok(origin) => {
            let mark = p.mark(Mark::Ok);
            let text = p.t("out.login-saved", std::slice::from_ref(&origin));
            p.line(&format!("{mark} {text}"));
            p.json_line(&json!({"login": {"server": origin}}));
            Exit::Ok
        }
        Err(f) => {
            p.failure(&f);
            f.exit
        }
    }
}

/// `pharos logout [--server URL]`.
pub fn logout(opts: &Opts, cfg: &Config, env: &Env, p: &mut Printer) -> Exit {
    let run = || -> Result<String, Failure> {
        let origin = server(opts, env, cfg)?;
        keychain::delete(&origin)
            .map_err(|e| Failure::new(Exit::Auth, "keychain", "err.keychain").detail(e))?;
        Ok(origin)
    };
    match run() {
        Ok(origin) => {
            let text = p.t("out.logout", std::slice::from_ref(&origin));
            p.line(&text);
            p.json_line(&json!({"logout": {"server": origin}}));
            Exit::Ok
        }
        Err(f) => {
            p.failure(&f);
            f.exit
        }
    }
}

/// Keeps `server = <origin>` in the user's config, so later commands go
/// remote without `--server`. Best effort: a config that cannot be written
/// only means `--server` is needed next time.
fn save_default_server(env: &Env, origin: &str) {
    let Some(dir) = &env.user_config_dir else {
        return;
    };
    let path = dir.join("config.toml");
    let mut table: toml::Table = std::fs::read_to_string(&path)
        .ok()
        .and_then(|t| toml::from_str(&t).ok())
        .unwrap_or_default();
    table.insert("server".into(), toml::Value::String(origin.into()));
    if std::fs::create_dir_all(dir).is_ok() {
        if let Ok(text) = toml::to_string(&table) {
            let _ = std::fs::write(&path, text);
        }
    }
}

/// Reads a line without echoing it when stdin is a console.
fn prompt_hidden(prompt: &str) -> Result<String, Failure> {
    eprint!("{prompt} ");
    let _ = std::io::stderr().flush();
    let _echo = EchoOff::new();
    let mut line = String::new();
    std::io::stdin()
        .read_line(&mut line)
        .map_err(|e| Failure::usage("stdin", "err.internal").detail(e.to_string()))?;
    eprintln!();
    Ok(line)
}

/// Turns the console's echo off while it lives (Windows); a no-op elsewhere
/// or when stdin is not a console.
struct EchoOff {
    #[cfg(windows)]
    restore: Option<(windows_sys::Win32::Foundation::HANDLE, u32)>,
}

impl EchoOff {
    #[cfg(windows)]
    fn new() -> EchoOff {
        use windows_sys::Win32::System::Console::{
            GetConsoleMode, GetStdHandle, SetConsoleMode, ENABLE_ECHO_INPUT, STD_INPUT_HANDLE,
        };
        // SAFETY: plain console calls on this process's own stdin handle.
        unsafe {
            let h = GetStdHandle(STD_INPUT_HANDLE);
            let mut mode = 0u32;
            if GetConsoleMode(h, &mut mode) == 0 {
                return EchoOff { restore: None };
            }
            SetConsoleMode(h, mode & !ENABLE_ECHO_INPUT);
            EchoOff {
                restore: Some((h, mode)),
            }
        }
    }
    #[cfg(not(windows))]
    fn new() -> EchoOff {
        EchoOff {}
    }
}

#[cfg(windows)]
impl Drop for EchoOff {
    fn drop(&mut self) {
        if let Some((h, mode)) = self.restore {
            // SAFETY: restores the mode read in `new` on the same handle.
            unsafe { windows_sys::Win32::System::Console::SetConsoleMode(h, mode) };
        }
    }
}

#[cfg(test)]
mod tests;
