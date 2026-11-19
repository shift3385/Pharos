//! Exit codes (ADR-0054 §2): stable, documented in the manual (chapter 20).
//! Changing what a code means is a breaking change (VERSIONING §6.6).

/// What the process exits with. `watch` (L3) exits with its command's code
/// instead when the command failed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Exit {
    /// Everything was uploaded (or `doctor` found nothing wrong).
    Ok = 0,
    /// An unexpected error.
    Internal = 1,
    /// A bad option, a file that is not there, local mode in CI…
    Usage = 2,
    /// No token or session, or not allowed.
    Auth = 3,
    /// No such project, run, cycle or case.
    NotFound = 4,
    /// The report is not valid, or its format is not read in this mode.
    Report = 5,
    /// The local database is in use (the app is open) or cannot be opened.
    DbInUse = 6,
    /// The server cannot be reached.
    Unreachable = 7,
    /// Some files were uploaded and others failed.
    Partial = 8,
}

impl Exit {
    pub fn code(self) -> i32 {
        self as i32
    }
}

/// A failure the user is told about: an exit code, a stable error code
/// printed in both languages (`db-in-use`), a message key (`i18n`) with its
/// arguments, and an optional detail (the core's own text, never secret).
#[derive(Clone, Debug, PartialEq)]
pub struct Failure {
    pub exit: Exit,
    pub code: String,
    pub key: &'static str,
    pub args: Vec<String>,
    pub detail: Option<String>,
}

impl Failure {
    pub fn new(exit: Exit, code: &str, key: &'static str) -> Self {
        Self {
            exit,
            code: code.to_string(),
            key,
            args: Vec::new(),
            detail: None,
        }
    }

    pub fn arg(mut self, value: impl Into<String>) -> Self {
        self.args.push(value.into());
        self
    }

    pub fn detail(mut self, detail: impl Into<String>) -> Self {
        let detail = detail.into();
        if !detail.trim().is_empty() {
            self.detail = Some(detail);
        }
        self
    }

    pub fn usage(code: &str, key: &'static str) -> Self {
        Self::new(Exit::Usage, code, key)
    }
}

/// Splits a core error (`"db-in-use: another Pharos process…"`) into its code
/// and its text. An error without a code prefix gives `None`.
pub fn core_code(error: &str) -> (Option<&str>, &str) {
    let is_code =
        |s: &str| s.contains('-') && s.chars().all(|c| c.is_ascii_lowercase() || c == '-');
    match error.split_once(':') {
        Some((code, rest)) if is_code(code) => (Some(code), rest.trim()),
        // A bare code, such as `run-closed`.
        None if is_code(error.trim()) => (Some(error.trim()), ""),
        _ => (None, error.trim()),
    }
}

/// The failure for an error of the core, by its code.
pub fn from_core(error: &str) -> Failure {
    // A write that stayed blocked after the core's own retries (SEC-05b, N5:
    // `db::DB_BUSY_ERROR`, or SQLite's own words from a single statement): the
    // CLI does not retry again.
    let lower = error.to_ascii_lowercase();
    if lower.starts_with("db-busy")
        || lower.contains("database is locked")
        || lower.contains("database is busy")
    {
        return Failure::new(Exit::DbInUse, "db-busy", "err.db-busy").detail(error.trim());
    }
    let (code, text) = core_code(error);
    let (exit, key) = match code {
        Some("db-in-use") => (Exit::DbInUse, "err.db-in-use"),
        Some(c) if c.starts_with("db-key") => (Exit::DbInUse, "err.db-key"),
        Some("project-not-found") => (Exit::NotFound, "err.project-not-found-core"),
        Some("cycle-not-found") => (Exit::NotFound, "err.cycle-not-found"),
        Some("run-closed") => (Exit::NotFound, "err.run-closed"),
        Some("ambiguous-project") => (Exit::Usage, "err.ambiguous-project"),
        Some(
            "unknown-format"
            | "invalid-report"
            | "unsupported-version"
            | "too-large"
            | "invalid-shard"
            | "test-key-required"
            | "steps-too-many",
        ) => (Exit::Report, "err.invalid-report"),
        None if error.trim() == "run not found" => (Exit::NotFound, "err.run-not-found"),
        _ => (Exit::Internal, "err.internal"),
    };
    let code = match (code, key) {
        (Some(c), _) => c.to_string(),
        (None, "err.run-not-found") => "run-not-found".to_string(),
        _ => "internal".to_string(),
    };
    Failure::new(exit, &code, key).detail(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn core_errors_map_to_their_exit_codes() {
        let f = from_core("db-in-use: another Pharos process (the app or the CLI) is using it");
        assert_eq!((f.exit, f.code.as_str()), (Exit::DbInUse, "db-in-use"));
        assert_eq!(from_core("db-key-missing: …").exit, Exit::DbInUse);
        let f =
            from_core("db-busy: another Pharos process kept the local database busy; try again");
        assert_eq!((f.exit, f.code.as_str()), (Exit::DbInUse, "db-busy"));
        let f = from_core("database is locked");
        assert_eq!((f.exit, f.code.as_str()), (Exit::DbInUse, "db-busy"));
        assert_eq!(from_core("run-closed").exit, Exit::NotFound);
        assert_eq!(from_core("run not found").code, "run-not-found");
        assert_eq!(
            from_core("invalid-report: missing field `name`").exit,
            Exit::Report
        );
        let f = from_core("disk I/O error: something");
        assert_eq!((f.exit, f.code.as_str()), (Exit::Internal, "internal"));
    }

    #[test]
    fn the_codes_are_the_documented_ones() {
        let codes: Vec<i32> = [
            Exit::Ok,
            Exit::Internal,
            Exit::Usage,
            Exit::Auth,
            Exit::NotFound,
            Exit::Report,
            Exit::DbInUse,
            Exit::Unreachable,
            Exit::Partial,
        ]
        .iter()
        .map(|e| e.code())
        .collect();
        assert_eq!(codes, (0..=8).collect::<Vec<_>>());
    }
}
