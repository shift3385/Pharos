//! Suite baselines (CAS-02, ADR-0047): a named set of a project's cases,
//! each frozen at the exact revision it had (`test_case_revisions`, DAT-02).
//! A baseline is never edited or deleted; a new one replaces it. Comparing
//! two baselines, or one with the current state, is done by the client on
//! the content these commands return (`caseDiff.ts`), the same on the web.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::State;
#[cfg(test)]
use ts_rs::TS;
use uuid::Uuid;

use crate::case_review::APPROVED;
use crate::db::{ensure_workspace, Db};
use crate::journal::{self, Action, Actor};
use crate::project;
use crate::revisions;

pub const ENTITY: &str = "case_baseline";

#[cfg_attr(
    test,
    derive(TS),
    ts(export, rename = "CaseBaselineInput", optional_fields)
)]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaselineInput {
    pub project_id: String,
    pub name: String,
    pub description: Option<String>,
    /// How the cases were chosen, as the user saw it («Prioridad alta»).
    pub scope_label: Option<String>,
    /// Leave out the cases that are not approved.
    #[serde(default)]
    pub approved_only: bool,
    pub case_ids: Vec<String>,
    pub user_id: String,
}

#[cfg_attr(test, derive(TS), ts(export, rename = "CaseBaselineSummary"))]
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BaselineSummary {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: String,
    pub scope_label: String,
    pub approved_only: bool,
    pub created_by: String,
    pub created_at: String,
    pub item_count: i64,
}

/// One frozen case: the revision it had and that revision's content.
#[cfg_attr(test, derive(TS), ts(export, rename = "CaseBaselineItem"))]
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BaselineItem {
    pub case_id: String,
    pub revision_id: String,
    pub revision: i64,
    pub scenario_id: String,
    pub title: String,
    pub status: String,
    pub version: String,
    pub priority: String,
    #[cfg_attr(test, ts(type = "unknown"))]
    pub data: Value,
}

/// A baseline with its cases. The current state of a project has the same
/// shape (`case_baseline_current`), with an empty id.
#[cfg_attr(test, derive(TS), ts(export, rename = "CaseBaseline"))]
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Baseline {
    #[serde(flatten)]
    #[cfg_attr(test, ts(flatten))]
    pub summary: BaselineSummary,
    pub items: Vec<BaselineItem>,
}

const SUMMARY_COLS: &str = "b.id, b.project_id, b.name, b.description, b.scope_label, \
     b.approved_only, b.created_by, b.created_at, \
     (SELECT count(*) FROM case_baseline_items i WHERE i.baseline_id = b.id)";

fn map_summary(r: &rusqlite::Row) -> rusqlite::Result<BaselineSummary> {
    Ok(BaselineSummary {
        id: r.get(0)?,
        project_id: r.get(1)?,
        name: r.get(2)?,
        description: r.get(3)?,
        scope_label: r.get(4)?,
        approved_only: r.get::<_, i64>(5)? == 1,
        created_by: r.get(6)?,
        created_at: r.get(7)?,
        item_count: r.get(8)?,
    })
}

fn parse(data: &str) -> Value {
    serde_json::from_str(data).unwrap_or_else(|_| json!({}))
}

/// Freezes the chosen cases of a project the user owns. Unknown or deleted
/// cases, and with `approved_only` the cases that are not approved, are left
/// out; a baseline with no case is refused.
pub(crate) fn create_baseline(conn: &Connection, input: &BaselineInput) -> Result<String, String> {
    if !project::owns(conn, &input.project_id, &input.user_id)? {
        return Err("project not found".to_string());
    }
    let name = input.name.trim();
    if name.is_empty() {
        return Err("baseline-name-required: a baseline needs a name".to_string());
    }
    let user = input.user_id.as_str();
    let id = Uuid::new_v4().to_string();
    let mut items: Vec<(String, String, i64, String, String, String)> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for case_id in &input.case_ids {
        if !seen.insert(case_id.as_str()) {
            continue;
        }
        let live = conn
            .query_row(
                "SELECT 1 FROM test_cases WHERE id = ?1 AND project_id = ?2 AND deleted_at IS NULL",
                params![case_id, input.project_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .is_some();
        if !live {
            continue;
        }
        let Some(revision_id) = revisions::ensure_current(conn, case_id, user, true)? else {
            continue;
        };
        let (revision, scenario_id, title, status): (i64, String, String, String) = conn
            .query_row(
                "SELECT revision, coalesce(scenario_id, ''), title, coalesce(status, 'draft') \
                 FROM test_case_revisions WHERE id = ?1",
                params![revision_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .map_err(|e| e.to_string())?;
        if input.approved_only && status != APPROVED {
            continue;
        }
        items.push((
            case_id.clone(),
            revision_id,
            revision,
            scenario_id,
            title,
            status,
        ));
    }
    if items.is_empty() {
        return Err("baseline-empty: no case to freeze".to_string());
    }
    let workspace = ensure_workspace(conn)?;
    conn.execute(
        "INSERT INTO case_baselines (id, workspace_id, project_id, name, description, scope_label, \
         approved_only, created_by, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        params![
            id,
            workspace,
            input.project_id,
            name,
            input.description.as_deref().unwrap_or("").trim(),
            input.scope_label.as_deref().unwrap_or("").trim(),
            i64::from(input.approved_only),
            user,
        ],
    )
    .map_err(|e| e.to_string())?;
    for (case_id, revision_id, revision, scenario_id, title, status) in &items {
        conn.execute(
            "INSERT INTO case_baseline_items (baseline_id, case_id, revision_id, revision, \
             scenario_id, title, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                case_id,
                revision_id,
                revision,
                scenario_id,
                title,
                status
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "UPDATE case_baselines SET hlc = ?2 WHERE id = ?1",
        params![id, crate::oplog::next_hlc(conn)?],
    )
    .map_err(|e| e.to_string())?;
    // Synced as an append-only document (`sync_class.rs`).
    journal::record_append(conn, ENTITY, &id, user)?;
    let mut changes = Map::new();
    changes.insert("name".into(), json!(name));
    changes.insert("cases".into(), json!(items.len()));
    journal::record_event_in(
        conn,
        Actor::user(user),
        Action::Create,
        ENTITY,
        &id,
        Some(&input.project_id),
        changes,
        None,
    )?;
    Ok(id)
}

/// The `case_baseline` document pushed for a baseline (append-only,
/// `sync_class.rs`). `workspaceId` and `projectId` are its location, outside
/// its content: moving the project moves it (ADR-0019).
pub fn payload(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    let head = conn
        .query_row(
            "SELECT id, workspace_id, project_id, name, description, scope_label, approved_only, \
             created_by, created_at, hlc FROM case_baselines WHERE id = ?1",
            params![id],
            |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "workspaceId": r.get::<_, Option<String>>(1)?,
                    "projectId": r.get::<_, String>(2)?,
                    "name": r.get::<_, String>(3)?,
                    "description": r.get::<_, String>(4)?,
                    "scopeLabel": r.get::<_, String>(5)?,
                    "approvedOnly": r.get::<_, i64>(6)? == 1,
                    "createdBy": r.get::<_, String>(7)?,
                    "createdAt": r.get::<_, String>(8)?,
                    "hlc": r.get::<_, String>(9)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(mut head) = head else {
        return Ok(None);
    };
    let mut stmt = conn
        .prepare(
            "SELECT case_id, revision_id, revision, scenario_id, title, status \
             FROM case_baseline_items WHERE baseline_id = ?1 ORDER BY scenario_id, case_id",
        )
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![id], |r| {
            Ok(json!({
                "caseId": r.get::<_, String>(0)?,
                "revisionId": r.get::<_, String>(1)?,
                "revision": r.get::<_, i64>(2)?,
                "scenarioId": r.get::<_, String>(3)?,
                "title": r.get::<_, String>(4)?,
                "status": r.get::<_, String>(5)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    head["items"] = Value::Array(items);
    Ok(Some(head))
}

/// Stores a pulled baseline unless its id is already here. Its items point
/// at case revisions that may arrive later: nothing checks them on insert.
pub fn insert_if_absent(conn: &Connection, _user: &str, p: &Value) -> Result<(), String> {
    let s = |k: &str| p.get(k).and_then(Value::as_str);
    let (Some(id), Some(project), Some(name)) = (s("id"), s("projectId"), s("name")) else {
        tracing::warn!("skipped a pulled case_baseline without its required fields");
        return Ok(());
    };
    if let Some(hlc) = s("hlc") {
        crate::oplog::observe_hlc(conn, hlc)?;
    }
    let inserted = conn
        .execute(
            "INSERT OR IGNORE INTO case_baselines (id, workspace_id, project_id, name, description, \
             scope_label, approved_only, created_by, created_at, hlc) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, coalesce(?9, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), \
             coalesce(?10, ''))",
            params![
                id,
                match s("workspaceId") {
                    Some(ws) => ws.to_string(),
                    None => ensure_workspace(conn)?,
                },
                project,
                name,
                s("description").unwrap_or(""),
                s("scopeLabel").unwrap_or(""),
                i64::from(p.get("approvedOnly").and_then(Value::as_bool).unwrap_or(false)),
                s("createdBy").unwrap_or(""),
                s("createdAt"),
                s("hlc"),
            ],
        )
        .map_err(|e| e.to_string())?;
    if inserted == 0 {
        return Ok(());
    }
    for item in p
        .get("items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let t = |k: &str| item.get(k).and_then(Value::as_str);
        let (Some(case_id), Some(revision_id)) = (t("caseId"), t("revisionId")) else {
            continue;
        };
        conn.execute(
            "INSERT OR IGNORE INTO case_baseline_items (baseline_id, case_id, revision_id, revision, \
             scenario_id, title, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                case_id,
                revision_id,
                item.get("revision").and_then(Value::as_i64).unwrap_or(0),
                t("scenarioId").unwrap_or(""),
                t("title").unwrap_or(""),
                t("status").unwrap_or("draft"),
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// The account a baseline syncs with: the owner of its project.
pub fn owner(conn: &Connection, id: &str) -> Result<Option<String>, String> {
    let owner: Option<Option<String>> = conn
        .query_row(
            "SELECT p.owner_id FROM case_baselines b JOIN projects p ON p.id = b.project_id \
             WHERE b.id = ?1",
            params![id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(owner.flatten().filter(|o| !o.is_empty()))
}

/// The baselines of a project the user owns, newest first.
pub(crate) fn list_baselines(
    conn: &Connection,
    project_id: &str,
    user_id: &str,
) -> Result<Vec<BaselineSummary>, String> {
    if !project::owns(conn, project_id, user_id)? {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {SUMMARY_COLS} FROM case_baselines b WHERE b.project_id = ?1 \
             ORDER BY b.created_at DESC, b.name"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], map_summary)
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

/// A baseline with the frozen content of each case; None for another user's
/// or an unknown one.
pub(crate) fn get_baseline(
    conn: &Connection,
    id: &str,
    user_id: &str,
) -> Result<Option<Baseline>, String> {
    let summary = conn
        .query_row(
            &format!(
                "SELECT {SUMMARY_COLS} FROM case_baselines b JOIN projects p ON p.id = b.project_id \
                 WHERE b.id = ?1 AND p.owner_id = ?2 AND p.deleted_at IS NULL"
            ),
            params![id, user_id],
            map_summary,
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(summary) = summary else {
        return Ok(None);
    };
    let mut stmt = conn
        .prepare(
            "SELECT i.case_id, i.revision_id, i.revision, i.scenario_id, i.title, i.status, \
             coalesce(r.version, ''), coalesce(r.priority, ''), coalesce(r.data, '{}') \
             FROM case_baseline_items i LEFT JOIN test_case_revisions r ON r.id = i.revision_id \
             WHERE i.baseline_id = ?1 ORDER BY i.scenario_id",
        )
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![id], |r| {
            let data: String = r.get(8)?;
            Ok(BaselineItem {
                case_id: r.get(0)?,
                revision_id: r.get(1)?,
                revision: r.get(2)?,
                scenario_id: r.get(3)?,
                title: r.get(4)?,
                status: r.get(5)?,
                version: r.get(6)?,
                priority: r.get(7)?,
                data: parse(&data),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(Some(Baseline { summary, items }))
}

/// The project's live cases now, in the shape of a baseline (empty id), to
/// compare a baseline with the current state. Nothing is written.
pub(crate) fn current_state(
    conn: &Connection,
    project_id: &str,
    user_id: &str,
) -> Result<Option<Baseline>, String> {
    if !project::owns(conn, project_id, user_id)? {
        return Ok(None);
    }
    let mut stmt = conn
        .prepare(
            "SELECT id, revision, scenario_id, title, status, version, priority, data \
             FROM test_cases WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY scenario_id",
        )
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![project_id], |r| {
            let data: String = r.get(7)?;
            Ok(BaselineItem {
                case_id: r.get(0)?,
                revision_id: String::new(),
                revision: r.get(1)?,
                scenario_id: r.get(2)?,
                title: r.get(3)?,
                status: r.get(4)?,
                version: r.get(5)?,
                priority: r.get(6)?,
                data: parse(&data),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(Some(Baseline {
        summary: BaselineSummary {
            id: String::new(),
            project_id: project_id.to_string(),
            name: String::new(),
            description: String::new(),
            scope_label: String::new(),
            approved_only: false,
            created_by: user_id.to_string(),
            created_at: String::new(),
            item_count: items.len() as i64,
        },
        items,
    }))
}

#[tauri::command]
pub fn case_baseline_create(
    db: State<Db>,
    input: BaselineInput,
) -> Result<Option<Baseline>, String> {
    let id = db.with_tx(|conn| create_baseline(conn, &input))?;
    db.persist()?;
    db.with_conn(|conn| get_baseline(conn, &id, &input.user_id))
}

#[tauri::command]
pub fn case_baseline_list(
    db: State<Db>,
    project_id: String,
    user_id: String,
) -> Result<Vec<BaselineSummary>, String> {
    db.with_conn(|conn| list_baselines(conn, &project_id, &user_id))
}

#[tauri::command]
pub fn case_baseline_get(
    db: State<Db>,
    id: String,
    user_id: String,
) -> Result<Option<Baseline>, String> {
    db.with_conn(|conn| get_baseline(conn, &id, &user_id))
}

#[tauri::command]
pub fn case_baseline_current(
    db: State<Db>,
    project_id: String,
    user_id: String,
) -> Result<Option<Baseline>, String> {
    db.with_conn(|conn| current_state(conn, &project_id, &user_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::case_review::{review_case, ReviewAction, ReviewInput};
    use crate::test_case;

    const USER: &str = "user-1";
    const OTHER: &str = "user-2";

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        c
    }

    fn project(c: &Connection) -> String {
        let ws = ensure_workspace(c).unwrap();
        let id = Uuid::new_v4().to_string();
        c.execute(
            "INSERT INTO projects (id, workspace_id, owner_id, name, case_id_prefix, case_id_digits, \
             created_by, updated_by, created_at, updated_at, revision) \
             VALUES (?1, ?2, ?3, 'P', 'TC-', 3, ?3, ?3, datetime('now'), datetime('now'), 1)",
            params![id, ws, USER],
        )
        .unwrap();
        id
    }

    fn case_input(p: &str, title: &str) -> test_case::TestCaseInput {
        serde_json::from_value(json!({
            "projectId": p, "title": title, "author": "Ada", "data": {"steps": ["a"]},
            "userId": USER
        }))
        .unwrap()
    }

    fn approve(c: &Connection, id: &str) {
        for action in [ReviewAction::Send, ReviewAction::Approve] {
            review_case(
                c,
                id,
                &ReviewInput {
                    action,
                    comment: None,
                    user_id: USER.into(),
                    user_name: "Ada".into(),
                },
            )
            .unwrap();
        }
    }

    fn input(p: &str, ids: &[&str], approved_only: bool) -> BaselineInput {
        BaselineInput {
            project_id: p.into(),
            name: " Release 2.4 ".into(),
            description: None,
            scope_label: Some("Todos".into()),
            approved_only,
            case_ids: ids.iter().map(|s| s.to_string()).collect(),
            user_id: USER.into(),
        }
    }

    #[test]
    fn a_baseline_stays_frozen_when_its_cases_change() {
        let c = conn();
        let p = project(&c);
        let a = test_case::insert_case(&c, &case_input(&p, "Pay")).unwrap();
        let id = create_baseline(&c, &input(&p, &[&a, &a], false)).unwrap();
        test_case::update_case(&c, &a, &case_input(&p, "Pay later")).unwrap();
        let b = get_baseline(&c, &id, USER).unwrap().unwrap();
        assert_eq!(b.summary.name, "Release 2.4");
        assert_eq!(b.summary.item_count, 1);
        assert_eq!(b.items[0].title, "Pay");
        assert_eq!(b.items[0].revision, 1);
        assert_eq!(b.items[0].data["steps"][0]["text"], "a");
        let now = current_state(&c, &p, USER).unwrap().unwrap();
        assert_eq!(now.items[0].title, "Pay later");
        assert_eq!(now.items[0].revision, 2);
        // The rows cannot be changed.
        assert!(c
            .execute(
                "UPDATE case_baselines SET name = 'x' WHERE id = ?1",
                params![id]
            )
            .is_err());
        assert!(c
            .execute(
                "UPDATE case_baseline_items SET title = 'x' WHERE baseline_id = ?1",
                params![id]
            )
            .is_err());
    }

    #[test]
    fn approved_only_leaves_the_others_out_and_an_empty_baseline_is_refused() {
        let c = conn();
        let p = project(&c);
        let a = test_case::insert_case(&c, &case_input(&p, "A")).unwrap();
        let b = test_case::insert_case(&c, &case_input(&p, "B")).unwrap();
        let err = create_baseline(&c, &input(&p, &[&a, &b], true)).unwrap_err();
        assert!(err.starts_with("baseline-empty"), "{err}");
        approve(&c, &a);
        let id = create_baseline(&c, &input(&p, &[&a, &b, "unknown"], true)).unwrap();
        let base = get_baseline(&c, &id, USER).unwrap().unwrap();
        assert_eq!(base.items.len(), 1);
        assert_eq!(base.items[0].status, "approved");
        assert!(base.summary.approved_only);
    }

    #[test]
    fn a_baseline_syncs_as_an_append_only_document_and_comes_back_the_same() {
        let c = conn();
        let p = project(&c);
        let a = test_case::insert_case(&c, &case_input(&p, "A")).unwrap();
        let id = create_baseline(&c, &input(&p, &[&a], false)).unwrap();
        // Queued for the server, as an append.
        let queued: i64 = c
            .query_row(
                "SELECT count(*) FROM oplog WHERE entity = ?1 AND entity_id = ?2 AND op = 'append'",
                params![ENTITY, id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(queued, 1);
        assert!(crate::sync_class::append_only(ENTITY).is_some());
        let doc = payload(&c, &id).unwrap().unwrap();
        assert_eq!(doc["projectId"], p.as_str());
        assert!(doc["workspaceId"].is_string(), "location for move-project");
        assert_eq!(doc["items"][0]["caseId"], a.as_str());
        assert_eq!(owner(&c, &id).unwrap().as_deref(), Some(USER));

        // Another device pulls it: same baseline, same items.
        let other = conn();
        let ws = ensure_workspace(&other).unwrap();
        other
            .execute(
                "INSERT INTO projects (id, workspace_id, owner_id, name, case_id_prefix, case_id_digits, \
                 created_by, updated_by, created_at, updated_at, revision) \
                 VALUES (?1, ?2, ?3, 'P', 'TC-', 3, ?3, ?3, datetime('now'), datetime('now'), 1)",
                params![p, ws, USER],
            )
            .unwrap();
        insert_if_absent(&other, USER, &doc).unwrap();
        insert_if_absent(&other, USER, &doc).unwrap();
        assert_eq!(payload(&other, &id).unwrap().unwrap(), doc);
    }

    #[test]
    fn baselines_belong_to_the_projects_owner_and_are_audited() {
        let c = conn();
        let p = project(&c);
        let a = test_case::insert_case(&c, &case_input(&p, "A")).unwrap();
        let mut foreign = input(&p, &[&a], false);
        foreign.user_id = OTHER.into();
        assert_eq!(
            create_baseline(&c, &foreign).unwrap_err(),
            "project not found"
        );
        let id = create_baseline(&c, &input(&p, &[&a], false)).unwrap();
        assert!(get_baseline(&c, &id, OTHER).unwrap().is_none());
        assert!(list_baselines(&c, &p, OTHER).unwrap().is_empty());
        assert_eq!(list_baselines(&c, &p, USER).unwrap().len(), 1);
        let events: i64 = c
            .query_row(
                "SELECT count(*) FROM audit_log WHERE entity = 'case_baseline' AND entity_id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(events, 1);
        let mut unnamed = input(&p, &[&a], false);
        unnamed.name = "  ".into();
        assert!(create_baseline(&c, &unnamed)
            .unwrap_err()
            .starts_with("baseline-name-required"));
    }
}
