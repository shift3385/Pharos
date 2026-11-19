//! JUnit XML → Pharos Run JSON for local mode (INT-01 L4, ADR-0054 §1): a
//! port of `packages/formats/src/importers/junit.ts` (and the helpers it uses
//! from `common.ts` and `xml.ts`). The contract is `@pharos/formats`'s
//! committed snapshots (`fixtures/ing01/normalized/*junit*`, ADR-0053 §1):
//! the tests below parse every JUnit sample and compare the document with its
//! snapshot. A change of the TS parser bumps `NORMALIZER_VERSION`; this port
//! writes the version it reproduces, so the shards it writes say so.
//!
//! The XML is read into a small tree with `quick-xml`, without a DTD (one in
//! the prolog is refused, as `xml.ts` does) and with the XML 1.0 line-end and
//! attribute-value normalization a DOM parser applies.

use std::collections::HashSet;

use quick_xml::events::Event;
use quick_xml::{Reader, XmlVersion};
use regex::Regex;
use serde_json::{json, Map, Value};

/// The `NORMALIZER_VERSION` of `@pharos/formats` this port reproduces.
pub const NORMALIZER_VERSION: u64 = 1;

/// A JUnit report that cannot be read, with the code `ReportError` uses.
#[derive(Debug, PartialEq)]
pub struct JunitError {
    /// `invalid-xml` or `unknown-format`.
    pub code: &'static str,
    /// `doctype` for a DTD, else the parser's message.
    pub detail: Option<String>,
}

fn invalid(detail: impl Into<String>) -> JunitError {
    JunitError {
        code: "invalid-xml",
        detail: Some(detail.into()),
    }
}

// ---- a small DOM ---------------------------------------------------------------------

struct Element {
    /// The local name (`localName`), without a namespace prefix.
    local: String,
    /// The name as written (`ns:testsuite`), for `getElementsByTagName`.
    qname: String,
    /// Attributes by qualified name, normalized.
    attrs: Vec<(String, String)>,
    children: Vec<Node>,
}

enum Node {
    Element(Element),
    Text(String),
}

impl Element {
    /// `getAttribute(name)`: `None` when absent.
    fn attr(&self, name: &str) -> Option<&str> {
        self.attrs
            .iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.as_str())
    }

    /// `getAttribute(name) || undefined`.
    fn attr_nonempty(&self, name: &str) -> Option<&str> {
        self.attr(name).filter(|v| !v.is_empty())
    }

    /// The element children, optionally only those called `name`.
    fn elements<'a>(&'a self, name: Option<&'a str>) -> impl Iterator<Item = &'a Element> + 'a {
        self.children.iter().filter_map(move |c| match c {
            Node::Element(e) if name.map_or(true, |n| e.local == n) => Some(e),
            _ => None,
        })
    }

    /// `textContent`: every descendant text and CDATA, in order.
    fn text(&self) -> String {
        let mut out = String::new();
        self.collect_text(&mut out);
        out
    }

    fn collect_text(&self, out: &mut String) {
        for c in &self.children {
            match c {
                Node::Text(t) => out.push_str(t),
                Node::Element(e) => e.collect_text(out),
            }
        }
    }

    /// `getElementsByTagName(name)` below this element (not itself), in
    /// document order, by qualified name as written.
    fn descendants_named<'a>(&'a self, qname: &str, out: &mut Vec<&'a Element>) {
        for c in &self.children {
            if let Node::Element(e) = c {
                if e.qname == qname {
                    out.push(e);
                }
                e.descendants_named(qname, out);
            }
        }
    }
}

/// True when the prolog (before the root element) declares a DTD
/// (`prologHasDoctype` in `xml.ts`): only the prolog is read, so a
/// `<!DOCTYPE html>` inside a test's captured output is content.
pub fn prolog_has_doctype(text: &str) -> bool {
    let mut rest = text;
    loop {
        rest = rest.trim_start_matches(|c: char| c == '\u{feff}' || js_space(c));
        if let Some(after) = rest.strip_prefix("<?") {
            match after.find("?>") {
                Some(end) => rest = &after[end + 2..],
                None => return false,
            }
        } else if let Some(after) = rest.strip_prefix("<!--") {
            match after.find("-->") {
                Some(end) => rest = &after[end + 3..],
                None => return false,
            }
        } else {
            let head: String = rest.chars().take(9).collect();
            return head.eq_ignore_ascii_case("<!DOCTYPE");
        }
    }
}

/// JavaScript's `\s` and `trim()` whitespace (it includes U+FEFF).
fn js_space(c: char) -> bool {
    c.is_whitespace() || c == '\u{feff}'
}

fn js_trim(s: &str) -> &str {
    s.trim_matches(js_space)
}

/// Resolves `&name;` and `&#n;` in text: only the five predefined entities
/// exist without a DTD.
fn reference(name: &str) -> Result<String, JunitError> {
    if let Some(num) = name.strip_prefix('#') {
        let code = match num.strip_prefix('x') {
            Some(hex) => u32::from_str_radix(hex, 16),
            None => num.parse::<u32>(),
        }
        .map_err(|_| invalid(format!("bad character reference &{name};")))?;
        return char::from_u32(code)
            .filter(|c| *c != '\0')
            .map(String::from)
            .ok_or_else(|| invalid(format!("bad character reference &{name};")));
    }
    Ok(match name {
        "amp" => "&",
        "lt" => "<",
        "gt" => ">",
        "apos" => "'",
        "quot" => "\"",
        _ => return Err(invalid(format!("undefined entity &{name};"))),
    }
    .to_string())
}

fn parse_xml(text: &str) -> Result<Element, JunitError> {
    if prolog_has_doctype(text) {
        return Err(JunitError {
            code: "invalid-xml",
            detail: Some("doctype".into()),
        });
    }
    let mut reader = Reader::from_str(text);
    reader.config_mut().check_end_names = true;
    let mut stack: Vec<Element> = Vec::new();
    let mut root: Option<Element> = None;

    let open = |e: &quick_xml::events::BytesStart| -> Result<Element, JunitError> {
        let mut attrs = Vec::new();
        for a in e.attributes() {
            let a = a.map_err(|err| invalid(err.to_string()))?;
            let key = String::from_utf8_lossy(a.key.as_ref()).to_string();
            let value = a
                .normalized_value(XmlVersion::Implicit1_0)
                .map_err(|err| invalid(err.to_string()))?
                .to_string();
            attrs.push((key, value));
        }
        Ok(Element {
            local: String::from_utf8_lossy(e.local_name().as_ref()).to_string(),
            qname: String::from_utf8_lossy(e.name().as_ref()).to_string(),
            attrs,
            children: Vec::new(),
        })
    };
    // Text goes into the open element; outside the root only whitespace may
    // appear, as a DOM parser requires.
    let push_text = |stack: &mut Vec<Element>, t: String| -> Result<(), JunitError> {
        match stack.last_mut() {
            Some(e) => {
                if let Some(Node::Text(prev)) = e.children.last_mut() {
                    prev.push_str(&t);
                } else {
                    e.children.push(Node::Text(t));
                }
                Ok(())
            }
            None if t.chars().all(js_space) => Ok(()),
            None => Err(invalid("text outside the root element")),
        }
    };
    let close = |stack: &mut Vec<Element>,
                 root: &mut Option<Element>,
                 done: Element|
     -> Result<(), JunitError> {
        match stack.last_mut() {
            Some(parent) => {
                parent.children.push(Node::Element(done));
                Ok(())
            }
            None if root.is_none() => {
                *root = Some(done);
                Ok(())
            }
            None => Err(invalid("more than one root element")),
        }
    };

    loop {
        let event = reader
            .read_event()
            .map_err(|e| invalid(format!("{e} at byte {}", reader.error_position())))?;
        let second_root = root.is_some() && stack.is_empty();
        match event {
            Event::Start(_) | Event::Empty(_) if second_root => {
                return Err(invalid("more than one root element"));
            }
            Event::Start(e) => {
                let el = open(&e)?;
                stack.push(el);
            }
            Event::Empty(e) => {
                let el = open(&e)?;
                close(&mut stack, &mut root, el)?;
            }
            Event::End(_) => {
                let done = stack.pop().ok_or_else(|| invalid("unexpected end tag"))?;
                close(&mut stack, &mut root, done)?;
            }
            Event::Text(t) => {
                let t = t
                    .xml_content(XmlVersion::Implicit1_0)
                    .map_err(|e| invalid(e.to_string()))?
                    .to_string();
                push_text(&mut stack, t)?;
            }
            Event::CData(t) => {
                let t = t
                    .xml_content(XmlVersion::Implicit1_0)
                    .map_err(|e| invalid(e.to_string()))?
                    .to_string();
                if stack.is_empty() {
                    return Err(invalid("CDATA outside the root element"));
                }
                push_text(&mut stack, t)?;
            }
            Event::GeneralRef(r) => {
                let name = r.decode().map_err(|e| invalid(e.to_string()))?.to_string();
                let t = reference(&name)?;
                if stack.is_empty() {
                    return Err(invalid("reference outside the root element"));
                }
                push_text(&mut stack, t)?;
            }
            Event::DocType(_) => {
                return Err(JunitError {
                    code: "invalid-xml",
                    detail: Some("doctype".into()),
                })
            }
            Event::Comment(_) | Event::PI(_) | Event::Decl(_) => {}
            Event::Eof => break,
        }
    }
    if !stack.is_empty() {
        return Err(invalid("unclosed element at the end of the document"));
    }
    root.ok_or_else(|| invalid("no root element"))
}

// ---- common.ts ---------------------------------------------------------------------

/// `slashes`: `\` → `/`, without leading `./`.
fn slashes(path: &str) -> String {
    let mut p = path.replace('\\', "/");
    while let Some(rest) = p.strip_prefix("./") {
        p = rest.to_string();
    }
    p
}

fn is_absolute(p: &str) -> bool {
    let b = p.as_bytes();
    (b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && b[2] == b'/')
        || p.starts_with('/')
}

/// `STABLE_PREFIXES` of `common.ts`: homes and CI workspaces.
fn stable_prefixes() -> &'static [Regex] {
    static P: std::sync::OnceLock<Vec<Regex>> = std::sync::OnceLock::new();
    P.get_or_init(|| {
        [
            r"^/home/runner/work/[^/]+/[^/]+/",
            r"^[a-z]:/a/[^/]+/[^/]+/",
            r"^/github/workspace/",
            r"^/builds/[^/]+/[^/]+/",
            r"^/var/lib/jenkins/workspace/[^/]+/",
            r"^[a-z]:/(?:jenkins|agent)/workspace/[^/]+/",
            r"^/home/vsts/work/[0-9]+/s/",
            r"^[a-z]:/agent/_work/[0-9]+/s/",
            r"^/opt/atlassian/pipelines/agent/build/",
            r"^/home/circleci/(?:project/)?",
            r"^/(?:workspace|app|src)/",
            r"^[a-z]:/users/[^/]+/",
            r"^/users/[^/]+/",
            r"^/home/[^/]+/",
            r"^/root/",
        ]
        .iter()
        .map(|p| Regex::new(&format!("(?i){p}")).expect("valid prefix"))
        .collect()
    })
}

/// `relativizer()` without a root: a relative path stays; an absolute one
/// loses a home or CI workspace prefix, else its drive and leading `/`.
fn relativize(p: &str) -> String {
    let n = slashes(p);
    if !is_absolute(&n) {
        return n;
    }
    for prefix in stable_prefixes() {
        if prefix.is_match(&n) {
            return prefix.replace(&n, "").to_string();
        }
    }
    let n = Regex::new(r"^[a-zA-Z]:/")
        .expect("drive")
        .replace(&n, "")
        .to_string();
    n.trim_start_matches('/').to_string()
}

/// `testKey(path, [title])`.
fn test_key(path: Option<&str>, title: &str) -> String {
    match path {
        Some(p) => format!("{p}::{title}"),
        None => title.to_string(),
    }
}

/// `rowOfTitle`: Playwright `Example #n`, or cucumber-js `- #1.n`, as a
/// 0-based row.
fn row_of_title(title: &str) -> Option<u64> {
    static PW: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    static CUC: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let pw = PW.get_or_init(|| Regex::new(r"(?:^|\s)Example #([0-9]+)$").expect("pw"));
    if let Some(m) = pw.captures(title) {
        return m[1].parse::<u64>().ok().map(|n| n.wrapping_sub(1));
    }
    let cuc = CUC.get_or_init(|| Regex::new(r" - #([0-9]+)\.([0-9]+)(?::|$)").expect("cuc"));
    if let Some(m) = cuc.captures(title) {
        if &m[1] == "1" {
            return m[2].parse::<u64>().ok().map(|n| n.wrapping_sub(1));
        }
    }
    None
}

/// `atTag`.
fn at_tag(tag: &str) -> String {
    if tag.starts_with('@') {
        tag.to_string()
    } else {
        format!("@{tag}")
    }
}

/// `uniqueTags`: trimmed, without empties, first occurrence kept.
fn unique_tags(tags: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = HashSet::new();
    tags.into_iter()
        .map(|t| js_trim(&t).to_string())
        .filter(|t| !t.is_empty() && seen.insert(t.clone()))
        .collect()
}

/// `kindOf(name)` without a content type.
fn kind_of(name: &str) -> &'static str {
    let n = name.to_lowercase();
    if n == "trace" || n.ends_with(".zip") {
        "trace"
    } else if n.ends_with(".log") {
        "log"
    } else {
        "evidence"
    }
}

/// `"a, b c".split(/[\s,]+/)`, keeping the empty first or last piece JS keeps.
fn split_tags(v: &str) -> Vec<String> {
    let mut out = vec![String::new()];
    let mut in_sep = false;
    for c in v.chars() {
        if js_space(c) || c == ',' {
            if !in_sep {
                out.push(String::new());
                in_sep = true;
            }
        } else {
            in_sep = false;
            out.last_mut().expect("one piece").push(c);
        }
    }
    out
}

/// `seconds`: a `time` attribute in seconds → whole milliseconds, as JS
/// `Number(v.replace(",", "."))` reads it (an empty text is 0).
fn millis(v: Option<&str>) -> Option<u64> {
    let v = v?.replacen(',', ".", 1);
    let t = js_trim(&v);
    let n = if t.is_empty() {
        0.0
    } else {
        t.parse::<f64>().ok()?
    };
    // JS refuses `inf`, `nan` and friends, Rust parses them.
    if !n.is_finite()
        || n < 0.0
        || t.chars()
            .any(|c| c.is_ascii_alphabetic() && c != 'e' && c != 'E')
    {
        return None;
    }
    // Math.round: half up.
    Some((n * 1000.0 + 0.5).floor() as u64)
}

// ---- junit.ts ------------------------------------------------------------------------

const RETRIES: [&str; 4] = ["flakyFailure", "flakyError", "rerunFailure", "rerunError"];

/// Parses a JUnit report (the text after its BOM and leading whitespace) into
/// a Pharos Run JSON document, as `parseJunit` does.
pub fn parse(text: &str) -> Result<Value, JunitError> {
    let text = text
        .trim_start_matches('\u{feff}')
        .trim_start_matches(js_space);
    // XML 1.0 line ends (§2.11), before anything else reads the text.
    let text = text.replace("\r\n", "\n").replace('\r', "\n");
    let root = parse_xml(&text)?;
    if root.local != "testsuites" && root.local != "testsuite" {
        return Err(JunitError {
            code: "unknown-format",
            detail: None,
        });
    }

    // Every testcase with the suite chain around it.
    let mut cases: Vec<(&Element, Vec<&Element>)> = Vec::new();
    fn walk<'a>(
        el: &'a Element,
        suites: Vec<&'a Element>,
        cases: &mut Vec<(&'a Element, Vec<&'a Element>)>,
    ) {
        for c in el.elements(None) {
            if c.local == "testsuite" {
                let mut chain = suites.clone();
                chain.push(c);
                walk(c, chain, cases);
            } else if c.local == "testcase" {
                cases.push((c, suites.clone()));
            }
        }
    }
    if root.local == "testsuite" {
        walk(&root, vec![&root], &mut cases);
    } else {
        walk(&root, Vec::new(), &mut cases);
    }

    // `xml.getElementsByTagName("testsuite")`: the root too.
    let mut suites_all: Vec<&Element> = Vec::new();
    if root.qname == "testsuite" {
        suites_all.push(&root);
    }
    root.descendants_named("testsuite", &mut suites_all);
    let mut stamps: Vec<String> = suites_all
        .iter()
        .filter_map(|s| s.attr_nonempty("timestamp").map(String::from))
        .collect();
    // JS sorts by UTF-16 code units.
    stamps.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));

    let mut run = Map::new();
    run.insert("trigger".into(), json!("import"));
    if let Some(tool) = root.attr_nonempty("name") {
        run.insert("sourceTool".into(), json!(tool));
    }
    if let Some(first) = stamps.first() {
        run.insert("startedAt".into(), json!(first));
    }
    run.insert("context".into(), json!({}));

    let mut results: Vec<Value> = Vec::new();
    let mut attachments: Vec<Value> = Vec::new();
    let mut next_ref = 0u64;
    let attachment_re = Regex::new(r"\[\[ATTACHMENT\|([^\]]+)\]\]").expect("attachment");

    for (el, suites) in &cases {
        let name = el.attr("name").unwrap_or("");
        let raw_path = el
            .attr_nonempty("classname")
            .or_else(|| el.attr_nonempty("file"))
            .or_else(|| suites.last().and_then(|s| s.attr_nonempty("name")))
            .unwrap_or("");
        // A classname that is a path is relativized; a Java/Cucumber class
        // name is kept as it is.
        let is_path = raw_path.contains(['/', '\\']);
        let path = if is_path {
            relativize(&slashes(raw_path))
        } else {
            raw_path.to_string()
        };

        // Properties by name, in the order of their first appearance.
        let mut props: Vec<(String, Vec<String>)> = Vec::new();
        for ps in el.elements(Some("properties")) {
            for p in ps.elements(Some("property")) {
                let k = p.attr("name").unwrap_or("").to_string();
                // `getAttribute("value") ?? textContent`: the DOM gives null
                // for a missing attribute, so the text is used.
                let v = match p.attr("value") {
                    Some(v) => v.to_string(),
                    None => p.text(),
                };
                match props.iter_mut().find(|(name, _)| *name == k) {
                    Some((_, values)) => values.push(v),
                    None => props.push((k, vec![v])),
                }
            }
        }
        let prop = |k: &str| -> Vec<String> {
            props
                .iter()
                .find(|(name, _)| name == k)
                .map(|(_, v)| v.clone())
                .unwrap_or_default()
        };
        let mut tag_list: Vec<String> = prop("test_id").iter().map(|t| at_tag(t)).collect();
        for v in prop("tag").iter().chain(prop("tags").iter()) {
            tag_list.extend(split_tags(v).iter().map(|t| at_tag(t)));
        }
        let tags = unique_tags(tag_list);
        let requirement_keys = prop("requirement");

        let out: Vec<String> = el
            .elements(Some("system-out"))
            .chain(el.elements(Some("system-err")))
            .map(Element::text)
            .collect();
        let out = out.join("\n");
        let mut refs: Vec<String> = Vec::new();
        for m in attachment_re.captures_iter(&out) {
            let p = js_trim(&m[1]).to_string();
            next_ref += 1;
            let reference = format!("a{next_ref}");
            let file_name = p
                .rsplit(['/', '\\'])
                .next()
                .filter(|s| !s.is_empty())
                .unwrap_or("attachment")
                .to_string();
            attachments.push(json!({
                "ref": reference, "name": file_name, "kind": kind_of(&file_name), "path": p
            }));
            refs.push(reference);
        }

        let fail = el
            .elements(None)
            .find(|x| x.local == "failure" || x.local == "error");
        let skipped = el.elements(Some("skipped")).next();
        let retries: Vec<&Element> = el
            .elements(None)
            .filter(|x| RETRIES.contains(&x.local.as_str()))
            .collect();
        let key = test_key((!path.is_empty()).then_some(path.as_str()), name);
        let row = row_of_title(name);

        let mut base = Map::new();
        base.insert("name".into(), json!(name));
        base.insert("testKey".into(), json!(key));
        if !path.is_empty() && is_path {
            base.insert("filePath".into(), json!(path));
        }
        if !path.is_empty() {
            base.insert("suite".into(), json!([path]));
        }
        base.insert("tags".into(), json!(tags));
        if let Some(row) = row {
            base.insert("exampleRow".into(), json!(row));
        }
        base.insert("shardRef".into(), json!("s1"));

        let message_of = |x: &Element| x.attr_nonempty("message").map(String::from);
        let trace_of = |x: &Element| {
            let t = x.text();
            let t = js_trim(&t);
            (!t.is_empty()).then(|| t.to_string())
        };
        // After reruns, the <failure> is the first run and the last rerun the
        // final attempt; flaky elements precede a pass.
        let reruns: Vec<&Element> = retries
            .iter()
            .copied()
            .filter(|r| r.local.starts_with("rerun"))
            .collect();
        let runs: Vec<&Element> = match fail {
            Some(f) if !reruns.is_empty() => std::iter::once(f).chain(reruns).collect(),
            _ => retries.iter().copied().chain(fail).collect(),
        };
        let (earlier, last): (Vec<&Element>, Option<&Element>) = match fail {
            Some(_) => (runs[..runs.len() - 1].to_vec(), runs.last().copied()),
            None => (retries.clone(), None),
        };
        for (i, r) in earlier.iter().enumerate() {
            let mut attempt = base.clone();
            attempt.insert("status".into(), json!("failed"));
            attempt.insert("rawStatus".into(), json!(r.local));
            attempt.insert("attempt".into(), json!(i));
            if let Some(ms) = millis(r.attr("time")) {
                attempt.insert("duration".into(), json!(ms));
            }
            if let Some(m) = message_of(r) {
                attempt.insert("message".into(), json!(m));
            }
            if let Some(t) = trace_of(r) {
                attempt.insert("trace".into(), json!(t));
            }
            results.push(Value::Object(attempt));
        }

        let status = if fail.is_some() {
            "failed"
        } else if skipped.is_some() {
            "skipped"
        } else {
            "passed"
        };
        let flaky = fail.is_none() && retries.iter().any(|r| r.local.starts_with("flaky"));
        let mut attributes = Map::new();
        if flaky {
            attributes.insert("flaky".into(), json!(true));
        }
        if !requirement_keys.is_empty() {
            attributes.insert("requirementKeys".into(), json!(requirement_keys));
        }
        let other: Vec<&(String, Vec<String>)> = props
            .iter()
            .filter(|(k, _)| !["test_id", "requirement", "tag", "tags"].contains(&k.as_str()))
            .collect();
        if !other.is_empty() {
            let mut properties = Map::new();
            for (k, v) in other {
                let value = if v.len() == 1 { json!(v[0]) } else { json!(v) };
                properties.insert(k.clone(), value);
            }
            attributes.insert("properties".into(), Value::Object(properties));
        }

        let mut result = base;
        result.insert("status".into(), json!(status));
        let raw_status = match (last, skipped) {
            (Some(l), _) => l.local.clone(),
            (None, Some(_)) => "skipped".into(),
            (None, None) => "passed".into(),
        };
        result.insert("rawStatus".into(), json!(raw_status));
        result.insert("attempt".into(), json!(earlier.len()));
        if let Some(ms) = millis(el.attr("time")) {
            result.insert("duration".into(), json!(ms));
        }
        if let Some(m) = last.and_then(message_of) {
            result.insert("message".into(), json!(m));
        }
        if let Some(t) = last.and_then(trace_of) {
            result.insert("trace".into(), json!(t));
        }
        if let Some(m) = skipped.and_then(message_of) {
            result.insert("message".into(), json!(m));
        }
        if !refs.is_empty() {
            result.insert("attachments".into(), json!(refs));
        }
        result.insert("attributes".into(), Value::Object(attributes));
        results.push(Value::Object(result));
    }

    Ok(json!({
        "schemaVersion": "1.0.0",
        "run": run,
        "shards": [{"ref": "s1", "sourceFormat": "junit", "normalizerVersion": NORMALIZER_VERSION}],
        "results": results,
        "attachments": attachments,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    const ING01: &str = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../packages/formats/src/fixtures/ing01"
    );

    /// Every JUnit sample with a snapshot in `@pharos/formats`.
    const SAMPLES: [&str; 7] = [
        "single/pw-junit.xml",
        "single/cucumber-junit.xml",
        "shard1/pw-junit.xml",
        "shard2/pw-junit.xml",
        "merged/pw-junit.xml",
        "ann/pw-junit.xml",
        "cuc/junit.xml",
    ];

    #[test]
    fn every_junit_sample_parses_to_its_committed_snapshot() {
        for sample in SAMPLES {
            let text = std::fs::read_to_string(format!("{ING01}/{sample}")).unwrap();
            let snap_path = format!("{ING01}/normalized/{}.json", sample.replace('/', "__"));
            let snap: Value =
                serde_json::from_str(&std::fs::read_to_string(snap_path).unwrap()).unwrap();
            assert_eq!(snap["format"], "junit", "{sample}");
            let doc = parse(&text).unwrap_or_else(|e| panic!("{sample}: {e:?}"));
            if doc != snap["doc"] {
                // Point at the first result that differs, not the whole document.
                let ours = doc["results"].as_array().unwrap();
                let theirs = snap["doc"]["results"].as_array().unwrap();
                for (i, (a, b)) in ours.iter().zip(theirs).enumerate() {
                    assert_eq!(a, b, "{sample}: result {i}");
                }
                assert_eq!(ours.len(), theirs.len(), "{sample}: results");
                assert_eq!(doc["run"], snap["doc"]["run"], "{sample}: run");
                assert_eq!(
                    doc["attachments"], snap["doc"]["attachments"],
                    "{sample}: attachments"
                );
                assert_eq!(doc, snap["doc"], "{sample}");
            }
            assert_eq!(crate::runjson::validate(&doc), vec![], "{sample}");
        }
    }

    #[test]
    fn a_dtd_in_the_prolog_is_refused_but_not_one_in_the_output() {
        let bomb = r#"<?xml version="1.0"?>
<!-- a comment -->
<!DOCTYPE lolz [<!ENTITY lol "lol">]>
<testsuites><testsuite name="x"><testcase name="t">&lol;</testcase></testsuite></testsuites>"#;
        let err = parse(bomb).unwrap_err();
        assert_eq!(
            (err.code, err.detail.as_deref()),
            ("invalid-xml", Some("doctype"))
        );
        let html = r#"<testsuites><testsuite name="x"><testcase name="t"><system-out><![CDATA[<!DOCTYPE html><p>hi</p>]]></system-out></testcase></testsuite></testsuites>"#;
        let doc = parse(html).unwrap();
        assert_eq!(doc["results"][0]["status"], "passed");
    }

    #[test]
    fn malformed_or_foreign_xml_is_an_error() {
        assert_eq!(
            parse("<testsuites><testsuite></testsuites>")
                .unwrap_err()
                .code,
            "invalid-xml"
        );
        assert_eq!(
            parse("<testsuites>&nope;</testsuites>").unwrap_err().code,
            "invalid-xml"
        );
        assert_eq!(parse("<a/><b/>").unwrap_err().code, "invalid-xml");
        assert_eq!(parse("<html></html>").unwrap_err().code, "unknown-format");
    }

    #[test]
    fn retries_properties_and_attachments_follow_the_ts_rules() {
        let xml = "\u{feff}  <testsuite name=\"suite\" timestamp=\"2026-01-02T00:00:00Z\">\r\n\
  <testcase classname=\"C:\\Users\\ana\\repo\\tests\\login.spec.ts\" name=\"login › Example #2\" time=\"1,2345\">\r\n\
    <properties><property name=\"test_id\" value=\"TC-7\"/><property name=\"tags\" value=\"smoke, @ui\"/>\
<property name=\"owner\" value=\"qa\"/><property name=\"owner\" value=\"dev\"/><property name=\"requirement\" value=\"REQ-1\"/></properties>\r\n\
    <failure message=\"first\">trace one</failure>\r\n\
    <rerunFailure message=\"second\" time=\"0.5\">trace two</rerunFailure>\r\n\
    <system-out>[[ATTACHMENT|shots\\fail.png]] and [[ATTACHMENT| logs/run.log ]]</system-out>\r\n\
  </testcase>\r\n\
  <testcase classname=\"com.acme.LoginTest\" name=\"ok\"><flakyFailure message=\"x\"/></testcase>\r\n\
</testsuite>";
        let doc = parse(xml).unwrap();
        assert_eq!(doc["run"]["sourceTool"], "suite");
        assert_eq!(doc["run"]["startedAt"], "2026-01-02T00:00:00Z");
        let r = doc["results"].as_array().unwrap();
        assert_eq!(r.len(), 4);
        assert_eq!(
            r[0]["testKey"],
            "repo/tests/login.spec.ts::login › Example #2"
        );
        assert_eq!(r[0]["filePath"], "repo/tests/login.spec.ts");
        assert_eq!(r[0]["exampleRow"], 1);
        assert_eq!(
            (r[0]["attempt"].clone(), r[0]["rawStatus"].clone()),
            (json!(0), json!("failure"))
        );
        assert_eq!(r[1]["attempt"], 1);
        assert_eq!(r[1]["rawStatus"], "rerunFailure");
        assert_eq!(r[1]["message"], "second");
        assert_eq!(r[1]["duration"], 1235);
        assert_eq!(r[1]["tags"], json!(["@TC-7", "@smoke", "@ui"]));
        assert_eq!(r[1]["attachments"], json!(["a1", "a2"]));
        assert_eq!(r[1]["attributes"]["requirementKeys"], json!(["REQ-1"]));
        assert_eq!(
            r[1]["attributes"]["properties"]["owner"],
            json!(["qa", "dev"])
        );
        assert_eq!(doc["attachments"][0]["name"], "fail.png");
        assert_eq!(doc["attachments"][1]["kind"], "log");
        assert_eq!(doc["attachments"][1]["path"], "logs/run.log");
        // A Java class name is kept; a flaky failure before a pass.
        assert_eq!(r[3]["testKey"], "com.acme.LoginTest::ok");
        assert!(r[3].get("filePath").is_none());
        assert_eq!(
            (r[3]["status"].clone(), r[3]["attempt"].clone()),
            (json!("passed"), json!(1))
        );
        assert_eq!(r[3]["attributes"]["flaky"], true);
    }

    #[test]
    fn time_attributes_read_as_javascript_numbers() {
        assert_eq!(millis(Some("1.5")), Some(1500));
        assert_eq!(millis(Some("0,25")), Some(250));
        assert_eq!(millis(Some("")), Some(0));
        assert_eq!(millis(Some("-1")), None);
        assert_eq!(millis(Some("inf")), None);
        assert_eq!(millis(Some("abc")), None);
        assert_eq!(millis(None), None);
    }
}
