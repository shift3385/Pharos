//! Configuration and mode (ADR-0054 §1, §3). Precedence: option > environment
//! > `pharos.toml` of the project (searched upwards from the current folder)
//! > the user's config > defaults. No file ever holds a token.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::args::Opts;
use crate::exit::Failure;

pub const PROJECT_FILE: &str = "pharos.toml";

/// What the process sees of its environment, so tests give their own.
#[derive(Clone, Debug, Default)]
pub struct Env {
    pub vars: HashMap<String, String>,
    pub cwd: PathBuf,
    /// Where the user config lives (`%APPDATA%\Pharos\cli`), if known.
    pub user_config_dir: Option<PathBuf>,
    /// stdout is a terminal (colors).
    pub tty: bool,
    /// What stdin holds, for `--token-stdin` in tests; `None` reads the real
    /// stdin when asked.
    pub stdin: Option<String>,
}

impl Env {
    pub fn from_process() -> Env {
        use std::io::IsTerminal;
        let vars: HashMap<String, String> = std::env::vars().collect();
        let cwd = std::env::current_dir().unwrap_or_default();
        let user_config_dir = user_config_dir(&vars);
        Env {
            vars,
            cwd,
            user_config_dir,
            tty: std::io::stdout().is_terminal(),
            stdin: None,
        }
    }

    /// A variable, when set and not empty.
    pub fn var(&self, name: &str) -> Option<String> {
        self.vars
            .get(name)
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
    }

    /// Running in CI (`CI=true`, which GitHub Actions and most CIs set).
    pub fn is_ci(&self) -> bool {
        let yes = |name: &str| {
            self.var(name)
                .is_some_and(|v| v.eq_ignore_ascii_case("true") || v == "1")
        };
        yes("CI") || yes("GITHUB_ACTIONS")
    }
}

fn user_config_dir(vars: &HashMap<String, String>) -> Option<PathBuf> {
    let var = |n: &str| vars.get(n).filter(|v| !v.is_empty()).map(PathBuf::from);
    if cfg!(windows) {
        var("APPDATA").map(|d| d.join("Pharos").join("cli"))
    } else {
        var("XDG_CONFIG_HOME")
            .or_else(|| var("HOME").map(|h| h.join(".config")))
            .map(|d| d.join("pharos"))
    }
}

/// The keys a config file may have.
#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[serde(default)]
pub struct FileConfig {
    pub project: Option<String>,
    pub server: Option<String>,
    pub format: Option<String>,
    pub report: Option<Vec<String>>,
    pub cycle: Option<String>,
    pub config: Option<String>,
    pub lang: Option<String>,
}

/// The config files found: the project's `pharos.toml` and the user's.
#[derive(Clone, Debug, Default)]
pub struct Config {
    pub project_path: Option<PathBuf>,
    pub project: FileConfig,
    pub user_path: Option<PathBuf>,
    pub user: FileConfig,
}

impl Config {
    pub fn load(env: &Env) -> Result<Config, Failure> {
        let mut cfg = Config::default();
        if let Some(path) = find_upwards(&env.cwd, PROJECT_FILE) {
            cfg.project = read_file(&path)?;
            cfg.project_path = Some(path);
        }
        if let Some(dir) = &env.user_config_dir {
            let path = dir.join("config.toml");
            if path.is_file() {
                cfg.user = read_file(&path)?;
                cfg.user_path = Some(path);
            }
        }
        Ok(cfg)
    }

    fn pick<T: Clone>(&self, f: impl Fn(&FileConfig) -> Option<T>) -> Option<T> {
        f(&self.project).or_else(|| f(&self.user))
    }

    /// The project: `--project`, `PHAROS_PROJECT`, then the files.
    pub fn project(&self, opts: &Opts, env: &Env) -> Option<String> {
        opts.project
            .clone()
            .or_else(|| env.var("PHAROS_PROJECT"))
            .or_else(|| self.pick(|c| c.project.clone()))
    }

    pub fn cycle(&self, opts: &Opts) -> Option<String> {
        opts.cycle
            .clone()
            .or_else(|| self.pick(|c| c.cycle.clone()))
    }

    pub fn configuration(&self, opts: &Opts) -> Option<String> {
        opts.config
            .clone()
            .or_else(|| self.pick(|c| c.config.clone()))
    }

    pub fn lang(&self, env: &Env) -> Option<String> {
        env.var("PHAROS_LANG")
            .or_else(|| self.pick(|c| c.lang.clone()))
    }

    /// The server: `PHAROS_URL`, then the files (`--server` is handled by
    /// `mode`).
    pub fn server(&self, env: &Env) -> Option<String> {
        env.var("PHAROS_URL")
            .or_else(|| self.pick(|c| c.server.clone()))
    }
}

/// `name` in `start` or the nearest folder above it.
fn find_upwards(start: &Path, name: &str) -> Option<PathBuf> {
    let mut dir = Some(start);
    while let Some(d) = dir {
        let candidate = d.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
        dir = d.parent();
    }
    None
}

/// Reads a config file. A key that looks like a token (`token`,
/// `api_token`…) anywhere in it is refused: tokens never go in files.
fn read_file(path: &Path) -> Result<FileConfig, Failure> {
    let shown = path.display().to_string();
    let text = std::fs::read_to_string(path).map_err(|e| {
        Failure::usage("bad-config", "err.bad-config")
            .arg(shown.as_str())
            .arg(e.to_string())
    })?;
    let table: toml::Table = toml::from_str(&text).map_err(|e| {
        Failure::usage("bad-config", "err.bad-config")
            .arg(shown.as_str())
            .arg(e.message().to_string())
    })?;
    if has_token_key(&table) {
        return Err(Failure::usage("token-in-file", "err.token-in-file").arg(shown));
    }
    toml::Value::Table(table)
        .try_into()
        .map_err(|e: toml::de::Error| {
            Failure::usage("bad-config", "err.bad-config")
                .arg(shown.as_str())
                .arg(e.message().to_string())
        })
}

fn has_token_key(table: &toml::Table) -> bool {
    table.iter().any(|(k, v)| {
        k.to_ascii_lowercase().contains("token")
            || matches!(v, toml::Value::Table(t) if has_token_key(t))
    })
}

/// Where an upload goes.
#[derive(Clone, Debug, PartialEq)]
pub enum Mode {
    /// Into the desktop's database on this computer.
    Local,
    /// To this server, through the API v1.
    Remote(String),
}

/// The mode (ADR-0054 §1): `--local` / `--server`; then a server in the
/// environment (`PHAROS_URL`, or a `PHAROS_TOKEN`) or in a config file; else
/// local. Local mode is refused in CI: there is no desktop Pharos there.
pub fn mode(opts: &Opts, env: &Env, cfg: &Config) -> Result<Mode, Failure> {
    if opts.local && opts.server.is_some() {
        return Err(Failure::usage("mode-conflict", "err.mode-conflict"));
    }
    let mode = if opts.local {
        Mode::Local
    } else if let Some(server) = opts.server.clone().or_else(|| cfg.server(env)) {
        Mode::Remote(server)
    } else if env.var("PHAROS_TOKEN").is_some() {
        Mode::Remote(String::new())
    } else {
        Mode::Local
    };
    if mode == Mode::Local && env.is_ci() {
        return Err(Failure::usage("local-in-ci", "err.local-in-ci"));
    }
    Ok(mode)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pharos-cli-cfg-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn env_in(dir: &Path, vars: &[(&str, &str)]) -> Env {
        Env {
            vars: vars
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            cwd: dir.to_path_buf(),
            user_config_dir: None,
            tty: false,
            stdin: None,
        }
    }

    #[test]
    fn the_project_file_is_found_upwards_and_options_win() {
        let root = temp_dir();
        std::fs::write(
            root.join(PROJECT_FILE),
            "project = \"PAG\"\ncycle = \"CYC-1\"\n",
        )
        .unwrap();
        let sub = root.join("a").join("b");
        std::fs::create_dir_all(&sub).unwrap();
        let env = env_in(&sub, &[]);
        let cfg = Config::load(&env).unwrap();
        assert_eq!(
            cfg.project_path.as_deref(),
            Some(root.join(PROJECT_FILE).as_path())
        );
        assert_eq!(cfg.project(&Opts::default(), &env).as_deref(), Some("PAG"));
        let env = env_in(&sub, &[("PHAROS_PROJECT", "ENV")]);
        assert_eq!(cfg.project(&Opts::default(), &env).as_deref(), Some("ENV"));
        let opts = Opts {
            project: Some("OPT".into()),
            ..Default::default()
        };
        assert_eq!(cfg.project(&opts, &env).as_deref(), Some("OPT"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_token_in_a_file_is_refused() {
        for text in ["token = \"phr_prj_x\"", "[auth]\napi_token = \"x\""] {
            let root = temp_dir();
            std::fs::write(root.join(PROJECT_FILE), text).unwrap();
            let err = Config::load(&env_in(&root, &[])).unwrap_err();
            assert_eq!(err.code, "token-in-file", "{text}");
            std::fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn the_mode_follows_the_rule_and_local_is_refused_in_ci() {
        let root = temp_dir();
        let cfg = Config::default();
        let none = Opts::default();
        assert_eq!(mode(&none, &env_in(&root, &[]), &cfg).unwrap(), Mode::Local);
        let remote = env_in(&root, &[("PHAROS_URL", "https://pharos.example.com")]);
        assert_eq!(
            mode(&none, &remote, &cfg).unwrap(),
            Mode::Remote("https://pharos.example.com".into())
        );
        let local = Opts {
            local: true,
            ..Default::default()
        };
        assert_eq!(mode(&local, &remote, &cfg).unwrap(), Mode::Local);
        let ci = env_in(&root, &[("CI", "true")]);
        assert_eq!(mode(&none, &ci, &cfg).unwrap_err().code, "local-in-ci");
        let both = Opts {
            local: true,
            server: Some("x".into()),
            ..Default::default()
        };
        assert_eq!(mode(&both, &ci, &cfg).unwrap_err().code, "mode-conflict");
        std::fs::remove_dir_all(root).unwrap();
    }
}
