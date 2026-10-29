//! Download folder for exports (UX-02). Every file the app hands to the user
//! (plan and case .xlsx/.pdf, `.feature`, project ZIPs, the traceability
//! matrix, templates, planner attachments, the diagnostic bundle) is written
//! here by `download_save` instead of going through the webview's own download
//! handling, which always lands in the OS Downloads folder.
//!
//! The webview never chooses a path: the folder is set only through the native
//! picker (`download_dir_pick`, opened from Rust with rfd, so the capability
//! keeps no dialog permission) and remembered in `downloads.json` under the
//! instance's config dir. Without a chosen folder, or when the chosen one was
//! removed, files go to the OS Downloads folder; the full path is returned so
//! the UI always says where a file went.
//!
//! The file name the webview sends is reduced to a single safe component, an
//! existing file is never overwritten (`name (2).ext`) and the write is atomic.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::ipc::{InvokeBody, Request};
use tauri::State;

/// Header carrying the percent-encoded file name of a `download_save` call.
const NAME_HEADER: &str = "x-pharos-filename";
/// Longest file name kept (in chars), well under Windows' 255 per component.
const MAX_NAME: usize = 180;

pub struct Downloads {
    /// `downloads.json`, or `None` when the config dir cannot be resolved.
    prefs_file: Option<PathBuf>,
    /// The OS Downloads folder, used while no folder was chosen.
    default_dir: Option<PathBuf>,
    chosen: Mutex<Option<PathBuf>>,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Prefs {
    download_dir: Option<PathBuf>,
}

/// What the settings screen shows: the chosen folder (or the OS Downloads
/// folder when `custom` is false) and whether the chosen one has disappeared.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadDirInfo {
    path: Option<String>,
    custom: bool,
    missing: bool,
}

impl Downloads {
    pub fn load(prefs_file: Option<PathBuf>, default_dir: Option<PathBuf>) -> Self {
        let chosen = prefs_file
            .as_deref()
            .and_then(|f| fs::read_to_string(f).ok())
            .and_then(|s| serde_json::from_str::<Prefs>(&s).ok())
            .and_then(|p| p.download_dir);
        Self {
            prefs_file,
            default_dir,
            chosen: Mutex::new(chosen),
        }
    }

    fn chosen(&self) -> Option<PathBuf> {
        self.chosen.lock().map(|c| c.clone()).unwrap_or(None)
    }

    fn info(&self) -> DownloadDirInfo {
        let chosen = self.chosen();
        let custom = chosen.is_some();
        let missing = chosen.as_deref().is_some_and(|d| !d.is_dir());
        let path = chosen
            .or_else(|| self.default_dir.clone())
            .map(|p| p.to_string_lossy().into_owned());
        DownloadDirInfo {
            path,
            custom,
            missing,
        }
    }

    fn set(&self, dir: Option<PathBuf>) -> Result<(), String> {
        if let Some(file) = &self.prefs_file {
            if let Some(parent) = file.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let prefs = Prefs {
                download_dir: dir.clone(),
            };
            let json = serde_json::to_string_pretty(&prefs).map_err(|e| e.to_string())?;
            write_atomic(file, json.as_bytes())?;
        }
        *self.chosen.lock().map_err(|e| e.to_string())? = dir;
        Ok(())
    }

    /// The folder to write into: the chosen one, or the OS Downloads folder
    /// when none was chosen or the chosen one was removed or renamed (the
    /// settings screen flags it as missing).
    fn target_dir(&self) -> Result<PathBuf, String> {
        if let Some(dir) = self.chosen() {
            if dir.is_dir() {
                return Ok(dir);
            }
            tracing::warn!("chosen download folder is missing; using Downloads");
        }
        let dir = self.default_dir.clone().ok_or("download-dir-unavailable")?;
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(dir)
    }
}

/// Reduces a name from the webview to one safe file-name component: no path
/// separators or characters Windows rejects, no trailing dots or spaces, no
/// reserved device names, bounded length.
fn sanitize_name(raw: &str) -> String {
    let last = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let mut name: String = last
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .take(MAX_NAME)
        .collect();
    name = name.trim().trim_end_matches(['.', ' ']).to_string();
    if name.is_empty() || name.chars().all(|c| c == '.') {
        return "download".into();
    }
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && stem.as_bytes()[3].is_ascii_digit());
    if reserved {
        name.insert(0, '_');
    }
    name
}

/// `dir/name`, or `dir/stem (n).ext` for the first `n` that does not exist,
/// so an earlier export is never overwritten.
fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .expect("an unused name exists")
}

/// Writes `bytes` to `<path>.part`, fsyncs it and renames it over `path`, so a
/// crash never leaves a truncated file under the final name.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut pending = path.as_os_str().to_owned();
    pending.push(".part");
    let pending = PathBuf::from(pending);
    let result = (|| {
        let mut file = fs::File::create(&pending)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&pending, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&pending);
    }
    result.map_err(|e| e.to_string())
}

/// Saves `bytes` as `name` in `dir`; returns the full path written.
fn save_in(dir: &Path, name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let path = unique_path(dir, &sanitize_name(name));
    write_atomic(&path, bytes)?;
    Ok(path)
}

/// Decodes the `encodeURIComponent` form of the file-name header.
fn percent_decode(raw: &str) -> Result<String, String> {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = raw.get(i + 1..i + 3).ok_or("bad file name")?;
            out.push(u8::from_str_radix(hex, 16).map_err(|_| "bad file name")?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "bad file name".into())
}

#[tauri::command]
pub fn download_dir_get(downloads: State<Downloads>) -> DownloadDirInfo {
    downloads.info()
}

/// Opens the native folder picker, modal to the main window. `None` when the
/// user cancels.
#[cfg(windows)]
#[tauri::command]
pub async fn download_dir_pick(
    window: tauri::WebviewWindow,
    downloads: State<'_, Downloads>,
) -> Result<Option<DownloadDirInfo>, String> {
    let mut dialog = rfd::AsyncFileDialog::new().set_parent(&window);
    if let Some(dir) = downloads.info().path {
        dialog = dialog.set_directory(dir);
    }
    // rfd runs the dialog on its own thread; the event loop stays free.
    let Some(picked) = dialog.pick_folder().await else {
        return Ok(None);
    };
    downloads.set(Some(picked.path().to_path_buf()))?;
    Ok(Some(downloads.info()))
}

/// Pharos ships for Windows; elsewhere there is no picker (files still go to
/// the OS Downloads folder).
#[cfg(not(windows))]
#[tauri::command]
pub async fn download_dir_pick() -> Result<Option<DownloadDirInfo>, String> {
    Err("folder picker not available on this platform".into())
}

/// Forgets the chosen folder: files go to the OS Downloads folder again.
#[tauri::command]
pub fn download_dir_reset(downloads: State<Downloads>) -> Result<DownloadDirInfo, String> {
    downloads.set(None)?;
    Ok(downloads.info())
}

/// Saves the raw request body as a file in the download folder; the name comes
/// in the `x-pharos-filename` header. Returns the full path written.
#[tauri::command]
pub fn download_save(downloads: State<Downloads>, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".into());
    };
    let name = request
        .headers()
        .get(NAME_HEADER)
        .and_then(|v| v.to_str().ok())
        .ok_or("missing file name")?;
    let name = percent_decode(name)?;
    let path = save_in(&downloads.target_dir()?, &name, bytes)?;
    tracing::info!(bytes = bytes.len(), "export saved to the download folder");
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pharos-dl-{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn sanitize_keeps_a_single_safe_component() {
        assert_eq!(sanitize_name("Plan v1.0.xlsx"), "Plan v1.0.xlsx");
        assert_eq!(sanitize_name("../../evil.exe"), "evil.exe");
        assert_eq!(sanitize_name("C:\\Windows\\x.dll"), "x.dll");
        assert_eq!(sanitize_name("a:b*c?.pdf"), "a_b_c_.pdf");
        assert_eq!(sanitize_name("name. . "), "name");
        assert_eq!(sanitize_name(".."), "download");
        assert_eq!(sanitize_name(""), "download");
        assert_eq!(sanitize_name("CON.txt"), "_CON.txt");
        assert_eq!(sanitize_name("com3"), "_com3");
        assert_eq!(sanitize_name("COMMON.txt"), "COMMON.txt");
        assert_eq!(sanitize_name(&"x".repeat(400)).chars().count(), MAX_NAME);
    }

    #[test]
    fn decodes_encode_uri_component() {
        assert_eq!(
            percent_decode("Plan%20de%20pruebas%20%C3%B1.xlsx").unwrap(),
            "Plan de pruebas ñ.xlsx"
        );
        assert!(percent_decode("bad%2").is_err());
        assert!(percent_decode("bad%zz").is_err());
    }

    #[test]
    fn never_overwrites_an_existing_file() {
        let dir = temp_dir("unique");
        let first = save_in(&dir, "report.pdf", b"one").unwrap();
        let second = save_in(&dir, "report.pdf", b"two").unwrap();
        let third = save_in(&dir, "report.pdf", b"three").unwrap();
        assert_eq!(first.file_name().unwrap(), "report.pdf");
        assert_eq!(second.file_name().unwrap(), "report (2).pdf");
        assert_eq!(third.file_name().unwrap(), "report (3).pdf");
        assert_eq!(fs::read(&first).unwrap(), b"one");
        assert_eq!(fs::read(&third).unwrap(), b"three");
        assert!(fs::read_dir(&dir).unwrap().all(|e| !e
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".part")));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn writes_only_inside_the_folder() {
        let dir = temp_dir("inside");
        let path = save_in(&dir, "..\\..\\escape.txt", b"x").unwrap();
        assert_eq!(path.parent().unwrap(), dir);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn chosen_folder_persists_and_resets() {
        let config = temp_dir("prefs");
        let downloads_dir = temp_dir("default");
        let chosen = temp_dir("chosen");
        let prefs = config.join("downloads.json");

        let d = Downloads::load(Some(prefs.clone()), Some(downloads_dir.clone()));
        assert!(!d.info().custom);
        assert_eq!(d.target_dir().unwrap(), downloads_dir);

        d.set(Some(chosen.clone())).unwrap();
        let reloaded = Downloads::load(Some(prefs.clone()), Some(downloads_dir.clone()));
        assert!(reloaded.info().custom);
        assert_eq!(reloaded.target_dir().unwrap(), chosen);

        reloaded.set(None).unwrap();
        let again = Downloads::load(Some(prefs), Some(downloads_dir.clone()));
        assert!(!again.info().custom);
        assert_eq!(again.target_dir().unwrap(), downloads_dir);

        for dir in [config, downloads_dir, chosen] {
            fs::remove_dir_all(dir).unwrap();
        }
    }

    #[test]
    fn a_removed_folder_is_flagged_and_falls_back_to_downloads() {
        let config = temp_dir("gone");
        let chosen = temp_dir("gone-chosen");
        let d = Downloads::load(Some(config.join("downloads.json")), Some(config.clone()));
        d.set(Some(chosen.clone())).unwrap();
        assert!(!d.info().missing);
        fs::remove_dir_all(&chosen).unwrap();
        let info = d.info();
        assert!(info.custom && info.missing);
        assert_eq!(d.target_dir().unwrap(), config);
        fs::remove_dir_all(config).unwrap();
    }
}
