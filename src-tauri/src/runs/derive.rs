//! What is derived, never stored (ADR-0013): the final attempt of each test,
//! flaky, the worst status of a set of results and the risk level of a
//! requirement. Pure functions; the matrix (EJE-04, step 10) and the run views
//! use them.
// The matrix (step 10) and the importers (step 9) are the production callers
// of what the run views of this step do not use yet.
#![cfg_attr(not(test), allow(dead_code))]

use std::cmp::Ordering;
use std::collections::HashMap;

/// What the derivations read of one attempt.
#[derive(Clone, Debug, PartialEq)]
pub struct Attempt<'a> {
    pub id: &'a str,
    pub run_id: &'a str,
    pub test_key: &'a str,
    pub configuration_label: Option<&'a str>,
    pub attempt: i64,
    pub status: &'a str,
    pub started_at: Option<&'a str>,
    pub finished_at: Option<&'a str>,
    /// `imported_at` of its shard; None for a manual attempt.
    pub shard_imported_at: Option<&'a str>,
    pub hlc: &'a str,
    /// `attributes.flaky` as the tool declared it (CTRF `flaky`, JUnit
    /// `flakyFailure`), when it only sends the final attempt.
    pub declared_flaky: bool,
}

impl Attempt<'_> {
    /// When it happened: `coalesce(finished_at, started_at, shard.imported_at)`.
    /// When it happened, in ms: the first of `finished_at`, `started_at` and
    /// the shard's `imported_at` that parses (`instant_ms`). A value that does
    /// not parse counts as missing, never as text next to parsed ones.
    fn time(&self) -> Option<i64> {
        [self.finished_at, self.started_at, self.shard_imported_at]
            .into_iter()
            .flatten()
            .find_map(instant_ms)
    }

    fn test(&self) -> (&str, &str, &str) {
        (
            self.run_id,
            self.test_key,
            self.configuration_label.unwrap_or(""),
        )
    }
}

/// Milliseconds since the epoch of an RFC 3339 timestamp or of SQLite's
/// `datetime('now')` form (`YYYY-MM-DD HH:MM:SS`, UTC); None otherwise.
pub fn instant_ms(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    let num = |from: usize, len: usize| -> Option<i64> {
        let part = s.get(from..from + len)?;
        part.bytes()
            .all(|c| c.is_ascii_digit())
            .then(|| part.parse().ok())?
    };
    if b.len() < 19 || b[4] != b'-' || b[7] != b'-' || !matches!(b[10], b'T' | b't' | b' ') {
        return None;
    }
    let (y, mo, d) = (num(0, 4)?, num(5, 2)?, num(8, 2)?);
    let (h, mi, sec) = (num(11, 2)?, num(14, 2)?, num(17, 2)?);
    if b[13] != b':'
        || b[16] != b':'
        || !(1..=12).contains(&mo)
        || !(1..=31).contains(&d)
        || h > 23
        || mi > 59
        || sec > 60
    {
        return None;
    }
    let mut i = 19;
    let mut ms = 0;
    if b.get(i) == Some(&b'.') {
        let start = i + 1;
        i = start;
        while b.get(i).is_some_and(u8::is_ascii_digit) {
            i += 1;
        }
        let frac = s.get(start..i).filter(|f| !f.is_empty())?;
        ms = format!("{:0<3}", &frac[..frac.len().min(3)]).parse().ok()?;
    }
    let offset_min = match &s[i..] {
        "" | "Z" | "z" => 0,
        // `+05:30` (RFC 3339) or `+0530` (ISO 8601 basic).
        tz if matches!(tz.as_bytes()[0], b'+' | b'-')
            && ((tz.len() == 6 && tz.as_bytes()[3] == b':') || tz.len() == 5) =>
        {
            let minutes_at = if tz.len() == 6 { i + 4 } else { i + 3 };
            let (oh, om) = (num(i + 1, 2)?, num(minutes_at, 2)?);
            if oh > 23 || om > 59 {
                return None;
            }
            let m = oh * 60 + om;
            if tz.starts_with('-') {
                -m
            } else {
                m
            }
        }
        _ => return None,
    };
    // Days from the civil date (Howard Hinnant's algorithm).
    let (yy, mm) = if mo <= 2 {
        (y - 1, mo + 9)
    } else {
        (y, mo - 3)
    };
    let era = yy.div_euclid(400);
    let yoe = yy - era * 400;
    let doy = (153 * mm + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(((days * 24 + h) * 60 + mi - offset_min) * 60_000 + sec * 1000 + ms)
}

/// Times are compared as instants (`Attempt::time`); a missing or unparseable
/// one sorts first.
fn cmp_time(a: Option<i64>, b: Option<i64>) -> Ordering {
    // None < Some: an attempt without a usable time sorts first.
    a.cmp(&b)
}

/// The order of attempts of one test: time, then `attempt`, then HLC. Also
/// orders the finals of a test across the runs of a cycle (`cycles::progress`).
pub(crate) fn cmp_attempts(a: &Attempt, b: &Attempt) -> Ordering {
    cmp_time(a.time(), b.time())
        .then(a.attempt.cmp(&b.attempt))
        .then_with(|| crate::hlc::cmp_encoded(a.hlc, b.hlc))
}

/// Ids of the final attempt of each test `(run_id, test_key,
/// configuration_label)`.
pub fn final_attempts<'a>(attempts: &[Attempt<'a>]) -> Vec<&'a str> {
    let mut last: HashMap<(&str, &str, &str), &Attempt<'a>> = HashMap::new();
    for a in attempts {
        last.entry(a.test())
            .and_modify(|cur| {
                if cmp_attempts(a, cur).is_gt() {
                    *cur = a;
                }
            })
            .or_insert(a);
    }
    let mut ids: Vec<&'a str> = last.values().map(|a| a.id).collect();
    ids.sort_unstable();
    ids
}

/// Flaky tests `(run_id, test_key, configuration_label)`: the final attempt
/// passed and an earlier one failed, or the tool declared the final attempt
/// flaky.
pub fn flaky_tests<'a>(attempts: &[Attempt<'a>]) -> Vec<(&'a str, &'a str, &'a str)> {
    let finals = final_attempts(attempts);
    let mut out = Vec::new();
    for a in attempts.iter().filter(|a| finals.contains(&a.id)) {
        let failed_before = attempts
            .iter()
            .any(|b| b.test() == a.test() && b.id != a.id && b.status == "failed");
        if a.status == "passed" && (failed_before || a.declared_flaky) {
            out.push((a.run_id, a.test_key, a.configuration_label.unwrap_or("")));
        }
    }
    out.sort_unstable();
    out.dedup();
    out
}

/// Severity of a result status for "the worst of": failed > blocked > other >
/// skipped > passed. Unknown values count as `other`.
fn severity(status: &str) -> u8 {
    match status {
        "failed" => 4,
        "blocked" => 3,
        "skipped" => 1,
        "passed" => 0,
        _ => 2,
    }
}

/// The worst status among `statuses`; None when there is none.
pub fn worst_status<'a>(statuses: impl IntoIterator<Item = &'a str>) -> Option<&'a str> {
    statuses.into_iter().max_by_key(|s| severity(s))
}

/// `risk_likelihood × risk_impact` (1–25); None until both are assessed.
pub fn risk_level(likelihood: Option<i64>, impact: Option<i64>) -> Option<i64> {
    Some(likelihood? * impact?)
}

/// Risk bands: a level up to `low` is low, up to `medium` is medium, above is
/// high. Per-project bands come with TRZ-04's UI; until then the ADR-0013
/// defaults apply.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RiskBands {
    pub low: i64,
    pub medium: i64,
}

pub const DEFAULT_RISK_BANDS: RiskBands = RiskBands { low: 4, medium: 12 };

pub fn risk_band(level: i64, bands: RiskBands) -> &'static str {
    if level <= bands.low {
        "low"
    } else if level <= bands.medium {
        "medium"
    } else {
        "high"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at<'a>(id: &'a str, key: &'a str, attempt: i64, status: &'a str) -> Attempt<'a> {
        Attempt {
            id,
            run_id: "r",
            test_key: key,
            configuration_label: None,
            attempt,
            status,
            started_at: None,
            finished_at: None,
            shard_imported_at: None,
            hlc: "",
            declared_flaky: false,
        }
    }

    #[test]
    fn the_final_attempt_is_the_latest_by_time_then_attempt_then_hlc() {
        let mut a = at("a", "t", 0, "failed");
        a.finished_at = Some("2026-10-31T10:00:00Z");
        let mut b = at("b", "t", 5, "passed");
        b.finished_at = Some("2026-10-31T09:00:00Z");
        // Time wins over the attempt number.
        assert_eq!(final_attempts(&[a.clone(), b.clone()]), vec!["a"]);
        // Same time: the attempt number decides.
        b.finished_at = a.finished_at;
        assert_eq!(final_attempts(&[a.clone(), b.clone()]), vec!["b"]);
        // Same time and attempt (two devices, manual): the HLC decides.
        b.attempt = 0;
        let hlc = |ms: u64| {
            crate::hlc::Hlc {
                wall_ms: ms,
                counter: 0,
                device_id: "d".into(),
            }
            .encode()
        };
        let (h1, h2) = (hlc(1), hlc(2));
        a.hlc = &h2;
        b.hlc = &h1;
        assert_eq!(final_attempts(&[a, b]), vec!["a"]);
    }

    #[test]
    fn time_falls_back_to_started_at_then_the_shard() {
        let mut a = at("a", "t", 1, "passed");
        a.shard_imported_at = Some("2026-10-31 12:00:00");
        let mut b = at("b", "t", 0, "failed");
        b.started_at = Some("2026-10-31T13:00:00+01:00"); // 12:00 UTC, equal
        assert_eq!(final_attempts(&[a.clone(), b.clone()]), vec!["a"]);
        b.started_at = Some("2026-10-31T13:00:01+01:00");
        assert_eq!(final_attempts(&[a, b]), vec!["b"]);
    }

    #[test]
    fn an_unparseable_time_counts_as_missing_not_as_text() {
        let mut a = at("a", "t", 0, "failed");
        a.finished_at = Some("yesterday");
        a.started_at = Some("2026-10-31T10:00:00Z"); // falls back to this
        let mut b = at("b", "t", 0, "passed");
        b.finished_at = Some("2026-10-31T09:00:00Z");
        assert_eq!(final_attempts(&[a.clone(), b.clone()]), vec!["a"]);
        // Nothing parses: the attempt sorts first, whatever its text says.
        a.started_at = Some("zzz");
        assert_eq!(final_attempts(&[a, b]), vec!["b"]);
    }

    #[test]
    fn each_test_and_configuration_has_its_own_final() {
        let mut chromium = at("c", "t", 0, "passed");
        chromium.configuration_label = Some("chromium");
        let firefox = Attempt {
            id: "f",
            configuration_label: Some("firefox"),
            ..chromium.clone()
        };
        let other = at("o", "u", 0, "failed");
        assert_eq!(
            final_attempts(&[chromium, firefox, other]),
            vec!["c", "f", "o"]
        );
    }

    #[test]
    fn flaky_is_derived_from_attempts_or_taken_from_the_tool() {
        let first = at("1", "t", 0, "failed");
        let second = at("2", "t", 1, "passed");
        assert_eq!(flaky_tests(&[first.clone(), second]), vec![("r", "t", "")]);
        // Failed at the end: not flaky, failed.
        let last_failed = at("3", "t", 1, "failed");
        assert!(flaky_tests(&[at("2", "t", 0, "passed"), last_failed]).is_empty());
        // Only the final attempt arrived, and the tool says it was flaky.
        let mut only = at("4", "u", 2, "passed");
        assert!(flaky_tests(std::slice::from_ref(&only)).is_empty());
        only.declared_flaky = true;
        assert_eq!(flaky_tests(&[only]), vec![("r", "u", "")]);
        assert!(flaky_tests(&[first]).is_empty());
    }

    #[test]
    fn instants_parse_both_timestamp_forms() {
        assert_eq!(instant_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(instant_ms("1970-01-01 00:00:01"), Some(1000));
        assert_eq!(
            instant_ms("2026-10-31T13:00:00.5+01:00"),
            instant_ms("2026-10-31T12:00:00.500Z")
        );
        assert_eq!(instant_ms("2000-03-01T00:00:00Z"), Some(951_868_800_000));
        assert_eq!(instant_ms("not a date"), None);
        assert_eq!(instant_ms("2026-13-01T00:00:00Z"), None);
        // ISO 8601 basic offsets and more than 3 fractional digits.
        assert_eq!(
            instant_ms("2026-10-31T05:30:00+0530"),
            instant_ms("2026-10-31T00:00:00Z")
        );
        assert_eq!(
            instant_ms("2026-10-31T00:00:00.123456789Z"),
            instant_ms("2026-10-31T00:00:00.123Z")
        );
        assert_eq!(instant_ms("2026-10-31T00:00:00+05:60"), None);
        assert_eq!(instant_ms("2026-10-31T00:00:00+053"), None);
    }

    #[test]
    fn the_worst_status_wins() {
        assert_eq!(worst_status(["passed", "skipped"]), Some("skipped"));
        assert_eq!(
            worst_status(["passed", "blocked", "other"]),
            Some("blocked")
        );
        assert_eq!(worst_status(["blocked", "failed"]), Some("failed"));
        assert_eq!(worst_status(["passed", "weird"]), Some("weird"));
        assert_eq!(worst_status(Vec::<&str>::new()), None);
    }

    #[test]
    fn risk_level_and_default_bands() {
        assert_eq!(risk_level(Some(2), Some(2)), Some(4));
        assert_eq!(risk_level(Some(5), None), None);
        assert_eq!(risk_band(4, DEFAULT_RISK_BANDS), "low");
        assert_eq!(risk_band(5, DEFAULT_RISK_BANDS), "medium");
        assert_eq!(risk_band(12, DEFAULT_RISK_BANDS), "medium");
        assert_eq!(risk_band(13, DEFAULT_RISK_BANDS), "high");
        assert_eq!(risk_band(25, DEFAULT_RISK_BANDS), "high");
    }
}
