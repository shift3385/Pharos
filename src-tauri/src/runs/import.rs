//! Result import (ING-02..05; ADR-0012, ADR-0013, ADR-0005; design 0.2.0 §4
//! «Importación de un informe»): the one persister of Pharos Run JSON. The
//! parsers live in TypeScript (`src/shared/contracts/pharos-run/importers/`)
//! and send the document they built; this module links each test to a case,
//! gives deterministic ids and writes run, shard, results and step results in
//! one transaction with one `import` audit event.
//!
//! - **Linking.** A test links to a case by its one `@<prefix><n>` tag (the
//!   project's `case_id_prefix`, anchored, case-sensitive; ING-01 §5). None →
//!   the unlinked tray; two or more, a key that is not a live case of the
//!   project, or a case with an open key conflict → unlinked with a warning.
//!   The revision is the target run's item for that case/flow/row when there
//!   is one (the result fulfils it), else the case's synced revision current
//!   at `run.started_at`, else the current one. The flow is the scenario name;
//!   the Outline row and the step ids are only set when they match the
//!   revision exactly (a result attributed to the wrong step can never be
//!   corrected).
//! - **Ids.** Shard `UUIDv5(run ‖ sha256)`, result `UUIDv5(shard ‖ test_key ‖
//!   label ‖ attempt)`, step `UUIDv5(result ‖ position)` (`ids.rs`). The same
//!   file in the same run is a no-op here and on every device.
//! - **Limits.** Those the server checks (title, `test_key`, steps) plus
//!   deterministic truncation of long texts, so no result document ever
//!   exceeds the sync body (`MAX_RESULT_DOC`).
//! - **Evidence.** The raw report is an attachment of the shard (`raw_report`,
//!   90-day retention); the report's own attachments are added afterwards, one
//!   upload at a time, by `run_import_attach` (idempotent by owner and
//!   content). Attachments do not sync yet (ADR-0014).

#[cfg(test)]
mod tests;

use std::collections::{HashMap, HashSet};

use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use tauri::State;
#[cfg(test)]
use ts_rs::TS;
use uuid::Uuid;

use super::derive::instant_ms;
use super::{
    err, ids, insert_run, insert_steps, owned_run, require_open, text, update_run, within,
    RunInput, StepResult, MAX_STEPS, MAX_TEST_KEY, MAX_TITLE, RESULT, RESULT_STATUSES, RUN_SHARD,
};
use crate::db::{ensure_workspace, Db};
use crate::evidence::{self, EvidenceStore, Stored};
use crate::journal::{self, Action, Actor};
use crate::project;

/// Formats a shard may come from through this importer.
const FORMATS: [&str; 5] = [
    "cucumber_messages",
    "ctrf",
    "junit",
    "playwright_json",
    "pharos_run_json",
];

/// Results per import (one transaction, one call), as the TS side checks.
pub(crate) const MAX_IMPORT_RESULTS: usize = 20_000;
/// Long texts are cut (deterministically, so two devices store the same).
pub(crate) const MAX_ERROR_MESSAGE: usize = 8_000;
pub(crate) const MAX_ERROR_TRACE: usize = 64_000;
pub(crate) const MAX_STEP_TEXT: usize = 4_000;
pub(crate) const MAX_LABEL: usize = 200;
pub(crate) const MAX_ATTRIBUTES: usize = 16 * 1024;
/// Largest result document (with its steps): far below the 8 MiB sync body,
/// so it always fits a push (the desktop targets 512 KiB batches).
pub(crate) const MAX_RESULT_DOC: usize = 1024 * 1024;

// ---- the document ------------------------------------------------------------

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Doc {
    #[serde(default)]
    run: DocRun,
    #[serde(default)]
    shards: Vec<DocShard>,
    #[serde(default)]
    results: Vec<DocResult>,
    #[serde(default)]
    attachments: Vec<DocAttachment>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DocRun {
    title: Option<String>,
    source_tool: Option<String>,
    source_tool_version: Option<String>,
    environment: Option<String>,
    build: Option<String>,
    commit_sha: Option<String>,
    branch: Option<String>,
    repository_url: Option<String>,
    ci_url: Option<String>,
    dataset: Option<String>,
    started_at: Option<Value>,
    finished_at: Option<Value>,
    context: Option<Value>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DocShard {
    shard_index: Option<i64>,
    shard_total: Option<i64>,
    source_format: Option<String>,
    format_version: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DocStep {
    name: Option<String>,
    text: Option<String>,
    status: String,
    keyword: Option<String>,
    actual: Option<String>,
    duration_ms: Option<f64>,
    gherkin_line: Option<i64>,
    #[serde(default)]
    attachments: Vec<Value>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DocResult {
    name: String,
    status: String,
    raw_status: Option<String>,
    test_key: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    attempt: Option<i64>,
    configuration_label: Option<String>,
    browser: Option<String>,
    external_id: Option<String>,
    case_key: Option<String>,
    example_row: Option<i64>,
    example_values: Option<Value>,
    duration: Option<f64>,
    started_at: Option<Value>,
    finished_at: Option<Value>,
    start: Option<Value>,
    stop: Option<Value>,
    message: Option<String>,
    trace: Option<String>,
    flaky: Option<bool>,
    suite: Option<Value>,
    file_path: Option<String>,
    #[serde(default)]
    steps: Vec<DocStep>,
    #[serde(default)]
    attachments: Vec<Value>,
    attributes: Option<Map<String, Value>>,
    /// Keys this persister does not know: kept in `attributes`.
    #[serde(flatten)]
    rest: Map<String, Value>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DocAttachment {
    #[serde(rename = "ref")]
    reference: String,
}

/// Keys of a result that have their own column or a place in `attributes`.
const KNOWN_KEYS: [&str; 4] = ["shardRef", "retries", "type", "device"];

// ---- requests and answers ----------------------------------------------------

/// The fields of a run created by an import; the rest comes from the report.
#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportNewRun {
    pub(crate) title: Option<String>,
    pub(crate) environment: Option<String>,
    pub(crate) build: Option<String>,
    pub(crate) commit_sha: Option<String>,
    pub(crate) branch: Option<String>,
    /// Leave the run `in_progress` so more shards can be imported into it.
    pub(crate) keep_open: Option<bool>,
}

/// An import: the report as Pharos Run JSON and where it goes. Exactly one of
/// `runId` (an open run of the project) and `newRun`.
#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReportImportRequest {
    pub(crate) project_id: String,
    pub(crate) user_id: String,
    pub(crate) run_id: Option<String>,
    pub(crate) new_run: Option<ImportNewRun>,
    /// The parsed report (Pharos Run JSON 1.x, validated by `parsePharosRun`).
    #[cfg_attr(test, ts(type = "Record<string, unknown>"))]
    pub(crate) doc: Value,
    /// sha256 of the report file, as the UI computed it (checked against the
    /// uploaded raw report on commit).
    pub(crate) sha256: String,
    pub(crate) file_name: Option<String>,
    pub(crate) shard_index: Option<i64>,
    pub(crate) shard_total: Option<i64>,
    /// Import a file this project already has as another new run.
    pub(crate) allow_duplicate: Option<bool>,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReportImportWarning {
    /// `two-case-tags` | `unknown-case` | `case-key-conflict` | `row-not-found`
    /// | `duplicate-test` | `key-too-long` | `text-truncated` | `result-too-large`.
    pub(crate) code: String,
    pub(crate) test_key: Option<String>,
    pub(crate) detail: Option<String>,
}

/// What an import will do, without writing anything.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReportImportPreview {
    pub(crate) format: String,
    /// Distinct tests (`test_key` × configuration) and attempts.
    pub(crate) tests: usize,
    pub(crate) results: usize,
    pub(crate) linked: usize,
    pub(crate) unlinked: usize,
    pub(crate) attachments: usize,
    /// Final status of each test, counted.
    #[cfg_attr(test, ts(type = "Record<string, number>"))]
    pub(crate) statuses: Value,
    /// A run of this project already holding this file (key), if any. Local
    /// only: another device's import is not known until it syncs.
    pub(crate) duplicate_of: Option<String>,
    pub(crate) warnings: Vec<ReportImportWarning>,
}

/// Where an attachment of the report goes once uploaded.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentTarget {
    #[serde(rename = "ref")]
    #[cfg_attr(test, ts(rename = "ref"))]
    pub(crate) reference: String,
    /// `result` or `step_result`.
    pub(crate) owner_entity: String,
    pub(crate) owner_id: String,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReportImportOutcome {
    pub(crate) run_id: String,
    pub(crate) run_key: String,
    pub(crate) shard_id: String,
    /// The file was already in that run: nothing was written.
    pub(crate) already_imported: bool,
    pub(crate) results: usize,
    pub(crate) linked: usize,
    pub(crate) unlinked: usize,
    pub(crate) attachments: Vec<AttachmentTarget>,
    pub(crate) warnings: Vec<ReportImportWarning>,
}

/// One `test_key` of the project's tray (ING-05).
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UnlinkedTest {
    pub(crate) test_key: String,
    /// The test's own name, as the report gave it.
    pub(crate) name: String,
    pub(crate) results: i64,
    pub(crate) last_status: String,
    pub(crate) last_run_id: String,
    pub(crate) last_run_key: Option<String>,
    pub(crate) last_seen: String,
    /// Why the import did not link it: `no-tag` | `two-case-tags` |
    /// `unknown-case` | `case-key-conflict`.
    pub(crate) reason: Option<String>,
    /// The case tag the report carried (for `unknown-case`).
    pub(crate) case_key: Option<String>,
    /// The case a later link (`unlinked_mapping`) points at, if any.
    pub(crate) mapped_case_id: Option<String>,
}

// ---- helpers -------------------------------------------------------------------

/// `s` cut to `max` UTF-16 units (as zod counts), ending in "…" when cut.
pub(crate) fn clip(s: &str, max: usize) -> (String, bool) {
    if s.encode_utf16().count() <= max {
        return (s.to_string(), false);
    }
    let mut out = String::new();
    let mut units = 0;
    for ch in s.chars() {
        let n = ch.len_utf16();
        if units + n > max.saturating_sub(1) {
            break;
        }
        units += n;
        out.push(ch);
    }
    out.push('…');
    (out, true)
}

/// A `test_key` within the server's limit: a longer one keeps its start and a
/// hash of the whole, so it stays unique and deterministic.
fn bounded_key(key: &str) -> (String, bool) {
    if key.encode_utf16().count() <= MAX_TEST_KEY {
        return (key.to_string(), false);
    }
    let hash = evidence::hex(&Sha256::digest(key.as_bytes()));
    let (head, _) = clip(key, MAX_TEST_KEY - 20);
    (format!("{head}#{}", &hash[..16]), true)
}

/// An ISO time from a document time (text, or epoch ms as CTRF sends it).
fn time_of(v: Option<&Value>) -> Option<String> {
    match v? {
        Value::String(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
        Value::Number(n) => {
            let ms = n.as_f64()?;
            (ms.is_finite() && ms >= 0.0).then(|| iso_of_ms(ms as i64))
        }
        _ => None,
    }
}

/// Epoch milliseconds as RFC 3339 UTC (`2026-10-27T03:52:07.031Z`).
fn iso_of_ms(ms: i64) -> String {
    let days = ms.div_euclid(86_400_000);
    let rem = ms.rem_euclid(86_400_000);
    // Civil from days (H. Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z",
        rem / 3_600_000,
        rem / 60_000 % 60,
        rem / 1000 % 60,
        rem % 1000
    )
}

/// A result status of the model: CTRF's `pending` is stored as `skipped`
/// (with its raw status), anything unknown as `other`.
fn status_of(s: &str) -> &'static str {
    match s {
        "pending" => "skipped",
        s => RESULT_STATUSES
            .iter()
            .copied()
            .find(|x| *x == s)
            .unwrap_or("other"),
    }
}

/// Gherkin keywords a CTRF/Playwright step title starts with (English and
/// Spanish, the app's languages).
const KEYWORDS: [&str; 12] = [
    "Given", "When", "Then", "And", "But", "*", "Dado", "Dada", "Cuando", "Entonces", "Y", "Pero",
];

/// `(keyword, text)` of a step that may carry its keyword in the text.
fn split_keyword(keyword: Option<&str>, text: &str) -> (Option<String>, String) {
    if let Some(k) = keyword.map(str::trim).filter(|k| !k.is_empty()) {
        return (Some(k.to_string()), text.to_string());
    }
    for k in KEYWORDS {
        if let Some(rest) = text.strip_prefix(k).and_then(|r| r.strip_prefix(' ')) {
            return (Some(k.to_string()), rest.to_string());
        }
    }
    (None, text.to_string())
}

/// The scenario a test belongs to: an Outline row's test is titled
/// `Example #n` (Playwright, CTRF) or `<name> - #b.f` (cucumber-js JUnit).
fn scenario_name(r: &DocResult) -> String {
    let example = Regex::new(r"^Example #\d+$").expect("static regex");
    if example.is_match(&r.name) {
        if let Some(last) = suite_of(r).last() {
            return last.clone();
        }
    }
    let cucumber = Regex::new(r" - #\d+\.\d+(:.*)?$").expect("static regex");
    cucumber.replace(&r.name, "").to_string()
}

fn suite_of(r: &DocResult) -> Vec<String> {
    match &r.suite {
        Some(Value::Array(a)) => a
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        Some(Value::String(s)) => s.split(" > ").map(String::from).collect(),
        _ => Vec::new(),
    }
}

/// The step texts of one flow of a revision, in execution order: the
/// background, then the flow's (or the case's) preconditions and steps.
fn ordered_steps(data: &Value, flow_id: Option<&str>) -> Vec<(String, String)> {
    let list = |v: Option<&Value>| -> Vec<(String, String)> {
        v.and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|s| {
                Some((
                    s.get("id")?.as_str()?.to_string(),
                    s.get("text")?.as_str()?.to_string(),
                ))
            })
            .collect()
    };
    let mut out = list(data.get("background"));
    let scope = match flow_id {
        None => data,
        Some(id) => match data.get("flows").and_then(Value::as_array).and_then(|f| {
            f.iter()
                .find(|x| x.get("id").and_then(Value::as_str) == Some(id))
        }) {
            Some(flow) => flow,
            None => return out,
        },
    };
    out.extend(list(scope.get("preconditions")));
    out.extend(list(scope.get("steps")));
    out
}

/// A revision step text as a pattern: an Outline's `<param>` matches any
/// value, everything else literally.
fn step_pattern(text: &str) -> Regex {
    let parts: Vec<String> = Regex::new(r"<[^<>]+>")
        .expect("static regex")
        .split(text.trim())
        .map(regex::escape)
        .collect();
    Regex::new(&format!("^{}$", parts.join(".*?"))).expect("escaped pattern")
}

fn ref_of(v: &Value) -> Option<String> {
    v.as_str().map(String::from)
}

// ---- linking -----------------------------------------------------------------

/// A run item by what it plans: (case, flow, row).
type ItemKey = (String, Option<String>, Option<String>);

struct CaseRef {
    id: String,
    key_conflict: bool,
}

/// Per-import caches over the project's cases and revisions.
struct Linker<'c> {
    conn: &'c Connection,
    project_id: String,
    user: String,
    tag: Regex,
    started_at_ms: Option<i64>,
    cases: HashMap<String, Option<CaseRef>>,
    revisions: HashMap<String, Option<(String, Value)>>,
    /// Run items of the target run: (case, flow, row) → (item, revision).
    items: HashMap<ItemKey, Vec<(String, String)>>,
}

struct Link {
    case_id: Option<String>,
    case_key: Option<String>,
    revision_id: Option<String>,
    case_revision: Option<i64>,
    run_item_id: Option<String>,
    flow_id: Option<String>,
    example_row_id: Option<String>,
    /// Revision step ids by position, when the texts match.
    step_ids: Vec<Option<String>>,
    reason: Option<&'static str>,
}

impl Link {
    /// No case (the tray), or not looked up (a re-import that writes nothing).
    fn none(steps: usize, reason: Option<&'static str>) -> Self {
        Link {
            case_id: None,
            case_key: None,
            revision_id: None,
            case_revision: None,
            run_item_id: None,
            flow_id: None,
            example_row_id: None,
            step_ids: vec![None; steps],
            reason,
        }
    }
}

impl<'c> Linker<'c> {
    fn new(
        conn: &'c Connection,
        project_id: &str,
        user: &str,
        run_id: Option<&str>,
        started_at: Option<&str>,
    ) -> Result<Self, String> {
        let prefix: String = conn
            .query_row(
                "SELECT case_id_prefix FROM projects WHERE id = ?1",
                params![project_id],
                |r| r.get(0),
            )
            .map_err(err)?;
        let tag = Regex::new(&format!("^@({}[0-9]{{1,9}})$", regex::escape(&prefix)))
            .map_err(|e| e.to_string())?;
        let mut items: HashMap<ItemKey, Vec<(String, String)>> = HashMap::new();
        if let Some(run) = run_id {
            let mut stmt = conn
                .prepare(
                    "SELECT id, test_case_id, test_case_revision_id, flow_id, example_row_id
                       FROM run_items WHERE run_id = ?1 AND deleted_at IS NULL ORDER BY position",
                )
                .map_err(err)?;
            let rows = stmt
                .query_map(params![run], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, Option<String>>(3)?,
                        r.get::<_, Option<String>>(4)?,
                    ))
                })
                .map_err(err)?;
            for row in rows {
                let (id, case, rev, flow, ex) = row.map_err(err)?;
                items.entry((case, flow, ex)).or_default().push((id, rev));
            }
        }
        Ok(Linker {
            conn,
            project_id: project_id.to_string(),
            user: user.to_string(),
            tag,
            started_at_ms: started_at.and_then(instant_ms),
            cases: HashMap::new(),
            revisions: HashMap::new(),
            items,
        })
    }

    /// The case keys among a test's tags.
    fn case_keys(&self, r: &DocResult) -> Vec<String> {
        let mut keys: Vec<String> = r
            .tags
            .iter()
            .filter_map(|t| self.tag.captures(t.trim()).map(|c| c[1].to_string()))
            .collect();
        if let Some(k) = r
            .case_key
            .as_deref()
            .map(str::trim)
            .filter(|k| !k.is_empty())
        {
            keys.push(k.to_string());
        }
        keys.sort();
        keys.dedup();
        keys
    }

    fn case(&mut self, key: &str) -> Result<Option<&CaseRef>, String> {
        if !self.cases.contains_key(key) {
            let found = self
                .conn
                .query_row(
                    "SELECT c.id, EXISTS (SELECT 1 FROM key_conflicts k WHERE k.entity = 'test_case'
                            AND k.entity_id = c.id AND k.resolved_at IS NULL)
                       FROM test_cases c
                      WHERE c.project_id = ?1 AND c.scenario_id = ?2 AND c.deleted_at IS NULL
                      ORDER BY c.created_at, c.rowid LIMIT 1",
                    params![self.project_id, key],
                    |r| {
                        Ok(CaseRef {
                            id: r.get(0)?,
                            key_conflict: r.get(1)?,
                        })
                    },
                )
                .optional()
                .map_err(err)?;
            self.cases.insert(key.to_string(), found);
        }
        Ok(self.cases.get(key).and_then(Option::as_ref))
    }

    /// The synced revision of a case current at the run's start, else the
    /// current one (created now if missing).
    fn revision(&mut self, case_id: &str) -> Result<Option<(String, Value)>, String> {
        if let Some(r) = self.revisions.get(case_id) {
            return Ok(r.clone());
        }
        let mut chosen: Option<String> = None;
        if let Some(at) = self.started_at_ms {
            let mut stmt = self
                .conn
                .prepare(
                    "SELECT id, created_at FROM test_case_revisions
                      WHERE test_case_id = ?1 AND content_sha256 IS NOT NULL
                      ORDER BY revision DESC, created_at DESC",
                )
                .map_err(err)?;
            let rows = stmt
                .query_map(params![case_id], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
                })
                .map_err(err)?;
            for row in rows {
                let (id, created) = row.map_err(err)?;
                if instant_ms(&created).is_some_and(|c| c <= at) {
                    chosen = Some(id);
                    break;
                }
            }
        }
        let id = match chosen {
            Some(id) => Some(id),
            None => crate::revisions::ensure_current(self.conn, case_id, &self.user, true)?,
        };
        let out = match id {
            Some(id) => {
                let data: Option<String> = self
                    .conn
                    .query_row(
                        "SELECT data FROM test_case_revisions WHERE id = ?1",
                        params![id],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(err)?;
                let data = data
                    .and_then(|d| serde_json::from_str(&d).ok())
                    .unwrap_or(Value::Null);
                Some((id, data))
            }
            None => None,
        };
        self.revisions.insert(case_id.to_string(), out.clone());
        Ok(out)
    }

    fn link(
        &mut self,
        r: &DocResult,
        steps: &[(Option<String>, String)],
        warn: &mut Vec<ReportImportWarning>,
        key: &str,
    ) -> Result<Link, String> {
        let mut link = Link::none(steps.len(), None);
        let keys = self.case_keys(r);
        let w = |code: &str, detail: Option<String>| ReportImportWarning {
            code: code.into(),
            test_key: Some(key.to_string()),
            detail,
        };
        match keys.len() {
            0 => {
                link.reason = Some("no-tag");
                return Ok(link);
            }
            1 => {}
            _ => {
                link.reason = Some("two-case-tags");
                warn.push(w("two-case-tags", Some(keys.join(", "))));
                return Ok(link);
            }
        }
        let case_key = keys[0].clone();
        link.case_key = Some(case_key.clone());
        let case = match self.case(&case_key)? {
            None => {
                link.reason = Some("unknown-case");
                warn.push(w("unknown-case", Some(case_key)));
                return Ok(link);
            }
            Some(c) if c.key_conflict => {
                link.reason = Some("case-key-conflict");
                warn.push(w("case-key-conflict", Some(case_key)));
                return Ok(link);
            }
            Some(c) => c.id.clone(),
        };
        let Some((mut revision_id, mut data)) = self.revision(&case)? else {
            link.reason = Some("unknown-case");
            return Ok(link);
        };
        // The flow: an advanced case's flow named like the scenario.
        let scenario = scenario_name(r);
        let flow_id = data
            .get("flows")
            .and_then(Value::as_array)
            .and_then(|flows| {
                flows.iter().find(|f| {
                    f.get("name").and_then(Value::as_str).map(str::trim) == Some(scenario.trim())
                })
            })
            .and_then(|f| f.get("id").and_then(Value::as_str).map(String::from));
        let rows_of = |data: &Value, flow: Option<&str>| -> Vec<String> {
            let scope = match flow {
                None => Some(data),
                Some(id) => data.get("flows").and_then(Value::as_array).and_then(|f| {
                    f.iter()
                        .find(|x| x.get("id").and_then(Value::as_str) == Some(id))
                }),
            };
            scope
                .and_then(|s| s.get("examples"))
                .and_then(|e| e.get("rows"))
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|row| row.get("id").and_then(Value::as_str).map(String::from))
                .collect()
        };
        let mut row_id = None;
        if let Some(n) = r.example_row {
            let rows = rows_of(&data, flow_id.as_deref());
            row_id = usize::try_from(n).ok().and_then(|n| rows.get(n).cloned());
            if row_id.is_none() {
                warn.push(w("row-not-found", Some(format!("{}", n + 1))));
            }
        }
        // A run item of the target run for exactly this case, flow and row:
        // the result fulfils it, against the item's frozen revision.
        if let Some(found) = self
            .items
            .get(&(case.clone(), flow_id.clone(), row_id.clone()))
            .filter(|v| v.len() == 1)
        {
            let (item, rev) = found[0].clone();
            if rev != revision_id {
                let d: Option<String> = self
                    .conn
                    .query_row(
                        "SELECT data FROM test_case_revisions WHERE id = ?1",
                        params![rev],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(err)?;
                data = d
                    .and_then(|d| serde_json::from_str(&d).ok())
                    .unwrap_or(Value::Null);
                revision_id = rev;
            }
            link.run_item_id = Some(item);
        }
        let ordered = ordered_steps(&data, flow_id.as_deref());
        for (i, (_, step_text)) in steps.iter().enumerate() {
            if let Some((id, rev_text)) = ordered.get(i) {
                if step_pattern(rev_text).is_match(step_text.trim()) {
                    link.step_ids[i] = Some(id.clone());
                }
            }
        }
        link.case_revision = self
            .conn
            .query_row(
                "SELECT revision FROM test_case_revisions WHERE id = ?1",
                params![revision_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?;
        link.case_id = Some(case);
        link.revision_id = Some(revision_id);
        link.flow_id = flow_id;
        link.example_row_id = row_id;
        Ok(link)
    }
}

// ---- planning ----------------------------------------------------------------

/// One result as it will be written.
struct Planned {
    id: String,
    test_key: String,
    label: Option<String>,
    attempt: i64,
    status: String,
    raw_status: Option<String>,
    duration_ms: Option<i64>,
    started_at: Option<String>,
    finished_at: Option<String>,
    error_message: Option<String>,
    error_trace: Option<String>,
    external_id: Option<String>,
    example_row: Option<i64>,
    example_values: Option<String>,
    attributes: Value,
    link: Link,
    steps: Vec<StepResult>,
    attachment_refs: Vec<String>,
    step_attachment_refs: Vec<(usize, String)>,
}

struct Plan {
    /// `tool:<name>`: who ran the tests (ADR-0013), the same on every device.
    executed_by: String,
    format: String,
    format_version: Option<String>,
    shard_index: Option<i64>,
    shard_total: Option<i64>,
    results: Vec<Planned>,
    attachments: usize,
    warnings: Vec<ReportImportWarning>,
}

impl Plan {
    fn linked(&self) -> usize {
        self.results
            .iter()
            .filter(|p| p.link.case_id.is_some())
            .count()
    }
}

fn parse_doc(doc: &Value) -> Result<Doc, String> {
    let version = doc
        .get("schemaVersion")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if version.split('.').next() != Some("1") {
        return Err(format!(
            "unsupported-version: Pharos Run JSON {version}; this build reads 1.x"
        ));
    }
    let doc: Doc =
        serde_json::from_value(doc.clone()).map_err(|e| format!("invalid-report: {e}"))?;
    if doc.results.len() > MAX_IMPORT_RESULTS {
        return Err(format!(
            "too-large: at most {MAX_IMPORT_RESULTS} results per import"
        ));
    }
    Ok(doc)
}

/// Builds what will be written, linking every result unless `link` is false
/// (a re-import only needs the ids). The preview of a new run computes its ids
/// against a placeholder shard: only the counts and warnings are shown.
fn plan(
    conn: &Connection,
    req: &ReportImportRequest,
    doc: &Doc,
    run: Option<(&str, Option<&str>)>,
    shard_id: &str,
    link: bool,
) -> Result<Plan, String> {
    let shard = doc.shards.first();
    let format = shard
        .and_then(|s| s.source_format.clone())
        .unwrap_or_else(|| "pharos_run_json".into());
    if !FORMATS.contains(&format.as_str()) {
        return Err(format!("unknown source format: {format}"));
    }
    let started = run
        .and_then(|(_, s)| s.map(String::from))
        .or_else(|| time_of(doc.run.started_at.as_ref()));
    let mut linker = if link {
        Some(Linker::new(
            conn,
            &req.project_id,
            &req.user_id,
            run.map(|(id, _)| id),
            started.as_deref(),
        )?)
    } else {
        None
    };
    let known: HashSet<String> = doc
        .attachments
        .iter()
        .map(|a| a.reference.clone())
        .collect();
    let mut warnings = Vec::new();
    let mut seen: HashMap<String, usize> = HashMap::new();
    let mut ids_seen: HashSet<String> = HashSet::new();
    let mut out = Vec::with_capacity(doc.results.len());
    for r in &doc.results {
        let raw_key = r.test_key.clone().unwrap_or_default();
        let raw_key = raw_key.trim();
        if raw_key.is_empty() {
            return Err(format!("testKey is required: {}", r.name));
        }
        let (mut key, long) = bounded_key(raw_key);
        if long {
            warnings.push(ReportImportWarning {
                code: "key-too-long".into(),
                test_key: Some(key.clone()),
                detail: None,
            });
        }
        let label = text(&r.configuration_label)
            .or_else(|| text(&r.browser))
            .map(|l| clip(&l, MAX_LABEL).0);
        let attempt = r.attempt.unwrap_or(0).max(0);
        // Two tests of one file with the same key, label and attempt (a
        // parametrized JUnit case, say) stay two tests: the n-th repeat gets
        // ` #n`, the same on every device.
        let mut id = ids::imported_result_id(shard_id, &key, label.as_deref(), attempt);
        if !ids_seen.insert(id.clone()) {
            let n = seen
                .entry(format!(
                    "{key}\u{0}{}\u{0}{attempt}",
                    label.clone().unwrap_or_default()
                ))
                .or_insert(1);
            loop {
                *n += 1;
                let candidate = format!("{key} #{n}");
                let cid = ids::imported_result_id(shard_id, &candidate, label.as_deref(), attempt);
                if ids_seen.insert(cid.clone()) {
                    warnings.push(ReportImportWarning {
                        code: "duplicate-test".into(),
                        test_key: Some(candidate.clone()),
                        detail: None,
                    });
                    key = candidate;
                    id = cid;
                    break;
                }
            }
        }
        if r.steps.len() > MAX_STEPS {
            return Err(format!("steps-too-many: at most {MAX_STEPS} steps ({key})"));
        }
        let mut truncated = false;
        let steps_in: Vec<(Option<String>, String)> = r
            .steps
            .iter()
            .map(|s| {
                let t = s
                    .text
                    .clone()
                    .or_else(|| s.name.clone())
                    .unwrap_or_default();
                split_keyword(s.keyword.as_deref(), &t)
            })
            .collect();
        let link = match linker.as_mut() {
            Some(l) => l.link(r, &steps_in, &mut warnings, &key)?,
            None => Link::none(steps_in.len(), None),
        };
        let mut steps = Vec::with_capacity(r.steps.len());
        let mut step_attachment_refs = Vec::new();
        for (i, (s, (keyword, step_text))) in r.steps.iter().zip(steps_in.iter()).enumerate() {
            let (t, a) = clip(step_text, MAX_STEP_TEXT);
            let actual = s.actual.as_deref().map(|x| clip(x, MAX_STEP_TEXT));
            truncated |= a || actual.as_ref().is_some_and(|x| x.1);
            steps.push(StepResult {
                id: ids::imported_step_result_id(&id, i as i64),
                position: i as i64,
                step_id: link.step_ids[i].clone(),
                keyword: keyword.clone(),
                text: t,
                status: status_of(&s.status).to_string(),
                actual: actual.map(|x| x.0),
                duration_ms: s
                    .duration_ms
                    .filter(|d| d.is_finite() && *d >= 0.0)
                    .map(|d| d.round() as i64),
                gherkin_line: s.gherkin_line,
            });
            for a in &s.attachments {
                if let Some(rf) = ref_of(a).filter(|x| known.contains(x)) {
                    step_attachment_refs.push((i, rf));
                }
            }
        }
        let message = r.message.as_deref().map(|m| clip(m, MAX_ERROR_MESSAGE));
        let trace = r.trace.as_deref().map(|m| clip(m, MAX_ERROR_TRACE));
        truncated |= message.as_ref().is_some_and(|x| x.1) || trace.as_ref().is_some_and(|x| x.1);
        // attributes: the document's own, the tool's flaky, what has no
        // column (name, tags, file, suite) and the unknown keys.
        let mut attrs = r.attributes.clone().unwrap_or_default();
        attrs.insert("name".into(), json!(clip(&r.name, MAX_TITLE).0));
        if !r.tags.is_empty() {
            attrs.insert("tags".into(), json!(r.tags));
        }
        if let Some(p) = &r.file_path {
            attrs.insert("filePath".into(), json!(p));
        }
        let suite = suite_of(r);
        if !suite.is_empty() {
            attrs.insert("suite".into(), json!(suite));
        }
        if let Some(f) = r.flaky {
            attrs.insert("flaky".into(), json!(f));
        }
        if let Some(reason) = link.reason {
            attrs.insert("link".into(), json!(reason));
        }
        for (k, v) in &r.rest {
            if !KNOWN_KEYS.contains(&k.as_str()) && !attrs.contains_key(k) {
                attrs.insert(k.clone(), v.clone());
            }
        }
        let mut attributes = Value::Object(attrs);
        if attributes.to_string().len() > MAX_ATTRIBUTES {
            // Keep what the model reads (flaky, the link) and say so.
            let a = &attributes;
            attributes = json!({
                "name": a.get("name"), "flaky": a.get("flaky"), "link": a.get("link"),
                "attributesTruncated": true,
            });
            truncated = true;
        }
        let mut planned = Planned {
            id,
            test_key: key.clone(),
            label,
            attempt,
            status: status_of(&r.status).to_string(),
            raw_status: text(&r.raw_status)
                .or_else(|| (r.status == "pending").then(|| "pending".into())),
            duration_ms: r
                .duration
                .filter(|d| d.is_finite() && *d >= 0.0)
                .map(|d| d.round() as i64),
            started_at: time_of(r.started_at.as_ref().or(r.start.as_ref())),
            finished_at: time_of(r.finished_at.as_ref().or(r.stop.as_ref())),
            error_message: message.map(|x| x.0),
            error_trace: trace.map(|x| x.0),
            external_id: text(&r.external_id).map(|x| clip(&x, MAX_LABEL).0),
            example_row: r.example_row,
            example_values: r
                .example_values
                .as_ref()
                .filter(|v| !v.is_null())
                .map(Value::to_string),
            attributes,
            link,
            steps,
            attachment_refs: r
                .attachments
                .iter()
                .filter_map(ref_of)
                .filter(|x| known.contains(x))
                .collect(),
            step_attachment_refs,
        };
        if doc_size(&planned) > MAX_RESULT_DOC {
            for s in &mut planned.steps {
                s.actual = None;
            }
            truncated = true;
        }
        if doc_size(&planned) > MAX_RESULT_DOC {
            warnings.push(ReportImportWarning {
                code: "result-too-large".into(),
                test_key: Some(key),
                detail: None,
            });
            continue;
        }
        if truncated {
            warnings.push(ReportImportWarning {
                code: "text-truncated".into(),
                test_key: Some(key),
                detail: None,
            });
        }
        out.push(planned);
    }
    let executed_by = format!(
        "tool:{}",
        text(&doc.run.source_tool).unwrap_or_else(|| format.clone())
    );
    Ok(Plan {
        executed_by: clip(&executed_by, MAX_LABEL).0,
        format,
        format_version: shard.and_then(|s| s.format_version.clone()),
        shard_index: req.shard_index.or(shard.and_then(|s| s.shard_index)),
        shard_total: req.shard_total.or(shard.and_then(|s| s.shard_total)),
        results: out,
        attachments: doc.attachments.len(),
        warnings,
    })
}

/// Bytes of the texts of a result document (a close upper bound of its JSON).
fn doc_size(p: &Planned) -> usize {
    let s = |o: &Option<String>| o.as_ref().map_or(0, |x| x.len() * 2);
    let steps: usize = p
        .steps
        .iter()
        .map(|st| 256 + st.text.len() * 2 + s(&st.actual) + s(&st.keyword))
        .sum();
    2048 + p.test_key.len() * 2
        + s(&p.error_message)
        + s(&p.error_trace)
        + p.attributes.to_string().len()
        + p.example_values.as_ref().map_or(0, String::len)
        + steps
}

/// A run of the project already holding this file (its key), if any.
fn duplicate_of(
    conn: &Connection,
    project_id: &str,
    sha256: &str,
) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT r.run_key FROM run_shards s JOIN runs r ON r.id = s.run_id
          WHERE s.project_id = ?1 AND s.source_file_sha256 = ?2 AND r.deleted_at IS NULL
          ORDER BY s.imported_at LIMIT 1",
        params![project_id, sha256.to_ascii_lowercase()],
        |r| r.get(0),
    )
    .optional()
    .map_err(err)
}

fn check_sha(sha: &str) -> Result<String, String> {
    let sha = sha.trim().to_ascii_lowercase();
    if sha.len() != 64 || !sha.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("sha256 must be 64 hex characters".into());
    }
    Ok(sha)
}

fn statuses_of(p: &Plan) -> Value {
    // The final attempt of each test: the highest attempt (a preview has no
    // times to order by beyond what the tool numbered).
    let mut finals: HashMap<(String, String), (i64, String)> = HashMap::new();
    for r in &p.results {
        let k = (r.test_key.clone(), r.label.clone().unwrap_or_default());
        let e = finals.entry(k).or_insert((r.attempt, r.status.clone()));
        if r.attempt >= e.0 {
            *e = (r.attempt, r.status.clone());
        }
    }
    let mut counts: Map<String, Value> = Map::new();
    for (_, status) in finals.values() {
        let n = counts.get(status).and_then(Value::as_i64).unwrap_or(0);
        counts.insert(status.clone(), json!(n + 1));
    }
    Value::Object(counts)
}

fn tests_of(p: &Plan) -> usize {
    p.results
        .iter()
        .map(|r| (r.test_key.as_str(), r.label.as_deref().unwrap_or("")))
        .collect::<HashSet<_>>()
        .len()
}

// ---- preview and commit ------------------------------------------------------

/// What `commit` would do; writes nothing (the caller rolls back, since
/// freezing a case's current revision may write it).
pub(crate) fn preview(
    conn: &Connection,
    req: &ReportImportRequest,
) -> Result<ReportImportPreview, String> {
    if !project::owns(conn, &req.project_id, &req.user_id)? {
        return Err("project not found".into());
    }
    let sha = check_sha(&req.sha256)?;
    let doc = parse_doc(&req.doc)?;
    let run = match &req.run_id {
        Some(id) => {
            let (project, status) = owned_run(conn, id, &req.user_id)?;
            if project != req.project_id {
                return Err("run not found".into());
            }
            require_open(&status)?;
            let started: Option<String> = conn
                .query_row(
                    "SELECT started_at FROM runs WHERE id = ?1",
                    params![id],
                    |r| r.get(0),
                )
                .map_err(err)?;
            Some((id.clone(), started))
        }
        None => None,
    };
    let shard_id = ids::shard_id(run.as_ref().map_or("preview", |(id, _)| id.as_str()), &sha);
    let p = plan(
        conn,
        req,
        &doc,
        run.as_ref().map(|(id, s)| (id.as_str(), s.as_deref())),
        &shard_id,
        true,
    )?;
    let duplicate = match &run {
        Some((id, _)) => conn
            .query_row(
                "SELECT r.run_key FROM run_shards s JOIN runs r ON r.id = s.run_id WHERE s.id = ?1",
                params![ids::shard_id(id, &sha)],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?,
        None => duplicate_of(conn, &req.project_id, &sha)?,
    };
    Ok(ReportImportPreview {
        format: p.format.clone(),
        tests: tests_of(&p),
        results: p.results.len(),
        linked: p.linked(),
        unlinked: p.results.len() - p.linked(),
        attachments: p.attachments,
        statuses: statuses_of(&p),
        duplicate_of: duplicate,
        warnings: p.warnings,
    })
}

/// Attachment targets of a shard's results (for a re-import that finishes the
/// attachments an interrupted import left).
fn targets(
    conn: &Connection,
    shard_id: &str,
    plan: &Plan,
) -> Result<Vec<AttachmentTarget>, String> {
    let mut out = Vec::new();
    for p in &plan.results {
        let here: bool = conn
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM results WHERE id = ?1 AND shard_id = ?2)",
                params![p.id, shard_id],
                |r| r.get(0),
            )
            .map_err(err)?;
        if !here {
            continue;
        }
        for rf in &p.attachment_refs {
            out.push(AttachmentTarget {
                reference: rf.clone(),
                owner_entity: RESULT.into(),
                owner_id: p.id.clone(),
            });
        }
        for (i, rf) in &p.step_attachment_refs {
            out.push(AttachmentTarget {
                reference: rf.clone(),
                owner_entity: "step_result".into(),
                owner_id: p.steps[*i].id.clone(),
            });
        }
    }
    Ok(out)
}

/// Writes an import in the caller's transaction. `raw` is the raw report,
/// already in the evidence store; its sha256 is the file's.
pub(crate) fn commit(
    conn: &Connection,
    req: &ReportImportRequest,
    raw: &Stored,
) -> Result<ReportImportOutcome, String> {
    let user = &req.user_id;
    if !project::owns(conn, &req.project_id, user)? {
        return Err("project not found".into());
    }
    let sha = check_sha(&req.sha256)?;
    if raw.sha256 != sha {
        return Err("report-changed: the uploaded file is not the one that was read".into());
    }
    let doc = parse_doc(&req.doc)?;
    let (run_id, created) = match (&req.run_id, &req.new_run) {
        (Some(id), None) => {
            let (project, status) = owned_run(conn, id, user)?;
            if project != req.project_id {
                return Err("run not found".into());
            }
            let shard_id = ids::shard_id(id, &sha);
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS (SELECT 1 FROM run_shards WHERE id = ?1)",
                    params![shard_id],
                    |r| r.get(0),
                )
                .map_err(err)?;
            if exists {
                // The same file in the same run: nothing to write (here or on
                // any other device: the ids are the same).
                let run_key: String = conn
                    .query_row("SELECT run_key FROM runs WHERE id = ?1", params![id], |r| {
                        r.get(0)
                    })
                    .map_err(err)?;
                let started: Option<String> = conn
                    .query_row(
                        "SELECT started_at FROM runs WHERE id = ?1",
                        params![id],
                        |r| r.get(0),
                    )
                    .map_err(err)?;
                let p = plan(
                    conn,
                    req,
                    &doc,
                    Some((id, started.as_deref())),
                    &shard_id,
                    false,
                )?;
                return Ok(ReportImportOutcome {
                    run_id: id.clone(),
                    run_key,
                    shard_id: shard_id.clone(),
                    already_imported: true,
                    results: 0,
                    linked: 0,
                    unlinked: 0,
                    attachments: targets(conn, &shard_id, &p)?,
                    warnings: Vec::new(),
                });
            }
            require_open(&status)?;
            (id.clone(), false)
        }
        (None, Some(new)) => {
            if req.allow_duplicate != Some(true) {
                if let Some(key) = duplicate_of(conn, &req.project_id, &sha)? {
                    return Err(format!("already-imported: {key}"));
                }
            }
            let title = text(&new.title)
                .or_else(|| text(&doc.run.title))
                .or_else(|| text(&req.file_name))
                .unwrap_or_else(|| "Import".into());
            let input = RunInput {
                project_id: Some(req.project_id.clone()),
                title: Some(clip(&title, MAX_TITLE).0),
                trigger: Some("import".into()),
                source_tool: text(&doc.run.source_tool),
                source_tool_version: text(&doc.run.source_tool_version),
                environment: text(&new.environment).or_else(|| text(&doc.run.environment)),
                build: text(&new.build).or_else(|| text(&doc.run.build)),
                commit_sha: text(&new.commit_sha).or_else(|| text(&doc.run.commit_sha)),
                branch: text(&new.branch).or_else(|| text(&doc.run.branch)),
                repository_url: text(&doc.run.repository_url),
                ci_url: text(&doc.run.ci_url),
                dataset: text(&doc.run.dataset),
                context: doc.run.context.clone(),
                started_at: time_of(doc.run.started_at.as_ref()),
                user_id: user.clone(),
                ..Default::default()
            };
            (insert_run(conn, &input)?, true)
        }
        _ => return Err("give either runId or newRun".into()),
    };
    let shard_id = ids::shard_id(&run_id, &sha);
    let (run_key, started): (String, Option<String>) = conn
        .query_row(
            "SELECT run_key, started_at FROM runs WHERE id = ?1",
            params![run_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(err)?;
    let p = plan(
        conn,
        req,
        &doc,
        Some((&run_id, started.as_deref())),
        &shard_id,
        true,
    )?;
    let workspace = ensure_workspace(conn)?;
    let hlc = crate::oplog::next_hlc(conn)?;
    conn.execute(
        "INSERT INTO run_shards (id, workspace_id, project_id, run_id, shard_index, shard_total,
                source_format, source_file_sha256, source_attachment_id, format_version,
                imported_by, imported_at, hlc)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9, ?10,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?11)",
        params![
            shard_id,
            workspace,
            req.project_id,
            run_id,
            p.shard_index,
            p.shard_total,
            p.format,
            sha,
            p.format_version.as_deref().map(|v| clip(v, MAX_LABEL).0),
            user,
            hlc,
        ],
    )
    .map_err(err)?;
    // The raw report: evidence of the shard (ADR-0014, kind raw_report). The
    // shard's `source_attachment_id` stays NULL: it is part of the shard's
    // immutable content and an attachment is local until SYNC-04b.
    let file_name = text(&req.file_name).unwrap_or_else(|| format!("{}.report", p.format));
    insert_attachment(
        conn,
        &req.project_id,
        RUN_SHARD,
        &shard_id,
        raw,
        &clip(&file_name, MAX_TITLE).0,
        None,
        "raw_report",
        user,
    )?;
    journal::record_append(conn, RUN_SHARD, &shard_id, user)?;
    for r in &p.results {
        write_result(
            conn,
            &workspace,
            &req.project_id,
            &run_id,
            &shard_id,
            &p.executed_by,
            r,
            user,
        )?;
    }
    let linked = p.linked();
    let unlinked = p.results.len() - linked;
    let mut changes = Map::new();
    changes.insert("results".into(), json!([null, p.results.len()]));
    journal::record_event_in(
        conn,
        Actor::user(user),
        Action::Import,
        RUN_SHARD,
        &shard_id,
        Some(&req.project_id),
        changes,
        Some(json!({
            "runId": run_id,
            "format": p.format,
            "tests": tests_of(&p),
            "results": p.results.len(),
            "linked": linked,
            "unlinked": unlinked,
            "ambiguous": p.warnings.iter().filter(|w| w.code == "two-case-tags").count(),
            "attachments": p.attachments,
            "warnings": p.warnings.len(),
        })),
    )?;
    if created && req.new_run.as_ref().and_then(|n| n.keep_open) != Some(true) {
        update_run(
            conn,
            &run_id,
            &RunInput {
                status: Some("completed".into()),
                finished_at: time_of(doc.run.finished_at.as_ref()),
                user_id: user.clone(),
                ..Default::default()
            },
        )?;
    }
    let attachments = targets(conn, &shard_id, &p)?;
    Ok(ReportImportOutcome {
        run_id,
        run_key,
        shard_id,
        already_imported: false,
        results: p.results.len(),
        linked,
        unlinked,
        attachments,
        warnings: p.warnings,
    })
}

#[allow(clippy::too_many_arguments)]
fn write_result(
    conn: &Connection,
    workspace: &str,
    project_id: &str,
    run_id: &str,
    shard_id: &str,
    executed_by: &str,
    r: &Planned,
    user: &str,
) -> Result<(), String> {
    within("testKey", &r.test_key, MAX_TEST_KEY)?;
    let hlc = crate::oplog::next_hlc(conn)?;
    // TODO(step 6, CYC-01): configuration_id from `cycles::match_configuration`
    // (the label), and the cycle item when the run belongs to a cycle.
    conn.execute(
        "INSERT INTO results (id, workspace_id, project_id, run_id, shard_id, run_item_id, test_key,
                test_case_id, test_case_revision_id, case_revision, case_key, flow_id, example_row_id,
                example_row, example_values, configuration_id, configuration_label, attempt, status,
                raw_status, duration_ms, started_at, finished_at, error_message, error_trace,
                executed_by, external_id, attributes, created_by, created_at, hlc)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, NULL, ?16, ?17,
                ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, datetime('now'), ?29)",
        params![
            r.id,
            workspace,
            project_id,
            run_id,
            shard_id,
            r.link.run_item_id,
            r.test_key,
            r.link.case_id,
            r.link.revision_id,
            r.link.case_revision,
            r.link.case_key,
            r.link.flow_id,
            r.link.example_row_id,
            r.example_row,
            r.example_values,
            r.label,
            r.attempt,
            r.status,
            r.raw_status,
            r.duration_ms,
            r.started_at,
            r.finished_at,
            r.error_message,
            r.error_trace,
            executed_by,
            r.external_id,
            r.attributes.to_string(),
            user,
            hlc,
        ],
    )
    .map_err(err)?;
    insert_steps(conn, &r.id, &r.steps)?;
    journal::record_append(conn, RESULT, &r.id, user)
}

/// An `attachments` row for a stored content (not synced yet: ADR-0014).
#[allow(clippy::too_many_arguments)]
fn insert_attachment(
    conn: &Connection,
    project_id: &str,
    owner_entity: &str,
    owner_id: &str,
    stored: &Stored,
    name: &str,
    mime: Option<&str>,
    kind: &str,
    user: &str,
) -> Result<String, String> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM attachments WHERE owner_entity = ?1 AND owner_id = ?2 AND sha256 = ?3
                AND deleted_at IS NULL",
            params![owner_entity, owner_id, stored.sha256],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?;
    if let Some(id) = existing {
        return Ok(id);
    }
    evidence::record_blob(conn, stored, mime)?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO attachments (id, workspace_id, project_id, sha256, size, mime, name,
                owner_entity, owner_id, kind, created_by, updated_by, created_at, updated_at, revision)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1)",
        params![
            id,
            ensure_workspace(conn)?,
            project_id,
            stored.sha256,
            stored.size as i64,
            mime,
            name,
            owner_entity,
            owner_id,
            kind,
            user,
        ],
    )
    .map_err(err)?;
    Ok(id)
}

const ATTACHMENT_KINDS: [&str; 5] = ["evidence", "screenshot", "video", "trace", "log"];

/// The project of a result or step result the user owns.
fn owner_project(
    conn: &Connection,
    owner_entity: &str,
    owner_id: &str,
    user: &str,
) -> Result<String, String> {
    let sql = match owner_entity {
        RESULT => {
            "SELECT x.project_id FROM results x JOIN projects p ON p.id = x.project_id
              WHERE x.id = ?1 AND p.owner_id = ?2 AND p.deleted_at IS NULL"
        }
        "step_result" => {
            "SELECT x.project_id FROM step_results s JOIN results x ON x.id = s.result_id
               JOIN projects p ON p.id = x.project_id
              WHERE s.id = ?1 AND p.owner_id = ?2 AND p.deleted_at IS NULL"
        }
        _ => return Err(format!("attachments cannot belong to {owner_entity}")),
    };
    conn.query_row(sql, params![owner_id, user], |r| r.get(0))
        .optional()
        .map_err(err)?
        .ok_or_else(|| format!("{owner_entity} not found"))
}

/// Attaches one stored content of a report to its result or step result.
/// Idempotent: the same content on the same owner is one attachment.
#[allow(clippy::too_many_arguments)]
pub(crate) fn attach(
    conn: &Connection,
    owner_entity: &str,
    owner_id: &str,
    stored: &Stored,
    name: &str,
    mime: Option<&str>,
    kind: &str,
    user: &str,
) -> Result<String, String> {
    let kind = if ATTACHMENT_KINDS.contains(&kind) {
        kind
    } else {
        "evidence"
    };
    let name = text(&Some(name.to_string())).ok_or("name is required")?;
    let project = owner_project(conn, owner_entity, owner_id, user)?;
    insert_attachment(
        conn,
        &project,
        owner_entity,
        owner_id,
        stored,
        &clip(&name, MAX_TITLE).0,
        mime,
        kind,
        user,
    )
}

// ---- the tray (ING-05) -------------------------------------------------------

/// Every `test_key` of the project with results and no case of their own,
/// newest first, with the later link (`unlinked_mapping`) when there is one.
pub(crate) fn unlinked_list(
    conn: &Connection,
    project_id: &str,
    user: &str,
) -> Result<Vec<UnlinkedTest>, String> {
    if !project::owns(conn, project_id, user)? {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "WITH last AS (
               SELECT x.*, row_number() OVER (PARTITION BY x.test_key
                        ORDER BY x.created_at DESC, x.rowid DESC) AS n,
                      count(*) OVER (PARTITION BY x.test_key) AS total
                 FROM results x
                 JOIN runs r ON r.id = x.run_id AND r.deleted_at IS NULL
                WHERE x.project_id = ?1 AND x.test_case_id IS NULL AND x.shard_id IS NOT NULL)
             SELECT l.test_key, l.total, l.status, l.run_id, r.run_key, l.created_at,
                    l.attributes, l.case_key,
                    (SELECT m.test_case_id FROM unlinked_mappings m
                      WHERE m.project_id = l.project_id AND m.test_key = l.test_key
                        AND m.deleted_at IS NULL
                      ORDER BY m.updated_at DESC, m.rowid DESC LIMIT 1) AS mapped
               FROM last l LEFT JOIN runs r ON r.id = l.run_id
              WHERE l.n = 1
              ORDER BY l.created_at DESC, l.test_key",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map(params![project_id], |r| {
            let attributes: Value = r
                .get::<_, Option<String>>(6)?
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_else(|| json!({}));
            let test_key: String = r.get(0)?;
            let name = attributes
                .get("name")
                .and_then(Value::as_str)
                .map(String::from)
                .unwrap_or_else(|| {
                    test_key
                        .rsplit_once("::")
                        .map_or(test_key.clone(), |(_, t)| t.to_string())
                });
            Ok(UnlinkedTest {
                test_key,
                name,
                results: r.get(1)?,
                last_status: r.get(2)?,
                last_run_id: r.get(3)?,
                last_run_key: r.get(4)?,
                last_seen: r.get(5)?,
                reason: attributes
                    .get("link")
                    .and_then(Value::as_str)
                    .map(String::from),
                case_key: r.get(7)?,
                mapped_case_id: r.get(8)?,
            })
        })
        .map_err(err)?;
    rows.collect::<rusqlite::Result<_>>().map_err(err)
}

// ---- commands ------------------------------------------------------------------

#[tauri::command]
pub fn run_import_preview(
    db: State<Db>,
    request: ReportImportRequest,
) -> Result<ReportImportPreview, String> {
    // In a transaction rolled back on purpose: freezing a case's current
    // revision may write its row, and a preview must leave nothing.
    db.with_conn(|conn| {
        conn.execute_batch("SAVEPOINT import_preview")
            .map_err(err)?;
        let out = preview(conn, &request);
        conn.execute_batch("ROLLBACK TO import_preview; RELEASE import_preview")
            .map_err(err)?;
        out
    })
}

/// Commits an import: `rawUploadId` is the report file sent through
/// `evidence_upload_*`; its sha256 must be the one that was read.
#[tauri::command]
pub fn run_import(
    db: State<'_, Db>,
    uploads: State<'_, evidence::Uploads>,
    request: ReportImportRequest,
    raw_upload_id: String,
) -> Result<ReportImportOutcome, String> {
    let upload = uploads.take(&raw_upload_id)?;
    let out = db.with_conn(|conn| {
        commit_upload(conn, db.evidence(), upload, |c, stored| {
            crate::db::in_tx(c, |tx| commit(tx, &request, stored))
        })
    })?;
    db.persist()?;
    Ok(out)
}

/// Attaches one uploaded attachment of an imported report (after `run_import`).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn run_import_attach(
    db: State<'_, Db>,
    uploads: State<'_, evidence::Uploads>,
    owner_entity: String,
    owner_id: String,
    upload_id: String,
    name: String,
    mime: Option<String>,
    kind: Option<String>,
    user_id: String,
) -> Result<String, String> {
    let upload = uploads.take(&upload_id)?;
    let id = db.with_conn(|conn| {
        commit_upload(conn, db.evidence(), upload, |c, stored| {
            crate::db::in_tx(c, |tx| {
                attach(
                    tx,
                    &owner_entity,
                    &owner_id,
                    stored,
                    &name,
                    mime.as_deref(),
                    kind.as_deref().unwrap_or("evidence"),
                    &user_id,
                )
            })
        })
    })?;
    db.persist()?;
    Ok(id)
}

#[tauri::command]
pub fn unlinked_tests_list(
    db: State<Db>,
    project_id: String,
    user_id: String,
) -> Result<Vec<UnlinkedTest>, String> {
    db.with_conn(|conn| unlinked_list(conn, &project_id, &user_id))
}

/// Moves a sealed upload into the store and runs `write` under the database
/// lock. If writing fails, the file is removed only when this upload wrote it
/// and nothing knows that content (as `planner::attach_upload`).
fn commit_upload<T>(
    conn: &Connection,
    store: &EvidenceStore,
    mut upload: evidence::BlobWriter,
    write: impl FnOnce(&Connection, &Stored) -> Result<T, String>,
) -> Result<T, String> {
    upload.seal()?;
    let committed = upload.commit(store)?;
    let stored = committed.stored;
    match write(conn, &stored) {
        Ok(v) => Ok(v),
        Err(e) => {
            if committed.wrote && !evidence::is_known(conn, &stored.sha256)? {
                store.remove(&stored.sha256)?;
            }
            Err(e)
        }
    }
}
