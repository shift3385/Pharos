//! The case link of an imported test (ING-02..05, ADR-0013): which case,
//! revision, run item, flow, Outline row and steps a test's facts point at.
//! Pure over the database: it reads, and only `ensure_current` may freeze a
//! case's current state. The importer calls it today; the read-time
//! derivation of B1 (review of step 9) will call the same code.
//!
//! - **Case.** The tags (and the `caseKey` a Pharos Run JSON may carry) are
//!   matched against the project's live `scenario_id`s, so a free key or one
//!   with an older prefix links too; the project's `@<prefix><n>` regex only
//!   names the tags that look like a case key and are not one (`unknown-case`).
//!   One case links; two do not (`two-case-tags`); a case with an open key
//!   conflict does not (`case-key-conflict`).
//! - **Revision, item, flow, row, steps** as documented in ADR-0013
//!   «Implementación (paso 9)». A `step_id` is set only when the text matches
//!   the revision's step at that position (`<param>` matches any value); when
//!   the report leaves out the Background (fewer steps), the Background is
//!   skipped before comparing.

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

struct CaseRef {
    id: String,
    key_conflict: bool,
}

/// A run item by what it plans: (case, flow, row).
type ItemKey = (String, Option<String>, Option<String>);

/// Caches over one project (and target run) for many tests.
pub(crate) struct Linker<'c> {
    conn: &'c Connection,
    user: String,
    prefix: Regex,
    started_at_ms: Option<i64>,
    /// Live cases by `scenario_id`.
    cases: HashMap<String, CaseRef>,
    revisions: HashMap<String, Option<(String, i64)>>,
    revision_data: HashMap<String, Value>,
    flows: HashMap<(String, Option<String>), FlowSteps>,
    items: HashMap<ItemKey, Vec<(String, String)>>,
}

impl<'c> Linker<'c> {
    pub(crate) fn new(
        conn: &'c Connection,
        project_id: &str,
        user: &str,
        run_id: Option<&str>,
        started_at: Option<&str>,
    ) -> Result<Self, String> {
        let prefix: String = conn
            .query_row(
                "SELECT case_id_prefix FROM projects WHERE id = ?1",
                params![project_id],
                |r| r.get(0),
            )
            .map_err(err)?;
        let prefix = Regex::new(&format!("^{}[0-9]{{1,9}}$", regex::escape(&prefix)))
            .map_err(|e| e.to_string())?;
        let mut cases = HashMap::new();
        {
            let mut stmt = conn
                .prepare(
                    "SELECT c.scenario_id, c.id, EXISTS (SELECT 1 FROM key_conflicts k
                             WHERE k.entity = 'test_case' AND k.entity_id = c.id
                               AND k.resolved_at IS NULL)
                       FROM test_cases c
                      WHERE c.project_id = ?1 AND c.deleted_at IS NULL AND c.scenario_id <> ''
                      ORDER BY c.created_at, c.rowid",
                )
                .map_err(err)?;
            let rows = stmt
                .query_map(params![project_id], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        CaseRef {
                            id: r.get(1)?,
                            key_conflict: r.get(2)?,
                        },
                    ))
                })
                .map_err(err)?;
            for row in rows {
                let (key, case) = row.map_err(err)?;
                cases.entry(key).or_insert(case);
            }
        }
        let mut items: HashMap<ItemKey, Vec<(String, String)>> = HashMap::new();
        if let Some(run) = run_id {
            let mut stmt = conn
                .prepare(
                    "SELECT id, test_case_id, test_case_revision_id, flow_id, example_row_id
                       FROM run_items WHERE run_id = ?1 AND deleted_at IS NULL ORDER BY position",
                )
                .map_err(err)?;
            let rows = stmt
                .query_map(params![run], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, Option<String>>(3)?,
                        r.get::<_, Option<String>>(4)?,
                    ))
                })
                .map_err(err)?;
            for row in rows {
                let (id, case, rev, flow, ex) = row.map_err(err)?;
                items.entry((case, flow, ex)).or_default().push((id, rev));
            }
        }
        Ok(Linker {
            conn,
            user: user.to_string(),
            prefix,
            started_at_ms: started_at.and_then(instant_ms),
            cases,
            revisions: HashMap::new(),
            revision_data: HashMap::new(),
            flows: HashMap::new(),
            items,
        })
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

    /// The synced revision of a case current at the run's start, else the
    /// current one (frozen now if missing), with its number.
    fn revision(&mut self, case_id: &str) -> Result<Option<(String, i64)>, String> {
        if let Some(r) = self.revisions.get(case_id) {
            return Ok(r.clone());
        }
        let mut chosen: Option<String> = None;
        if let Some(at) = self.started_at_ms {
            let mut stmt = self
                .conn
                .prepare(
                    "SELECT id, created_at FROM test_case_revisions
                      WHERE test_case_id = ?1 AND content_sha256 IS NOT NULL
                      ORDER BY revision DESC, created_at DESC",
                )
                .map_err(err)?;
            let rows = stmt
                .query_map(params![case_id], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
                })
                .map_err(err)?;
            for row in rows {
                let (id, created) = row.map_err(err)?;
                if instant_ms(&created).is_some_and(|c| c <= at) {
                    chosen = Some(id);
                    break;
                }
            }
        }
        let id = match chosen {
            Some(id) => Some(id),
            None => crate::revisions::ensure_current(self.conn, case_id, &self.user, true)?,
        };
        let out = match id {
            Some(id) => {
                let n: i64 = self
                    .conn
                    .query_row(
                        "SELECT revision FROM test_case_revisions WHERE id = ?1",
                        params![id],
                        |r| r.get(0),
                    )
                    .map_err(err)?;
                Some((id, n))
            }
            None => None,
        };
        self.revisions.insert(case_id.to_string(), out.clone());
        Ok(out)
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

    /// The case keys a test names: its tags (with or without `@`) and its
    /// `caseKey` that are live keys of the project, and the ones that only
    /// look like one (the project's prefix + digits).
    fn keys_of(&self, f: &Facts) -> (Vec<String>, Vec<String>) {
        let mut live = Vec::new();
        let mut unknown = Vec::new();
        let named = f
            .tags
            .iter()
            .map(|t| t.trim().trim_start_matches('@'))
            .chain(f.case_key.map(str::trim));
        for k in named.filter(|k| !k.is_empty()) {
            if self.cases.contains_key(k) {
                live.push(k.to_string());
            } else if self.prefix.is_match(k) {
                unknown.push(k.to_string());
            }
        }
        for v in [&mut live, &mut unknown] {
            v.sort();
            v.dedup();
        }
        (live, unknown)
    }

    pub(crate) fn link(&mut self, f: &Facts) -> Result<Link, String> {
        let mut link = Link::none(f.steps.len(), None);
        let (live, unknown) = self.keys_of(f);
        let case_key = match (live.len(), unknown.len()) {
            (0, 0) => {
                link.reason = Some(NO_TAG);
                return Ok(link);
            }
            (0, 1) => {
                link.case_key = Some(unknown[0].clone());
                link.reason = Some(UNKNOWN_CASE);
                link.warnings.push((UNKNOWN_CASE, unknown[0].clone()));
                return Ok(link);
            }
            (1, 0) => live[0].clone(),
            _ => {
                let all = [live, unknown].concat();
                link.reason = Some(TWO_CASE_TAGS);
                link.warnings.push((TWO_CASE_TAGS, all.join(", ")));
                return Ok(link);
            }
        };
        link.case_key = Some(case_key.clone());
        let case = &self.cases[&case_key];
        if case.key_conflict {
            link.reason = Some(CASE_KEY_CONFLICT);
            link.warnings.push((CASE_KEY_CONFLICT, case_key));
            return Ok(link);
        }
        let case = case.id.clone();
        let Some((mut revision_id, mut case_revision)) = self.revision(&case)? else {
            link.reason = Some(UNKNOWN_CASE);
            link.warnings.push(("no-revision", case_key));
            return Ok(link);
        };
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
        // A run item of the target run for exactly this case, flow and row:
        // the result fulfils it, against the item's frozen revision.
        if let Some(found) = self
            .items
            .get(&(case.clone(), flow_id.clone(), row_id.clone()))
            .filter(|v| v.len() == 1)
        {
            let (item, rev) = found[0].clone();
            if rev != revision_id {
                case_revision = self
                    .conn
                    .query_row(
                        "SELECT revision FROM test_case_revisions WHERE id = ?1",
                        params![rev],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(err)?
                    .unwrap_or(case_revision);
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
