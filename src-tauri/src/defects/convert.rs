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
//! - the reporter is the card's owner;
//! - the server's limits always hold, so a converted defect is never refused
//!   (old cards had none): the title is cut to 500 UTF-16 units and the
//!   description to 20 000, by whole code points; an empty title becomes the
//!   key (or «—»). Nothing is lost: `data.fromCard` keeps the full original
//!   text of what was cut or replaced, and the card's case ids, which tell a
//!   device what links the converted copy has (`defects::reconcile_pulled`).
//!
//! Revision, HLC and author are the card document's, set by the caller.

use serde_json::{json, Map, Value};

use super::ids;
use super::lifecycle::PRIORITIES;

fn s<'a>(p: &'a Value, k: &str) -> &'a str {
    p.get(k).and_then(Value::as_str).unwrap_or("")
}

/// The server's limits (`DEFECT_PAYLOADS`), in UTF-16 units as zod counts.
pub const MAX_TITLE: usize = 500;
pub const MAX_DESCRIPTION: usize = 20_000;

/// `text` cut to at most `max` UTF-16 units, by whole code points; None
/// when it already fits.
pub fn cut(text: &str, max: usize) -> Option<String> {
    if text.encode_utf16().count() <= max {
        return None;
    }
    let mut used = 0;
    Some(
        text.chars()
            .take_while(|c| {
                used += c.len_utf16();
                used <= max
            })
            .collect(),
    )
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
    let mut seen = std::collections::HashSet::new();
    let case_ids: Vec<String> = data
        .get("testCaseIds")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|c| !c.is_empty() && seen.insert(c.to_string()))
        .map(String::from)
        .collect();
    let mut from_card = Map::new();
    from_card.insert("testCaseIds".into(), json!(case_ids));
    let key = s(card, "cardKey");
    let original_title = s(card, "title");
    let title = if original_title.trim().is_empty() {
        from_card.insert("title".into(), json!(original_title));
        if key.is_empty() {
            "—".to_string()
        } else {
            key.to_string()
        }
    } else if let Some(short) = cut(original_title, MAX_TITLE) {
        from_card.insert("title".into(), json!(original_title));
        short
    } else {
        original_title.to_string()
    };
    let original_description = data
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or("");
    let description = match cut(original_description, MAX_DESCRIPTION) {
        Some(short) => {
            from_card.insert("description".into(), json!(original_description));
            short
        }
        None => original_description.to_string(),
    };
    kept.insert("fromCard".into(), Value::Object(from_card));
    let priority = Some(s(card, "priority"))
        .filter(|p| PRIORITIES.contains(p))
        .unwrap_or("medium");
    let (status, resolution) = status_of(s(card, "status"));
    let defect = json!({
        "id": id,
        "workspaceId": workspace_id,
        "projectId": project_id,
        "defectKey": key,
        "title": title,
        "description": description,
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
    let links = case_ids
        .iter()
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
