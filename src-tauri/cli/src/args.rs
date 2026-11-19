//! Command-line arguments (ADR-0054 §2). Parsed by hand: a dozen options, the
//! help in two languages, and no new dependency.

use crate::exit::Failure;

#[derive(Clone, Debug, PartialEq)]
pub enum Command {
    Upload,
    Projects,
    Doctor,
    /// `help [command]`, `--help`, or no arguments.
    Help(Option<String>),
    Version,
    /// `login`: stores a token for a server in the OS keychain.
    Login,
    /// `logout`: removes it.
    Logout,
    /// `run close [RUN-n]` (or `--external-id`).
    RunClose(Option<String>),
    /// A command of a later PR (`watch`).
    Later(String),
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Opts {
    pub project: Option<String>,
    pub format: Option<String>,
    pub run: Option<String>,
    pub run_name: Option<String>,
    pub external_id: Option<String>,
    pub cycle: Option<String>,
    pub config: Option<String>,
    pub case: Option<String>,
    pub local: bool,
    pub server: Option<String>,
    pub data_dir: Option<String>,
    pub dry_run: bool,
    pub allow_duplicate: bool,
    pub json: bool,
    pub lang: Option<String>,
    pub quiet: bool,
    pub no_color: bool,
    pub token_stdin: bool,
    /// `run close --status completed|aborted`.
    pub status: Option<String>,
    /// `upload --close`: close the run after the last file.
    pub close: bool,
    /// The files and patterns of `upload`.
    pub files: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Parsed {
    pub command: Command,
    pub opts: Opts,
}

const COMMANDS: [&str; 7] = [
    "upload", "projects", "doctor", "watch", "login", "logout", "run",
];

/// The language asked on the command line, read before parsing the rest so
/// that a parse error is already in that language.
pub fn lang_flag(argv: &[String]) -> Option<String> {
    let mut it = argv.iter();
    while let Some(a) = it.next() {
        if a == "--" {
            break;
        }
        if let Some(v) = a.strip_prefix("--lang=") {
            return Some(v.to_string());
        }
        if a == "--lang" {
            return it.next().cloned();
        }
    }
    None
}

/// Parses `argv` (without the program name).
pub fn parse(argv: &[String]) -> Result<Parsed, Failure> {
    let mut opts = Opts::default();
    let mut command: Option<String> = None;
    let mut help = false;
    let mut positional: Vec<String> = Vec::new();
    let mut i = 0;
    while i < argv.len() {
        let arg = &argv[i];
        i += 1;
        if arg == "--" {
            positional.extend(argv[i..].iter().cloned());
            break;
        }
        if arg == "--version" || arg == "-V" {
            return Ok(Parsed {
                command: Command::Version,
                opts,
            });
        }
        if arg == "--help" || arg == "-h" {
            help = true;
            continue;
        }
        if arg.starts_with('-') && arg.len() > 1 {
            let (name, inline) = match arg.split_once('=') {
                Some((n, v)) if n.starts_with("--") => (n, Some(v.to_string())),
                _ => (arg.as_str(), None),
            };
            let mut value = |opt: &str| -> Result<String, Failure> {
                if let Some(v) = inline.clone() {
                    return Ok(v);
                }
                match argv.get(i) {
                    Some(v) if !v.starts_with("--") => {
                        i += 1;
                        Ok(v.clone())
                    }
                    _ => Err(Failure::usage("missing-value", "err.missing-value").arg(opt)),
                }
            };
            match name {
                "-p" | "--project" => opts.project = Some(value("--project")?),
                "-f" | "--format" => opts.format = Some(value("--format")?),
                "--run" => opts.run = Some(value("--run")?),
                "--run-name" => opts.run_name = Some(value("--run-name")?),
                "--external-id" => opts.external_id = Some(value("--external-id")?),
                "--cycle" => opts.cycle = Some(value("--cycle")?),
                "--config" => opts.config = Some(value("--config")?),
                "--case" => opts.case = Some(value("--case")?),
                "--server" => opts.server = Some(value("--server")?),
                "--data-dir" => opts.data_dir = Some(value("--data-dir")?),
                "--lang" => opts.lang = Some(value("--lang")?),
                "--local" => opts.local = true,
                "--dry-run" => opts.dry_run = true,
                "--allow-duplicate" => opts.allow_duplicate = true,
                "--json" => opts.json = true,
                "-q" | "--quiet" => opts.quiet = true,
                "--no-color" => opts.no_color = true,
                "--token-stdin" => opts.token_stdin = true,
                "--status" => opts.status = Some(value("--status")?),
                "--close" => opts.close = true,
                // Never a token on the command line (ADR-0054 §3).
                "--token" => return Err(Failure::usage("token-flag", "err.token-flag")),
                other => {
                    let cmd = command.clone().unwrap_or_default();
                    return Err(Failure::usage("unknown-option", "err.unknown-option")
                        .arg(other)
                        .arg(cmd));
                }
            }
            continue;
        }
        if command.is_none() {
            command = Some(arg.clone());
        } else {
            positional.push(arg.clone());
        }
    }
    let command = match command.as_deref() {
        None => Command::Help(None),
        Some("help") => Command::Help(positional.first().cloned()),
        Some(_) if help => Command::Help(command.clone()),
        Some("upload") => {
            opts.files = positional;
            Command::Upload
        }
        Some(c @ ("projects" | "doctor")) => {
            if let Some(extra) = positional.first() {
                return Err(Failure::usage("unknown-option", "err.unknown-option")
                    .arg(extra.as_str())
                    .arg(c));
            }
            if c == "projects" {
                Command::Projects
            } else {
                Command::Doctor
            }
        }
        Some("login") => Command::Login,
        Some("logout") => Command::Logout,
        Some("run") => match positional.as_slice() {
            [verb] if verb == "close" => Command::RunClose(None),
            [verb, key] if verb == "close" => Command::RunClose(Some(key.clone())),
            _ => {
                let got = positional.join(" ");
                return Err(Failure::usage("unknown-command", "err.unknown-command")
                    .arg(format!("run {got}")));
            }
        },
        Some(c) if COMMANDS.contains(&c) => Command::Later(c.to_string()),
        Some(other) => {
            return Err(Failure::usage("unknown-command", "err.unknown-command").arg(other))
        }
    };
    Ok(Parsed { command, opts })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(args: &[&str]) -> Result<Parsed, Failure> {
        parse(&args.iter().map(|s| s.to_string()).collect::<Vec<_>>())
    }

    #[test]
    fn upload_takes_files_and_options_in_any_order() {
        let got = p(&[
            "upload",
            "a.json",
            "-p",
            "PAG",
            "reports/*.json",
            "--run-name=CI #7",
            "--dry-run",
        ])
        .unwrap();
        assert_eq!(got.command, Command::Upload);
        assert_eq!(got.opts.files, vec!["a.json", "reports/*.json"]);
        assert_eq!(got.opts.project.as_deref(), Some("PAG"));
        assert_eq!(got.opts.run_name.as_deref(), Some("CI #7"));
        assert!(got.opts.dry_run);
    }

    #[test]
    fn a_token_is_never_an_option() {
        let err = p(&["upload", "a.json", "--token", "phr_prj_x"]).unwrap_err();
        assert_eq!(err.code, "token-flag");
        assert_eq!(
            p(&["upload", "--token=phr_prj_x"]).unwrap_err().code,
            "token-flag"
        );
    }

    #[test]
    fn login_logout_and_run_close() {
        assert_eq!(
            p(&["login", "--server", "https://x"]).unwrap().command,
            Command::Login
        );
        assert_eq!(p(&["logout"]).unwrap().command, Command::Logout);
        let got = p(&["run", "close", "RUN-7", "-p", "PAG", "--status", "aborted"]).unwrap();
        assert_eq!(got.command, Command::RunClose(Some("RUN-7".into())));
        assert_eq!(got.opts.status.as_deref(), Some("aborted"));
        assert_eq!(
            p(&["run", "close", "--external-id", "gh:1"])
                .unwrap()
                .command,
            Command::RunClose(None)
        );
        assert_eq!(p(&["run", "open"]).unwrap_err().code, "unknown-command");
        assert!(p(&["upload", "a.xml", "--close"]).unwrap().opts.close);
    }

    #[test]
    fn help_version_and_errors() {
        assert_eq!(p(&[]).unwrap().command, Command::Help(None));
        assert_eq!(
            p(&["help", "upload"]).unwrap().command,
            Command::Help(Some("upload".into()))
        );
        assert_eq!(
            p(&["upload", "--help"]).unwrap().command,
            Command::Help(Some("upload".into()))
        );
        assert_eq!(p(&["--version"]).unwrap().command, Command::Version);
        assert_eq!(
            p(&["watch", "--", "npm", "test"]).unwrap().command,
            Command::Later("watch".into())
        );
        assert_eq!(p(&["frobnicate"]).unwrap_err().code, "unknown-command");
        assert_eq!(
            p(&["upload", "--bogus"]).unwrap_err().code,
            "unknown-option"
        );
        assert_eq!(
            p(&["upload", "--project"]).unwrap_err().code,
            "missing-value"
        );
        assert_eq!(
            p(&["projects", "extra"]).unwrap_err().code,
            "unknown-option"
        );
        assert_eq!(
            lang_flag(&["upload".into(), "--lang".into(), "en".into()]).as_deref(),
            Some("en")
        );
    }
}
