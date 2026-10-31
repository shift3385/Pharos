//! Template repository + Tauri commands (spec §6). An internal store of .xlsx
//! templates (plan / case) with metadata (name, description, usage prompt,
//! version) and the raw file bytes as a blob, kept in the encrypted database so
//! the repository works offline (FIX-08b):
//! - a user template belongs to the account that imported it; no other account
//!   lists, reads, edits or deletes it;
//! - built-in templates are seeded idempotently, every account sees them and
//!   they are read-only;
//! - a template imported before accounts existed, which migration 0018 could
//!   not attribute (several accounts on the device), is shared: every account
//!   sees it, none edits or deletes it. To change it, download it and import
//!   it again.

use base64::Engine as _;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
#[cfg(test)]
use ts_rs::TS;
use uuid::Uuid;

use crate::db::{ensure_workspace, Db};
use crate::journal::{self, Action, Actor, Change};

const B64: base64::engine::general_purpose::GeneralPurpose =
    base64::engine::general_purpose::STANDARD;

const NOT_FOUND: &str = "template not found";
const READ_ONLY: &str = "built-in and shared templates are read-only";

/// The templates an account sees: built-in, shared legacy (no owner) and its
/// own. `?1` is the account.
const VISIBLE: &str =
    "deleted_at IS NULL AND (is_builtin = 1 OR owner_id IS NULL OR owner_id = ?1)";

fn require_user(user_id: &str) -> Result<(), String> {
    if user_id.is_empty() {
        return Err("not-authenticated".into());
    }
    Ok(())
}

#[cfg_attr(test, derive(TS), ts(export))]
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
    /// The account imported it, so it may edit or delete it.
    is_own: bool,
    updated_at: String,
}

#[cfg_attr(test, derive(TS), ts(export))]
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
    is_own: bool,
    data_base64: String,
}

#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
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

#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
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

#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
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
        is_own: row.get::<_, i64>("is_own")? != 0,
        updated_at: row.get("updated_at")?,
    })
}

/// Live templates the account can see: built-in, shared and its own.
fn list_templates(conn: &Connection, user_id: &str) -> Result<Vec<TemplateSummary>, String> {
    require_user(user_id)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, kind, language, name, description, usage_prompt, version, is_builtin,
                    coalesce(owner_id = ?1, 0) AS is_own, updated_at
             FROM templates WHERE {VISIBLE}
             ORDER BY is_builtin DESC, kind, language, name"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![user_id], map_summary)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn get_template(
    conn: &Connection,
    id: &str,
    user_id: &str,
) -> Result<Option<TemplateData>, String> {
    require_user(user_id)?;
    conn.query_row(
        &format!(
            "SELECT id, kind, language, name, description, usage_prompt, version, is_builtin,
                    coalesce(owner_id = ?1, 0) AS is_own, file
             FROM templates WHERE id = ?2 AND {VISIBLE}"
        ),
        params![user_id, id],
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
                is_own: row.get::<_, i64>("is_own")? != 0,
                data_base64: B64.encode(bytes),
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// The revision of a live template the account owns. An unknown, deleted or
/// foreign id is not found; a built-in or shared one is read-only.
fn owned_revision(conn: &Connection, id: &str, user_id: &str) -> Result<i64, String> {
    let row: Option<(i64, bool)> = conn
        .query_row(
            &format!(
                "SELECT revision, coalesce(owner_id = ?1, 0) AS is_own FROM templates
                  WHERE id = ?2 AND {VISIBLE}"
            ),
            params![user_id, id],
            |r| Ok((r.get(0)?, r.get::<_, i64>(1)? != 0)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match row {
        None => Err(NOT_FOUND.to_string()),
        Some((_, false)) => Err(READ_ONLY.to_string()),
        Some((revision, true)) => Ok(revision),
    }
}

/// Inserts a user template owned by the account and records it in the oplog;
/// returns its new id.
pub(crate) fn insert_template(
    conn: &Connection,
    input: &TemplateInput,
    user_id: &str,
) -> Result<String, String> {
    require_user(user_id)?;
    let id = Uuid::new_v4().to_string();
    let bytes = B64
        .decode(input.data_base64.as_bytes())
        .map_err(|e| e.to_string())?;
    let workspace_id = ensure_workspace(conn)?;
    conn.execute(
        "INSERT INTO templates
           (id, workspace_id, kind, language, name, description, usage_prompt, version,
            file, is_builtin, owner_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, datetime('now'), datetime('now'))",
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
            user_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    journal::record(
        conn,
        Change::new(
            "template",
            &id,
            Action::Create,
            Actor::user(user_id),
            "upsert",
            1,
            user_id,
        ),
    )?;
    Ok(id)
}

/// Updates the metadata of a template the account owns (the file itself is
/// immutable). Anything else is an error and leaves no oplog row.
pub(crate) fn update_template(
    conn: &Connection,
    id: &str,
    meta: &TemplateMeta,
    user_id: &str,
) -> Result<(), String> {
    require_user(user_id)?;
    let revision = owned_revision(conn, id, user_id)?;
    let before = journal::snapshot(conn, "template", id)?;
    conn.execute(
        "UPDATE templates
            SET name = ?2, description = ?3, usage_prompt = ?4, version = ?5,
                updated_at = datetime('now'), revision = ?6
          WHERE id = ?1 AND deleted_at IS NULL",
        params![
            id,
            meta.name,
            meta.description,
            meta.usage_prompt,
            meta.version.clone().unwrap_or_else(|| "1.0".to_string()),
            revision + 1,
        ],
    )
    .map_err(|e| e.to_string())?;
    journal::record(
        conn,
        Change::new(
            "template",
            id,
            Action::Update,
            Actor::user(user_id),
            "upsert",
            revision + 1,
            user_id,
        )
        .before(before),
    )?;
    Ok(())
}

/// Soft-deletes a template the account owns. Anything else is an error and
/// leaves no oplog row.
pub(crate) fn delete_template(conn: &Connection, id: &str, user_id: &str) -> Result<(), String> {
    require_user(user_id)?;
    let revision = owned_revision(conn, id, user_id)?;
    let before = journal::snapshot(conn, "template", id)?;
    conn.execute(
        "UPDATE templates SET deleted_at = datetime('now'), revision = ?2 WHERE id = ?1",
        params![id, revision + 1],
    )
    .map_err(|e| e.to_string())?;
    journal::record(
        conn,
        Change::new(
            "template",
            id,
            Action::Delete,
            Actor::user(user_id),
            "delete",
            revision + 1,
            user_id,
        )
        .before(before),
    )?;
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

// `user_id` is the signed-in account (FIX-08b): commands only change that
// account's own templates, and return those plus the built-in and shared ones.
#[tauri::command]
pub fn template_list(db: State<Db>, user_id: String) -> Result<Vec<TemplateSummary>, String> {
    db.with_conn(|conn| list_templates(conn, &user_id))
}

#[tauri::command]
pub fn template_get(
    db: State<Db>,
    id: String,
    user_id: String,
) -> Result<Option<TemplateData>, String> {
    db.with_conn(|conn| get_template(conn, &id, &user_id))
}

#[tauri::command]
pub fn template_create(
    db: State<Db>,
    input: TemplateInput,
    user_id: String,
) -> Result<Option<TemplateData>, String> {
    let id = db.with_tx(|conn| insert_template(conn, &input, &user_id))?;
    db.persist()?;
    db.with_conn(|conn| get_template(conn, &id, &user_id))
}

#[tauri::command]
pub fn template_update(
    db: State<Db>,
    id: String,
    meta: TemplateMeta,
    user_id: String,
) -> Result<Option<TemplateData>, String> {
    db.with_tx(|conn| update_template(conn, &id, &meta, &user_id))?;
    db.persist()?;
    db.with_conn(|conn| get_template(conn, &id, &user_id))
}

#[tauri::command]
pub fn template_delete(db: State<Db>, id: String, user_id: String) -> Result<(), String> {
    db.with_tx(|conn| delete_template(conn, &id, &user_id))?;
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
    /// Two accounts signed in on the same device.
    const U: &str = "user-a";
    const V: &str = "user-b";

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
        let id = insert_template(&c, &input("Casos", Some("3.1")), U).unwrap();
        let t = get_template(&c, &id, U).unwrap().unwrap();
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
        let id = insert_template(&c, &input("Casos", None), U).unwrap();
        assert_eq!(get_template(&c, &id, U).unwrap().unwrap().version, "1.0");
    }

    #[test]
    fn create_rejects_invalid_base64_without_writing() {
        let c = conn();
        let mut bad = input("Roto", None);
        bad.data_base64 = "not base64 !!".into();
        assert!(insert_template(&c, &bad, U).is_err());
        assert!(list_templates(&c, U).unwrap().is_empty());
    }

    #[test]
    fn get_unknown_id_is_none() {
        assert!(get_template(&conn(), "missing", U).unwrap().is_none());
    }

    #[test]
    fn list_puts_builtins_first_and_hides_deleted() {
        let c = conn();
        let user_b = insert_template(&c, &input("B user", None), U).unwrap();
        let user_a = insert_template(&c, &input("A user", None), U).unwrap();
        seed_templates(&c, &[seed_item("builtin-plan", "plan", "Plan")]).unwrap();
        delete_template(&c, &user_b, U).unwrap();

        let ids: Vec<String> = list_templates(&c, U)
            .unwrap()
            .into_iter()
            .map(|t| t.id)
            .collect();
        assert_eq!(ids, ["builtin-plan".to_string(), user_a]);
    }

    #[test]
    fn update_changes_metadata_and_bumps_revision() {
        let c = conn();
        let id = insert_template(&c, &input("Casos", Some("1.0")), U).unwrap();
        let meta = TemplateMeta {
            name: "Casos v2".into(),
            description: "nueva".into(),
            usage_prompt: "otra".into(),
            version: None,
        };
        update_template(&c, &id, &meta, U).unwrap();

        let t = get_template(&c, &id, U).unwrap().unwrap();
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
        let id = insert_template(&c, &input("Casos", None), U).unwrap();
        delete_template(&c, &id, U).unwrap();
        let meta = TemplateMeta {
            name: "Otra".into(),
            description: String::new(),
            usage_prompt: String::new(),
            version: None,
        };
        assert_eq!(
            update_template(&c, &id, &meta, U).unwrap_err(),
            "template not found"
        );
        assert!(get_template(&c, &id, U).unwrap().is_none());
        assert_eq!(revision(&c, &id), 2, "only the delete bumped it");
        assert_eq!(oplog_ops(&c, &id), ["upsert", "delete"]);
    }

    #[test]
    fn delete_is_soft_and_recorded() {
        let c = conn();
        let id = insert_template(&c, &input("Casos", None), U).unwrap();
        delete_template(&c, &id, U).unwrap();

        assert!(get_template(&c, &id, U).unwrap().is_none());
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
            delete_template(&c, "builtin-case", U).unwrap_err(),
            READ_ONLY
        );
        assert!(get_template(&c, "builtin-case", U).unwrap().is_some());
        assert_eq!(
            delete_template(&c, "missing", U).unwrap_err(),
            "template not found"
        );

        let id = insert_template(&c, &input("Casos", None), U).unwrap();
        delete_template(&c, &id, U).unwrap();
        assert_eq!(
            delete_template(&c, &id, U).unwrap_err(),
            "template not found"
        );
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

        let all = list_templates(&c, U).unwrap();
        assert_eq!(all.len(), 2);
        assert!(all.iter().all(|t| t.is_builtin && t.version == "2.0"));
        // Built-ins ship with the app: seeding does not journal them for sync.
        assert!(oplog_ops(&c, "builtin-plan").is_empty());
    }

    #[test]
    fn builtin_templates_are_read_only_for_every_account() {
        // Every account sees them: one account must not change them for another.
        let c = conn();
        let items = [seed_item("builtin-plan", "plan", "Plan")];
        seed_templates(&c, &items).unwrap();
        assert_eq!(
            update_template(&c, "builtin-plan", &meta("Mi plan"), U).unwrap_err(),
            READ_ONLY
        );
        assert_eq!(oplog_count(&c), 0);
        let t = get_template(&c, "builtin-plan", V).unwrap().unwrap();
        assert_eq!(t.name, "Plan");
        assert!(t.is_builtin && !t.is_own);
    }

    #[test]
    fn seed_skips_soft_deleted_ids() {
        // A deleted row still holds its id, so seeding never resurrects it.
        let c = conn();
        let id = insert_template(&c, &input("Casos", None), U).unwrap();
        delete_template(&c, &id, U).unwrap();
        let mut item = seed_item(&id, "case", "Casos");
        item.name = "Builtin".into();
        assert!(!seed_templates(&c, &[item]).unwrap());
        assert!(get_template(&c, &id, U).unwrap().is_none());
    }

    fn meta(name: &str) -> TemplateMeta {
        TemplateMeta {
            name: name.into(),
            description: String::new(),
            usage_prompt: String::new(),
            version: None,
        }
    }

    fn oplog_count(c: &Connection) -> i64 {
        c.query_row(
            "SELECT count(*) FROM oplog WHERE entity = 'template'",
            [],
            |r| r.get(0),
        )
        .unwrap()
    }

    #[test]
    fn another_account_cannot_list_read_edit_or_delete_a_template() {
        let c = conn();
        seed_templates(&c, &[seed_item("builtin-plan", "plan", "Plan")]).unwrap();
        let mine = insert_template(&c, &input("De A", None), U).unwrap();

        // B sees only the built-in one.
        let ids: Vec<String> = list_templates(&c, V)
            .unwrap()
            .into_iter()
            .map(|t| t.id)
            .collect();
        assert_eq!(ids, ["builtin-plan"]);
        assert!(get_template(&c, &mine, V).unwrap().is_none());

        let before = oplog_count(&c);
        assert_eq!(
            update_template(&c, &mine, &meta("Robada"), V).unwrap_err(),
            "template not found"
        );
        assert_eq!(
            delete_template(&c, &mine, V).unwrap_err(),
            "template not found"
        );
        assert_eq!(oplog_count(&c), before, "no oplog row for a refused change");

        // A still has it untouched.
        let t = get_template(&c, &mine, U).unwrap().unwrap();
        assert_eq!(t.name, "De A");
        assert_eq!(revision(&c, &mine), 1);
    }

    #[test]
    fn unknown_ids_write_no_oplog_row() {
        let c = conn();
        assert_eq!(
            update_template(&c, "missing", &meta("x"), U).unwrap_err(),
            "template not found"
        );
        assert_eq!(
            delete_template(&c, "missing", U).unwrap_err(),
            "template not found"
        );
        assert_eq!(oplog_count(&c), 0);
    }

    #[test]
    fn oplog_rows_belong_to_the_owner_and_carry_the_revision() {
        let c = conn();
        let id = insert_template(&c, &input("Casos", None), U).unwrap();
        update_template(&c, &id, &meta("v2"), U).unwrap();
        delete_template(&c, &id, U).unwrap();
        let rows: Vec<(String, i64, String)> = {
            let mut stmt = c
                .prepare(
                    "SELECT op, revision, user_id FROM oplog WHERE entity_id = ?1 ORDER BY rowid",
                )
                .unwrap();
            stmt.query_map([&id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap()
        };
        assert_eq!(
            rows,
            [
                ("upsert".to_string(), 1, U.to_string()),
                ("upsert".to_string(), 2, U.to_string()),
                ("delete".to_string(), 3, U.to_string()),
            ]
        );
    }

    #[test]
    fn commands_require_an_account() {
        let c = conn();
        assert_eq!(
            list_templates(&c, "").err().as_deref(),
            Some("not-authenticated")
        );
        assert!(insert_template(&c, &input("x", None), "").is_err());
        assert!(list_templates(&c, U).unwrap().is_empty());
    }

    #[test]
    fn legacy_templates_without_owner_are_shared_and_read_only() {
        // Migration 0018 could not attribute it (several accounts on the device).
        let c = conn();
        let id = insert_template(&c, &input("Antigua", None), U).unwrap();
        c.execute("UPDATE templates SET owner_id = NULL", [])
            .unwrap();
        for account in [U, V] {
            let t = get_template(&c, &id, account).unwrap().unwrap();
            assert!(!t.is_own && !t.is_builtin);
            assert!(list_templates(&c, account)
                .unwrap()
                .iter()
                .any(|s| s.id == id));
        }
        let before = oplog_count(&c);
        assert_eq!(
            update_template(&c, &id, &meta("x"), V).unwrap_err(),
            READ_ONLY
        );
        assert_eq!(delete_template(&c, &id, U).unwrap_err(), READ_ONLY);
        assert_eq!(oplog_count(&c), before);
    }

    #[test]
    fn migration_gives_legacy_templates_to_the_only_project_owner() {
        // Migration 0018 on a database with user templates and one account.
        let c = Connection::open_in_memory().unwrap();
        let upto_0016: Vec<_> = crate::db::MIGRATIONS
            .iter()
            .filter(|(n, _)| *n < "0018")
            .collect();
        for (_, sql) in &upto_0016 {
            c.execute_batch(sql).unwrap();
        }
        let ws = crate::db::ensure_workspace(&c).unwrap();
        c.execute(
            "INSERT INTO projects (id, workspace_id, owner_id, name, created_by, updated_by, \
             created_at, updated_at) VALUES ('p1', ?1, 'only', 'P', 'only', 'only', 'now', 'now')",
            [&ws],
        )
        .unwrap();
        for (id, builtin) in [("mine", 0), ("builtin", 1)] {
            c.execute(
                "INSERT INTO templates (id, workspace_id, kind, language, name, file, is_builtin, \
                 created_at, updated_at) VALUES (?1, ?2, 'case', 'es', 'T', x'00', ?3, 'now', 'now')",
                params![id, ws, builtin],
            )
            .unwrap();
        }
        c.execute_batch(include_str!("../migrations/0018_template_owner.sql"))
            .unwrap();
        let owner = |id: &str| -> Option<String> {
            c.query_row("SELECT owner_id FROM templates WHERE id = ?1", [id], |r| {
                r.get(0)
            })
            .unwrap()
        };
        assert_eq!(owner("mine").as_deref(), Some("only"));
        assert_eq!(owner("builtin"), None);
    }
}
