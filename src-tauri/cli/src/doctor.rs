//! `pharos doctor` (ADR-0054 §1): version, installation, configuration, the
//! mode that would be used and, locally, the data folder, the signed-in
//! account and whether the database opens. Exit 0 with only warnings; else
//! the exit code of the first error. L2 adds the server and token checks.

use serde_json::{json, Value};

use crate::args::Opts;
use crate::config::{mode, Config, Env, Mode};
use crate::exit::{Exit, Failure};
use crate::output::{Mark, Printer};

#[derive(Clone, Copy, PartialEq)]
enum Status {
    Ok,
    Warn,
    Error,
}

struct Report<'p, 'a> {
    p: &'p mut Printer<'a>,
    checks: Vec<Value>,
    warnings: usize,
    errors: usize,
    exit: Exit,
}

impl Report<'_, '_> {
    fn check(&mut self, name: &str, status: Status, text: String, exit: Option<Exit>) {
        let mark = match status {
            Status::Ok => Mark::Ok,
            Status::Warn => Mark::Warn,
            Status::Error => Mark::Fail,
        };
        match status {
            Status::Ok => {}
            Status::Warn => self.warnings += 1,
            Status::Error => {
                self.errors += 1;
                if self.exit == Exit::Ok {
                    self.exit = exit.unwrap_or(Exit::Internal);
                }
            }
        }
        let mark = self.p.mark(mark);
        self.p.line(&format!("{mark} {text}"));
        let status = match status {
            Status::Ok => "ok",
            Status::Warn => "warning",
            Status::Error => "error",
        };
        self.checks
            .push(json!({"check": name, "status": status, "detail": text}));
    }

    fn failure(&mut self, name: &str, f: &Failure, warn: bool) {
        let text = format!("{} [{}]", self.p.t(f.key, &f.args), f.code);
        let status = if warn { Status::Warn } else { Status::Error };
        self.check(name, status, text, Some(f.exit));
    }

    fn heading(&mut self, key: &str) {
        let text = self.p.t(key, &[]);
        let text = self.p.bold(&text);
        self.p.line(&text);
    }
}

pub fn doctor(
    opts: &Opts,
    cfg: Result<&Config, &Failure>,
    env: &Env,
    #[cfg(feature = "local")] local: &dyn crate::local::Local,
    p: &mut Printer,
) -> Exit {
    let version = p.t(
        "doc.version",
        &[
            env!("CARGO_PKG_VERSION").into(),
            crate::runjson::SCHEMA_VERSION.into(),
        ],
    );
    p.line(&version);
    let mut r = Report {
        p,
        checks: Vec::new(),
        warnings: 0,
        errors: 0,
        exit: Exit::Ok,
    };
    if let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(|d| d.to_path_buf()))
    {
        let text = r.p.t("doc.exe", &[dir.display().to_string()]);
        r.check("install", Status::Ok, text, None);
    }
    let cfg = match cfg {
        Ok(cfg) => {
            match &cfg.project_path {
                Some(path) => {
                    let text = r.p.t("doc.config", &[path.display().to_string()]);
                    r.check("config", Status::Ok, text, None);
                }
                None => {
                    let text = r.p.t("doc.no-config", &[]);
                    r.check("config", Status::Ok, text, None);
                }
            }
            cfg.clone()
        }
        Err(f) => {
            r.failure("config", f, false);
            Config::default()
        }
    };
    let chosen = mode(opts, env, &cfg);
    match &chosen {
        Ok(m) => {
            let shown = match m {
                Mode::Local => r.p.t("doc.mode-local", &[]),
                Mode::Remote(server) => r.p.t("doc.mode-remote", std::slice::from_ref(server)),
            };
            let text = r.p.t("doc.mode", &[shown]);
            r.check("mode", Status::Ok, text, None);
        }
        Err(f) => r.failure("mode", f, false),
    }

    #[cfg(feature = "local")]
    if !env.is_ci() {
        local_checks(&mut r, opts, env, local, matches!(chosen, Ok(Mode::Local)));
    }

    if matches!(chosen, Ok(Mode::Remote(_))) {
        remote_checks(&mut r, opts, &cfg, env);
    }

    let summary = r.p.t(
        "doc.summary",
        &[
            r.warnings.to_string(),
            r.errors.to_string(),
            r.exit.code().to_string(),
        ],
    );
    let summary = r.p.dim(&summary);
    r.p.line(&summary);
    let line = json!({"doctor": {"version": env!("CARGO_PKG_VERSION"), "checks": r.checks, "exit": r.exit.code()}});
    r.p.json_line(&line);
    r.exit
}

/// The server checks: its address, a token, and `GET /api/v1/me` (who the
/// token belongs to, its permissions and expiry).
fn remote_checks(r: &mut Report, opts: &Opts, cfg: &Config, env: &Env) {
    use crate::remote;
    r.heading("doc.remote");
    let origin = match remote::server(opts, env, cfg) {
        Ok(o) => o,
        Err(f) => return r.failure("server", &f, false),
    };
    let token = match remote::token(opts, env, &origin) {
        Ok(t) => t,
        Err(f) => return r.failure("token", &f, false),
    };
    let client = match remote::Client::new(&origin, &token, env) {
        Ok(c) => c,
        Err(f) => return r.failure("server", &f, false),
    };
    match client.me() {
        Ok(me) => {
            let text = r.p.t("doc.server-ok", std::slice::from_ref(&origin));
            r.check("server", Status::Ok, text, None);
            let (line, warn) = remote::describe_me(r.p, &me);
            r.check("token", Status::Ok, line, None);
            if let Some(w) = warn {
                r.check("token-expiry", Status::Warn, w, None);
            }
        }
        Err(e) => r.failure("server", &remote::failure(&e, &origin), false),
    }
}

/// The local checks. When the mode is remote they are only informative: an
/// error there is a warning.
#[cfg(feature = "local")]
fn local_checks(
    r: &mut Report,
    opts: &Opts,
    env: &Env,
    local: &dyn crate::local::Local,
    needed: bool,
) {
    use crate::local;
    r.heading("doc.local");
    let severity = |needed: bool| if needed { Status::Error } else { Status::Warn };
    let dir = match local::data_dir(opts, env, local) {
        Ok(dir) => dir,
        Err(f) => return r.failure("data-dir", &f, !needed),
    };
    if !pharos_core::api::has_database(&dir).unwrap_or(false) {
        let text = r.p.t("doc.no-data", &[dir.display().to_string()]);
        return r.check("data-dir", severity(needed), text, Some(Exit::NotFound));
    }
    let text = r.p.t("doc.data-dir", &[dir.display().to_string()]);
    r.check("data-dir", Status::Ok, text, None);
    let user = match local::signed_in(local) {
        Ok(user) => {
            let text =
                r.p.t("doc.user", &[user.display_name.clone(), user.email.clone()]);
            r.check("session", Status::Ok, text, None);
            user
        }
        Err(f) => return r.failure("session", &f, !needed),
    };
    match local::open_existing(local, &dir) {
        Ok(db) => {
            let n = pharos_core::api::list_projects(&db, &user.id)
                .map(|l| l.len())
                .unwrap_or(0);
            let text = r.p.t("doc.db-ok", &[n.to_string()]);
            r.check("database", Status::Ok, text, None);
        }
        // The app being open is normal: a warning, until N5 makes it moot.
        Err(f) if f.code == "db-in-use" => r.failure("database", &f, true),
        Err(f) => r.failure("database", &f, !needed),
    }
}
