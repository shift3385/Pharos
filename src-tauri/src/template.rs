//! Template repository + Tauri commands (spec §6). An internal store of .xlsx
//! templates (plan / case) with metadata (name, description, usage prompt,
//! version) and the raw file bytes as a blob, kept in the encrypted database so
//! the repository works offline. Built-in templates are seeded idempotently and
//! cannot be deleted.

use base64::Engine as _;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::{ensure_workspace, Db};

const B64: base64::engine::general_purpose::GeneralPurpose =
    base64::engine::general_purpose::STANDARD;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateSummary {
    id: String,
    kind: String,
    language: String,
    name: String,
    description: String,
    usage_prompt: String,
    version: String,
    is_builtin: bool,
    updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateData {
    id: String,
    kind: String,
    language: String,
    name: String,
    description: String,
    usage_prompt: String,
    version: String,
    is_builtin: bool,
    data_base64: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateInput {
    kind: String,
    language: String,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    usage_prompt: String,
    #[serde(default)]
    version: Option<String>,
    data_base64: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateMeta {
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    usage_prompt: String,
    #[serde(default)]
    version: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateSeedItem {
    id: String,
    kind: String,
    language: String,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    usage_prompt: String,
    #[serde(default)]
    version: Option<String>,
    data_base64: String,
}

fn map_summary(row: &rusqlite::Row) -> rusqlite::Result<TemplateSummary> {
    Ok(TemplateSummary {
        id: row.get("id")?,
        kind: row.get("kind")?,
        language: row.get("language")?,
        name: row.get("name")?,
        description: row.get("description")?,
        usage_prompt: row.get("usage_prompt")?,
        version: row.get("version")?,
        is_builtin: row.get::<_, i64>("is_builtin")? != 0,
        updated_at: row.get("updated_at")?,
    })
}

fn list_templates(conn: &Connection) -> Result<Vec<TemplateSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, kind, language, name, description, usage_prompt, version, is_builtin, updated_at
             FROM templates WHERE deleted_at IS NULL
             ORDER BY is_builtin DESC, kind, language, name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], map_summary)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn get_template(conn: &Connection, id: &str) -> Result<Option<TemplateData>, String> {
    conn.query_row(
        "SELECT id, kind, language, name, description, usage_prompt, version, is_builtin, file
         FROM templates WHERE id = ?1 AND deleted_at IS NULL",
        params![id],
        |row| {
            let bytes: Vec<u8> = row.get("file")?;
            Ok(TemplateData {
                id: row.get("id")?,
                kind: row.get("kind")?,
                language: row.get("language")?,
                name: row.get("name")?,
                description: row.get("description")?,
                usage_prompt: row.get("usage_prompt")?,
                version: row.get("version")?,
                is_builtin: row.get::<_, i64>("is_builtin")? != 0,
                data_base64: B64.encode(bytes),
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn template_list(db: State<Db>) -> Result<Vec<TemplateSummary>, String> {
    db.with_conn(list_templates)
}

#[tauri::command]
pub fn template_get(db: State<Db>, id: String) -> Result<Option<TemplateData>, String> {
    db.with_conn(|conn| get_template(conn, &id))
}

#[tauri::command]
pub fn template_create(db: State<Db>, input: TemplateInput) -> Result<Option<TemplateData>, String> {
    let id = Uuid::new_v4().to_string();
    let bytes = B64
        .decode(input.data_base64.as_bytes())
        .map_err(|e| e.to_string())?;
    db.with_conn(|conn| {
        let workspace_id = ensure_workspace(conn)?;
        conn.execute(
            "INSERT INTO templates
               (id, workspace_id, kind, language, name, description, usage_prompt, version,
                file, is_builtin, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, datetime('now'), datetime('now'))",
            params![
                id,
                workspace_id,
                input.kind,
                input.language,
                input.name,
                input.description,
                input.usage_prompt,
                input.version.clone().unwrap_or_else(|| "1.0".to_string()),
                bytes,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    db.persist()?;
    db.with_conn(|conn| get_template(conn, &id))
}

#[tauri::command]
pub fn template_update(
    db: State<Db>,
    id: String,
    meta: TemplateMeta,
) -> Result<Option<TemplateData>, String> {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE templates
                SET name = ?2, description = ?3, usage_prompt = ?4, version = ?5,
                    updated_at = datetime('now'), revision = revision + 1
              WHERE id = ?1 AND deleted_at IS NULL",
            params![
                id,
                meta.name,
                meta.description,
                meta.usage_prompt,
                meta.version.clone().unwrap_or_else(|| "1.0".to_string()),
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    db.persist()?;
    db.with_conn(|conn| get_template(conn, &id))
}

#[tauri::command]
pub fn template_delete(db: State<Db>, id: String) -> Result<(), String> {
    db.with_conn(|conn| {
        let builtin: Option<i64> = conn
            .query_row(
                "SELECT is_builtin FROM templates WHERE id = ?1 AND deleted_at IS NULL",
                params![id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        match builtin {
            None => return Err("template not found".to_string()),
            Some(1) => return Err("built-in templates cannot be deleted".to_string()),
            _ => {}
        }
        conn.execute(
            "UPDATE templates SET deleted_at = datetime('now') WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    db.persist()
}

/// Idempotently inserts the bundled built-in templates (by stable id). Existing
/// rows (including user-edited metadata) are left untouched.
#[tauri::command]
pub fn template_seed(db: State<Db>, items: Vec<TemplateSeedItem>) -> Result<(), String> {
    let mut wrote = false;
    db.with_conn(|conn| {
        let workspace_id = ensure_workspace(conn)?;
        for item in &items {
            let exists: Option<i64> = conn
                .query_row(
                    "SELECT 1 FROM templates WHERE id = ?1",
                    params![item.id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            if exists.is_some() {
                continue;
            }
            let bytes = B64
                .decode(item.data_base64.as_bytes())
                .map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO templates
                   (id, workspace_id, kind, language, name, description, usage_prompt, version,
                    file, is_builtin, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, datetime('now'), datetime('now'))",
                params![
                    item.id,
                    workspace_id,
                    item.kind,
                    item.language,
                    item.name,
                    item.description,
                    item.usage_prompt,
                    item.version.clone().unwrap_or_else(|| "1.0".to_string()),
                    bytes,
                ],
            )
            .map_err(|e| e.to_string())?;
            wrote = true;
        }
        Ok(())
    })?;
    if wrote {
        db.persist()?;
    }
    Ok(())
}
