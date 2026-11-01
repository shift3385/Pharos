//! Progress of a test cycle (ADR-0017): for each item × configuration, the
//! latest final Result among the cycle's runs. Derived on read, never stored.
//! Pure; the server's web API has a TS twin (`server/src/modules/domain/
//! cycle-progress.ts`), and both are checked against
//! `tests/fixtures/cycle-progress-vectors.json`.
//!
//! - A **cell** is one cycle item and one configuration of the cycle (or no
//!   configuration, for a cycle without any).
//! - Its candidates are the **final** attempts of each run
//!   (`derive::final_attempts`) whose configuration is the cell's (the run's
//!   own, or the result's for a run without one), whose case is the item's
//!   case, and whose flow and row match the item's (NULL in the item = any).
//! - Per test (`test_key` + `configuration_label`) the latest of those across
//!   runs, ordered like the final attempt (time, `attempt`, HLC). The cell is
//!   the worst of them (`derive::worst_status`), or `not_run`.

use std::collections::HashMap;

use crate::runs::derive::{self, Attempt};

pub const NOT_RUN: &str = "not_run";

/// What progress reads of one cycle item.
#[derive(Clone, Debug)]
pub struct Item<'a> {
    pub id: &'a str,
    pub case_id: &'a str,
    pub flow_id: Option<&'a str>,
    pub row_id: Option<&'a str>,
}

/// One attempt of a run of the cycle, with what places it in a cell.
#[derive(Clone, Debug)]
pub struct CycleAttempt<'a> {
    pub attempt: Attempt<'a>,
    /// The run's configuration, or the result's when the run has none.
    pub configuration_id: Option<&'a str>,
    /// `coalesce(test_case_id, unlinked mapping)`.
    pub case_id: Option<&'a str>,
    pub flow_id: Option<&'a str>,
    pub row_id: Option<&'a str>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Cell<'a> {
    pub item_id: &'a str,
    pub configuration_id: Option<&'a str>,
    pub status: &'a str,
    /// The result that decided the cell (the latest one with its status).
    pub result_id: Option<&'a str>,
    pub run_id: Option<&'a str>,
}

impl CycleAttempt<'_> {
    fn fits(&self, item: &Item, configuration: Option<&str>) -> bool {
        self.configuration_id == configuration
            && self.case_id == Some(item.case_id)
            && item.flow_id.map_or(true, |f| self.flow_id == Some(f))
            && item.row_id.map_or(true, |r| self.row_id == Some(r))
    }
}

/// Every cell of the cycle, item by item, configuration by configuration.
pub fn cells<'a>(
    items: &[Item<'a>],
    configurations: &[Option<&'a str>],
    attempts: &[CycleAttempt<'a>],
) -> Vec<Cell<'a>> {
    let plain: Vec<Attempt<'a>> = attempts.iter().map(|a| a.attempt.clone()).collect();
    let finals = derive::final_attempts(&plain);
    let finals: Vec<&CycleAttempt<'a>> = attempts
        .iter()
        .filter(|a| finals.contains(&a.attempt.id))
        .collect();
    let mut out = Vec::new();
    for item in items {
        for &configuration in configurations {
            // The latest final of each test across the cycle's runs.
            let mut latest: HashMap<(&str, &str), &CycleAttempt<'a>> = HashMap::new();
            for a in finals.iter().filter(|a| a.fits(item, configuration)) {
                let test = (
                    a.attempt.test_key,
                    a.attempt.configuration_label.unwrap_or(""),
                );
                latest
                    .entry(test)
                    .and_modify(|cur| {
                        if derive::cmp_attempts(&a.attempt, &cur.attempt).is_gt() {
                            *cur = a;
                        }
                    })
                    .or_insert(a);
            }
            // Sorted first, so a tie between two unknown statuses (both count as
            // `other`) is decided the same way on every side.
            let mut statuses: Vec<&str> = latest.values().map(|a| a.attempt.status).collect();
            statuses.sort_unstable();
            let status = derive::worst_status(statuses);
            let decisive = status.and_then(|s| {
                latest
                    .values()
                    .filter(|a| a.attempt.status == s)
                    .max_by(|x, y| derive::cmp_attempts(&x.attempt, &y.attempt))
            });
            out.push(Cell {
                item_id: item.id,
                configuration_id: configuration,
                status: status.unwrap_or(NOT_RUN),
                result_id: decisive.map(|a| a.attempt.id),
                run_id: decisive.map(|a| a.attempt.run_id),
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use super::*;

    fn s(v: &Value, k: &str) -> Option<String> {
        v.get(k).and_then(Value::as_str).map(String::from)
    }

    /// The shared vectors: the server's TS twin reads the same file.
    #[test]
    fn the_shared_vectors_hold() {
        let raw = include_str!("../../tests/fixtures/cycle-progress-vectors.json");
        let file: Value = serde_json::from_str(raw).unwrap();
        for case in file["cases"].as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            let items_raw: Vec<(String, String, Option<String>, Option<String>)> = case["items"]
                .as_array()
                .unwrap()
                .iter()
                .map(|i| {
                    (
                        s(i, "id").unwrap(),
                        s(i, "caseId").unwrap(),
                        s(i, "flowId"),
                        s(i, "rowId"),
                    )
                })
                .collect();
            let items: Vec<Item> = items_raw
                .iter()
                .map(|(id, case_id, f, r)| Item {
                    id,
                    case_id,
                    flow_id: f.as_deref(),
                    row_id: r.as_deref(),
                })
                .collect();
            let configs_raw: Vec<Option<String>> = case["configurations"]
                .as_array()
                .unwrap()
                .iter()
                .map(|c| c.as_str().map(String::from))
                .collect();
            let configs: Vec<Option<&str>> = configs_raw.iter().map(|c| c.as_deref()).collect();
            let attempts: Vec<CycleAttempt> = case["attempts"]
                .as_array()
                .unwrap()
                .iter()
                .map(|a| {
                    let st = |k: &str| a.get(k).and_then(Value::as_str);
                    CycleAttempt {
                        attempt: Attempt {
                            id: st("id").unwrap(),
                            run_id: st("runId").unwrap(),
                            test_key: st("testKey").unwrap(),
                            configuration_label: st("configurationLabel"),
                            attempt: a["attempt"].as_i64().unwrap_or(0),
                            status: st("status").unwrap(),
                            started_at: st("startedAt"),
                            finished_at: st("finishedAt"),
                            shard_imported_at: st("shardImportedAt"),
                            hlc: st("hlc").unwrap_or(""),
                            declared_flaky: false,
                        },
                        configuration_id: st("configurationId"),
                        case_id: st("caseId"),
                        flow_id: st("flowId"),
                        row_id: st("rowId"),
                    }
                })
                .collect();
            let got = cells(&items, &configs, &attempts);
            let expected = case["expected"].as_array().unwrap();
            assert_eq!(got.len(), expected.len(), "{name}");
            for (g, e) in got.iter().zip(expected) {
                assert_eq!(g.item_id, e["itemId"].as_str().unwrap(), "{name}");
                assert_eq!(g.configuration_id, e["configurationId"].as_str(), "{name}");
                assert_eq!(g.status, e["status"].as_str().unwrap(), "{name}");
                assert_eq!(g.result_id, e["resultId"].as_str(), "{name}");
            }
        }
    }
}
