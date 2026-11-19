//! Remote mode against a small HTTP server inside the test: what the CLI
//! sends (headers, query, gzip, run targeting, retries) and what it prints
//! and exits with. No network beyond loopback.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use super::*;
use crate::config::Env;

/// A made-up token, assembled so that no secret scanner mistakes it for one.
const TOKEN: &str = concat!("phr_", "prj_", "fake-test-token-not-real");

#[derive(Clone, Debug)]
struct Seen {
    method: String,
    target: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

impl Seen {
    fn query(&self) -> HashMap<String, String> {
        let q = self.target.split_once('?').map(|(_, q)| q).unwrap_or("");
        url::form_urlencoded::parse(q.as_bytes())
            .into_owned()
            .collect()
    }
    fn path(&self) -> &str {
        self.target.split('?').next().unwrap_or("")
    }
    /// The body, gunzipped when it came gzipped.
    fn text(&self) -> String {
        if self.headers.get("content-encoding").map(String::as_str) == Some("gzip") {
            let mut out = String::new();
            flate2::read::GzDecoder::new(&self.body[..])
                .read_to_string(&mut out)
                .unwrap();
            out
        } else {
            String::from_utf8_lossy(&self.body).to_string()
        }
    }
}

/// Answers each request with the next scripted (status, body), one per
/// connection, and keeps what it received.
fn server(script: Vec<(u16, Value)>) -> (String, Arc<Mutex<Vec<Seen>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
    let seen = Arc::new(Mutex::new(Vec::new()));
    let log = seen.clone();
    std::thread::spawn(move || {
        for (status, body) in script {
            let Ok((stream, _)) = listener.accept() else {
                return;
            };
            let mut reader = BufReader::new(stream);
            let mut first = String::new();
            reader.read_line(&mut first).unwrap();
            let mut parts = first.split_whitespace();
            let method = parts.next().unwrap_or("").to_string();
            let target = parts.next().unwrap_or("").to_string();
            let mut headers = HashMap::new();
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                let line = line.trim_end();
                if line.is_empty() {
                    break;
                }
                if let Some((k, v)) = line.split_once(':') {
                    headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
                }
            }
            let len: usize = headers
                .get("content-length")
                .and_then(|v| v.parse().ok())
                .unwrap_or(0);
            let mut body_in = vec![0u8; len];
            reader.read_exact(&mut body_in).unwrap();
            log.lock().unwrap().push(Seen {
                method,
                target,
                headers,
                body: body_in,
            });
            let text = body.to_string();
            let mut stream = reader.into_inner();
            let reason = if status < 300 { "OK" } else { "ERR" };
            let _ = write!(
                stream,
                "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}",
                text.len()
            );
        }
    });
    (addr, seen)
}

fn uploaded(key: &str, created: bool, format: &str) -> Value {
    json!({
        "run": {"id": "00000000-0000-4000-8000-000000000001", "key": key, "url": format!("https://pharos.test/runs/{key}"), "status": "in_progress"},
        "shard": {"id": "00000000-0000-4000-8000-000000000002", "created": created, "format": format},
        "counts": {"results": 3, "linked": 2, "unlinked": 1, "byStatus": {"passed": 2, "failed": 1}, "findings": 0, "metrics": 0},
        "warnings": []
    })
}

struct Run {
    dir: std::path::PathBuf,
}

impl Run {
    fn new() -> Run {
        let dir = std::env::temp_dir().join(format!("pharos-cli-remote-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        Run { dir }
    }
    fn write(&self, name: &str, text: &str) {
        std::fs::write(self.dir.join(name), text).unwrap();
    }
    fn exec(&self, args: &[&str], vars: &[(&str, &str)]) -> (i32, String, String) {
        let mut all: Vec<(String, String)> = vec![
            ("PHAROS_TOKEN".into(), TOKEN.into()),
            ("PHAROS_CLI_TEST_NO_WAIT".into(), "1".into()),
        ];
        all.extend(vars.iter().map(|(k, v)| (k.to_string(), v.to_string())));
        let env = Env {
            vars: all.into_iter().collect(),
            cwd: self.dir.clone(),
            user_config_dir: Some(self.dir.join("user")),
            tty: false,
            stdin: None,
        };
        let argv: Vec<String> = args.iter().map(|s| s.to_string()).collect();
        let (mut out, mut err) = (Vec::new(), Vec::new());
        #[cfg(feature = "local")]
        let code = crate::run(&argv, &env, &mut out, &mut err, &crate::local::System);
        #[cfg(not(feature = "local"))]
        let code = crate::run(&argv, &env, &mut out, &mut err);
        (
            code,
            String::from_utf8(out).unwrap(),
            String::from_utf8(err).unwrap(),
        )
    }
}

impl Drop for Run {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

#[test]
fn servers_are_https_or_loopback_http() {
    assert_eq!(
        origin("pharos.example.com").unwrap(),
        "https://pharos.example.com"
    );
    assert_eq!(
        origin("https://Pharos.Example.com/").unwrap(),
        "https://pharos.example.com"
    );
    assert_eq!(
        origin("http://localhost:3120").unwrap(),
        "http://localhost:3120"
    );
    assert_eq!(
        origin("http://127.0.0.1:3120/").unwrap(),
        "http://127.0.0.1:3120"
    );
    assert_eq!(
        origin("http://pharos.example.com").unwrap_err().code,
        "insecure-server"
    );
    assert_eq!(
        origin("https://pharos.example.com/api").unwrap_err().code,
        "bad-server"
    );
    assert_eq!(origin("ftp://x").unwrap_err().code, "bad-server");
    assert_eq!(mask(TOKEN), "phr_prj_fake…");
}

#[test]
fn api_errors_map_to_the_documented_exit_codes() {
    let f = |status: u16, code: &str| {
        failure(
            &ApiError::Status {
                status,
                body: json!({"code": code, "message": "m"}),
            },
            "o",
        )
    };
    assert_eq!(f(401, "token_expired").exit, Exit::Auth);
    assert_eq!(f(403, "account_disabled").exit, Exit::Auth);
    assert_eq!(f(403, "insufficient_scope").exit, Exit::Auth);
    assert_eq!(f(404, "run_not_found").exit, Exit::NotFound);
    assert_eq!(f(409, "run_closed").exit, Exit::NotFound);
    assert_eq!(f(409, "ambiguous_project").exit, Exit::Usage);
    assert_eq!(f(400, "format_mismatch").exit, Exit::Report);
    assert_eq!(f(400, "validation_error").exit, Exit::Usage);
    assert_eq!(f(413, "payload_too_large").exit, Exit::Report);
    assert_eq!(f(415, "unsupported_media_type").exit, Exit::Report);
    assert_eq!(f(422, "invalid_report").exit, Exit::Report);
    assert_eq!(f(429, "rate_limited").exit, Exit::Unreachable);
    assert_eq!(f(503, "").code, "http-503");
    let net = failure(&ApiError::Network("refused".into()), "https://x");
    assert_eq!(
        (net.exit, net.code.as_str()),
        (Exit::Unreachable, "unreachable")
    );
    let reason = failure(
        &ApiError::Status {
            status: 422,
            body: json!({"code": "invalid_report", "message": "bad", "reason": "doctype"}),
        },
        "o",
    );
    assert_eq!(reason.detail.as_deref(), Some("bad (doctype)"));
}

#[test]
fn two_files_go_into_one_run_closed_at_the_end_and_the_token_never_shows() {
    let (addr, seen) = server(vec![
        (201, json!({"runKey": "RUN-128", "status": "in_progress"})),
        (201, uploaded("RUN-128", true, "junit")),
        (201, uploaded("RUN-128", true, "sarif")),
        (200, json!({"runKey": "RUN-128", "status": "completed"})),
    ]);
    let r = Run::new();
    r.write("junit.xml", "<testsuites/>");
    // Over 64 KB: travels gzipped.
    r.write(
        "big.sarif",
        &format!(
            "{{\"version\":\"2.1.0\",\"runs\":[],\"pad\":\"{}\"}}",
            "x".repeat(70_000)
        ),
    );
    let (code, out, err) = r.exec(
        &[
            "upload",
            "junit.xml",
            "big.sarif",
            "-p",
            "PAG",
            "--server",
            &addr,
            "--lang",
            "en",
        ],
        &[],
    );
    assert_eq!(code, 0, "{out}\n{err}");
    assert!(out.contains("Remote mode"), "{out}");
    assert!(out.contains("RUN-128 created"), "{out}");
    assert!(out.contains("SARIF"), "{out}");
    assert!(out.contains("Uploaded 2 of 2 into run RUN-128."), "{out}");
    assert!(out.contains("Run RUN-128 closed as completed."), "{out}");
    assert!(
        !out.contains(TOKEN) && !err.contains(TOKEN),
        "the token is never printed"
    );
    assert!(out.contains("phr_prj_fake…"), "{out}");
    let seen = seen.lock().unwrap();
    assert_eq!(seen.len(), 4);
    // The run first, empty and open: the server closes a run that an upload
    // creates, so a second file could not go into it.
    assert_eq!(seen[0].path(), "/api/v1/projects/PAG/runs");
    let up = &seen[1];
    assert_eq!(up.method, "POST");
    assert_eq!(up.path(), "/api/v1/projects/PAG/results");
    assert_eq!(up.headers["authorization"], format!("Bearer {TOKEN}"));
    assert_eq!(up.headers["content-type"], "application/octet-stream");
    assert_eq!(
        up.query().get("fileName").map(String::as_str),
        Some("junit.xml")
    );
    assert_eq!(
        up.query().get("runKey").map(String::as_str),
        Some("RUN-128")
    );
    assert!(!up.target.contains("phr_"), "never a token in a URL");
    assert_eq!(
        seen[2].query().get("runKey").map(String::as_str),
        Some("RUN-128")
    );
    assert_eq!(
        seen[2].headers.get("content-encoding").map(String::as_str),
        Some("gzip")
    );
    assert!(seen[2].text().contains("\"version\":\"2.1.0\""));
    assert_eq!(seen[3].path(), "/api/v1/projects/PAG/runs/RUN-128/close");
}

#[test]
fn in_github_actions_the_matrix_converges_and_the_job_page_gets_a_summary() {
    let (addr, seen) = server(vec![
        (201, uploaded("RUN-7", true, "junit")),
        (200, uploaded("RUN-7", false, "junit")),
    ]);
    let r = Run::new();
    r.write("junit.xml", "<testsuites/>");
    let summary = r.dir.join("summary.md");
    let output = r.dir.join("output.txt");
    let vars = [
        ("GITHUB_ACTIONS", "true"),
        ("CI", "true"),
        ("GITHUB_REPOSITORY", "empresa/pagos"),
        ("GITHUB_RUN_ID", "9134"),
        ("GITHUB_RUN_ATTEMPT", "2"),
        ("GITHUB_WORKFLOW", "CI"),
        ("GITHUB_HEAD_REF", "feature/x"),
        ("GITHUB_SHA", "9f3c2a1deadbeef"),
        ("PHAROS_URL", addr.as_str()),
        ("GITHUB_STEP_SUMMARY", summary.to_str().unwrap()),
        ("GITHUB_OUTPUT", output.to_str().unwrap()),
    ];
    let (code, out, err) = r.exec(&["upload", "junit.xml", "-p", "PAG", "--lang", "en"], &vars);
    assert_eq!(code, 0, "{out}\n{err}");
    // A repeat of the same job: the same run, nothing new.
    let (code, out2, _) = r.exec(&["upload", "junit.xml", "-p", "PAG", "--lang", "en"], &vars);
    assert_eq!(code, 0);
    assert!(out2.contains("already imported into RUN-7"), "{out2}");
    let seen = seen.lock().unwrap();
    let q = seen[0].query();
    assert_eq!(q["externalId"], "github:empresa/pagos:9134:2");
    assert_eq!(q["runName"], "CI · feature/x · 9f3c2a1");
    // Not closed: the last job of the matrix closes it (`pharos run close`).
    assert_eq!(seen.len(), 2);
    let md = std::fs::read_to_string(&summary).unwrap();
    assert!(md.contains("### Pharos · RUN-7"), "{md}");
    assert!(md.contains("| `junit.xml` | JUnit | 2 | 1 |"), "{md}");
    let outputs = std::fs::read_to_string(&output).unwrap();
    assert!(outputs.contains("run-key=RUN-7\n"), "{outputs}");
    assert!(
        outputs.contains("run-url=https://pharos.test/runs/RUN-7\n"),
        "{outputs}"
    );
    // The unlinked test is an annotation on the PR.
    assert!(
        out.contains("::warning title=Pharos::1 tests without a case"),
        "{out}"
    );
}

#[test]
fn busy_servers_are_retried_and_a_bad_token_is_not() {
    let (addr, seen) = server(vec![
        (503, json!({"code": "unavailable", "message": "later"})),
        (429, json!({"code": "rate_limited", "message": "slow down"})),
        (201, uploaded("RUN-1", true, "junit")),
        (401, json!({"code": "token_expired", "message": "expired"})),
    ]);
    let r = Run::new();
    r.write("junit.xml", "<testsuites/>");
    let (code, out, err) = r.exec(
        &["upload", "junit.xml", "-p", "PAG", "--server", &addr],
        &[],
    );
    assert_eq!(code, 0, "{out}\n{err}");
    let (code, _, err) = r.exec(
        &[
            "upload",
            "junit.xml",
            "-p",
            "PAG",
            "--server",
            &addr,
            "--lang",
            "en",
        ],
        &[],
    );
    assert_eq!(code, 3, "{err}");
    assert!(err.contains("[token_expired]"), "{err}");
    assert_eq!(seen.lock().unwrap().len(), 4, "401 is not retried");
}

#[test]
fn nothing_listening_is_exit_7_and_no_token_is_exit_3() {
    let r = Run::new();
    r.write("junit.xml", "<testsuites/>");
    // A port that was free a moment ago.
    let port = TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let server = format!("http://127.0.0.1:{port}");
    let (code, _, err) = r.exec(
        &[
            "upload",
            "junit.xml",
            "-p",
            "PAG",
            "--server",
            &server,
            "--lang",
            "en",
        ],
        &[],
    );
    assert_eq!(code, 7, "{err}");
    assert!(err.contains("[unreachable]"), "{err}");
    let env_without_token = Env {
        vars: HashMap::new(),
        cwd: r.dir.clone(),
        user_config_dir: None,
        tty: false,
        stdin: None,
    };
    let opts = Opts::default();
    let f = token(&opts, &env_without_token, "https://x.example").unwrap_err();
    assert_eq!((f.exit, f.code.as_str()), (Exit::Auth, "no-token"));
    let stdin = Env {
        stdin: Some("  not-a-token \n".into()),
        ..env_without_token.clone()
    };
    let opts = Opts {
        token_stdin: true,
        ..Default::default()
    };
    assert_eq!(
        token(&opts, &stdin, "https://x.example").unwrap_err().code,
        "bad-token"
    );
    let stdin = Env {
        stdin: Some(format!("{TOKEN}\n")),
        ..env_without_token
    };
    assert_eq!(token(&opts, &stdin, "https://x.example").unwrap(), TOKEN);
}

#[test]
fn a_matrix_closes_its_run_by_external_id() {
    let (addr, seen) = server(vec![
        (200, json!({"runKey": "RUN-7", "status": "in_progress"})),
        (200, json!({"runKey": "RUN-7", "status": "aborted"})),
    ]);
    let r = Run::new();
    let (code, out, err) = r.exec(
        &[
            "run",
            "close",
            "--external-id",
            "github:a/b:1:1",
            "-p",
            "PAG",
            "--server",
            &addr,
            "--status",
            "aborted",
            "--lang",
            "en",
        ],
        &[],
    );
    assert_eq!(code, 0, "{out}\n{err}");
    assert!(out.contains("Run RUN-7 closed as aborted."), "{out}");
    let seen = seen.lock().unwrap();
    assert_eq!(seen[0].path(), "/api/v1/projects/PAG/runs");
    assert!(seen[0].text().contains("\"externalId\":\"github:a/b:1:1\""));
    assert_eq!(seen[1].path(), "/api/v1/projects/PAG/runs/RUN-7/close");
    assert!(seen[1].text().contains("\"status\":\"aborted\""));
}

#[test]
fn projects_and_doctor_ask_the_server() {
    let me = json!({
        "token": {"id": "00000000-0000-4000-8000-000000000003", "kind": "project", "name": "CI GitHub", "prefix": "phr_prj_Ab3k",
                  "scopes": ["runs:write", "runs:read"], "expiresAt": "2099-02-16T00:00:00Z", "workspaceId": null, "projectId": "p1"},
        "owner": {"id": "00000000-0000-4000-8000-000000000004", "name": "Ana Pérez"}
    });
    let (addr, _) = server(vec![
        (
            200,
            json!({"projects": [{"id": "p1", "name": "Pagos web", "caseIdPrefix": "PAG-", "workspace": {"id": "w", "name": "QA Pagos"}}]}),
        ),
        (200, me),
    ]);
    let r = Run::new();
    let (code, out, err) = r.exec(&["projects", "--server", &addr, "--lang", "en"], &[]);
    assert_eq!(code, 0, "{out}\n{err}");
    assert!(out.contains("PAG       Pagos web  ·  QA Pagos"), "{out}");
    let (code, out, err) = r.exec(
        &["doctor", "--server", &addr, "--lang", "en"],
        &[("CI", "true")],
    );
    assert_eq!(code, 0, "{out}\n{err}");
    assert!(out.contains("answers (API v1)"), "{out}");
    assert!(out.contains("Project token of Ana Pérez · phr_prj_Ab3k · scopes: runs:write runs:read · expires 2099-02-16"), "{out}");
}

#[test]
fn expiry_is_counted_in_days() {
    assert_eq!(
        days_left("2026-11-25T10:00:00Z", days_from_civil(2026, 11, 18)),
        Some(7)
    );
    assert_eq!(
        days_left("2027-01-01", days_from_civil(2026, 12, 31)),
        Some(1)
    );
    assert_eq!(days_from_civil(1970, 1, 1), 0);
    assert_eq!(days_left("soon", 0), None);
}
