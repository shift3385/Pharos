//! Field-level three-way merge of a sync conflict (SYNC-02, ADR-0051).
//!
//! The rules live in `src/shared/contracts/merge-fields.json`; the web runs
//! the same algorithm in TypeScript (`src/modules/sync-offline/domain/merge.ts`)
//! and both pass `src/shared/contracts/fixtures/sync/merge-vectors.json`.
//! Keep them in step: a change here is a change there.
//!
//! `merge(entity, base, local, remote, choices)` takes three payloads of a
//! live entity (a delete against an edit stays a conflict of the whole
//! entity, decided by the caller) and returns:
//! - `Merged`: nothing collides;
//! - `Conflict`: some fields collide, listed by key; the same call with
//!   `choices` resolves them;
//! - `Entity`: a guard tripped (an approval against new content), so the
//!   whole entity is chosen, as before SYNC-02.
//!
//! Conflict keys: a field (`title`, `data.summary`), a group (`group:risk`),
//! an element of a list by id (`data.steps#S1`, one of its keys
//! `data.steps#S1.text`) and a list's order (`data.steps@order`).

use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Deserialize, Clone, Default)]
struct FieldSpec {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    fields: BTreeMap<String, FieldSpec>,
}

#[derive(Deserialize, Default)]
struct Group {
    name: String,
    fields: Vec<String>,
}

#[derive(Deserialize)]
struct Guard {
    name: String,
    fields: Vec<String>,
    #[serde(default)]
    when: Option<String>,
}

#[derive(Deserialize, Default)]
struct EntityRules {
    #[serde(default)]
    fields: BTreeMap<String, FieldSpec>,
    #[serde(default)]
    groups: Vec<Group>,
    #[serde(default)]
    guards: Vec<Guard>,
    #[serde(default)]
    derived: Option<Derived>,
}

/// Copies the core rebuilds from somewhere else (CAS-01, ADR-0055): a
/// conflict that only touches them is resolved to the remote side, and the
/// next save or reconcile rewrites them from the library.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Derived {
    /// Lists of references, each element with `stepIds` (calls) or not.
    refs: Vec<String>,
    /// The lists that hold the copied steps.
    step_lists: Vec<String>,
    /// The table a binding rewrites, when one exists.
    #[serde(default)]
    table: Option<String>,
    /// The keys of a reference the core writes.
    ref_keys: Vec<String>,
}

#[derive(Deserialize)]
struct Bookkeeping {
    remote: Vec<String>,
    max: Vec<String>,
}

#[derive(Deserialize)]
struct Rules {
    bookkeeping: Bookkeeping,
    entities: BTreeMap<String, EntityRules>,
}

fn rules() -> &'static Rules {
    static RULES: OnceLock<Rules> = OnceLock::new();
    RULES.get_or_init(|| {
        serde_json::from_str(include_str!("../../src/shared/contracts/merge-fields.json"))
            .expect("merge-fields.json is valid")
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Local,
    Remote,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Origin {
    Local,
    Remote,
    Both,
}

/// One field (or list element, or list order) both sides changed differently.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldConflict {
    pub key: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub base: Value,
    pub local: Value,
    pub remote: Value,
}

#[derive(Debug, Clone)]
pub enum Outcome {
    Merged {
        merged: Value,
        origins: BTreeMap<String, Origin>,
    },
    /// `merged` holds the remote value where a conflict is still open.
    Conflict {
        merged: Value,
        origins: BTreeMap<String, Origin>,
        conflicts: Vec<FieldConflict>,
    },
    Entity {
        guard: String,
    },
}

/// JSON with sorted keys, an absent value read as `null`: equality of values.
pub fn canonical(v: Option<&Value>) -> String {
    match v {
        None | Some(Value::Null) => "null".into(),
        Some(Value::Array(xs)) => format!(
            "[{}]",
            xs.iter()
                .map(|x| canonical(Some(x)))
                .collect::<Vec<_>>()
                .join(",")
        ),
        Some(Value::Object(m)) => {
            let mut keys: Vec<&String> = m.keys().collect();
            keys.sort();
            format!(
                "{{{}}}",
                keys.iter()
                    .map(|k| format!(
                        "{}:{}",
                        serde_json::to_string(k).unwrap_or_default(),
                        canonical(m.get(*k))
                    ))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
        Some(other) => serde_json::to_string(other).unwrap_or_default(),
    }
}

fn eq(a: Option<&Value>, b: Option<&Value>) -> bool {
    canonical(a) == canonical(b)
}

/// The value at a top-level path (`title`, `data.steps`).
fn at<'a>(p: &'a Value, path: &str) -> Option<&'a Value> {
    match path.strip_prefix("data.") {
        Some(key) => p.get("data").and_then(Value::as_object)?.get(key),
        None => p.get(path),
    }
}

struct Ctx<'a> {
    choices: &'a HashMap<String, Side>,
    conflicts: Vec<FieldConflict>,
}

fn own(v: Option<&Value>) -> Value {
    v.cloned().unwrap_or(Value::Null)
}

fn scalar(
    ctx: &mut Ctx,
    key: &str,
    kind: &str,
    b: Option<&Value>,
    l: Option<&Value>,
    r: Option<&Value>,
) -> Option<Value> {
    if eq(l, r) || eq(r, b) {
        return l.cloned();
    }
    if eq(l, b) {
        return r.cloned();
    }
    match ctx.choices.get(key) {
        Some(Side::Local) => l.cloned(),
        Some(Side::Remote) => r.cloned(),
        None => {
            ctx.conflicts.push(FieldConflict {
                key: key.into(),
                kind: kind.into(),
                base: own(b),
                local: own(l),
                remote: own(r),
            });
            r.cloned()
        }
    }
}

fn as_list(v: Option<&Value>) -> Option<Vec<Value>> {
    match v {
        None | Some(Value::Null) => Some(Vec::new()),
        Some(Value::Array(xs)) => Some(xs.clone()),
        Some(_) => None,
    }
}

/// A list without order: what each side added, minus what either removed.
fn set(
    ctx: &mut Ctx,
    key: &str,
    b: Option<&Value>,
    l: Option<&Value>,
    r: Option<&Value>,
) -> Option<Value> {
    let (Some(bl), Some(ll), Some(rl)) = (as_list(b), as_list(l), as_list(r)) else {
        return scalar(ctx, key, "set", b, l, r);
    };
    if eq(l, r) || eq(r, b) {
        return l.cloned();
    }
    if eq(l, b) {
        return r.cloned();
    }
    let keys =
        |xs: &[Value]| -> HashSet<String> { xs.iter().map(|x| canonical(Some(x))).collect() };
    let (bk, lk, rk) = (keys(&bl), keys(&ll), keys(&rl));
    let mut out: Vec<Value> = ll
        .iter()
        .filter(|x| {
            let k = canonical(Some(x));
            !(bk.contains(&k) && !rk.contains(&k))
        })
        .cloned()
        .collect();
    let mut seen = keys(&out);
    for x in &rl {
        let k = canonical(Some(x));
        if !bk.contains(&k) && !lk.contains(&k) && !seen.contains(&k) {
            out.push(x.clone());
            seen.insert(k);
        }
    }
    Some(Value::Array(out))
}

/// The ids of a list of objects with unique string ids, or None.
fn ids_of(list: &[Value]) -> Option<Vec<String>> {
    let mut ids: Vec<String> = Vec::new();
    for x in list {
        let id = x.as_object()?.get("id")?.as_str()?.to_string();
        if ids.contains(&id) {
            return None;
        }
        ids.push(id);
    }
    Some(ids)
}

/// `ids` in the order `order` has them.
fn relative(order: &[String], ids: &HashSet<String>) -> Vec<String> {
    order
        .iter()
        .filter(|id| ids.contains(*id))
        .cloned()
        .collect()
}

fn by_id(xs: &[Value]) -> HashMap<String, Value> {
    xs.iter()
        .filter_map(|x| Some((x.get("id")?.as_str()?.to_string(), x.clone())))
        .collect()
}

fn as_json_list(ids: &[String]) -> Value {
    Value::Array(ids.iter().map(|s| Value::String(s.clone())).collect())
}

fn id_list(
    ctx: &mut Ctx,
    key: &str,
    spec: &FieldSpec,
    b: Option<&Value>,
    l: Option<&Value>,
    r: Option<&Value>,
) -> Option<Value> {
    let lists = (as_list(b), as_list(l), as_list(r));
    let (Some(bl), Some(ll), Some(rl)) = lists else {
        return scalar(ctx, key, "idList", b, l, r);
    };
    let (Some(bo), Some(lo), Some(ro)) = (ids_of(&bl), ids_of(&ll), ids_of(&rl)) else {
        return scalar(ctx, key, "idList", b, l, r);
    };
    if eq(l, r) || eq(r, b) {
        return l.cloned();
    }
    if eq(l, b) {
        return r.cloned();
    }
    let (bm, lm, rm) = (by_id(&bl), by_id(&ll), by_id(&rl));
    let mut all: Vec<String> = Vec::new();
    for id in bo.iter().chain(lo.iter()).chain(ro.iter()) {
        if !all.contains(id) {
            all.push(id.clone());
        }
    }
    let mut kept: HashMap<String, Value> = HashMap::new();
    for id in &all {
        let ek = format!("{key}#{id}");
        let (be, le, re) = (bm.get(id), lm.get(id), rm.get(id));
        if let Some(be) = be {
            match (le, re) {
                (None, None) => continue,
                (Some(le), Some(re)) => {
                    if let Some(v) =
                        object(ctx, &ek, &spec.fields, Some(be), Some(le), Some(re), false)
                    {
                        kept.insert(id.clone(), v);
                    }
                }
                _ => {
                    // Removed on one side: gone, unless the other changed it.
                    let other = le.or(re).expect("one side has it");
                    if eq(Some(other), Some(be)) {
                        continue;
                    }
                    let side = if le.is_none() {
                        Side::Remote
                    } else {
                        Side::Local
                    };
                    match ctx.choices.get(&ek) {
                        None => {
                            ctx.conflicts.push(FieldConflict {
                                key: ek,
                                kind: "idList".into(),
                                base: be.clone(),
                                local: own(le),
                                remote: own(re),
                            });
                            if let Some(re) = re {
                                kept.insert(id.clone(), re.clone());
                            }
                        }
                        Some(choice) if *choice == side => {
                            kept.insert(id.clone(), other.clone());
                        }
                        Some(_) => {}
                    }
                }
            }
            continue;
        }
        // Added: on one side, or on both (the same id is the same element).
        match (le, re) {
            (Some(le), Some(re)) if !eq(Some(le), Some(re)) => {
                if let Some(v) = scalar(ctx, &ek, "idList", None, Some(le), Some(re)) {
                    kept.insert(id.clone(), v);
                }
            }
            _ => {
                if let Some(v) = le.or(re) {
                    kept.insert(id.clone(), v.clone());
                }
            }
        }
    }
    let ids: HashSet<String> = kept.keys().cloned().collect();
    let (bk, lk, rk) = (
        relative(&bo, &ids),
        relative(&lo, &ids),
        relative(&ro, &ids),
    );
    // Reordered: the ids a side shares with the base are not in its order.
    let moved = |side: &[String]| {
        let common: HashSet<String> = side
            .iter()
            .filter(|id| bm.contains_key(*id))
            .cloned()
            .collect();
        relative(side, &common) != relative(&bk, &common)
    };
    let (mut source, mut other) = (lk.clone(), rk.clone());
    if moved(&rk) && !moved(&lk) {
        (source, other) = (rk.clone(), lk.clone());
    } else if moved(&lk) && moved(&rk) {
        let common: HashSet<String> = lk.iter().filter(|id| rk.contains(id)).cloned().collect();
        if relative(&lk, &common) != relative(&rk, &common) {
            let ok = format!("{key}@order");
            match ctx.choices.get(&ok) {
                Some(Side::Remote) => (source, other) = (rk.clone(), lk.clone()),
                Some(Side::Local) => {}
                None => {
                    ctx.conflicts.push(FieldConflict {
                        key: ok,
                        kind: "idList".into(),
                        base: as_json_list(&bo),
                        local: as_json_list(&lo),
                        remote: as_json_list(&ro),
                    });
                    (source, other) = (rk.clone(), lk.clone());
                }
            }
        }
    }
    let mut order = source;
    for (i, id) in other.iter().enumerate() {
        if order.contains(id) {
            continue;
        }
        // After the nearest element before it on its own side that is placed.
        let mut at = 0;
        for j in (0..i).rev() {
            if let Some(p) = order.iter().position(|x| x == &other[j]) {
                at = p + 1;
                break;
            }
        }
        order.insert(at, id.clone());
    }
    Some(Value::Array(
        order
            .iter()
            .filter_map(|id| kept.get(id).cloned())
            .collect(),
    ))
}

fn is_object_or_absent(v: Option<&Value>) -> bool {
    matches!(v, None | Some(Value::Null) | Some(Value::Object(_)))
}

/// Key by key; a key without a spec is a scalar. `map`: an array value is a set.
fn object(
    ctx: &mut Ctx,
    key: &str,
    fields: &BTreeMap<String, FieldSpec>,
    b: Option<&Value>,
    l: Option<&Value>,
    r: Option<&Value>,
    map: bool,
) -> Option<Value> {
    if !is_object_or_absent(b) || !is_object_or_absent(l) || !is_object_or_absent(r) {
        return scalar(ctx, key, if map { "map" } else { "object" }, b, l, r);
    }
    if eq(l, r) || eq(r, b) {
        return l.cloned();
    }
    if eq(l, b) {
        return r.cloned();
    }
    let empty = Map::new();
    let obj = |v: Option<&Value>| -> Map<String, Value> {
        v.and_then(Value::as_object)
            .cloned()
            .unwrap_or_else(|| empty.clone())
    };
    let (bo, lo, ro) = (obj(b), obj(l), obj(r));
    let mut keys: Vec<String> = Vec::new();
    for k in lo.keys().chain(ro.keys()).chain(bo.keys()) {
        if !keys.contains(k) {
            keys.push(k.clone());
        }
    }
    let mut out = Map::new();
    for k in keys {
        let sub = format!("{key}.{k}");
        let spec = if map {
            let any_array = [bo.get(&k), lo.get(&k), ro.get(&k)]
                .iter()
                .any(|v| matches!(v, Some(Value::Array(_))));
            FieldSpec {
                kind: if any_array {
                    "set".into()
                } else {
                    "scalar".into()
                },
                fields: BTreeMap::new(),
            }
        } else {
            fields.get(&k).cloned().unwrap_or(FieldSpec {
                kind: "scalar".into(),
                fields: BTreeMap::new(),
            })
        };
        if let Some(v) = value(ctx, &sub, &spec, bo.get(&k), lo.get(&k), ro.get(&k)) {
            out.insert(k, v);
        }
    }
    Some(Value::Object(out))
}

fn value(
    ctx: &mut Ctx,
    key: &str,
    spec: &FieldSpec,
    b: Option<&Value>,
    l: Option<&Value>,
    r: Option<&Value>,
) -> Option<Value> {
    match spec.kind.as_str() {
        "set" => set(ctx, key, b, l, r),
        "idList" => id_list(ctx, key, spec, b, l, r),
        "object" => object(ctx, key, &spec.fields, b, l, r, false),
        "map" => object(ctx, key, &BTreeMap::new(), b, l, r, true),
        other => scalar(ctx, key, other, b, l, r),
    }
}

/// Every top-level path of the payloads: their keys, `data` one level down,
/// in the order the first payload that has them gives.
fn paths(ps: &[&Value]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut add = |p: String| {
        if !out.contains(&p) {
            out.push(p);
        }
    };
    for p in ps {
        if let Some(m) = p.as_object() {
            for (k, v) in m {
                match (k.as_str(), v) {
                    ("data", Value::Object(d)) => d.keys().for_each(|dk| add(format!("data.{dk}"))),
                    _ => add(k.clone()),
                }
            }
        }
    }
    out
}

fn bookkeeping(path: &str) -> bool {
    let b = &rules().bookkeeping;
    b.remote.iter().chain(b.max.iter()).any(|k| k == path)
}

/// The guard that trips, if any (see merge-fields.json).
fn tripped_guard(e: &EntityRules, b: &Value, l: &Value, r: &Value) -> Option<String> {
    for g in &e.guards {
        let rest: Vec<String> = paths(&[b, l, r])
            .into_iter()
            .filter(|p| !g.fields.contains(p) && !bookkeeping(p))
            .collect();
        let changed = |side: &Value, set: &[String]| set.iter().any(|p| !eq(at(side, p), at(b, p)));
        let (g_l, g_r) = (changed(l, &g.fields), changed(r, &g.fields));
        let (o_l, o_r) = (changed(l, &rest), changed(r, &rest));
        match &g.when {
            Some(when) => {
                let set_to = |side: &Value| {
                    g.fields.iter().any(|p| {
                        at(side, p).and_then(Value::as_str) == Some(when.as_str())
                            && !eq(at(side, p), at(b, p))
                    })
                };
                if (set_to(l) && o_r) || (set_to(r) && o_l) {
                    return Some(g.name.clone());
                }
            }
            None => {
                if (g_l && !o_l && o_r) || (g_r && !o_r && o_l) {
                    return Some(g.name.clone());
                }
            }
        }
    }
    None
}

pub fn merge(
    entity: &str,
    base: &Value,
    local: &Value,
    remote: &Value,
    choices: &HashMap<String, Side>,
) -> Outcome {
    let first = merge_once(entity, base, local, remote, choices);
    let Outcome::Conflict { conflicts, .. } = &first else {
        return first;
    };
    let Some(d) = rules()
        .entities
        .get(entity)
        .and_then(|e| e.derived.as_ref())
    else {
        return first;
    };
    let mut more = choices.clone();
    let mut added = false;
    for c in conflicts {
        if !more.contains_key(&c.key) && is_derived(d, &c.key, &[base, local, remote]) {
            more.insert(c.key.clone(), Side::Remote);
            added = true;
        }
    }
    if added {
        merge_once(entity, base, local, remote, &more)
    } else {
        first
    }
}

/// True if a conflict key only touches what the core rebuilds (`Derived`).
fn is_derived(d: &Derived, key: &str, sides: &[&Value]) -> bool {
    let refs = |p: &Value, path: &str| -> Vec<Value> {
        at(p, path)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    };
    for path in &d.refs {
        if let Some(rest) = key.strip_prefix(&format!("{path}#")) {
            if let Some((_, sub)) = rest.split_once('.') {
                return d.ref_keys.iter().any(|k| k == sub);
            }
            return false;
        }
    }
    for list in &d.step_lists {
        if let Some(rest) = key.strip_prefix(&format!("{list}#")) {
            let id = rest.split('.').next().unwrap_or(rest);
            return sides.iter().any(|p| {
                d.refs.iter().any(|path| {
                    refs(p, path).iter().any(|r| {
                        r.get("stepIds")
                            .and_then(Value::as_array)
                            .is_some_and(|ids| ids.iter().any(|x| x.as_str() == Some(id)))
                    })
                })
            });
        }
    }
    if let Some(table) = &d.table {
        if key == table
            || key.starts_with(&format!("{table}."))
            || key.starts_with(&format!("{table}#"))
        {
            return sides.iter().any(|p| {
                d.refs
                    .iter()
                    .any(|path| refs(p, path).iter().any(|r| r.get("datasetId").is_some()))
            });
        }
    }
    false
}

fn merge_once(
    entity: &str,
    base: &Value,
    local: &Value,
    remote: &Value,
    choices: &HashMap<String, Side>,
) -> Outcome {
    let none = EntityRules::default();
    let e = rules().entities.get(entity).unwrap_or(&none);
    if let Some(guard) = tripped_guard(e, base, local, remote) {
        return Outcome::Entity { guard };
    }
    let mut ctx = Ctx {
        choices,
        conflicts: Vec::new(),
    };
    let mut origins: BTreeMap<String, Origin> = BTreeMap::new();
    let mut out = Map::new();
    let mut data = Map::new();
    let mut put = |out: &mut Map<String, Value>, path: &str, v: Option<Value>| {
        let Some(v) = v else { return };
        match path.strip_prefix("data.") {
            Some(k) => {
                data.insert(k.to_string(), v);
            }
            None => {
                out.insert(path.to_string(), v);
            }
        }
    };
    let mut note = |path: &str, b: Option<&Value>, l: Option<&Value>, r: Option<&Value>| {
        let (cl, cr) = (!eq(l, b), !eq(r, b));
        let origin = match (cl, cr) {
            (true, true) => Some(Origin::Both),
            (true, false) => Some(Origin::Local),
            (false, true) => Some(Origin::Remote),
            _ => None,
        };
        if let Some(o) = origin {
            origins.insert(path.to_string(), o);
        }
    };
    let grouped: HashSet<&str> = e
        .groups
        .iter()
        .flat_map(|g| g.fields.iter().map(String::as_str))
        .collect();
    for g in &e.groups {
        let pick = |p: &Value| -> Value {
            Value::Object(
                g.fields
                    .iter()
                    .map(|f| (f.clone(), own(at(p, f))))
                    .collect(),
            )
        };
        let (b, l, r) = (pick(base), pick(local), pick(remote));
        let key = format!("group:{}", g.name);
        let v = scalar(&mut ctx, &key, "scalar", Some(&b), Some(&l), Some(&r));
        note(&key, Some(&b), Some(&l), Some(&r));
        for f in &g.fields {
            if [base, local, remote].iter().any(|p| at(p, f).is_some()) {
                put(&mut out, f, v.as_ref().and_then(|v| v.get(f)).cloned());
            }
        }
    }
    let bk = &rules().bookkeeping;
    for path in paths(&[local, remote, base]) {
        if grouped.contains(path.as_str()) {
            continue;
        }
        let (b, l, r) = (at(base, &path), at(local, &path), at(remote, &path));
        if bk.remote.contains(&path) {
            put(&mut out, &path, r.filter(|v| !v.is_null()).or(l).cloned());
            continue;
        }
        if bk.max.contains(&path) {
            let max = [l, r]
                .iter()
                .filter_map(|v| v.and_then(Value::as_str))
                .max()
                .map(|s| Value::String(s.to_string()));
            put(&mut out, &path, max.or_else(|| r.or(l).cloned()));
            continue;
        }
        let spec = e.fields.get(&path).cloned().unwrap_or(FieldSpec {
            kind: "scalar".into(),
            fields: BTreeMap::new(),
        });
        let v = value(&mut ctx, &path, &spec, b, l, r);
        put(&mut out, &path, v);
        note(&path, b, l, r);
    }
    if local.get("data").is_some() || remote.get("data").is_some() {
        out.insert("data".into(), Value::Object(data));
    }
    let merged = Value::Object(out);
    if ctx.conflicts.is_empty() {
        Outcome::Merged { merged, origins }
    } else {
        Outcome::Conflict {
            merged,
            origins,
            conflicts: ctx.conflicts,
        }
    }
}

/// The top-level field a conflict key belongs to (`data.steps#S1.text` →
/// `data.steps`).
pub fn field_of(key: &str) -> String {
    if key.starts_with("group:") {
        return key.to_string();
    }
    let head = key.split(['#', '@']).next().unwrap_or(key);
    let parts: Vec<&str> = head.split('.').collect();
    if parts.first() == Some(&"data") {
        parts.iter().take(2).copied().collect::<Vec<_>>().join(".")
    } else {
        parts[0].to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// The shared vectors, which the TS engine also passes.
    #[test]
    fn passes_the_shared_vectors() {
        let file: Value = serde_json::from_str(include_str!(
            "../../src/shared/contracts/fixtures/sync/merge-vectors.json"
        ))
        .unwrap();
        for v in file["vectors"].as_array().unwrap() {
            let name = v["name"].as_str().unwrap();
            let choices: HashMap<String, Side> =
                serde_json::from_value(v.get("choices").cloned().unwrap_or(json!({}))).unwrap();
            let out = merge(
                v["entity"].as_str().unwrap(),
                &v["base"],
                &v["local"],
                &v["remote"],
                &choices,
            );
            let want = &v["expect"];
            let origins_of = |o: &BTreeMap<String, Origin>| serde_json::to_value(o).unwrap();
            match out {
                Outcome::Entity { guard } => {
                    assert_eq!(want["kind"], "entity", "{name}");
                    assert_eq!(want["guard"], guard.as_str(), "{name}");
                }
                Outcome::Merged { merged, origins } => {
                    assert_eq!(want["kind"], "merged", "{name}");
                    assert_eq!(
                        canonical(Some(&merged)),
                        canonical(want.get("merged")),
                        "{name}"
                    );
                    assert_eq!(origins_of(&origins), want["origins"], "{name}");
                }
                Outcome::Conflict {
                    merged,
                    origins,
                    conflicts,
                } => {
                    assert_eq!(want["kind"], "conflict", "{name}");
                    assert_eq!(
                        canonical(Some(&merged)),
                        canonical(want.get("merged")),
                        "{name}"
                    );
                    assert_eq!(origins_of(&origins), want["origins"], "{name}");
                    let keys: Vec<&str> = conflicts.iter().map(|c| c.key.as_str()).collect();
                    let want_keys: Vec<&str> = want["conflicts"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|k| k.as_str().unwrap())
                        .collect();
                    assert_eq!(keys, want_keys, "{name}");
                }
            }
        }
    }

    #[test]
    fn names_the_field_of_a_conflict_key() {
        assert_eq!(field_of("title"), "title");
        assert_eq!(field_of("data.steps#S1.text"), "data.steps");
        assert_eq!(field_of("data.steps@order"), "data.steps");
        assert_eq!(field_of("data.examples.rows#R1"), "data.examples");
        assert_eq!(field_of("group:risk"), "group:risk");
    }
}
