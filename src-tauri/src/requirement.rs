//! Requirement repository + Tauri commands (v0.0.2, TRZ-01). Requirements are
//! the test basis of a project; each has a stable `requirement_key` (REQ-001…)
//! that is auto-numbered per project, immutable once created, and linked from
//! test cases (`data.requirementKeys`) and Gherkin tags (`@REQ-001`).
//!
//! A requirement belongs to its project's owner: every function takes the
//! signed-in `user_id` and only touches requirements of projects that user owns
//! (FIX-08). Keys come from the project's key counter (DAT-01, ADR-0010).

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::{ensure_workspace, Db};
use crate::keys::{self, KeyKind};
use crate::oplog;
use crate::project;

pub(crate) const KEY_PREFIX: &str = "REQ-";
pub(crate) const KEY_DIGITS: usize = 3;
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
    /// Keys of deleted requirements found in the file: never reused, so those
    /// rows are not imported (ADR-0010).
    skipped: Vec<String>,
}

/// Live requirements of live projects owned by the given user.
const SELECT_REQUIREMENT: &str = "SELECT r.id, r.project_id, r.requirement_key, r.title, \
    r.description, r.priority, r.created_at, r.updated_at, r.revision \
    FROM requirements r JOIN projects p ON p.id = r.project_id";

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
pub(crate) fn valid_key(key: &str) -> bool {
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

/// True when the requirement is live and its project is owned by `user_id`.
fn owns(conn: &Connection, id: &str, user_id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM requirements r JOIN projects p ON p.id = r.project_id \
         WHERE r.id = ?1 AND p.owner_id = ?2 AND r.deleted_at IS NULL AND p.deleted_at IS NULL",
        params![id, user_id],
        |_| Ok(()),
    )
    .optional()
    .map_err(|e| e.to_string())
    .map(|r| r.is_some())
}

/// Next key within a project, from its key counter: a key is never reused,
/// so cases that linked a deleted requirement are not silently re-linked to a
/// new one.
fn next_requirement_key(conn: &Connection, project_id: &str) -> Result<String, String> {
    keys::allocate(
        conn,
        KeyKind::Requirement,
        project_id,
        KEY_PREFIX,
        KEY_DIGITS,
    )
}

pub(crate) fn list_requirements(
    conn: &Connection,
    project_id: &str,
    user_id: &str,
) -> Result<Vec<Requirement>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "{SELECT_REQUIREMENT} WHERE r.project_id = ?1 AND p.owner_id = ?2 \
             AND r.deleted_at IS NULL AND p.deleted_at IS NULL ORDER BY r.requirement_key"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id, user_id], map_requirement)
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

fn get_requirement(
    conn: &Connection,
    id: &str,
    user_id: &str,
) -> Result<Option<Requirement>, String> {
    conn.query_row(
        &format!(
            "{SELECT_REQUIREMENT} WHERE r.id = ?1 AND p.owner_id = ?2 \
             AND r.deleted_at IS NULL AND p.deleted_at IS NULL"
        ),
        params![id, user_id],
        map_requirement,
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn find_by_key(
    conn: &Connection,
    project_id: &str,
    key: &str,
) -> Result<Option<(String, i64)>, String> {
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
    if !project::owns(conn, &input.project_id, &input.user_id)? {
        return Err("project not found".to_string());
    }
    let key = match input.requirement_key.as_deref().map(str::trim) {
        Some(k) if !k.is_empty() => {
            if !valid_key(k) {
                return Err(format!("invalid requirement key: {k}"));
            }
            if find_by_key(conn, &input.project_id, k)?.is_some() {
                return Err(format!("duplicate requirement key: {k}"));
            }
            // Cases may still link the deleted requirement's key (@REQ-…).
            if keys::taken(conn, KeyKind::Requirement, &input.project_id, k)? {
                return Err(format!(
                    "requirement key {k} belonged to a deleted requirement and is never reused"
                ));
            }
            keys::note_manual(conn, KeyKind::Requirement, &input.project_id, KEY_PREFIX, k)?;
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
    if !owns(conn, id, &input.user_id)? {
        return Err("requirement not found".to_string());
    }
    let revision: i64 = conn
        .query_row(
            "SELECT revision FROM requirements WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
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
    oplog::record(
        conn,
        "requirement",
        id,
        "upsert",
        "{}",
        revision + 1,
        &input.user_id,
    )?;
    Ok(())
}

/// Soft-deletes a requirement the user owns. An unknown or foreign id is an
/// error and leaves no oplog row behind.
fn delete_requirement(conn: &Connection, id: &str, user_id: &str) -> Result<(), String> {
    if !owns(conn, id, user_id)? {
        return Err("requirement not found".to_string());
    }
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
/// requirement; rows with the key of a deleted requirement are skipped and
/// reported; the rest are created (keyed as given, or auto-numbered).
fn import_requirements(
    conn: &Connection,
    project_id: &str,
    user_id: &str,
    rows: &[RequirementImportRow],
) -> Result<ImportSummary, String> {
    if !project::owns(conn, project_id, user_id)? {
        return Err("project not found".to_string());
    }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let mut summary = ImportSummary {
        created: 0,
        updated: 0,
        skipped: Vec::new(),
    };
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
        let key = row
            .requirement_key
            .as_deref()
            .map(str::trim)
            .filter(|k| !k.is_empty());
        let existing = match key {
            Some(k) => find_by_key(&tx, project_id, k)?,
            None => None,
        };
        if let (Some(k), None) = (key, &existing) {
            if keys::taken(&tx, KeyKind::Requirement, project_id, k)? {
                summary.skipped.push(k.to_string());
                continue;
            }
        }
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
pub fn requirement_list(
    db: State<Db>,
    project_id: String,
    user_id: String,
) -> Result<Vec<Requirement>, String> {
    db.with_conn(|conn| list_requirements(conn, &project_id, &user_id))
}

#[tauri::command]
pub fn requirement_get(
    db: State<Db>,
    id: String,
    user_id: String,
) -> Result<Option<Requirement>, String> {
    db.with_conn(|conn| get_requirement(conn, &id, &user_id))
}

#[tauri::command]
pub fn requirement_create(
    db: State<Db>,
    input: RequirementInput,
) -> Result<Option<Requirement>, String> {
    let id = db.with_conn(|conn| insert_requirement(conn, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_requirement(conn, &id, &input.user_id))
}

#[tauri::command]
pub fn requirement_update(
    db: State<Db>,
    id: String,
    input: RequirementInput,
) -> Result<Option<Requirement>, String> {
    db.with_conn(|conn| update_requirement(conn, &id, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_requirement(conn, &id, &input.user_id))
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
    const OTHER: &str = "user-2";

    /// A database with projects `p1` and `p2`, both owned by USER.
    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        let ws = ensure_workspace(&c).unwrap();
        for id in ["p1", "p2"] {
            c.execute(
                "INSERT INTO projects (id, workspace_id, owner_id, name, created_by, updated_by, \
                 created_at, updated_at) VALUES (?1, ?2, ?3, 'P', ?3, ?3, datetime('now'), datetime('now'))",
                params![id, ws, USER],
            )
            .unwrap();
        }
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
        get_requirement(c, id, USER)
            .unwrap()
            .unwrap()
            .requirement_key
    }

    fn oplog_rows(c: &Connection) -> i64 {
        c.query_row("SELECT count(*) FROM oplog", [], |r| r.get(0))
            .unwrap()
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
    fn a_hand_typed_key_cannot_resurrect_a_deleted_requirement() {
        let c = conn();
        let a = insert_requirement(&c, &input("p1", Some("REQ-002"), "A")).unwrap();
        delete_requirement(&c, &a, USER).unwrap();
        let err = insert_requirement(&c, &input("p1", Some("REQ-002"), "B")).unwrap_err();
        assert!(err.contains("deleted"), "{err}");
    }

    #[test]
    fn import_skips_and_reports_keys_of_deleted_requirements() {
        let c = conn();
        let gone = insert_requirement(&c, &input("p1", Some("REQ-002"), "Gone")).unwrap();
        delete_requirement(&c, &gone, USER).unwrap();
        let row = |key: &str, title: &str| RequirementImportRow {
            requirement_key: Some(key.into()),
            title: title.into(),
            description: None,
            priority: None,
        };
        let s = import_requirements(
            &c,
            "p1",
            USER,
            &[row("REQ-002", "Back?"), row("REQ-010", "New")],
        )
        .unwrap();
        assert_eq!((s.created, s.updated), (1, 0));
        assert_eq!(s.skipped, vec!["REQ-002"]);
        let keys: Vec<String> = list_requirements(&c, "p1", USER)
            .unwrap()
            .into_iter()
            .map(|r| r.requirement_key)
            .collect();
        assert_eq!(keys, vec!["REQ-010"]);
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
        update_requirement(&c, &id, &input("p1", Some("REQ-999"), "A v2")).unwrap();
        let r = get_requirement(&c, &id, USER).unwrap().unwrap();
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
        assert_eq!((created_by.as_str(), updated_by.as_str()), (USER, USER));
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
        let list = list_requirements(&c, "p1", USER).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].title, "New");
        assert_eq!(list[0].priority, "high");
        assert_eq!(list[1].requirement_key, "REQ-002");
    }

    #[test]
    fn another_user_can_neither_read_nor_modify_the_requirement() {
        let c = conn();
        let id = insert_requirement(&c, &input("p1", None, "Private")).unwrap();
        let ops = oplog_rows(&c);

        assert!(list_requirements(&c, "p1", OTHER).unwrap().is_empty());
        assert!(get_requirement(&c, &id, OTHER).unwrap().is_none());

        let mut theirs = input("p1", None, "Hijacked");
        theirs.user_id = OTHER.to_string();
        assert!(insert_requirement(&c, &theirs).is_err());
        assert!(update_requirement(&c, &id, &theirs).is_err());
        assert!(delete_requirement(&c, &id, OTHER).is_err());
        let row = RequirementImportRow {
            requirement_key: None,
            title: "Imported".into(),
            description: None,
            priority: None,
        };
        assert!(import_requirements(&c, "p1", OTHER, &[row]).is_err());

        assert_eq!(
            get_requirement(&c, &id, USER).unwrap().unwrap().title,
            "Private"
        );
        assert_eq!(list_requirements(&c, "p1", USER).unwrap().len(), 1);
        assert_eq!(oplog_rows(&c), ops);
    }

    #[test]
    fn deleting_an_unknown_requirement_fails_without_an_oplog_row() {
        let c = conn();
        assert!(delete_requirement(&c, "no-such-requirement", USER).is_err());
        assert_eq!(oplog_rows(&c), 0);
    }
}
