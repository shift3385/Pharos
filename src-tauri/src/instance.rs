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

/// WebView2 arguments wry passes when the app sets none (wry 0.55,
/// `webview2/mod.rs`: its defaults plus autoplay). Setting our own replaces
/// them, so the E2E arguments repeat them.
#[cfg(debug_assertions)]
const WRY_DEFAULT_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";

/// Extra WebView2 arguments of the main window (ADR-0022): `None` for the
/// normal instance, so the window is exactly what tauri.conf.json describes.
/// Under an E2E profile of a debug build, WebView2 also opens a DevTools port
/// on a free port (`0`), which msedgedriver finds through `DevToolsActivePort`
/// in the profile's WebView2 folder. msedgedriver asks for it through
/// `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`, which WebView2 ignores in an
/// elevated process such as the CI runner's; only arguments the app passes
/// itself get through.
pub fn webview_browser_args() -> Option<String> {
    webview_browser_args_for(e2e_profile().as_deref())
}

#[cfg(debug_assertions)]
fn webview_browser_args_for(profile: Option<&str>) -> Option<String> {
    profile.map(|_| format!("{WRY_DEFAULT_ARGS} --remote-debugging-port=0"))
}

/// A release build never opens a DevTools port, whatever the environment.
#[cfg(not(debug_assertions))]
fn webview_browser_args_for(_profile: Option<&str>) -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normal_instance_keeps_the_default_webview_arguments() {
        assert_eq!(webview_browser_args_for(None), None);
    }

    #[cfg(debug_assertions)]
    #[test]
    fn e2e_profile_opens_a_free_devtools_port_and_keeps_the_defaults() {
        let args = webview_browser_args_for(Some("run1")).unwrap();
        assert!(args.ends_with(" --remote-debugging-port=0"), "{args}");
        assert!(args.starts_with(WRY_DEFAULT_ARGS), "{args}");
    }

    /// Runs with `cargo test --release`: even with a profile, no DevTools port.
    #[cfg(not(debug_assertions))]
    #[test]
    fn release_build_never_opens_a_devtools_port() {
        assert_eq!(webview_browser_args_for(Some("run1")), None);
        assert_eq!(e2e_profile(), None);
    }

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
