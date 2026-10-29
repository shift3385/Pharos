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
use crate::oplog;

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

/// Inserts a user template and records it in the oplog; returns its new id.
fn insert_template(conn: &Connection, input: &TemplateInput) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let bytes = B64
        .decode(input.data_base64.as_bytes())
        .map_err(|e| e.to_string())?;
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
    oplog::record(conn, "template", &id, "upsert", "{}", 1, "")?;
    Ok(id)
}

/// Updates a template's metadata (the file itself is immutable).
fn update_template(conn: &Connection, id: &str, meta: &TemplateMeta) -> Result<(), String> {
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
    oplog::record(conn, "template", id, "upsert", "{}", 0, "")?;
    Ok(())
}

/// Soft-deletes a user template; built-in templates cannot be deleted.
fn delete_template(conn: &Connection, id: &str) -> Result<(), String> {
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
    oplog::record(conn, "template", id, "delete", "{}", 0, "")?;
    Ok(())
}

/// Inserts the built-in templates missing by id; returns whether it wrote any.
/// Existing rows (including user-edited metadata) are left untouched.
fn seed_templates(conn: &Connection, items: &[TemplateSeedItem]) -> Result<bool, String> {
    let mut wrote = false;
    let workspace_id = ensure_workspace(conn)?;
    for item in items {
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
    Ok(wrote)
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
pub fn template_create(
    db: State<Db>,
    input: TemplateInput,
) -> Result<Option<TemplateData>, String> {
    let id = db.with_conn(|conn| insert_template(conn, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_template(conn, &id))
}

#[tauri::command]
pub fn template_update(
    db: State<Db>,
    id: String,
    meta: TemplateMeta,
) -> Result<Option<TemplateData>, String> {
    db.with_conn(|conn| update_template(conn, &id, &meta))?;
    db.persist()?;
    db.with_conn(|conn| get_template(conn, &id))
}

#[tauri::command]
pub fn template_delete(db: State<Db>, id: String) -> Result<(), String> {
    db.with_conn(|conn| delete_template(conn, &id))?;
    db.persist()
}

/// Idempotently inserts the bundled built-in templates (by stable id). Existing
/// rows (including user-edited metadata) are left untouched.
#[tauri::command]
pub fn template_seed(db: State<Db>, items: Vec<TemplateSeedItem>) -> Result<(), String> {
    if db.with_conn(|conn| seed_templates(conn, &items))? {
        db.persist()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        c
    }

    const XLSX: &[u8] = b"PK\x03\x04 fake xlsx bytes";

    fn input(name: &str, version: Option<&str>) -> TemplateInput {
        TemplateInput {
            kind: "case".into(),
            language: "es".into(),
            name: name.into(),
            description: "desc".into(),
            usage_prompt: "use it for cases".into(),
            version: version.map(String::from),
            data_base64: B64.encode(XLSX),
        }
    }

    fn seed_item(id: &str, kind: &str, name: &str) -> TemplateSeedItem {
        TemplateSeedItem {
            id: id.into(),
            kind: kind.into(),
            language: "es".into(),
            name: name.into(),
            description: String::new(),
            usage_prompt: String::new(),
            version: Some("2.0".into()),
            data_base64: B64.encode(XLSX),
        }
    }

    fn oplog_ops(c: &Connection, id: &str) -> Vec<String> {
        let mut stmt = c
            .prepare(
                "SELECT op FROM oplog WHERE entity = 'template' AND entity_id = ?1 ORDER BY hlc",
            )
            .unwrap();
        stmt.query_map([id], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    fn revision(c: &Connection, id: &str) -> i64 {
        c.query_row("SELECT revision FROM templates WHERE id = ?1", [id], |r| {
            r.get(0)
        })
        .unwrap()
    }

    #[test]
    fn create_round_trips_metadata_and_file_bytes() {
        let c = conn();
        let id = insert_template(&c, &input("Casos", Some("3.1"))).unwrap();
        let t = get_template(&c, &id).unwrap().unwrap();
        assert_eq!((t.kind.as_str(), t.language.as_str()), ("case", "es"));
        assert_eq!(t.name, "Casos");
        assert_eq!(t.usage_prompt, "use it for cases");
        assert_eq!(t.version, "3.1");
        assert!(!t.is_builtin);
        assert_eq!(B64.decode(t.data_base64).unwrap(), XLSX);
        assert_eq!(oplog_ops(&c, &id), ["upsert"]);
    }

    #[test]
    fn create_defaults_version_to_1_0() {
        let c = conn();
        let id = insert_template(&c, &input("Casos", None)).unwrap();
        assert_eq!(get_template(&c, &id).unwrap().unwrap().version, "1.0");
    }

    #[test]
    fn create_rejects_invalid_base64_without_writing() {
        let c = conn();
        let mut bad = input("Roto", None);
        bad.data_base64 = "not base64 !!".into();
        assert!(insert_template(&c, &bad).is_err());
        assert!(list_templates(&c).unwrap().is_empty());
    }

    #[test]
    fn get_unknown_id_is_none() {
        assert!(get_template(&conn(), "missing").unwrap().is_none());
    }

    #[test]
    fn list_puts_builtins_first_and_hides_deleted() {
        let c = conn();
        let user_b = insert_template(&c, &input("B user", None)).unwrap();
        let user_a = insert_template(&c, &input("A user", None)).unwrap();
        seed_templates(&c, &[seed_item("builtin-plan", "plan", "Plan")]).unwrap();
        delete_template(&c, &user_b).unwrap();

        let ids: Vec<String> = list_templates(&c)
            .unwrap()
            .into_iter()
            .map(|t| t.id)
            .collect();
        assert_eq!(ids, ["builtin-plan".to_string(), user_a]);
    }

    #[test]
    fn update_changes_metadata_and_bumps_revision() {
        let c = conn();
        let id = insert_template(&c, &input("Casos", Some("1.0"))).unwrap();
        let meta = TemplateMeta {
            name: "Casos v2".into(),
            description: "nueva".into(),
            usage_prompt: "otra".into(),
            version: None,
        };
        update_template(&c, &id, &meta).unwrap();

        let t = get_template(&c, &id).unwrap().unwrap();
        assert_eq!(
            (t.name.as_str(), t.description.as_str()),
            ("Casos v2", "nueva")
        );
        assert_eq!(t.usage_prompt, "otra");
        assert_eq!(t.version, "1.0");
        assert_eq!(
            B64.decode(t.data_base64).unwrap(),
            XLSX,
            "file is untouched"
        );
        assert_eq!(revision(&c, &id), 2);
        assert_eq!(oplog_ops(&c, &id), ["upsert", "upsert"]);
    }

    #[test]
    fn update_does_not_revive_a_deleted_template() {
        let c = conn();
        let id = insert_template(&c, &input("Casos", None)).unwrap();
        delete_template(&c, &id).unwrap();
        let meta = TemplateMeta {
            name: "Otra".into(),
            description: String::new(),
            usage_prompt: String::new(),
            version: None,
        };
        update_template(&c, &id, &meta).unwrap();
        assert!(get_template(&c, &id).unwrap().is_none());
        assert_eq!(revision(&c, &id), 1);
    }

    #[test]
    fn delete_is_soft_and_recorded() {
        let c = conn();
        let id = insert_template(&c, &input("Casos", None)).unwrap();
        delete_template(&c, &id).unwrap();

        assert!(get_template(&c, &id).unwrap().is_none());
        let deleted_at: Option<String> = c
            .query_row(
                "SELECT deleted_at FROM templates WHERE id = ?1",
                [&id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(deleted_at.is_some(), "row is kept with deleted_at");
        assert_eq!(oplog_ops(&c, &id), ["upsert", "delete"]);
    }

    #[test]
    fn delete_refuses_builtins_and_unknown_ids() {
        let c = conn();
        seed_templates(&c, &[seed_item("builtin-case", "case", "Casos")]).unwrap();
        assert_eq!(
            delete_template(&c, "builtin-case").unwrap_err(),
            "built-in templates cannot be deleted"
        );
        assert!(get_template(&c, "builtin-case").unwrap().is_some());
        assert_eq!(
            delete_template(&c, "missing").unwrap_err(),
            "template not found"
        );

        let id = insert_template(&c, &input("Casos", None)).unwrap();
        delete_template(&c, &id).unwrap();
        assert_eq!(delete_template(&c, &id).unwrap_err(), "template not found");
    }

    #[test]
    fn seed_inserts_builtins_once() {
        let c = conn();
        let items = [
            seed_item("builtin-plan", "plan", "Plan"),
            seed_item("builtin-case", "case", "Casos"),
        ];
        assert!(seed_templates(&c, &items).unwrap());
        assert!(
            !seed_templates(&c, &items).unwrap(),
            "second seed writes nothing"
        );

        let all = list_templates(&c).unwrap();
        assert_eq!(all.len(), 2);
        assert!(all.iter().all(|t| t.is_builtin && t.version == "2.0"));
        // Built-ins ship with the app: seeding does not journal them for sync.
        assert!(oplog_ops(&c, "builtin-plan").is_empty());
    }

    #[test]
    fn seed_keeps_user_edits_to_builtin_metadata() {
        let c = conn();
        let items = [seed_item("builtin-plan", "plan", "Plan")];
        seed_templates(&c, &items).unwrap();
        let meta = TemplateMeta {
            name: "Mi plan".into(),
            description: String::new(),
            usage_prompt: String::new(),
            version: Some("2.0".into()),
        };
        update_template(&c, "builtin-plan", &meta).unwrap();
        seed_templates(&c, &items).unwrap();
        assert_eq!(
            get_template(&c, "builtin-plan").unwrap().unwrap().name,
            "Mi plan"
        );
    }

    #[test]
    fn seed_skips_soft_deleted_ids() {
        // A deleted row still holds its id, so seeding never resurrects it.
        let c = conn();
        let id = insert_template(&c, &input("Casos", None)).unwrap();
        delete_template(&c, &id).unwrap();
        let mut item = seed_item(&id, "case", "Casos");
        item.name = "Builtin".into();
        assert!(!seed_templates(&c, &[item]).unwrap());
        assert!(get_template(&c, &id).unwrap().is_none());
    }
}
