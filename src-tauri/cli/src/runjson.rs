//! Pharos Run JSON 1.x checked as `parsePharosRun` checks it
//! (`packages/formats/src/schema.ts`), before the core persists it: the core
//! trusts the document it is given, because the app's importers validated it
//! first. Same rules, same issue paths (`results.3.status`), and the
//! cross-checks of the `superRefine`: every attachment and shard `ref` a
//! result, step, note or shard uses exists. Unknown keys pass, as in zod's
//! `looseObject`.

use serde_json::{Map, Value};

pub const SCHEMA_VERSION: &str = "1.0.0";

const RESULT_STATUSES: [&str; 6] = ["passed", "failed", "blocked", "skipped", "pending", "other"];
const ATTACHMENT_KINDS: [&str; 6] = [
    "evidence",
    "screenshot",
    "video",
    "trace",
    "log",
    "raw_report",
];
const SOURCE_FORMATS: [&str; 8] = [
    "cucumber_messages",
    "ctrf",
    "junit",
    "playwright_json",
    "pharos_run_json",
    "sarif",
    "k6",
    "axe",
];
const SEVERITIES: [&str; 5] = ["critical", "high", "medium", "low", "info"];
const TRIGGERS: [&str; 6] = ["manual", "local", "agent", "ci", "cloud", "import"];
const NOTE_KINDS: [&str; 4] = ["note", "bug", "question", "idea"];

#[derive(Clone, Debug, PartialEq)]
pub struct Issue {
    /// Where, as `results.3.status` (empty for the document).
    pub path: String,
    pub message: String,
}

struct Check {
    issues: Vec<Issue>,
}

/// One rule for a field.
#[derive(Clone, Copy)]
enum Rule {
    /// Any string; `min` characters at least.
    Text(usize),
    /// A non-negative integer.
    Count,
    /// A positive integer.
    Positive,
    /// A non-negative number.
    NonNegative,
    /// Any number.
    Number,
    Bool,
    /// ISO text (non-empty) or epoch milliseconds (≥ 0).
    Time,
    OneOf(&'static [&'static str]),
    /// 64 hex characters.
    Sha256,
    /// An object with any keys.
    Record,
    /// An array of strings.
    Texts,
    /// Anything.
    Any,
}

impl Check {
    fn issue(&mut self, path: &str, message: impl Into<String>) {
        self.issues.push(Issue {
            path: path.to_string(),
            message: message.into(),
        });
    }

    fn rule(&mut self, path: &str, value: &Value, rule: Rule) {
        let ok = match rule {
            Rule::Text(min) => value.as_str().is_some_and(|s| s.chars().count() >= min),
            Rule::Count => value.as_u64().is_some() || is_whole(value, 0.0),
            Rule::Positive => value.as_u64().is_some_and(|n| n > 0) || is_whole(value, 1.0),
            Rule::NonNegative => value.as_f64().is_some_and(|n| n >= 0.0),
            Rule::Number => value.is_number(),
            Rule::Bool => value.is_boolean(),
            Rule::Time => match value {
                Value::String(s) => !s.is_empty(),
                Value::Number(n) => n.as_f64().is_some_and(|n| n >= 0.0),
                _ => false,
            },
            Rule::OneOf(options) => value.as_str().is_some_and(|s| options.contains(&s)),
            Rule::Sha256 => value
                .as_str()
                .is_some_and(|s| s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit())),
            Rule::Record => value.is_object(),
            Rule::Texts => value
                .as_array()
                .is_some_and(|a| a.iter().all(Value::is_string)),
            Rule::Any => true,
        };
        if !ok {
            let expected = match rule {
                Rule::Text(0) => "a string".to_string(),
                Rule::Text(n) => format!("a string of at least {n} character(s)"),
                Rule::Count => "an integer ≥ 0".into(),
                Rule::Positive => "an integer > 0".into(),
                Rule::NonNegative => "a number ≥ 0".into(),
                Rule::Number => "a number".into(),
                Rule::Bool => "true or false".into(),
                Rule::Time => "an ISO 8601 time or epoch milliseconds".into(),
                Rule::OneOf(options) => format!("one of {}", options.join(", ")),
                Rule::Sha256 => "64 hexadecimal characters".into(),
                Rule::Record => "an object".into(),
                Rule::Texts => "an array of strings".into(),
                Rule::Any => String::new(),
            };
            self.issue(path, format!("Expected {expected}"));
        }
    }

    /// The fields of `object`: required ones must be there; present ones
    /// (not null for optional ones, as zod's `.optional()` refuses null)
    /// follow their rule.
    fn fields(&mut self, path: &str, object: &Map<String, Value>, spec: &[(&str, bool, Rule)]) {
        for (key, required, rule) in spec {
            let at = join(path, key);
            match object.get(*key) {
                None if *required => self.issue(&at, "Required"),
                None => {}
                Some(value) => self.rule(&at, value, *rule),
            }
        }
    }

    /// `value` must be an object; then `f` checks it.
    fn object<'a>(&mut self, path: &str, value: &'a Value) -> Option<&'a Map<String, Value>> {
        let object = value.as_object();
        if object.is_none() {
            self.issue(path, "Expected an object");
        }
        object
    }

    /// `object[key]`, when present, must be an array; each item is given.
    fn each<'a>(
        &mut self,
        path: &str,
        object: &'a Map<String, Value>,
        key: &str,
    ) -> Vec<(String, &'a Value)> {
        let at = join(path, key);
        match object.get(key) {
            None => Vec::new(),
            Some(Value::Array(items)) => items
                .iter()
                .enumerate()
                .map(|(n, v)| (format!("{at}.{n}"), v))
                .collect(),
            Some(_) => {
                self.issue(&at, "Expected an array");
                Vec::new()
            }
        }
    }
}

fn is_whole(value: &Value, min: f64) -> bool {
    value
        .as_f64()
        .is_some_and(|n| n >= min && n.fract() == 0.0 && n.is_finite())
}

fn join(path: &str, key: &str) -> String {
    if path.is_empty() {
        key.to_string()
    } else {
        format!("{path}.{key}")
    }
}

const STEP: &[(&str, bool, Rule)] = &[
    ("name", false, Rule::Text(0)),
    ("text", false, Rule::Text(0)),
    ("status", true, Rule::OneOf(&RESULT_STATUSES)),
    ("stepId", false, Rule::Text(0)),
    ("keyword", false, Rule::Text(0)),
    ("actual", false, Rule::Text(0)),
    ("durationMs", false, Rule::Count),
    ("gherkinLine", false, Rule::Positive),
    ("attachments", false, Rule::Texts),
];

const RESULT: &[(&str, bool, Rule)] = &[
    ("name", true, Rule::Text(1)),
    ("status", true, Rule::OneOf(&RESULT_STATUSES)),
    ("duration", false, Rule::NonNegative),
    ("start", false, Rule::Time),
    ("stop", false, Rule::Time),
    ("message", false, Rule::Text(0)),
    ("trace", false, Rule::Text(0)),
    ("snippet", false, Rule::Text(0)),
    ("rawStatus", false, Rule::Text(0)),
    ("tags", false, Rule::Texts),
    ("type", false, Rule::Text(0)),
    ("filePath", false, Rule::Text(0)),
    ("retries", false, Rule::Count),
    ("flaky", false, Rule::Bool),
    ("browser", false, Rule::Text(0)),
    ("device", false, Rule::Text(0)),
    ("screenshot", false, Rule::Text(0)),
    ("parameters", false, Rule::Record),
    ("extra", false, Rule::Record),
    ("testKey", false, Rule::Text(1)),
    ("externalId", false, Rule::Text(0)),
    ("caseKey", false, Rule::Text(0)),
    ("flowId", false, Rule::Text(0)),
    ("exampleRowId", false, Rule::Text(0)),
    ("exampleRow", false, Rule::Count),
    ("exampleValues", false, Rule::Any),
    ("configurationLabel", false, Rule::Text(0)),
    ("attempt", false, Rule::Count),
    ("shardRef", false, Rule::Text(0)),
    ("startedAt", false, Rule::Time),
    ("finishedAt", false, Rule::Time),
    ("attributes", false, Rule::Record),
];

const SHARD: &[(&str, bool, Rule)] = &[
    ("ref", false, Rule::Text(0)),
    ("shardIndex", false, Rule::Count),
    ("shardTotal", false, Rule::Positive),
    ("sourceFormat", true, Rule::OneOf(&SOURCE_FORMATS)),
    ("sourceFileSha256", false, Rule::Sha256),
    ("formatVersion", false, Rule::Text(0)),
    ("rawReportRef", false, Rule::Text(0)),
];

const ATTACHMENT: &[(&str, bool, Rule)] = &[
    ("ref", true, Rule::Text(1)),
    ("name", true, Rule::Text(1)),
    ("contentType", false, Rule::Text(0)),
    ("kind", false, Rule::OneOf(&ATTACHMENT_KINDS)),
    ("sha256", false, Rule::Sha256),
    ("size", false, Rule::Count),
    ("path", false, Rule::Text(0)),
];

const FINDING: &[(&str, bool, Rule)] = &[
    ("ruleId", true, Rule::Text(1)),
    ("ruleName", false, Rule::Text(0)),
    ("severity", true, Rule::OneOf(&SEVERITIES)),
    ("rawSeverity", false, Rule::Text(0)),
    ("message", true, Rule::Text(1)),
    ("location", false, Rule::Record),
    ("fingerprint", false, Rule::Text(0)),
    ("standardRefs", false, Rule::Texts),
    ("helpUri", false, Rule::Text(0)),
    ("caseKey", false, Rule::Text(0)),
    ("shardRef", false, Rule::Text(0)),
    ("attributes", false, Rule::Record),
];

const METRIC: &[(&str, bool, Rule)] = &[
    ("name", true, Rule::Text(1)),
    ("aggregation", false, Rule::Text(0)),
    ("scope", false, Rule::Text(0)),
    ("value", true, Rule::Number),
    ("unit", false, Rule::Text(0)),
    ("threshold", false, Rule::Text(0)),
    ("caseKey", false, Rule::Text(0)),
    ("shardRef", false, Rule::Text(0)),
    ("attributes", false, Rule::Record),
];

const RUN: &[(&str, bool, Rule)] = &[
    ("title", false, Rule::Text(0)),
    ("trigger", false, Rule::OneOf(&TRIGGERS)),
    ("sourceTool", false, Rule::Text(0)),
    ("sourceToolVersion", false, Rule::Text(0)),
    ("environment", false, Rule::Text(0)),
    ("build", false, Rule::Text(0)),
    ("commitSha", false, Rule::Text(0)),
    ("branch", false, Rule::Text(0)),
    ("repositoryUrl", false, Rule::Text(0)),
    ("ciUrl", false, Rule::Text(0)),
    ("dataset", false, Rule::Text(0)),
    ("configurationLabel", false, Rule::Text(0)),
    ("startedAt", false, Rule::Time),
    ("finishedAt", false, Rule::Time),
    ("context", false, Rule::Record),
];

const SESSION: &[(&str, bool, Rule)] = &[
    ("charter", true, Rule::Text(1)),
    ("areas", false, Rule::Texts),
    ("timeboxMinutes", false, Rule::Positive),
    ("tester", true, Rule::Text(1)),
    ("startedAt", false, Rule::Time),
    ("endedAt", false, Rule::Time),
];

const NOTE: &[(&str, bool, Rule)] = &[
    ("kind", true, Rule::OneOf(&NOTE_KINDS)),
    ("text", true, Rule::Text(1)),
    ("at", true, Rule::Time),
    ("attachments", false, Rule::Texts),
];

/// The issues of `doc` as Pharos Run JSON 1.x; none means it is valid.
pub fn validate(doc: &Value) -> Vec<Issue> {
    let mut c = Check { issues: Vec::new() };
    let Some(root) = c.object("", doc) else {
        return c.issues;
    };
    match root.get("schemaVersion") {
        None => c.issue("schemaVersion", "Required"),
        Some(Value::String(v)) => {
            let parts: Vec<&str> = v.split('.').collect();
            let semver = parts.len() == 3
                && parts
                    .iter()
                    .all(|p| !p.is_empty() && p.chars().all(|ch| ch.is_ascii_digit()));
            if !semver {
                c.issue(
                    "schemaVersion",
                    "schemaVersion is SemVer (MAJOR.MINOR.PATCH)",
                );
            } else if parts[0] != "1" {
                c.issue(
                    "schemaVersion",
                    "This build reads Pharos Run JSON 1.x; update Pharos to read a newer major.",
                );
            }
        }
        Some(_) => c.issue("schemaVersion", "Expected a string"),
    }
    if let Some(run) = root.get("run") {
        if let Some(run) = c.object("run", run) {
            c.fields("run", run, RUN);
        }
    }

    let mut attachment_refs = std::collections::HashSet::new();
    for (path, a) in c.each("", root, "attachments") {
        if let Some(a) = c.object(&path, a) {
            c.fields(&path, a, ATTACHMENT);
            if let Some(r) = a.get("ref").and_then(Value::as_str) {
                attachment_refs.insert(r.to_string());
            }
        }
    }
    let mut shard_refs = std::collections::HashSet::new();
    let mut raw_refs = Vec::new();
    for (path, s) in c.each("", root, "shards") {
        if let Some(s) = c.object(&path, s) {
            c.fields(&path, s, SHARD);
            if let Some(r) = s.get("ref").and_then(Value::as_str) {
                shard_refs.insert(r.to_string());
            }
            if let Some(r) = s.get("rawReportRef").and_then(Value::as_str) {
                raw_refs.push((join(&path, "rawReportRef"), r.to_string()));
            }
        }
    }

    // The cross-checks run only when the shape is valid, as in schema.ts.
    let mut refs: Vec<(String, String)> = Vec::new();
    let mut shard_uses: Vec<(String, String)> = Vec::new();
    for (path, r) in c.each("", root, "results") {
        let Some(r) = c.object(&path, r) else {
            continue;
        };
        c.fields(&path, r, RESULT);
        if let Some(suite) = r.get("suite") {
            let ok = suite.is_string()
                || suite
                    .as_array()
                    .is_some_and(|a| a.iter().all(Value::is_string));
            if !ok {
                c.issue(
                    &join(&path, "suite"),
                    "Expected a string or an array of strings",
                );
            }
        }
        if let Some(s) = r.get("shardRef").and_then(Value::as_str) {
            shard_uses.push((join(&path, "shardRef"), s.to_string()));
        }
        for (apath, a) in c.each(&path, r, "attachments") {
            match a {
                Value::String(s) => refs.push((apath, s.clone())),
                Value::Object(o) => c.fields(
                    &apath,
                    o,
                    &[
                        ("name", true, Rule::Text(1)),
                        ("contentType", false, Rule::Text(0)),
                        ("path", false, Rule::Text(0)),
                    ],
                ),
                _ => c.issue(&apath, "Expected an attachment ref or an object"),
            }
        }
        for (spath, s) in c.each(&path, r, "steps") {
            let Some(s) = c.object(&spath, s) else {
                continue;
            };
            c.fields(&spath, s, STEP);
            let text = s
                .get("text")
                .and_then(Value::as_str)
                .or_else(|| s.get("name").and_then(Value::as_str))
                .unwrap_or("");
            if text.is_empty() {
                c.issue(
                    &join(&spath, "text"),
                    "A step needs its text (or CTRF name).",
                );
            }
            if let Some(Value::Array(list)) = s.get("attachments") {
                for (n, a) in list.iter().enumerate() {
                    if let Some(a) = a.as_str() {
                        refs.push((format!("{spath}.attachments.{n}"), a.to_string()));
                    }
                }
            }
        }
    }
    for (path, f) in c.each("", root, "findings") {
        if let Some(f) = c.object(&path, f) {
            c.fields(&path, f, FINDING);
            if let Some(s) = f.get("shardRef").and_then(Value::as_str) {
                shard_uses.push((join(&path, "shardRef"), s.to_string()));
            }
        }
    }
    for (path, m) in c.each("", root, "metrics") {
        if let Some(m) = c.object(&path, m) {
            c.fields(&path, m, METRIC);
            match m.get("passed") {
                None | Some(Value::Null) | Some(Value::Bool(_)) => {}
                Some(_) => c.issue(&join(&path, "passed"), "Expected true, false or null"),
            }
            if let Some(s) = m.get("shardRef").and_then(Value::as_str) {
                shard_uses.push((join(&path, "shardRef"), s.to_string()));
            }
        }
    }
    if let Some(session) = root.get("exploratorySession") {
        if let Some(session) = c.object("exploratorySession", session) {
            c.fields("exploratorySession", session, SESSION);
            for (npath, n) in c.each("exploratorySession", session, "notes") {
                let Some(n) = c.object(&npath, n) else {
                    continue;
                };
                c.fields(&npath, n, NOTE);
                if let Some(Value::Array(list)) = n.get("attachments") {
                    for (i, a) in list.iter().enumerate() {
                        if let Some(a) = a.as_str() {
                            refs.push((format!("{npath}.attachments.{i}"), a.to_string()));
                        }
                    }
                }
            }
        }
    }
    if !c.issues.is_empty() {
        return c.issues;
    }
    for (path, r) in refs {
        if !attachment_refs.contains(&r) {
            c.issue(&path, format!("Unknown attachment ref: {r}"));
        }
    }
    for (path, s) in shard_uses {
        if !shard_refs.contains(&s) {
            c.issue(&path, format!("Unknown shard ref: {s}"));
        }
    }
    for (path, r) in raw_refs {
        if !attachment_refs.contains(&r) {
            c.issue(&path, format!("Unknown attachment ref: {r}"));
        }
    }
    c.issues
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const NORMALIZED: &str = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../packages/formats/src/fixtures/ing01/normalized"
    );

    #[test]
    fn every_normalized_snapshot_of_the_formats_package_is_valid() {
        let mut seen = 0;
        for entry in std::fs::read_dir(NORMALIZED).unwrap() {
            let path = entry.unwrap().path();
            let snap: Value =
                serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
            assert_eq!(validate(&snap["doc"]), vec![], "{}", path.display());
            seen += 1;
        }
        assert!(seen >= 10, "only {seen} snapshots");
        let full: Value = serde_json::from_str(include_str!(
            "../../../packages/formats/src/fixtures/full.json"
        ))
        .unwrap();
        assert_eq!(validate(&full), vec![]);
    }

    fn paths(doc: Value) -> Vec<String> {
        validate(&doc).into_iter().map(|i| i.path).collect()
    }

    #[test]
    fn the_shape_is_checked_like_zod() {
        assert_eq!(paths(json!({})), vec!["schemaVersion"]);
        assert_eq!(
            paths(json!({"schemaVersion": "2.0.0"})),
            vec!["schemaVersion"]
        );
        assert_eq!(
            paths(json!({"schemaVersion": "1.0"})),
            vec!["schemaVersion"]
        );
        assert_eq!(paths(json!([])), vec![""]);
        assert_eq!(
            paths(json!({"schemaVersion": "1.4.2", "results": [
                {"name": "ok", "status": "passed"},
                {"name": "", "status": "green", "duration": -1, "tags": [1]},
                {"name": "s", "status": "passed", "steps": [{"status": "passed"}]}
            ]})),
            vec![
                "results.1.name",
                "results.1.status",
                "results.1.duration",
                "results.1.tags",
                "results.2.steps.0.text"
            ]
        );
        assert_eq!(
            paths(json!({"schemaVersion": "1.0.0", "shards": [{"sourceFormat": "xunit"}]})),
            vec!["shards.0.sourceFormat"]
        );
        // Unknown keys pass.
        assert_eq!(
            paths(json!({"schemaVersion": "1.0.0", "x-tool": {"a": 1}})),
            Vec::<String>::new()
        );
    }

    #[test]
    fn refs_must_name_an_attachment_or_a_shard() {
        let doc = json!({
            "schemaVersion": "1.0.0",
            "attachments": [{"ref": "a1", "name": "shot.png"}],
            "shards": [{"ref": "s1", "sourceFormat": "junit", "rawReportRef": "nope"}],
            "results": [{"name": "t", "status": "failed", "shardRef": "s2",
                         "attachments": ["a1", "a2"],
                         "steps": [{"text": "x", "status": "failed", "attachments": ["a3"]}]}],
            "metrics": [{"name": "m", "value": 1, "shardRef": "s1"}]
        });
        let got: Vec<(String, String)> = validate(&doc)
            .into_iter()
            .map(|i| (i.path, i.message))
            .collect();
        assert_eq!(
            got,
            vec![
                (
                    "results.0.attachments.1".into(),
                    "Unknown attachment ref: a2".into()
                ),
                (
                    "results.0.steps.0.attachments.0".into(),
                    "Unknown attachment ref: a3".into()
                ),
                ("results.0.shardRef".into(), "Unknown shard ref: s2".into()),
                (
                    "shards.0.rawReportRef".into(),
                    "Unknown attachment ref: nope".into()
                ),
            ]
        );
    }
}
