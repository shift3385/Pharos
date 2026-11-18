//! Where the app keeps its data, found without Tauri (CORE-01, ADR-0050), so
//! the CLI opens the same database as the desktop app.
//!
//! Tauri's `app_data_dir` is the OS data folder plus the bundle identifier
//! (`tauri.conf.json`): `%APPDATA%\com.pharos.desktop` on Windows. An E2E
//! profile (debug builds only) gets its own folder below it (instance.rs).

use std::path::PathBuf;

/// The bundle identifier in `tauri.conf.json` (checked by a test).
pub const IDENTIFIER: &str = "com.pharos.desktop";

/// The data folder the desktop app uses on this computer, for this instance.
pub fn default_data_dir() -> Result<PathBuf, String> {
    Ok(crate::instance::scoped_dir(os_data_dir()?.join(IDENTIFIER)))
}

/// The OS data folder, as Tauri resolves it.
fn os_data_dir() -> Result<PathBuf, String> {
    let var = |name: &str| std::env::var_os(name).filter(|v| !v.is_empty());
    #[cfg(windows)]
    {
        var("APPDATA")
            .map(PathBuf::from)
            .ok_or_else(|| "APPDATA is not set: cannot find the Pharos data folder".to_string())
    }
    #[cfg(target_os = "macos")]
    {
        var("HOME")
            .map(|home| PathBuf::from(home).join("Library/Application Support"))
            .ok_or_else(|| "HOME is not set: cannot find the Pharos data folder".to_string())
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| var("HOME").map(|home| PathBuf::from(home).join(".local/share")))
            .ok_or_else(|| "HOME is not set: cannot find the Pharos data folder".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_identifier_is_the_one_in_tauri_conf() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(conf["identifier"], IDENTIFIER);
    }

    #[test]
    fn the_data_dir_ends_with_the_identifier() {
        let dir = default_data_dir().unwrap();
        assert!(
            dir.components().any(|c| c.as_os_str() == IDENTIFIER),
            "{}",
            dir.display()
        );
    }
}
