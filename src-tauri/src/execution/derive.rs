//! The execution derivation (step 10, EJE-04/EJE-03; contract v1): what the
//! matrix, the status report and the Home metrics (RED-W6) read of the runs.
//! Pure: no SQL, no clock, no time zone. The loader (`execution.rs`) reads the
//! project once and hands it here; the server's web API has a TS twin
//! (`server/src/modules/domain/execution-summary.ts`) and both are checked
//! against `tests/fixtures/execution-vectors.json`.
//!
//! The rules (R1–R12) are written in `docs/adr/0013-campos-del-run.md`,
//! «Implementación (paso 10)». In short:
//! - attempts in scope: live runs, current shards (the loader), the filters
//!   and the period on the attempt time (`runs::derive`'s time rule);
//! - the final of each test `(run, test_key, configuration_label)`, flaky as
//!   `runs::derive` says it;
//! - a target `(case, flow, row)` and a case take the run of their latest
//!   final and, within it, the worst final (design §4 «Matriz»);
//! - `retest`: the case failed and a defect reaching it is `fixed`/`retest`;
//! - every tie is broken by id, so every side derives the same thing whatever
//!   order it read the rows in.
// The Home rollup (`home` and its types) has its production caller in
// RED-W6's `home_metrics` command; until it lands only the tests call it.
#![cfg_attr(not(test), allow(dead_code))]

use std::cmp::Ordering;
use std::collections::{BTreeMap, HashMap, HashSet};

use serde::{Deserialize, Serialize};
#[cfg(test)]
use ts_rs::TS;

use crate::cycles::progress;
use crate::runs::derive::{self, Attempt};

pub const CONTRACT_VERSION: u8 = 1;
pub const NOT_RUN: &str = "not_run";
pub const RETEST: &str = "retest";

// ---- input ---------------------------------------------------------------------

/// A live run of the project.
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RunData {
    pub id: String,
    pub run_key: String,
    pub title: String,
    pub trigger: String,
    pub source_tool: Option<String>,
    pub status: String,
    pub started_at: Option<String>,
    pub created_at: String,
    pub cycle_id: Option<String>,
    pub test_plan_id: Option<String>,
    pub configuration_id: Option<String>,
    pub build: Option<String>,
    pub environment: Option<String>,
}

/// One attempt, already linked (a manual result's stored link, an imported
/// one's from the resolver) and never from a superseded shard.
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AttemptData {
    pub id: String,
    pub run_id: String,
    pub test_key: String,
    pub configuration_label: Option<String>,
    pub attempt: i64,
    pub status: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub shard_imported_at: Option<String>,
    pub hlc: String,
    pub declared_flaky: bool,
    pub imported: bool,
    /// The run's configuration, else the result's (manual) or the one its
    /// label resolves to (imported).
    pub configuration_id: Option<String>,
    pub case_id: Option<String>,
    pub flow_id: Option<String>,
    pub row_id: Option<String>,
    pub revision_id: Option<String>,
    /// Fingerprint of the executable content of the executed revision (steps,
    /// preconditions, background, flows, examples…; the loader's
    /// `exec_fingerprint`), when that revision is known on this side.
    pub exec_fingerprint: Option<String>,
}

/// A live case of the project (obsolete ones included).
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CaseData {
    pub id: String,
    pub scenario_id: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub requirement_keys: Vec<String>,
    /// Fingerprint of the executable content of the case now. A result is
    /// outdated when its own differs: a status, priority, title or key change
    /// never makes it so.
    pub exec_fingerprint: Option<String>,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RequirementData {
    pub id: String,
    pub requirement_key: String,
    pub title: String,
    pub priority: String,
    pub risk_likelihood: Option<i64>,
    pub risk_impact: Option<i64>,
}

/// A live defect with the cases it reaches (direct links and the case of
/// each linked result) and the requirements it is linked to.
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DefectData {
    pub id: String,
    pub defect_key: String,
    pub severity: String,
    pub status: String,
    pub case_ids: Vec<String>,
    pub requirement_ids: Vec<String>,
    /// The run it was found in: «found in the scope» (DOC-06).
    pub found_in_run_id: Option<String>,
    pub created_at: Option<String>,
    /// `data.lifecycle.fixedAt`: the first time it reached `fixed`.
    pub fixed_at: Option<String>,
    /// `data.lifecycle.reopens`: times it went back to `open` from `retest`
    /// or `closed`.
    pub reopens: i64,
    /// `data.escaped`: found outside the tests (DOC-06, D4).
    pub escaped: bool,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CycleData {
    pub id: String,
    pub test_plan_id: Option<String>,
    pub configuration_ids: Vec<String>,
    pub cycle_key: String,
    pub title: String,
    pub status: String,
    /// The latest of `data.closures` (DOC-02), if it was ever closed.
    pub closure: Option<CycleClosure>,
}

/// A live cycle item, in its cycle's order.
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CycleItemData {
    pub id: String,
    pub cycle_id: String,
    pub case_id: String,
    pub flow_id: Option<String>,
    pub row_id: Option<String>,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CriterionData {
    pub criterion: String,
    pub metric: String,
    /// The plan metric that measures it (PLN-06 `data.metrics[].id`).
    pub metric_id: Option<String>,
    /// Mandatory (None, the default) or advisory (false) (DOC-02, D2).
    pub blocking: Option<bool>,
}

/// A plan metric (PLN-06 `data.metrics[]`); kind None = judged by hand.
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PlanMetricData {
    pub id: String,
    pub kind: Option<String>,
    pub op: String,
    pub target: Option<f64>,
}

/// Everything the derivation reads of one project.
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ProjectData {
    pub project_id: String,
    pub runs: Vec<RunData>,
    pub attempts: Vec<AttemptData>,
    pub cases: Vec<CaseData>,
    pub requirements: Vec<RequirementData>,
    pub defects: Vec<DefectData>,
    pub cycles: Vec<CycleData>,
    pub cycle_items: Vec<CycleItemData>,
    /// The project plan's `closureCriteria` (raw); None without a plan.
    pub plan_criteria: Option<Vec<CriterionData>>,
    /// The project plan's `metrics` (PLN-06); None without a plan.
    pub plan_metrics: Option<Vec<PlanMetricData>>,
}

#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ExecutionFilter {
    pub project_id: String,
    pub cycle_id: Option<String>,
    pub test_plan_id: Option<String>,
    pub configuration_id: Option<String>,
    pub build: Option<String>,
    pub environment: Option<String>,
    /// Epoch ms, inclusive, on the attempt time.
    pub from: Option<i64>,
    /// Epoch ms, exclusive.
    pub to: Option<i64>,
    /// Local midnights (epoch ms, ascending) for `daily`.
    pub day_starts: Option<Vec<i64>>,
}

impl ExecutionFilter {
    /// Trimmed, empty → None.
    pub fn normalized(&self) -> Self {
        let t = |v: &Option<String>| {
            v.as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from)
        };
        ExecutionFilter {
            project_id: self.project_id.clone(),
            cycle_id: t(&self.cycle_id),
            test_plan_id: t(&self.test_plan_id),
            configuration_id: t(&self.configuration_id),
            build: t(&self.build),
            environment: t(&self.environment),
            from: self.from,
            to: self.to,
            day_starts: self.day_starts.clone(),
        }
    }
}

#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct HomeWindow {
    pub id: String,
    pub from_index: usize,
}

#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct HomeRequest {
    pub project_ids: Option<Vec<String>>,
    pub day_starts: Vec<i64>,
    pub now: i64,
    pub windows: Vec<HomeWindow>,
    pub queue_limit: Option<usize>,
}

// ---- output --------------------------------------------------------------------

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StatusCounts {
    pub passed: i64,
    pub failed: i64,
    pub blocked: i64,
    pub skipped: i64,
    pub other: i64,
    pub not_run: i64,
    pub retest: i64,
}

impl StatusCounts {
    fn count(&mut self, status: &str) {
        match status {
            "passed" => self.passed += 1,
            "failed" => self.failed += 1,
            "blocked" => self.blocked += 1,
            "skipped" => self.skipped += 1,
            NOT_RUN => self.not_run += 1,
            RETEST => self.retest += 1,
            _ => self.other += 1,
        }
    }
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionProgress {
    #[serde(flatten)]
    pub counts: StatusCounts,
    pub total: i64,
    pub executed: i64,
}

impl ExecutionProgress {
    fn count(&mut self, status: &str) {
        self.counts.count(status);
        self.total += 1;
        if status != NOT_RUN {
            self.executed += 1;
        }
    }
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LastResult {
    pub result_id: String,
    pub run_id: String,
    pub run_key: String,
    pub run_title: String,
    pub trigger: String,
    pub source_tool: Option<String>,
    /// manual | imported
    pub origin: String,
    pub at: Option<String>,
    pub status: String,
    pub configuration_label: Option<String>,
    pub flaky: bool,
    pub revision_id: Option<String>,
    pub stale: bool,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CaseExecution {
    pub case_id: String,
    pub scenario_id: String,
    pub title: String,
    pub priority: String,
    pub case_status: String,
    pub requirement_keys: Vec<String>,
    pub status: String,
    pub last: Option<LastResult>,
    pub flow_id: Option<String>,
    pub row_id: Option<String>,
    pub defect_ids: Vec<String>,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TargetExecution {
    pub case_id: String,
    pub flow_id: Option<String>,
    pub row_id: Option<String>,
    pub status: String,
    pub last: LastResult,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RequirementExecution {
    pub requirement_id: String,
    pub requirement_key: String,
    pub title: String,
    pub priority: String,
    pub risk_likelihood: Option<i64>,
    pub risk_impact: Option<i64>,
    pub risk_level: Option<i64>,
    /// high | medium | low | unassessed
    pub risk_band: String,
    pub covered: bool,
    /// Linked live cases that are not obsolete (what covers it; the cases
    /// `executed_cases` counts).
    pub case_ids: Vec<String>,
    pub executed_cases: i64,
    pub status: String,
    pub defect_ids: Vec<String>,
    pub in_scope: bool,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RiskCoverage {
    pub requirements: i64,
    pub covered: i64,
    pub executed: i64,
    pub passed: i64,
    pub failed: i64,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CoverageByRisk {
    pub high: RiskCoverage,
    pub medium: RiskCoverage,
    pub low: RiskCoverage,
    pub unassessed: RiskCoverage,
}

impl CoverageByRisk {
    fn band(&mut self, band: &str) -> &mut RiskCoverage {
        match band {
            "high" => &mut self.high,
            "medium" => &mut self.medium,
            "low" => &mut self.low,
            _ => &mut self.unassessed,
        }
    }
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CoverageSummary {
    pub requirements: i64,
    pub covered: i64,
    pub coverage_ratio: Option<f64>,
    pub executed: i64,
    pub passed: i64,
    pub by_risk: CoverageByRisk,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SeverityCount {
    pub total: i64,
    pub open: i64,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SeverityCounts {
    pub critical: SeverityCount,
    pub major: SeverityCount,
    pub minor: SeverityCount,
    pub trivial: SeverityCount,
}

impl SeverityCounts {
    fn get(&mut self, severity: &str) -> Option<&mut SeverityCount> {
        match severity {
            "critical" => Some(&mut self.critical),
            "major" => Some(&mut self.major),
            "minor" => Some(&mut self.minor),
            "trivial" => Some(&mut self.trivial),
            _ => None,
        }
    }
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SeverityTotals {
    pub critical: i64,
    pub major: i64,
    pub minor: i64,
    pub trivial: i64,
}

impl SeverityTotals {
    fn get(&mut self, severity: &str) -> Option<&mut i64> {
        match severity {
            "critical" => Some(&mut self.critical),
            "major" => Some(&mut self.major),
            "minor" => Some(&mut self.minor),
            "trivial" => Some(&mut self.trivial),
            _ => None,
        }
    }
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DefectSummary {
    pub total: i64,
    pub open: i64,
    pub by_severity: SeverityCounts,
    pub open_by_severity: SeverityTotals,
    pub by_status: BTreeMap<String, i64>,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExitCriterion {
    pub index: Option<usize>,
    pub criterion: String,
    pub metric: String,
    /// One of `METRIC_KINDS`; None = not machine-readable (judged by hand).
    pub kind: Option<String>,
    pub op: Option<String>,
    pub target: Option<f64>,
    pub value: Option<f64>,
    pub met: Option<bool>,
    /// Mandatory: it decides the gate and asks for a justification when it
    /// fails (DOC-02, D2). Advisory criteria are shown only.
    pub blocking: bool,
}

/// Every metric of the catalog (DOC-06), one value per kind; None when
/// there is nothing to measure. Percentages are 0–100; `defectDensity` is
/// per 100 executed cases; `fixTime` is in days.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Deserialize, Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct MetricValues {
    pub executed: Option<f64>,
    pub pass_rate: Option<f64>,
    pub critical_defects: Option<f64>,
    pub coverage: Option<f64>,
    pub defect_density: Option<f64>,
    pub escaped_defects: Option<f64>,
    pub fix_time: Option<f64>,
    pub reopen_rate: Option<f64>,
    pub flaky_rate: Option<f64>,
}

impl MetricValues {
    pub fn get(&self, kind: &str) -> Option<f64> {
        match kind {
            "executed" => self.executed,
            "passRate" => self.pass_rate,
            "criticalDefects" => self.critical_defects,
            "coverage" => self.coverage,
            "defectDensity" => self.defect_density,
            "escapedDefects" => self.escaped_defects,
            "fixTime" => self.fix_time,
            "reopenRate" => self.reopen_rate,
            "flakyRate" => self.flaky_rate,
            _ => None,
        }
    }
}

/// The scope's metrics (DOC-06) and the counts behind them.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Deserialize, Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct CycleMetrics {
    pub values: MetricValues,
    /// Cases with a final result (the density's and flakiness' base).
    pub executed_cases: i64,
    /// Defects found in the scope's runs (escapes apart).
    pub defects_found: i64,
    pub defects_fixed: i64,
    /// Found, never fixed yet: outside the time to fix.
    pub defects_unfixed: i64,
    pub defects_reopened: i64,
    /// escaped / (escaped + found), 0–100; shown, never a criterion.
    pub escape_rate: Option<f64>,
}

/// A criterion as the gate recorded it at closing (DOC-02).
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Deserialize, Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ClosureCriterion {
    pub index: Option<usize>,
    pub criterion: String,
    pub metric: String,
    pub kind: Option<String>,
    pub op: Option<String>,
    pub target: Option<f64>,
    pub value: Option<f64>,
    pub blocking: bool,
    /// met | notMet | noData | manual
    pub state: String,
    /// A manual criterion's mark.
    pub manual_met: Option<bool>,
    pub justification: Option<String>,
}

/// One closing of a cycle (DOC-02): the gate's decision with the figures
/// frozen as they were. `test_cycles.data.closures[]`, newest last.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Deserialize, Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct CycleClosure {
    pub closed_at: String,
    pub closed_by: String,
    /// go | goWithRisks | noGo
    pub verdict: String,
    pub plan_id: Option<String>,
    pub criteria: Vec<ClosureCriterion>,
    pub metrics: CycleMetrics,
}

/// One cycle of the trend on Inicio (DOC-06): a closed cycle's frozen
/// figures (escapes live: they arrive after the closing), or the active
/// cycle's live ones.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CycleTrendPoint {
    pub cycle_id: String,
    pub cycle_key: String,
    pub title: String,
    /// closed | active
    pub status: String,
    pub closed_at: Option<String>,
    pub verdict: Option<String>,
    pub values: MetricValues,
}

/// A measurable objective of the plan (a metric with a kind).
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MetricObjective {
    pub kind: String,
    pub op: String,
    pub target: f64,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DailyCount {
    pub day_start: i64,
    pub passed: i64,
    pub failed: i64,
    pub blocked: i64,
    pub skipped: i64,
    pub other: i64,
    pub total: i64,
    pub manual: i64,
    pub imported: i64,
}

impl DailyCount {
    fn add(&mut self, a: &AttemptData) {
        match a.status.as_str() {
            "passed" => self.passed += 1,
            "failed" => self.failed += 1,
            "blocked" => self.blocked += 1,
            "skipped" => self.skipped += 1,
            _ => self.other += 1,
        }
        self.total += 1;
        if a.imported {
            self.imported += 1;
        } else {
            self.manual += 1;
        }
    }
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunRef {
    pub id: String,
    pub run_key: String,
    pub title: String,
    pub trigger: String,
    pub source_tool: Option<String>,
    pub status: String,
    pub started_at: Option<String>,
    pub cycle_id: Option<String>,
    pub configuration_id: Option<String>,
    pub build: Option<String>,
    pub environment: Option<String>,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FilterOptions {
    pub builds: Vec<String>,
    pub environments: Vec<String>,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionSummary {
    #[cfg_attr(test, ts(type = "1"))]
    pub contract_version: u8,
    pub project_id: String,
    pub filter: ExecutionFilter,
    pub progress: ExecutionProgress,
    /// case | cell
    pub progress_unit: String,
    pub pass_rate: Option<f64>,
    pub last_executed_at: Option<String>,
    pub cases: Vec<CaseExecution>,
    pub targets: Vec<TargetExecution>,
    pub requirements: Vec<RequirementExecution>,
    pub coverage: CoverageSummary,
    pub defects: DefectSummary,
    pub exit_criteria: Vec<ExitCriterion>,
    pub metrics: CycleMetrics,
    /// The cycle's latest closing, when the scope is a cycle that has one.
    pub closure: Option<CycleClosure>,
    /// With a cycle scope, the closed cycle before it (the one closed last
    /// before its closing, or before now if it is open), to compare with.
    pub previous: Option<CycleTrendPoint>,
    pub daily: Vec<DailyCount>,
    pub undated: i64,
    pub runs: Vec<RunRef>,
    pub options: FilterOptions,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowCounts {
    /// By case (R8, amended by NC-029): a case with finals in the window
    /// counts once, with the progress rule (`decide`: the worst status of
    /// its latest run, so it passes only if every target passes).
    #[serde(flatten)]
    pub counts: StatusCounts,
    pub executed: i64,
    /// passed / executed cases; None without executed cases.
    pub pass_rate: Option<f64>,
    /// Tests without a case with a final in the window: outside the rate,
    /// shown apart («Además, N tests sin vincular»).
    pub unlinked: i64,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QueueRef {
    pub case_id: String,
    pub scenario_id: String,
    pub title: String,
    pub priority: String,
    pub flow_id: Option<String>,
    pub row_id: Option<String>,
    pub last_at: Option<String>,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QueueCounts {
    pub not_run: i64,
    pub blocked: i64,
    pub retest: i64,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HomeQueue {
    pub not_run: Vec<QueueRef>,
    pub blocked: Vec<QueueRef>,
    pub retest: Vec<QueueRef>,
    pub counts: QueueCounts,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HomeDefects {
    pub open: i64,
    pub open_by_severity: SeverityTotals,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HomeProject {
    pub project_id: String,
    pub counts: ExecutionProgress,
    pub last_executed_at: Option<String>,
    pub defects: HomeDefects,
    pub coverage: Option<f64>,
    pub exit_criteria: Vec<ExitCriterion>,
    pub queue: HomeQueue,
    /// The last closed cycles (oldest first, at most `TREND_CYCLES`) and
    /// the active one (DOC-06).
    pub trend: Vec<CycleTrendPoint>,
    /// The plan's measurable objectives: the trend's target lines.
    pub objectives: Vec<MetricObjective>,
}

#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HomeMetrics {
    #[cfg_attr(test, ts(type = "1"))]
    pub contract_version: u8,
    pub daily: Vec<DailyCount>,
    pub undated: i64,
    pub windows: BTreeMap<String, WindowCounts>,
    pub projects: Vec<HomeProject>,
}

// ---- helpers -------------------------------------------------------------------

/// Natural order of keys (`ATS_2` before `ATS_10`): runs of ASCII digits
/// compare by value, everything else by code unit. The TS twin has the same
/// function (never `localeCompare`, which depends on the locale).
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    let (mut i, mut j) = (0, 0);
    while i < a.len() && j < b.len() {
        if a[i].is_ascii_digit() && b[j].is_ascii_digit() {
            let (si, sj) = (i, j);
            while i < a.len() && a[i].is_ascii_digit() {
                i += 1;
            }
            while j < b.len() && b[j].is_ascii_digit() {
                j += 1;
            }
            let x = trim_zeros(&a[si..i]);
            let y = trim_zeros(&b[sj..j]);
            let o = x.len().cmp(&y.len()).then_with(|| x.cmp(y));
            if o != Ordering::Equal {
                return o;
            }
        } else {
            if a[i] != b[j] {
                return a[i].cmp(&b[j]);
            }
            i += 1;
            j += 1;
        }
    }
    (a.len() - i).cmp(&(b.len() - j)).then_with(|| a.cmp(b))
}

fn trim_zeros(d: &[u8]) -> &[u8] {
    let n = d.iter().take_while(|c| **c == b'0').count();
    &d[n.min(d.len().saturating_sub(1))..]
}

fn attempt_of(a: &AttemptData) -> Attempt<'_> {
    Attempt {
        id: &a.id,
        run_id: &a.run_id,
        test_key: &a.test_key,
        configuration_label: a.configuration_label.as_deref(),
        attempt: a.attempt,
        status: &a.status,
        started_at: a.started_at.as_deref(),
        finished_at: a.finished_at.as_deref(),
        shard_imported_at: a.shard_imported_at.as_deref(),
        hlc: &a.hlc,
        declared_flaky: a.declared_flaky,
    }
}

/// The time of an attempt (`runs::derive`'s rule) in ms and as stored.
fn time_of(a: &AttemptData) -> Option<(i64, &str)> {
    [&a.finished_at, &a.started_at, &a.shard_imported_at]
        .into_iter()
        .flatten()
        .find_map(|s| derive::instant_ms(s).map(|ms| (ms, s.as_str())))
}

/// The total order of attempts: time, attempt, HLC, then the id.
fn cmp(a: &AttemptData, b: &AttemptData) -> Ordering {
    derive::cmp_attempts(&attempt_of(a), &attempt_of(b)).then_with(|| a.id.cmp(&b.id))
}

type TestKey<'a> = (&'a str, &'a str, &'a str);
/** A target `(case, flow, row)`. */
type TargetKey<'a> = (&'a str, Option<&'a str>, Option<&'a str>);

fn test_of(a: &AttemptData) -> TestKey<'_> {
    (
        &a.run_id,
        &a.test_key,
        a.configuration_label.as_deref().unwrap_or(""),
    )
}

/// The final attempt of each test, and the flaky tests (`runs::derive`'s
/// rule, with the id as the last tie-break).
fn finals<'a>(attempts: &[&'a AttemptData]) -> (Vec<&'a AttemptData>, HashSet<TestKey<'a>>) {
    let mut last: HashMap<TestKey, &AttemptData> = HashMap::new();
    let mut failed: HashMap<TestKey, Vec<&str>> = HashMap::new();
    for a in attempts {
        let k = test_of(a);
        last.entry(k)
            .and_modify(|cur| {
                if cmp(a, cur).is_gt() {
                    *cur = a;
                }
            })
            .or_insert(a);
        if a.status == "failed" {
            failed.entry(k).or_default().push(&a.id);
        }
    }
    let mut flaky = HashSet::new();
    for (k, a) in &last {
        let failed_before = failed
            .get(k)
            .is_some_and(|ids| ids.iter().any(|id| *id != a.id));
        if a.status == "passed" && (failed_before || a.declared_flaky) {
            flaky.insert(*k);
        }
    }
    let mut out: Vec<&AttemptData> = last.into_values().collect();
    out.sort_by(|a, b| a.id.cmp(&b.id));
    (out, flaky)
}

/// Of `group` (finals of one subject): the run of the latest one, the worst
/// status within that run and the latest final with that status.
fn decide<'a>(group: &[&'a AttemptData]) -> Option<(&'a str, &'a AttemptData)> {
    let latest = group.iter().copied().max_by(|a, b| cmp(a, b))?;
    let mut in_run: Vec<&AttemptData> = group
        .iter()
        .copied()
        .filter(|a| a.run_id == latest.run_id)
        .collect();
    in_run.sort_by(|a, b| a.status.cmp(&b.status));
    let worst = derive::worst_status(in_run.iter().map(|a| a.status.as_str()))?;
    let decisive = in_run
        .iter()
        .copied()
        .filter(|a| a.status == worst)
        .max_by(|a, b| cmp(a, b))?;
    Some((&decisive.status, decisive))
}

fn priority_rank(p: &str) -> u8 {
    match p {
        "critical" => 0,
        "high" => 1,
        "medium" => 2,
        "low" => 3,
        _ => 4,
    }
}

fn is_open_defect(status: &str) -> bool {
    status != "closed" && status != "rejected"
}

fn ratio(n: i64, d: i64) -> Option<f64> {
    (d > 0).then(|| n as f64 / d as f64)
}

// ---- exit criteria (R11) ---------------------------------------------------------

/// Lower case without the Spanish accents (the TS twin folds the same set).
fn fold(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'ä' | 'â' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            'ñ' => 'n',
            c => c,
        })
        .collect()
}

/// The kind of a criterion by its text; None when it is not recognized.
pub fn criterion_kind(text: &str) -> Option<&'static str> {
    let t = fold(text);
    let other_severity = [
        "mayor", "major", "menor", "minor", "trivial", "alta", "high",
    ]
    .iter()
    .any(|w| t.contains(w));
    if t.contains("defect") && t.contains("critic") {
        // «Defectos críticos o mayores»: more than the critical ones.
        (!other_severity).then_some("criticalDefects")
    } else if t.contains("critic") {
        // «Casos críticos ejecutados»: a subset the derivation does not
        // measure; never the whole project's figure.
        None
    } else if t.contains("cobertura") || t.contains("coverage") {
        // Before «executed»: «Cobertura de requisitos ejecutados» is coverage.
        Some("coverage")
    } else if t.contains("exito")
        || t.contains("pass rate")
        || t.contains("aprobad")
        || t.contains("passed")
    {
        Some("passRate")
    } else if t.contains("ejecutad") || t.contains("executed") || t.contains("execution") {
        Some("executed")
    } else {
        None
    }
}

/// `≥ 95%`, `>= 90 %`, `0`, `<= 2`, `95,5%` → (op, number).
pub fn parse_metric(metric: &str, kind: &str) -> Option<(&'static str, f64)> {
    let s = metric.trim();
    let (op, rest) = [
        ("≥", ">="),
        ("≤", "<="),
        (">=", ">="),
        ("<=", "<="),
        (">", ">"),
        ("<", "<"),
        ("=", "="),
    ]
    .iter()
    .find_map(|(p, op)| s.strip_prefix(p).map(|r| (Some(*op), r)))
    .unwrap_or((None, s));
    let rest = rest.trim();
    let rest = rest.strip_suffix('%').unwrap_or(rest).trim();
    let valid = !rest.is_empty()
        && rest.bytes().filter(|c| *c == b'.' || *c == b',').count() <= 1
        && rest
            .bytes()
            .all(|c| c.is_ascii_digit() || c == b'.' || c == b',')
        && rest.as_bytes()[0].is_ascii_digit()
        && rest.as_bytes()[rest.len() - 1].is_ascii_digit();
    if !valid {
        return None;
    }
    let n: f64 = rest.replace(',', ".").parse().ok()?;
    let default = if kind == "criticalDefects" { "=" } else { ">=" };
    Some((op.unwrap_or(default), n))
}

fn round1(x: f64) -> f64 {
    (x * 10.0).round() / 10.0
}

/// The A3 defaults, used when the project has no plan or its plan no criteria.
const DEFAULT_CRITERIA: [(&str, &str); 3] = [
    ("% de casos ejecutados", "≥ 95%"),
    ("Defectos críticos abiertos", "0"),
    ("Cobertura de requisitos", "≥ 90%"),
];

/// The metric catalog (DOC-06, ADR-0041): the kinds a plan metric may
/// have. The same literals as `src/shared/metrics/catalog.ts`.
pub const METRIC_KINDS: [&str; 9] = [
    "executed",
    "passRate",
    "criticalDefects",
    "coverage",
    "defectDensity",
    "escapedDefects",
    "fixTime",
    "reopenRate",
    "flakyRate",
];
pub const METRIC_OPS: [&str; 5] = [">=", ">", "<=", "<", "="];

fn known_kind(kind: &str) -> Option<&'static str> {
    METRIC_KINDS.iter().copied().find(|k| *k == kind)
}

fn known_op(op: &str) -> Option<&'static str> {
    METRIC_OPS.iter().copied().find(|o| *o == op)
}

/// `value op target`.
pub fn compare(value: f64, op: &str, target: f64) -> bool {
    match op {
        ">=" => value >= target,
        ">" => value > target,
        "<=" => value <= target,
        "<" => value < target,
        _ => value == target,
    }
}

/// How a criterion is measured: by the plan metric it links to (PLN-06),
/// else by its text (`criterion_kind`/`parse_metric`, plans before 0.4.0
/// and a link to a deleted metric). A link to a metric without a kind (or
/// an unknown one) is judged by hand: (None, None).
fn measure_of(
    c: &CriterionData,
    metrics: &[PlanMetricData],
) -> (Option<&'static str>, Option<(&'static str, f64)>) {
    let linked = c
        .metric_id
        .as_deref()
        .and_then(|id| metrics.iter().find(|m| m.id == id));
    match linked {
        Some(m) => match m.kind.as_deref().and_then(known_kind) {
            Some(kind) => (
                Some(kind),
                m.target.map(|t| (known_op(m.op.trim()).unwrap_or(">="), t)),
            ),
            None => (None, None),
        },
        None => {
            let kind = criterion_kind(&c.criterion);
            (kind, kind.and_then(|k| parse_metric(&c.metric, k)))
        }
    }
}

fn exit_criteria(
    plan: Option<&Vec<CriterionData>>,
    metrics: &[PlanMetricData],
    values: &MetricValues,
) -> Vec<ExitCriterion> {
    let written: Vec<(Option<usize>, CriterionData)> = plan
        .map(|list| {
            list.iter()
                .enumerate()
                .filter(|(_, c)| !c.criterion.trim().is_empty())
                .map(|(i, c)| (Some(i), c.clone()))
                .collect()
        })
        .unwrap_or_default();
    let list = if written.is_empty() {
        DEFAULT_CRITERIA
            .iter()
            .map(|(c, m)| {
                (
                    None,
                    CriterionData {
                        criterion: c.to_string(),
                        metric: m.to_string(),
                        ..Default::default()
                    },
                )
            })
            .collect()
    } else {
        written
    };
    list.into_iter()
        .map(|(index, c)| {
            let (kind, parsed) = measure_of(&c, metrics);
            let value = kind.and_then(|k| values.get(k));
            let met = match (parsed, value) {
                (Some((op, target)), Some(v)) => Some(compare(v, op, target)),
                _ => None,
            };
            ExitCriterion {
                index,
                criterion: c.criterion,
                metric: c.metric,
                kind: kind.map(String::from),
                op: parsed.map(|(op, _)| op.to_string()),
                target: parsed.map(|(_, n)| n),
                value,
                met,
                blocking: c.blocking.unwrap_or(true),
            }
        })
        .collect()
}

/// The plan's measurable objectives: its metrics with a known kind and a
/// target, in the plan's order.
fn objectives(metrics: &[PlanMetricData]) -> Vec<MetricObjective> {
    metrics
        .iter()
        .filter_map(|m| {
            Some(MetricObjective {
                kind: known_kind(m.kind.as_deref()?)?.to_string(),
                op: known_op(m.op.trim()).unwrap_or(">=").to_string(),
                target: m.target?,
            })
        })
        .collect()
}

// ---- metrics (DOC-06) -------------------------------------------------------------

const DAY_MS: f64 = 86_400_000.0;

/// The median, None when there is nothing.
fn median(mut v: Vec<f64>) -> Option<f64> {
    if v.is_empty() {
        return None;
    }
    v.sort_by(|a, b| a.total_cmp(b));
    let n = v.len();
    Some(if n % 2 == 1 {
        v[n / 2]
    } else {
        (v[n / 2 - 1] + v[n / 2]) / 2.0
    })
}

/// The cycle each escaped defect is charged to: the latest cycle closed at or
/// before the defect was created (ties by id). None before any closing.
fn escape_cycles(data: &ProjectData) -> HashMap<&str, &str> {
    let mut closed: Vec<(i64, &str)> = data
        .cycles
        .iter()
        .filter(|c| c.status == "closed")
        .filter_map(|c| {
            let t = derive::instant_ms(&c.closure.as_ref()?.closed_at)?;
            Some((t, c.id.as_str()))
        })
        .collect();
    closed.sort_unstable();
    data.defects
        .iter()
        .filter(|d| d.escaped)
        .filter_map(|d| {
            let created = derive::instant_ms(d.created_at.as_deref()?)?;
            let n = closed.partition_point(|(t, _)| *t <= created);
            Some((d.id.as_str(), closed.get(n.checked_sub(1)?)?.1))
        })
        .collect()
}

/// The inputs `scope_metrics` reads from the summary.
struct ScopeFacts<'a> {
    scoped_runs: &'a HashSet<&'a str>,
    cycle_plan: &'a HashMap<&'a str, Option<&'a str>>,
    cases: &'a [CaseExecution],
    progress: &'a ExecutionProgress,
    pass_rate: Option<f64>,
    open_critical: i64,
    coverage: Option<f64>,
}

/// The catalog's metrics over the scope (DOC-06):
/// - found defects: not escaped, found in a run of the scope;
/// - escapes: charged to a cycle (`escape_cycles`); a project scope takes
///   every escape;
/// - fix time: median days from creation to the first `fixed`;
/// - reopen rate: reopened / fixed or reopened, among the found;
/// - flakiness: executed cases whose final result is flaky.
fn scope_metrics(data: &ProjectData, filter: &ExecutionFilter, f: &ScopeFacts) -> CycleMetrics {
    let executed_cases = f.cases.iter().filter(|c| c.status != NOT_RUN).count() as i64;
    let flaky = f
        .cases
        .iter()
        .filter(|c| c.status != NOT_RUN && c.last.as_ref().is_some_and(|l| l.flaky))
        .count() as i64;
    let found: Vec<&DefectData> = data
        .defects
        .iter()
        .filter(|d| {
            !d.escaped
                && d.found_in_run_id
                    .as_deref()
                    .is_some_and(|r| f.scoped_runs.contains(r))
        })
        .collect();
    let charged = escape_cycles(data);
    let escaped = data
        .defects
        .iter()
        .filter(|d| d.escaped)
        .filter(
            |d| match (filter.cycle_id.as_deref(), filter.test_plan_id.as_deref()) {
                (Some(cycle), _) => charged.get(d.id.as_str()) == Some(&cycle),
                (None, Some(plan)) => {
                    charged
                        .get(d.id.as_str())
                        .and_then(|c| f.cycle_plan.get(c).copied().flatten())
                        == Some(plan)
                }
                (None, None) => true,
            },
        )
        .count() as i64;
    let days: Vec<f64> = found
        .iter()
        .filter_map(|d| {
            let created = derive::instant_ms(d.created_at.as_deref()?)?;
            let fixed = derive::instant_ms(d.fixed_at.as_deref()?)?;
            Some(((fixed - created).max(0) as f64) / DAY_MS)
        })
        .collect();
    let fixed = found.iter().filter(|d| d.fixed_at.is_some()).count() as i64;
    let reopened = found.iter().filter(|d| d.reopens > 0).count() as i64;
    let reached_fix = found
        .iter()
        .filter(|d| d.fixed_at.is_some() || d.reopens > 0)
        .count() as i64;
    let found_n = found.len() as i64;
    let pct = |n: i64, d: i64| ratio(n, d).map(|r| round1(r * 100.0));
    CycleMetrics {
        values: MetricValues {
            executed: pct(f.progress.executed, f.progress.total),
            pass_rate: f.pass_rate.map(|r| round1(r * 100.0)),
            critical_defects: Some(f.open_critical as f64),
            coverage: f.coverage.map(|r| round1(r * 100.0)),
            defect_density: pct(found_n, executed_cases),
            escaped_defects: Some(escaped as f64),
            fix_time: median(days).map(round1),
            reopen_rate: pct(reopened, reached_fix),
            flaky_rate: pct(flaky, executed_cases),
        },
        executed_cases,
        defects_found: found_n,
        defects_fixed: fixed,
        defects_unfixed: found_n - fixed,
        defects_reopened: reopened,
        escape_rate: pct(escaped, escaped + found_n),
    }
}

// ---- the quality gate (DOC-02) ----------------------------------------------------

/// The shortest justification a failing mandatory criterion takes, in
/// characters (trimmed), and the longest.
pub const MIN_JUSTIFICATION: usize = 20;
pub const MAX_JUSTIFICATION: usize = 2000;

/// What the person closing decided for one criterion, by its position in
/// the summary's `exitCriteria`.
#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CloseDecision {
    pub position: usize,
    pub manual_met: Option<bool>,
    pub justification: Option<String>,
}

/// «Cerrar ciclo» (DOC-02): the verdict, needed only when a mandatory
/// criterion fails (`goWithRisks` or `noGo`), and the decisions.
#[cfg_attr(test, derive(TS), ts(export, optional_fields))]
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CycleCloseInput {
    pub verdict: Option<String>,
    pub decisions: Vec<CloseDecision>,
}

/// met | notMet | noData | manual, as the screens say it.
pub fn criterion_state(c: &ExitCriterion) -> &'static str {
    if c.kind.is_none() || c.op.is_none() {
        "manual"
    } else {
        match c.met {
            None => "noData",
            Some(true) => "met",
            Some(false) => "notMet",
        }
    }
}

/// The closing record of a cycle from its summary and the decisions, or the
/// first rule it breaks:
/// - a manual criterion needs its mark (`gate-manual-unset:<pos>`);
/// - a failing mandatory criterion («No cumple», «Sin datos» (D3) or a
///   manual one marked as not met) needs a justification of at least
///   `MIN_JUSTIFICATION` characters (`gate-justification-required:<pos>`);
/// - with a failing mandatory criterion the verdict is `goWithRisks` or
///   `noGo` (`gate-verdict-required`); without one it is always `go`.
pub fn close_record(
    summary: &ExecutionSummary,
    input: &CycleCloseInput,
    plan_id: Option<String>,
    now: &str,
    user: &str,
) -> Result<CycleClosure, String> {
    let mut criteria = Vec::with_capacity(summary.exit_criteria.len());
    let mut failing_blocking = false;
    for (pos, c) in summary.exit_criteria.iter().enumerate() {
        let decision = input.decisions.iter().find(|d| d.position == pos);
        let state = criterion_state(c);
        let manual_met = decision.and_then(|d| d.manual_met);
        if state == "manual" && manual_met.is_none() {
            return Err(format!("gate-manual-unset:{pos}"));
        }
        let failing = match state {
            "met" => false,
            "manual" => manual_met == Some(false),
            _ => true,
        };
        let justification = decision
            .and_then(|d| d.justification.as_deref())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from);
        if let Some(j) = &justification {
            if j.chars().count() > MAX_JUSTIFICATION {
                return Err(format!("gate-justification-too-long:{pos}"));
            }
        }
        if failing && c.blocking {
            failing_blocking = true;
            if justification
                .as_ref()
                .map_or(true, |j| j.chars().count() < MIN_JUSTIFICATION)
            {
                return Err(format!("gate-justification-required:{pos}"));
            }
        }
        criteria.push(ClosureCriterion {
            index: c.index,
            criterion: c.criterion.clone(),
            metric: c.metric.clone(),
            kind: c.kind.clone(),
            op: c.op.clone(),
            target: c.target,
            value: c.value,
            blocking: c.blocking,
            state: state.to_string(),
            manual_met: if state == "manual" { manual_met } else { None },
            justification: if failing { justification } else { None },
        });
    }
    let verdict = if failing_blocking {
        match input.verdict.as_deref() {
            Some(v @ ("goWithRisks" | "noGo")) => v.to_string(),
            _ => return Err("gate-verdict-required".into()),
        }
    } else {
        "go".to_string()
    };
    Ok(CycleClosure {
        closed_at: now.to_string(),
        closed_by: user.to_string(),
        verdict,
        plan_id,
        criteria,
        metrics: summary.metrics.clone(),
    })
}

// ---- daily (R9) -------------------------------------------------------------------

/// The bucket of `t` in `day_starts` (`[ds[i], ds[i+1])`), None before the first.
fn bucket(day_starts: &[i64], t: i64) -> Option<usize> {
    let n = day_starts.partition_point(|d| *d <= t);
    n.checked_sub(1)
}

fn empty_daily(day_starts: &[i64]) -> Vec<DailyCount> {
    day_starts
        .iter()
        .map(|d| DailyCount {
            day_start: *d,
            ..Default::default()
        })
        .collect()
}

// ---- the per-project summary --------------------------------------------------------

struct Derived<'a> {
    /// The case's status, its decisive final and its run.
    case_results: HashMap<&'a str, (String, Option<&'a AttemptData>)>,
    targets: Vec<(TargetKey<'a>, &'a AttemptData)>,
    flaky: HashSet<TestKey<'a>>,
}

/// R2–R5 and R7 over the attempts in scope.
fn derive_results<'a>(data: &'a ProjectData, in_scope: &[&'a AttemptData]) -> Derived<'a> {
    let (finals, flaky) = finals(in_scope);
    let mut by_case: HashMap<&str, Vec<&AttemptData>> = HashMap::new();
    let mut by_target: BTreeMap<TargetKey, Vec<&AttemptData>> = BTreeMap::new();
    for f in &finals {
        if let Some(case) = f.case_id.as_deref() {
            by_case.entry(case).or_default().push(f);
            by_target
                .entry((case, f.flow_id.as_deref(), f.row_id.as_deref()))
                .or_default()
                .push(f);
        }
    }
    let mut targets = Vec::new();
    for ((case, flow, row), group) in &by_target {
        if let Some((_, decisive)) = decide(group) {
            targets.push(((*case, *flow, *row), decisive));
        }
    }
    // Defects reaching each case, for R7.
    let mut defect_states: HashMap<&str, (bool, bool)> = HashMap::new(); // (fixed/retest, still being worked)
    for d in &data.defects {
        for c in &d.case_ids {
            let e = defect_states.entry(c.as_str()).or_default();
            match d.status.as_str() {
                "fixed" | "retest" => e.0 = true,
                "new" | "open" | "in_progress" => e.1 = true,
                _ => {}
            }
        }
    }
    let mut case_results = HashMap::new();
    for (case, group) in &by_case {
        if let Some((status, decisive)) = decide(group) {
            let mut status = status.to_string();
            if status == "failed" && defect_states.get(case).is_some_and(|(r, w)| *r && !*w) {
                status = RETEST.to_string();
            }
            case_results.insert(*case, (status, Some(decisive)));
        }
    }
    Derived {
        case_results,
        targets,
        flaky,
    }
}

fn last_result<'a>(
    a: &AttemptData,
    runs: &HashMap<&'a str, &'a RunData>,
    cases: &HashMap<&'a str, &'a CaseData>,
    flaky: &HashSet<TestKey<'a>>,
) -> LastResult {
    let run = runs.get(a.run_id.as_str());
    let current = a
        .case_id
        .as_deref()
        .and_then(|c| cases.get(c))
        .and_then(|c| c.exec_fingerprint.as_deref());
    LastResult {
        result_id: a.id.clone(),
        run_id: a.run_id.clone(),
        run_key: run.map(|r| r.run_key.clone()).unwrap_or_default(),
        run_title: run.map(|r| r.title.clone()).unwrap_or_default(),
        trigger: run.map(|r| r.trigger.clone()).unwrap_or_default(),
        source_tool: run.and_then(|r| r.source_tool.clone()),
        origin: if a.imported { "imported" } else { "manual" }.to_string(),
        at: time_of(a).map(|(_, s)| s.to_string()),
        status: a.status.clone(),
        configuration_label: a.configuration_label.clone(),
        flaky: flaky.contains(&test_of(a)),
        revision_id: a.revision_id.clone(),
        stale: matches!((a.exec_fingerprint.as_deref(), current), (Some(x), Some(y)) if x != y),
    }
}

fn trimmed(v: &Option<String>) -> Option<&str> {
    v.as_deref().map(str::trim).filter(|s| !s.is_empty())
}

/// The summary of one project under `filter` (R1–R12).
pub fn summarize(data: &ProjectData, filter: &ExecutionFilter) -> ExecutionSummary {
    let filter = filter.normalized();
    let runs: HashMap<&str, &RunData> = data.runs.iter().map(|r| (r.id.as_str(), r)).collect();
    let cases: HashMap<&str, &CaseData> = data.cases.iter().map(|c| (c.id.as_str(), c)).collect();
    let cycle_plan: HashMap<&str, Option<&str>> = data
        .cycles
        .iter()
        .map(|c| (c.id.as_str(), c.test_plan_id.as_deref()))
        .collect();

    // R1: runs in scope, then attempts.
    let run_ok = |r: &RunData| {
        filter
            .cycle_id
            .as_deref()
            .map_or(true, |c| r.cycle_id.as_deref() == Some(c))
            && filter.test_plan_id.as_deref().map_or(true, |p| {
                r.test_plan_id.as_deref() == Some(p)
                    || r.cycle_id
                        .as_deref()
                        .and_then(|c| cycle_plan.get(c).copied().flatten())
                        == Some(p)
            })
            && filter
                .build
                .as_deref()
                .map_or(true, |b| trimmed(&r.build) == Some(b))
            && filter
                .environment
                .as_deref()
                .map_or(true, |e| trimmed(&r.environment) == Some(e))
    };
    let scoped_runs: HashSet<&str> = data
        .runs
        .iter()
        .filter(|r| run_ok(r))
        .map(|r| r.id.as_str())
        .collect();
    let mut undated = 0;
    let mut in_scope: Vec<&AttemptData> = Vec::new();
    for a in &data.attempts {
        if !scoped_runs.contains(a.run_id.as_str()) {
            continue;
        }
        if let Some(c) = filter.configuration_id.as_deref() {
            if a.configuration_id.as_deref() != Some(c) {
                continue;
            }
        }
        let t = time_of(a).map(|(ms, _)| ms);
        if t.is_none() {
            undated += 1;
        }
        if filter.from.is_some() || filter.to.is_some() {
            match t {
                Some(t)
                    if filter.from.map_or(true, |f| t >= f)
                        && filter.to.map_or(true, |to| t < to) => {}
                _ => continue,
            }
        }
        in_scope.push(a);
    }

    let derived = derive_results(data, &in_scope);

    // R6: the cases in scope.
    let mut scope: Vec<&CaseData> = Vec::new();
    let mut seen: HashSet<&str> = HashSet::new();
    let mut add = |id: &str| {
        if let Some(c) = cases.get(id).copied() {
            if seen.insert(c.id.as_str()) {
                scope.push(c);
            }
        }
    };
    if let Some(cycle) = filter.cycle_id.as_deref() {
        for i in data.cycle_items.iter().filter(|i| i.cycle_id == cycle) {
            add(&i.case_id);
        }
    } else if let Some(plan) = filter.test_plan_id.as_deref() {
        for i in &data.cycle_items {
            if cycle_plan.get(i.cycle_id.as_str()).copied().flatten() == Some(plan) {
                add(&i.case_id);
            }
        }
        let mut with_results: Vec<&str> = derived.case_results.keys().copied().collect();
        with_results.sort_unstable();
        for c in with_results {
            add(c);
        }
    } else {
        for c in data.cases.iter().filter(|c| c.status != "obsolete") {
            add(&c.id);
        }
    }
    scope.sort_by(|a, b| natural_cmp(&a.scenario_id, &b.scenario_id).then_with(|| a.id.cmp(&b.id)));
    let scope_ids: HashSet<&str> = scope.iter().map(|c| c.id.as_str()).collect();

    // Defects reaching each case and requirement.
    let defect_by_id: HashMap<&str, &DefectData> =
        data.defects.iter().map(|d| (d.id.as_str(), d)).collect();
    let order_defects = |ids: &mut Vec<String>| {
        ids.sort_by(|a, b| {
            let (x, y) = (defect_by_id[a.as_str()], defect_by_id[b.as_str()]);
            is_open_defect(&y.status)
                .cmp(&is_open_defect(&x.status))
                .then_with(|| natural_cmp(&x.defect_key, &y.defect_key))
                .then_with(|| x.id.cmp(&y.id))
        });
        ids.dedup();
    };
    // The joins, built once (never a scan per row).
    let mut defects_by_case: HashMap<&str, Vec<&DefectData>> = HashMap::new();
    let mut defects_by_requirement: HashMap<&str, Vec<&DefectData>> = HashMap::new();
    for d in &data.defects {
        for c in &d.case_ids {
            defects_by_case.entry(c.as_str()).or_default().push(d);
        }
        for r in &d.requirement_ids {
            defects_by_requirement
                .entry(r.as_str())
                .or_default()
                .push(d);
        }
    }
    let mut cases_by_key: HashMap<&str, Vec<&CaseData>> = HashMap::new();
    for c in &data.cases {
        for k in &c.requirement_keys {
            cases_by_key.entry(k.as_str()).or_default().push(c);
        }
    }
    let defects_of_case = |case: &str| -> Vec<String> {
        let mut ids: Vec<String> = defects_by_case
            .get(case)
            .into_iter()
            .flatten()
            .map(|d| d.id.clone())
            .collect();
        order_defects(&mut ids);
        ids
    };

    let status_of = |case: &str| -> String {
        derived
            .case_results
            .get(case)
            .map(|(s, _)| s.clone())
            .unwrap_or_else(|| NOT_RUN.to_string())
    };

    let case_rows: Vec<CaseExecution> = scope
        .iter()
        .map(|c| {
            let decisive = derived
                .case_results
                .get(c.id.as_str())
                .and_then(|(_, a)| *a);
            CaseExecution {
                case_id: c.id.clone(),
                scenario_id: c.scenario_id.clone(),
                title: c.title.clone(),
                priority: c.priority.clone(),
                case_status: c.status.clone(),
                requirement_keys: c.requirement_keys.clone(),
                status: status_of(&c.id),
                last: decisive.map(|a| last_result(a, &runs, &cases, &derived.flaky)),
                flow_id: decisive.and_then(|a| a.flow_id.clone()),
                row_id: decisive.and_then(|a| a.row_id.clone()),
                defect_ids: defects_of_case(&c.id),
            }
        })
        .collect();

    // Progress.
    let mut progress = ExecutionProgress::default();
    let progress_unit;
    if let Some(cycle_id) = filter.cycle_id.as_deref() {
        progress_unit = "cell";
        let columns: Vec<Option<&str>> = data
            .cycles
            .iter()
            .find(|c| c.id == cycle_id)
            .map(|c| {
                c.configuration_ids
                    .iter()
                    .map(|s| Some(s.as_str()))
                    .collect::<Vec<_>>()
            })
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| vec![None]);
        let items: Vec<progress::Item> = data
            .cycle_items
            .iter()
            .filter(|i| i.cycle_id == cycle_id)
            .map(|i| progress::Item {
                id: &i.id,
                case_id: &i.case_id,
                flow_id: i.flow_id.as_deref(),
                row_id: i.row_id.as_deref(),
            })
            .collect();
        let attempts: Vec<progress::CycleAttempt> = in_scope
            .iter()
            .map(|a| progress::CycleAttempt {
                attempt: attempt_of(a),
                configuration_id: a.configuration_id.as_deref(),
                case_id: a.case_id.as_deref(),
                flow_id: a.flow_id.as_deref(),
                row_id: a.row_id.as_deref(),
            })
            .collect();
        for cell in progress::cells(&items, &columns, &attempts) {
            progress.count(cell.status);
        }
    } else {
        progress_unit = "case";
        for c in &case_rows {
            progress.count(&c.status);
        }
    }
    let pass_rate = ratio(progress.counts.passed, progress.executed);

    let last_executed_at = in_scope
        .iter()
        .filter_map(|a| time_of(a).map(|t| (t, a.id.as_str())))
        .max()
        .map(|((_, s), _)| s.to_string());

    // Targets, in the cases' order.
    let mut targets: Vec<TargetExecution> = derived
        .targets
        .iter()
        .map(|((case, flow, row), a)| TargetExecution {
            case_id: case.to_string(),
            flow_id: flow.map(String::from),
            row_id: row.map(String::from),
            status: a.status.clone(),
            last: last_result(a, &runs, &cases, &derived.flaky),
        })
        .collect();
    targets.sort_by(|a, b| {
        let key = |t: &TargetExecution| {
            cases
                .get(t.case_id.as_str())
                .map(|c| c.scenario_id.clone())
                .unwrap_or_default()
        };
        natural_cmp(&key(a), &key(b))
            .then_with(|| a.case_id.cmp(&b.case_id))
            .then_with(|| a.flow_id.cmp(&b.flow_id))
            .then_with(|| a.row_id.cmp(&b.row_id))
    });

    // Requirements and coverage.
    let mut requirements: Vec<&RequirementData> = data.requirements.iter().collect();
    requirements.sort_by(|a, b| {
        natural_cmp(&a.requirement_key, &b.requirement_key).then_with(|| a.id.cmp(&b.id))
    });
    let mut coverage = CoverageSummary {
        requirements: requirements.len() as i64,
        ..Default::default()
    };
    let mut req_rows = Vec::new();
    for r in requirements {
        let mut linked: Vec<&CaseData> = cases_by_key
            .get(r.requirement_key.as_str())
            .cloned()
            .unwrap_or_default();
        linked.dedup_by(|a, b| a.id == b.id);
        let mut linked_sorted = linked.clone();
        linked_sorted.sort_by(|a, b| {
            natural_cmp(&a.scenario_id, &b.scenario_id).then_with(|| a.id.cmp(&b.id))
        });
        let live: Vec<&CaseData> = linked
            .iter()
            .copied()
            .filter(|c| c.status != "obsolete")
            .collect();
        let covered = !live.is_empty();
        let statuses: Vec<String> = live.iter().map(|c| status_of(&c.id)).collect();
        let executed_cases = statuses.iter().filter(|s| *s != NOT_RUN).count() as i64;
        let mut ranked: Vec<&str> = statuses
            .iter()
            .filter(|s| *s != NOT_RUN)
            .map(|s| if s == RETEST { "failed" } else { s.as_str() })
            .collect();
        ranked.sort_unstable();
        let status = derive::worst_status(ranked).unwrap_or(NOT_RUN).to_string();
        let level = derive::risk_level(r.risk_likelihood, r.risk_impact);
        let band = level
            .map(|l| derive::risk_band(l, derive::DEFAULT_RISK_BANDS))
            .unwrap_or("unassessed");
        let mut defect_ids: Vec<String> = defects_by_requirement
            .get(r.id.as_str())
            .into_iter()
            .flatten()
            .chain(
                linked
                    .iter()
                    .flat_map(|c| defects_by_case.get(c.id.as_str()).into_iter().flatten()),
            )
            .map(|d| d.id.clone())
            .collect();
        defect_ids.sort_unstable();
        defect_ids.dedup();
        order_defects(&mut defect_ids);
        let all_executed = covered && executed_cases == live.len() as i64;
        coverage.covered += covered as i64;
        coverage.executed += all_executed as i64;
        coverage.passed += (all_executed && status == "passed") as i64;
        let b = coverage.by_risk.band(band);
        b.requirements += 1;
        b.covered += covered as i64;
        b.executed += all_executed as i64;
        b.passed += (all_executed && status == "passed") as i64;
        b.failed += (status == "failed") as i64;
        req_rows.push(RequirementExecution {
            requirement_id: r.id.clone(),
            requirement_key: r.requirement_key.clone(),
            title: r.title.clone(),
            priority: r.priority.clone(),
            risk_likelihood: r.risk_likelihood,
            risk_impact: r.risk_impact,
            risk_level: level,
            risk_band: band.to_string(),
            covered,
            // The same cases `executed_cases` counts (live, not obsolete).
            case_ids: linked_sorted
                .iter()
                .filter(|c| c.status != "obsolete")
                .map(|c| c.id.clone())
                .collect(),
            executed_cases,
            status,
            defect_ids,
            in_scope: linked.iter().any(|c| scope_ids.contains(c.id.as_str())),
        });
    }
    coverage.coverage_ratio = ratio(coverage.covered, coverage.requirements);

    // R10: defects, a snapshot now.
    let scoped = filter.cycle_id.is_some() || filter.test_plan_id.is_some();
    let in_scope_reqs: HashSet<&str> = req_rows
        .iter()
        .filter(|r| r.in_scope)
        .map(|r| r.requirement_id.as_str())
        .collect();
    let mut defects = DefectSummary::default();
    for d in &data.defects {
        if scoped
            && !d.case_ids.iter().any(|c| scope_ids.contains(c.as_str()))
            && !d
                .requirement_ids
                .iter()
                .any(|r| in_scope_reqs.contains(r.as_str()))
        {
            continue;
        }
        let open = is_open_defect(&d.status);
        defects.total += 1;
        defects.open += open as i64;
        if let Some(s) = defects.by_severity.get(&d.severity) {
            s.total += 1;
            s.open += open as i64;
        }
        if open {
            if let Some(s) = defects.open_by_severity.get(&d.severity) {
                *s += 1;
            }
        }
        *defects.by_status.entry(d.status.clone()).or_default() += 1;
    }

    let metrics = scope_metrics(
        data,
        &filter,
        &ScopeFacts {
            scoped_runs: &scoped_runs,
            cycle_plan: &cycle_plan,
            cases: &case_rows,
            progress: &progress,
            pass_rate,
            open_critical: defects.open_by_severity.critical,
            coverage: coverage.coverage_ratio,
        },
    );
    let exit_criteria = exit_criteria(
        data.plan_criteria.as_ref(),
        data.plan_metrics.as_deref().unwrap_or_default(),
        &metrics.values,
    );
    let closure = filter.cycle_id.as_deref().and_then(|id| {
        data.cycles
            .iter()
            .find(|c| c.id == id)
            .and_then(|c| c.closure.clone())
    });
    let previous = filter.cycle_id.as_deref().and_then(|id| {
        let closed = closed_points(data);
        match closed.iter().position(|p| p.cycle_id == id) {
            Some(i) => i.checked_sub(1).map(|j| closed[j].clone()),
            None => closed.last().cloned(),
        }
    });

    // R9: daily.
    let day_starts = filter.day_starts.clone().unwrap_or_default();
    let mut daily = empty_daily(&day_starts);
    for a in &in_scope {
        if let Some(i) = time_of(a).and_then(|(t, _)| bucket(&day_starts, t)) {
            daily[i].add(a);
        }
    }

    // Runs in scope, newest first.
    let mut run_refs: Vec<&RunData> = data
        .runs
        .iter()
        .filter(|r| scoped_runs.contains(r.id.as_str()))
        .collect();
    let when = |r: &RunData| {
        r.started_at
            .as_deref()
            .and_then(derive::instant_ms)
            .or_else(|| derive::instant_ms(&r.created_at))
    };
    run_refs.sort_by(|a, b| when(b).cmp(&when(a)).then_with(|| a.id.cmp(&b.id)));

    let distinct = |f: fn(&RunData) -> &Option<String>| {
        let mut v: Vec<String> = data
            .runs
            .iter()
            .filter_map(|r| trimmed(f(r)).map(String::from))
            .collect();
        v.sort();
        v.dedup();
        v
    };

    ExecutionSummary {
        contract_version: CONTRACT_VERSION,
        project_id: data.project_id.clone(),
        progress,
        progress_unit: progress_unit.to_string(),
        pass_rate,
        last_executed_at,
        cases: case_rows,
        targets,
        requirements: req_rows,
        coverage,
        defects,
        exit_criteria,
        metrics,
        closure,
        previous,
        daily,
        undated,
        runs: run_refs
            .into_iter()
            .map(|r| RunRef {
                id: r.id.clone(),
                run_key: r.run_key.clone(),
                title: r.title.clone(),
                trigger: r.trigger.clone(),
                source_tool: r.source_tool.clone(),
                status: r.status.clone(),
                started_at: r.started_at.clone(),
                cycle_id: r.cycle_id.clone(),
                configuration_id: r.configuration_id.clone(),
                build: r.build.clone(),
                environment: r.environment.clone(),
            })
            .collect(),
        options: FilterOptions {
            builds: distinct(|r| &r.build),
            environments: distinct(|r| &r.environment),
        },
        filter,
    }
}

// ---- the Home rollup --------------------------------------------------------------

fn queue_refs(cases: &[CaseExecution], status: &str, limit: usize) -> (Vec<QueueRef>, i64) {
    let mut list: Vec<&CaseExecution> = cases.iter().filter(|c| c.status == status).collect();
    let at = |c: &CaseExecution| {
        c.last
            .as_ref()
            .and_then(|l| l.at.as_deref())
            .and_then(derive::instant_ms)
    };
    list.sort_by(|a, b| {
        priority_rank(&a.priority)
            .cmp(&priority_rank(&b.priority))
            // Newest first; no time last.
            .then_with(|| match (at(a), at(b)) {
                (Some(x), Some(y)) => y.cmp(&x),
                (Some(_), None) => Ordering::Less,
                (None, Some(_)) => Ordering::Greater,
                (None, None) => Ordering::Equal,
            })
            .then_with(|| natural_cmp(&a.scenario_id, &b.scenario_id))
            .then_with(|| a.case_id.cmp(&b.case_id))
    });
    let count = list.len() as i64;
    let refs = list
        .into_iter()
        .take(limit)
        .map(|c| QueueRef {
            case_id: c.case_id.clone(),
            scenario_id: c.scenario_id.clone(),
            title: c.title.clone(),
            priority: c.priority.clone(),
            flow_id: c.flow_id.clone(),
            row_id: c.row_id.clone(),
            last_at: c.last.as_ref().and_then(|l| l.at.clone()),
        })
        .collect();
    (refs, count)
}

/// The attempts of the project's live runs: a deleted run (EJE-07) keeps
/// its results live, and every reader hides them through the run.
fn live_attempts(data: &ProjectData) -> impl Iterator<Item = &AttemptData> {
    let runs: HashSet<&str> = data.runs.iter().map(|r| r.id.as_str()).collect();
    data.attempts
        .iter()
        .filter(move |a| runs.contains(a.run_id.as_str()))
}

/// Closed cycles the trend shows (DOC-06).
pub const TREND_CYCLES: usize = 6;

/// The trend of a project (DOC-06): its last `TREND_CYCLES` closed cycles,
/// oldest first, with the figures frozen at closing (escapes counted now:
/// they arrive after the closing), then its active cycles, live.
fn trend(data: &ProjectData) -> Vec<CycleTrendPoint> {
    let closed = closed_points(data);
    let skip = closed.len().saturating_sub(TREND_CYCLES);
    let mut out: Vec<CycleTrendPoint> = closed.into_iter().skip(skip).collect();
    let mut active: Vec<&CycleData> = data
        .cycles
        .iter()
        .filter(|c| c.status == "active")
        .collect();
    active.sort_by(|a, b| natural_cmp(&a.cycle_key, &b.cycle_key).then_with(|| a.id.cmp(&b.id)));
    for c in active {
        let s = summarize(
            data,
            &ExecutionFilter {
                project_id: data.project_id.clone(),
                cycle_id: Some(c.id.clone()),
                ..Default::default()
            },
        );
        out.push(CycleTrendPoint {
            cycle_id: c.id.clone(),
            cycle_key: c.cycle_key.clone(),
            title: c.title.clone(),
            status: "active".into(),
            closed_at: None,
            verdict: None,
            values: s.metrics.values,
        });
    }
    out
}

/// Every closed cycle with its closing, oldest first (ties by id): the
/// figures frozen at closing, escapes counted now (they arrive after it).
fn closed_points(data: &ProjectData) -> Vec<CycleTrendPoint> {
    let mut closed: Vec<(i64, &CycleData, &CycleClosure)> = data
        .cycles
        .iter()
        .filter(|c| c.status == "closed")
        .filter_map(|c| {
            let cl = c.closure.as_ref()?;
            Some((derive::instant_ms(&cl.closed_at)?, c, cl))
        })
        .collect();
    closed.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.id.cmp(&b.1.id)));
    let charged = escape_cycles(data);
    closed
        .into_iter()
        .map(|(_, c, cl)| {
            let escapes = charged.values().filter(|id| **id == c.id).count();
            CycleTrendPoint {
                cycle_id: c.id.clone(),
                cycle_key: c.cycle_key.clone(),
                title: c.title.clone(),
                status: "closed".into(),
                closed_at: Some(cl.closed_at.clone()),
                verdict: Some(cl.verdict.clone()),
                values: MetricValues {
                    escaped_defects: Some(escapes as f64),
                    ..cl.metrics.values.clone()
                },
            }
        })
        .collect()
}

/// The Home metrics of `projects` (contract v1 §2.4, R8–R9).
pub fn home(all_projects: &[ProjectData], request: &HomeRequest) -> HomeMetrics {
    // A project asked for twice counts once.
    let mut seen_projects = HashSet::new();
    let projects: Vec<&ProjectData> = all_projects
        .iter()
        .filter(|p| seen_projects.insert(p.project_id.as_str()))
        .collect();
    let limit = request.queue_limit.unwrap_or(5);
    let ds = &request.day_starts;
    let mut daily = empty_daily(ds);
    let mut undated = 0;
    let mut out = Vec::new();
    for &data in &projects {
        let summary = summarize(
            data,
            &ExecutionFilter {
                project_id: data.project_id.clone(),
                ..Default::default()
            },
        );
        for a in live_attempts(data) {
            match time_of(a) {
                None => undated += 1,
                Some((t, _)) if t <= request.now => {
                    if let Some(i) = bucket(ds, t) {
                        daily[i].add(a);
                    }
                }
                _ => {}
            }
        }
        let (not_run, n) = queue_refs(&summary.cases, NOT_RUN, limit);
        let (blocked, b) = queue_refs(&summary.cases, "blocked", limit);
        let (retest, r) = queue_refs(&summary.cases, RETEST, limit);
        out.push(HomeProject {
            project_id: data.project_id.clone(),
            counts: summary.progress,
            last_executed_at: summary.last_executed_at,
            defects: HomeDefects {
                open: summary.defects.open,
                open_by_severity: summary.defects.open_by_severity,
            },
            coverage: summary.coverage.coverage_ratio.map(|r| r * 100.0),
            exit_criteria: summary.exit_criteria,
            queue: HomeQueue {
                not_run,
                blocked,
                retest,
                counts: QueueCounts {
                    not_run: n,
                    blocked: b,
                    retest: r,
                },
            },
            trend: trend(data),
            objectives: objectives(data.plan_metrics.as_deref().unwrap_or_default()),
        });
    }
    // R8: windows over every project's attempts.
    let mut windows = BTreeMap::new();
    for w in &request.windows {
        let Some(start) = ds.get(w.from_index).copied() else {
            continue;
        };
        let mut counts = WindowCounts::default();
        for &data in &projects {
            let in_window: Vec<&AttemptData> = live_attempts(data)
                .filter(|a| time_of(a).is_some_and(|(t, _)| t >= start && t <= request.now))
                .collect();
            let (finals, _) = finals(&in_window);
            // By case, as the progress (NC-029); unlinked tests apart.
            let mut groups: BTreeMap<&str, Vec<&AttemptData>> = BTreeMap::new();
            let mut unlinked: HashSet<TestKey> = HashSet::new();
            for f in finals {
                match f.case_id.as_deref() {
                    Some(case) => groups.entry(case).or_default().push(f),
                    None => {
                        unlinked.insert(test_of(f));
                    }
                }
            }
            counts.unlinked += unlinked.len() as i64;
            for group in groups.values() {
                if let Some((status, _)) = decide(group) {
                    counts.counts.count(status);
                    counts.executed += 1;
                }
            }
        }
        counts.pass_rate = ratio(counts.counts.passed, counts.executed);
        windows.insert(w.id.clone(), counts);
    }
    HomeMetrics {
        contract_version: CONTRACT_VERSION,
        daily,
        undated,
        windows,
        projects: out,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn natural_order_compares_digit_runs_by_value() {
        let mut v = vec!["ATS_10", "ATS_2", "ATS_002", "ATS_1", "B", "A"];
        v.sort_by(|a, b| natural_cmp(a, b));
        // Equal values: the shorter text (fewer leading zeros) sorts last, by bytes.
        assert_eq!(v, vec!["A", "ATS_1", "ATS_002", "ATS_2", "ATS_10", "B"]);
    }

    #[test]
    fn criteria_texts_and_metrics_are_recognized() {
        assert_eq!(criterion_kind("% de casos ejecutados"), Some("executed"));
        assert_eq!(
            criterion_kind("Defectos críticos abiertos"),
            Some("criticalDefects")
        );
        assert_eq!(criterion_kind("Cobertura de requisitos"), Some("coverage"));
        assert_eq!(criterion_kind("Tasa de éxito"), Some("passRate"));
        assert_eq!(
            criterion_kind("Open critical defects"),
            Some("criticalDefects")
        );
        assert_eq!(criterion_kind("Sign-off by the PO"), None);
        assert_eq!(criterion_kind("Casos críticos ejecutados"), None);
        assert_eq!(criterion_kind("Critical cases executed"), None);
        assert_eq!(
            criterion_kind("Cobertura de requisitos ejecutados"),
            Some("coverage")
        );
        assert_eq!(criterion_kind("Defectos críticos o mayores abiertos"), None);
        assert_eq!(criterion_kind("% of cases executed"), Some("executed"));
        assert_eq!(criterion_kind("Requirements coverage"), Some("coverage"));
        assert_eq!(parse_metric("≥ 95%", "executed"), Some((">=", 95.0)));
        assert_eq!(parse_metric(">= 90 %", "coverage"), Some((">=", 90.0)));
        assert_eq!(parse_metric("0", "criticalDefects"), Some(("=", 0.0)));
        assert_eq!(parse_metric("95,5%", "executed"), Some((">=", 95.5)));
        assert_eq!(parse_metric("< 2", "criticalDefects"), Some(("<", 2.0)));
        assert_eq!(parse_metric("ninguno", "criticalDefects"), None);
        assert_eq!(parse_metric("1.2.3", "executed"), None);
    }

    #[test]
    fn buckets_are_half_open_and_nothing_before_the_first_day() {
        let ds = [100, 200, 300];
        assert_eq!(bucket(&ds, 99), None);
        assert_eq!(bucket(&ds, 100), Some(0));
        assert_eq!(bucket(&ds, 199), Some(0));
        assert_eq!(bucket(&ds, 200), Some(1));
        assert_eq!(bucket(&ds, 10_000), Some(2));
    }
}
