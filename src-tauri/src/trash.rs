//! The trash (RED-W3): what the signed-in account deleted and the purge has
//! not removed yet (SYNC-06), with the same scope as the purge: rows of the
//! projects it owns, its planner cards and its templates.
//!
//! - `trash_list` shows the rows a person deletes (projects, plans, cases,
//!   requirements, cards, runs, cycles, defects, templates). Rows that go
//!   with their parent (run items, cycle items, links, fields…) are not
//!   listed: they come back and go with it.
//! - `trash_restore` undeletes a row and what was deleted with it, as a new
//!   change of each (revision + 1, a journal row and an audit `restore`), so
//!   the sync sends it like any edit and it wins over the tombstone by HLC.
//!   A row of a project that is itself in the trash waits for the project.
//! - `trash_purge` is «Eliminar para siempre» / «Vaciar papelera»: the purge
//!   with no retention left (`purge::purge_now`); held rows stay.
//!
//! A restored defect does not get its attachments back: their contents were
//! released when it was deleted (ADR-0014) and may already be collected.

use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::json;
#[cfg(feature = "tauri")]
use tauri::State;
#[cfg(test)]
use ts_rs::TS;

use crate::db::Db;
use crate::journal::{self, Action, Actor, Audit, Change};
use crate::oplog;
use crate::purge::{self, PurgeSummary, Selection};

/// One row in the trash.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub entity: String,
    pub id: String,
    /// Its project (None for templates and cards without one).
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    /// Human key (`BM-CP-0142`), when the row has one.
    pub key: Option<String>,
    pub title: String,
    pub deleted_at: String,
    /// Deleted together with its project, which is also in the trash: it
    /// comes back with the project, not on its own.
    pub with_project: bool,
    /// Kept by the purge until a pending change is sent or a conflict solved.
    pub held: bool,
    /// For a project: how many listed rows went with it.
    pub children: u32,
}

/// What a restore brought back.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RestoreSummary {
    /// Rows the person chose.
    pub restored: u32,
    /// Rows that came back with them (a project's, a run's items…).
    pub with_them: u32,
}

/// A row to restore or purge.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrashRef {
    pub entity: String,
    pub id: String,
}

/// A listed kind: entity, table, key column and title column.
struct Kind {
    entity: &'static str,
    table: &'static str,
    key: Option<&'static str>,
    title: &'static str,
}

const LISTED: [Kind; 9] = [
    Kind {
        entity: "project",
        table: "projects",
        key: None,
        title: "name",
    },
    Kind {
        entity: "test_plan",
        table: "test_plans",
        key: None,
        title: "title",
    },
    Kind {
        entity: "test_case",
        table: "test_cases",
        key: Some("scenario_id"),
        title: "title",
    },
    Kind {
        entity: "requirement",
        table: "requirements",
        key: Some("requirement_key"),
        title: "title",
    },
    Kind {
        entity: "planner_card",
        table: "planner_cards",
        key: Some("card_key"),
        title: "title",
    },
    Kind {
        entity: "run",
        table: "runs",
        key: Some("run_key"),
        title: "title",
    },
    Kind {
        entity: "test_cycle",
        table: "test_cycles",
        key: Some("cycle_key"),
        title: "title",
    },
    Kind {
        entity: "defect",
        table: "defects",
        key: Some("defect_key"),
        title: "title",
    },
    Kind {
        entity: "template",
        table: "templates",
        key: None,
        title: "name",
    },
];

/// Every table a project's delete cascades to (`project::delete_project`).
const PROJECT_CHILDREN: [(&str, &str); 13] = [
    ("test_plan", "test_plans"),
    ("test_case", "test_cases"),
    ("requirement", "requirements"),
    ("planner_card", "planner_cards"),
    ("custom_field", "custom_fields"),
    ("run", "runs"),
    ("run_item", "run_items"),
    ("unlinked_mapping", "unlinked_mappings"),
    ("configuration", "configurations"),
    ("test_cycle", "test_cycles"),
    ("test_cycle_item", "test_cycle_items"),
    ("defect", "defects"),
    ("defect_link", "defect_links"),
];

/// Rows deleted with a row of `entity` (`runs::delete`, `cycles`, `defects`):
/// child entity, table and the column naming the parent.
fn own_children(entity: &str) -> &'static [(&'static str, &'static str, &'static str)] {
    match entity {
        "run" => &[("run_item", "run_items", "run_id")],
        "test_cycle" => &[("test_cycle_item", "test_cycle_items", "cycle_id")],
        "defect" => &[("defect_link", "defect_links", "defect_id")],
        _ => &[],
    }
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn table_of(entity: &str) -> Option<&'static str> {
    LISTED
        .iter()
        .find(|k| k.entity == entity)
        .map(|k| k.table)
        .or_else(|| {
            PROJECT_CHILDREN
                .iter()
                .find(|(e, _)| *e == entity)
                .map(|(_, t)| *t)
        })
}

/// Which listed rows belong to the account (the purge's scope).
fn owned_clause(entity: &str) -> &'static str {
    match entity {
        "project" => "x.owner_id = ?1",
        "planner_card" => "x.owner_id = ?1 AND x.kind <> 'defect'",
        "template" => "x.owner_id = ?1 AND x.is_builtin = 0",
        _ => "x.project_id IN (SELECT id FROM projects WHERE owner_id = ?1)",
    }
}

/// The account's trash, newest first.
pub(crate) fn list(conn: &Connection, user: &str) -> Result<Vec<TrashItem>, String> {
    let mut items = Vec::new();
    for k in &LISTED {
        let key = k.key.map_or("NULL".to_string(), |c| format!("x.{c}"));
        let project = if matches!(k.entity, "project" | "template") {
            "NULL, NULL, NULL"
        } else {
            "x.project_id, p.name, p.deleted_at"
        };
        let join = if matches!(k.entity, "project" | "template") {
            ""
        } else {
            "LEFT JOIN projects p ON p.id = x.project_id"
        };
        let sql = format!(
            "SELECT x.id, {key}, x.{title}, x.deleted_at, {project}
               FROM {table} x {join}
              WHERE x.deleted_at IS NOT NULL AND {owned}",
            title = k.title,
            table = k.table,
            owned = owned_clause(k.entity),
        );
        let mut stmt = conn.prepare(&sql).map_err(err)?;
        let rows = stmt
            .query_map(params![user], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, Option<String>>(5)?,
                    r.get::<_, Option<String>>(6)?,
                ))
            })
            .map_err(err)?;
        for row in rows {
            let (id, key, title, deleted_at, project_id, project_name, project_deleted) =
                row.map_err(err)?;
            let with_project = project_deleted
                .as_deref()
                .is_some_and(|p| deleted_at.as_str() >= p);
            items.push(TrashItem {
                entity: k.entity.to_string(),
                held: purge::held(conn, k.entity, &id)?
                    || project_id
                        .as_deref()
                        .map_or(Ok(false), |p| purge::held(conn, "project", p))?,
                id,
                project_id,
                project_name,
                key: key.filter(|k| !k.is_empty()),
                title,
                deleted_at,
                with_project,
                children: 0,
            });
        }
    }
    // A project counts the listed rows that went with it.
    let counts: Vec<(String, u32)> = items
        .iter()
        .filter(|i| i.entity == "project")
        .map(|p| {
            let n = items
                .iter()
                .filter(|i| i.with_project && i.project_id.as_deref() == Some(p.id.as_str()))
                .count() as u32;
            (p.id.clone(), n)
        })
        .collect();
    for (id, n) in counts {
        if let Some(p) = items
            .iter_mut()
            .find(|i| i.entity == "project" && i.id == id)
        {
            p.children = n;
        }
    }
    items.sort_by(|a, b| {
        b.deleted_at
            .cmp(&a.deleted_at)
            .then_with(|| a.title.cmp(&b.title))
    });
    Ok(items)
}

fn columns(conn: &Connection, table: &str) -> Result<HashSet<String>, String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(err)?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(1)).map_err(err)?;
    rows.collect::<rusqlite::Result<_>>().map_err(err)
}

/// Undeletes one row as a new change; returns its new revision.
fn undelete(conn: &Connection, table: &str, id: &str, user: &str) -> Result<i64, String> {
    let cols = columns(conn, table)?;
    let mut set = vec!["deleted_at = NULL".to_string()];
    if cols.contains("revision") {
        set.push("revision = revision + 1".into());
    }
    if cols.contains("updated_by") {
        set.push("updated_by = ?2".into());
    }
    if cols.contains("updated_at") {
        set.push("updated_at = datetime('now')".into());
    }
    let sql = format!(
        "UPDATE {table} SET {} WHERE id = ?1 AND deleted_at IS NOT NULL",
        set.join(", ")
    );
    let n = if cols.contains("updated_by") {
        conn.execute(&sql, params![id, user])
    } else {
        conn.execute(&sql.replace("?2", "''"), params![id])
    }
    .map_err(err)?;
    if n == 0 {
        return Err("not-in-trash".into());
    }
    if cols.contains("revision") {
        conn.query_row(
            &format!("SELECT revision FROM {table} WHERE id = ?1"),
            params![id],
            |r| r.get(0),
        )
        .map_err(err)
    } else {
        Ok(0)
    }
}

#[allow(clippy::too_many_arguments)]
fn record(
    conn: &Connection,
    entity: &str,
    id: &str,
    user: &str,
    revision: i64,
    before: Option<serde_json::Value>,
    audit: Audit,
    summary: Option<serde_json::Value>,
) -> Result<(), String> {
    let mut change = Change::new(
        entity,
        id,
        Action::Restore,
        Actor::user(user),
        "upsert",
        revision,
        user,
    );
    change.before = before;
    change.audit = audit;
    change.summary = summary;
    journal::record(conn, change)
}

/// Undeletes the rows of `table` that went with a parent deleted at
/// `deleted_at`: deleted at or after it, and without a delete of their own in
/// the journal (those were deleted first and stay deleted).
fn restore_with(
    conn: &Connection,
    entity: &str,
    table: &str,
    parent_col: &str,
    parent_id: &str,
    deleted_at: &str,
    user: &str,
) -> Result<u32, String> {
    let extra = if table == "planner_cards" {
        // A defect card is a defect now (DEF-01): it never comes back.
        " AND kind <> 'defect'"
    } else {
        ""
    };
    let ids: Vec<String> = {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT id FROM {table}
                  WHERE {parent_col} = ?1 AND deleted_at IS NOT NULL AND deleted_at >= ?2{extra}
                    AND id NOT IN (SELECT entity_id FROM oplog
                                    WHERE entity = ?3 AND op = 'delete'
                                      AND created_at < ?2)"
            ))
            .map_err(err)?;
        let rows = stmt
            .query_map(params![parent_id, deleted_at, entity], |r| r.get(0))
            .map_err(err)?;
        rows.collect::<rusqlite::Result<_>>().map_err(err)?
    };
    for id in &ids {
        let before = journal::snapshot(conn, entity, id)?;
        let revision = undelete(conn, table, id, user)?;
        record(
            conn,
            entity,
            id,
            user,
            revision,
            before,
            Audit::Folded,
            None,
        )?;
    }
    Ok(ids.len() as u32)
}

/// Restores one chosen row and what went with it; returns that count.
fn restore_one(conn: &Connection, user: &str, item: &TrashRef) -> Result<u32, String> {
    let table = LISTED
        .iter()
        .find(|k| k.entity == item.entity)
        .map(|k| k.table)
        .ok_or_else(|| format!("unknown entity {}", item.entity))?;
    if oplog::owner_of(conn, &item.entity, &item.id)?.as_deref() != Some(user) {
        return Err("not-found".into());
    }
    let (deleted_at, project_deleted): (Option<String>, Option<String>) = conn
        .query_row(
            &format!(
                "SELECT x.deleted_at, {} FROM {table} x WHERE x.id = ?1",
                if matches!(item.entity.as_str(), "project" | "template") {
                    "NULL"
                } else {
                    "(SELECT deleted_at FROM projects WHERE id = x.project_id)"
                }
            ),
            params![item.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(err)?
        .ok_or("not-found")?;
    let deleted_at = deleted_at.ok_or("not-in-trash")?;
    if project_deleted.is_some() {
        return Err("project-in-trash".into());
    }
    if item.entity == "planner_card" {
        let kind: String = conn
            .query_row(
                "SELECT kind FROM planner_cards WHERE id = ?1",
                params![item.id],
                |r| r.get(0),
            )
            .map_err(err)?;
        if kind == "defect" {
            return Err("not-found".into());
        }
    }
    let before = journal::snapshot(conn, &item.entity, &item.id)?;
    let revision = undelete(conn, table, &item.id, user)?;
    let mut cascade = serde_json::Map::new();
    let mut with = 0;
    if item.entity == "project" {
        for (entity, child) in PROJECT_CHILDREN {
            let n = restore_with(
                conn,
                entity,
                child,
                "project_id",
                &item.id,
                &deleted_at,
                user,
            )?;
            if n > 0 {
                cascade.insert(child.to_string(), n.into());
            }
            with += n;
        }
    }
    for (entity, child, col) in own_children(&item.entity) {
        let n = restore_with(conn, entity, child, col, &item.id, &deleted_at, user)?;
        if n > 0 {
            cascade.insert(child.to_string(), n.into());
        }
        with += n;
    }
    let summary = (!cascade.is_empty()).then(|| json!({ "cascade": cascade }));
    record(
        conn,
        &item.entity,
        &item.id,
        user,
        revision,
        before,
        Audit::Event,
        summary,
    )?;
    Ok(with)
}

/// Restores the chosen rows in one transaction: all or none.
pub(crate) fn restore(
    conn: &Connection,
    user: &str,
    items: &[TrashRef],
) -> Result<RestoreSummary, String> {
    if user.is_empty() {
        return Err("not-authenticated".into());
    }
    // Projects first, so their rows chosen with them are already back.
    let mut ordered: Vec<&TrashRef> = items.iter().collect();
    ordered.sort_by_key(|i| i.entity != "project");
    let mut out = RestoreSummary::default();
    let mut done = HashSet::new();
    for item in ordered {
        if !done.insert((item.entity.clone(), item.id.clone())) {
            continue;
        }
        let already_back = table_of(&item.entity)
            .map(|t| {
                conn.query_row(
                    &format!("SELECT deleted_at IS NULL FROM {t} WHERE id = ?1"),
                    params![item.id],
                    |r| r.get::<_, bool>(0),
                )
                .optional()
            })
            .transpose()
            .map_err(err)?
            .flatten()
            .unwrap_or(false);
        if already_back {
            // Came back with its project in this same restore.
            out.restored += 1;
            out.with_them = out.with_them.saturating_sub(1);
            continue;
        }
        out.with_them += restore_one(conn, user, item)?;
        out.restored += 1;
    }
    Ok(out)
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn trash_list(db: State<Db>, user_id: String) -> Result<Vec<TrashItem>, String> {
    db.with_conn(|conn| list(conn, &user_id))
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn trash_restore(
    db: State<Db>,
    user_id: String,
    items: Vec<TrashRef>,
) -> Result<RestoreSummary, String> {
    let summary = db.with_conn(|conn| {
        let tx = conn.unchecked_transaction().map_err(err)?;
        let s = restore(&tx, &user_id, &items)?;
        tx.commit().map_err(err)?;
        Ok(s)
    })?;
    db.persist()?;
    Ok(summary)
}

/// «Eliminar para siempre» (`items`) or «Vaciar papelera» (`items` = None).
#[cfg(feature = "tauri")]
#[tauri::command]
pub fn trash_purge(
    db: State<Db>,
    user_id: String,
    items: Option<Vec<TrashRef>>,
) -> Result<PurgeSummary, String> {
    let selection: Option<Selection> =
        items.map(|v| v.into_iter().map(|i| (i.entity, i.id)).collect());
    let summary = db.with_conn(|conn| {
        let tx = conn.unchecked_transaction().map_err(err)?;
        let s = purge::purge_now(&tx, &user_id, selection.as_ref())?;
        crate::evidence::release_unreferenced(&tx)?;
        tx.commit().map_err(err)?;
        Ok(s)
    })?;
    db.persist_and_collect()?;
    Ok(summary)
}

#[cfg(test)]
#[path = "trash_tests.rs"]
mod tests;
