//! `home_metrics` (RED-W6): the one read behind the execution numbers of
//! Inicio. A thin entry point only: it checks the request and calls the
//! shared execution derivation of step 10 (`execution::home_metrics`,
//! contract v1 §2.4), which holds every rule (latest finals, windows, daily
//! buckets, exit criteria, re-test, queues, deleted runs).

use rusqlite::Connection;
use tauri::State;

use crate::db::Db;
use crate::execution::derive::{HomeMetrics, HomeRequest};

/// Longest request accepted: a few months of days and a handful of windows.
const MAX_DAYS: usize = 400;
const MAX_WINDOWS: usize = 16;
const MAX_PROJECTS: usize = 200;

/// What the entry point checks before calling the core: day starts
/// ascending, windows inside them, `now` not before the first day.
pub fn validate(r: &HomeRequest) -> Result<(), String> {
    if r.day_starts.is_empty() || r.day_starts.len() > MAX_DAYS {
        return Err(format!("dayStarts must hold 1 to {MAX_DAYS} days"));
    }
    if r.day_starts.windows(2).any(|w| w[0] >= w[1]) {
        return Err("dayStarts must be strictly ascending".into());
    }
    if r.now < r.day_starts[0] {
        return Err("now is before the first day".into());
    }
    if r.windows.len() > MAX_WINDOWS {
        return Err(format!("at most {MAX_WINDOWS} windows"));
    }
    if r.windows
        .iter()
        .any(|w| w.from_index >= r.day_starts.len() || w.id.is_empty())
    {
        return Err("a window starts outside dayStarts".into());
    }
    if r.project_ids
        .as_ref()
        .is_some_and(|ids| ids.len() > MAX_PROJECTS || ids.iter().any(|id| id.trim().is_empty()))
    {
        return Err(format!(
            "projectIds must hold at most {MAX_PROJECTS} non-blank ids"
        ));
    }
    if r.queue_limit.is_some_and(|n| !(1..=50).contains(&n)) {
        return Err("queueLimit must be 1 to 50".into());
    }
    Ok(())
}

pub fn home_metrics_of(
    conn: &Connection,
    user_id: &str,
    request: &HomeRequest,
) -> Result<HomeMetrics, String> {
    if user_id.trim().is_empty() {
        return Err("userId is required".into());
    }
    validate(request)?;
    crate::execution::home_metrics(conn, user_id, request)
}

/// Read only (AUDIT-EXEMPT in `audit_tests.rs`).
#[tauri::command]
pub fn home_metrics(
    db: State<Db>,
    user_id: String,
    request: HomeRequest,
) -> Result<HomeMetrics, String> {
    db.with_conn(|conn| home_metrics_of(conn, &user_id, &request))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution::derive::HomeWindow;
    use serde_json::json;

    fn request(days: Vec<i64>, windows: &[(&str, usize)]) -> HomeRequest {
        HomeRequest {
            project_ids: None,
            now: days.last().copied().unwrap_or(0) + 1,
            day_starts: days,
            windows: windows
                .iter()
                .map(|(id, i)| HomeWindow {
                    id: (*id).into(),
                    from_index: *i,
                })
                .collect(),
            queue_limit: None,
        }
    }

    #[test]
    fn validates_the_request() {
        assert!(validate(&request(vec![1, 2, 3], &[("7d", 0), ("today", 2)])).is_ok());
        assert!(validate(&request(vec![], &[])).is_err());
        assert!(validate(&request(vec![2, 1], &[])).is_err());
        assert!(validate(&request(vec![1, 1], &[])).is_err());
        assert!(validate(&request(vec![1, 2], &[("x", 2)])).is_err());
        assert!(validate(&request(vec![1, 2], &[("", 0)])).is_err());
        let mut r = request(vec![10, 20], &[]);
        r.now = 5;
        assert!(validate(&r).is_err());
        let mut r = request(vec![1], &[]);
        r.queue_limit = Some(0);
        assert!(validate(&r).is_err());
        r.queue_limit = Some(5);
        assert!(validate(&r).is_ok());
        r.project_ids = Some(vec![" ".into()]);
        assert!(validate(&r).is_err());
    }

    #[test]
    fn deserializes_the_client_request() {
        let r: HomeRequest = serde_json::from_value(json!({
            "dayStarts": [1, 2], "now": 3, "windows": [{ "id": "today", "fromIndex": 1 }]
        }))
        .unwrap();
        assert_eq!(r.windows[0].from_index, 1);
        assert!(r.project_ids.is_none());
    }

    #[test]
    fn refuses_before_reading() {
        // An in-memory connection without the schema: a refused request never
        // reaches the core.
        let conn = Connection::open_in_memory().unwrap();
        assert!(home_metrics_of(&conn, " ", &request(vec![1], &[])).is_err());
        let err = home_metrics_of(&conn, "u1", &request(vec![2, 1], &[])).unwrap_err();
        assert!(err.contains("ascending"), "{err}");
    }
}
