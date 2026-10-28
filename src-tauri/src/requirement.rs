//! Requirement repository + Tauri commands (v0.0.2, TRZ-01). Requirements are
//! the test basis of a project; each has a stable `requirement_key` (REQ-001…)
//! that is auto-numbered per project, immutable once created, and linked from
//! test cases (`data.requirementKeys`) and Gherkin tags (`@REQ-001`).

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::{ensure_workspace, Db};
use crate::oplog;

const KEY_PREFIX: &str = "REQ-";
const KEY_DIGITS: usize = 3;
const PRIORITIES: [&str; 3] = ["low", "medium", "high"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Requirement {
    id: String,
    project_id: String,
    requirement_key: String,
    title: String,
    description: String,
    priority: String,
    created_at: String,
    updated_at: String,
    revision: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequirementInput {
    project_id: String,
    /// Only honoured on create (empty → auto-numbered); keys are immutable.
    requirement_key: Option<String>,
    title: String,
    description: Option<String>,
    priority: Option<String>,
    user_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequirementImportRow {
    requirement_key: Option<String>,
    title: String,
    description: Option<String>,
    priority: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    created: usize,
    updated: usize,
}

const SELECT_REQUIREMENT: &str = "SELECT id, project_id, requirement_key, title, description, \
    priority, created_at, updated_at, revision FROM requirements";

fn map_requirement(row: &rusqlite::Row) -> rusqlite::Result<Requirement> {
    Ok(Requirement {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        requirement_key: row.get("requirement_key")?,
        title: row.get("title")?,
        description: row.get("description")?,
        priority: row.get("priority")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        revision: row.get("revision")?,
    })
}

/// A key must be usable as a Gherkin tag: no whitespace and no characters that
/// tag expressions treat specially.
fn valid_key(key: &str) -> bool {
    !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':'))
}

fn normalize_priority(p: Option<&str>) -> String {
    match p.map(str::trim) {
        Some(p) if PRIORITIES.contains(&p) => p.to_string(),
        _ => "medium".to_string(),
    }
}

/// Next key within a project: highest `REQ-` suffix + 1. Unlike scenario ids,
/// soft-deleted requirements still count, so a key is never reused and cases
/// that linked a deleted requirement are not silently re-linked to a new one.
fn next_requirement_key(conn: &Connection, project_id: &str) -> Result<String, String> {
    let mut stmt = conn
        .prepare("SELECT requirement_key FROM requirements WHERE project_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut max: u64 = 0;
    for row in rows {
        let key = row.map_err(|e| e.to_string())?;
        if let Some(n) = key.strip_prefix(KEY_PREFIX).and_then(|s| s.parse::<u64>().ok()) {
            max = max.max(n);
        }
    }
    Ok(format!("{KEY_PREFIX}{:0width$}", max + 1, width = KEY_DIGITS))
}

fn list_requirements(conn: &Connection, project_id: &str) -> Result<Vec<Requirement>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "{SELECT_REQUIREMENT} WHERE project_id = ?1 AND deleted_at IS NULL \
             ORDER BY requirement_key"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], map_requirement)
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

fn get_requirement(conn: &Connection, id: &str) -> Result<Option<Requirement>, String> {
    conn.query_row(
        &format!("{SELECT_REQUIREMENT} WHERE id = ?1 AND deleted_at IS NULL"),
        params![id],
        map_requirement,
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn find_by_key(conn: &Connection, project_id: &str, key: &str) -> Result<Option<(String, i64)>, String> {
    conn.query_row(
        "SELECT id, revision FROM requirements \
         WHERE project_id = ?1 AND requirement_key = ?2 AND deleted_at IS NULL",
        params![project_id, key],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn insert_requirement(conn: &Connection, input: &RequirementInput) -> Result<String, String> {
    let key = match input.requirement_key.as_deref().map(str::trim) {
        Some(k) if !k.is_empty() => {
            if !valid_key(k) {
                return Err(format!("invalid requirement key: {k}"));
            }
            if find_by_key(conn, &input.project_id, k)?.is_some() {
                return Err(format!("duplicate requirement key: {k}"));
            }
            k.to_string()
        }
        _ => next_requirement_key(conn, &input.project_id)?,
    };
    let id = Uuid::new_v4().to_string();
    let workspace_id = ensure_workspace(conn)?;
    conn.execute(
        "INSERT INTO requirements (id, workspace_id, project_id, requirement_key, title, \
         description, priority, created_by, updated_by, created_at, updated_at, revision) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, datetime('now'), datetime('now'), 1)",
        params![
            id,
            workspace_id,
            input.project_id,
            key,
            input.title.trim(),
            input.description.clone().unwrap_or_default(),
            normalize_priority(input.priority.as_deref()),
            input.user_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    oplog::record(conn, "requirement", &id, "upsert", "{}", 1, &input.user_id)?;
    Ok(id)
}

/// Updates the editable fields. The key is immutable and ignored here.
fn update_requirement(conn: &Connection, id: &str, input: &RequirementInput) -> Result<(), String> {
    let revision: i64 = conn
        .query_row(
            "SELECT revision FROM requirements WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("requirement not found")?;
    conn.execute(
        "UPDATE requirements SET title = ?2, description = ?3, priority = ?4, \
         updated_by = ?5, updated_at = datetime('now'), revision = ?6 WHERE id = ?1",
        params![
            id,
            input.title.trim(),
            input.description.clone().unwrap_or_default(),
            normalize_priority(input.priority.as_deref()),
            input.user_id,
            revision + 1,
        ],
    )
    .map_err(|e| e.to_string())?;
    oplog::record(conn, "requirement", id, "upsert", "{}", revision + 1, &input.user_id)?;
    Ok(())
}

fn delete_requirement(conn: &Connection, id: &str, user_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE requirements SET deleted_at = datetime('now'), updated_by = ?2 \
         WHERE id = ?1 AND deleted_at IS NULL",
        params![id, user_id],
    )
    .map_err(|e| e.to_string())?;
    oplog::record(conn, "requirement", id, "delete", "{}", 0, user_id)?;
    Ok(())
}

/// Bulk CSV import in one transaction: rows whose key already exists update that
/// requirement; the rest are created (keyed as given, or auto-numbered).
fn import_requirements(
    conn: &Connection,
    project_id: &str,
    user_id: &str,
    rows: &[RequirementImportRow],
) -> Result<ImportSummary, String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let mut summary = ImportSummary { created: 0, updated: 0 };
    for row in rows {
        if row.title.trim().is_empty() {
            continue;
        }
        let input = RequirementInput {
            project_id: project_id.to_string(),
            requirement_key: row.requirement_key.clone(),
            title: row.title.clone(),
            description: row.description.clone(),
            priority: row.priority.clone(),
            user_id: user_id.to_string(),
        };
        let existing = match row.requirement_key.as_deref().map(str::trim) {
            Some(k) if !k.is_empty() => find_by_key(&tx, project_id, k)?,
            _ => None,
        };
        match existing {
            Some((id, _)) => {
                update_requirement(&tx, &id, &input)?;
                summary.updated += 1;
            }
            None => {
                insert_requirement(&tx, &input)?;
                summary.created += 1;
            }
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(summary)
}

#[tauri::command]
pub fn requirement_list(db: State<Db>, project_id: String) -> Result<Vec<Requirement>, String> {
    db.with_conn(|conn| list_requirements(conn, &project_id))
}

#[tauri::command]
pub fn requirement_get(db: State<Db>, id: String) -> Result<Option<Requirement>, String> {
    db.with_conn(|conn| get_requirement(conn, &id))
}

#[tauri::command]
pub fn requirement_create(
    db: State<Db>,
    input: RequirementInput,
) -> Result<Option<Requirement>, String> {
    let id = db.with_conn(|conn| insert_requirement(conn, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_requirement(conn, &id))
}

#[tauri::command]
pub fn requirement_update(
    db: State<Db>,
    id: String,
    input: RequirementInput,
) -> Result<Option<Requirement>, String> {
    db.with_conn(|conn| update_requirement(conn, &id, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_requirement(conn, &id))
}

#[tauri::command]
pub fn requirement_delete(db: State<Db>, id: String, user_id: String) -> Result<(), String> {
    db.with_conn(|conn| delete_requirement(conn, &id, &user_id))?;
    db.persist()
}

#[tauri::command]
pub fn requirement_import(
    db: State<Db>,
    project_id: String,
    user_id: String,
    rows: Vec<RequirementImportRow>,
) -> Result<ImportSummary, String> {
    let summary = db.with_conn(|conn| import_requirements(conn, &project_id, &user_id, &rows))?;
    db.persist()?;
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;

    const USER: &str = "user-1";

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        c
    }

    fn input(project_id: &str, key: Option<&str>, title: &str) -> RequirementInput {
        RequirementInput {
            project_id: project_id.to_string(),
            requirement_key: key.map(String::from),
            title: title.to_string(),
            description: None,
            priority: None,
            user_id: USER.to_string(),
        }
    }

    fn key_of(c: &Connection, id: &str) -> String {
        get_requirement(c, id).unwrap().unwrap().requirement_key
    }

    #[test]
    fn numbers_keys_per_project() {
        let c = conn();
        let a = insert_requirement(&c, &input("p1", None, "A")).unwrap();
        let b = insert_requirement(&c, &input("p1", None, "B")).unwrap();
        let other = insert_requirement(&c, &input("p2", None, "C")).unwrap();
        assert_eq!(key_of(&c, &a), "REQ-001");
        assert_eq!(key_of(&c, &b), "REQ-002");
        assert_eq!(key_of(&c, &other), "REQ-001");
    }

    #[test]
    fn deleted_keys_are_never_reused() {
        let c = conn();
        let a = insert_requirement(&c, &input("p1", None, "A")).unwrap();
        delete_requirement(&c, &a, USER).unwrap();
        assert_eq!(next_requirement_key(&c, "p1").unwrap(), "REQ-002");
    }

    #[test]
    fn rejects_duplicate_and_invalid_keys() {
        let c = conn();
        insert_requirement(&c, &input("p1", Some("US-12"), "A")).unwrap();
        assert!(insert_requirement(&c, &input("p1", Some("US-12"), "B")).is_err());
        assert!(insert_requirement(&c, &input("p1", Some("REQ 1"), "C")).is_err());
    }

    #[test]
    fn update_keeps_key_bumps_revision_and_audits() {
        let c = conn();
        let id = insert_requirement(&c, &input("p1", None, "A")).unwrap();
        let mut changed = input("p1", Some("REQ-999"), "A v2");
        changed.user_id = "user-2".to_string();
        update_requirement(&c, &id, &changed).unwrap();
        let r = get_requirement(&c, &id).unwrap().unwrap();
        assert_eq!(r.requirement_key, "REQ-001");
        assert_eq!(r.title, "A v2");
        assert_eq!(r.revision, 2);
        let (created_by, updated_by): (String, String) = c
            .query_row(
                "SELECT created_by, updated_by FROM requirements WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!((created_by.as_str(), updated_by.as_str()), (USER, "user-2"));
    }

    #[test]
    fn every_mutation_is_journaled() {
        let c = conn();
        let id = insert_requirement(&c, &input("p1", None, "A")).unwrap();
        update_requirement(&c, &id, &input("p1", None, "B")).unwrap();
        delete_requirement(&c, &id, USER).unwrap();
        let n: i64 = c
            .query_row(
                "SELECT count(*) FROM oplog WHERE entity = 'requirement' AND entity_id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 3);
    }

    #[test]
    fn import_upserts_by_key() {
        let c = conn();
        insert_requirement(&c, &input("p1", Some("REQ-001"), "Old")).unwrap();
        let rows = vec![
            RequirementImportRow {
                requirement_key: Some("REQ-001".into()),
                title: "New".into(),
                description: Some("d".into()),
                priority: Some("high".into()),
            },
            RequirementImportRow {
                requirement_key: None,
                title: "Fresh".into(),
                description: None,
                priority: None,
            },
        ];
        let s = import_requirements(&c, "p1", USER, &rows).unwrap();
        assert_eq!((s.created, s.updated), (1, 1));
        let list = list_requirements(&c, "p1").unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].title, "New");
        assert_eq!(list[0].priority, "high");
        assert_eq!(list[1].requirement_key, "REQ-002");
    }
}
