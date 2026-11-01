//! The conversion of a planner defect card into a defect (ADR-0016, «Impacto
//! en sync y migraciones»). One pure function over the camelCase payloads, so
//! the local migration, a pulled card and the server's migration 0010 (its TS
//! twin in `server/src/modules/sync/defects.ts`) all produce the same defect
//! and the same links: two devices that convert apart converge.
//!
//! - `id` is the card's and `defectKey` its `cardKey` ('' if it never had one);
//! - title and priority are kept, severity is `major`;
//! - the column becomes the status: `backlog → new`, `in_progress →
//!   in_progress`, `in_review → retest`, `done → closed` with resolution
//!   `fixed`;
//! - `data.description` becomes the description; `data.testCaseIds` become
//!   `test_case` links (deterministic ids, duplicates collapsed); every other
//!   key of `data` (labels…) stays in `data`;
//! - the reporter is the card's owner.
//!
//! Revision, HLC and author are the card document's, set by the caller.

use serde_json::{json, Map, Value};

use super::ids;
use super::lifecycle::PRIORITIES;

fn s<'a>(p: &'a Value, k: &str) -> &'a str {
    p.get(k).and_then(Value::as_str).unwrap_or("")
}

/// The status of a card's column.
pub fn status_of(column: &str) -> (&'static str, Option<&'static str>) {
    match column {
        "in_progress" => ("in_progress", None),
        "in_review" => ("retest", None),
        "done" => ("closed", Some("fixed")),
        _ => ("new", None),
    }
}

/// The defect payload and the link payloads of a card payload.
pub fn from_card(card: &Value) -> (Value, Vec<Value>) {
    let id = s(card, "id");
    let project_id = s(card, "projectId");
    let workspace_id = s(card, "workspaceId");
    let empty = Map::new();
    let data = card
        .get("data")
        .and_then(Value::as_object)
        .unwrap_or(&empty);
    let mut kept = data.clone();
    kept.remove("description");
    kept.remove("testCaseIds");
    let priority = Some(s(card, "priority"))
        .filter(|p| PRIORITIES.contains(p))
        .unwrap_or("medium");
    let (status, resolution) = status_of(s(card, "status"));
    let defect = json!({
        "id": id,
        "workspaceId": workspace_id,
        "projectId": project_id,
        "defectKey": s(card, "cardKey"),
        "title": s(card, "title"),
        "description": data.get("description").and_then(Value::as_str).unwrap_or(""),
        "stepsToReproduce": "",
        "expected": null,
        "actual": null,
        "severity": "major",
        "priority": priority,
        "status": status,
        "resolution": resolution,
        "foundInRunId": null,
        "foundInBuild": null,
        "foundInEnvironment": null,
        "fixedInBuild": null,
        "reporter": s(card, "ownerId"),
        "assignee": null,
        "externalSystem": null,
        "externalKey": null,
        "externalUrl": null,
        "externalSyncedAt": null,
        "data": Value::Object(kept),
        "createdAt": card.get("createdAt").cloned().unwrap_or(Value::Null),
        "updatedAt": card.get("updatedAt").cloned().unwrap_or(Value::Null),
    });
    let mut seen = std::collections::HashSet::new();
    let links = data
        .get("testCaseIds")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|c| !c.is_empty() && seen.insert(c.to_string()))
        .map(|case_id| {
            json!({
                "id": ids::link_id(id, "test_case", case_id),
                "workspaceId": workspace_id,
                "projectId": project_id,
                "defectId": id,
                "targetKind": "test_case",
                "targetId": case_id,
                "createdAt": card.get("createdAt").cloned().unwrap_or(Value::Null),
                "updatedAt": card.get("updatedAt").cloned().unwrap_or(Value::Null),
            })
        })
        .collect();
    (defect, links)
}

#[cfg(test)]
mod tests {
    use super::*;

    const VECTORS: &str = include_str!("../../tests/fixtures/defect-vectors.json");

    #[test]
    fn cards_convert_as_the_shared_vectors_say() {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        for x in v["cards"].as_array().unwrap() {
            let (defect, links) = from_card(&x["card"]);
            assert_eq!(defect, x["defect"], "{}", x["card"]["id"]);
            assert_eq!(Value::Array(links), x["links"], "{}", x["card"]["id"]);
        }
        for x in v["linkIds"].as_array().unwrap() {
            let s = |k: &str| x[k].as_str().unwrap();
            assert_eq!(
                ids::link_id(s("defectId"), s("targetKind"), s("targetId")),
                s("id")
            );
        }
    }
}
