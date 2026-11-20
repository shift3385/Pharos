//! Findings and thresholds of an execution summary (ING-06, F5b; bocetos
//! §5–§6): what the matrix badge, the status report and the completion report
//! show. From the runs in the summary's scope, the latest run of each tool
//! (a fixed finding is no longer in it): its open findings by severity, the
//! new and triaged ones, the open ones of each linked case with the worst
//! severity, and its thresholds. Computed after `derive::summarize`, so the
//! derivation core and its shared vectors are untouched; the server twin is
//! `findingsSummary` in `server/src/modules/domain/findings.ts`.

use std::collections::{BTreeMap, HashMap};

use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::Value;
#[cfg(test)]
use ts_rs::TS;

use super::{json_of, previous_fingerprints, triage_current, SEVERITIES};
use crate::execution::derive::RunRef;
use crate::runs::err;
use crate::runs::link::{self, Resolver, StoredFacts};

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FindingSeverityCounts {
    pub critical: i64,
    pub high: i64,
    pub medium: i64,
    pub low: i64,
    pub info: i64,
}

impl FindingSeverityCounts {
    fn add(&mut self, severity: &str) {
        match severity {
            "critical" => self.critical += 1,
            "high" => self.high += 1,
            "medium" => self.medium += 1,
            "low" => self.low += 1,
            _ => self.info += 1,
        }
    }
}

/// The latest run of one tool in scope and its findings.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolFindings {
    pub tool: String,
    pub run_id: String,
    pub run_key: String,
    pub open: FindingSeverityCounts,
    /// Whether the tool has a previous run to compare with: without one
    /// (its first import) «new» does not apply and the reports say so
    /// instead of «0 nuevos» (FIX-48).
    pub compared: bool,
    /// Open and not in the previous run of the tool.
    pub new: i64,
    /// With a decision other than «open».
    pub triaged: i64,
    /// axe could not decide («A revisar»): not open.
    pub review: i64,
}

/// The open findings linked to a case.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CaseFindings {
    pub case_id: String,
    pub open: i64,
    /// `critical` | `high` | `medium` | `low` | `info`.
    pub worst: String,
}

/// A threshold that failed in the latest run of its tool.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FailedThreshold {
    pub run_id: String,
    pub run_key: String,
    pub name: String,
    pub aggregation: Option<String>,
    pub scope: Option<String>,
    pub threshold: String,
    pub value: f64,
    pub unit: Option<String>,
    pub case_id: Option<String>,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FindingsSummary {
    /// Open findings by severity, over the tools.
    pub open: FindingSeverityCounts,
    pub new: i64,
    pub triaged: i64,
    pub review: i64,
    pub tools: Vec<ToolFindings>,
    /// Cases with open findings, by case id.
    pub cases: Vec<CaseFindings>,
    pub thresholds_total: i64,
    pub thresholds_passed: i64,
    pub failed_thresholds: Vec<FailedThreshold>,
}

/// A metric with a threshold, as read: name, aggregation, scope, value,
/// unit, threshold, passed and attributes.
type MetricRow = (
    String,
    Option<String>,
    Option<String>,
    f64,
    Option<String>,
    Option<String>,
    bool,
    Option<String>,
);

fn rank(severity: &str) -> usize {
    SEVERITIES
        .iter()
        .position(|s| *s == severity)
        .unwrap_or(SEVERITIES.len())
}

/// The latest run of each tool among `runs` (start, then id).
fn latest_by_tool(runs: &[RunRef]) -> Vec<&RunRef> {
    let mut by_tool: BTreeMap<String, &RunRef> = BTreeMap::new();
    for r in runs {
        let tool = r.source_tool.clone().unwrap_or_default();
        let newer = by_tool.get(&tool).map_or(true, |best| {
            (r.started_at.as_deref(), r.id.as_str())
                > (best.started_at.as_deref(), best.id.as_str())
        });
        if newer {
            by_tool.insert(tool, r);
        }
    }
    by_tool.into_values().collect()
}

/// The case a finding or metric links to, if any (tags or `caseKey`).
fn case_of(resolver: &Resolver, attributes: &Value) -> Option<String> {
    let attrs = if attributes.is_object() {
        attributes.clone()
    } else {
        serde_json::json!({})
    };
    let key = attrs
        .get("caseKey")
        .and_then(Value::as_str)
        .map(str::to_string);
    let stored = StoredFacts::of(&attrs, key.as_deref(), None, Vec::new());
    resolver.case_by_tags(&stored.facts()).ok()
}

/// The findings and thresholds of the summary's runs; None when they have
/// neither.
pub fn of(
    conn: &Connection,
    project_id: &str,
    runs: &[RunRef],
) -> Result<Option<FindingsSummary>, String> {
    let latest = latest_by_tool(runs);
    if latest.is_empty() {
        return Ok(None);
    }
    let resolver = Resolver::for_project(conn, project_id)?;
    let triage = triage_current(conn, project_id)?;
    let mut out = FindingsSummary::default();
    let mut cases: HashMap<String, (i64, String)> = HashMap::new();
    let mut any = false;

    for run in &latest {
        let rows: Vec<(String, String, Option<String>)> = conn
            .prepare(&format!(
                "SELECT x.fingerprint, x.severity, x.attributes FROM findings x
                  WHERE x.run_id = ?1 AND {}",
                link::CURRENT_SHARD
            ))
            .map_err(err)?
            .query_map(params![run.id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(err)?
            .collect::<rusqlite::Result<_>>()
            .map_err(err)?;
        if !rows.is_empty() {
            any = true;
            let previous = previous_fingerprints(conn, &run.id)?;
            let mut tool = ToolFindings {
                tool: run.source_tool.clone().unwrap_or_default(),
                run_id: run.id.clone(),
                run_key: run.run_key.clone(),
                open: FindingSeverityCounts::default(),
                compared: previous.is_some(),
                new: 0,
                triaged: 0,
                review: 0,
            };
            for (fingerprint, severity, attributes) in rows {
                let attributes = json_of(attributes);
                if triage.get(&fingerprint).is_some_and(|t| t.state != "open") {
                    tool.triaged += 1;
                    continue;
                }
                if attributes.get("needsReview").and_then(Value::as_bool) == Some(true) {
                    tool.review += 1;
                    continue;
                }
                tool.open.add(&severity);
                out.open.add(&severity);
                if previous
                    .as_ref()
                    .is_some_and(|set| !set.contains(&fingerprint))
                {
                    tool.new += 1;
                }
                if let Some(case) = case_of(&resolver, &attributes) {
                    let entry = cases.entry(case).or_insert((0, severity.clone()));
                    entry.0 += 1;
                    if rank(&severity) < rank(&entry.1) {
                        entry.1 = severity.clone();
                    }
                }
            }
            out.new += tool.new;
            out.triaged += tool.triaged;
            out.review += tool.review;
            out.tools.push(tool);
        }

        let metrics: Vec<MetricRow> = conn
            .prepare(&format!(
                "SELECT x.name, x.aggregation, x.scope, x.value, x.unit, x.threshold, x.passed,
                        x.attributes
                   FROM metrics x WHERE x.run_id = ?1 AND x.passed IS NOT NULL AND {}
                  ORDER BY x.name, coalesce(x.scope, ''), coalesce(x.aggregation, ''), x.id",
                link::CURRENT_SHARD
            ))
            .map_err(err)?
            .query_map(params![run.id], |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                ))
            })
            .map_err(err)?
            .collect::<rusqlite::Result<_>>()
            .map_err(err)?;
        for (name, aggregation, scope, value, unit, threshold, passed, attributes) in metrics {
            any = true;
            out.thresholds_total += 1;
            if passed {
                out.thresholds_passed += 1;
                continue;
            }
            out.failed_thresholds.push(FailedThreshold {
                run_id: run.id.clone(),
                run_key: run.run_key.clone(),
                name,
                aggregation,
                scope,
                threshold: threshold.unwrap_or_default(),
                value,
                unit,
                case_id: case_of(&resolver, &json_of(attributes)),
            });
        }
    }
    if !any {
        return Ok(None);
    }
    let mut cases: Vec<CaseFindings> = cases
        .into_iter()
        .map(|(case_id, (open, worst))| CaseFindings {
            case_id,
            open,
            worst,
        })
        .collect();
    cases.sort_by(|a, b| a.case_id.cmp(&b.case_id));
    out.cases = cases;
    Ok(Some(out))
}
