//! `pharos watch [opts] --report <glob>… -- <cmd> [args…]` (INT-01 L3,
//! ADR-0054 §2): runs a test command and uploads the reports it wrote.
//!
//! - **Before the command:** the mode, the project and the token (remote, with
//!   `GET /me`) or the session and the database (local) are checked, so a
//!   problem shows in seconds, not after the tests.
//! - **The command** runs with this terminal (its output as it comes, its
//!   stdin). On Windows `npm` is found as `npm.cmd` through PATH and PATHEXT.
//!   Ctrl+C reaches the tests; this process lets it pass and uploads what
//!   they managed to write.
//! - **Only new reports:** a file the patterns match but that was not written
//!   or changed during the command is left out, so an old report of another
//!   run never goes up by mistake.
//! - **Exit code:** the command's. A failed upload is a warning, unless
//!   `--require-upload`, which makes it decide (`watch` in CI should not hide
//!   the tests' result behind Pharos).

use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime};

use crate::args::Opts;
use crate::config::{mode, Config, Env, Mode};
use crate::exit::{Exit, Failure};
use crate::output::{Mark, Printer};

/// mtime is rounded on some file systems (FAT: 2 s): a report written in the
/// command's first moments must still count as new.
const MTIME_SLACK: Duration = Duration::from_secs(2);

/// `pharos watch`: the exit code of the process.
pub fn watch(
    opts: &Opts,
    cfg: &Config,
    env: &Env,
    #[cfg(feature = "local")] local: &dyn crate::local::Local,
    p: &mut Printer,
) -> i32 {
    match prepare(
        opts,
        cfg,
        env,
        #[cfg(feature = "local")]
        local,
    ) {
        Err(f) => {
            p.failure(&f);
            f.exit.code()
        }
        Ok((mode, patterns)) => run(
            opts,
            cfg,
            env,
            &mode,
            &patterns,
            #[cfg(feature = "local")]
            local,
            p,
        ),
    }
}

/// Everything that can fail before the command runs.
fn prepare(
    opts: &Opts,
    cfg: &Config,
    env: &Env,
    #[cfg(feature = "local")] local: &dyn crate::local::Local,
) -> Result<(Mode, Vec<String>), Failure> {
    if opts.command.is_empty() {
        return Err(Failure::usage("no-command", "err.watch-no-command"));
    }
    let patterns: Vec<String> = if opts.reports.is_empty() {
        cfg.project
            .report
            .clone()
            .or_else(|| cfg.user.report.clone())
            .unwrap_or_default()
    } else {
        opts.reports.clone()
    };
    if patterns.is_empty() {
        return Err(Failure::usage("no-report", "err.watch-no-report"));
    }
    let wanted = cfg
        .project(opts, env)
        .ok_or_else(|| Failure::usage("project-required", "err.project-required"))?;
    let mode = mode(opts, env, cfg)?;
    match &mode {
        Mode::Remote(_) => {
            let origin = crate::remote::server(opts, env, cfg)?;
            let token = crate::remote::token(opts, env, &origin)?;
            crate::remote::Client::new(&origin, &token, env)?
                .me()
                .map_err(|e| crate::remote::failure(&e, &origin))?;
        }
        Mode::Local => {
            #[cfg(feature = "local")]
            {
                use crate::local as l;
                let user = l::signed_in(local)?;
                let dir = l::data_dir(opts, env, local)?;
                let db = l::open_existing(local, &dir)?;
                let projects = pharos_core::api::list_projects(&db, &user.id)
                    .map_err(|e| crate::exit::from_core(&e))?;
                l::pick_project(&projects, &wanted)?.ok_or_else(|| {
                    Failure::new(Exit::NotFound, "project-not-found", "err.project-not-found")
                        .arg(wanted.as_str())
                })?;
            }
            #[cfg(not(feature = "local"))]
            {
                // The project is checked against the local data only.
                let _ = &wanted;
                return Err(Failure::usage("local-in-ci", "err.local-in-ci"));
            }
        }
    }
    Ok((mode, patterns))
}

#[allow(clippy::too_many_arguments)]
fn run(
    opts: &Opts,
    cfg: &Config,
    env: &Env,
    mode: &Mode,
    patterns: &[String],
    #[cfg(feature = "local")] local: &dyn crate::local::Local,
    p: &mut Printer,
) -> i32 {
    let shown = opts.command.join(" ");
    let start = SystemTime::now() - MTIME_SLACK;
    let began = Instant::now();
    if !p.json {
        let line = p.t("out.watch-start", std::slice::from_ref(&shown));
        let line = p.dim(&line);
        p.line(&line);
    }
    let status = {
        let _ctrl_c = LetCtrlCThrough::new();
        std::process::Command::new(resolve(&opts.command[0], env))
            .args(&opts.command[1..])
            .current_dir(&env.cwd)
            .status()
    };
    let code = match status {
        Ok(s) => s.code().unwrap_or(1),
        Err(e) => {
            let f = Failure::usage("spawn", "err.watch-spawn")
                .arg(opts.command[0].as_str())
                .detail(e.to_string());
            p.failure(&f);
            return f.exit.code();
        }
    };
    let secs = began.elapsed().as_secs();
    if !p.json {
        let line = p.t(
            "out.watch-end",
            &[code.to_string(), format!("{}:{:02}", secs / 60, secs % 60)],
        );
        let line = p.dim(&line);
        p.line(&line);
        p.line("");
    }

    // The reports written or changed during the command.
    let (new, old) = collect(patterns, env, start);
    for shown_old in &old {
        let mark = p.mark(Mark::Skip);
        let text = p.t("out.watch-old", std::slice::from_ref(shown_old));
        let text = p.dim(&text);
        p.line(&format!("  {mark} {text}"));
    }
    let upload_exit = if new.is_empty() {
        let f = Failure::usage("no-new-report", "err.watch-none").arg(patterns.join(", "));
        p.failure(&f);
        f.exit
    } else {
        let upload = Opts {
            files: new,
            ..opts.clone()
        };
        match mode {
            Mode::Remote(_) => crate::remote::upload(&upload, cfg, env, p),
            #[cfg(feature = "local")]
            Mode::Local => crate::local::upload(&upload, cfg, env, local, p),
            #[cfg(not(feature = "local"))]
            Mode::Local => Exit::Usage,
        }
    };

    let exit = if upload_exit == Exit::Ok || (!opts.require_upload && code != 0) {
        code
    } else if opts.require_upload {
        upload_exit.code()
    } else {
        // The tests passed and the upload failed: the tests decide.
        let text = p.t("out.watch-upload-ignored", &[]);
        p.warn(&text);
        code
    };
    if !p.json && exit == code {
        let text = p.t("out.watch-exit", &[code.to_string()]);
        let text = p.dim(&text);
        p.line(&text);
    }
    exit
}

/// The files the patterns match, split into written during the command
/// (`new`, as paths for `upload`) and older (`old`, shown).
fn collect(patterns: &[String], env: &Env, start: SystemTime) -> (Vec<String>, Vec<String>) {
    let mut new = Vec::new();
    let mut old = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for pattern in patterns {
        let full = env.cwd.join(pattern).to_string_lossy().replace('\\', "/");
        let Ok(paths) = glob::glob(&full) else {
            continue;
        };
        let mut paths: Vec<PathBuf> = paths
            .filter_map(Result::ok)
            .filter(|p| p.is_file())
            .collect();
        paths.sort();
        for path in paths {
            if !seen.insert(path.clone()) {
                continue;
            }
            let shown = path
                .strip_prefix(&env.cwd)
                .unwrap_or(&path)
                .display()
                .to_string();
            let modified = std::fs::metadata(&path).and_then(|m| m.modified()).ok();
            if modified.is_some_and(|m| m >= start) {
                // Relative to the working folder, as `upload` shows its files.
                new.push(shown);
            } else {
                old.push(shown);
            }
        }
    }
    (new, old)
}

/// The program to start: on Windows, a bare name (`npm`) is looked up with
/// the extensions of PATHEXT (`npm.cmd`), as a shell would; `Command` alone
/// only finds `.exe`.
fn resolve(program: &str, env: &Env) -> PathBuf {
    let as_given = PathBuf::from(program);
    if !cfg!(windows) || as_given.extension().is_some() || program.contains(['/', '\\']) {
        return as_given;
    }
    let var = |name: &str| {
        env.vars
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.clone())
    };
    let exts = var("PATHEXT").unwrap_or_else(|| ".COM;.EXE;.BAT;.CMD".into());
    let path = var("PATH").unwrap_or_default();
    for dir in std::iter::once(env.cwd.clone()).chain(std::env::split_paths(&path)) {
        for ext in exts.split(';').filter(|e| !e.is_empty()) {
            let candidate = dir.join(format!("{program}{}", ext.to_ascii_lowercase()));
            if candidate.is_file() {
                return candidate;
            }
        }
    }
    as_given
}

/// While it lives, Ctrl+C and Ctrl+Break reach the child (it shares the
/// console) but do not end this process, which then uploads what the tests
/// wrote. A handler that answers "handled" is not inherited by the child,
/// unlike ignoring the signal.
struct LetCtrlCThrough;

#[cfg(windows)]
unsafe extern "system" fn swallow(ctrl: u32) -> windows_sys::core::BOOL {
    use windows_sys::Win32::System::Console::{CTRL_BREAK_EVENT, CTRL_C_EVENT};
    (ctrl == CTRL_C_EVENT || ctrl == CTRL_BREAK_EVENT) as windows_sys::core::BOOL
}

impl LetCtrlCThrough {
    fn new() -> Self {
        #[cfg(windows)]
        // SAFETY: registers a handler that only returns a value.
        unsafe {
            windows_sys::Win32::System::Console::SetConsoleCtrlHandler(Some(swallow), 1);
        }
        LetCtrlCThrough
    }
}

impl Drop for LetCtrlCThrough {
    fn drop(&mut self) {
        #[cfg(windows)]
        // SAFETY: removes the handler registered in `new`.
        unsafe {
            windows_sys::Win32::System::Console::SetConsoleCtrlHandler(Some(swallow), 0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_older_than_the_command_are_left_out() {
        let dir = std::env::temp_dir().join(format!("pharos-cli-watch-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("reports")).unwrap();
        let old = dir.join("reports").join("old.xml");
        std::fs::write(&old, "<testsuites/>").unwrap();
        let an_hour_ago = SystemTime::now() - Duration::from_secs(3600);
        std::fs::File::options()
            .write(true)
            .open(&old)
            .unwrap()
            .set_modified(an_hour_ago)
            .unwrap();
        let start = SystemTime::now() - MTIME_SLACK;
        std::fs::write(dir.join("reports").join("new.xml"), "<testsuites/>").unwrap();
        let env = Env {
            cwd: dir.clone(),
            ..Default::default()
        };
        let (new, old) = collect(
            &["reports/*.xml".into(), "reports/new.xml".into()],
            &env,
            start,
        );
        assert_eq!(new.len(), 1, "{new:?}");
        assert!(new[0].ends_with("new.xml"));
        assert_eq!(old.len(), 1);
        assert!(old[0].ends_with("old.xml"));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn a_bare_name_is_found_with_pathext() {
        let dir = std::env::temp_dir().join(format!("pharos-cli-path-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("mytool.cmd"), "@exit /B 0").unwrap();
        let env = Env {
            vars: [
                ("Path".to_string(), dir.display().to_string()),
                ("PATHEXT".to_string(), ".EXE;.CMD".to_string()),
            ]
            .into_iter()
            .collect(),
            cwd: std::env::temp_dir(),
            ..Default::default()
        };
        assert_eq!(resolve("mytool", &env), dir.join("mytool.cmd"));
        assert_eq!(resolve("other.exe", &env), PathBuf::from("other.exe"));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
