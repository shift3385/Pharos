//! The project library (CAS-01, ADR-0055): shared steps and datasets.
//!
//! - `shared_step` and `dataset` are synced `lww` entities, children of their
//!   project (migration 0049). `version` goes up with each change of the
//!   canonical content; every version is kept as an `append_only`
//!   `shared_step_revision` / `dataset_revision` with a deterministic id.
//! - A case refers to them in `data.sharedRefs` / `data.datasetRefs` and keeps
//!   a materialized copy (`materialize.rs`). A local save of a case always
//!   rebuilds the copies from the library (`test_case::prepare_data`), so the
//!   copy never drifts from its version on this device.
//! - Saving a content change here rewrites, in the same transaction, every
//!   live case of the project that follows the item: each one is a normal
//!   case save, so it gets a revision, an audit event (with the cause) and the
//!   review rule of ADR-0049 (an approved case goes back to «En revisión»).
//! - After a pull, cases behind the library on this device are rewritten the
//!   same way (`reconcile`): deterministic, so two devices that do it write
//!   the same content.
//!
//! The server applies the same rules for the web (`server/src/modules/domain/
//! shared-library.ts`); both pass `tests/fixtures/shared-steps-vectors.json`.

pub mod materialize;
#[cfg(test)]
mod tests;

use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
#[cfg(feature = "tauri")]
use tauri::State;
#[cfg(test)]
use ts_rs::TS;
use uuid::Uuid;

use crate::db::ensure_workspace;
#[cfg(feature = "tauri")]
use crate::db::Db;
use crate::journal::{self, Action, Actor, Change};
use crate::project;
use crate::steps;
use materialize::{DatasetVersion, Library, SharedVersion};

pub const SHARED_STEP: &str = "shared_step";
pub const DATASET: &str = "dataset";
pub const SHARED_STEP_REVISION: &str = "shared_step_revision";
pub const DATASET_REVISION: &str = "dataset_revision";
/// The `lww` entities of the library.
pub const ENTITIES: [&str; 2] = [SHARED_STEP, DATASET];
/// The `append_only` versions.
pub const REVISION_ENTITIES: [&str; 2] = [SHARED_STEP_REVISION, DATASET_REVISION];

/// UUIDv5 namespaces of the version ids. Never change.
pub const NS_SHARED_STEP_REVISION: Uuid =
    Uuid::from_u128(0x5c1e_7a20_3b9d_4f61_8e2a_d4c6_b8f0_1a3c);
pub const NS_DATASET_REVISION: Uuid = Uuid::from_u128(0x2d8b_4f93_6a1c_5e70_9b3d_e5f7_0c2a_4b6d);

/// Limits (ADR-0055 §1, decision 4 of the user).
pub const MAX_NAME: usize = 200;
pub const MAX_DESCRIPTION: usize = 10_000;
pub const MAX_STEPS: usize = 50;
pub const MAX_PARAMS: usize = 20;
pub const MAX_STEP_TEXT: usize = 4_000;
pub const MAX_COLUMNS: usize = 30;
pub const MAX_ROWS: usize = 500;
pub const MAX_CELL: usize = 4_096;
pub const MAX_PARAM_NAME: usize = 40;

pub const ACTIVE: &str = "active";
pub const OBSOLETE: &str = "obsolete";

/// Where each kind lives.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Kind {
    pub entity: &'static str,
    pub revision_entity: &'static str,
    pub table: &'static str,
    pub revision_table: &'static str,
    /// `params` or `columns`.
    pub def: &'static str,
    /// `steps` or `rows`.
    pub body: &'static str,
    ns: Uuid,
}

pub(crate) const SHARED: Kind = Kind {
    entity: SHARED_STEP,
    revision_entity: SHARED_STEP_REVISION,
    table: "shared_steps",
    revision_table: "shared_step_revisions",
    def: "params",
    body: "steps",
    ns: NS_SHARED_STEP_REVISION,
};

pub(crate) const DATA: Kind = Kind {
    entity: DATASET,
    revision_entity: DATASET_REVISION,
    table: "datasets",
    revision_table: "dataset_revisions",
    def: "columns",
    body: "rows",
    ns: NS_DATASET_REVISION,
};

pub(crate) fn kind_of(entity: &str) -> Option<Kind> {
    match entity {
        SHARED_STEP | SHARED_STEP_REVISION => Some(SHARED),
        DATASET | DATASET_REVISION => Some(DATA),
        _ => None,
    }
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn js_len(s: &str) -> usize {
    s.encode_utf16().count()
}

// ------------------------------------------------------------------- types

/// A shared step or a dataset, as the UI reads it.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub id: String,
    pub project_id: String,
    /// `shared_step` or `dataset`.
    pub kind: String,
    pub name: String,
    pub description: String,
    /// Shared step: `{id, name, default?}[]`; dataset: `{id, name}[]` (columns).
    #[cfg_attr(test, ts(type = "unknown"))]
    pub definition: Value,
    /// Shared step: `{id, text, expected?}[]`; dataset: `{id, values}[]` (rows).
    #[cfg_attr(test, ts(type = "unknown"))]
    pub body: Value,
    pub status: String,
    pub version: i64,
    pub content_sha256: String,
    /// Live cases that use it.
    pub used_by: i64,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
    pub revision: i64,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibraryInput {
    pub project_id: String,
    /// `shared_step` or `dataset`; ignored on update.
    pub kind: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    #[cfg_attr(test, ts(type = "unknown"))]
    pub definition: Value,
    #[serde(default)]
    #[cfg_attr(test, ts(type = "unknown"))]
    pub body: Value,
    pub user_id: String,
}

/// One version in the item's history.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryVersion {
    pub id: String,
    pub item_id: String,
    pub version: i64,
    pub name: String,
    #[cfg_attr(test, ts(type = "unknown"))]
    pub definition: Value,
    #[cfg_attr(test, ts(type = "unknown"))]
    pub body: Value,
    pub content_sha256: String,
    pub created_by: String,
    pub created_at: String,
}

/// A case a change of the item touches.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryImpactCase {
    pub id: String,
    pub scenario_id: String,
    pub title: String,
    pub status: String,
    /// False: pinned to `version`, a save leaves it as it is.
    pub follow: bool,
    pub version: i64,
}

/// What saving a change of the item does (the notice of boceto 3).
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibraryImpact {
    pub cases: Vec<LibraryImpactCase>,
    /// Following cases by status (`draft`, `reviewed`, `approved`, `obsolete`).
    #[cfg_attr(test, ts(type = "Record<string, number>"))]
    pub by_status: Map<String, Value>,
}

/// A saved item and the cases the save rewrote.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySave {
    pub item: LibraryItem,
    pub updated_cases: Vec<String>,
}

// -------------------------------------------------------------- validation

/// A parameter or column name: what `<name>` can hold.
pub fn valid_name(name: &str) -> bool {
    let n = name.trim();
    !n.is_empty()
        && n == name
        && js_len(n) <= MAX_PARAM_NAME
        && !n.contains(['<', '>', '\n', '\r', '\t'])
}

fn check_text(field: &str, s: &str, max: usize) -> Result<(), String> {
    if js_len(s) > max {
        return Err(format!("shared_library.too_long:{field}"));
    }
    Ok(())
}

fn as_str(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(Value::as_str).map(str::to_string)
}

/// Gives every element an id (kept if valid and new, random otherwise).
fn ensure_id(el: &mut Map<String, Value>, used: &mut HashSet<String>) {
    let keep = el
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.trim().is_empty() && js_len(id) <= 64)
        .map(str::to_string)
        .filter(|id| used.insert(id.clone()));
    let id = keep.unwrap_or_else(|| steps::random_id(used));
    el.insert("id".into(), json!(id));
}

/// The id a parameter gets from its name when it has none: the same on every
/// save, so declaring a placeholder again never looks like a new version.
fn param_id(name: &str) -> String {
    steps::short_hash(&format!("param:{name}"))
}

/// Checks and normalizes a shared step: steps `{id, text, expected?}`;
/// params `{id, name, default?}`, completed with every placeholder used.
pub fn normalize_shared(definition: &Value, body: &Value) -> Result<(Value, Value), String> {
    let mut used = HashSet::new();
    let raw_steps = body.as_array().cloned().unwrap_or_default();
    if raw_steps.is_empty() {
        return Err("shared_library.no_steps".into());
    }
    if raw_steps.len() > MAX_STEPS {
        return Err("shared_library.too_many:steps".into());
    }
    let mut out_steps = Vec::new();
    let mut found: Vec<String> = Vec::new();
    for s in raw_steps {
        let mut m = match s {
            Value::Object(m) => m,
            Value::String(t) => {
                let mut m = Map::new();
                m.insert("text".into(), json!(t));
                m
            }
            _ => return Err("shared_library.bad_step".into()),
        };
        let text = m
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string();
        if text.is_empty() {
            return Err("shared_library.empty_step".into());
        }
        check_text("step", &text, MAX_STEP_TEXT)?;
        let expected = m
            .get("expected")
            .and_then(Value::as_str)
            .map(|e| e.trim().to_string())
            .filter(|e| !e.is_empty());
        if let Some(e) = &expected {
            check_text("expected", e, MAX_STEP_TEXT)?;
        }
        for p in materialize::placeholders(&text)
            .into_iter()
            .chain(expected.iter().flat_map(|e| materialize::placeholders(e)))
        {
            if !found.contains(&p) {
                found.push(p);
            }
        }
        ensure_id(&mut m, &mut used);
        let mut step = Map::new();
        step.insert("id".into(), m["id"].clone());
        step.insert("text".into(), json!(text));
        if let Some(e) = expected {
            step.insert("expected".into(), json!(e));
        }
        out_steps.push(Value::Object(step));
    }
    let mut params: Vec<Value> = Vec::new();
    let mut names: Vec<String> = Vec::new();
    let mut param_ids = HashSet::new();
    for p in definition.as_array().cloned().unwrap_or_default() {
        let Value::Object(mut m) = p else {
            return Err("shared_library.bad_param".into());
        };
        let name = m
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string();
        if !valid_name(&name) {
            return Err("shared_library.bad_param_name".into());
        }
        if names.contains(&name) {
            return Err("shared_library.duplicate_param".into());
        }
        if m.get("id")
            .and_then(Value::as_str)
            .map_or(true, |id| id.trim().is_empty())
        {
            m.insert("id".into(), json!(param_id(&name)));
        }
        ensure_id(&mut m, &mut param_ids);
        let mut param = Map::new();
        param.insert("id".into(), m["id"].clone());
        param.insert("name".into(), json!(name));
        if let Some(d) = m
            .get("default")
            .and_then(Value::as_str)
            .filter(|d| !d.is_empty())
        {
            check_text("default", d, MAX_CELL)?;
            param.insert("default".into(), json!(d));
        }
        names.push(name);
        params.push(Value::Object(param));
    }
    for name in found {
        if !names.contains(&name) {
            if !valid_name(&name) {
                return Err("shared_library.bad_param_name".into());
            }
            let mut m = Map::new();
            m.insert("id".into(), json!(param_id(&name)));
            ensure_id(&mut m, &mut param_ids);
            m.insert("name".into(), json!(name));
            names.push(name);
            params.push(Value::Object(m));
        }
    }
    if params.len() > MAX_PARAMS {
        return Err("shared_library.too_many:params".into());
    }
    Ok((Value::Array(params), Value::Array(out_steps)))
}

/// Checks and normalizes a dataset: columns `{id, name}`; rows `{id, values:
/// {<columnId>: string}}`, with only known columns and string cells.
pub fn normalize_dataset(definition: &Value, body: &Value) -> Result<(Value, Value), String> {
    let raw_cols = definition.as_array().cloned().unwrap_or_default();
    if raw_cols.is_empty() {
        return Err("shared_library.no_columns".into());
    }
    if raw_cols.len() > MAX_COLUMNS {
        return Err("shared_library.too_many:columns".into());
    }
    let mut ids = HashSet::new();
    let mut names: Vec<String> = Vec::new();
    let mut cols = Vec::new();
    for c in raw_cols {
        let Value::Object(mut m) = c else {
            return Err("shared_library.bad_column".into());
        };
        let name = m
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string();
        if !valid_name(&name) {
            return Err("shared_library.bad_column_name".into());
        }
        if names.contains(&name) {
            return Err("shared_library.duplicate_column".into());
        }
        ensure_id(&mut m, &mut ids);
        names.push(name.clone());
        cols.push(json!({ "id": m["id"].clone(), "name": name }));
    }
    let col_ids: Vec<String> = cols.iter().filter_map(|c| as_str(c, "id")).collect();
    let raw_rows = body.as_array().cloned().unwrap_or_default();
    if raw_rows.len() > MAX_ROWS {
        return Err("shared_library.too_many:rows".into());
    }
    let mut row_ids = HashSet::new();
    let mut rows = Vec::new();
    for r in raw_rows {
        let Value::Object(mut m) = r else {
            return Err("shared_library.bad_row".into());
        };
        ensure_id(&mut m, &mut row_ids);
        let given = m
            .get("values")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let mut values = Map::new();
        for c in &col_ids {
            let v = match given.get(c) {
                Some(Value::String(s)) => s.clone(),
                Some(Value::Null) | None => String::new(),
                Some(other) => other.to_string(),
            };
            check_text("cell", &v, MAX_CELL)?;
            values.insert(c.clone(), json!(v));
        }
        rows.push(json!({ "id": m["id"].clone(), "values": values }));
    }
    Ok((Value::Array(cols), Value::Array(rows)))
}

fn normalize(kind: Kind, definition: &Value, body: &Value) -> Result<(Value, Value), String> {
    if kind.entity == SHARED_STEP {
        normalize_shared(definition, body)
    } else {
        normalize_dataset(definition, body)
    }
}

/// The canonical content of a version (what the hash covers).
pub fn content(kind_entity: &str, name: &str, definition: &Value, body: &Value) -> Value {
    if kind_entity == SHARED_STEP || kind_entity == SHARED_STEP_REVISION {
        json!({ "name": name, "params": definition, "steps": body })
    } else {
        json!({ "name": name, "columns": definition, "rows": body })
    }
}

pub fn revision_id(kind_entity: &str, item_id: &str, version: i64, sha: &str) -> String {
    let ns = kind_of(kind_entity).map_or(NS_SHARED_STEP_REVISION, |k| k.ns);
    Uuid::new_v5(&ns, format!("{item_id}:{version}:{sha}").as_bytes()).to_string()
}

// ------------------------------------------------------------------- reads

fn parse(s: &str) -> Value {
    serde_json::from_str(s).unwrap_or_else(|_| json!([]))
}

struct Row {
    id: String,
    workspace_id: Option<String>,
    project_id: String,
    name: String,
    description: String,
    definition: Value,
    body: Value,
    status: String,
    version: i64,
    sha: String,
    created_by: String,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
    revision: i64,
}

fn read_row(conn: &Connection, kind: Kind, id: &str) -> Result<Option<Row>, String> {
    conn.query_row(
        &format!(
            "SELECT id, workspace_id, project_id, name, description, {def}, {body}, status, version, \
             content_sha256, created_by, created_at, updated_at, deleted_at, revision \
             FROM {table} WHERE id = ?1",
            def = kind.def,
            body = kind.body,
            table = kind.table
        ),
        params![id],
        |r| {
            Ok(Row {
                id: r.get(0)?,
                workspace_id: r.get(1)?,
                project_id: r.get(2)?,
                name: r.get(3)?,
                description: r.get(4)?,
                definition: parse(&r.get::<_, String>(5)?),
                body: parse(&r.get::<_, String>(6)?),
                status: r.get(7)?,
                version: r.get(8)?,
                sha: r.get(9)?,
                created_by: r.get(10)?,
                created_at: r.get(11)?,
                updated_at: r.get(12)?,
                deleted_at: r.get(13)?,
                revision: r.get(14)?,
            })
        },
    )
    .optional()
    .map_err(err)
}

/// A case that names a library item: id, scenario id, title, status, data.
type NamingCase = (String, String, String, String, Value);

/// Live cases of the project whose data names `item_id`, with their data.
fn cases_naming(
    conn: &Connection,
    project_id: &str,
    item_id: &str,
) -> Result<Vec<NamingCase>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, scenario_id, title, status, data FROM test_cases \
             WHERE project_id = ?1 AND deleted_at IS NULL AND instr(data, ?2) > 0 \
             ORDER BY scenario_id",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map(params![project_id, item_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
            ))
        })
        .map_err(err)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(err)?;
    Ok(rows
        .into_iter()
        .filter_map(|(id, key, title, status, data)| {
            let data: Value = serde_json::from_str(&data).ok()?;
            let (s, d) = materialize::referenced(&data);
            (s.iter().chain(d.iter()).any(|x| x == item_id))
                .then_some((id, key, title, status, data))
        })
        .collect())
}

fn to_item(conn: &Connection, kind: Kind, row: Row) -> Result<LibraryItem, String> {
    let used_by = cases_naming(conn, &row.project_id, &row.id)?.len() as i64;
    Ok(LibraryItem {
        id: row.id,
        project_id: row.project_id,
        kind: kind.entity.to_string(),
        name: row.name,
        description: row.description,
        definition: row.definition,
        body: row.body,
        status: row.status,
        version: row.version,
        content_sha256: row.sha,
        used_by,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
        revision: row.revision,
    })
}

/// The live item if its project is the user's.
fn owned(conn: &Connection, id: &str, user: &str) -> Result<(Kind, Row), String> {
    for kind in [SHARED, DATA] {
        if let Some(row) = read_row(conn, kind, id)? {
            if row.deleted_at.is_none() && project::owns(conn, &row.project_id, user)? {
                return Ok((kind, row));
            }
        }
    }
    Err("shared_library.not_found".into())
}

pub(crate) fn list_items(
    conn: &Connection,
    project_id: &str,
    kind_entity: &str,
    user: &str,
) -> Result<Vec<LibraryItem>, String> {
    if !project::owns(conn, project_id, user)? {
        return Err("project not found".into());
    }
    let kind = kind_of(kind_entity).ok_or("shared_library.bad_kind")?;
    let ids: Vec<String> = {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT id FROM {} WHERE project_id = ?1 AND deleted_at IS NULL \
                 ORDER BY lower(name), id",
                kind.table
            ))
            .map_err(err)?;
        let rows = stmt
            .query_map(params![project_id], |r| r.get(0))
            .map_err(err)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(err)?;
        rows
    };
    let mut out = Vec::new();
    for id in ids {
        if let Some(row) = read_row(conn, kind, &id)? {
            out.push(to_item(conn, kind, row)?);
        }
    }
    Ok(out)
}

pub(crate) fn get_item(conn: &Connection, id: &str, user: &str) -> Result<LibraryItem, String> {
    let (kind, row) = owned(conn, id, user)?;
    to_item(conn, kind, row)
}

pub(crate) fn list_versions(
    conn: &Connection,
    id: &str,
    user: &str,
) -> Result<Vec<LibraryVersion>, String> {
    let (kind, _) = owned(conn, id, user)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, item_id, version, name, {def}, {body}, content_sha256, created_by, created_at \
             FROM {table} WHERE item_id = ?1 ORDER BY version DESC, created_at DESC",
            def = kind.def,
            body = kind.body,
            table = kind.revision_table
        ))
        .map_err(err)?;
    let rows = stmt
        .query_map(params![id], |r| {
            Ok(LibraryVersion {
                id: r.get(0)?,
                item_id: r.get(1)?,
                version: r.get(2)?,
                name: r.get(3)?,
                definition: parse(&r.get::<_, String>(4)?),
                body: parse(&r.get::<_, String>(5)?),
                content_sha256: r.get(6)?,
                created_by: r.get(7)?,
                created_at: r.get(8)?,
            })
        })
        .map_err(err)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(err)?;
    Ok(rows)
}

// ----------------------------------------------------------------- library

/// A version as the library reads it: number, id, name, definition, body.
type VersionRow = (i64, String, String, Value, Value);

/// The library of one project, read from the database.
pub(crate) struct DbLibrary<'c> {
    pub conn: &'c Connection,
    pub project_id: String,
}

impl DbLibrary<'_> {
    fn version_row(
        &self,
        kind: Kind,
        item_id: &str,
        revision_id: Option<&str>,
    ) -> Option<VersionRow> {
        match revision_id {
            None => {
                let row = read_row(self.conn, kind, item_id).ok()??;
                if row.deleted_at.is_some() || row.project_id != self.project_id {
                    return None;
                }
                let id = revision_id_of(kind, &row.id, row.version, &row.sha);
                Some((row.version, id, row.name, row.definition, row.body))
            }
            Some(rev) => self
                .conn
                .query_row(
                    &format!(
                        "SELECT version, id, name, {def}, {body} FROM {table} \
                         WHERE id = ?1 AND item_id = ?2 AND project_id = ?3",
                        def = kind.def,
                        body = kind.body,
                        table = kind.revision_table
                    ),
                    params![rev, item_id, self.project_id],
                    |r| {
                        Ok((
                            r.get(0)?,
                            r.get(1)?,
                            r.get(2)?,
                            parse(&r.get::<_, String>(3)?),
                            parse(&r.get::<_, String>(4)?),
                        ))
                    },
                )
                .optional()
                .ok()?,
        }
    }
}

fn revision_id_of(kind: Kind, item_id: &str, version: i64, sha: &str) -> String {
    revision_id(kind.entity, item_id, version, sha)
}

impl Library for DbLibrary<'_> {
    fn shared(&self, item_id: &str, revision_id: Option<&str>) -> Option<SharedVersion> {
        let (version, revision_id, name, _params, steps) =
            self.version_row(SHARED, item_id, revision_id)?;
        Some(SharedVersion {
            item_id: item_id.to_string(),
            version,
            revision_id,
            name,
            steps: steps.as_array().cloned().unwrap_or_default(),
        })
    }

    fn dataset(&self, item_id: &str, revision_id: Option<&str>) -> Option<DatasetVersion> {
        let (version, revision_id, name, columns, rows) =
            self.version_row(DATA, item_id, revision_id)?;
        Some(DatasetVersion {
            item_id: item_id.to_string(),
            version,
            revision_id,
            name,
            columns: columns
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|c| Some((as_str(c, "id")?, as_str(c, "name")?)))
                .collect(),
            rows: rows
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|r| {
                    Some((
                        as_str(r, "id")?,
                        r.get("values")
                            .and_then(Value::as_object)
                            .cloned()
                            .unwrap_or_default(),
                    ))
                })
                .collect(),
        })
    }
}

/// Rebuilds the copies of a case being saved (`test_case::prepare_data`).
pub(crate) fn materialize_case(
    conn: &Connection,
    project_id: &str,
    case_id: &str,
    data: &mut Value,
) -> Result<materialize::Outcome, String> {
    let lib = DbLibrary {
        conn,
        project_id: project_id.to_string(),
    };
    materialize::materialize(case_id, data, &lib)
}

/// The state of each call and binding of a case the user owns.
pub(crate) fn case_status(
    conn: &Connection,
    case_id: &str,
    user: &str,
) -> Result<Vec<materialize::LibraryRefStatus>, String> {
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT project_id, data FROM test_cases WHERE id = ?1 AND deleted_at IS NULL",
            params![case_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(err)?;
    let Some((project_id, data)) = row else {
        return Err("test case not found".into());
    };
    if !project::owns(conn, &project_id, user)? {
        return Err("test case not found".into());
    }
    let data: Value = serde_json::from_str(&data).unwrap_or_else(|_| json!({}));
    let lib = DbLibrary { conn, project_id };
    Ok(materialize::status(case_id, &data, &lib))
}

/// What a case's data looks like once materialized, without saving (the
/// editor's insert preview). `case_id` None: a case not created yet; its ids
/// are derived from a placeholder and rebuilt on its first save.
pub(crate) fn preview(
    conn: &Connection,
    project_id: &str,
    case_id: Option<&str>,
    data: &Value,
    user: &str,
) -> Result<Value, String> {
    if !project::owns(conn, project_id, user)? {
        return Err("project not found".into());
    }
    let mut data = data.clone();
    materialize_case(conn, project_id, case_id.unwrap_or("new"), &mut data)?;
    Ok(data)
}

// ------------------------------------------------------------------ writes

fn project_workspace(conn: &Connection, project_id: &str) -> Result<String, String> {
    let ws: Option<Option<String>> = conn
        .query_row(
            "SELECT workspace_id FROM projects WHERE id = ?1",
            params![project_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?;
    match ws.flatten() {
        Some(ws) => Ok(ws),
        None => ensure_workspace(conn),
    }
}

fn name_taken(
    conn: &Connection,
    kind: Kind,
    project_id: &str,
    name: &str,
    except: Option<&str>,
) -> Result<bool, String> {
    conn.query_row(
        &format!(
            "SELECT 1 FROM {} WHERE project_id = ?1 AND deleted_at IS NULL \
             AND lower(name) = lower(?2) AND id IS NOT ?3",
            kind.table
        ),
        params![project_id, name, except],
        |_| Ok(()),
    )
    .optional()
    .map_err(err)
    .map(|r| r.is_some())
}

fn check_head(input: &LibraryInput) -> Result<(String, String), String> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err("shared_library.empty_name".into());
    }
    check_text("name", &name, MAX_NAME)?;
    let description = input.description.clone().unwrap_or_default();
    check_text("description", &description, MAX_DESCRIPTION)?;
    Ok((name, description))
}

/// Writes the version row (if absent) and queues it for the push.
#[allow(clippy::too_many_arguments)]
fn write_version(
    conn: &Connection,
    kind: Kind,
    item_id: &str,
    project_id: &str,
    version: i64,
    name: &str,
    definition: &Value,
    body: &Value,
    sha: &str,
    user: &str,
    queue: bool,
) -> Result<String, String> {
    let id = revision_id_of(kind, item_id, version, sha);
    let inserted = conn
        .execute(
            &format!(
                "INSERT OR IGNORE INTO {table} (id, workspace_id, project_id, item_id, version, name, \
                 {def}, {body}, content_sha256, created_by, created_at, hlc) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?11)",
                table = kind.revision_table,
                def = kind.def,
                body = kind.body
            ),
            params![
                id,
                project_workspace(conn, project_id)?,
                project_id,
                item_id,
                version,
                name,
                definition.to_string(),
                body.to_string(),
                sha,
                user,
                if queue { crate::oplog::next_hlc(conn)? } else { String::new() },
            ],
        )
        .map_err(err)?;
    if inserted > 0 && queue {
        journal::record_append(conn, kind.revision_entity, &id, user)?;
    }
    Ok(id)
}

pub(crate) fn create_item(conn: &Connection, input: &LibraryInput) -> Result<LibraryItem, String> {
    let user = &input.user_id;
    if !project::owns(conn, &input.project_id, user)? {
        return Err("project not found".into());
    }
    let kind = kind_of(&input.kind).ok_or("shared_library.bad_kind")?;
    let (name, description) = check_head(input)?;
    if name_taken(conn, kind, &input.project_id, &name, None)? {
        return Err("shared_library.duplicate_name".into());
    }
    let (definition, body) = normalize(kind, &input.definition, &input.body)?;
    let sha = steps::content_sha256(&content(kind.entity, &name, &definition, &body));
    let id = Uuid::new_v4().to_string();
    conn.execute(
        &format!(
            "INSERT INTO {table} (id, workspace_id, project_id, name, description, {def}, {body}, \
             status, version, content_sha256, created_by, updated_by, created_at, updated_at, revision) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', 1, ?8, ?9, ?9, datetime('now'), datetime('now'), 1)",
            table = kind.table,
            def = kind.def,
            body = kind.body
        ),
        params![
            id,
            project_workspace(conn, &input.project_id)?,
            input.project_id,
            name,
            description,
            definition.to_string(),
            body.to_string(),
            sha,
            user,
        ],
    )
    .map_err(err)?;
    journal::record(
        conn,
        Change::new(
            kind.entity,
            &id,
            Action::Create,
            Actor::user(user),
            "upsert",
            1,
            user,
        ),
    )?;
    write_version(
        conn,
        kind,
        &id,
        &input.project_id,
        1,
        &name,
        &definition,
        &body,
        &sha,
        user,
        true,
    )?;
    get_item(conn, &id, user)
}

/// Saves a change. A content change bumps the version, keeps the new version
/// and rewrites every live case that follows the item (ADR-0055 §4).
pub(crate) fn update_item(
    conn: &Connection,
    id: &str,
    input: &LibraryInput,
) -> Result<LibrarySave, String> {
    let user = &input.user_id;
    let (kind, row) = owned(conn, id, user)?;
    let (name, description) = check_head(input)?;
    if name_taken(conn, kind, &row.project_id, &name, Some(id))? {
        return Err("shared_library.duplicate_name".into());
    }
    let (definition, body) = normalize(kind, &input.definition, &input.body)?;
    let sha = steps::content_sha256(&content(kind.entity, &name, &definition, &body));
    let content_changed = sha != row.sha;
    if !content_changed && description == row.description {
        return Ok(LibrarySave {
            item: to_item(conn, kind, row)?,
            updated_cases: Vec::new(),
        });
    }
    let version = if content_changed {
        row.version + 1
    } else {
        row.version
    };
    let before = journal::snapshot(conn, kind.entity, id)?;
    let revision: i64 = conn
        .query_row(
            &format!(
                "UPDATE {table} SET name = ?2, description = ?3, {def} = ?4, {body} = ?5, version = ?6, \
                 content_sha256 = ?7, updated_by = ?8, updated_at = datetime('now'), \
                 revision = revision + 1 WHERE id = ?1 RETURNING revision",
                table = kind.table,
                def = kind.def,
                body = kind.body
            ),
            params![
                id,
                name,
                description,
                definition.to_string(),
                body.to_string(),
                version,
                sha,
                user
            ],
            |r| r.get(0),
        )
        .map_err(err)?;
    journal::record(
        conn,
        Change::new(
            kind.entity,
            id,
            Action::Update,
            Actor::user(user),
            "upsert",
            revision,
            user,
        )
        .before(before),
    )?;
    let mut updated_cases = Vec::new();
    if content_changed {
        write_version(
            conn,
            kind,
            id,
            &row.project_id,
            version,
            &name,
            &definition,
            &body,
            &sha,
            user,
            true,
        )?;
        updated_cases = propagate(conn, kind, &row.project_id, id, version, user)?;
    }
    Ok(LibrarySave {
        item: get_item(conn, id, user)?,
        updated_cases,
    })
}

/// Rewrites the live cases of the project that follow `item_id` and are not
/// at `version`, as the user, each with the cause in its audit event.
pub(crate) fn propagate(
    conn: &Connection,
    kind: Kind,
    project_id: &str,
    item_id: &str,
    version: i64,
    user: &str,
) -> Result<Vec<String>, String> {
    let mut done = Vec::new();
    for (case_id, _, _, _, data) in cases_naming(conn, project_id, item_id)? {
        if !materialize::behind(&data, item_id, version) {
            continue;
        }
        let cause = json!({ "cause": { kind.entity: item_id, "version": version } });
        if crate::test_case::refresh_from_library(conn, &case_id, user, cause)? {
            done.push(case_id);
        }
    }
    Ok(done)
}

/// The cases a change of the item touches, by state.
pub(crate) fn impact(conn: &Connection, id: &str, user: &str) -> Result<LibraryImpact, String> {
    let (_, row) = owned(conn, id, user)?;
    let mut out = LibraryImpact::default();
    for (case_id, key, title, status, data) in cases_naming(conn, &row.project_id, id)? {
        let refs = [materialize::SHARED_REFS, materialize::DATASET_REFS]
            .iter()
            .flat_map(|k| {
                data.get(*k)
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default()
            })
            .filter(|r| {
                r.get("sharedStepId")
                    .or_else(|| r.get("datasetId"))
                    .and_then(Value::as_str)
                    == Some(id)
            })
            .collect::<Vec<_>>();
        let follow = refs
            .iter()
            .any(|r| r.get("follow").and_then(Value::as_bool).unwrap_or(true));
        let version = refs
            .iter()
            .filter_map(|r| r.get("version").and_then(Value::as_i64))
            .max()
            .unwrap_or(0);
        if follow {
            let n = out
                .by_status
                .get(&status)
                .and_then(Value::as_i64)
                .unwrap_or(0);
            out.by_status.insert(status.clone(), json!(n + 1));
        }
        out.cases.push(LibraryImpactCase {
            id: case_id,
            scenario_id: key,
            title,
            status,
            follow,
            version,
        });
    }
    Ok(out)
}

/// Marks the item obsolete or active again (no new version).
pub(crate) fn set_status(
    conn: &Connection,
    id: &str,
    status: &str,
    user: &str,
) -> Result<LibraryItem, String> {
    if status != ACTIVE && status != OBSOLETE {
        return Err("shared_library.bad_status".into());
    }
    let (kind, row) = owned(conn, id, user)?;
    if row.status == status {
        return to_item(conn, kind, row);
    }
    let before = journal::snapshot(conn, kind.entity, id)?;
    let revision: i64 = conn
        .query_row(
            &format!(
                "UPDATE {} SET status = ?2, updated_by = ?3, updated_at = datetime('now'), \
                 revision = revision + 1 WHERE id = ?1 RETURNING revision",
                kind.table
            ),
            params![id, status, user],
            |r| r.get(0),
        )
        .map_err(err)?;
    journal::record(
        conn,
        Change::new(
            kind.entity,
            id,
            Action::Update,
            Actor::user(user),
            "upsert",
            revision,
            user,
        )
        .before(before),
    )?;
    get_item(conn, id, user)
}

/// Deletes an item no live case uses (it goes to the trash).
pub(crate) fn delete_item(conn: &Connection, id: &str, user: &str) -> Result<(), String> {
    let (kind, row) = owned(conn, id, user)?;
    if !cases_naming(conn, &row.project_id, id)?.is_empty() {
        return Err("shared_library.in_use".into());
    }
    let before = journal::snapshot(conn, kind.entity, id)?;
    let revision: i64 = conn
        .query_row(
            &format!(
                "UPDATE {} SET deleted_at = datetime('now'), updated_by = ?2, \
                 revision = revision + 1 WHERE id = ?1 RETURNING revision",
                kind.table
            ),
            params![id, user],
            |r| r.get(0),
        )
        .map_err(err)?;
    journal::record(
        conn,
        Change::new(
            kind.entity,
            id,
            Action::Delete,
            Actor::user(user),
            "delete",
            revision,
            user,
        )
        .before(before),
    )?;
    Ok(())
}

/// After a pull: rewrites the cases of the touched projects that are behind
/// the library on this device. Skipped where the account may not edit cases
/// (a Viewer keeps what it pulled; whoever may edit will rewrite them).
pub(crate) fn reconcile(
    conn: &Connection,
    user: &str,
    project_ids: &[String],
) -> Result<(), String> {
    for project_id in project_ids {
        for kind in [SHARED, DATA] {
            let items: Vec<(String, i64)> = {
                let mut stmt = conn
                    .prepare(&format!(
                        "SELECT id, version FROM {} WHERE project_id = ?1 AND deleted_at IS NULL",
                        kind.table
                    ))
                    .map_err(err)?;
                let rows = stmt
                    .query_map(params![project_id], |r| Ok((r.get(0)?, r.get(1)?)))
                    .map_err(err)?
                    .collect::<rusqlite::Result<Vec<_>>>()
                    .map_err(err)?;
                rows
            };
            for (item_id, version) in items {
                for (case_id, _, _, _, data) in cases_naming(conn, project_id, &item_id)? {
                    if !materialize::behind(&data, &item_id, version) {
                        continue;
                    }
                    if crate::workspaces::check_write(conn, user, "test_case", &case_id, false)
                        .is_err()
                    {
                        continue;
                    }
                    let cause = json!({ "cause": { kind.entity: item_id, "version": version } });
                    crate::test_case::refresh_from_library(conn, &case_id, user, cause)?;
                }
            }
        }
    }
    Ok(())
}

// -------------------------------------------------------------------- sync

pub(crate) fn table_for(entity: &str) -> Option<&'static str> {
    match entity {
        SHARED_STEP => Some(SHARED.table),
        DATASET => Some(DATA.table),
        _ => None,
    }
}

pub(crate) fn owner_sql(entity: &str) -> Option<&'static str> {
    match entity {
        SHARED_STEP => Some(
            "SELECT p.owner_id FROM shared_steps x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1",
        ),
        DATASET => Some(
            "SELECT p.owner_id FROM datasets x JOIN projects p ON p.id = x.project_id WHERE x.id = ?1",
        ),
        _ => None,
    }
}

/// `ENTITIES` as an SQL list literal.
pub(crate) fn entities_sql_list() -> String {
    ENTITIES
        .iter()
        .chain(REVISION_ENTITIES.iter())
        .map(|e| format!("'{e}'"))
        .collect::<Vec<_>>()
        .join(",")
}

/// The document pushed for an item: its whole state.
pub(crate) fn read_payload(
    conn: &Connection,
    entity: &str,
    id: &str,
) -> Result<Option<(Value, i64, bool)>, String> {
    let Some(kind) = kind_of(entity) else {
        return Ok(None);
    };
    let Some(row) = read_row(conn, kind, id)? else {
        return Ok(None);
    };
    let mut p = Map::new();
    p.insert("id".into(), json!(row.id));
    p.insert("workspaceId".into(), json!(row.workspace_id));
    p.insert("projectId".into(), json!(row.project_id));
    p.insert("name".into(), json!(row.name));
    p.insert("description".into(), json!(row.description));
    p.insert(kind.def.into(), row.definition);
    p.insert(kind.body.into(), row.body);
    p.insert("status".into(), json!(row.status));
    p.insert("version".into(), json!(row.version));
    p.insert("contentSha256".into(), json!(row.sha));
    p.insert("createdBy".into(), json!(row.created_by));
    p.insert("createdAt".into(), json!(row.created_at));
    p.insert("updatedAt".into(), json!(row.updated_at));
    p.insert("revision".into(), json!(row.revision));
    Ok(Some((
        Value::Object(p),
        row.revision,
        row.deleted_at.is_some(),
    )))
}

/// Writes a pulled item (the server's version wins) and keeps its version
/// row, so a case can be rebuilt even before the version document arrives.
#[allow(clippy::too_many_arguments)]
pub(crate) fn write_doc(
    conn: &Connection,
    workspace_id: &str,
    user: &str,
    entity: &str,
    id: &str,
    revision: i64,
    deleted: bool,
    p: &Value,
) -> Result<(), String> {
    let Some(kind) = kind_of(entity) else {
        return Ok(());
    };
    if deleted {
        conn.execute(
            &format!(
                "UPDATE {} SET deleted_at = datetime('now'), revision = ?2 WHERE id = ?1",
                kind.table
            ),
            params![id, revision],
        )
        .map_err(err)?;
        return Ok(());
    }
    let s = |k: &str| {
        p.get(k)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    let arr = |k: &str| {
        p.get(k)
            .filter(|v| v.is_array())
            .cloned()
            .unwrap_or_else(|| json!([]))
    };
    let (project_id, name) = (s("projectId"), s("name"));
    let (definition, body) = (arr(kind.def), arr(kind.body));
    let version = p.get("version").and_then(Value::as_i64).unwrap_or(1);
    let sha = steps::content_sha256(&content(kind.entity, &name, &definition, &body));
    conn.execute(
        &format!(
            "INSERT INTO {table} (id, workspace_id, project_id, name, description, {def}, {body}, status, \
             version, content_sha256, created_by, updated_by, created_at, updated_at, revision, deleted_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11, coalesce(?12, datetime('now')), \
             datetime('now'), ?13, NULL) \
             ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, name = excluded.name, \
             description = excluded.description, {def} = excluded.{def}, {body} = excluded.{body}, \
             status = excluded.status, version = excluded.version, \
             content_sha256 = excluded.content_sha256, updated_by = excluded.updated_by, \
             updated_at = datetime('now'), revision = excluded.revision, deleted_at = NULL",
            table = kind.table,
            def = kind.def,
            body = kind.body
        ),
        params![
            id,
            workspace_id,
            project_id,
            name,
            s("description"),
            definition.to_string(),
            body.to_string(),
            p.get("status").and_then(Value::as_str).unwrap_or(ACTIVE),
            version,
            sha,
            user,
            p.get("createdAt").and_then(Value::as_str),
            revision,
        ],
    )
    .map_err(err)?;
    write_version(
        conn,
        kind,
        id,
        &project_id,
        version,
        &name,
        &definition,
        &body,
        &sha,
        user,
        false,
    )?;
    Ok(())
}

fn version_payload(conn: &Connection, kind: Kind, id: &str) -> Result<Option<Value>, String> {
    conn.query_row(
        &format!(
            "SELECT id, workspace_id, project_id, item_id, version, name, {def}, {body}, content_sha256, \
             created_by, created_at, hlc FROM {table} WHERE id = ?1",
            def = kind.def,
            body = kind.body,
            table = kind.revision_table
        ),
        params![id],
        |r| {
            let mut p = Map::new();
            p.insert("id".into(), json!(r.get::<_, String>(0)?));
            p.insert("workspaceId".into(), json!(r.get::<_, Option<String>>(1)?));
            p.insert("projectId".into(), json!(r.get::<_, String>(2)?));
            p.insert("itemId".into(), json!(r.get::<_, String>(3)?));
            p.insert("version".into(), json!(r.get::<_, i64>(4)?));
            p.insert("name".into(), json!(r.get::<_, String>(5)?));
            p.insert(kind.def.into(), parse(&r.get::<_, String>(6)?));
            p.insert(kind.body.into(), parse(&r.get::<_, String>(7)?));
            p.insert("contentSha256".into(), json!(r.get::<_, String>(8)?));
            p.insert("createdBy".into(), json!(r.get::<_, String>(9)?));
            p.insert("createdAt".into(), json!(r.get::<_, String>(10)?));
            p.insert("hlc".into(), json!(r.get::<_, String>(11)?));
            Ok(Value::Object(p))
        },
    )
    .optional()
    .map_err(err)
}

/// Stores a pulled version unless its id is already here. A document whose
/// id does not match its content is skipped (it could never be the version
/// a case names).
fn version_insert(conn: &Connection, kind: Kind, user: &str, p: &Value) -> Result<(), String> {
    let s = |k: &str| p.get(k).and_then(Value::as_str);
    let (Some(id), Some(project), Some(item), Some(name)) =
        (s("id"), s("projectId"), s("itemId"), s("name"))
    else {
        tracing::warn!(
            "skipped a pulled {} without its required fields",
            kind.revision_entity
        );
        return Ok(());
    };
    if let Some(hlc) = s("hlc") {
        crate::oplog::observe_hlc(conn, hlc)?;
    }
    let version = p.get("version").and_then(Value::as_i64).unwrap_or(0);
    let definition = p.get(kind.def).cloned().unwrap_or_else(|| json!([]));
    let body = p.get(kind.body).cloned().unwrap_or_else(|| json!([]));
    let sha = steps::content_sha256(&content(kind.entity, name, &definition, &body));
    if revision_id_of(kind, item, version, &sha) != id {
        tracing::warn!(
            "skipped a pulled {} whose id does not match its content",
            kind.revision_entity
        );
        return Ok(());
    }
    conn.execute(
        &format!(
            "INSERT OR IGNORE INTO {table} (id, workspace_id, project_id, item_id, version, name, {def}, \
             {body}, content_sha256, created_by, created_at, hlc) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, \
             coalesce(?11, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), coalesce(?12, ''))",
            table = kind.revision_table,
            def = kind.def,
            body = kind.body
        ),
        params![
            id,
            match s("workspaceId") {
                Some(ws) => ws.to_string(),
                None => ensure_workspace(conn)?,
            },
            project,
            item,
            version,
            name,
            definition.to_string(),
            body.to_string(),
            sha,
            s("createdBy").unwrap_or(user),
            s("createdAt"),
            s("hlc"),
        ],
    )
    .map_err(err)?;
    Ok(())
}

fn version_owner(conn: &Connection, kind: Kind, id: &str) -> Result<Option<String>, String> {
    let owner: Option<Option<String>> = conn
        .query_row(
            &format!(
                "SELECT p.owner_id FROM {} v JOIN projects p ON p.id = v.project_id WHERE v.id = ?1",
                kind.revision_table
            ),
            params![id],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?;
    Ok(owner.flatten().filter(|o| !o.is_empty()))
}

pub fn shared_revision_payload(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    version_payload(conn, SHARED, id)
}
pub fn shared_revision_insert_if_absent(
    conn: &Connection,
    user: &str,
    p: &Value,
) -> Result<(), String> {
    version_insert(conn, SHARED, user, p)
}
pub fn shared_revision_owner(conn: &Connection, id: &str) -> Result<Option<String>, String> {
    version_owner(conn, SHARED, id)
}
pub fn dataset_revision_payload(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    version_payload(conn, DATA, id)
}
pub fn dataset_revision_insert_if_absent(
    conn: &Connection,
    user: &str,
    p: &Value,
) -> Result<(), String> {
    version_insert(conn, DATA, user, p)
}
pub fn dataset_revision_owner(conn: &Connection, id: &str) -> Result<Option<String>, String> {
    version_owner(conn, DATA, id)
}

// ---------------------------------------------------------------- commands

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn library_list(
    db: State<Db>,
    project_id: String,
    kind: String,
    user_id: String,
) -> Result<Vec<LibraryItem>, String> {
    db.with_conn(|conn| list_items(conn, &project_id, &kind, &user_id))
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn library_get(db: State<Db>, id: String, user_id: String) -> Result<LibraryItem, String> {
    db.with_conn(|conn| get_item(conn, &id, &user_id))
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn library_create(db: State<Db>, input: LibraryInput) -> Result<LibraryItem, String> {
    db.with_tx(|conn| create_item(conn, &input))
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn library_update(
    db: State<Db>,
    id: String,
    input: LibraryInput,
) -> Result<LibrarySave, String> {
    db.with_tx(|conn| update_item(conn, &id, &input))
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn library_impact(db: State<Db>, id: String, user_id: String) -> Result<LibraryImpact, String> {
    db.with_conn(|conn| impact(conn, &id, &user_id))
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn library_set_status(
    db: State<Db>,
    id: String,
    status: String,
    user_id: String,
) -> Result<LibraryItem, String> {
    db.with_tx(|conn| set_status(conn, &id, &status, &user_id))
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn library_delete(db: State<Db>, id: String, user_id: String) -> Result<(), String> {
    db.with_tx(|conn| delete_item(conn, &id, &user_id))
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn library_versions(
    db: State<Db>,
    id: String,
    user_id: String,
) -> Result<Vec<LibraryVersion>, String> {
    db.with_conn(|conn| list_versions(conn, &id, &user_id))
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn library_case_status(
    db: State<Db>,
    case_id: String,
    user_id: String,
) -> Result<Vec<materialize::LibraryRefStatus>, String> {
    db.with_conn(|conn| case_status(conn, &case_id, &user_id))
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn library_preview(
    db: State<Db>,
    project_id: String,
    case_id: Option<String>,
    data: Value,
    user_id: String,
) -> Result<Value, String> {
    db.with_conn(|conn| preview(conn, &project_id, case_id.as_deref(), &data, &user_id))
}
