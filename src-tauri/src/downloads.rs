//! Download folder for exports (UX-02). Every file the app hands to the user
//! (plan and case .xlsx/.pdf, `.feature`, project ZIPs, the traceability
//! matrix, templates, planner attachments, the diagnostic bundle) is written
//! here by `download_save` instead of going through the webview's own download
//! handling, which always lands in the OS Downloads folder.
//!
//! The webview never chooses a path: the folder is set only through the native
//! picker (`download_dir_pick`, opened from Rust with rfd, so the capability
//! keeps no dialog permission) and remembered in `downloads.json` under the
//! instance's config dir: one folder per Windows account and instance, not per
//! Pharos user (ADR-0025). Without a chosen folder files go to the OS Downloads
//! folder; when the chosen one is missing or cannot be written they go there
//! too, and the result says so. The full path is always returned so the UI
//! says where a file went.
//!
//! The file name the webview sends is reduced to a single safe component, an
//! existing file is never overwritten (`name (2).ext`, reserved atomically even
//! with concurrent saves) and the write is atomic. Planner attachments get
//! Mark-of-the-Web, as a browser download would.

use std::fs;
use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::ipc::{InvokeBody, Request};
use tauri::State;

/// Header carrying the percent-encoded file name of a `download_save` call.
const NAME_HEADER: &str = "x-pharos-filename";
/// Header (`1`) asking `download_save` to add Mark-of-the-Web to the file.
const UNTRUSTED_HEADER: &str = "x-pharos-untrusted";
/// Longest file name kept (in chars), well under Windows' 255 per component.
const MAX_NAME: usize = 180;
/// Longest extension kept whole when a long name is cut (".feature", ".xlsx").
const MAX_EXT: usize = 16;
/// Most " (n)" copies of one name before giving up (small in tests).
const MAX_COPIES: u32 = if cfg!(test) { 5 } else { 10_000 };

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

    /// The OS Downloads folder, created if needed.
    fn default_target(&self) -> Result<PathBuf, String> {
        let dir = self.default_dir.clone().ok_or("download-dir-unavailable")?;
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(dir)
    }

    /// Saves into the chosen folder; if none was chosen, into Downloads. When
    /// the chosen folder is missing (removed, renamed, disconnected share) or
    /// cannot be written (access denied, disk full, Controlled Folder Access),
    /// the file goes to Downloads and `fallback` says so: never silently.
    fn save(&self, name: &str, bytes: &[u8], untrusted: bool) -> Result<SaveResult, String> {
        if let Some(dir) = self.chosen() {
            if dir.is_dir() {
                match save_in(&dir, name, bytes, untrusted) {
                    Ok(path) => return Ok(SaveResult::new(path, false)),
                    Err(e) => tracing::warn!(
                        kind = ?e.kind(),
                        "could not write to the chosen download folder; using Downloads"
                    ),
                }
            } else {
                tracing::warn!("chosen download folder is missing; using Downloads");
            }
            let path = save_in(&self.default_target()?, name, bytes, untrusted)
                .map_err(|e| e.to_string())?;
            return Ok(SaveResult::new(path, true));
        }
        let path =
            save_in(&self.default_target()?, name, bytes, untrusted).map_err(|e| e.to_string())?;
        Ok(SaveResult::new(path, false))
    }
}

/// Where a file was saved, and whether it had to go to Downloads instead of
/// the chosen folder.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    path: String,
    fallback: bool,
}

impl SaveResult {
    fn new(path: PathBuf, fallback: bool) -> Self {
        Self {
            path: path.to_string_lossy().into_owned(),
            fallback,
        }
    }
}

/// `(stem, ".ext")` of a file name; the extension is empty for names without
/// one, dot-files, or a "extension" too long to be one.
fn split_ext(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(i) if i > 0 && name[i..].chars().count() <= MAX_EXT => (&name[..i], &name[i..]),
        _ => (name, ""),
    }
}

/// Reduces a name from the webview to one safe file-name component: no path
/// separators or characters Windows rejects, no trailing dots or spaces, no
/// reserved device names, bounded length (the stem is cut, the extension kept).
fn sanitize_name(raw: &str) -> String {
    let last = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let mut name: String = last
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    name = name.trim().trim_end_matches(['.', ' ']).to_string();
    if name.is_empty() || name.chars().all(|c| c == '.') {
        return "download".into();
    }
    if name.chars().count() > MAX_NAME {
        let (stem, ext) = split_ext(&name);
        let keep = MAX_NAME - ext.chars().count();
        let stem: String = stem.chars().take(keep).collect();
        name = format!("{}{ext}", stem.trim_end_matches(['.', ' ']));
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

/// Reserves `dir/name`, or `dir/stem (n).ext` for the first free `n`, by
/// creating it empty with `create_new`: two saves running at once never pick
/// the same name, and an existing file is never overwritten.
fn reserve_path(dir: &Path, name: &str) -> io::Result<PathBuf> {
    let (stem, ext) = split_ext(name);
    for n in 1..=MAX_COPIES {
        let candidate = if n == 1 {
            dir.join(name)
        } else {
            dir.join(format!("{stem} ({n}){ext}"))
        };
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(_) => return Ok(candidate),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "too many files with this name",
    ))
}

/// Saves `bytes` as `name` in `dir`; returns the full path written. The name
/// is reserved first (`reserve_path`), the content is written to a unique
/// temp file, fsynced and renamed over the reservation, so a crash never
/// leaves a truncated file under the final name. `untrusted` files (planner
/// attachments: content that came from someone else) get Mark-of-the-Web.
fn save_in(dir: &Path, name: &str, bytes: &[u8], untrusted: bool) -> io::Result<PathBuf> {
    let path = reserve_path(dir, &sanitize_name(name))?;
    let pending = dir.join(format!(".pharos-{}.part", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::File::create(&pending)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        // Replaces our own empty reservation, never someone else's file.
        fs::rename(&pending, &path)
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&pending);
        let _ = fs::remove_file(&path);
        return Err(e);
    }
    if untrusted {
        mark_untrusted(&path);
    }
    Ok(path)
}

/// Mark-of-the-Web: the `Zone.Identifier` stream Windows and Office read to
/// warn before opening a downloaded file (Internet zone). Best effort: some
/// file systems (FAT, network shares) have no alternate streams.
#[cfg(windows)]
fn mark_untrusted(path: &Path) {
    let mut stream = path.as_os_str().to_owned();
    stream.push(":Zone.Identifier");
    if let Err(e) = fs::write(PathBuf::from(stream), "[ZoneTransfer]\r\nZoneId=3\r\n") {
        tracing::warn!(kind = ?e.kind(), "could not mark the saved file as downloaded");
    }
}

#[cfg(not(windows))]
fn mark_untrusted(_path: &Path) {}

/// Writes `bytes` to `<path>.part`, fsyncs it and renames it over `path`, so a
/// crash never leaves a truncated file under the final name (settings file).
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
/// in the `x-pharos-filename` header, and `x-pharos-untrusted: 1` asks for
/// Mark-of-the-Web. Returns the full path written and whether it fell back to
/// Downloads. Runs off the main thread (`async`): a large ZIP's fsync or a
/// slow network folder never freezes the window.
#[tauri::command(async)]
pub fn download_save(
    downloads: State<'_, Downloads>,
    request: Request<'_>,
) -> Result<SaveResult, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".into());
    };
    let header = |key: &str| request.headers().get(key).and_then(|v| v.to_str().ok());
    let name = percent_decode(header(NAME_HEADER).ok_or("missing file name")?)?;
    let untrusted = header(UNTRUSTED_HEADER) == Some("1");
    let saved = downloads.save(&name, bytes, untrusted)?;
    tracing::info!(
        bytes = bytes.len(),
        fallback = saved.fallback,
        untrusted,
        "export saved to the download folder"
    );
    Ok(saved)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pharos-dl-{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut out: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        out.sort();
        out
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
    fn a_long_name_is_cut_in_the_stem_keeping_the_extension() {
        let long = format!("{}.xlsx", "Plan de pruebas ñ ".repeat(20));
        let cut = sanitize_name(&long);
        assert!(cut.ends_with(".xlsx"), "{cut}");
        assert!(cut.chars().count() <= MAX_NAME);
        assert!(
            !cut.contains(" .xlsx"),
            "no trailing space before the extension: {cut}"
        );

        let feature = sanitize_name(&format!("{}.feature", "a".repeat(300)));
        assert_eq!(feature.chars().count(), MAX_NAME);
        assert!(feature.ends_with(".feature"));

        // A "suffix" longer than any extension is part of the stem.
        let dotted = sanitize_name(&format!("x.{}", "y".repeat(300)));
        assert_eq!(dotted.chars().count(), MAX_NAME);
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
        let first = save_in(&dir, "report.pdf", b"one", false).unwrap();
        let second = save_in(&dir, "report.pdf", b"two", false).unwrap();
        let third = save_in(&dir, "report.pdf", b"three", false).unwrap();
        assert_eq!(first.file_name().unwrap(), "report.pdf");
        assert_eq!(second.file_name().unwrap(), "report (2).pdf");
        assert_eq!(third.file_name().unwrap(), "report (3).pdf");
        assert_eq!(fs::read(&first).unwrap(), b"one");
        assert_eq!(fs::read(&third).unwrap(), b"three");
        // No temp file left behind.
        assert_eq!(names(&dir).len(), 3);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn concurrent_saves_of_one_name_never_collide() {
        let dir = temp_dir("concurrent");
        let threads = MAX_COPIES as u8;
        let handles: Vec<_> = (0..threads)
            .map(|i| {
                let dir = dir.clone();
                std::thread::spawn(move || save_in(&dir, "export.zip", &[i; 64], false).unwrap())
            })
            .collect();
        let mut paths: Vec<PathBuf> = handles.into_iter().map(|h| h.join().unwrap()).collect();
        paths.sort();
        paths.dedup();
        assert_eq!(paths.len(), threads as usize, "every save got its own file");
        assert_eq!(
            names(&dir).len(),
            threads as usize,
            "no reservation or temp file left over"
        );
        for p in &paths {
            let bytes = fs::read(p).unwrap();
            assert_eq!(bytes.len(), 64);
            assert!(bytes.iter().all(|b| *b == bytes[0]), "content not mixed");
        }
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn writes_only_inside_the_folder() {
        let dir = temp_dir("inside");
        let path = save_in(&dir, "..\\..\\escape.txt", b"x", false).unwrap();
        assert_eq!(path.parent().unwrap(), dir);
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn untrusted_files_get_mark_of_the_web() {
        let dir = temp_dir("motw");
        let path = save_in(&dir, "attachment.exe", b"MZ", true).unwrap();
        let mut stream = path.as_os_str().to_owned();
        stream.push(":Zone.Identifier");
        let zone = fs::read_to_string(PathBuf::from(stream)).unwrap();
        assert!(zone.contains("ZoneId=3"), "{zone}");

        let own = save_in(&dir, "plan.xlsx", b"PK", false).unwrap();
        let mut stream = own.as_os_str().to_owned();
        stream.push(":Zone.Identifier");
        assert!(
            fs::metadata(PathBuf::from(stream)).is_err(),
            "own exports are not marked"
        );
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
        let saved = d.save("a.txt", b"a", false).unwrap();
        assert!(!saved.fallback);
        assert!(Path::new(&saved.path).starts_with(&downloads_dir));

        d.set(Some(chosen.clone())).unwrap();
        let reloaded = Downloads::load(Some(prefs.clone()), Some(downloads_dir.clone()));
        assert!(reloaded.info().custom);
        let saved = reloaded.save("b.txt", b"b", false).unwrap();
        assert!(!saved.fallback);
        assert!(Path::new(&saved.path).starts_with(&chosen));

        reloaded.set(None).unwrap();
        let again = Downloads::load(Some(prefs), Some(downloads_dir.clone()));
        assert!(!again.info().custom);

        for dir in [config, downloads_dir, chosen] {
            fs::remove_dir_all(dir).unwrap();
        }
    }

    #[test]
    fn a_removed_folder_is_flagged_and_the_save_falls_back_visibly() {
        let config = temp_dir("gone");
        let chosen = temp_dir("gone-chosen");
        let d = Downloads::load(Some(config.join("downloads.json")), Some(config.clone()));
        d.set(Some(chosen.clone())).unwrap();
        assert!(!d.info().missing);
        fs::remove_dir_all(&chosen).unwrap();
        let info = d.info();
        assert!(info.custom && info.missing);
        let saved = d.save("c.txt", b"c", false).unwrap();
        assert!(saved.fallback, "the UI must be told");
        assert!(Path::new(&saved.path).starts_with(&config));
        fs::remove_dir_all(config).unwrap();
    }

    #[test]
    fn a_folder_that_cannot_take_the_file_falls_back_visibly() {
        let config = temp_dir("unwritable");
        let chosen = temp_dir("unwritable-chosen");
        // Every candidate name is taken (by folders), so the write fails in
        // the chosen folder, as with access denied or a full disk.
        fs::create_dir_all(chosen.join("d.txt")).unwrap();
        for n in 2..=MAX_COPIES {
            fs::create_dir_all(chosen.join(format!("d ({n}).txt"))).unwrap();
        }
        let d = Downloads::load(Some(config.join("downloads.json")), Some(config.clone()));
        d.set(Some(chosen.clone())).unwrap();
        let saved = d.save("d.txt", b"d", false).unwrap();
        assert!(saved.fallback, "the UI must be told");
        assert!(Path::new(&saved.path).starts_with(&config));
        assert_eq!(fs::read(&saved.path).unwrap(), b"d");
        for dir in [config, chosen] {
            fs::remove_dir_all(dir).unwrap();
        }
    }
}
