//! Workspaces with roles on the desktop (SYNC-07, ADR-0042 §6).
//!
//! - The server is the authority on who belongs to a workspace and with which
//!   role; this device keeps a read-only mirror of `GET /workspaces` per
//!   account (`workspace_members`, migration 0040), refreshed every sync
//!   (`workspaces_apply`).
//! - `owner_id` on this device keeps meaning «the account that holds the row»
//!   (FIX-07): rows of a synced workspace are held by the member who pulled
//!   them, so every account-scoped read and guard keeps working for each
//!   member. The server's `ownerId` (who created it) is kept in `creator_id`.
//! - Roles are enforced where every change is written (`journal::record` →
//!   `check_write`), with the capability matrix shared with the server and
//!   the client (`src/shared/contracts/workspace-roles.json`).
//! - The first sync with a server that has `workspaces` moves the account's
//!   rows from the device's local workspace to its personal one, after a
//!   backup; later syncs do the same for projects created offline.

use std::collections::HashMap;
use std::sync::OnceLock;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
#[cfg(test)]
use ts_rs::TS;

use crate::db::Db;

// ------------------------------------------------------------------ roles

#[derive(Deserialize)]
struct Matrix {
    roles: Vec<String>,
    capabilities: HashMap<String, Vec<String>>,
}

fn matrix() -> &'static Matrix {
    static M: OnceLock<Matrix> = OnceLock::new();
    M.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../src/shared/contracts/workspace-roles.json"
        ))
        .expect("workspace-roles.json is valid")
    })
}

/// True if `role` has the capability (the shared matrix).
pub(crate) fn can(role: &str, cap: &str) -> bool {
    matrix()
        .capabilities
        .get(cap)
        .is_some_and(|roles| roles.iter().any(|r| r == role))
}

/// The capability a change of `entity` needs, as on the server
/// (`roles.ts::capabilityFor`). `is_new`: a Product Owner creates defects
/// but does not edit them. Unknown entities need the strictest one.
pub(crate) fn capability_for(entity: &str, is_new: bool) -> &'static str {
    match entity {
        "project" => "project.manage",
        "test_plan" => "plan.edit",
        "requirement" => "requirement.edit",
        "test_case" | "test_case_revision" | "case_baseline" => "case.edit",
        "custom_field" => "field.edit",
        "configuration" => "config.edit",
        "test_cycle" | "test_cycle_item" => "cycle.edit",
        "planner_card" => "planner.edit",
        "run_shard" => "result.import",
        "run" | "run_item" | "unlinked_mapping" | "result" => "run.execute",
        "defect" if is_new => "defect.create",
        "defect" | "defect_link" => "defect.edit",
        _ => "members.manage",
    }
}

/// Entities whose changes are not a role's business: the audit trail (every
/// member writes it with their changes) and local-only bookkeeping.
fn role_free(entity: &str) -> bool {
    matches!(entity, "audit_event" | "template" | "profile")
}

/// The kind of a workspace (`local`, `personal`, `shared`), or None.
fn kind_of(conn: &Connection, workspace_id: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT kind FROM workspaces WHERE id = ?1",
        [workspace_id],
        |r| r.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// The account's role in a workspace: in the device's own (`local`) workspace,
/// or one this device never heard of, the account owns its rows (Test
/// Manager); in a synced one, the mirrored role, or None if not a member.
pub(crate) fn role_of(
    conn: &Connection,
    user: &str,
    workspace_id: &str,
) -> Result<Option<String>, String> {
    match kind_of(conn, workspace_id)?.as_deref() {
        None | Some("local") => Ok(Some("test_manager".into())),
        _ => conn
            .query_row(
                "SELECT role FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2",
                params![workspace_id, user],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string()),
    }
}

/// The table an entity of the `lww` class lives in.
fn table_of(entity: &str) -> Option<&'static str> {
    crate::sync::table_for(entity)
}

/// The workspace an entity lives in, from its row; for an append-only one,
/// from its payload (`workspaceId`). None if it has no row.
pub(crate) fn workspace_of(
    conn: &Connection,
    entity: &str,
    id: &str,
) -> Result<Option<String>, String> {
    if let Some(table) = table_of(entity) {
        return conn
            .query_row(
                &format!("SELECT workspace_id FROM {table} WHERE id = ?1"),
                [id],
                |r| r.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(|e| e.to_string())
            .map(Option::flatten);
    }
    if let Some(class) = crate::sync_class::append_only(entity) {
        return Ok((class.read)(conn, id)?.and_then(|p| {
            p.get("workspaceId")
                .and_then(Value::as_str)
                .map(str::to_string)
        }));
    }
    Ok(None)
}

/// Refuses a change the account's role in the entity's workspace does not
/// allow (the server would reject it anyway; ADR-0042 §6). Error texts start
/// with `forbidden:` and the capability, or `access_lost`, for the UI.
pub(crate) fn check_write(
    conn: &Connection,
    user: &str,
    entity: &str,
    id: &str,
    is_new: bool,
) -> Result<(), String> {
    if role_free(entity) || user.is_empty() {
        return Ok(());
    }
    let Some(ws) = workspace_of(conn, entity, id)? else {
        return Ok(());
    };
    // The device's own workspace (or one it never heard of): the account's
    // rows, nothing to check. Two queries at most for every local write.
    if matches!(kind_of(conn, &ws)?.as_deref(), None | Some("local")) {
        return Ok(());
    }
    if access_lost(conn, entity, id)? {
        return Err("access_lost: this project is no longer in any of your workspaces".into());
    }
    let cap = capability_for(entity, is_new);
    match role_of(conn, user, &ws)? {
        Some(role) if can(&role, cap) => Ok(()),
        _ => Err(format!("forbidden:{cap}")),
    }
}

/// True when the entity's project is marked «Sin acceso en el servidor».
fn access_lost(conn: &Connection, entity: &str, id: &str) -> Result<bool, String> {
    let project = if entity == "project" {
        Some(id.to_string())
    } else {
        let Some(table) = table_of(entity) else {
            return Ok(false);
        };
        let has_project = conn
            .prepare(&format!("SELECT project_id FROM {table} LIMIT 0"))
            .is_ok();
        if !has_project {
            return Ok(false);
        }
        conn.query_row(
            &format!("SELECT project_id FROM {table} WHERE id = ?1"),
            [id],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten()
    };
    let Some(project) = project else {
        return Ok(false);
    };
    conn.query_row(
        "SELECT access_lost_at IS NOT NULL FROM projects WHERE id = ?1",
        [project],
        |r| r.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
    .map(|v| v.unwrap_or(false))
}

// ------------------------------------------------------------- the mirror

/// A member as the server lists it.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MemberDto {
    pub user_id: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub first_name: String,
    #[serde(default)]
    pub last_name: String,
    pub role: String,
    #[serde(default)]
    pub added_at: Option<String>,
}

/// A workspace of the account, as `GET /workspaces` lists it (and as the UI
/// reads it back from the mirror).
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDto {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub role: String,
    /// «Aprobación independiente» (PLN-08); absent from an older server.
    #[serde(default)]
    pub independent_approval: bool,
    #[serde(default)]
    pub members: Vec<MemberDto>,
}

/// A workspace the server no longer lists for the account: it was removed
/// or the workspace was deleted. Its copy stays until the user confirms
/// (`workspace_drop`).
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RevokedWorkspace {
    pub id: String,
    pub name: String,
    pub projects: i64,
    pub pending: i64,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Applied {
    pub revoked: Vec<RevokedWorkspace>,
    /// Projects moved from the device's local workspace to the personal one.
    pub remapped: i64,
}

/// True for one of the five workspace roles.
fn is_role(role: &str) -> bool {
    matrix().roles.iter().any(|r| r == role)
}

/// Tables whose rows carry a workspace and hang from a project: moved with
/// their project's rows (the remap, a drop).
const PROJECT_TABLES: &[&str] = &[
    "test_plans",
    "test_cases",
    "test_case_revisions",
    "requirements",
    "planner_cards",
    "custom_fields",
    "configurations",
    "test_cycles",
    "test_cycle_items",
    "runs",
    "run_items",
    "unlinked_mappings",
    "run_shards",
    "results",
    "defects",
    "defect_links",
    "attachments",
    "case_baselines",
    "audit_log",
];

/// Refreshes the account's mirror from the server's list (inside the caller's
/// transaction) and moves its rows out of the local workspace into the
/// personal one. Returns the workspaces it lost and how many projects moved.
pub(crate) fn apply(
    conn: &Connection,
    user: &str,
    list: &[WorkspaceDto],
) -> Result<Applied, String> {
    for w in list {
        if !matches!(w.kind.as_str(), "personal" | "shared") || !is_role(&w.role) {
            return Err(format!("workspaces: unexpected kind or role for {}", w.id));
        }
    }
    let before: Vec<(String, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT w.id, w.name FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
                  WHERE m.user_id = ?1 AND w.kind <> 'local'",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([user], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?
    };
    for w in list {
        conn.execute(
            "INSERT INTO workspaces (id, name, kind, independent_approval) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind,
                    independent_approval = excluded.independent_approval, updated_at = datetime('now')",
            params![w.id, w.name, w.kind, w.independent_approval && w.kind == "shared"],
        )
        .map_err(|e| e.to_string())?;
        // The server lists every member; a list without them (an older
        // server) only says the account's role, so the other accounts of
        // this device keep theirs.
        if w.members.is_empty() {
            conn.execute(
                "DELETE FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2",
                params![w.id, user],
            )
        } else {
            conn.execute(
                "DELETE FROM workspace_members WHERE workspace_id = ?1",
                [&w.id],
            )
        }
        .map_err(|e| e.to_string())?;
        let mut members = w.members.clone();
        // An older server, or a list without members: at least the account.
        if !members.iter().any(|m| m.user_id == user) {
            members.push(MemberDto {
                user_id: user.into(),
                email: String::new(),
                display_name: String::new(),
                first_name: String::new(),
                last_name: String::new(),
                role: w.role.clone(),
                added_at: None,
            });
        }
        for m in &members {
            if !is_role(&m.role) {
                continue;
            }
            conn.execute(
                "INSERT INTO workspace_members
                   (workspace_id, user_id, role, email, display_name, first_name, last_name, added_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    w.id,
                    m.user_id,
                    m.role,
                    m.email,
                    m.display_name,
                    m.first_name,
                    m.last_name,
                    m.added_at
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    let mut applied = Applied::default();
    for (id, name) in before {
        if list.iter().any(|w| w.id == id) {
            continue;
        }
        let projects: i64 = conn
            .query_row(
                "SELECT count(*) FROM projects WHERE workspace_id = ?1 AND deleted_at IS NULL",
                [&id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let pending: i64 = conn
            .query_row(
                "SELECT count(*) FROM oplog WHERE user_id = ?1 AND workspace_id = ?2 AND synced_at IS NULL",
                params![user, id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        applied.revoked.push(RevokedWorkspace {
            id,
            name,
            projects,
            pending,
        });
    }
    if let Some(personal) = list.iter().find(|w| w.kind == "personal") {
        applied.remapped = remap(conn, user, &personal.id)?;
    }
    Ok(applied)
}

/// Moves the account's rows from the device's local workspace(s) to its
/// personal one: first what hangs from its projects, then the projects, its
/// own planner cards and its audit events without a project. Idempotent.
fn remap(conn: &Connection, user: &str, personal: &str) -> Result<i64, String> {
    const LOCAL: &str = "(SELECT id FROM workspaces WHERE kind = 'local')";
    let projects =
        format!("(SELECT id FROM projects WHERE owner_id = ?1 AND workspace_id IN {LOCAL})");
    for table in PROJECT_TABLES {
        conn.execute(
            &format!(
                "UPDATE {table} SET workspace_id = ?2
                  WHERE workspace_id IN {LOCAL} AND project_id IN {projects}"
            ),
            params![user, personal],
        )
        .map_err(|e| format!("remap {table}: {e}"))?;
    }
    conn.execute(
        &format!(
            "UPDATE audit_log SET workspace_id = ?2
              WHERE workspace_id IN {LOCAL} AND project_id IS NULL AND user_id = ?1"
        ),
        params![user, personal],
    )
    .map_err(|e| e.to_string())?;
    let moved = conn
        .execute(
            &format!(
                "UPDATE projects SET workspace_id = ?2 WHERE owner_id = ?1 AND workspace_id IN {LOCAL}"
            ),
            params![user, personal],
        )
        .map_err(|e| e.to_string())?;
    conn.execute(
        &format!(
            "UPDATE oplog SET workspace_id = ?2
              WHERE user_id = ?1 AND synced_at IS NULL AND (workspace_id IS NULL OR workspace_id IN {LOCAL})"
        ),
        params![user, personal],
    )
    .map_err(|e| e.to_string())?;
    Ok(moved as i64)
}

/// Moves what hangs from a project to the project's workspace (a pulled
/// project that moved, ADR-0042 §5). Only the location changes.
pub(crate) fn follow_project(
    conn: &Connection,
    project_id: &str,
    workspace_id: &str,
) -> Result<(), String> {
    for table in PROJECT_TABLES {
        conn.execute(
            &format!(
                "UPDATE {table} SET workspace_id = ?2 WHERE project_id = ?1 AND workspace_id IS NOT ?2"
            ),
            params![project_id, workspace_id],
        )
        .map_err(|e| format!("follow {table}: {e}"))?;
    }
    Ok(())
}

/// The account's synced workspaces from the mirror, personal first (the UI).
pub(crate) fn list(conn: &Connection, user: &str) -> Result<Vec<WorkspaceDto>, String> {
    let rows: Vec<(String, String, String, String, bool)> = {
        let mut stmt = conn
            .prepare(
                "SELECT w.id, w.name, w.kind, m.role, w.independent_approval
                   FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ?1
                  WHERE w.kind <> 'local'
                  ORDER BY (w.kind = 'personal') DESC, w.name",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([user], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?
    };
    let mut out = Vec::new();
    for (id, name, kind, role, independent_approval) in rows {
        let mut stmt = conn
            .prepare(
                "SELECT user_id, email, display_name, first_name, last_name, role, added_at
                   FROM workspace_members WHERE workspace_id = ?1 ORDER BY added_at, display_name",
            )
            .map_err(|e| e.to_string())?;
        let members = stmt
            .query_map([&id], |r| {
                Ok(MemberDto {
                    user_id: r.get(0)?,
                    email: r.get(1)?,
                    display_name: r.get(2)?,
                    first_name: r.get(3)?,
                    last_name: r.get(4)?,
                    role: r.get(5)?,
                    added_at: r.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?;
        out.push(WorkspaceDto {
            id,
            name,
            kind,
            role,
            independent_approval,
            members,
        });
    }
    Ok(out)
}

/// Deletes the copy of a workspace the account lost (ADR-0019 decision 2),
/// once the user confirmed: its pending changes, its rows and the account's
/// membership. If another account of this device still belongs to it, only
/// the account's pending changes and membership go. Audit events stay: the
/// log is append-only (they are no longer visible without their project).
pub(crate) fn drop_copy(conn: &Connection, user: &str, workspace_id: &str) -> Result<i64, String> {
    conn.execute(
        "DELETE FROM oplog WHERE user_id = ?1 AND workspace_id = ?2 AND synced_at IS NULL",
        params![user, workspace_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2",
        params![workspace_id, user],
    )
    .map_err(|e| e.to_string())?;
    let others: i64 = conn
        .query_row(
            "SELECT count(*) FROM workspace_members WHERE workspace_id = ?1",
            [workspace_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if others > 0 {
        return Ok(0);
    }
    for table in PROJECT_TABLES.iter().filter(|t| **t != "audit_log") {
        conn.execute(
            &format!("DELETE FROM {table} WHERE workspace_id = ?1"),
            [workspace_id],
        )
        .map_err(|e| format!("drop {table}: {e}"))?;
    }
    let removed = conn
        .execute(
            "DELETE FROM projects WHERE workspace_id = ?1",
            [workspace_id],
        )
        .map_err(|e| e.to_string())?;
    let prefix = format!("cursor:{user}:{workspace_id}");
    conn.execute("DELETE FROM sync_state WHERE key = ?1", [prefix])
        .map_err(|e| e.to_string())?;
    Ok(removed as i64)
}

// --------------------------------------------------- refusals from the server

/// A delta the server refused (ADR-0042 §2).
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Refused {
    pub entity: String,
    pub entity_id: String,
    pub reason: String,
    #[serde(default)]
    pub workspace_id: Option<String>,
}

/// Records refused deltas: `moved` relocates the row to the workspace the
/// server named (its pending change goes there next push); `forbidden` and
/// `not_found` wait in `sync_rejections` for the user, and `not_found` also
/// marks the project «Sin acceso en el servidor».
pub(crate) fn record_refused(
    conn: &Connection,
    user: &str,
    items: &[Refused],
) -> Result<(), String> {
    for r in items {
        match r.reason.as_str() {
            "moved" => {
                if let (Some(table), Some(ws)) = (table_of(&r.entity), r.workspace_id.as_deref()) {
                    conn.execute(
                        &format!("UPDATE {table} SET workspace_id = ?2 WHERE id = ?1"),
                        params![r.entity_id, ws],
                    )
                    .map_err(|e| e.to_string())?;
                }
                conn.execute(
                    "UPDATE oplog SET workspace_id = ?3
                      WHERE user_id = ?1 AND entity_id = ?2 AND synced_at IS NULL",
                    params![user, r.entity_id, r.workspace_id],
                )
                .map_err(|e| e.to_string())?;
            }
            "forbidden" | "not_found" => {
                let ws = workspace_of(conn, &r.entity, &r.entity_id)?;
                conn.execute(
                    "INSERT INTO sync_rejections (id, user_id, workspace_id, entity, entity_id, reason, detected_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
                     ON CONFLICT (user_id, entity, entity_id) WHERE resolved_at IS NULL
                       DO UPDATE SET reason = excluded.reason, detected_at = excluded.detected_at",
                    params![uuid::Uuid::new_v4().to_string(), user, ws, r.entity, r.entity_id, r.reason],
                )
                .map_err(|e| e.to_string())?;
                if r.reason == "not_found" {
                    mark_access_lost(conn, &r.entity, &r.entity_id)?;
                }
            }
            _ => {}
        }
    }
    Ok(())
}

/// Marks the project of an entity «Sin acceso en el servidor».
fn mark_access_lost(conn: &Connection, entity: &str, id: &str) -> Result<(), String> {
    let project: Option<String> = if entity == "project" {
        Some(id.into())
    } else if let Some(table) = table_of(entity) {
        conn.query_row(
            &format!("SELECT project_id FROM {table} WHERE id = ?1"),
            [id],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()
        .ok()
        .flatten()
        .flatten()
    } else {
        None
    };
    if let Some(project) = project {
        conn.execute(
            "UPDATE projects SET access_lost_at = coalesce(access_lost_at, datetime('now')) WHERE id = ?1",
            [project],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// The ids of entities with an open refusal: the push holds them back until
/// the user discards them.
pub(crate) fn refused_sql() -> &'static str {
    "SELECT entity_id FROM sync_rejections WHERE user_id = ?1 AND resolved_at IS NULL"
}

// ------------------------------------------------------------ approvals

/// Who may approve a case on this device (CAS-02): the same rule as the
/// server (`approval.ts`): an active member; in a personal or local
/// workspace anyone (alone there), else the role of what is approved and
/// never the author. PLN-08 replaces the rule.
pub struct WorkspaceApprover;

impl crate::case_review::ApproverCheck for WorkspaceApprover {
    fn can_approve(
        &self,
        conn: &Connection,
        req: &crate::case_review::ApprovalRequest,
    ) -> Result<crate::case_review::ApprovalVerdict, String> {
        use crate::case_review::{ApprovalVerdict, DenyReason};
        let kind = kind_of(conn, req.workspace_id)?;
        let self_approval = req.approver_id == req.author_id;
        if matches!(kind.as_deref(), None | Some("local") | Some("personal")) {
            return Ok(ApprovalVerdict::Allowed { self_approval });
        }
        let Some(role) = role_of(conn, req.approver_id, req.workspace_id)? else {
            return Ok(ApprovalVerdict::Denied(DenyReason::NotMember));
        };
        if !can(&role, "case.approve") {
            return Ok(ApprovalVerdict::Denied(DenyReason::Role));
        }
        if self_approval {
            return Ok(ApprovalVerdict::Denied(DenyReason::Author));
        }
        Ok(ApprovalVerdict::Allowed {
            self_approval: false,
        })
    }
}

// --------------------------------------------------------------- commands

fn require_user(user_id: &str) -> Result<(), String> {
    if user_id.is_empty() {
        return Err("no account".into());
    }
    Ok(())
}

/// Refreshes the mirror from `GET /workspaces` and moves the account's local
/// rows into its personal workspace. The first time it moves anything, the
/// database is backed up before (SEC-06 style: `pharos.db.enc.bak-…-workspaces`).
#[tauri::command]
pub fn workspaces_apply(
    db: State<Db>,
    user_id: String,
    workspaces: Vec<WorkspaceDto>,
) -> Result<Applied, String> {
    require_user(&user_id)?;
    let needs_backup = db.with_conn(|conn| {
        conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM projects p JOIN workspaces w ON w.id = p.workspace_id
                             WHERE w.kind = 'local' AND p.owner_id = ?1)",
            [&user_id],
            |r| r.get::<_, bool>(0),
        )
        .map_err(|e| e.to_string())
    })?;
    if needs_backup {
        db.backup_now("workspaces")?;
    }
    let applied = db.with_tx(|conn| apply(conn, &user_id, &workspaces))?;
    db.persist()?;
    Ok(applied)
}

/// The workspace of each of the account's projects: key block leases go to
/// the project's workspace (SYNC-07).
#[tauri::command]
pub fn project_workspaces(
    db: State<Db>,
    user_id: String,
) -> Result<HashMap<String, String>, String> {
    require_user(&user_id)?;
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare("SELECT id, workspace_id FROM projects WHERE owner_id = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&user_id], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn workspaces_list(db: State<Db>, user_id: String) -> Result<Vec<WorkspaceDto>, String> {
    require_user(&user_id)?;
    db.with_conn(|conn| list(conn, &user_id))
}

#[tauri::command]
pub fn workspace_drop(db: State<Db>, user_id: String, workspace_id: String) -> Result<i64, String> {
    require_user(&user_id)?;
    let n = db.with_tx(|conn| drop_copy(conn, &user_id, &workspace_id))?;
    db.persist_and_collect()?;
    Ok(n)
}

#[tauri::command]
pub fn sync_refused_record(
    db: State<Db>,
    user_id: String,
    items: Vec<Refused>,
) -> Result<(), String> {
    require_user(&user_id)?;
    db.with_tx(|conn| record_refused(conn, &user_id, &items))?;
    db.persist()
}

/// An open refusal, for the conflict panel («Rechazado por permisos»).
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Rejection {
    pub id: String,
    pub entity: String,
    pub entity_id: String,
    pub reason: String,
    pub workspace_id: Option<String>,
    pub detected_at: String,
}

#[tauri::command]
pub fn sync_rejections_list(db: State<Db>, user_id: String) -> Result<Vec<Rejection>, String> {
    require_user(&user_id)?;
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, entity, entity_id, reason, workspace_id, detected_at FROM sync_rejections
                  WHERE user_id = ?1 AND resolved_at IS NULL ORDER BY detected_at",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&user_id], |r| {
                Ok(Rejection {
                    id: r.get(0)?,
                    entity: r.get(1)?,
                    entity_id: r.get(2)?,
                    reason: r.get(3)?,
                    workspace_id: r.get(4)?,
                    detected_at: r.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<_>>().map_err(|e| e.to_string())
    })
}

/// «Descartar»: the refused change never reaches the server. Its pending
/// rows are dropped and its sync base forgotten, so the next pull brings the
/// server's version back.
#[tauri::command]
pub fn sync_rejection_discard(db: State<Db>, user_id: String, id: String) -> Result<(), String> {
    require_user(&user_id)?;
    db.with_tx(|conn| {
        let row: Option<(String, String, Option<String>)> = conn
            .query_row(
                "SELECT entity, entity_id, workspace_id FROM sync_rejections
                  WHERE id = ?1 AND user_id = ?2 AND resolved_at IS NULL",
                params![id, user_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some((entity, entity_id, ws)) = row else {
            return Ok(());
        };
        conn.execute(
            "DELETE FROM oplog WHERE user_id = ?1 AND entity = ?2 AND entity_id = ?3 AND synced_at IS NULL",
            params![user_id, entity, entity_id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM sync_base WHERE user_id = ?1 AND entity = ?2 AND entity_id = ?3",
            params![user_id, entity, entity_id],
        )
        .map_err(|e| e.to_string())?;
        if let Some(ws) = ws {
            // Pull that workspace from the start: its version comes back.
            conn.execute(
                "DELETE FROM sync_state WHERE key = ?1",
                [format!("cursor:{user_id}:{ws}")],
            )
            .map_err(|e| e.to_string())?;
        }
        conn.execute(
            "UPDATE sync_rejections SET resolved_at = datetime('now') WHERE id = ?1",
            [id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    db.persist()
}

#[cfg(test)]
#[path = "workspaces_tests.rs"]
mod tests;
