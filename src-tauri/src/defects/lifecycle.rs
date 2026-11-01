//! The fixed lifecycle of a defect in 0.2.0 (ADR-0016, user decision 2 and
//! «Implementación»): pure, with a TS twin in
//! `src/modules/defects/model/lifecycle.ts` that checks the same table
//! (`tests/fixtures/defect-vectors.json`).
//!
//! - main flow `new → open → in_progress → fixed → retest → closed`;
//! - `retest → open` when the fix fails;
//! - `new | open → rejected | deferred`;
//! - `closed`, `rejected` and `deferred` reopen to `open`.
//!
//! `resolution` goes with `closed` and `rejected` and only with them. In the
//! matrix a defect is open unless it is `closed` or `rejected` (a deferred
//! defect is still open).

pub const STATUSES: [&str; 8] = [
    "new",
    "open",
    "in_progress",
    "fixed",
    "retest",
    "closed",
    "rejected",
    "deferred",
];
pub const SEVERITIES: [&str; 4] = ["critical", "major", "minor", "trivial"];
pub const PRIORITIES: [&str; 4] = ["low", "medium", "high", "critical"];
pub const RESOLUTIONS: [&str; 5] = [
    "fixed",
    "duplicate",
    "not_reproducible",
    "wont_fix",
    "by_design",
];
pub const TARGET_KINDS: [&str; 5] = [
    "result",
    "test_case",
    "requirement",
    "finding",
    "session_note",
];

/// The statuses a defect in `from` may move to (not itself).
pub fn next(from: &str) -> &'static [&'static str] {
    match from {
        "new" => &["open", "rejected", "deferred"],
        "open" => &["in_progress", "rejected", "deferred"],
        "in_progress" => &["fixed"],
        "fixed" => &["retest"],
        "retest" => &["closed", "open"],
        "closed" | "rejected" | "deferred" => &["open"],
        _ => &[],
    }
}

/// True if `from → to` is allowed; staying in the same status always is.
pub fn allowed(from: &str, to: &str) -> bool {
    from == to || next(from).contains(&to)
}

/// True for the statuses that carry a resolution.
pub fn needs_resolution(status: &str) -> bool {
    matches!(status, "closed" | "rejected")
}

/// True if the matrix counts the defect as open.
#[cfg_attr(not(test), allow(dead_code))] // the matrix (TS twin) applies it
pub fn is_open(status: &str) -> bool {
    !matches!(status, "closed" | "rejected")
}

/// Checks a status change with its resolution; returns the resolution to
/// store (None unless the status needs one).
pub fn check(from: &str, to: &str, resolution: Option<&str>) -> Result<Option<String>, String> {
    if !STATUSES.contains(&to) {
        return Err(format!("unknown defect status: {to}"));
    }
    if !allowed(from, to) {
        return Err(format!("defect-transition: {from} → {to}"));
    }
    if !needs_resolution(to) {
        return Ok(None);
    }
    match resolution.filter(|r| !r.is_empty()) {
        Some(r) if RESOLUTIONS.contains(&r) => Ok(Some(r.to_string())),
        Some(r) => Err(format!("unknown defect resolution: {r}")),
        None => Err("defect-resolution-required".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const VECTORS: &str = include_str!("../../tests/fixtures/defect-vectors.json");

    #[test]
    fn the_transition_table_matches_the_shared_vectors() {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        for from in STATUSES {
            for to in STATUSES {
                let expected = v["transitions"][from]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|x| x == to);
                assert_eq!(allowed(from, to), expected || from == to, "{from} → {to}");
            }
        }
    }

    #[test]
    fn closing_needs_a_resolution_and_other_statuses_drop_it() {
        assert_eq!(
            check("retest", "closed", None).unwrap_err(),
            "defect-resolution-required"
        );
        assert_eq!(
            check("retest", "closed", Some("fixed")).unwrap(),
            Some("fixed".into())
        );
        assert!(check("open", "rejected", Some("nope")).is_err());
        assert_eq!(check("closed", "open", Some("fixed")).unwrap(), None);
        assert!(check("new", "fixed", None).is_err());
        assert!(check("new", "bogus", None).is_err());
    }

    #[test]
    fn deferred_counts_as_open() {
        assert!(is_open("deferred"));
        assert!(!is_open("closed") && !is_open("rejected"));
    }
}
