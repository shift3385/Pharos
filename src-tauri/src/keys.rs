//! Human-readable keys of cases (`ATS_001`), requirements (`REQ-001`),
//! defects (`DEF-001`), runs (`RUN-001`, ADR-0013) and test cycles (`CYC-001`,
//! ADR-0017) — DAT-01, ADR-0010.
//!
//! A key travels as a Gherkin tag, so once assigned it never changes and is
//! never handed out again. The next number of each project and kind lives in
//! `key_counters` and only moves forward: deleting or purging (SYNC-06) rows
//! cannot make a key come back. Every key ever stored, live, deleted or purged
//! (`retired_keys`), also counts as taken. Numbers come from blocks leased
//! from the server (ADR-0010 rule 4), so two devices never hand out the same
//! key; see `allocate`.

use rusqlite::{params, Connection, OptionalExtension};

/// The kinds of key; the value is stored in `key_counters.kind`.
#[derive(Clone, Copy)]
pub(crate) enum KeyKind {
    Case,
    Requirement,
    Defect,
    Run,
    Cycle,
}

impl KeyKind {
    fn name(self) -> &'static str {
        match self {
            KeyKind::Case => "case",
            KeyKind::Requirement => "requirement",
            KeyKind::Defect => "defect",
            KeyKind::Run => "run",
            KeyKind::Cycle => "cycle",
        }
    }

    /// Table and column that hold this kind of key.
    fn column(self) -> (&'static str, &'static str) {
        match self {
            KeyKind::Case => ("test_cases", "scenario_id"),
            KeyKind::Requirement => ("requirements", "requirement_key"),
            KeyKind::Defect => ("defects", "defect_key"),
            KeyKind::Run => ("runs", "run_key"),
            KeyKind::Cycle => ("test_cycles", "cycle_key"),
        }
    }
}

/// True if `key` was ever used in the project, by a live, deleted or purged row.
pub(crate) fn taken(
    conn: &Connection,
    kind: KeyKind,
    project_id: &str,
    key: &str,
) -> Result<bool, String> {
    let (table, column) = kind.column();
    conn.query_row(
        &format!(
            "SELECT 1 FROM {table} WHERE project_id = ?1 AND {column} = ?2 \
             UNION ALL SELECT 1 FROM retired_keys \
             WHERE project_id = ?1 AND kind = ?3 AND key = ?2 LIMIT 1"
        ),
        params![project_id, key, kind.name()],
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
            "SELECT {column} FROM {table} WHERE project_id = ?1 AND {column} IS NOT NULL \
             UNION ALL SELECT key FROM retired_keys WHERE project_id = ?1 AND kind = ?2"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id, kind.name()], |r| r.get::<_, String>(0))
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

/// Last number of the block leased from the server, if any (ADR-0010 rule 4).
fn block_end(conn: &Connection, kind: KeyKind, project_id: &str) -> Result<Option<u64>, String> {
    let end: Option<Option<i64>> = conn
        .query_row(
            "SELECT block_end FROM key_counters WHERE project_id = ?1 AND kind = ?2",
            params![project_id, kind.name()],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(end.flatten().map(|e| e.max(0) as u64))
}

/// True for a provisional key (`ATS_?KQZD`): local, waiting for a definitive
/// one; it never ends in digits, so it never looks like a number of the series.
pub(crate) fn is_provisional(key: &str) -> bool {
    key.contains('?')
}

/// A provisional key: `prefix` + `?` + four letters, unused in the project.
fn provisional(
    conn: &Connection,
    kind: KeyKind,
    project_id: &str,
    prefix: &str,
) -> Result<String, String> {
    loop {
        let letters: String = uuid::Uuid::new_v4()
            .as_bytes()
            .iter()
            .take(4)
            .map(|b| char::from(b'A' + b % 26))
            .collect();
        let key = format!("{prefix}?{letters}");
        if !taken(conn, kind, project_id, &key)? {
            return Ok(key);
        }
    }
}

/// A fresh provisional key of the project, with its prefix.
pub(crate) fn provisional_key(
    conn: &Connection,
    kind: KeyKind,
    project_id: &str,
) -> Result<String, String> {
    let (prefix, _) = numbering(conn, kind, project_id)?;
    provisional(conn, kind, project_id, &prefix)
}

/// Prefix and padding of a project's keys of one kind.
pub(crate) fn numbering(
    conn: &Connection,
    kind: KeyKind,
    project_id: &str,
) -> Result<(String, usize), String> {
    Ok(match kind {
        KeyKind::Case => conn
            .query_row(
                "SELECT case_id_prefix, case_id_digits FROM projects WHERE id = ?1",
                params![project_id],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?.max(1) as usize)),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| ("ATS_".to_string(), 3)),
        KeyKind::Requirement => (
            crate::requirement::KEY_PREFIX.to_string(),
            crate::requirement::KEY_DIGITS,
        ),
        KeyKind::Defect => (
            crate::defects::KEY_PREFIX.to_string(),
            crate::defects::KEY_DIGITS,
        ),
        KeyKind::Run => (crate::runs::KEY_PREFIX.to_string(), crate::runs::KEY_DIGITS),
        KeyKind::Cycle => (
            crate::cycles::KEY_PREFIX.to_string(),
            crate::cycles::KEY_DIGITS,
        ),
    })
}

/// Hands out the next key of a project: `prefix` + the counter padded to
/// `digits`, skipping any key already used, and moves the counter past it.
///
/// Where the number comes from (ADR-0010 rules 3 and 4):
/// - a project the server never saw belongs to this device alone, which
///   numbers it freely (its first lease registers the highest number used);
/// - any other project numbers from the block leased from the server;
/// - with no number left in the block (offline before the first lease), the
///   key is provisional and gets a definitive one on the next sync
///   (`key_sync::finalize`).
pub(crate) fn allocate(
    conn: &Connection,
    kind: KeyKind,
    project_id: &str,
    prefix: &str,
    digits: usize,
) -> Result<String, String> {
    let mut n = counter(conn, kind, project_id, prefix)?;
    let end = block_end(conn, kind, project_id)?;
    let numbered_by_server = crate::oplog::known_to_server(conn, "project", project_id)?;
    loop {
        if numbered_by_server && end.map_or(true, |e| n > e) {
            return provisional(conn, kind, project_id, prefix);
        }
        let key = format!("{prefix}{n:0digits$}");
        if !taken(conn, kind, project_id, &key)? {
            store(conn, kind, project_id, n + 1)?;
            return Ok(key);
        }
        n += 1;
    }
}

/// Like `allocate`, but None instead of a provisional key.
pub(crate) fn allocate_definitive(
    conn: &Connection,
    kind: KeyKind,
    project_id: &str,
) -> Result<Option<String>, String> {
    let (prefix, digits) = numbering(conn, kind, project_id)?;
    let key = allocate(conn, kind, project_id, &prefix, digits)?;
    Ok((!is_provisional(&key)).then_some(key))
}

/// Numbers left in the leased block, and the next number to use.
pub(crate) fn remaining(
    conn: &Connection,
    kind: KeyKind,
    project_id: &str,
) -> Result<(u64, u64), String> {
    let (prefix, _) = numbering(conn, kind, project_id)?;
    let next = counter(conn, kind, project_id, &prefix)?;
    let left = block_end(conn, kind, project_id)?.map_or(0, |e| (e + 1).saturating_sub(next));
    Ok((left, next))
}

/// Stores a block leased from the server: the counter moves to its start (never
/// backwards) and its end bounds the numbering.
pub(crate) fn store_block(
    conn: &Connection,
    kind: KeyKind,
    project_id: &str,
    start: u64,
    end: u64,
) -> Result<(), String> {
    let (prefix, _) = numbering(conn, kind, project_id)?;
    let next = counter(conn, kind, project_id, &prefix)?.max(start);
    conn.execute(
        "INSERT INTO key_counters (project_id, kind, next_value, block_end) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(project_id, kind) DO UPDATE SET \
         next_value = max(key_counters.next_value, excluded.next_value), block_end = excluded.block_end",
        params![project_id, kind.name(), next as i64, end as i64],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

impl KeyKind {
    pub(crate) const ALL: [KeyKind; 5] = [
        KeyKind::Case,
        KeyKind::Requirement,
        KeyKind::Defect,
        KeyKind::Run,
        KeyKind::Cycle,
    ];

    /// The value of `key_counters.kind` and of the server's `kind`.
    pub(crate) fn as_str(self) -> &'static str {
        self.name()
    }

    pub(crate) fn parse(kind: &str) -> Option<KeyKind> {
        KeyKind::ALL.into_iter().find(|k| k.name() == kind)
    }

    /// The synced entity that carries this kind of key, and its key column.
    pub(crate) fn entity(self) -> (&'static str, &'static str, &'static str) {
        let (table, column) = self.column();
        let entity = match self {
            KeyKind::Case => "test_case",
            KeyKind::Requirement => "requirement",
            KeyKind::Defect => "defect",
            KeyKind::Run => "run",
            KeyKind::Cycle => crate::cycles::CYCLE,
        };
        (entity, table, column)
    }
}

/// Records the key of a row the purge is about to remove (SYNC-06): the
/// project's counter is created first (seeded while the row still exists), and
/// the key stays taken in `retired_keys` after the row is gone.
pub(crate) fn retire(
    conn: &Connection,
    kind: KeyKind,
    project_id: &str,
    prefix: &str,
    key: &str,
) -> Result<(), String> {
    let next = counter(conn, kind, project_id, prefix)?;
    store(conn, kind, project_id, next)?;
    if !key.is_empty() {
        conn.execute(
            "INSERT OR IGNORE INTO retired_keys (project_id, kind, key) VALUES (?1, ?2, ?3)",
            params![project_id, kind.name(), key],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
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
