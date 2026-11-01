//! The case link of an imported result (ING-02..05, ADR-0013 «Implementación
//! (paso 9)», B1): which case, revision, run item, flow, Outline row and steps
//! it points at. The one resolver: the results list, the tray, the run counts,
//! the import preview and (with their steps) cycles, defects and the matrix
//! all call it. An imported result stores only what its report said; the link
//! is derived here, from synced data, so every device with the same data
//! derives the same link, and reading never writes.
//!
//! - **Case.** A live later link (`unlinked_mapping`) wins. Else the tags
//!   (with or without `@`) and the `caseKey` are matched against every key a
//!   case of the project ever had: its current `scenario_id` and those of its
//!   synced revisions, so a prefix change never unlinks an old import. One
//!   case links; two (now or by an older key), or a case and a key that only
//!   looks like one, never do (`two-case-tags`); a key-shaped tag of no case is
//!   `unknown-case`; an open key conflict on the case, `case-key-conflict`. A
//!   deleted case still links, marked `case_deleted` (it is not in the tray).
//! - **Revision.** The run item of the same run, case, flow and row (its
//!   frozen revision); else the highest synced revision written at or before
//!   the run's start; else the oldest one. Never the current state, so a later
//!   edit never moves a result.
//! - **Flow, row, steps.** The flow named like the scenario; the Outline row
//!   by index; a `step_id` only when the text matches the revision's step at
//!   that position (`<param>` matches any value); a report without the
//!   Background is compared from the first step after it.

use std::collections::HashMap;
use std::sync::OnceLock;

use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

use super::derive::instant_ms;
use super::err;

/// A regex compiled once (OnceLock: the crate's MSRV predates LazyLock).
macro_rules! static_regex {
    ($name:ident, $re:expr) => {
        fn $name() -> &'static Regex {
            static RE: OnceLock<Regex> = OnceLock::new();
            RE.get_or_init(|| Regex::new($re).expect("static regex"))
        }
    };
}
static_regex!(example_title, r"^Example #\d+$");
static_regex!(cucumber_row, r" - #\d+\.\d+(:.*)?$");
static_regex!(outline_param, r"<[^<>]+>");

/// What a report says about one test, as far as linking goes.
pub(crate) struct Facts<'a> {
    pub tags: &'a [String],
    /// `caseKey` of a Pharos Run JSON result.
    pub case_key: Option<&'a str>,
    /// The test's own name and its suite (titles above it).
    pub name: &'a str,
    pub suite: &'a [String],
    /// 0-based Outline row, as the tool numbered it.
    pub example_row: Option<i64>,
    /// Step texts without their keyword, in order.
    pub steps: &'a [String],
}

/// Why a test has no case.
pub(crate) const NO_TAG: &str = "no-tag";
pub(crate) const TWO_CASE_TAGS: &str = "two-case-tags";
pub(crate) const UNKNOWN_CASE: &str = "unknown-case";
pub(crate) const CASE_KEY_CONFLICT: &str = "case-key-conflict";

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Link {
    pub case_id: Option<String>,
    pub case_key: Option<String>,
    pub revision_id: Option<String>,
    pub case_revision: Option<i64>,
    pub run_item_id: Option<String>,
    pub flow_id: Option<String>,
    pub example_row_id: Option<String>,
    /// Revision step ids by position, when the texts match.
    pub step_ids: Vec<Option<String>>,
    /// Set when there is no case (one of the constants above).
    pub reason: Option<&'static str>,
    /// The case is deleted: shown as «caso borrado», never in the tray.
    pub case_deleted: bool,
    /// What the preview warns about: `(code, detail)`.
    pub warnings: Vec<(&'static str, String)>,
}

impl Link {
    /// No case (the tray), or not looked up.
    pub(crate) fn none(steps: usize, reason: Option<&'static str>) -> Self {
        Link {
            case_id: None,
            case_key: None,
            revision_id: None,
            case_revision: None,
            run_item_id: None,
            flow_id: None,
            example_row_id: None,
            step_ids: vec![None; steps],
            reason,
            case_deleted: false,
            warnings: Vec::new(),
        }
    }
}

/// The scenario a test belongs to: an Outline row's test is titled
/// `Example #n` (Playwright, CTRF; the Outline is the last suite) or
/// `<name> - #b.f` (cucumber-js JUnit).
pub(crate) fn scenario_name(name: &str, suite: &[String]) -> String {
    if example_title().is_match(name) {
        if let Some(last) = suite.last() {
            return last.clone();
        }
    }
    cucumber_row().replace(name, "").to_string()
}

/// A revision step text as a pattern: an Outline's `<param>` matches any
/// value, everything else literally.
pub(crate) fn step_pattern(text: &str) -> Regex {
    let parts: Vec<String> = outline_param()
        .split(text.trim())
        .map(regex::escape)
        .collect();
    Regex::new(&format!("^{}$", parts.join(".*?"))).expect("escaped pattern")
}

fn ids_texts(v: Option<&Value>) -> Vec<(String, String)> {
    v.and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|s| {
            Some((
                s.get("id")?.as_str()?.to_string(),
                s.get("text")?.as_str()?.to_string(),
            ))
        })
        .collect()
}

fn flow_of<'v>(data: &'v Value, flow_id: Option<&str>) -> Option<&'v Value> {
    match flow_id {
        None => Some(data),
        Some(id) => data.get("flows").and_then(Value::as_array).and_then(|f| {
            f.iter()
                .find(|x| x.get("id").and_then(Value::as_str) == Some(id))
        }),
    }
}

/// The steps of one flow of a revision, compiled once: the Background, then
/// the flow's (or the case's) preconditions and steps.
struct FlowSteps {
    background: usize,
    steps: Vec<(String, Regex)>,
    rows: Vec<String>,
}

impl FlowSteps {
    fn of(data: &Value, flow_id: Option<&str>) -> Self {
        let mut list = ids_texts(data.get("background"));
        let background = list.len();
        let scope = flow_of(data, flow_id);
        if let Some(scope) = scope {
            list.extend(ids_texts(scope.get("preconditions")));
            list.extend(ids_texts(scope.get("steps")));
        }
        let rows = scope
            .and_then(|s| s.get("examples"))
            .and_then(|e| e.get("rows"))
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|row| row.get("id").and_then(Value::as_str).map(String::from))
            .collect();
        FlowSteps {
            background,
            steps: list
                .into_iter()
                .map(|(id, text)| {
                    let p = step_pattern(&text);
                    (id, p)
                })
                .collect(),
            rows,
        }
    }

    /// The revision step id of each reported step whose text matches. A
    /// report without the Background (exactly that many steps fewer) is
    /// compared from the first step after it.
    fn match_steps(&self, reported: &[String]) -> Vec<Option<String>> {
        let skip = if self.background > 0 && reported.len() + self.background == self.steps.len() {
            self.background
        } else {
            0
        };
        reported
            .iter()
            .enumerate()
            .map(|(i, text)| {
                self.steps
                    .get(i + skip)
                    .filter(|(_, p)| p.is_match(text.trim()))
                    .map(|(id, _)| id.clone())
            })
            .collect()
    }
}

/// What the resolver knows of one case of the project.
struct CaseInfo {
    deleted: bool,
    key_conflict: bool,
}

/// One synced revision of a case: `(id, revision, created_at in ms)`.
type RevisionRow = (String, i64, Option<i64>);

/// A run item by what it plans: (run, case, flow, row).
type ItemKey = (String, String, Option<String>, Option<String>);

/// The resolver of one project: every set it needs is read once, in set
/// queries, so a whole run or project (20 000+ results) resolves without a
/// query per result. Data is read lazily only for the revisions a link
/// actually points at (their steps and rows), and cached.
pub(crate) struct Resolver<'c> {
    conn: &'c Connection,
    prefix: Regex,
    cases: HashMap<String, CaseInfo>,
    /// Every key a case had: its current `scenario_id` and those of its
    /// synced revisions (a prefix change keeps the old ones).
    keys: HashMap<String, Vec<String>>,
    revisions: HashMap<String, Vec<RevisionRow>>,
    /// `test_key` → case of the live later link (ING-05).
    mappings: HashMap<String, String>,
    run_starts: HashMap<String, i64>,
    items: HashMap<ItemKey, Vec<(String, String)>>,
    revision_data: HashMap<String, Value>,
    flows: HashMap<(String, Option<String>), FlowSteps>,
}

impl<'c> Resolver<'c> {
    /// Reads the project's cases, keys, synced revisions, links, runs and run
    /// items: seven set queries, whatever the number of results.
    pub(crate) fn for_project(conn: &'c Connection, project_id: &str) -> Result<Self, String> {
        let prefix: String = conn
            .query_row(
                "SELECT case_id_prefix FROM projects WHERE id = ?1",
                params![project_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?
            .unwrap_or_default();
        let prefix = Regex::new(&format!("^{}[0-9]{{1,9}}$", regex::escape(&prefix)))
            .map_err(|e| e.to_string())?;
        let mut cases = HashMap::new();
        let mut keys: HashMap<String, Vec<String>> = HashMap::new();
        let mut add_key = |key: String, case: &str| {
            let list = keys.entry(key).or_default();
            if !list.iter().any(|c| c == case) {
                list.push(case.to_string());
            }
        };
        each(
            conn,
            "SELECT c.id, c.scenario_id, c.deleted_at IS NOT NULL,
                    EXISTS (SELECT 1 FROM key_conflicts k WHERE k.entity = 'test_case'
                             AND k.entity_id = c.id AND k.resolved_at IS NULL)
               FROM test_cases c WHERE c.project_id = ?1",
            project_id,
            |r| {
                let id: String = r.get(0)?;
                let key: Option<String> = r.get(1)?;
                if let Some(k) = key.filter(|k| !k.is_empty()) {
                    add_key(k, &id);
                }
                cases.insert(
                    id,
                    CaseInfo {
                        deleted: r.get(2)?,
                        key_conflict: r.get(3)?,
                    },
                );
                Ok(())
            },
        )?;
        let mut revisions: HashMap<String, Vec<RevisionRow>> = HashMap::new();
        // Only synced revisions (content-addressed): every device has them.
        each(
            conn,
            "SELECT r.test_case_id, r.id, r.revision, r.created_at, r.scenario_id
               FROM test_case_revisions r JOIN test_cases c ON c.id = r.test_case_id
              WHERE c.project_id = ?1 AND r.content_sha256 IS NOT NULL",
            project_id,
            |r| {
                let case: String = r.get(0)?;
                let key: Option<String> = r.get(4)?;
                if let Some(k) = key.filter(|k| !k.is_empty()) {
                    add_key(k, &case);
                }
                let created: Option<String> = r.get(3)?;
                revisions.entry(case).or_default().push((
                    r.get(1)?,
                    r.get(2)?,
                    created.as_deref().and_then(instant_ms),
                ));
                Ok(())
            },
        )?;
        for list in revisions.values_mut() {
            list.sort_by(|a, b| (a.1, &a.0).cmp(&(b.1, &b.0)));
        }
        let mut mappings = HashMap::new();
        each(
            conn,
            "SELECT test_key, test_case_id FROM unlinked_mappings
              WHERE project_id = ?1 AND deleted_at IS NULL
              ORDER BY updated_at, rowid",
            project_id,
            |r| {
                let key: String = r.get(0)?;
                match r.get::<_, Option<String>>(1)? {
                    Some(case) => mappings.insert(key, case),
                    None => mappings.remove(&key),
                };
                Ok(())
            },
        )?;
        let mut run_starts = HashMap::new();
        each(
            conn,
            "SELECT id, coalesce(started_at, created_at) FROM runs WHERE project_id = ?1",
            project_id,
            |r| {
                let at: Option<String> = r.get(1)?;
                if let Some(ms) = at.as_deref().and_then(instant_ms) {
                    run_starts.insert(r.get(0)?, ms);
                }
                Ok(())
            },
        )?;
        let mut items: HashMap<ItemKey, Vec<(String, String)>> = HashMap::new();
        each(
            conn,
            "SELECT id, run_id, test_case_id, test_case_revision_id, flow_id, example_row_id
               FROM run_items WHERE project_id = ?1 AND deleted_at IS NULL
              ORDER BY position, rowid",
            project_id,
            |r| {
                items
                    .entry((r.get(1)?, r.get(2)?, r.get(4)?, r.get(5)?))
                    .or_default()
                    .push((r.get(0)?, r.get(3)?));
                Ok(())
            },
        )?;
        Ok(Resolver {
            conn,
            prefix,
            cases,
            keys,
            revisions,
            mappings,
            run_starts,
            items,
            revision_data: HashMap::new(),
            flows: HashMap::new(),
        })
    }

    /// The start of a run not written yet (the preview of a new run).
    pub(crate) fn assume_run_start(&mut self, run_id: &str, started_at: Option<&str>) {
        if let Some(ms) = started_at.and_then(instant_ms) {
            self.run_starts.insert(run_id.to_string(), ms);
        }
    }

    /// The case of a later link (ING-05) for a `test_key`, if any.
    pub(crate) fn mapping(&self, test_key: &str) -> Option<&str> {
        self.mappings.get(test_key).map(String::as_str)
    }

    fn data_of(&mut self, revision_id: &str) -> Result<&Value, String> {
        if !self.revision_data.contains_key(revision_id) {
            let d: Option<String> = self
                .conn
                .query_row(
                    "SELECT data FROM test_case_revisions WHERE id = ?1",
                    params![revision_id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(err)?;
            let data = d
                .and_then(|d| serde_json::from_str(&d).ok())
                .unwrap_or(Value::Null);
            self.revision_data.insert(revision_id.to_string(), data);
        }
        Ok(&self.revision_data[revision_id])
    }

    fn flow_steps(
        &mut self,
        revision_id: &str,
        flow_id: Option<&str>,
    ) -> Result<&FlowSteps, String> {
        let key = (revision_id.to_string(), flow_id.map(String::from));
        if !self.flows.contains_key(&key) {
            let shape = FlowSteps::of(self.data_of(revision_id)?, flow_id);
            self.flows.insert(key.clone(), shape);
        }
        Ok(&self.flows[&key])
    }

    /// The synced revision of a case current at `at`: the highest revision
    /// written at or before it, else the oldest one (the case was edited only
    /// after the run started). Ties by id, so every device picks the same.
    /// Never the current state: an edit after the run never moves a result.
    fn revision_at(&self, case_id: &str, at: Option<i64>) -> Option<(String, i64)> {
        let list = self.revisions.get(case_id)?;
        let before = at.and_then(|at| {
            list.iter()
                .rev()
                .find(|(_, _, created)| created.is_some_and(|c| c <= at))
        });
        before
            .or_else(|| list.first())
            .map(|(id, n, _)| (id.clone(), *n))
    }

    /// The cases a test's tags (with or without `@`) and `caseKey` name, by
    /// any key a case ever had, and the tags that only look like a key.
    fn cases_of(&self, f: &Facts) -> (Vec<String>, Vec<String>) {
        let mut found: Vec<String> = Vec::new();
        let mut unknown = Vec::new();
        let named = f
            .tags
            .iter()
            .map(|t| t.trim().trim_start_matches('@'))
            .chain(f.case_key.map(str::trim));
        for k in named.filter(|k| !k.is_empty()) {
            match self.keys.get(k) {
                Some(cases) => found.extend(cases.iter().cloned()),
                None if self.prefix.is_match(k) => unknown.push(k.to_string()),
                None => {}
            }
        }
        for v in [&mut found, &mut unknown] {
            v.sort();
            v.dedup();
        }
        (found, unknown)
    }

    /// The case a test's tags name, before any later link: `Ok(case)` or
    /// `Err((reason, detail))` when there is none.
    pub(crate) fn case_by_tags(&self, f: &Facts) -> Result<String, (&'static str, String)> {
        let (found, unknown) = self.cases_of(f);
        match (found.len(), unknown.len()) {
            (0, 0) => Err((NO_TAG, String::new())),
            (0, 1) => Err((UNKNOWN_CASE, unknown[0].clone())),
            (1, 0) => {
                let case = &found[0];
                if self.cases.get(case).is_some_and(|c| c.key_conflict) {
                    return Err((CASE_KEY_CONFLICT, case.clone()));
                }
                Ok(case.clone())
            }
            // Two cases (now or by an older key), or a case and an unknown
            // key: never a guess.
            _ => Err((TWO_CASE_TAGS, [found, unknown].concat().join(", "))),
        }
    }

    /// The link of one imported result, derived from synced data only, so
    /// every device that has the same data derives the same link. `full`
    /// also resolves flow, row, item and step ids (the counts and the tray
    /// only need the case).
    pub(crate) fn resolve(
        &mut self,
        run_id: &str,
        test_key: &str,
        f: &Facts,
        full: bool,
    ) -> Result<Link, String> {
        let mut link = Link::none(f.steps.len(), None);
        let by_tags = self.case_by_tags(f);
        let case = match (self.mapping(test_key), by_tags) {
            (Some(mapped), _) if self.cases.contains_key(mapped) => mapped.to_string(),
            (_, Ok(case)) => case,
            (_, Err((reason, detail))) => {
                link.reason = Some(reason);
                if reason != NO_TAG {
                    link.warnings.push((reason, detail.clone()));
                }
                if reason == UNKNOWN_CASE {
                    link.case_key = Some(detail);
                }
                return Ok(link);
            }
        };
        link.case_deleted = self.cases.get(&case).is_some_and(|c| c.deleted);
        let at = self.run_starts.get(run_id).copied();
        let Some((mut revision_id, mut case_revision)) = self.revision_at(&case, at) else {
            link.warnings.push(("no-revision", case.clone()));
            link.case_id = Some(case);
            return Ok(link);
        };
        if !full {
            link.case_id = Some(case);
            link.revision_id = Some(revision_id);
            link.case_revision = Some(case_revision);
            return Ok(link);
        }
        // The flow: an advanced case's flow named like the scenario.
        let scenario = scenario_name(f.name, f.suite);
        let flow_id = self
            .data_of(&revision_id)?
            .get("flows")
            .and_then(Value::as_array)
            .and_then(|flows| {
                flows.iter().find(|x| {
                    x.get("name").and_then(Value::as_str).map(str::trim) == Some(scenario.trim())
                })
            })
            .and_then(|x| x.get("id").and_then(Value::as_str).map(String::from));
        let mut row_id = None;
        if let Some(n) = f.example_row {
            let rows = &self.flow_steps(&revision_id, flow_id.as_deref())?.rows;
            row_id = usize::try_from(n).ok().and_then(|n| rows.get(n).cloned());
            if row_id.is_none() {
                link.warnings.push(("row-not-found", format!("{}", n + 1)));
            }
        }
        // A run item of the run for exactly this case, flow and row: the
        // result fulfils it, against the item's frozen revision.
        let item_key = (
            run_id.to_string(),
            case.clone(),
            flow_id.clone(),
            row_id.clone(),
        );
        if let Some(found) = self.items.get(&item_key).filter(|v| v.len() == 1) {
            let (item, rev) = found[0].clone();
            if rev != revision_id {
                if let Some((_, n, _)) = self
                    .revisions
                    .get(&case)
                    .and_then(|l| l.iter().find(|(id, _, _)| *id == rev))
                {
                    case_revision = *n;
                }
                revision_id = rev;
            }
            link.run_item_id = Some(item);
        }
        link.step_ids = self
            .flow_steps(&revision_id, flow_id.as_deref())?
            .match_steps(f.steps);
        link.case_id = Some(case);
        link.revision_id = Some(revision_id);
        link.case_revision = Some(case_revision);
        link.flow_id = flow_id;
        link.example_row_id = row_id;
        Ok(link)
    }
}

/// Runs `sql` with the project id and hands each row to `f`.
fn each(
    conn: &Connection,
    sql: &str,
    project_id: &str,
    mut f: impl FnMut(&rusqlite::Row) -> rusqlite::Result<()>,
) -> Result<(), String> {
    let mut stmt = conn.prepare(sql).map_err(err)?;
    let mut rows = stmt.query(params![project_id]).map_err(err)?;
    while let Some(r) = rows.next().map_err(err)? {
        f(r).map_err(err)?;
    }
    Ok(())
}

/// The facts of a stored imported result, owned (the views and the tray
/// read them from the row: tags, name and suite live in `attributes`).
pub(crate) struct StoredFacts {
    pub tags: Vec<String>,
    pub case_key: Option<String>,
    pub name: String,
    pub suite: Vec<String>,
    pub example_row: Option<i64>,
    pub steps: Vec<String>,
}

impl StoredFacts {
    pub(crate) fn of(
        attributes: &Value,
        case_key: Option<&str>,
        example_row: Option<i64>,
        steps: Vec<String>,
    ) -> Self {
        let strings = |k: &str| -> Vec<String> {
            attributes
                .get(k)
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        };
        StoredFacts {
            tags: strings("tags"),
            case_key: case_key.map(String::from),
            name: attributes
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            suite: strings("suite"),
            example_row,
            steps,
        }
    }

    pub(crate) fn facts(&self) -> Facts<'_> {
        Facts {
            tags: &self.tags,
            case_key: self.case_key.as_deref(),
            name: &self.name,
            suite: &self.suite,
            example_row: self.example_row,
            steps: &self.steps,
        }
    }
}

/// Fills the derived link of every view (ADR-0013, «Implementación (paso
/// 9)», B1). An imported result (with a shard) stores no link: it is
/// resolved here. A manual one keeps the link it was written with.
pub(crate) fn fill_views(
    conn: &Connection,
    project_id: &str,
    views: &mut [super::ResultView],
) -> Result<(), String> {
    if views.iter().all(|v| v.shard_id.is_none()) {
        for v in views.iter_mut() {
            v.copy_stored_link();
        }
        return Ok(());
    }
    let mut resolver = Resolver::for_project(conn, project_id)?;
    for v in views.iter_mut() {
        if v.shard_id.is_none() {
            v.copy_stored_link();
            continue;
        }
        let texts: Vec<String> = v.steps.iter().map(|s| s.text.clone()).collect();
        let stored = StoredFacts::of(&v.attributes, v.case_key.as_deref(), v.example_row, texts);
        let link = resolver.resolve(&v.run_id, &v.test_key, &stored.facts(), true)?;
        v.effective_test_case_id = link.case_id.clone();
        v.effective_revision_id = link.revision_id.clone();
        v.effective_case_revision = link.case_revision;
        v.effective_flow_id = link.flow_id.clone();
        v.effective_example_row_id = link.example_row_id.clone();
        v.effective_run_item_id = link.run_item_id.clone();
        v.effective_step_ids = link.step_ids.clone();
        v.link_reason = link.reason.map(String::from);
        v.case_deleted = link.case_deleted;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn steps_match_by_text_and_skip_a_missing_background() {
        let data = json!({
            "background": [{"id": "b1", "text": "logged in"}],
            "steps": [{"id": "s1", "text": "pays <amount>"}, {"id": "s2", "text": "sees a receipt"}]
        });
        let f = FlowSteps::of(&data, None);
        let with_bg = [
            "logged in".to_string(),
            "pays 10".into(),
            "sees a receipt".into(),
        ];
        assert_eq!(
            f.match_steps(&with_bg),
            vec![Some("b1".into()), Some("s1".into()), Some("s2".into())]
        );
        let without = ["pays 10".to_string(), "sees a receipt".into()];
        assert_eq!(
            f.match_steps(&without),
            vec![Some("s1".into()), Some("s2".into())]
        );
        let other = ["pays 10".to_string()];
        assert_eq!(f.match_steps(&other), vec![None]);
    }

    #[test]
    fn scenario_names_of_outline_rows() {
        let suite = ["features/a.spec.js".to_string(), "Login rechazado".into()];
        assert_eq!(scenario_name("Example #2", &suite), "Login rechazado");
        assert_eq!(
            scenario_name("Login rechazado - #1.2", &[]),
            "Login rechazado"
        );
        assert_eq!(scenario_name("Plain", &suite), "Plain");
    }
}
