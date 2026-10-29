//! Which local instance this process is (ADR-0022). Normally the app uses its
//! data and log directories and its keychain accounts (`session`,
//! `ai-key.<provider>`). The E2E smoke (BASE-14) sets
//! `PHAROS_E2E_PROFILE=<name>` so a test run gets its own directories and
//! keychain accounts and never touches the user's data, cached session or AI
//! keys. Only the local database key (`db-key`, owned by db.rs) is shared. The
//! variable is honoured only in debug builds: a release build always runs as
//! the normal instance.

use std::path::PathBuf;

const PROFILE_VAR: &str = "PHAROS_E2E_PROFILE";

/// The active E2E profile name, if any (debug builds only).
pub fn e2e_profile() -> Option<String> {
    if !cfg!(debug_assertions) {
        return None;
    }
    valid_profile(std::env::var(PROFILE_VAR).ok().as_deref())
}

/// A profile name is 1–64 chars of `[A-Za-z0-9_-]`, so it is safe as a
/// directory and keychain account suffix; anything else is ignored.
fn valid_profile(raw: Option<&str>) -> Option<String> {
    let name = raw?.trim();
    let ok = !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    ok.then(|| name.to_string())
}

/// `base` for the normal instance, `base/e2e/<profile>` for an E2E profile.
pub fn scoped_dir(base: PathBuf) -> PathBuf {
    scoped_dir_for(base, e2e_profile().as_deref())
}

fn scoped_dir_for(base: PathBuf, profile: Option<&str>) -> PathBuf {
    match profile {
        Some(name) => base.join("e2e").join(name),
        None => base,
    }
}

/// The keychain account `base` for this instance: `base` itself, or
/// `<base>-e2e-<profile>` for an E2E profile. Every keychain account goes
/// through here.
pub fn account(base: &str) -> String {
    account_for(base, e2e_profile().as_deref())
}

fn account_for(base: &str, profile: Option<&str>) -> String {
    match profile {
        Some(name) => format!("{base}-e2e-{name}"),
        None => base.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_safe_profile_names() {
        assert_eq!(valid_profile(Some("run-42_a")), Some("run-42_a".into()));
        assert_eq!(valid_profile(Some("  ")), None);
        assert_eq!(valid_profile(None), None);
        assert_eq!(valid_profile(Some("../escape")), None);
        assert_eq!(valid_profile(Some("a b")), None);
        assert_eq!(valid_profile(Some(&"x".repeat(65))), None);
    }

    #[test]
    fn normal_instance_keeps_dirs_and_session() {
        let base = PathBuf::from("data");
        assert_eq!(scoped_dir_for(base.clone(), None), base);
        assert_eq!(account_for("session", None), "session");
        assert_eq!(account_for("ai-key.gemini", None), "ai-key.gemini");
    }

    #[test]
    fn e2e_profile_is_isolated() {
        let base = PathBuf::from("data");
        assert_eq!(
            scoped_dir_for(base, Some("run1")),
            PathBuf::from("data").join("e2e").join("run1")
        );
        assert_eq!(account_for("session", Some("run1")), "session-e2e-run1");
        assert_eq!(
            account_for("ai-key.openai", Some("run1")),
            "ai-key.openai-e2e-run1"
        );
    }
}
