//! The `pharos` command line (INT-01, ADR-0054): `upload`, `projects` and
//! `doctor`. Local mode writes into the desktop's database through
//! `pharos-core`; remote mode (L2), `watch` (L3) and `login` (L2) come next.
//!
//! `run` is the whole program with its environment given, so the tests drive
//! it without a process: argv, environment, output streams and how the
//! desktop's data is reached.

pub mod args;
pub mod config;
pub mod doctor;
pub mod exit;
pub mod files;
pub mod i18n;
pub mod junit;
#[cfg(feature = "local")]
pub mod local;
pub mod output;
pub mod path_env;
pub mod remote;
pub mod runjson;
pub mod watch;

use std::io::Write;

use args::Command;
use config::{mode, Config, Env, Mode};
use exit::{Exit, Failure};
use i18n::Lang;
use output::Printer;

/// Runs the CLI and returns its exit code.
pub fn run(
    argv: &[String],
    env: &Env,
    out: &mut dyn Write,
    err: &mut dyn Write,
    #[cfg(feature = "local")] local: &dyn local::Local,
) -> i32 {
    // The language first, so that every message is already in it.
    let cfg = Config::load(env);
    let wanted = args::lang_flag(argv).or_else(|| cfg.as_ref().ok().and_then(|c| c.lang(env)));
    let lang = wanted
        .as_deref()
        .and_then(Lang::parse)
        .unwrap_or_else(|| Lang::system(|n| env.var(n)));
    let mut p = Printer::new(lang, out, err);
    if let Some(bad) = wanted.filter(|w| Lang::parse(w).is_none()) {
        p.failure(&Failure::usage("bad-lang", "err.bad-lang").arg(bad));
        return Exit::Usage.code();
    }

    // The installer's hooks (L5): not a user command, so not in the help.
    if argv.first().map(String::as_str) == Some("setup-path") {
        return match path_env::command(&argv[1..]) {
            Ok(done) => {
                p.always(&done);
                Exit::Ok.code()
            }
            Err(f) => {
                p.failure(&f);
                f.exit.code()
            }
        };
    }

    let parsed = match args::parse(argv) {
        Ok(parsed) => parsed,
        Err(f) => {
            p.failure(&f);
            return f.exit.code();
        }
    };
    let opts = &parsed.opts;
    p.json = opts.json;
    p.quiet = opts.quiet;
    p.color = env.tty && !opts.no_color && !opts.json && env.var("NO_COLOR").is_none();

    match &parsed.command {
        Command::Version => {
            p.always(&format!(
                "pharos {} (Pharos Run JSON {})",
                env!("CARGO_PKG_VERSION"),
                runjson::SCHEMA_VERSION
            ));
            Exit::Ok.code()
        }
        Command::Help(topic) => {
            let key = match topic.as_deref() {
                Some("upload") => "help.upload",
                Some("projects") => "help.projects",
                Some("doctor") => "help.doctor",
                Some("watch") => "help.watch",
                _ => "help.main",
            };
            let text = p.t(key, &[]);
            p.always(&text);
            Exit::Ok.code()
        }
        Command::Login | Command::Logout | Command::RunClose(_) => {
            let cfg = match cfg {
                Ok(cfg) => cfg,
                Err(f) => {
                    p.failure(&f);
                    return f.exit.code();
                }
            };
            match &parsed.command {
                Command::Login => remote::login(opts, &cfg, env, &mut p),
                Command::Logout => remote::logout(opts, &cfg, env, &mut p),
                Command::RunClose(key) => {
                    remote::run_close(key.as_deref(), opts, &cfg, env, &mut p)
                }
                _ => unreachable!("matched above"),
            }
            .code()
        }
        Command::Watch => {
            let cfg = match cfg {
                Ok(cfg) => cfg,
                Err(f) => {
                    p.failure(&f);
                    return f.exit.code();
                }
            };
            watch::watch(
                opts,
                &cfg,
                env,
                #[cfg(feature = "local")]
                local,
                &mut p,
            )
        }
        Command::Doctor => doctor::doctor(
            opts,
            cfg.as_ref(),
            env,
            #[cfg(feature = "local")]
            local,
            &mut p,
        )
        .code(),
        Command::Upload | Command::Projects => {
            let cfg = match cfg {
                Ok(cfg) => cfg,
                Err(f) => {
                    p.failure(&f);
                    return f.exit.code();
                }
            };
            match mode(opts, env, &cfg) {
                Err(f) => {
                    p.failure(&f);
                    f.exit.code()
                }
                Ok(Mode::Remote(_)) => match parsed.command {
                    Command::Upload => remote::upload(opts, &cfg, env, &mut p).code(),
                    _ => remote::projects(opts, &cfg, env, &mut p).code(),
                },
                #[cfg(feature = "local")]
                Ok(Mode::Local) => match parsed.command {
                    Command::Upload => local::upload(opts, &cfg, env, local, &mut p).code(),
                    _ => local::projects(opts, env, local, &mut p).code(),
                },
                #[cfg(not(feature = "local"))]
                Ok(Mode::Local) => {
                    let f = Failure::usage("local-in-ci", "err.local-in-ci");
                    p.failure(&f);
                    f.exit.code()
                }
            }
        }
    }
}
