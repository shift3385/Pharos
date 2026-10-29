//! Human-readable keys of cases (`ATS_001`), requirements (`REQ-001`) and
//! defects (`DEF-001`) — DAT-01, ADR-0010.
//!
//! A key travels as a Gherkin tag, so once assigned it never changes and is
//! never handed out again. The next number of each project and kind lives in
//! `key_counters` and only moves forward: deleting (or, later, purging) rows
//! cannot make a key come back. Every key ever stored, live or deleted, also
//! counts as taken. Server-leased blocks (ADR-0010 rule 4) arrive in phase 2.

use rusqlite::{params, Connection, OptionalExtension};

/// The three kinds of key; the value is stored in `key_counters.kind`.
#[derive(Clone, Copy)]
pub(crate) enum KeyKind {
    Case,
    Requirement,
    Defect,
}

impl KeyKind {
    fn name(self) -> &'static str {
        match self {
            KeyKind::Case => "case",
            KeyKind::Requirement => "requirement",
            KeyKind::Defect => "defect",
        }
    }

    /// Table and column that hold this kind of key.
    fn column(self) -> (&'static str, &'static str) {
        match self {
            KeyKind::Case => ("test_cases", "scenario_id"),
            KeyKind::Requirement => ("requirements", "requirement_key"),
            KeyKind::Defect => ("planner_cards", "card_key"),
        }
    }
}

/// True if `key` was ever used in the project, by a live or a deleted row.
pub(crate) fn taken(
    conn: &Connection,
    kind: KeyKind,
    project_id: &str,
    key: &str,
) -> Result<bool, String> {
    let (table, column) = kind.column();
    conn.query_row(
        &format!("SELECT 1 FROM {table} WHERE project_id = ?1 AND {column} = ?2 LIMIT 1"),
        params![project_id, key],
        |_| Ok(()),
    )
    .optional()
    .map_err(|e| e.to_string())
    .map(|r| r.is_some())
}

/// True if a live row of the project already uses `key`.
pub(crate) fn taken_live(
    conn: &Connection,
    kind: KeyKind,
    project_id: &str,
    key: &str,
) -> Result<bool, String> {
    let (table, column) = kind.column();
    conn.query_row(
        &format!(
            "SELECT 1 FROM {table} WHERE project_id = ?1 AND {column} = ?2 \
             AND deleted_at IS NULL LIMIT 1"
        ),
        params![project_id, key],
        |_| Ok(()),
    )
    .optional()
    .map_err(|e| e.to_string())
    .map(|r| r.is_some())
}

/// Number of `key` when it is `prefix` followed only by digits.
fn number_of(key: &str, prefix: &str) -> Option<u64> {
    let rest = key.strip_prefix(prefix)?;
    if rest.is_empty() || !rest.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    rest.parse().ok()
}

/// Next number of the project's counter. A project without a counter yet is
/// seeded from the highest key it ever used with `prefix` (live or deleted).
fn counter(
    conn: &Connection,
    kind: KeyKind,
    project_id: &str,
    prefix: &str,
) -> Result<u64, String> {
    let stored: Option<i64> = conn
        .query_row(
            "SELECT next_value FROM key_counters WHERE project_id = ?1 AND kind = ?2",
            params![project_id, kind.name()],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(n) = stored {
        return Ok(n.max(1) as u64);
    }
    let (table, column) = kind.column();
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {column} FROM {table} WHERE project_id = ?1 AND {column} IS NOT NULL"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut max = 0;
    for key in rows {
        if let Some(n) = number_of(&key.map_err(|e| e.to_string())?, prefix) {
            max = max.max(n);
        }
    }
    Ok(max + 1)
}

fn store(conn: &Connection, kind: KeyKind, project_id: &str, next: u64) -> Result<(), String> {
    conn.execute(
        "INSERT INTO key_counters (project_id, kind, next_value) VALUES (?1, ?2, ?3) \
         ON CONFLICT(project_id, kind) DO UPDATE SET next_value = \
         max(key_counters.next_value, excluded.next_value)",
        params![project_id, kind.name(), next as i64],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Hands out the next key of a project: `prefix` + the counter padded to
/// `digits`, skipping any key already used, and moves the counter past it.
pub(crate) fn allocate(
    conn: &Connection,
    kind: KeyKind,
    project_id: &str,
    prefix: &str,
    digits: usize,
) -> Result<String, String> {
    let mut n = counter(conn, kind, project_id, prefix)?;
    loop {
        let key = format!("{prefix}{n:0digits$}");
        if !taken(conn, kind, project_id, &key)? {
            store(conn, kind, project_id, n + 1)?;
            return Ok(key);
        }
        n += 1;
    }
}

/// Records a key given by hand (import, manual field) so the counter never
/// hands out the same number later.
pub(crate) fn note_manual(
    conn: &Connection,
    kind: KeyKind,
    project_id: &str,
    prefix: &str,
    key: &str,
) -> Result<(), String> {
    let next = counter(conn, kind, project_id, prefix)?;
    let after = number_of(key, prefix).map_or(next, |n| next.max(n + 1));
    store(conn, kind, project_id, after)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        c
    }

    fn add_requirement(c: &Connection, key: &str, deleted: bool) {
        let ws = crate::db::ensure_workspace(c).unwrap();
        c.execute(
            "INSERT INTO requirements (id, workspace_id, project_id, requirement_key, title, \
             created_by, updated_by, created_at, updated_at, deleted_at) \
             VALUES (?1, ?2, 'p1', ?3, 't', 'u', 'u', 'now', 'now', ?4)",
            params![
                uuid::Uuid::new_v4().to_string(),
                ws,
                key,
                deleted.then_some("now")
            ],
        )
        .unwrap();
    }

    #[test]
    fn numbers_from_one_and_pads() {
        let c = conn();
        assert_eq!(
            allocate(&c, KeyKind::Case, "p1", "ATS_", 3).unwrap(),
            "ATS_001"
        );
        assert_eq!(
            allocate(&c, KeyKind::Case, "p1", "ATS_", 3).unwrap(),
            "ATS_002"
        );
        assert_eq!(
            allocate(&c, KeyKind::Case, "p2", "TC-", 4).unwrap(),
            "TC-0001"
        );
    }

    #[test]
    fn seeds_from_the_highest_key_ever_used_including_deleted() {
        let c = conn();
        add_requirement(&c, "REQ-001", false);
        add_requirement(&c, "REQ-007", true);
        add_requirement(&c, "REQ-x9", false);
        assert_eq!(
            allocate(&c, KeyKind::Requirement, "p1", "REQ-", 3).unwrap(),
            "REQ-008"
        );
    }

    #[test]
    fn never_reuses_a_key_once_rows_are_gone() {
        let c = conn();
        add_requirement(&c, "REQ-001", false);
        assert_eq!(
            allocate(&c, KeyKind::Requirement, "p1", "REQ-", 3).unwrap(),
            "REQ-002"
        );
        // Even if every row disappears (purge), the counter keeps moving forward.
        c.execute("DELETE FROM requirements", []).unwrap();
        assert_eq!(
            allocate(&c, KeyKind::Requirement, "p1", "REQ-", 3).unwrap(),
            "REQ-003"
        );
    }

    #[test]
    fn manual_keys_push_the_counter_and_are_skipped() {
        let c = conn();
        note_manual(&c, KeyKind::Requirement, "p1", "REQ-", "REQ-041").unwrap();
        assert_eq!(
            allocate(&c, KeyKind::Requirement, "p1", "REQ-", 3).unwrap(),
            "REQ-042"
        );
        // A key taken by a row the counter did not see (e.g. pulled) is skipped.
        add_requirement(&c, "REQ-043", false);
        assert_eq!(
            allocate(&c, KeyKind::Requirement, "p1", "REQ-", 3).unwrap(),
            "REQ-044"
        );
    }
}
