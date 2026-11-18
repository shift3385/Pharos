//! Notifications on the desktop (RED-W2, ADR-0048). The network side lives in
//! TypeScript (`src/modules/notifications`, like the account preferences);
//! this is the encrypted local copy:
//! - what the server delivered to the account (`origin = 'server'`), with the
//!   read marks made here and not sent yet (`read_pending`);
//! - local notifications that never travel (sync conflicts);
//! - the outbox of events emitted here while offline.
//!
//! Kept `RETENTION_DAYS` days and at most `MAX_PER_USER` per account, the
//! same rule as the server.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
#[cfg(feature = "tauri")]
use tauri::State;
#[cfg(test)]
use ts_rs::TS;
use uuid::Uuid;

use crate::db::Db;

pub(crate) const RETENTION_DAYS: i64 = 90;
pub(crate) const MAX_PER_USER: i64 = 500;

const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn require_user(user: &str) -> Result<(), String> {
    if user.is_empty() {
        Err("not-authenticated".into())
    } else {
        Ok(())
    }
}

/// A notification as the panel shows it.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: String,
    pub origin: String,
    pub kind: String,
    pub actor_id: Option<String>,
    pub actor_name: String,
    pub workspace_id: Option<String>,
    pub project_id: Option<String>,
    #[cfg_attr(test, ts(type = "unknown"))]
    pub subject: Value,
    #[cfg_attr(test, ts(type = "unknown"))]
    pub data: Value,
    pub created_at: String,
    pub read_at: Option<String>,
}

/// A row of `GET /api/me/notifications`.
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ServerNotification {
    pub id: String,
    pub kind: String,
    pub actor_id: Option<String>,
    pub actor_name: String,
    pub workspace_id: Option<String>,
    pub project_id: Option<String>,
    #[cfg_attr(test, ts(type = "unknown"))]
    pub subject: Value,
    #[cfg_attr(test, ts(type = "unknown"))]
    pub data: Value,
    pub created_at: String,
    pub read_at: Option<String>,
}

/// A notification of this device only (a sync conflict).
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalNotification {
    pub kind: String,
    pub project_id: Option<String>,
    #[cfg_attr(test, ts(type = "unknown"))]
    pub subject: Value,
    #[cfg_attr(test, ts(type = "unknown"))]
    pub data: Value,
    pub dedupe_key: Option<String>,
}

/// An event waiting to be sent (`POST /api/notifications` body `input`).
#[cfg_attr(test, derive(TS), ts(export))]
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OutboxItem {
    pub id: String,
    #[cfg_attr(test, ts(type = "unknown"))]
    pub body: Value,
}

/// Drops what aged out: older than the retention, or past the newest 500.
fn prune(conn: &Connection, user: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM notifications WHERE user_id = ?1
            AND julianday(created_at) < julianday('now') - ?2",
        params![user, RETENTION_DAYS],
    )
    .map_err(err)?;
    conn.execute(
        "DELETE FROM notifications WHERE user_id = ?1 AND id NOT IN
            (SELECT id FROM notifications WHERE user_id = ?1
              ORDER BY created_at DESC, rowid DESC LIMIT ?2)",
        params![user, MAX_PER_USER],
    )
    .map_err(err)?;
    Ok(())
}

fn json_col(r: &rusqlite::Row, i: usize) -> rusqlite::Result<Value> {
    let s: String = r.get(i)?;
    Ok(serde_json::from_str(&s).unwrap_or(Value::Null))
}

pub(crate) fn list(conn: &Connection, user: &str) -> Result<Vec<Notification>, String> {
    require_user(user)?;
    prune(conn, user)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, origin, kind, actor_id, actor_name, workspace_id, project_id, subject,
                    data, created_at, read_at
               FROM notifications WHERE user_id = ?1 ORDER BY created_at DESC, rowid DESC",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map(params![user], |r| {
            Ok(Notification {
                id: r.get(0)?,
                origin: r.get(1)?,
                kind: r.get(2)?,
                actor_id: r.get(3)?,
                actor_name: r.get(4)?,
                workspace_id: r.get(5)?,
                project_id: r.get(6)?,
                subject: json_col(r, 7)?,
                data: json_col(r, 8)?,
                created_at: r.get(9)?,
                read_at: r.get(10)?,
            })
        })
        .map_err(err)?;
    rows.collect::<rusqlite::Result<_>>().map_err(err)
}

/// Stores a pull: new and changed rows (a read mark made here and not sent
/// yet wins over the server's «unread»), the cursor, and, when `kept_ids` is
/// given (a pull that reached the end), drops server rows the server no
/// longer keeps.
pub(crate) fn apply_pull(
    conn: &Connection,
    user: &str,
    items: &[ServerNotification],
    cursor: i64,
    kept_ids: Option<&[String]>,
) -> Result<(), String> {
    require_user(user)?;
    for n in items {
        conn.execute(
            "INSERT INTO notifications (id, user_id, origin, kind, actor_id, actor_name,
                    workspace_id, project_id, subject, data, created_at, read_at)
             VALUES (?1, ?2, 'server', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
                read_at = CASE WHEN notifications.read_pending = 1
                               THEN notifications.read_at ELSE excluded.read_at END,
                read_pending = CASE WHEN excluded.read_at IS NOT NULL THEN 0
                                    ELSE notifications.read_pending END
              WHERE notifications.user_id = excluded.user_id",
            params![
                n.id,
                user,
                n.kind,
                n.actor_id,
                n.actor_name,
                n.workspace_id,
                n.project_id,
                n.subject.to_string(),
                n.data.to_string(),
                n.created_at,
                n.read_at,
            ],
        )
        .map_err(err)?;
    }
    if let Some(kept) = kept_ids {
        let kept = serde_json::to_string(kept).map_err(err)?;
        conn.execute(
            "DELETE FROM notifications WHERE user_id = ?1 AND origin = 'server'
                AND id NOT IN (SELECT value FROM json_each(?2))",
            params![user, kept],
        )
        .map_err(err)?;
    }
    conn.execute(
        "INSERT INTO notification_cursor (user_id, seq) VALUES (?1, ?2)
         ON CONFLICT(user_id) DO UPDATE SET seq = max(seq, excluded.seq)",
        params![user, cursor],
    )
    .map_err(err)?;
    prune(conn, user)
}

pub(crate) fn cursor(conn: &Connection, user: &str) -> Result<i64, String> {
    Ok(conn
        .query_row(
            "SELECT seq FROM notification_cursor WHERE user_id = ?1",
            params![user],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?
        .unwrap_or(0))
}

/// Adds a local notification; false if the same event is already there.
pub(crate) fn add_local(
    conn: &Connection,
    user: &str,
    n: &LocalNotification,
) -> Result<bool, String> {
    require_user(user)?;
    let added = conn
        .execute(
            &format!(
                "INSERT INTO notifications (id, user_id, origin, kind, project_id, subject, data,
                        dedupe_key, created_at)
                 VALUES (?1, ?2, 'local', ?3, ?4, ?5, ?6, ?7, {NOW})
                 ON CONFLICT DO NOTHING"
            ),
            params![
                Uuid::new_v4().to_string(),
                user,
                n.kind,
                n.project_id,
                n.subject.to_string(),
                n.data.to_string(),
                n.dedupe_key,
            ],
        )
        .map_err(err)?;
    prune(conn, user)?;
    Ok(added > 0)
}

/// Marks some (`ids`) or all of the account's notifications read here. Server
/// ones are flagged for the next send.
pub(crate) fn mark_read(
    conn: &Connection,
    user: &str,
    ids: Option<&[String]>,
) -> Result<usize, String> {
    require_user(user)?;
    let ids = ids.map(serde_json::to_string).transpose().map_err(err)?;
    conn.execute(
        &format!(
            "UPDATE notifications SET read_at = {NOW},
                    read_pending = CASE WHEN origin = 'server' THEN 1 ELSE 0 END
              WHERE user_id = ?1 AND read_at IS NULL
                AND (?2 IS NULL OR id IN (SELECT value FROM json_each(?2)))"
        ),
        params![user, ids],
    )
    .map_err(err)
}

pub(crate) fn read_pending(conn: &Connection, user: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM notifications WHERE user_id = ?1 AND read_pending = 1")
        .map_err(err)?;
    let rows = stmt.query_map(params![user], |r| r.get(0)).map_err(err)?;
    rows.collect::<rusqlite::Result<_>>().map_err(err)
}

pub(crate) fn read_sent(conn: &Connection, user: &str, ids: &[String]) -> Result<(), String> {
    let ids = serde_json::to_string(ids).map_err(err)?;
    conn.execute(
        "UPDATE notifications SET read_pending = 0
          WHERE user_id = ?1 AND id IN (SELECT value FROM json_each(?2))",
        params![user, ids],
    )
    .map_err(err)?;
    Ok(())
}

pub(crate) fn outbox_add(conn: &Connection, user: &str, body: &Value) -> Result<(), String> {
    require_user(user)?;
    conn.execute(
        &format!(
            "INSERT INTO notification_outbox (id, user_id, body, created_at)
             VALUES (?1, ?2, ?3, {NOW})"
        ),
        params![Uuid::new_v4().to_string(), user, body.to_string()],
    )
    .map_err(err)?;
    Ok(())
}

pub(crate) fn outbox_list(conn: &Connection, user: &str) -> Result<Vec<OutboxItem>, String> {
    let mut stmt = conn
        .prepare("SELECT id, body FROM notification_outbox WHERE user_id = ?1 ORDER BY created_at, rowid")
        .map_err(err)?;
    let rows = stmt
        .query_map(params![user], |r| {
            Ok(OutboxItem {
                id: r.get(0)?,
                body: json_col(r, 1)?,
            })
        })
        .map_err(err)?;
    rows.collect::<rusqlite::Result<_>>().map_err(err)
}

pub(crate) fn outbox_done(conn: &Connection, user: &str, ids: &[String]) -> Result<(), String> {
    let ids = serde_json::to_string(ids).map_err(err)?;
    conn.execute(
        "DELETE FROM notification_outbox WHERE user_id = ?1 AND id IN (SELECT value FROM json_each(?2))",
        params![user, ids],
    )
    .map_err(err)?;
    Ok(())
}

// Commands. Every write is saved at once: a notification is small and the
// panel must not lose a read mark on a crash.

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn notifications_list(db: State<Db>, user_id: String) -> Result<Vec<Notification>, String> {
    db.with_conn(|c| list(c, &user_id))
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn notifications_cursor(db: State<Db>, user_id: String) -> Result<i64, String> {
    db.with_conn(|c| cursor(c, &user_id))
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn notifications_apply_pull(
    db: State<Db>,
    user_id: String,
    items: Vec<ServerNotification>,
    cursor: i64,
    kept_ids: Option<Vec<String>>,
) -> Result<(), String> {
    db.with_tx(|c| apply_pull(c, &user_id, &items, cursor, kept_ids.as_deref()))?;
    db.persist()
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn notifications_add_local(
    db: State<Db>,
    user_id: String,
    notification: LocalNotification,
) -> Result<bool, String> {
    let added = db.with_tx(|c| add_local(c, &user_id, &notification))?;
    if added {
        db.persist()?;
    }
    Ok(added)
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn notifications_mark_read(
    db: State<Db>,
    user_id: String,
    ids: Option<Vec<String>>,
) -> Result<usize, String> {
    let n = db.with_tx(|c| mark_read(c, &user_id, ids.as_deref()))?;
    if n > 0 {
        db.persist()?;
    }
    Ok(n)
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn notifications_read_pending(db: State<Db>, user_id: String) -> Result<Vec<String>, String> {
    db.with_conn(|c| read_pending(c, &user_id))
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn notifications_read_sent(
    db: State<Db>,
    user_id: String,
    ids: Vec<String>,
) -> Result<(), String> {
    db.with_tx(|c| read_sent(c, &user_id, &ids))?;
    db.persist()
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn notifications_outbox_add(db: State<Db>, user_id: String, body: Value) -> Result<(), String> {
    db.with_tx(|c| outbox_add(c, &user_id, &body))?;
    db.persist()
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn notifications_outbox_list(
    db: State<Db>,
    user_id: String,
) -> Result<Vec<OutboxItem>, String> {
    db.with_conn(|c| outbox_list(c, &user_id))
}

#[cfg(feature = "tauri")]
#[tauri::command]
pub fn notifications_outbox_done(
    db: State<Db>,
    user_id: String,
    ids: Vec<String>,
) -> Result<(), String> {
    db.with_tx(|c| outbox_done(c, &user_id, &ids))?;
    db.persist()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const A: &str = "user-a";

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        c
    }

    fn server(id: &str, read: Option<&str>) -> ServerNotification {
        ServerNotification {
            id: id.into(),
            kind: "defect.assigned".into(),
            actor_id: Some("ana".into()),
            actor_name: "Ana".into(),
            workspace_id: None,
            project_id: Some("p1".into()),
            subject: json!({ "entity": "defect", "id": "d1", "title": "Saldo" }),
            data: json!({}),
            created_at: "2099-01-01T10:00:00.000Z".into(),
            read_at: read.map(str::to_string),
        }
    }

    #[test]
    fn a_pull_is_stored_and_its_cursor_kept() {
        let c = conn();
        apply_pull(&c, A, &[server("n1", None)], 7, None).unwrap();
        let l = list(&c, A).unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].subject["title"], "Saldo");
        assert_eq!(cursor(&c, A).unwrap(), 7);
        // Another account sees nothing.
        assert!(list(&c, "user-b").unwrap().is_empty());
    }

    #[test]
    fn a_read_mark_made_here_survives_a_pull_until_it_is_sent() {
        let c = conn();
        apply_pull(&c, A, &[server("n1", None)], 1, None).unwrap();
        assert_eq!(mark_read(&c, A, None).unwrap(), 1);
        assert_eq!(read_pending(&c, A).unwrap(), vec!["n1".to_string()]);
        // The server still says unread: ours wins.
        apply_pull(&c, A, &[server("n1", None)], 2, None).unwrap();
        assert!(list(&c, A).unwrap()[0].read_at.is_some());
        read_sent(&c, A, &["n1".into()]).unwrap();
        assert!(read_pending(&c, A).unwrap().is_empty());
        // A read mark from another device arrives.
        apply_pull(
            &c,
            A,
            &[server("n2", Some("2099-01-02T00:00:00.000Z"))],
            3,
            None,
        )
        .unwrap();
        assert!(list(&c, A).unwrap().iter().all(|n| n.read_at.is_some()));
    }

    #[test]
    fn what_the_server_no_longer_keeps_goes_but_local_ones_stay() {
        let c = conn();
        apply_pull(&c, A, &[server("n1", None), server("n2", None)], 2, None).unwrap();
        let local = LocalNotification {
            kind: "sync.conflict".into(),
            project_id: None,
            subject: json!({ "entity": "sync", "id": "s", "title": "2" }),
            data: json!({ "count": 2 }),
            dedupe_key: Some("sync:1".into()),
        };
        assert!(add_local(&c, A, &local).unwrap());
        assert!(!add_local(&c, A, &local).unwrap());
        apply_pull(&c, A, &[], 2, Some(&["n2".to_string()])).unwrap();
        let ids: Vec<String> = list(&c, A)
            .unwrap()
            .into_iter()
            .map(|n| n.origin + ":" + &n.kind)
            .collect();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&"local:sync.conflict".to_string()));
    }

    #[test]
    fn old_and_extra_notifications_are_pruned() {
        let c = conn();
        let mut old = server("old", None);
        old.created_at = "2000-01-01T00:00:00.000Z".into();
        apply_pull(&c, A, &[old], 1, None).unwrap();
        assert!(list(&c, A).unwrap().is_empty());
        let many: Vec<ServerNotification> = (0..MAX_PER_USER + 5)
            .map(|i| {
                let mut n = server(&format!("n{i}"), None);
                n.created_at = format!("2099-01-01T10:{:02}:{:02}.000Z", i / 60, i % 60);
                n
            })
            .collect();
        apply_pull(&c, A, &many, 2, None).unwrap();
        assert_eq!(list(&c, A).unwrap().len() as i64, MAX_PER_USER);
    }

    #[test]
    fn the_outbox_keeps_events_until_sent() {
        let c = conn();
        outbox_add(&c, A, &json!({ "kind": "cycle.closed" })).unwrap();
        let items = outbox_list(&c, A).unwrap();
        assert_eq!(items.len(), 1);
        outbox_done(&c, A, &[items[0].id.clone()]).unwrap();
        assert!(outbox_list(&c, A).unwrap().is_empty());
    }
}
