//! Reads a project folder for the AI requirement extraction (IA-17, ADR-0036).
//!
//! The folder is picked with the native dialog from Rust (rfd, as the download
//! folder, UX-02): the webview never gets a file system permission. The walk
//! respects `.gitignore`, `.ignore` and `.git/info/exclude` (crate `ignore`),
//! skips hidden entries and a fixed list of folders (dependencies, builds),
//! and returns an inventory without content: relative path, size, estimated
//! tokens, category (what to read first) and why a file is left out.
//!
//! `project_scan_read` then returns the text of the files the person kept,
//! with numbered lines and the lines that look like a secret replaced. It only
//! reads relative paths under the picked root (no `..`, no link out of it), and
//! checks again everything the inventory checked: the webview cannot widen it.

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use regex::Regex;
use serde::Serialize;
use tauri::State;
#[cfg(test)]
use ts_rs::TS;
use uuid::Uuid;

/// Entries walked before the walk stops (the inventory says it was cut).
const MAX_ENTRIES: usize = 20_000;
/// Readable files listed before the inventory is cut.
const MAX_FILES: usize = 3_000;
/// Larger files are listed as left out: generated data, dumps, bundles.
pub(crate) const MAX_FILE_BYTES: u64 = 256 * 1024;
/// Bytes sniffed for a NUL (binary) and for minified code.
const SNIFF_BYTES: usize = 8 * 1024;
/// Average line length above which code reads as minified.
const MINIFIED_LINE: usize = 300;
/// What replaces a line that looks like a secret.
pub(crate) const REDACTED: &str = "[secreto omitido]";

/// Folders never walked: dependencies, builds, caches, version control.
const SKIPPED_DIRS: &[&str] = &[
    "node_modules",
    "bower_components",
    "vendor",
    "target",
    "dist",
    "build",
    "out",
    "coverage",
    "__pycache__",
    "venv",
    "bin",
    "obj",
];

/// Lockfiles: long, generated, no requirement in them.
const LOCKFILES: &[&str] = &[
    "package-lock.json",
    "npm-shrinkwrap.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "cargo.lock",
    "poetry.lock",
    "composer.lock",
    "gemfile.lock",
    "go.sum",
    "pipfile.lock",
];

/// Extensions of files that are not text worth sending (media, archives,
/// binaries, data stores).
const NOT_TEXT: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svgz", "tif", "tiff", "psd", "mp3", "mp4",
    "wav", "ogg", "webm", "mov", "avi", "zip", "gz", "tgz", "rar", "7z", "tar", "jar", "war",
    "exe", "dll", "so", "dylib", "pdb", "class", "o", "a", "lib", "woff", "woff2", "ttf", "otf",
    "eot", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "sqlite", "sqlite3", "db", "mdb",
    "dump", "bak", "map", "wasm", "lockb",
];

/// Why a file is left out of what can be sent. `secret` cannot be included.
fn excluded_by_name(rel: &str) -> Option<&'static str> {
    let name = rel.rsplit('/').next().unwrap_or(rel).to_ascii_lowercase();
    let ext = name.rsplit_once('.').map(|(_, e)| e).unwrap_or("");
    let secret = name.starts_with(".env")
        || name.starts_with("id_rsa")
        || name.starts_with("id_ed25519")
        || name.starts_with("id_ecdsa")
        || name.starts_with("credentials")
        || name.starts_with("secret")
        || name == ".npmrc"
        || name == ".pypirc"
        || name == ".netrc"
        || matches!(
            ext,
            "pem" | "key" | "p12" | "pfx" | "keystore" | "jks" | "kdbx" | "crt" | "cer" | "der"
        );
    if secret {
        return Some("secret");
    }
    if LOCKFILES.contains(&name.as_str()) {
        return Some("lockfile");
    }
    if name.ends_with(".min.js") || name.ends_with(".min.css") {
        return Some("minified");
    }
    if NOT_TEXT.contains(&ext) {
        return Some("binary");
    }
    None
}

/// What a file is, for the reading order: docs first, then routes, models,
/// tests, interface, config, the rest.
pub(crate) fn category(rel: &str) -> &'static str {
    let lower = rel.to_ascii_lowercase();
    let name = lower.rsplit('/').next().unwrap_or(&lower);
    let ext = name.rsplit_once('.').map(|(_, e)| e).unwrap_or("");
    let dirs: Vec<&str> = lower.split('/').collect();
    let dirs = &dirs[..dirs.len() - 1];
    let in_dir = |names: &[&str]| dirs.iter().any(|d| names.contains(d));
    let named = |parts: &[&str]| parts.iter().any(|p| name.contains(p));

    let is_test = in_dir(&[
        "test",
        "tests",
        "__tests__",
        "spec",
        "e2e",
        "cypress",
        "playwright",
    ]) || named(&[".test.", ".spec.", "_test.", "_spec."])
        || name.starts_with("test_")
        || ext == "feature";
    if is_test {
        return "tests";
    }
    let is_doc = matches!(ext, "md" | "mdx" | "rst" | "adoc" | "txt")
        || name.starts_with("readme")
        || named(&["openapi", "swagger"])
        || in_dir(&[
            "docs",
            "doc",
            "documentation",
            "adr",
            "specs",
            "requirements",
        ]);
    if is_doc {
        return "docs";
    }
    let is_route = in_dir(&[
        "routes",
        "router",
        "controllers",
        "handlers",
        "api",
        "endpoints",
        "commands",
        "pages",
    ]) || named(&["route", "controller", "handler", "endpoint", "command"]);
    if is_route {
        return "routes";
    }
    let is_model = in_dir(&[
        "models",
        "model",
        "schemas",
        "entities",
        "migrations",
        "domain",
        "types",
    ]) || named(&["model", "schema", "entity", "types", "dto"])
        || matches!(ext, "sql" | "prisma" | "graphql" | "gql" | "proto");
    if is_model {
        return "models";
    }
    let is_ui = matches!(ext, "tsx" | "jsx" | "vue" | "svelte" | "html")
        || in_dir(&["components", "ui", "views", "screens", "widgets"]);
    if is_ui {
        return "ui";
    }
    let is_config = matches!(
        ext,
        "json" | "toml" | "yaml" | "yml" | "ini" | "cfg" | "xml" | "gradle"
    );
    if is_config {
        return "config";
    }
    "other"
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanFile {
    /// Relative to the picked folder, with `/`.
    path: String,
    size: u64,
    /// Rough estimate (≈ 3.5 characters per token).
    tokens: u64,
    /// docs | routes | models | tests | ui | config | other
    category: String,
    /// secret | lockfile | minified | binary | large: never sent. None = can be sent.
    #[cfg_attr(test, ts(optional = nullable))]
    excluded: Option<String>,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanInventory {
    scan_id: String,
    /// The folder's own name, for the title.
    root_name: String,
    files: Vec<ScanFile>,
    /// The walk stopped at its limits: not every file is listed.
    truncated: bool,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanContent {
    path: String,
    /// The text with numbered lines (`12| …`), secrets replaced.
    text: String,
    /// Line numbers (1-based) replaced because they looked like a secret.
    redacted: Vec<u32>,
    lines: u32,
    /// Why it could not be read (it changed since the inventory, or is left
    /// out); `text` is empty then.
    #[cfg_attr(test, ts(optional = nullable))]
    error: Option<String>,
}

/// Estimated tokens of `bytes` of text.
pub(crate) fn estimate_tokens(bytes: u64) -> u64 {
    (bytes * 2).div_ceil(7)
}

/// Why the content of a text file leaves it out (binary or minified).
fn excluded_by_content(rel: &str, head: &[u8]) -> Option<&'static str> {
    if head.contains(&0) {
        return Some("binary");
    }
    let code = matches!(
        rel.rsplit_once('.')
            .map(|(_, e)| e.to_ascii_lowercase())
            .as_deref(),
        Some("js" | "mjs" | "cjs" | "css" | "json")
    );
    if code {
        let text = String::from_utf8_lossy(head);
        let lines = text.lines().count().max(1);
        if text.len() / lines > MINIFIED_LINE {
            return Some("minified");
        }
    }
    None
}

fn read_head(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut head = Vec::with_capacity(SNIFF_BYTES);
    fs::File::open(path)?
        .take(SNIFF_BYTES as u64)
        .read_to_end(&mut head)?;
    Ok(head)
}

fn relative(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let parts: Vec<String> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    (!parts.is_empty()).then(|| parts.join("/"))
}

/// The inventory of `root`: what can be sent and what is left out, by
/// category then path. Pure but for the reads (testable on a temp folder).
pub(crate) fn inventory(root: &Path) -> Result<(Vec<ScanFile>, bool), String> {
    let mut walker = ignore::WalkBuilder::new(root);
    walker
        .hidden(true)
        .git_ignore(true)
        .git_exclude(true)
        .ignore(true)
        .git_global(false)
        .parents(false)
        .require_git(false)
        .follow_links(false)
        .filter_entry(|e| {
            let is_dir = e.file_type().is_some_and(|t| t.is_dir());
            !(is_dir
                && e.depth() > 0
                && SKIPPED_DIRS.contains(
                    &e.file_name()
                        .to_string_lossy()
                        .to_ascii_lowercase()
                        .as_str(),
                ))
        });
    let mut files = Vec::new();
    let mut truncated = false;
    for (seen, entry) in walker.build().enumerate() {
        if seen >= MAX_ENTRIES || files.len() >= MAX_FILES {
            truncated = true;
            break;
        }
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_some_and(|t| t.is_file()) {
            continue;
        }
        let Some(rel) = relative(root, entry.path()) else {
            continue;
        };
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let mut excluded = excluded_by_name(&rel);
        if excluded.is_none() && size > MAX_FILE_BYTES {
            excluded = Some("large");
        }
        if excluded.is_none() {
            excluded = match read_head(entry.path()) {
                Ok(head) => excluded_by_content(&rel, &head),
                Err(_) => Some("binary"),
            };
        }
        files.push(ScanFile {
            category: category(&rel).to_string(),
            tokens: estimate_tokens(size),
            excluded: excluded.map(String::from),
            path: rel,
            size,
        });
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok((files, truncated))
}

/// Patterns of a line that holds a secret: keys and tokens of known services,
/// JWTs, URLs with a password and `password = "…"`-style assignments.
fn secret_patterns() -> &'static [Regex] {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        [
            r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
            r"\bAKIA[0-9A-Z]{16}\b",
            r"\bgh[pousr]_[A-Za-z0-9]{30,}",
            r"\bgithub_pat_[A-Za-z0-9_]{30,}",
            r"\bsk-[A-Za-z0-9_-]{20,}",
            r"\bxox[abprs]-[A-Za-z0-9-]{10,}",
            r"\bAIza[0-9A-Za-z_-]{35}",
            r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
            r"[A-Za-z][A-Za-z0-9+.-]*://[^\s:/@]+:[^\s@/]+@",
            r#"(?i)(password|passwd|pwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|token|private[_-]?key)["']?\s*[:=]\s*["'][^"'\s]{8,}["']"#,
        ]
        .iter()
        .map(|p| Regex::new(p).expect("valid secret pattern"))
        .collect()
    })
}

/// The text with numbered lines; a line that looks like a secret (and every
/// line of a private key block) is replaced. Pure — testable.
pub(crate) fn numbered_redacted(text: &str) -> (String, Vec<u32>, u32) {
    let patterns = secret_patterns();
    let mut out = String::with_capacity(text.len() + text.len() / 8);
    let mut redacted = Vec::new();
    let mut in_key = false;
    let mut count = 0u32;
    for (i, line) in text.lines().enumerate() {
        let n = i as u32 + 1;
        count = n;
        let starts_key = line.contains("PRIVATE KEY-----") && line.contains("BEGIN");
        let hide = in_key || starts_key || patterns.iter().any(|p| p.is_match(line));
        if starts_key {
            in_key = true;
        }
        if in_key && line.contains("END") && line.contains("PRIVATE KEY-----") {
            in_key = false;
        }
        if hide {
            redacted.push(n);
            out.push_str(&format!("{n}| {REDACTED}\n"));
        } else {
            out.push_str(&format!("{n}| {line}\n"));
        }
    }
    (out, redacted, count)
}

/// The file under `root` that `rel` names, or an error: only plain relative
/// paths, and the resolved file (links followed) must stay under the root.
pub(crate) fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(rel);
    let plain = !rel.is_empty()
        && candidate
            .components()
            .all(|c| matches!(c, Component::Normal(_)));
    if !plain {
        return Err(format!("not a path inside the project: {rel}"));
    }
    let full = root
        .join(candidate)
        .canonicalize()
        .map_err(|_| format!("file not found: {rel}"))?;
    if !full.starts_with(root) || !full.is_file() {
        return Err(format!("not a file inside the project: {rel}"));
    }
    Ok(full)
}

/// Reads one file of the inventory, with the same checks: never a secret,
/// binary, minified or too large file, whatever the webview asks for.
pub(crate) fn read_file(root: &Path, rel: &str) -> Result<ScanContent, String> {
    if let Some(why) = excluded_by_name(rel) {
        return Err(format!("{rel} is left out ({why})"));
    }
    if rel.split('/').any(|part| {
        part.starts_with('.') || SKIPPED_DIRS.contains(&part.to_ascii_lowercase().as_str())
    }) {
        return Err(format!("{rel} is left out (hidden or skipped folder)"));
    }
    let full = resolve(root, rel)?;
    let size = fs::metadata(&full).map_err(|e| e.to_string())?.len();
    if size > MAX_FILE_BYTES {
        return Err(format!("{rel} is left out (large)"));
    }
    let bytes = fs::read(&full).map_err(|e| e.to_string())?;
    if let Some(why) = excluded_by_content(rel, &bytes[..bytes.len().min(SNIFF_BYTES)]) {
        return Err(format!("{rel} is left out ({why})"));
    }
    let text = String::from_utf8_lossy(&bytes);
    let (text, redacted, lines) = numbered_redacted(&text);
    Ok(ScanContent {
        path: rel.to_string(),
        text,
        redacted,
        lines,
        error: None,
    })
}

/// The folders picked in this session, by scan id. Forgotten on close.
#[derive(Default)]
pub struct ProjectScans(Mutex<HashMap<String, PathBuf>>);

impl ProjectScans {
    fn root(&self, scan_id: &str) -> Result<PathBuf, String> {
        self.0
            .lock()
            .map_err(|_| "scan state poisoned".to_string())?
            .get(scan_id)
            .cloned()
            .ok_or_else(|| "this folder is no longer open: pick it again".to_string())
    }

    fn open(&self, root: PathBuf) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        self.0
            .lock()
            .map_err(|_| "scan state poisoned".to_string())?
            .insert(id.clone(), root);
        Ok(id)
    }
}

fn scan_folder(scans: &ProjectScans, picked: &Path) -> Result<ScanInventory, String> {
    let root = picked.canonicalize().map_err(|e| e.to_string())?;
    let (files, truncated) = inventory(&root)?;
    let root_name = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.to_string_lossy().into_owned());
    let scan_id = scans.open(root)?;
    Ok(ScanInventory {
        scan_id,
        root_name,
        files,
        truncated,
    })
}

/// The folder a test run picks instead of the person (`PHAROS_E2E_PICK_FOLDER`),
/// only with an e2e profile, which only a debug build honours: a release build
/// always asks the person.
fn e2e_pick_folder() -> Option<std::path::PathBuf> {
    crate::instance::e2e_profile()?;
    let folder = std::env::var("PHAROS_E2E_PICK_FOLDER").ok()?;
    let path = std::path::PathBuf::from(folder);
    path.is_dir().then_some(path)
}

/// Opens the native folder picker and returns the inventory of the folder
/// (None when the person cancels). Nothing is read beyond the first bytes.
#[cfg(windows)]
#[tauri::command]
pub async fn project_scan_pick(
    window: tauri::WebviewWindow,
    scans: State<'_, ProjectScans>,
) -> Result<Option<ScanInventory>, String> {
    // The guided tours (MAN-03) cannot drive Windows' own folder picker:
    // a test run of a debug build (an e2e profile) may name the folder.
    if let Some(folder) = e2e_pick_folder() {
        return scan_folder(scans.inner(), &folder).map(Some);
    }
    let dialog = rfd::AsyncFileDialog::new().set_parent(&window);
    let Some(picked) = dialog.pick_folder().await else {
        return Ok(None);
    };
    scan_folder(scans.inner(), picked.path()).map(Some)
}

/// Pharos ships for Windows; elsewhere there is no picker.
#[cfg(not(windows))]
#[tauri::command]
pub async fn project_scan_pick() -> Result<Option<ScanInventory>, String> {
    Err("folder picker not available on this platform".into())
}

/// The text of the files the person kept, numbered and with secrets replaced.
/// A file that cannot be read comes back with its `error`, the rest still read.
#[tauri::command]
pub fn project_scan_read(
    scans: State<ProjectScans>,
    scan_id: String,
    paths: Vec<String>,
) -> Result<Vec<ScanContent>, String> {
    let root = scans.root(&scan_id)?;
    Ok(paths
        .iter()
        .map(|rel| {
            read_file(&root, rel).unwrap_or_else(|e| ScanContent {
                path: rel.clone(),
                text: String::new(),
                redacted: Vec::new(),
                lines: 0,
                error: Some(e),
            })
        })
        .collect())
}

/// Forgets a picked folder.
#[tauri::command]
pub fn project_scan_close(scans: State<ProjectScans>, scan_id: String) -> Result<(), String> {
    scans
        .0
        .lock()
        .map_err(|_| "scan state poisoned".to_string())?
        .remove(&scan_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A temp folder with the given files, removed on drop.
    struct Tree(PathBuf);
    impl Tree {
        fn new(files: &[(&str, &[u8])]) -> Self {
            let root = std::env::temp_dir().join(format!("pharos-scan-{}", Uuid::new_v4()));
            for (rel, bytes) in files {
                let path = root.join(rel);
                fs::create_dir_all(path.parent().unwrap()).unwrap();
                fs::write(path, bytes).unwrap();
            }
            fs::create_dir_all(&root).unwrap();
            Tree(root.canonicalize().unwrap())
        }
    }
    impl Drop for Tree {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn listed(files: &[ScanFile]) -> Vec<(String, Option<String>)> {
        files
            .iter()
            .map(|f| (f.path.clone(), f.excluded.clone()))
            .collect()
    }

    #[test]
    fn inventory_skips_dependencies_hidden_and_ignored_and_flags_what_cannot_go() {
        let big = vec![b'a'; (MAX_FILE_BYTES + 1) as usize];
        let minified = format!("var a={};\n", "x".repeat(2000));
        let tree = Tree::new(&[
            ("README.md", b"# App\nUsers sign in."),
            ("src/api/routes.ts", b"router.get('/login')"),
            ("node_modules/x/index.js", b"x"),
            ("target/debug/out.txt", b"x"),
            (".env", b"API_KEY=abc"),
            (".git/config", b"x"),
            ("ignored/notes.md", b"x"),
            (".gitignore", b"ignored/\n"),
            ("keys/server.pem", b"-----BEGIN PRIVATE KEY-----"),
            ("package-lock.json", b"{}"),
            ("logo.png", b"\x89PNG"),
            ("data.bin", b"ab\0cd"),
            ("dump.json", &big),
            ("app.js", minified.as_bytes()),
        ]);
        let (files, truncated) = inventory(&tree.0).unwrap();
        assert!(!truncated);
        assert_eq!(
            listed(&files),
            vec![
                ("README.md".into(), None),
                ("app.js".into(), Some("minified".into())),
                ("data.bin".into(), Some("binary".into())),
                ("dump.json".into(), Some("large".into())),
                ("keys/server.pem".into(), Some("secret".into())),
                ("logo.png".into(), Some("binary".into())),
                ("package-lock.json".into(), Some("lockfile".into())),
                ("src/api/routes.ts".into(), None),
            ]
        );
        assert_eq!(files[0].category, "docs");
        assert_eq!(files[7].category, "routes");
    }

    #[test]
    fn categories_put_docs_routes_models_and_tests_apart() {
        assert_eq!(category("docs/adr/0001.md"), "docs");
        assert_eq!(category("openapi.yaml"), "docs");
        assert_eq!(category("src/login.test.ts"), "tests");
        assert_eq!(category("e2e/login.ts"), "tests");
        assert_eq!(category("features/login.feature"), "tests");
        assert_eq!(category("server/src/routes/users.ts"), "routes");
        assert_eq!(category("src/user.controller.java"), "routes");
        assert_eq!(category("migrations/0001_init.sql"), "models");
        assert_eq!(category("src/model/types.ts"), "models");
        assert_eq!(category("src/ui/Login.tsx"), "ui");
        assert_eq!(category("package.json"), "config");
        assert_eq!(category("src/util/strings.rs"), "other");
    }

    #[test]
    fn secrets_are_replaced_line_by_line_and_lines_keep_their_numbers() {
        let text = [
            "const url = 'https://api.example.com';",
            "const key = \"sk-ant-REDACTEDREDACTEDREDACTED\";",
            "password: \"hunter2hunter2\"",
            "DATABASE_URL=postgres://app:s3cr3t@db:5432/app",
            "-----BEGIN RSA PRIVATE KEY-----",
            "MIIEow",
            "-----END RSA PRIVATE KEY-----",
            "AKIAABCDEFGHIJKLMNOP",
            "the token field is required",
        ]
        .join("\n");
        let (out, redacted, lines) = numbered_redacted(&text);
        assert_eq!(lines, 9);
        assert_eq!(redacted, vec![2, 3, 4, 5, 6, 7, 8]);
        assert!(out.starts_with("1| const url = 'https://api.example.com';\n"));
        assert!(out.contains(&format!("2| {REDACTED}\n")));
        assert!(out.contains("9| the token field is required\n"));
        assert!(!out.contains("hunter2") && !out.contains("s3cr3t") && !out.contains("MIIEow"));
    }

    #[test]
    fn reading_only_reaches_plain_files_inside_the_root() {
        let tree = Tree::new(&[
            ("README.md", b"hello"),
            (".env", b"API_KEY=abc"),
            ("node_modules/x.js", b"x"),
            ("keys/a.key", b"x"),
        ]);
        let outside = Tree::new(&[("secret.txt", b"nope")]);
        let ok = read_file(&tree.0, "README.md").unwrap();
        assert_eq!(ok.text, "1| hello\n");
        for bad in [
            "../secret.txt",
            "/etc/passwd",
            "C:/Windows/win.ini",
            ".env",
            "node_modules/x.js",
            "keys/a.key",
            "missing.md",
            "",
        ] {
            assert!(read_file(&tree.0, bad).is_err(), "{bad} was read");
        }
        let escape = format!(
            "../{}/secret.txt",
            outside.0.file_name().unwrap().to_string_lossy()
        );
        assert!(read_file(&tree.0, &escape).is_err());
    }

    #[test]
    fn a_scan_id_reaches_only_its_own_folder() {
        let tree = Tree::new(&[("README.md", b"hi")]);
        let scans = ProjectScans::default();
        let inv = scan_folder(&scans, &tree.0).unwrap();
        assert_eq!(inv.files.len(), 1);
        assert_eq!(scans.root(&inv.scan_id).unwrap(), tree.0);
        assert!(scans.root("another").is_err());
    }

    #[test]
    fn tokens_are_estimated_at_about_3_5_characters_each() {
        assert_eq!(estimate_tokens(0), 0);
        assert_eq!(estimate_tokens(7), 2);
        assert_eq!(estimate_tokens(350_000), 100_000);
    }
}
