//! The report files a command names: paths or patterns (`reports/*.json`),
//! which PowerShell and cmd do not expand themselves. Shared by local and
//! remote mode.

use std::path::{Path, PathBuf};

use crate::exit::Failure;

/// The files named by `patterns`: a path, or a pattern (`reports/*.json`,
/// which PowerShell does not expand itself), relative to `cwd`. Each pattern
/// must match something.
pub fn expand(patterns: &[String], cwd: &Path) -> Result<Vec<(String, PathBuf)>, Failure> {
    if patterns.is_empty() {
        return Err(Failure::usage("no-files", "err.no-file-args"));
    }
    let mut files: Vec<(String, PathBuf)> = Vec::new();
    for pattern in patterns {
        let before = files.len();
        if pattern.contains(['*', '?', '[']) {
            let full = cwd.join(pattern);
            let full = full.to_string_lossy().replace('\\', "/");
            let mut found: Vec<PathBuf> = glob::glob(&full)
                .map_err(|e| {
                    Failure::usage("no-files", "err.no-files")
                        .arg(pattern.as_str())
                        .detail(e.to_string())
                })?
                .filter_map(Result::ok)
                .filter(|p| p.is_file())
                .collect();
            found.sort();
            for path in found {
                let shown = path
                    .strip_prefix(cwd)
                    .unwrap_or(&path)
                    .display()
                    .to_string();
                files.push((shown, path));
            }
        } else {
            let path = cwd.join(pattern);
            if path.is_file() {
                files.push((pattern.clone(), path));
            }
        }
        if files.len() == before {
            return Err(Failure::usage("no-files", "err.no-files").arg(pattern.as_str()));
        }
    }
    let mut seen = std::collections::HashSet::new();
    files.retain(|(_, p)| seen.insert(p.clone()));
    Ok(files)
}
