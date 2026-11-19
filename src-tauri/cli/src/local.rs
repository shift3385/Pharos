//! Local mode (ADR-0054 §1): write into the desktop's database on this
//! computer through `pharos_core::api`, as the account signed in to the app.
//! Until SEC-05b (N5) only one process may open the database, so with the app
//! open this fails cleanly with `db-in-use` (exit 6).
//!
//! Local mode reads Pharos Run JSON (JUnit comes with L4); every other format
//! is refused with a pointer to remote mode or the app's «Importar informe».

use std::path::{Path, PathBuf};

use pharos_core::api::{self, SignedInUser};
use pharos_core::db::Db;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::args::Opts;
use crate::config::{Config, Env};
use crate::exit::{core_code, from_core, Exit, Failure};
use crate::output::{Mark, Printer};
use crate::runjson;

/// Largest report the evidence store takes (`evidence::MAX_FILE_BYTES`).
const MAX_REPORT_BYTES: u64 = 200 * 1024 * 1024;

/// How the CLI reaches the desktop's data: the real keychain and folder, or a
/// test's own key and folder.
pub trait Local {
    /// The account signed in to the app on this computer.
    fn user(&self) -> Result<Option<SignedInUser>, String>;
    fn open(&self, data_dir: &Path) -> Result<Db, String>;
    fn default_data_dir(&self) -> Result<PathBuf, String>;
}

/// The desktop's own: the keychain of this Windows user and its data folder.
pub struct System;

impl Local for System {
    fn user(&self) -> Result<Option<SignedInUser>, String> {
        api::signed_in_user()
    }
    fn open(&self, data_dir: &Path) -> Result<Db, String> {
        api::open(data_dir)
    }
    fn default_data_dir(&self) -> Result<PathBuf, String> {
        pharos_core::paths::default_data_dir()
    }
}

/// The data folder: `--data-dir`, `PHAROS_DATA_DIR`, else the app's.
pub fn data_dir(opts: &Opts, env: &Env, local: &dyn Local) -> Result<PathBuf, Failure> {
    let given = opts.data_dir.clone().or_else(|| env.var("PHAROS_DATA_DIR"));
    match given {
        Some(dir) => Ok(env.cwd.join(dir)),
        None => local
            .default_data_dir()
            .map_err(|e| Failure::new(Exit::DbInUse, "data-dir", "err.internal").detail(e)),
    }
}

/// Opens the database of `dir` only if there is one: the CLI never creates a
/// database (or a key) of its own.
pub fn open_existing(local: &dyn Local, dir: &Path) -> Result<Db, Failure> {
    let exists = api::has_database(dir)
        .map_err(|e| Failure::new(Exit::DbInUse, "no-data", "err.internal").detail(e))?;
    if !exists {
        return Err(
            Failure::new(Exit::NotFound, "no-data", "err.no-data").arg(dir.display().to_string())
        );
    }
    local.open(dir).map_err(|e| from_core(&e))
}

/// The signed-in account, or exit 3.
pub fn signed_in(local: &dyn Local) -> Result<SignedInUser, Failure> {
    local
        .user()
        .map_err(|e| Failure::new(Exit::Auth, "keychain", "err.internal").detail(e))?
        .ok_or_else(|| Failure::new(Exit::Auth, "not-signed-in", "err.not-signed-in"))
}

/// The project with this id or case-id prefix, as the API v1 finds it
/// (ADR-0052): the id, else the exact prefix, else the prefix ignoring case.
/// A prefix usually ends in a dash (`PAG-`); `PAG` names it too. Two
/// projects with the prefix are `ambiguous-project` (exit 2), with their ids.
pub fn pick_project(
    all: &[api::ProjectRef],
    wanted: &str,
) -> Result<Option<api::ProjectRef>, Failure> {
    let wanted = wanted.trim();
    if let Some(p) = all.iter().find(|p| p.id == wanted) {
        return Ok(Some(p.clone()));
    }
    let bare = |s: &str| s.trim_end_matches('-').to_string();
    let wanted = bare(wanted);
    for exact in [true, false] {
        let hits: Vec<&api::ProjectRef> = all
            .iter()
            .filter(|p| {
                let prefix = bare(&p.case_id_prefix);
                if exact {
                    prefix == wanted
                } else {
                    prefix.eq_ignore_ascii_case(&wanted)
                }
            })
            .collect();
        match hits.len() {
            0 => continue,
            1 => return Ok(Some(hits[0].clone())),
            _ => {
                let names: Vec<String> = hits
                    .iter()
                    .map(|p| format!("{} ({})", p.name, p.id))
                    .collect();
                return Err(Failure::usage("ambiguous-project", "err.ambiguous-project")
                    .detail(names.join(", ")));
            }
        }
    }
    Ok(None)
}

// ---- files -------------------------------------------------------------------------

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

/// A report read, checked and ready to import.
struct Prepared {
    shown: String,
    path: PathBuf,
    bytes: Vec<u8>,
    sha256: String,
    doc: Value,
}

/// What a file looks like, by its content (as `@pharos/formats` detects, never
/// by its extension). Only Pharos Run JSON is imported locally.
enum Seen {
    RunJson(Value),
    /// Another format, by its display name.
    Other(&'static str),
    /// Neither JSON nor XML.
    Unknown,
}

fn see(bytes: &[u8]) -> Seen {
    let text = String::from_utf8_lossy(bytes);
    let text = text.trim_start_matches('\u{feff}').trim_start();
    if text.starts_with('<') {
        let head: String = text.chars().take(4096).collect();
        return if head.contains("<TestRun") {
            Seen::Other("TRX")
        } else if head.contains("<testsuite") {
            Seen::Other("JUnit")
        } else {
            Seen::Other("XML")
        };
    }
    match serde_json::from_str::<Value>(text) {
        Ok(Value::Object(o)) => {
            if o.get("schemaVersion").is_some_and(Value::is_string) {
                Seen::RunJson(Value::Object(o))
            } else if o.get("reportFormat").and_then(Value::as_str) == Some("CTRF") {
                Seen::Other("CTRF")
            } else if o.contains_key("violations") && o.contains_key("testEngine") {
                Seen::Other("axe")
            } else if o.contains_key("runs")
                && o.get("version")
                    .and_then(Value::as_str)
                    .is_some_and(|v| v.starts_with("2."))
            {
                Seen::Other("SARIF")
            } else if o.contains_key("metrics") && o.contains_key("root_group") {
                Seen::Other("k6")
            } else if o.contains_key("config") && o.contains_key("suites") {
                Seen::Other("Playwright JSON")
            } else {
                Seen::Unknown
            }
        }
        Ok(Value::Array(a)) if a.iter().all(|i| i.get("violations").is_some()) && !a.is_empty() => {
            Seen::Other("axe")
        }
        Ok(_) => Seen::Unknown,
        // NDJSON: Cucumber Messages, one envelope per line.
        Err(_)
            if text
                .lines()
                .next()
                .is_some_and(|l| serde_json::from_str::<Value>(l).is_ok_and(|v| v.is_object())) =>
        {
            Seen::Other("Cucumber Messages")
        }
        Err(_) => Seen::Unknown,
    }
}

/// Reads and checks one file; `--config` and `--case` fill the results that
/// lack them.
fn prepare(
    shown: &str,
    path: &Path,
    format: Option<&str>,
    configuration: Option<&str>,
    case: Option<&str>,
) -> Result<Prepared, Failure> {
    if let Some(f) = format {
        let f = f.to_ascii_lowercase();
        if ![
            "auto",
            "pharos",
            "pharos_run_json",
            "pharos-run-json",
            "pharos-run",
        ]
        .contains(&f.as_str())
        {
            return Err(
                Failure::new(Exit::Report, "format-not-local", "err.format-not-local")
                    .arg(shown)
                    .arg(f),
            );
        }
    }
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if size > MAX_REPORT_BYTES {
        return Err(Failure::new(Exit::Report, "too-large", "err.too-big")
            .arg(shown)
            .arg((MAX_REPORT_BYTES / (1024 * 1024)).to_string()));
    }
    let bytes = std::fs::read(path).map_err(|e| {
        Failure::usage("unreadable", "err.unreadable")
            .arg(shown)
            .detail(e.to_string())
    })?;
    let mut doc = match see(&bytes) {
        Seen::RunJson(doc) => doc,
        Seen::Other(name) => {
            return Err(
                Failure::new(Exit::Report, "format-not-local", "err.format-not-local")
                    .arg(shown)
                    .arg(name),
            )
        }
        Seen::Unknown => {
            return Err(
                Failure::new(Exit::Report, "invalid-report", "err.invalid-report").arg(shown),
            )
        }
    };
    let issues = runjson::validate(&doc);
    if !issues.is_empty() {
        let detail: Vec<String> = issues
            .iter()
            .take(5)
            .map(|i| {
                format!(
                    "{}: {}",
                    if i.path.is_empty() { "(doc)" } else { &i.path },
                    i.message
                )
            })
            .collect();
        return Err(
            Failure::new(Exit::Report, "invalid-report", "err.invalid-report-issues")
                .arg(shown)
                .arg(issues.len().to_string())
                .detail(detail.join("\n  ")),
        );
    }
    if let Some(results) = doc.get_mut("results").and_then(Value::as_array_mut) {
        for r in results.iter_mut().filter_map(Value::as_object_mut) {
            if let Some(c) = configuration {
                r.entry("configurationLabel").or_insert_with(|| json!(c));
            }
            if let Some(c) = case {
                r.entry("caseKey").or_insert_with(|| json!(c));
            }
        }
    }
    let sha256 = Sha256::digest(&bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    Ok(Prepared {
        shown: shown.to_string(),
        path: path.to_path_buf(),
        bytes,
        sha256,
        doc,
    })
}

/// Results by status, as the summary shows them (`pending` is `skipped`).
fn by_status(doc: &Value) -> Value {
    let mut counts = [0u64; 5];
    for r in doc
        .get("results")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let n = match r.get("status").and_then(Value::as_str) {
            Some("passed") => 0,
            Some("failed") => 1,
            Some("blocked") => 2,
            Some("skipped" | "pending") => 3,
            _ => 4,
        };
        counts[n] += 1;
    }
    json!({"passed": counts[0], "failed": counts[1], "blocked": counts[2],
           "skipped": counts[3], "other": counts[4]})
}

// ---- upload --------------------------------------------------------------------------

/// `pharos upload` in local mode.
pub fn upload(opts: &Opts, cfg: &Config, env: &Env, local: &dyn Local, p: &mut Printer) -> Exit {
    match upload_inner(opts, cfg, env, local, p) {
        Ok(exit) => exit,
        Err(f) => {
            p.failure(&f);
            f.exit
        }
    }
}

fn upload_inner(
    opts: &Opts,
    cfg: &Config,
    env: &Env,
    local: &dyn Local,
    p: &mut Printer,
) -> Result<Exit, Failure> {
    if opts.external_id.is_some() {
        return Err(Failure::usage("external-id-local", "err.external-id-local"));
    }
    if opts.run.is_some() && opts.run_name.is_some() {
        return Err(Failure::usage("run-and-name", "err.run-and-name"));
    }
    let wanted = cfg
        .project(opts, env)
        .ok_or_else(|| Failure::usage("project-required", "err.project-required"))?;
    let files = expand(&opts.files, &env.cwd)?;
    let total = files.len();

    // Every file is read and checked before the database is opened.
    let configuration = cfg.configuration(opts);
    let mut failures: Vec<Failure> = Vec::new();
    let mut prepared: Vec<Prepared> = Vec::new();
    for (shown, path) in &files {
        match prepare(
            shown,
            path,
            opts.format.as_deref(),
            configuration.as_deref(),
            opts.case.as_deref(),
        ) {
            Ok(file) => prepared.push(file),
            Err(f) => {
                p.failure(&f);
                p.json_line(&json!({"file": shown, "ok": false, "error": {"code": f.code, "exit": f.exit.code()}}));
                failures.push(f);
            }
        }
    }
    if prepared.is_empty() {
        return Ok(failures[0].exit);
    }

    let user = signed_in(local)?;
    let dir = data_dir(opts, env, local)?;
    let db = open_existing(local, &dir)?;
    let projects = api::list_projects(&db, &user.id).map_err(|e| from_core(&e))?;
    let project = pick_project(&projects, &wanted)?.ok_or_else(|| {
        Failure::new(Exit::NotFound, "project-not-found", "err.project-not-found")
            .arg(wanted.as_str())
    })?;
    let shown_user = if user.display_name.is_empty() {
        &user.email
    } else {
        &user.display_name
    };
    let mode_line = p.t(
        "out.mode-local-project",
        &[
            dir.display().to_string(),
            project.case_id_prefix.clone(),
            project.name.clone(),
            shown_user.clone(),
        ],
    );
    let mode_line = p.dim(&mode_line);
    p.line(&mode_line);
    if opts.dry_run {
        let text = p.t("out.dry-run", &[]);
        p.line(&text);
    }
    p.line("");

    let cycle_id = match cfg.cycle(opts) {
        Some(key) => Some(
            api::find_cycle(&db, &project.id, &user.id, &key)
                .map_err(|e| from_core(&e))?
                .filter(|c| c.status != "closed")
                .ok_or_else(|| {
                    Failure::new(Exit::NotFound, "cycle-not-found", "err.cycle-not-found")
                        .arg(key.as_str())
                })?
                .id,
        ),
        None => None,
    };
    let mut run: Option<(String, String)> = match &opts.run {
        Some(key) => {
            let found = api::find_run(&db, &project.id, &user.id, key)
                .map_err(|e| from_core(&e))?
                .ok_or_else(|| {
                    Failure::new(Exit::NotFound, "run-not-found", "err.run-not-found")
                        .arg(key.as_str())
                })?;
            if found.status != "in_progress" {
                return Err(
                    Failure::new(Exit::NotFound, "run-closed", "err.run-closed").arg(found.key)
                );
            }
            Some((found.id, found.key))
        }
        None => None,
    };
    // Several files go into one new run: it stays open until the last one.
    let keep_open = prepared.len() > 1;
    let mut created = false;
    let mut imported = 0usize;
    let mut unlinked_total = 0u64;

    for file in &prepared {
        let mut request = json!({
            "projectId": project.id, "userId": user.id, "doc": file.doc,
            "sha256": file.sha256,
            "fileName": file.path.file_name().map(|n| n.to_string_lossy().to_string()),
            "allowDuplicate": opts.allow_duplicate,
        });
        match &run {
            Some((id, _)) => request["runId"] = json!(id),
            None => {
                request["newRun"] = json!({
                    "title": opts.run_name, "cycleId": cycle_id, "keepOpen": keep_open
                })
            }
        }
        let request: pharos_core::runs::import::ReportImportRequest =
            serde_json::from_value(request).map_err(|e| {
                Failure::new(Exit::Internal, "internal", "err.internal").detail(e.to_string())
            })?;
        let statuses = by_status(&file.doc);

        if opts.dry_run {
            match api::import_preview(&db, &request) {
                Ok(preview) => {
                    let pv = serde_json::to_value(&preview).unwrap_or_default();
                    let target = run
                        .as_ref()
                        .map(|(_, k)| k.clone())
                        .unwrap_or_else(|| p.t("out.would-create", &[]));
                    print_file(p, file, &target, &pv, &statuses, None);
                    if let Some(dup) = pv["duplicateOf"].as_str() {
                        let text = p.t("out.duplicate-of", &[dup.to_string()]);
                        p.warn(&text);
                    }
                    imported += 1;
                }
                Err(e) => record(p, &mut failures, &file.shown, from_core(&e)),
            }
            continue;
        }

        match api::import_report(&db, &request, &file.bytes[..]) {
            Ok(outcome) => {
                let out = serde_json::to_value(&outcome).unwrap_or_default();
                let run_id = out["runId"].as_str().unwrap_or_default().to_string();
                let run_key = out["runKey"].as_str().unwrap_or_default().to_string();
                let was_new = run.is_none();
                if was_new {
                    created = true;
                    run = Some((run_id, run_key.clone()));
                }
                let stored = attach(&db, file, &out, &user.id, p);
                let target = if was_new {
                    p.t("out.created", &[run_key])
                } else {
                    run_key
                };
                print_file(p, file, &target, &out, &statuses, Some(stored));
                unlinked_total += out["unlinked"].as_u64().unwrap_or(0);
                imported += 1;
            }
            Err(e) if core_code(&e).0 == Some("already-imported") => {
                let key = core_code(&e).1.to_string();
                let mark = p.mark(Mark::Ok);
                let note = p.t("out.already", std::slice::from_ref(&key));
                let note = p.dim(&note);
                p.line(&format!("  {mark} {}   {note}", file.shown));
                p.json_line(&json!({"file": file.shown, "ok": true, "alreadyImported": true, "run": {"key": key}}));
                imported += 1;
            }
            Err(e) => record(p, &mut failures, &file.shown, from_core(&e)),
        }
    }

    if created && keep_open {
        if let Some((id, key)) = &run {
            match api::close_run(&db, id, &user.id) {
                Ok(()) => {
                    let text = p.t("out.closed", std::slice::from_ref(key));
                    let text = p.dim(&text);
                    p.line(&text);
                }
                Err(e) => p.failure(&from_core(&e)),
            }
        }
    }

    p.line("");
    let run_key = run.as_ref().map(|(_, k)| k.clone());
    let exit = if failures.is_empty() {
        Exit::Ok
    } else if imported == 0 {
        failures[0].exit
    } else {
        Exit::Partial
    };
    let summary = if opts.dry_run {
        p.t(
            "out.summary-dry",
            &[imported.to_string(), total.to_string()],
        )
    } else if imported == 0 {
        p.t("out.summary-none", &[])
    } else {
        p.t(
            "out.summary",
            &[
                imported.to_string(),
                total.to_string(),
                run_key.clone().unwrap_or_default(),
            ],
        )
    };
    let summary = p.bold(&summary);
    p.line(&summary);
    if !opts.dry_run && imported > 0 {
        if let Some(key) = &run_key {
            let text = p.t("out.open-in-app", &[project.name.clone(), key.clone()]);
            p.line(&text);
        }
    }
    if unlinked_total > 0 {
        let prefix = project.case_id_prefix.clone();
        let text = p.t("out.unlinked-hint", &[unlinked_total.to_string(), prefix]);
        let text = p.dim(&text);
        p.line(&text);
    }
    if exit == Exit::Partial {
        let text = p.t(
            "err.partial",
            &[failures.len().to_string(), total.to_string()],
        );
        p.warn(&text);
    }
    p.json_line(&json!({"summary": {
        "mode": "local", "project": project.case_id_prefix, "run": run_key,
        "uploaded": imported, "failed": failures.len(), "dryRun": opts.dry_run, "exit": exit.code()
    }}));
    Ok(exit)
}

fn record(p: &mut Printer, failures: &mut Vec<Failure>, shown: &str, f: Failure) {
    let f = Failure {
        args: if f.args.is_empty() && f.key == "err.invalid-report" {
            vec![shown.to_string()]
        } else {
            f.args
        },
        ..f
    };
    p.failure(&f);
    p.json_line(&json!({"file": shown, "ok": false, "error": {"code": f.code, "exit": f.exit.code(), "detail": f.detail}}));
    failures.push(f);
}

/// One file's line and its counts.
fn print_file(
    p: &mut Printer,
    file: &Prepared,
    target: &str,
    out: &Value,
    statuses: &Value,
    stored: Option<usize>,
) {
    let n = |v: &Value| v.as_u64().unwrap_or(0).to_string();
    let mark = p.mark(Mark::Ok);
    let kind = p.dim("Pharos Run JSON");
    let target = p.bold(target);
    p.line(&format!("  {mark} {}   {kind}   {target}", file.shown));
    let counts = p.t(
        "out.counts",
        &[
            n(&out["results"]),
            n(&statuses["passed"]),
            n(&statuses["failed"]),
            n(&statuses["skipped"]),
            n(&out["linked"]),
            n(&out["unlinked"]),
        ],
    );
    p.line(&format!("      {counts}"));
    if let Some(stored) = stored.filter(|s| *s > 0) {
        let text = p.t("out.attachments", &[stored.to_string()]);
        p.line(&format!("      {text}"));
    }
    let warnings = out["warnings"].as_array().cloned().unwrap_or_default();
    if !warnings.is_empty() {
        let text = p.t("out.warnings", &[warnings.len().to_string()]);
        let text = p.dim(&text);
        p.line(&format!("      {text}"));
        for w in warnings.iter().take(5) {
            let line = format!(
                "        {} {}",
                w["code"].as_str().unwrap_or_default(),
                w["testKey"].as_str().unwrap_or_default()
            );
            let line = p.dim(&line);
            p.line(&line);
        }
    }
    p.json_line(&json!({
        "file": file.shown, "ok": true, "format": "pharos_run_json",
        "run": {"id": out["runId"], "key": out["runKey"]},
        "alreadyImported": out["alreadyImported"],
        "counts": {"results": out["results"], "linked": out["linked"], "unlinked": out["unlinked"], "byStatus": statuses},
        "attachments": stored, "warnings": out["warnings"],
    }));
}

/// Stores the report's own attachments (screenshots, traces) found next to it:
/// each `attachments[].path` relative to the report's folder. Missing files
/// are warnings, as in the app.
fn attach(db: &Db, file: &Prepared, out: &Value, user_id: &str, p: &mut Printer) -> usize {
    let mut stored = 0;
    let base = file.path.parent().unwrap_or(Path::new("."));
    let doc_attachments = file.doc["attachments"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    for target in out["attachments"].as_array().into_iter().flatten() {
        let reference = target["ref"].as_str().unwrap_or_default();
        let Some(a) = doc_attachments.iter().find(|a| a["ref"] == reference) else {
            continue;
        };
        let name = a["name"].as_str().unwrap_or(reference);
        let Some(rel) = a["path"].as_str() else {
            continue;
        };
        let path = base.join(rel);
        let result = std::fs::File::open(&path)
            .map_err(|e| e.to_string())
            .and_then(|f| {
                api::import_attach(
                    db,
                    target["ownerEntity"].as_str().unwrap_or_default(),
                    target["ownerId"].as_str().unwrap_or_default(),
                    f,
                    name,
                    a["contentType"].as_str(),
                    a["kind"].as_str(),
                    user_id,
                )
            });
        match result {
            Ok(_) => stored += 1,
            Err(_) => {
                let text = p.t(
                    "err.attachment-missing",
                    &[name.to_string(), path.display().to_string()],
                );
                p.warn(&text);
            }
        }
    }
    stored
}

// ---- projects ----------------------------------------------------------------------

/// `pharos projects` in local mode.
pub fn projects(opts: &Opts, env: &Env, local: &dyn Local, p: &mut Printer) -> Exit {
    let run = || -> Result<Vec<api::ProjectRef>, Failure> {
        let user = signed_in(local)?;
        let dir = data_dir(opts, env, local)?;
        let db = open_existing(local, &dir)?;
        api::list_projects(&db, &user.id).map_err(|e| from_core(&e))
    };
    match run() {
        Ok(list) => {
            if p.json {
                p.json_line(&json!({"projects": list}));
            } else if list.is_empty() {
                let text = p.t("out.projects-none", &[]);
                p.line(&text);
            } else {
                let head = p.t("out.projects-head", &[]);
                let head = p.dim(&head);
                p.line(&head);
                for project in &list {
                    let prefix = project.case_id_prefix.trim_end_matches('-');
                    p.line(&format!("{prefix:<9} {}", project.name));
                }
            }
            Exit::Ok
        }
        Err(f) => {
            p.failure(&f);
            f.exit
        }
    }
}

#[cfg(test)]
mod tests;
