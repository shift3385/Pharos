//! The execution derivation's loader and commands (step 10, EJE-04/EJE-03;
//! contract v1 in `derive.rs`). One read of a project: live runs, results
//! that are not from a superseded shard, the link of each (a manual result's
//! stored link; an imported one's from `runs::link::Resolver`, the only path
//! to it), live cases with their current revision, requirements with their
//! risk, defects with the cases they reach (`defects::list_defects`), the
//! cycles and their items, and the plan's closure criteria. Then the pure
//! core. Reads only: nothing is written, nothing is audited.

pub mod derive;
#[cfg(test)]
mod tests;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use tauri::State;

use crate::db::Db;
use crate::runs::link::{self, Resolver, StoredFacts};
use derive::{
    AttemptData, CaseData, CriterionData, CycleData, CycleItemData, DefectData, ExecutionFilter,
    ExecutionSummary, HomeMetrics, HomeRequest, ProjectData, RequirementData, RunData,
};

fn err(e: rusqlite::Error) -> String {
    e.to_string()
}

fn json(s: Option<String>) -> Value {
    s.and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null)
}

fn strings(v: &Value) -> Vec<String> {
    v.as_array()
        .into_iter()
        .flatten()
        .filter_map(|x| x.as_str().map(String::from))
        .collect()
}

fn rows<T>(
    conn: &Connection,
    sql: &str,
    project_id: &str,
    f: impl FnMut(&rusqlite::Row) -> rusqlite::Result<T>,
) -> Result<Vec<T>, String> {
    let mut stmt = conn.prepare(sql).map_err(err)?;
    let out = stmt
        .query_map(params![project_id], f)
        .map_err(err)?
        .collect::<rusqlite::Result<Vec<T>>>()
        .map_err(err);
    out
}

/// Everything the derivation reads of a project the user owns; None if the
/// project is not theirs (or does not exist).
pub(crate) fn load_project(
    conn: &Connection,
    project_id: &str,
    user: &str,
) -> Result<Option<ProjectData>, String> {
    if !crate::project::owns(conn, project_id, user)? {
        return Ok(None);
    }
    let runs = rows(
        conn,
        "SELECT id, run_key, title, trigger, source_tool, status, started_at, created_at,
                cycle_id, test_plan_id, configuration_id, build, environment
           FROM runs WHERE project_id = ?1 AND deleted_at IS NULL",
        project_id,
        |r| {
            Ok(RunData {
                id: r.get(0)?,
                run_key: r.get(1)?,
                title: r.get(2)?,
                trigger: r.get(3)?,
                source_tool: r.get(4)?,
                status: r.get(5)?,
                started_at: r.get(6)?,
                created_at: r.get(7)?,
                cycle_id: r.get(8)?,
                test_plan_id: r.get(9)?,
                configuration_id: r.get(10)?,
                build: r.get(11)?,
                environment: r.get(12)?,
            })
        },
    )?;
    let attempts = load_attempts(conn, project_id)?;
    let cases = rows(
        conn,
        "SELECT id, scenario_id, title, status, priority, data, revision
           FROM test_cases WHERE project_id = ?1 AND deleted_at IS NULL",
        project_id,
        |r| {
            let data = json(r.get(5)?);
            Ok(CaseData {
                id: r.get(0)?,
                scenario_id: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                title: r.get(2)?,
                status: r.get(3)?,
                priority: r.get(4)?,
                requirement_keys: strings(&data["requirementKeys"]),
                revision: r.get(6)?,
            })
        },
    )?;
    let requirements = rows(
        conn,
        "SELECT id, requirement_key, title, priority, risk_likelihood, risk_impact
           FROM requirements WHERE project_id = ?1 AND deleted_at IS NULL",
        project_id,
        |r| {
            Ok(RequirementData {
                id: r.get(0)?,
                requirement_key: r.get(1)?,
                title: r.get(2)?,
                priority: r.get(3)?,
                risk_likelihood: r.get(4)?,
                risk_impact: r.get(5)?,
            })
        },
    )?;
    let defects = crate::defects::list_defects(conn, project_id, user)?
        .into_iter()
        .map(|d| DefectData {
            requirement_ids: d
                .links
                .iter()
                .filter(|l| l.target_kind == "requirement")
                .map(|l| l.target_id.clone())
                .collect(),
            id: d.id,
            defect_key: d.defect_key,
            severity: d.severity,
            status: d.status,
            case_ids: d.case_ids,
        })
        .collect();
    let cycles = rows(
        conn,
        "SELECT id, test_plan_id, configuration_ids FROM test_cycles
          WHERE project_id = ?1 AND deleted_at IS NULL",
        project_id,
        |r| {
            Ok(CycleData {
                id: r.get(0)?,
                test_plan_id: r.get(1)?,
                configuration_ids: strings(&json(r.get(2)?)),
            })
        },
    )?;
    let cycle_items = rows(
        conn,
        "SELECT i.id, i.cycle_id, i.test_case_id, i.flow_id, i.example_row_id
           FROM test_cycle_items i
           JOIN test_cycles c ON c.id = i.cycle_id AND c.deleted_at IS NULL
          WHERE c.project_id = ?1 AND i.deleted_at IS NULL
          ORDER BY i.cycle_id, i.position, i.rowid",
        project_id,
        |r| {
            Ok(CycleItemData {
                id: r.get(0)?,
                cycle_id: r.get(1)?,
                case_id: r.get(2)?,
                flow_id: r.get(3)?,
                row_id: r.get(4)?,
            })
        },
    )?;
    let plan: Option<Value> = conn
        .query_row(
            "SELECT data FROM test_plans WHERE project_id = ?1 AND deleted_at IS NULL
              ORDER BY updated_at DESC LIMIT 1",
            params![project_id],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(err)?
        .map(json);
    let plan_criteria = plan.map(|p| {
        p.get("closureCriteria")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(|c| CriterionData {
                criterion: c["criterion"].as_str().unwrap_or_default().to_string(),
                metric: c["metric"].as_str().unwrap_or_default().to_string(),
            })
            .collect()
    });
    Ok(Some(ProjectData {
        project_id: project_id.to_string(),
        runs,
        attempts,
        cases,
        requirements,
        defects,
        cycles,
        cycle_items,
        plan_criteria,
    }))
}

/// The project's results as the derivation reads them, linked. Superseded
/// shards are left out (`link::CURRENT_SHARD`).
fn load_attempts(conn: &Connection, project_id: &str) -> Result<Vec<AttemptData>, String> {
    struct Raw {
        a: AttemptData,
        run_configuration: Option<String>,
        attributes: Value,
        case_key: Option<String>,
        example_row: Option<i64>,
    }
    let raw = rows(
        conn,
        &format!(
            "SELECT x.id, x.run_id, x.test_key, x.configuration_label, x.attempt, x.status,
                    x.started_at, x.finished_at, s.imported_at, x.hlc, x.shard_id IS NOT NULL,
                    r.configuration_id, x.configuration_id, x.test_case_id, x.flow_id,
                    x.example_row_id, x.test_case_revision_id, x.case_revision, x.attributes,
                    x.case_key, x.example_row
               FROM results x
               JOIN runs r ON r.id = x.run_id AND r.deleted_at IS NULL
               LEFT JOIN run_shards s ON s.id = x.shard_id
              WHERE r.project_id = ?1 AND {}",
            link::CURRENT_SHARD
        ),
        project_id,
        |r| {
            let run_configuration: Option<String> = r.get(11)?;
            let own: Option<String> = r.get(12)?;
            let attributes = json(r.get(18)?);
            Ok(Raw {
                a: AttemptData {
                    id: r.get(0)?,
                    run_id: r.get(1)?,
                    test_key: r.get(2)?,
                    configuration_label: r.get(3)?,
                    attempt: r.get(4)?,
                    status: r.get(5)?,
                    started_at: r.get(6)?,
                    finished_at: r.get(7)?,
                    shard_imported_at: r.get(8)?,
                    hlc: r.get(9)?,
                    imported: r.get(10)?,
                    declared_flaky: attributes.get("flaky").and_then(Value::as_bool) == Some(true),
                    configuration_id: run_configuration.clone().or(own),
                    case_id: r.get(13)?,
                    flow_id: r.get(14)?,
                    row_id: r.get(15)?,
                    revision_id: r.get(16)?,
                    case_revision: r.get(17)?,
                },
                run_configuration,
                attributes,
                case_key: r.get(19)?,
                example_row: r.get(20)?,
            })
        },
    )?;
    let mut resolver: Option<Resolver> = None;
    let mut out = Vec::with_capacity(raw.len());
    for mut x in raw {
        if x.a.imported {
            if resolver.is_none() {
                resolver = Some(Resolver::for_project(conn, project_id)?);
            }
            let attributes = if x.attributes.is_object() {
                x.attributes
            } else {
                serde_json::json!({})
            };
            let stored = StoredFacts::of(
                &attributes,
                x.case_key.as_deref(),
                x.example_row,
                Vec::new(),
            )
            .with_label(x.a.configuration_label.as_deref());
            let l = resolver.as_mut().expect("set above").resolve(
                &x.a.run_id,
                &x.a.test_key,
                &stored.facts(),
                true,
            )?;
            x.a.case_id = l.case_id;
            x.a.flow_id = l.flow_id;
            x.a.row_id = l.example_row_id;
            x.a.revision_id = l.revision_id;
            x.a.case_revision = l.case_revision;
            x.a.configuration_id = x.run_configuration.or(l.configuration_id);
        }
        out.push(x.a);
    }
    Ok(out)
}

/// The summary of one project; None if it is not the user's.
pub(crate) fn execution_summary_of(
    conn: &Connection,
    filter: &ExecutionFilter,
    user: &str,
) -> Result<Option<ExecutionSummary>, String> {
    Ok(load_project(conn, &filter.project_id, user)?.map(|d| derive::summarize(&d, filter)))
}

// Its production caller is RED-W6's `home_metrics` command.
#[cfg_attr(not(test), allow(dead_code))]
/// The Home metrics (RED-W6's `home_metrics` entry points call this): the
/// requested projects of the user, or all of them, most recently updated
/// first.
pub(crate) fn home_metrics(
    conn: &Connection,
    user: &str,
    request: &HomeRequest,
) -> Result<HomeMetrics, String> {
    let ids: Vec<String> = match &request.project_ids {
        Some(ids) => ids.clone(),
        None => {
            let mut stmt = conn
                .prepare(
                    "SELECT id FROM projects WHERE owner_id = ?1 AND deleted_at IS NULL
                      ORDER BY updated_at DESC, rowid DESC",
                )
                .map_err(err)?;
            let ids = stmt
                .query_map(params![user], |r| r.get(0))
                .map_err(err)?
                .collect::<rusqlite::Result<Vec<String>>>()
                .map_err(err)?;
            ids
        }
    };
    let mut projects = Vec::new();
    for id in ids {
        if let Some(d) = load_project(conn, &id, user)? {
            projects.push(d);
        }
    }
    Ok(derive::home(&projects, request))
}

#[tauri::command]
pub fn execution_summary(
    db: State<Db>,
    filter: ExecutionFilter,
    user_id: String,
) -> Result<Option<ExecutionSummary>, String> {
    db.with_conn(|conn| execution_summary_of(conn, &filter, &user_id))
}
