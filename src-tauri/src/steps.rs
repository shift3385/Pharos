//! Stable step and row ids of a test case, and the identity of a case revision
//! (DAT-02, ADR-0011). Pure functions: the data migration, the pull, the
//! conflict panel and every save call them; the server has the same code in
//! `server/src/modules/sync/stable-steps.ts`, and both are checked against
//! `tests/fixtures/stable-steps-vectors.json`.
//!
//! Shapes: `Step = { id, text, expected? }` in `data.preconditions`,
//! `data.background`, `data.steps` and `flows[].preconditions|steps`;
//! `ExampleRow = { id, values }` in `data.examples.rows` and
//! `flows[].examples.rows`. Ids are unique within the case (steps and rows
//! share one space; flows have their own).
//!
//! `normalize_case_data` turns anything older into those shapes without losing
//! a character: a string becomes `{id, text}`; an object with a string `text`
//! (or an array `values`) keeps its fields; anything else becomes a step whose
//! text (a row whose only value) is the element's canonical JSON. An element
//! that already has a unique id keeps it. A missing or repeated id is derived
//! from what identifies the slot, so two devices that normalize the same case
//! get the same ids:
//! `crockford32(sha256("<caseId>:<list>:<index>")[..5])`, retrying with
//! `":<n>"` appended while the id is taken. `<list>` is `preconditions`,
//! `background`, `steps`, `examples`, `flows/<flowId>/preconditions|steps|examples`;
//! a flow without an id gets one derived from `flows` and its index.
//!
//! A save (`normalize_new_case_data`) follows the same rules but gives a
//! missing id a random one instead: a derived id could be the one a deleted
//! step had in that slot, and an id is never reused within a case.

use std::collections::HashSet;

use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// UUIDv5 namespace of case revision ids (ADR-0011 rule 3). Never changes.
pub const NS_TEST_CASE_REVISION: Uuid = Uuid::from_u128(0x6f1c_2b7e_4d3a_5e8f_9b10_c2d4_e6f8_a0b2);

/// Lists of steps at the top of `data`, in visiting order.
const STEP_LISTS: [&str; 3] = ["preconditions", "background", "steps"];
/// Lists of steps inside a flow, in visiting order.
const FLOW_STEP_LISTS: [&str; 2] = ["preconditions", "steps"];

/// 8 Crockford base32 characters from the first 40 bits of `sha256(input)`.
fn short_hash(input: &str) -> String {
    let digest = Sha256::digest(input.as_bytes());
    let mut acc: u64 = 0;
    for b in &digest[..5] {
        acc = (acc << 8) | u64::from(*b);
    }
    (0..8)
        .rev()
        .map(|i| ALPHABET[((acc >> (i * 5)) & 0x1f) as usize] as char)
        .collect()
}

/// The derived id of slot `index` of `list`, not yet in `used` (then added).
pub fn derive_id(case_id: &str, list: &str, index: usize, used: &mut HashSet<String>) -> String {
    let base = format!("{case_id}:{list}:{index}");
    let mut n = 0;
    loop {
        let input = if n == 0 {
            base.clone()
        } else {
            format!("{base}:{n}")
        };
        let id = short_hash(&input);
        if used.insert(id.clone()) {
            return id;
        }
        n += 1;
    }
}

/// RFC 8785 (JCS) canonical JSON: keys sorted by UTF-16 code units, numbers in
/// ECMAScript form, strings escaped as JSON requires and nothing more. An
/// integer beyond ±(2^53 - 1) is written as JavaScript reads and writes it
/// (the nearest double), so the server computes the same text. Within the
/// audit subset (`audit::jcs`) both give the same output.
pub fn jcs(value: &Value) -> String {
    let mut out = String::new();
    write_jcs(value, &mut out);
    out
}

fn write_jcs(value: &Value, out: &mut String) {
    match value {
        // serde_json escapes exactly what JCS requires (", \, controls as
        // \b \f \n \r \t or lowercase \u00xx) and nothing else.
        Value::Null | Value::Bool(_) | Value::String(_) => {
            out.push_str(&serde_json::to_string(value).unwrap_or_default())
        }
        Value::Number(n) => {
            const MAX_SAFE: i64 = (1 << 53) - 1;
            if let Some(i) = n.as_i64().filter(|i| (-MAX_SAFE..=MAX_SAFE).contains(i)) {
                out.push_str(&i.to_string());
            } else {
                let f = n.as_f64().unwrap_or(0.0);
                out.push_str(ryu_js::Buffer::new().format_finite(f));
            }
        }
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_jcs(item, out);
            }
            out.push(']');
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            out.push('{');
            for (i, key) in keys.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(key).unwrap_or_default());
                out.push(':');
                write_jcs(&map[key], out);
            }
            out.push('}');
        }
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Step,
    Row,
}

fn valid_id(v: &Value) -> Option<&str> {
    v.get("id")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
}

/// True when the element already has the target shape (its id aside).
fn well_formed(kind: Kind, el: &Value) -> bool {
    match kind {
        Kind::Step => el.get("text").is_some_and(Value::is_string),
        Kind::Row => el.get("values").is_some_and(Value::is_array),
    }
}

/// Calls `f(list, kind, array)` for every list of steps and rows of `data`, in
/// the fixed visiting order. Flow ids must be settled before (`flow_ids`).
fn visit(data: &mut Value, f: &mut dyn FnMut(&str, Kind, &mut Vec<Value>)) {
    let Some(map) = data.as_object_mut() else {
        return;
    };
    for key in STEP_LISTS {
        if let Some(Value::Array(arr)) = map.get_mut(key) {
            f(key, Kind::Step, arr);
        }
    }
    if let Some(Value::Array(rows)) = map
        .get_mut("examples")
        .and_then(|e| e.as_object_mut())
        .and_then(|e| e.get_mut("rows"))
    {
        f("examples", Kind::Row, rows);
    }
    if let Some(Value::Array(flows)) = map.get_mut("flows") {
        for flow in flows.iter_mut() {
            let Some(flow) = flow.as_object_mut() else {
                continue;
            };
            let Some(fid) = flow.get("id").and_then(Value::as_str).map(str::to_string) else {
                continue;
            };
            for key in FLOW_STEP_LISTS {
                if let Some(Value::Array(arr)) = flow.get_mut(key) {
                    f(&format!("flows/{fid}/{key}"), Kind::Step, arr);
                }
            }
            if let Some(Value::Array(rows)) = flow
                .get_mut("examples")
                .and_then(|e| e.as_object_mut())
                .and_then(|e| e.get_mut("rows"))
            {
                f(&format!("flows/{fid}/examples"), Kind::Row, rows);
            }
        }
    }
}

/// Makes the id of a slot: `(list, index, used)` → a new id, added to `used`.
type IdGen<'a> = &'a mut dyn FnMut(&str, usize, &mut HashSet<String>) -> String;

/// A random id not in `used` (then added).
pub fn random_id(used: &mut HashSet<String>) -> String {
    loop {
        let bytes = *Uuid::new_v4().as_bytes();
        let mut acc: u64 = 0;
        for b in &bytes[..5] {
            acc = (acc << 8) | u64::from(*b);
        }
        let id: String = (0..8)
            .rev()
            .map(|i| ALPHABET[((acc >> (i * 5)) & 0x1f) as usize] as char)
            .collect();
        if used.insert(id.clone()) {
            return id;
        }
    }
}

/// Gives every flow object a unique non-empty `id` (first holder keeps it).
fn flow_ids(data: &mut Value, gen: IdGen) {
    let Some(Value::Array(flows)) = data.get_mut("flows") else {
        return;
    };
    let mut used = HashSet::new();
    let mut needs = Vec::new();
    for (i, flow) in flows.iter().enumerate() {
        if !flow.is_object() {
            continue;
        }
        match valid_id(flow) {
            Some(id) if used.insert(id.to_string()) => {}
            _ => needs.push(i),
        }
    }
    for i in needs {
        let id = gen("flows", i, &mut used);
        if let Some(flow) = flows[i].as_object_mut() {
            flow.insert("id".into(), Value::String(id));
        }
    }
}

fn convert(kind: Kind, el: &Value, id: String) -> Value {
    if well_formed(kind, el) {
        let mut obj = el.as_object().cloned().unwrap_or_default();
        obj.insert("id".into(), Value::String(id));
        return Value::Object(obj);
    }
    match (kind, el) {
        (Kind::Step, Value::String(s)) => json!({ "id": id, "text": s }),
        (Kind::Step, other) => json!({ "id": id, "text": jcs(other) }),
        (Kind::Row, Value::Array(values)) => json!({ "id": id, "values": values }),
        (Kind::Row, Value::String(s)) => json!({ "id": id, "values": [s] }),
        (Kind::Row, other) => json!({ "id": id, "values": [jcs(other)] }),
    }
}

/// Brings `data` to the stable-steps shape (module doc) with derived ids:
/// the migration and documents of older clients. Idempotent; true if anything
/// changed. A `data` that is not an object is left alone.
pub fn normalize_case_data(case_id: &str, data: &mut Value) -> bool {
    normalize_with(data, &mut |list, index, used| {
        derive_id(case_id, list, index, used)
    })
}

/// The same for a save: a missing or repeated id gets a random one.
pub fn normalize_new_case_data(data: &mut Value) -> bool {
    normalize_with(data, &mut |_, _, used| random_id(used))
}

fn normalize_with(data: &mut Value, gen: IdGen) -> bool {
    if !data.is_object() {
        return false;
    }
    let before = data.clone();
    flow_ids(data, gen);
    // Pass 1: the first holder of each well-formed id keeps it.
    let mut used: HashSet<String> = HashSet::new();
    let mut keep: Vec<bool> = Vec::new();
    visit(data, &mut |_, kind, arr| {
        for el in arr.iter() {
            let ok =
                well_formed(kind, el) && valid_id(el).is_some_and(|id| used.insert(id.to_string()));
            keep.push(ok);
        }
    });
    // Pass 2: everything else gets a derived id, in visiting order.
    let mut next = 0;
    visit(data, &mut |list, kind, arr| {
        for (i, el) in arr.iter_mut().enumerate() {
            let kept = keep[next];
            next += 1;
            if !kept {
                let id = gen(list, i, &mut used);
                *el = convert(kind, el, id);
            }
        }
    });
    *data != before
}

/// The content of a case revision that its hash covers (ADR-0011 rule 2).
/// `caseType` and `automationStatus` are null until FLD-01 adds them.
#[allow(clippy::too_many_arguments)]
pub fn revision_content(
    scenario_id: &str,
    title: &str,
    version: &str,
    status: &str,
    priority: &str,
    case_type: Option<&str>,
    automation_status: Option<&str>,
    data: &Value,
) -> Value {
    let mut m = Map::new();
    m.insert("scenarioId".into(), json!(scenario_id));
    m.insert("title".into(), json!(title));
    m.insert("version".into(), json!(version));
    m.insert("status".into(), json!(status));
    m.insert("priority".into(), json!(priority));
    m.insert("caseType".into(), json!(case_type));
    m.insert("automationStatus".into(), json!(automation_status));
    m.insert("data".into(), data.clone());
    Value::Object(m)
}

/// `sha256(JCS(content))`, hex.
pub fn content_sha256(content: &Value) -> String {
    crate::audit::sha256_hex(jcs(content).as_bytes())
}

/// `UUIDv5(NS_TEST_CASE_REVISION, "<caseId>:<revision>:<sha>")` (rule 3).
pub fn revision_id(case_id: &str, revision: i64, sha: &str) -> String {
    Uuid::new_v5(
        &NS_TEST_CASE_REVISION,
        format!("{case_id}:{revision}:{sha}").as_bytes(),
    )
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const VECTORS: &str = include_str!("../tests/fixtures/stable-steps-vectors.json");

    fn vectors() -> Value {
        serde_json::from_str(VECTORS).unwrap()
    }

    #[test]
    fn the_shared_jcs_vectors_hold() {
        for v in vectors()["jcs"].as_array().unwrap() {
            assert_eq!(jcs(&v["input"]), v["output"].as_str().unwrap(), "{v}");
        }
    }

    #[test]
    fn the_shared_id_vectors_hold() {
        for v in vectors()["derivedIds"].as_array().unwrap() {
            let mut used = HashSet::new();
            for taken in v["used"].as_array().unwrap() {
                used.insert(taken.as_str().unwrap().to_string());
            }
            let id = derive_id(
                v["caseId"].as_str().unwrap(),
                v["list"].as_str().unwrap(),
                v["index"].as_u64().unwrap() as usize,
                &mut used,
            );
            assert_eq!(id, v["id"].as_str().unwrap(), "{v}");
        }
    }

    #[test]
    fn the_shared_normalization_vectors_hold() {
        for v in vectors()["normalize"].as_array().unwrap() {
            let mut data = v["input"].clone();
            let changed = normalize_case_data(v["caseId"].as_str().unwrap(), &mut data);
            assert_eq!(data, v["output"], "{}", v["name"]);
            assert_eq!(changed, v["input"] != v["output"], "{}", v["name"]);
            // Idempotent.
            let again = data.clone();
            assert!(!normalize_case_data(
                v["caseId"].as_str().unwrap(),
                &mut data
            ));
            assert_eq!(data, again);
        }
    }

    #[test]
    fn the_shared_revision_vectors_hold() {
        for v in vectors()["revisions"].as_array().unwrap() {
            let c = &v["content"];
            let s = |k: &str| c[k].as_str();
            let content = revision_content(
                s("scenarioId").unwrap(),
                s("title").unwrap(),
                s("version").unwrap(),
                s("status").unwrap(),
                s("priority").unwrap(),
                s("caseType"),
                s("automationStatus"),
                &c["data"],
            );
            let sha = content_sha256(&content);
            assert_eq!(sha, v["contentSha256"].as_str().unwrap());
            let id = revision_id(
                v["caseId"].as_str().unwrap(),
                v["revision"].as_i64().unwrap(),
                &sha,
            );
            assert_eq!(id, v["id"].as_str().unwrap());
        }
    }

    #[test]
    fn the_audit_subset_has_the_same_canonical_form() {
        let v = json!({"b": [1, -9007199254740991i64, null, true], "a": {"z": "é
", "y": 1.0}});
        assert_eq!(crate::audit::jcs(&v).unwrap(), jcs(&v));
    }

    #[test]
    fn ids_are_eight_crockford_characters() {
        let mut used = HashSet::new();
        let id = derive_id("c1", "steps", 0, &mut used);
        assert_eq!(id.len(), 8);
        assert!(id.bytes().all(|b| ALPHABET.contains(&b)));
    }

    #[test]
    fn a_taken_id_is_derived_again_with_a_suffix() {
        let mut used = HashSet::new();
        let first = derive_id("c1", "steps", 0, &mut used);
        let second = derive_id("c1", "steps", 0, &mut used);
        assert_ne!(first, second);
        assert_eq!(second, short_hash("c1:steps:0:1"));
    }

    #[test]
    fn reordering_keeps_ids_and_new_text_gets_none_of_the_old_ones() {
        let mut data = json!({"steps": ["a", "b", "c"]});
        normalize_case_data("c1", &mut data);
        let ids: Vec<String> = data["steps"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s["id"].as_str().unwrap().to_string())
            .collect();
        let mut moved = json!({"steps": [
            data["steps"][2].clone(), "new", data["steps"][0].clone(), data["steps"][1].clone()
        ]});
        assert!(normalize_case_data("c1", &mut moved));
        assert_eq!(moved["steps"][0]["id"], ids[2].as_str());
        assert_eq!(moved["steps"][2]["id"], ids[0].as_str());
        assert_eq!(moved["steps"][3]["id"], ids[1].as_str());
        assert!(!ids.contains(&moved["steps"][1]["id"].as_str().unwrap().to_string()));
    }

    #[test]
    fn a_repeated_id_keeps_the_first_holder_and_the_other_fields() {
        let mut data = json!({"steps": [
            {"id": "X", "text": "a"}, {"id": "X", "text": "b", "expected": "e"}
        ]});
        normalize_case_data("c1", &mut data);
        assert_eq!(data["steps"][0]["id"], "X");
        assert_ne!(data["steps"][1]["id"], "X");
        assert_eq!(data["steps"][1]["expected"], "e");
    }

    #[test]
    fn a_different_case_gets_different_ids() {
        let mut a = json!({"steps": ["same"]});
        let mut b = json!({"steps": ["same"]});
        normalize_case_data("c1", &mut a);
        normalize_case_data("c2", &mut b);
        assert_ne!(a["steps"][0]["id"], b["steps"][0]["id"]);
    }

    #[test]
    fn the_revision_hash_ignores_key_order_and_sees_every_content_field() {
        let data = json!({"steps": [{"id": "A", "text": "x"}], "notes": "n"});
        let reordered: Value =
            serde_json::from_str(r#"{"notes":"n","steps":[{"text":"x","id":"A"}]}"#).unwrap();
        let base = revision_content("ATS_001", "t", "1.0", "draft", "medium", None, None, &data);
        let same = revision_content(
            "ATS_001", "t", "1.0", "draft", "medium", None, None, &reordered,
        );
        assert_eq!(content_sha256(&base), content_sha256(&same));
        for other in [
            revision_content("ATS_002", "t", "1.0", "draft", "medium", None, None, &data),
            revision_content("ATS_001", "t2", "1.0", "draft", "medium", None, None, &data),
            revision_content("ATS_001", "t", "1.1", "draft", "medium", None, None, &data),
            revision_content(
                "ATS_001", "t", "1.0", "approved", "medium", None, None, &data,
            ),
            revision_content("ATS_001", "t", "1.0", "draft", "high", None, None, &data),
            revision_content(
                "ATS_001",
                "t",
                "1.0",
                "draft",
                "medium",
                Some("e2e"),
                None,
                &data,
            ),
            revision_content(
                "ATS_001",
                "t",
                "1.0",
                "draft",
                "medium",
                None,
                Some("manual"),
                &data,
            ),
        ] {
            assert_ne!(content_sha256(&base), content_sha256(&other));
        }
    }

    #[test]
    fn two_divergent_revision_fours_have_different_ids() {
        let a = revision_id("c1", 4, "aa");
        let b = revision_id("c1", 4, "bb");
        assert_ne!(a, b);
        assert_eq!(a, revision_id("c1", 4, "aa"));
    }
}
