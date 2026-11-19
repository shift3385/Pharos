//! The materialized copy of shared steps and datasets in a case (CAS-01,
//! ADR-0055 §2-3). Pure: the library is read through `Library`, so the same
//! rules run on a save, a propagation, a pull and in the vectors
//! (`tests/fixtures/shared-steps-vectors.json`, shared with the server).
//!
//! - `data.sharedRefs[]`: one entry per call of a shared step. Its steps are
//!   copied into `data.preconditions` or `data.steps` with the id
//!   `short_hash("<case>:shared:<ref>:<libraryStep>")`, so a step keeps its
//!   id across versions while it keeps its id in the library.
//! - `data.datasetRefs[]`: in 0.6.0 one entry, id `case`, for the case's
//!   Examples table. The table becomes the parameters of the case (one
//!   column each, in order of first use) followed by the dataset columns
//!   that no parameter uses; each row gets `short_hash("<case>:dataset:
//!   <ref>:<datasetRow>")`, so `example_row_id` survives value and order
//!   changes.
//! - Parameters are Gherkin placeholders, `<name>`, as `placeholdersIn` reads
//!   them. A call's argument replaces `<name>` in its copy; an empty one
//!   leaves the placeholder, which becomes a parameter of the case.

use std::collections::HashSet;

use serde::Serialize;
use serde_json::{json, Map, Value};
#[cfg(test)]
use ts_rs::TS;

use crate::steps::short_hash;

pub const SHARED_REFS: &str = "sharedRefs";
pub const DATASET_REFS: &str = "datasetRefs";
/// The only dataset target of 0.6.0: the case's own Examples table.
pub const CASE_TARGET: &str = "case";
/// The step lists a call may live in.
pub const CALL_LISTS: [&str; 2] = ["preconditions", "steps"];

/// One version of a shared step, as the library gives it.
#[derive(Clone, Debug, PartialEq)]
pub struct SharedVersion {
    pub item_id: String,
    pub version: i64,
    pub revision_id: String,
    pub name: String,
    /// `{id, text, expected?}` in order.
    pub steps: Vec<Value>,
}

/// One version of a dataset, as the library gives it.
#[derive(Clone, Debug, PartialEq)]
pub struct DatasetVersion {
    pub item_id: String,
    pub version: i64,
    pub revision_id: String,
    pub name: String,
    /// `(id, name)` in order.
    pub columns: Vec<(String, String)>,
    /// `(id, values by column id)` in order.
    pub rows: Vec<(String, Map<String, Value>)>,
}

/// Where the materializer reads the library. `revision_id: None` asks for
/// the current version of a live item; `Some` for that exact version.
pub trait Library {
    fn shared(&self, item_id: &str, revision_id: Option<&str>) -> Option<SharedVersion>;
    fn dataset(&self, item_id: &str, revision_id: Option<&str>) -> Option<DatasetVersion>;
}

/// What a materialization found.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Outcome {
    /// Calls and bindings whose version is not on this device: their copy
    /// stays as it is.
    pub missing: Vec<String>,
    /// Parameters of the case with no column in its dataset.
    pub missing_columns: Vec<String>,
    /// True if `data` changed.
    pub changed: bool,
}

/// The state of one call or binding, for the editor and the case list.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRefStatus {
    /// The call's id, or `case` for the dataset binding.
    pub ref_id: String,
    /// `shared_step` or `dataset`.
    pub kind: String,
    pub item_id: String,
    pub name: String,
    pub version: i64,
    /// The library's current version; None if the item was deleted.
    pub latest_version: Option<i64>,
    pub follow: bool,
    /// `ok`, `outdated` (pinned, a newer version exists), `modified` (the
    /// copy differs from its version), `missing` (the version is not here)
    /// or `deleted` (the item is gone from the library).
    pub state: String,
    /// Parameters with no column (datasets only).
    pub missing_columns: Vec<String>,
}

pub fn derived_step_id(case_id: &str, ref_id: &str, library_step_id: &str) -> String {
    short_hash(&format!("{case_id}:shared:{ref_id}:{library_step_id}"))
}

pub fn derived_row_id(case_id: &str, ref_id: &str, row_id: &str) -> String {
    short_hash(&format!("{case_id}:dataset:{ref_id}:{row_id}"))
}

/// `<name>` placeholders of `text`, trimmed, in order, as `placeholdersIn`:
/// `<`, a character that is neither a space nor `>`, then up to the next `>`.
pub fn placeholders(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for (start, end) in placeholder_spans(text) {
        let name = text[start + 1..end].trim().to_string();
        if !name.is_empty() && !out.contains(&name) {
            out.push(name);
        }
    }
    out
}

/// Byte spans `[<, >]` of each placeholder.
fn placeholder_spans(text: &str) -> Vec<(usize, usize)> {
    let bytes = text.as_bytes();
    let mut spans = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'<' {
            let next = text[i + 1..].chars().next();
            if let Some(c) = next {
                if !c.is_whitespace() && c != '>' {
                    if let Some(rel) = text[i + 1..].find('>') {
                        let end = i + 1 + rel;
                        spans.push((i, end));
                        i = end + 1;
                        continue;
                    }
                }
            }
        }
        i += 1;
    }
    spans
}

/// Replaces each `<name>` whose argument is not empty.
pub fn substitute(text: &str, args: &Map<String, Value>) -> String {
    let mut out = String::with_capacity(text.len());
    let mut last = 0;
    for (start, end) in placeholder_spans(text) {
        let name = text[start + 1..end].trim();
        let arg = args
            .get(name)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|a| !a.is_empty());
        if let Some(arg) = arg {
            out.push_str(&text[last..start]);
            out.push_str(arg);
            last = end + 1;
        }
    }
    out.push_str(&text[last..]);
    out
}

fn str_of<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

fn follows(r: &Value) -> bool {
    r.get("follow").and_then(Value::as_bool).unwrap_or(true)
}

fn refs(data: &Value, key: &str) -> Vec<Value> {
    data.get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

/// True if the case has a call or a binding.
pub fn has_refs(data: &Value) -> bool {
    [SHARED_REFS, DATASET_REFS].iter().any(|k| {
        data.get(*k)
            .and_then(Value::as_array)
            .is_some_and(|a| !a.is_empty())
    })
}

/// The library item ids the case refers to, by kind.
pub fn referenced(data: &Value) -> (Vec<String>, Vec<String>) {
    let ids = |key: &str, field: &str| {
        refs(data, key)
            .iter()
            .filter_map(|r| str_of(r, field).map(str::to_string))
            .collect::<Vec<_>>()
    };
    (
        ids(SHARED_REFS, "sharedStepId"),
        ids(DATASET_REFS, "datasetId"),
    )
}

/// The copy of one call at one version.
fn call_copy(case_id: &str, call: &Value, v: &SharedVersion) -> Vec<Value> {
    let ref_id = str_of(call, "id").unwrap_or_default();
    let args = call
        .get("args")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    v.steps
        .iter()
        .map(|s| {
            let mut step = Map::new();
            step.insert(
                "id".into(),
                json!(derived_step_id(
                    case_id,
                    ref_id,
                    str_of(s, "id").unwrap_or_default()
                )),
            );
            step.insert(
                "text".into(),
                json!(substitute(str_of(s, "text").unwrap_or_default(), &args)),
            );
            if let Some(e) = str_of(s, "expected").filter(|e| !e.is_empty()) {
                step.insert("expected".into(), json!(substitute(e, &args)));
            }
            Value::Object(step)
        })
        .collect()
}

fn list_of(call: &Value) -> &'static str {
    match str_of(call, "list") {
        Some("preconditions") => "preconditions",
        _ => "steps",
    }
}

fn ids_of(v: &Value, key: &str) -> Vec<String> {
    v.get(key)
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

/// Puts `block` where the call's old copy was (or at the end of the list).
fn place_block(data: &mut Value, list: &str, old_ids: &[String], block: Vec<Value>) {
    let mut wanted: HashSet<String> = old_ids.iter().cloned().collect();
    for s in &block {
        if let Some(id) = str_of(s, "id") {
            wanted.insert(id.to_string());
        }
    }
    let Some(obj) = data.as_object_mut() else {
        return;
    };
    let current = obj
        .get(list)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut at: Option<usize> = None;
    let mut kept = Vec::with_capacity(current.len() + block.len());
    for el in current {
        let mine = str_of(&el, "id").is_some_and(|id| wanted.contains(id));
        if mine {
            at.get_or_insert(kept.len());
        } else {
            kept.push(el);
        }
    }
    let at = at.unwrap_or(kept.len()).min(kept.len());
    kept.splice(at..at, block);
    obj.insert(list.to_string(), Value::Array(kept));
}

/// Texts that may hold the case's parameters, in reading order.
fn case_texts(data: &Value) -> Vec<String> {
    let mut texts = Vec::new();
    for list in CALL_LISTS {
        for s in data
            .get(list)
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            if let Some(t) = str_of(s, "text") {
                texts.push(t.to_string());
            } else if let Some(t) = s.as_str() {
                texts.push(t.to_string());
            }
            if let Some(e) = str_of(s, "expected") {
                texts.push(e.to_string());
            }
        }
    }
    if let Some(e) = str_of(data, "expectedResult") {
        texts.push(e.to_string());
    }
    texts
}

/// The parameters of the case, in order of first use.
pub fn case_params(data: &Value) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for t in case_texts(data) {
        for p in placeholders(&t) {
            if !out.contains(&p) {
                out.push(p);
            }
        }
    }
    out
}

/// The Examples table a dataset binding gives, and the parameters with no
/// column.
fn dataset_table(
    case_id: &str,
    binding: &Value,
    params: &[String],
    v: &DatasetVersion,
) -> (Value, Vec<String>) {
    let ref_id = str_of(binding, "id").unwrap_or(CASE_TARGET);
    let map = binding
        .get("columnMap")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let by_name = |name: &str| {
        v.columns
            .iter()
            .find(|(_, n)| n == name)
            .map(|(id, _)| id.clone())
    };
    let mut used: HashSet<String> = HashSet::new();
    let mut missing = Vec::new();
    let mut headers: Vec<String> = Vec::new();
    let mut sources: Vec<Option<String>> = Vec::new();
    for p in params {
        let col = map
            .get(p)
            .and_then(Value::as_str)
            .and_then(by_name)
            .or_else(|| by_name(p));
        match &col {
            Some(c) => {
                used.insert(c.clone());
            }
            None => missing.push(p.clone()),
        }
        headers.push(p.clone());
        sources.push(col);
    }
    for (id, name) in &v.columns {
        if !used.contains(id) && !headers.contains(name) {
            headers.push(name.clone());
            sources.push(Some(id.clone()));
        }
    }
    let only: Option<HashSet<String>> = binding.get("rowIds").and_then(Value::as_array).map(|a| {
        a.iter()
            .filter_map(|x| x.as_str().map(str::to_string))
            .collect()
    });
    let rows: Vec<Value> = v
        .rows
        .iter()
        .filter(|(id, _)| only.as_ref().map_or(true, |o| o.contains(id)))
        .map(|(id, values)| {
            let cells: Vec<Value> = sources
                .iter()
                .map(|src| {
                    json!(src
                        .as_ref()
                        .and_then(|c| values.get(c))
                        .and_then(Value::as_str)
                        .unwrap_or_default())
                })
                .collect();
            json!({ "id": derived_row_id(case_id, ref_id, id), "values": cells })
        })
        .collect();
    (json!({ "headers": headers, "rows": rows }), missing)
}

fn set_ref_version(r: &mut Value, version: i64, revision_id: &str, name: &str) {
    if let Some(o) = r.as_object_mut() {
        o.insert("version".into(), json!(version));
        o.insert("revisionId".into(), json!(revision_id));
        o.insert("name".into(), json!(name));
    }
}

/// Rewrites the copies of every call and binding from the library: each
/// following one at the current version, each pinned one at its version.
/// A call or binding whose version is not here keeps its copy. Cases of the
/// `advanced` level cannot use the library in 0.6.0 (ADR-0055 §9).
pub fn materialize(case_id: &str, data: &mut Value, lib: &dyn Library) -> Result<Outcome, String> {
    let mut out = Outcome::default();
    if !has_refs(data) {
        return Ok(out);
    }
    if str_of(data, "gherkinLevel") == Some("advanced") {
        return Err("shared_library.advanced_unsupported".into());
    }
    let before = data.clone();

    let mut calls = refs(data, SHARED_REFS);
    for call in calls.iter_mut() {
        let (Some(ref_id), Some(item)) = (
            str_of(call, "id").map(str::to_string),
            str_of(call, "sharedStepId").map(str::to_string),
        ) else {
            continue;
        };
        let pinned = (!follows(call))
            .then(|| str_of(call, "revisionId").map(str::to_string))
            .flatten();
        let Some(v) = lib.shared(&item, pinned.as_deref()) else {
            out.missing.push(ref_id);
            continue;
        };
        let block = call_copy(case_id, call, &v);
        let new_ids: Vec<Value> = block.iter().filter_map(|s| s.get("id").cloned()).collect();
        place_block(data, list_of(call), &ids_of(call, "stepIds"), block);
        set_ref_version(call, v.version, &v.revision_id, &v.name);
        if let Some(o) = call.as_object_mut() {
            o.insert("stepIds".into(), Value::Array(new_ids));
            o.entry("follow").or_insert(json!(true));
            o.insert("list".into(), json!(list_of(&Value::Object(o.clone()))));
        }
    }
    if let Some(o) = data.as_object_mut() {
        if o.contains_key(SHARED_REFS) {
            o.insert(SHARED_REFS.into(), Value::Array(calls));
        }
    }

    let params = case_params(data);
    let mut bindings = refs(data, DATASET_REFS);
    for b in bindings.iter_mut() {
        let (Some(ref_id), Some(item)) = (
            str_of(b, "id").map(str::to_string),
            str_of(b, "datasetId").map(str::to_string),
        ) else {
            continue;
        };
        if ref_id != CASE_TARGET {
            continue;
        }
        let pinned = (!follows(b))
            .then(|| str_of(b, "revisionId").map(str::to_string))
            .flatten();
        let Some(v) = lib.dataset(&item, pinned.as_deref()) else {
            out.missing.push(ref_id);
            continue;
        };
        let (table, missing) = dataset_table(case_id, b, &params, &v);
        out.missing_columns.extend(missing);
        if let Some(o) = data.as_object_mut() {
            o.insert("examples".into(), table);
        }
        set_ref_version(b, v.version, &v.revision_id, &v.name);
        if let Some(o) = b.as_object_mut() {
            o.entry("follow").or_insert(json!(true));
        }
    }
    if let Some(o) = data.as_object_mut() {
        if o.contains_key(DATASET_REFS) {
            o.insert(DATASET_REFS.into(), Value::Array(bindings));
        }
        // Parameters make a basic case an Outline, as `detectLevel` does.
        let outline = !params.is_empty()
            || o.get(DATASET_REFS)
                .and_then(Value::as_array)
                .is_some_and(|a| !a.is_empty());
        if outline
            && o.get("gherkinLevel")
                .and_then(Value::as_str)
                .map_or(true, |l| l == "basic")
        {
            o.insert("gherkinLevel".into(), json!("outline"));
        }
    }
    out.changed = *data != before;
    Ok(out)
}

/// The state of each call and binding against the library, without writing.
pub fn status(case_id: &str, data: &Value, lib: &dyn Library) -> Vec<LibraryRefStatus> {
    let mut out = Vec::new();
    for call in refs(data, SHARED_REFS) {
        let (Some(ref_id), Some(item)) = (str_of(&call, "id"), str_of(&call, "sharedStepId"))
        else {
            continue;
        };
        let latest = lib.shared(item, None);
        let at = str_of(&call, "revisionId").and_then(|r| lib.shared(item, Some(r)));
        let version = call.get("version").and_then(Value::as_i64).unwrap_or(0);
        let state = match (&at, &latest) {
            (None, None) if str_of(&call, "revisionId").is_some() => "deleted",
            (None, _) => "missing",
            (Some(v), _) => {
                let list = list_of(&call);
                let ids = ids_of(&call, "stepIds");
                let copy: Vec<Value> = data
                    .get(list)
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter(|s| str_of(s, "id").is_some_and(|id| ids.iter().any(|x| x == id)))
                    .cloned()
                    .collect();
                if copy != call_copy(case_id, &call, v) {
                    "modified"
                } else if latest.as_ref().is_none() {
                    "deleted"
                } else if latest.as_ref().is_some_and(|l| l.version > version) {
                    "outdated"
                } else {
                    "ok"
                }
            }
        };
        out.push(LibraryRefStatus {
            ref_id: ref_id.to_string(),
            kind: "shared_step".into(),
            item_id: item.to_string(),
            name: str_of(&call, "name").unwrap_or_default().to_string(),
            version,
            latest_version: latest.map(|l| l.version),
            follow: follows(&call),
            state: state.into(),
            missing_columns: Vec::new(),
        });
    }
    let params = case_params(data);
    for b in refs(data, DATASET_REFS) {
        let (Some(ref_id), Some(item)) = (str_of(&b, "id"), str_of(&b, "datasetId")) else {
            continue;
        };
        let latest = lib.dataset(item, None);
        let at = str_of(&b, "revisionId").and_then(|r| lib.dataset(item, Some(r)));
        let version = b.get("version").and_then(Value::as_i64).unwrap_or(0);
        let mut missing_columns = Vec::new();
        let state = match &at {
            None if latest.is_none() && str_of(&b, "revisionId").is_some() => "deleted",
            None => "missing",
            Some(v) => {
                let (table, missing) = dataset_table(case_id, &b, &params, v);
                missing_columns = missing;
                if data.get("examples") != Some(&table) {
                    "modified"
                } else if latest.is_none() {
                    "deleted"
                } else if latest.as_ref().is_some_and(|l| l.version > version) {
                    "outdated"
                } else {
                    "ok"
                }
            }
        };
        out.push(LibraryRefStatus {
            ref_id: ref_id.to_string(),
            kind: "dataset".into(),
            item_id: item.to_string(),
            name: str_of(&b, "name").unwrap_or_default().to_string(),
            version,
            latest_version: latest.map(|l| l.version),
            follow: follows(&b),
            state: state.into(),
            missing_columns,
        });
    }
    out
}

/// True if a call or binding of the case follows `item_id` and is behind
/// `version` (a propagation must rewrite it).
pub fn behind(data: &Value, item_id: &str, version: i64) -> bool {
    [(SHARED_REFS, "sharedStepId"), (DATASET_REFS, "datasetId")]
        .iter()
        .any(|(key, field)| {
            refs(data, key).iter().any(|r| {
                str_of(r, field) == Some(item_id)
                    && follows(r)
                    && r.get("version").and_then(Value::as_i64).unwrap_or(0) != version
            })
        })
}
