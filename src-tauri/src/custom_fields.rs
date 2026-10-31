//! Typed custom fields per project (FLD-01, ADR-0018) and the case type and
//! automation status of a test case. Definitions are a synced `lww` entity
//! (`custom_field`); values live in each record's `data.custom`, keyed by the
//! immutable `field_key`, so they are revisioned, synced and audited with the
//! record (ADR-0018 option B).
//!
//! - **Id:** `UUIDv5(NS_CUSTOM_FIELD, "<project_id>:<entity>:<field_key>")`:
//!   two devices that create the same key write the same row.
//! - **Immutable:** `field_key` and `field_type`. A field is archived, never
//!   deleted (a deleted key would revive the same id with old values); select
//!   options are archived, never removed.
//! - **Values** are validated on a local save (`validate_values`): a known,
//!   applicable, not archived field must hold a value of its type. A key with
//!   no definition (it may come from another device before its definition),
//!   an archived field and a field that does not apply to the case's type keep
//!   their values untouched. `required` is not checked here: the editor blocks
//!   a save without it, import, AI and sync never do (ADR-0018 amendment).
//!   Pulled documents are never validated. The TS copies (`src/modules/
//!   custom-fields`, `server/src/modules/domain/custom-fields.ts`) are checked
//!   against `tests/fixtures/custom-field-vectors.json`.

use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;
#[cfg(test)]
use ts_rs::TS;
use uuid::Uuid;

use crate::db::{ensure_workspace, Db};
use crate::journal::{self, Action, Actor, Change};
use crate::project;
use crate::steps;

pub const ENTITY: &str = "custom_field";

/// Namespace of the deterministic definition ids (ADR-0018).
pub const NS_CUSTOM_FIELD: Uuid = Uuid::from_u128(0x3a7c_91d2_5b4e_5f60_8a1b_c3d5_e7f9_0b2d);

pub const ENTITIES: [&str; 5] = ["test_case", "requirement", "defect", "run", "test_cycle"];
pub const FIELD_TYPES: [&str; 10] = [
    "text",
    "long_text",
    "number",
    "integer",
    "date",
    "boolean",
    "select",
    "multi_select",
    "user",
    "url",
];
pub const CASE_TYPES: [&str; 2] = ["standard", "checklist"];
pub const AUTOMATION_STATUSES: [&str; 3] = ["manual", "to_automate", "automated"];

/// Key, inside a case's `data`, of the case type and automation status the
/// server keeps for a read-only client that has no column for them (0027).
/// Reserved: every save strips it.
pub const STASH_KEY: &str = "__caseFields";

const MAX_LABEL: usize = 100;
const MAX_DESCRIPTION: usize = 500;
const MAX_TEXT: usize = 500;
const MAX_LONG_TEXT: usize = 10_000;
const MAX_USER: usize = 200;
const MAX_URL: usize = 2_000;
const MAX_OPTIONS: usize = 100;
/// ±(2^53 − 1): what JavaScript holds exactly.
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FieldOption {
    /// 8 Crockford base32 characters; a missing one is generated on save.
    #[serde(default)]
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub archived: bool,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CustomField {
    pub id: String,
    pub project_id: String,
    pub entity: String,
    pub field_key: String,
    pub label: String,
    pub description: String,
    pub field_type: String,
    pub options: Vec<FieldOption>,
    pub required: bool,
    #[cfg_attr(test, ts(type = "unknown"))]
    pub default_value: Option<Value>,
    pub applies_to_case_types: Option<Vec<String>>,
    pub position: i64,
    pub archived_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub revision: i64,
}

#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomFieldInput {
    project_id: String,
    /// Defaults to `test_case`; immutable.
    entity: Option<String>,
    /// Only honoured on create; immutable afterwards.
    field_key: String,
    label: String,
    description: Option<String>,
    /// Only honoured on create; immutable afterwards.
    field_type: String,
    #[serde(default)]
    options: Vec<FieldOption>,
    #[serde(default)]
    required: bool,
    #[cfg_attr(test, ts(type = "unknown"))]
    default_value: Option<Value>,
    applies_to_case_types: Option<Vec<String>>,
    user_id: String,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CopySummary {
    copied: usize,
    /// Keys the target project already has: left as they are.
    skipped: Vec<String>,
}

/// `UUIDv5(NS_CUSTOM_FIELD, "<project>:<entity>:<key>")`.
pub fn field_id(project_id: &str, entity: &str, field_key: &str) -> String {
    Uuid::new_v5(
        &NS_CUSTOM_FIELD,
        format!("{project_id}:{entity}:{field_key}").as_bytes(),
    )
    .to_string()
}

/// Length as JavaScript counts it (UTF-16 code units), so every side agrees.
fn js_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// `^[a-z][a-z0-9_]{0,39}$`.
pub fn valid_key(key: &str) -> bool {
    let mut chars = key.chars();
    matches!(chars.next(), Some('a'..='z'))
        && key.len() <= 40
        && chars.all(|c| matches!(c, 'a'..='z' | '0'..='9' | '_'))
}

/// `YYYY-MM-DD`, a real calendar date.
fn valid_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    let num = |r: std::ops::Range<usize>| -> Option<u32> {
        let part = &s[r];
        part.bytes()
            .all(|c| c.is_ascii_digit())
            .then(|| part.parse().ok())
            .flatten()
    };
    let (Some(y), Some(m), Some(d)) = (num(0..4), num(5..7), num(8..10)) else {
        return false;
    };
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let days = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days).contains(&d)
}

/// An absolute `http(s)` URL with a host and no whitespace.
fn valid_url(s: &str) -> bool {
    let rest = s
        .strip_prefix("https://")
        .or_else(|| s.strip_prefix("http://"));
    let Some(rest) = rest else {
        return false;
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    js_len(s) <= MAX_URL && !host.is_empty() && !s.chars().any(char::is_whitespace)
}

/// The part of a definition the value checks need.
#[derive(Clone, Debug)]
pub struct FieldRule {
    pub field_key: String,
    pub field_type: String,
    pub options: Vec<FieldOption>,
    pub applies_to_case_types: Option<Vec<String>>,
    pub archived: bool,
}

impl From<&CustomField> for FieldRule {
    fn from(f: &CustomField) -> Self {
        FieldRule {
            field_key: f.field_key.clone(),
            field_type: f.field_type.clone(),
            options: f.options.clone(),
            applies_to_case_types: f.applies_to_case_types.clone(),
            archived: f.archived_at.is_some(),
        }
    }
}

/// Checks one value against its field. `previous` is the stored value: an
/// archived option stays valid only where it already was. Err = a code
/// (`type`, `too_long`, `option`, `duplicate`, `date`, `url`, `range`).
pub fn validate_value(
    field: &FieldRule,
    value: &Value,
    previous: Option<&Value>,
) -> Result<(), &'static str> {
    let option_ok = |id: &str, kept: bool| {
        field
            .options
            .iter()
            .any(|o| o.id == id && (!o.archived || kept))
    };
    match field.field_type.as_str() {
        "text" | "long_text" | "user" => {
            let s = value.as_str().ok_or("type")?;
            let max = match field.field_type.as_str() {
                "text" => MAX_TEXT,
                "long_text" => MAX_LONG_TEXT,
                _ => MAX_USER,
            };
            if js_len(s) > max {
                return Err("too_long");
            }
            if field.field_type == "user" && s.trim().is_empty() {
                return Err("type");
            }
            Ok(())
        }
        "number" => value
            .as_f64()
            .filter(|n| n.is_finite())
            .map(|_| ())
            .ok_or("type"),
        "integer" => {
            let n = value.as_f64().ok_or("type")?;
            if n.fract() != 0.0 {
                return Err("type");
            }
            if n.abs() > MAX_SAFE_INTEGER {
                return Err("range");
            }
            Ok(())
        }
        "date" => {
            let s = value.as_str().ok_or("type")?;
            valid_date(s).then_some(()).ok_or("date")
        }
        "boolean" => value.as_bool().map(|_| ()).ok_or("type"),
        "url" => {
            let s = value.as_str().ok_or("type")?;
            valid_url(s).then_some(()).ok_or("url")
        }
        "select" => {
            let id = value.as_str().ok_or("type")?;
            let kept = previous.and_then(Value::as_str) == Some(id);
            option_ok(id, kept).then_some(()).ok_or("option")
        }
        "multi_select" => {
            let ids = value.as_array().ok_or("type")?;
            let before: HashSet<&str> = previous
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(Value::as_str).collect())
                .unwrap_or_default();
            let mut seen = HashSet::new();
            for v in ids {
                let id = v.as_str().ok_or("type")?;
                if !seen.insert(id) {
                    return Err("duplicate");
                }
                if !option_ok(id, before.contains(id)) {
                    return Err("option");
                }
            }
            Ok(())
        }
        // A type this build does not know (from a newer device): not checked.
        _ => Ok(()),
    }
}

fn applies(field: &FieldRule, case_type: &str) -> bool {
    field
        .applies_to_case_types
        .as_ref()
        .map_or(true, |types| types.iter().any(|t| t == case_type))
}

/// Normalizes and checks `data.custom` for a save: `null` values are dropped,
/// an empty map is removed, and each value of a known, applicable, live field
/// must fit its type. Err = `custom_field.<code>:<field_key>`.
pub fn validate_values(
    fields: &[FieldRule],
    case_type: &str,
    data: &mut Value,
    previous: Option<&Value>,
) -> Result<(), String> {
    let Some(obj) = data.as_object_mut() else {
        return Ok(());
    };
    match obj.get_mut("custom") {
        None => return Ok(()),
        Some(Value::Object(map)) => map.retain(|_, v| !v.is_null()),
        Some(Value::Null) => {
            obj.remove("custom");
            return Ok(());
        }
        Some(_) => return Err("custom_field.type:custom".to_string()),
    }
    let custom = obj.get("custom").and_then(Value::as_object).cloned();
    let custom = custom.unwrap_or_default();
    if custom.is_empty() {
        obj.remove("custom");
        return Ok(());
    }
    let prev = previous.and_then(|p| p.get("custom"));
    for (key, value) in &custom {
        let Some(field) = fields.iter().find(|f| &f.field_key == key) else {
            continue;
        };
        if field.archived || !applies(field, case_type) {
            continue;
        }
        validate_value(field, value, prev.and_then(|p| p.get(key)))
            .map_err(|code| format!("custom_field.{code}:{key}"))?;
    }
    Ok(())
}

/// Takes the server's stash for read-only clients out of `data`: the case
/// type and automation status it carries, if any.
pub fn take_stash(data: &mut Value) -> Option<(Option<String>, Option<String>)> {
    let stash = data.as_object_mut()?.remove(STASH_KEY)?;
    let s = |k: &str| stash.get(k).and_then(Value::as_str).map(String::from);
    Some((s("caseType"), s("automationStatus")))
}

/// Checks a case type / automation status sent by the UI.
pub fn check_case_fields(
    case_type: Option<&str>,
    automation_status: Option<&str>,
) -> Result<(), String> {
    if let Some(t) = case_type.filter(|t| !CASE_TYPES.contains(t)) {
        return Err(format!("invalid case type: {t}"));
    }
    if let Some(s) = automation_status.filter(|s| !AUTOMATION_STATUSES.contains(s)) {
        return Err(format!("invalid automation status: {s}"));
    }
    Ok(())
}

// ---------------------------------------------------------------- repository

const SELECT_FIELD: &str = "SELECT id, project_id, entity, field_key, label, description, \
    field_type, options, required, default_value, applies_to_case_types, position, archived_at, \
    created_at, updated_at, revision FROM custom_fields";

fn json_col<T: serde::de::DeserializeOwned>(s: Option<String>) -> Option<T> {
    s.and_then(|s| serde_json::from_str(&s).ok())
}

fn map_field(r: &rusqlite::Row) -> rusqlite::Result<CustomField> {
    Ok(CustomField {
        id: r.get("id")?,
        project_id: r.get("project_id")?,
        entity: r.get("entity")?,
        field_key: r.get("field_key")?,
        label: r.get("label")?,
        description: r.get("description")?,
        field_type: r.get("field_type")?,
        options: json_col(r.get("options")?).unwrap_or_default(),
        required: r.get::<_, i64>("required")? != 0,
        default_value: json_col(r.get("default_value")?),
        applies_to_case_types: json_col(r.get("applies_to_case_types")?),
        position: r.get("position")?,
        archived_at: r.get("archived_at")?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
        revision: r.get("revision")?,
    })
}

/// Live definitions of a project and entity, archived ones included, in order.
pub(crate) fn list_fields(
    conn: &Connection,
    project_id: &str,
    entity: &str,
    user_id: &str,
) -> Result<Vec<CustomField>, String> {
    if !project::owns(conn, project_id, user_id)? {
        return Ok(Vec::new());
    }
    project_fields(conn, project_id, entity)
}

/// The same without the owner check (case saves already checked it).
pub(crate) fn project_fields(
    conn: &Connection,
    project_id: &str,
    entity: &str,
) -> Result<Vec<CustomField>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "{SELECT_FIELD} WHERE project_id = ?1 AND entity = ?2 AND deleted_at IS NULL \
             ORDER BY position, field_key"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id, entity], map_field)
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

fn get_field(conn: &Connection, id: &str) -> Result<Option<CustomField>, String> {
    conn.query_row(
        &format!("{SELECT_FIELD} WHERE id = ?1 AND deleted_at IS NULL"),
        params![id],
        map_field,
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// The field if it is live and its project is owned by `user_id`.
fn owned_field(conn: &Connection, id: &str, user_id: &str) -> Result<CustomField, String> {
    match get_field(conn, id)? {
        Some(f) if project::owns(conn, &f.project_id, user_id)? => Ok(f),
        _ => Err("custom field not found".to_string()),
    }
}

/// Checks and completes what the user can edit (label, description, options,
/// required, default, types it applies to). Options get missing ids.
fn check_definition(field_type: &str, input: &mut CustomFieldInput) -> Result<(), String> {
    let label = input.label.trim();
    if label.is_empty() || js_len(label) > MAX_LABEL {
        return Err("custom_field.label".to_string());
    }
    input.label = label.to_string();
    if input
        .description
        .as_deref()
        .is_some_and(|d| js_len(d) > MAX_DESCRIPTION)
    {
        return Err("custom_field.description".to_string());
    }
    let with_options = matches!(field_type, "select" | "multi_select");
    if with_options {
        if input.options.is_empty() || input.options.len() > MAX_OPTIONS {
            return Err("custom_field.options".to_string());
        }
        let mut used: HashSet<String> = HashSet::new();
        let mut labels: HashSet<String> = HashSet::new();
        for o in &mut input.options {
            o.label = o.label.trim().to_string();
            if o.label.is_empty() || js_len(&o.label) > MAX_LABEL {
                return Err("custom_field.option_label".to_string());
            }
            if !labels.insert(o.label.to_lowercase()) {
                return Err("custom_field.option_duplicate".to_string());
            }
            if o.id.is_empty() || !used.insert(o.id.clone()) {
                o.id = steps::random_id(&mut used);
            }
        }
    } else {
        input.options.clear();
    }
    if let Some(types) = &input.applies_to_case_types {
        if types.is_empty() || types.iter().any(|t| !CASE_TYPES.contains(&t.as_str())) {
            return Err("custom_field.applies_to".to_string());
        }
    }
    if input.default_value.as_ref().is_some_and(Value::is_null) {
        input.default_value = None;
    }
    if let Some(default) = &input.default_value {
        let rule = FieldRule {
            field_key: input.field_key.clone(),
            field_type: field_type.to_string(),
            options: input.options.clone(),
            applies_to_case_types: None,
            archived: false,
        };
        validate_value(&rule, default, None).map_err(|c| format!("custom_field.default.{c}"))?;
    }
    Ok(())
}

fn to_json<T: Serialize>(v: &T) -> Result<String, String> {
    serde_json::to_string(v).map_err(|e| e.to_string())
}

pub(crate) fn create_field(
    conn: &Connection,
    mut input: CustomFieldInput,
) -> Result<CustomField, String> {
    let user = input.user_id.clone();
    if !project::owns(conn, &input.project_id, &user)? {
        return Err("project not found".to_string());
    }
    let entity = input.entity.clone().unwrap_or_else(|| "test_case".into());
    if !ENTITIES.contains(&entity.as_str()) {
        return Err(format!("invalid entity: {entity}"));
    }
    input.field_key = input.field_key.trim().to_string();
    if !valid_key(&input.field_key) {
        return Err("custom_field.key".to_string());
    }
    let field_type = input.field_type.clone();
    if !FIELD_TYPES.contains(&field_type.as_str()) {
        return Err("custom_field.field_type".to_string());
    }
    check_definition(&field_type, &mut input)?;
    let id = field_id(&input.project_id, &entity, &input.field_key);
    // The deterministic id is the uniqueness: a row with it (live, archived
    // or left by a deleted project) means the key is taken.
    let taken = conn
        .query_row(
            "SELECT 1 FROM custom_fields WHERE id = ?1",
            params![id],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .is_some();
    if taken {
        return Err("custom_field.duplicate_key".to_string());
    }
    let position: i64 = conn
        .query_row(
            "SELECT coalesce(max(position), -1) + 1 FROM custom_fields
              WHERE project_id = ?1 AND entity = ?2",
            params![input.project_id, entity],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let workspace = ensure_workspace(conn)?;
    conn.execute(
        "INSERT INTO custom_fields (id, workspace_id, project_id, entity, field_key, label, description,
                field_type, options, required, default_value, applies_to_case_types, position,
                created_by, updated_by, created_at, updated_at, revision)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14,
                 datetime('now'), datetime('now'), 1)",
        params![
            id,
            workspace,
            input.project_id,
            entity,
            input.field_key,
            input.label,
            input.description.clone().unwrap_or_default(),
            field_type,
            to_json(&input.options)?,
            input.required,
            input.default_value.as_ref().map(Value::to_string),
            input.applies_to_case_types.as_ref().map(to_json).transpose()?,
            position,
            user,
        ],
    )
    .map_err(|e| e.to_string())?;
    journal::record(
        conn,
        Change::new(
            ENTITY,
            &id,
            Action::Create,
            Actor::user(&user),
            "upsert",
            1,
            &user,
        ),
    )?;
    get_field(conn, &id)?.ok_or_else(|| "custom field not found".to_string())
}

/// Bumps a field's revision, journals the change and returns the new state.
fn record_update(
    conn: &Connection,
    id: &str,
    user: &str,
    before: Option<Value>,
) -> Result<CustomField, String> {
    let revision: i64 = conn
        .query_row(
            "UPDATE custom_fields SET revision = revision + 1, updated_by = ?2,
                    updated_at = datetime('now') WHERE id = ?1 RETURNING revision",
            params![id, user],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    journal::record(
        conn,
        Change::new(
            ENTITY,
            id,
            Action::Update,
            Actor::user(user),
            "upsert",
            revision,
            user,
        )
        .before(before),
    )?;
    get_field(conn, id)?.ok_or_else(|| "custom field not found".to_string())
}

/// Updates what is editable. The key and the type never change; options
/// that the input leaves out stay, archived (they may hold values).
pub(crate) fn update_field(
    conn: &Connection,
    id: &str,
    mut input: CustomFieldInput,
) -> Result<CustomField, String> {
    let user = input.user_id.clone();
    let current = owned_field(conn, id, &user)?;
    if input.field_type != current.field_type {
        return Err("custom_field.type_immutable".to_string());
    }
    if input.field_key != current.field_key {
        return Err("custom_field.key_immutable".to_string());
    }
    for old in &current.options {
        if !input.options.iter().any(|o| o.id == old.id) {
            input.options.push(FieldOption {
                archived: true,
                ..old.clone()
            });
        }
    }
    check_definition(&current.field_type, &mut input)?;
    let unchanged = input.label == current.label
        && input.description.as_deref().unwrap_or_default() == current.description
        && input.options == current.options
        && input.required == current.required
        && input.default_value == current.default_value
        && input.applies_to_case_types == current.applies_to_case_types;
    if unchanged {
        return Ok(current);
    }
    let before = journal::snapshot(conn, ENTITY, id)?;
    conn.execute(
        "UPDATE custom_fields SET label = ?2, description = ?3, options = ?4, required = ?5,
                default_value = ?6, applies_to_case_types = ?7 WHERE id = ?1",
        params![
            id,
            input.label,
            input.description.clone().unwrap_or_default(),
            to_json(&input.options)?,
            input.required,
            input.default_value.as_ref().map(Value::to_string),
            input
                .applies_to_case_types
                .as_ref()
                .map(to_json)
                .transpose()?,
        ],
    )
    .map_err(|e| e.to_string())?;
    record_update(conn, id, &user, before)
}

/// Archives (hides, values kept) or brings back a field.
pub(crate) fn set_archived(
    conn: &Connection,
    id: &str,
    archived: bool,
    user: &str,
) -> Result<CustomField, String> {
    let current = owned_field(conn, id, user)?;
    if current.archived_at.is_some() == archived {
        return Ok(current);
    }
    let before = journal::snapshot(conn, ENTITY, id)?;
    conn.execute(
        "UPDATE custom_fields SET archived_at = CASE WHEN ?2 THEN datetime('now') END WHERE id = ?1",
        params![id, archived],
    )
    .map_err(|e| e.to_string())?;
    record_update(conn, id, user, before)
}

/// Gives the project's fields of `entity` the order of `ids`; fields left out
/// keep their relative order after them. Only fields whose position changes
/// get a new revision.
pub(crate) fn reorder(
    conn: &Connection,
    project_id: &str,
    entity: &str,
    ids: &[String],
    user: &str,
) -> Result<Vec<CustomField>, String> {
    if !project::owns(conn, project_id, user)? {
        return Err("project not found".to_string());
    }
    let fields = project_fields(conn, project_id, entity)?;
    let mut ordered: Vec<&CustomField> = ids
        .iter()
        .filter_map(|id| fields.iter().find(|f| &f.id == id))
        .collect();
    for f in &fields {
        if !ids.contains(&f.id) {
            ordered.push(f);
        }
    }
    for (pos, f) in ordered.iter().enumerate() {
        let pos = pos as i64;
        if f.position == pos {
            continue;
        }
        let before = journal::snapshot(conn, ENTITY, &f.id)?;
        conn.execute(
            "UPDATE custom_fields SET position = ?2 WHERE id = ?1",
            params![f.id, pos],
        )
        .map_err(|e| e.to_string())?;
        record_update(conn, &f.id, user, before)?;
    }
    project_fields(conn, project_id, entity)
}

/// «Copiar de otro proyecto» (ADR-0018 decision 3): the live, not archived
/// definitions of `from` that `to` does not have yet, after its own.
pub(crate) fn copy_fields(
    conn: &Connection,
    from: &str,
    to: &str,
    entity: &str,
    user: &str,
) -> Result<CopySummary, String> {
    if !project::owns(conn, from, user)? || !project::owns(conn, to, user)? {
        return Err("project not found".to_string());
    }
    let mut summary = CopySummary {
        copied: 0,
        skipped: Vec::new(),
    };
    for f in project_fields(conn, from, entity)? {
        if f.archived_at.is_some() {
            continue;
        }
        let input = CustomFieldInput {
            project_id: to.to_string(),
            entity: Some(entity.to_string()),
            field_key: f.field_key.clone(),
            label: f.label,
            description: Some(f.description),
            field_type: f.field_type,
            options: f.options,
            required: f.required,
            default_value: f.default_value,
            applies_to_case_types: f.applies_to_case_types,
            user_id: user.to_string(),
        };
        match create_field(conn, input) {
            Ok(_) => summary.copied += 1,
            Err(e) if e == "custom_field.duplicate_key" => summary.skipped.push(f.field_key),
            Err(e) => return Err(e),
        }
    }
    Ok(summary)
}

/// The rules of the project's test case fields, for a case save.
pub(crate) fn case_rules(conn: &Connection, project_id: &str) -> Result<Vec<FieldRule>, String> {
    Ok(project_fields(conn, project_id, "test_case")?
        .iter()
        .map(FieldRule::from)
        .collect())
}

// ---------------------------------------------------------------------- sync

/// The `custom_field` document of a row (camelCase), its revision and whether
/// it is deleted. None if the row is gone.
pub(crate) fn payload(conn: &Connection, id: &str) -> Result<Option<(Value, i64, bool)>, String> {
    conn.query_row(
        &format!("{SELECT_FIELD_SYNC} WHERE id = ?1"),
        params![id],
        |r| {
            let f = map_field(r)?;
            let deleted: Option<String> = r.get("deleted_at")?;
            let workspace: String = r.get("workspace_id")?;
            Ok((
                json!({
                    "id": f.id,
                    "workspaceId": workspace,
                    "projectId": f.project_id,
                    "entity": f.entity,
                    "fieldKey": f.field_key,
                    "label": f.label,
                    "description": f.description,
                    "fieldType": f.field_type,
                    "options": f.options,
                    "required": f.required,
                    "defaultValue": f.default_value,
                    "appliesToCaseTypes": f.applies_to_case_types,
                    "position": f.position,
                    "archivedAt": f.archived_at,
                    "createdAt": f.created_at,
                    "updatedAt": f.updated_at,
                    "revision": f.revision,
                }),
                f.revision,
                deleted.is_some(),
            ))
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

const SELECT_FIELD_SYNC: &str = "SELECT id, workspace_id, project_id, entity, field_key, label, \
    description, field_type, options, required, default_value, applies_to_case_types, position, \
    archived_at, created_at, updated_at, revision, deleted_at FROM custom_fields";

/// Writes a pulled definition: the server's version wins (lww). A JSON value
/// the document lacks is cleared, like every other entity.
pub(crate) fn write_doc(
    conn: &Connection,
    workspace_id: &str,
    user: &str,
    id: &str,
    revision: i64,
    p: &Value,
) -> Result<(), String> {
    let s = |k: &str| p.get(k).and_then(Value::as_str).unwrap_or_default();
    let json_or_null = |k: &str| p.get(k).filter(|v| !v.is_null()).map(Value::to_string);
    conn.execute(
        "INSERT INTO custom_fields (id, workspace_id, project_id, entity, field_key, label, description,
                field_type, options, required, default_value, applies_to_case_types, position,
                archived_at, created_by, updated_by, created_at, updated_at, revision, deleted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15,
                 datetime('now'), datetime('now'), ?16, NULL)
         ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, entity=excluded.entity,
                field_key=excluded.field_key, label=excluded.label, description=excluded.description,
                field_type=excluded.field_type, options=excluded.options, required=excluded.required,
                default_value=excluded.default_value,
                applies_to_case_types=excluded.applies_to_case_types, position=excluded.position,
                archived_at=excluded.archived_at, updated_by=excluded.updated_by,
                updated_at=datetime('now'), revision=excluded.revision, deleted_at=NULL",
        params![
            id,
            workspace_id,
            s("projectId"),
            p.get("entity").and_then(Value::as_str).unwrap_or("test_case"),
            s("fieldKey"),
            s("label"),
            s("description"),
            s("fieldType"),
            p.get("options")
                .filter(|v| v.is_array())
                .map_or_else(|| "[]".to_string(), Value::to_string),
            p.get("required").and_then(Value::as_bool).unwrap_or(false),
            json_or_null("defaultValue"),
            json_or_null("appliesToCaseTypes"),
            p.get("position").and_then(Value::as_i64).unwrap_or(0),
            p.get("archivedAt").and_then(Value::as_str),
            user,
            revision,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ----------------------------------------------------------- migration 0027

/// The object at `data.<key>` of the case's state at its sync base, from the
/// history rows the old `update_case` wrote (no hash) or the revision rows.
fn at_base(conn: &Connection, case_id: &str, key: &str) -> Result<Option<Value>, String> {
    let path = format!("$.{key}");
    let value: Option<String> = conn
        .query_row(
            "SELECT json_extract(r.data, ?2) FROM test_case_revisions r
               JOIN sync_base b ON b.entity = 'test_case' AND b.entity_id = r.test_case_id
                               AND b.revision = r.revision
              WHERE r.test_case_id = ?1 AND json_valid(r.data)
                AND json_type(r.data, ?2) = 'object'
              ORDER BY r.rowid DESC LIMIT 1",
            params![case_id, path],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(value.and_then(|s| serde_json::from_str(&s).ok()))
}

/// True when the case has local changes not pushed yet.
fn has_pending(conn: &Connection, case_id: &str) -> Result<bool, String> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM oplog WHERE entity = 'test_case' AND entity_id = ?1
               AND synced_at IS NULL LIMIT 1",
            params![case_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .is_some())
}

/// Data step of migration 0027 (module doc of `0027_case_fields_restore.sql`).
/// Idempotent: after one run there is no stash left and `custom` is present.
pub fn migrate_restore(conn: &Connection) -> Result<(), String> {
    let cases: Vec<(String, String, String, bool, bool)> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, data, updated_by, deleted_at IS NOT NULL,
                        case_type IS NULL AND automation_status IS NULL
                   FROM test_cases WHERE json_valid(data) ORDER BY id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?
    };
    for (id, data, updated_by, deleted, unset) in cases {
        let Ok(mut value) = serde_json::from_str::<Value>(&data) else {
            continue;
        };
        let mut stash = take_stash(&mut value);
        let mut changed = stash.is_some();
        // Edited while read-only: the old editor rebuilt `data` without the
        // stash and without `custom`; the state it started from (its sync
        // base, copied to the history by the old `update_case`) has both.
        if has_pending(conn, &id)? {
            if stash.is_none() && unset {
                if let Some(mut base) = at_base(conn, &id, STASH_KEY)? {
                    let mut holder = Value::Object(serde_json::Map::from_iter([(
                        STASH_KEY.to_string(),
                        base.take(),
                    )]));
                    stash = take_stash(&mut holder);
                    changed |= stash.is_some();
                }
            }
            if value.get("custom").is_none() {
                if let (Some(custom), Some(obj)) =
                    (at_base(conn, &id, "custom")?, value.as_object_mut())
                {
                    obj.insert("custom".into(), custom);
                    changed = true;
                }
            }
        }
        if !changed {
            continue;
        }
        let old = crate::revisions::current_id(conn, &id)?;
        let (case_type, automation) = stash.unwrap_or((None, None));
        conn.execute(
            "UPDATE test_cases SET data = ?2,
                    case_type = coalesce(?3, case_type),
                    automation_status = coalesce(?4, automation_status)
              WHERE id = ?1",
            params![id, value.to_string(), case_type, automation],
        )
        .map_err(|e| e.to_string())?;
        let new = crate::revisions::ensure_current(conn, &id, &updated_by, !deleted)?;
        // The row 0021 queued for the old content in this upgrade never
        // reached the server: it goes, so only the right one is pushed.
        if let Some((old_id, _)) = old.filter(|(o, _)| Some(o) != new.as_ref()) {
            let queued = conn
                .execute(
                    "DELETE FROM oplog WHERE entity = 'test_case_revision' AND entity_id = ?1
                       AND synced_at IS NULL",
                    params![old_id],
                )
                .map_err(|e| e.to_string())?;
            if queued > 0 {
                conn.execute(
                    "DELETE FROM test_case_revisions WHERE id = ?1",
                    params![old_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

// ------------------------------------------------------------------ commands

#[tauri::command]
pub fn custom_field_list(
    db: State<Db>,
    project_id: String,
    entity: Option<String>,
    user_id: String,
) -> Result<Vec<CustomField>, String> {
    let entity = entity.unwrap_or_else(|| "test_case".into());
    db.with_conn(|conn| list_fields(conn, &project_id, &entity, &user_id))
}

#[tauri::command]
pub fn custom_field_create(db: State<Db>, input: CustomFieldInput) -> Result<CustomField, String> {
    let field = db.with_tx(|conn| create_field(conn, input))?;
    db.persist()?;
    Ok(field)
}

#[tauri::command]
pub fn custom_field_update(
    db: State<Db>,
    id: String,
    input: CustomFieldInput,
) -> Result<CustomField, String> {
    let field = db.with_tx(|conn| update_field(conn, &id, input))?;
    db.persist()?;
    Ok(field)
}

#[tauri::command]
pub fn custom_field_archive(
    db: State<Db>,
    id: String,
    archived: bool,
    user_id: String,
) -> Result<CustomField, String> {
    let field = db.with_tx(|conn| set_archived(conn, &id, archived, &user_id))?;
    db.persist()?;
    Ok(field)
}

#[tauri::command]
pub fn custom_field_reorder(
    db: State<Db>,
    project_id: String,
    entity: Option<String>,
    ids: Vec<String>,
    user_id: String,
) -> Result<Vec<CustomField>, String> {
    let entity = entity.unwrap_or_else(|| "test_case".into());
    let fields = db.with_tx(|conn| reorder(conn, &project_id, &entity, &ids, &user_id))?;
    db.persist()?;
    Ok(fields)
}

#[tauri::command]
pub fn custom_field_copy(
    db: State<Db>,
    from_project_id: String,
    to_project_id: String,
    entity: Option<String>,
    user_id: String,
) -> Result<CopySummary, String> {
    let entity = entity.unwrap_or_else(|| "test_case".into());
    let summary =
        db.with_tx(|conn| copy_fields(conn, &from_project_id, &to_project_id, &entity, &user_id))?;
    db.persist()?;
    Ok(summary)
}
