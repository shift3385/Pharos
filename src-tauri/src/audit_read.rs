//! The read side of the audit log (AUD-01, ADR-0015 «Enmienda AUD-01»):
//! what Administración › Auditoría lists, filters and verifies. Read-only;
//! the write side is `journal::record` and `audit::append`.
//!
//! Who sees what until TEN-01 applies roles: an account sees the events it
//! owns (`user_id` = the account: its own, and those its other devices and
//! the web synced) and the ones that stay on this device (`user_id = ''`:
//! system events with no owner, changes made signed out).

use rusqlite::{params_from_iter, types::Value as Sql, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::audit::{self, ChainBreak};
use crate::db::Db;
use crate::oplog;

/// Largest page served (the UI asks for 50; the export pages through).
pub const MAX_LIMIT: i64 = 500;

/// The filters of the list. Every list is "any of"; empty or missing means
/// no filter. `projectIds` may hold `""` for events without a project.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AuditQuery {
    /// Inclusive lower bound on `at` (UTC ISO-8601).
    pub from: Option<String>,
    /// Exclusive upper bound on `at`.
    pub to: Option<String>,
    pub actors: Vec<String>,
    pub entities: Vec<String>,
    pub actions: Vec<String>,
    pub project_ids: Vec<String>,
    /// One element's history.
    pub entity_id: Option<String>,
    /// Part of the readable key (ATS_014, REQ-003…), any case.
    pub search: Option<String>,
    pub offset: i64,
    pub limit: Option<i64>,
}

/// One row of the list, with what the detail needs.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AuditRow {
    pub id: String,
    pub at: String,
    pub actor: String,
    pub on_behalf_of: Option<String>,
    pub action: String,
    pub entity: String,
    pub entity_id: String,
    pub entity_key: Option<String>,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub device_id: String,
    /// `{ field: [before, after] }` as stored; None once redacted.
    pub changes: Option<String>,
    pub summary: Option<String>,
    pub chain_workspace_id: String,
    pub chain_owner: String,
    pub chain_seq: i64,
    pub prev_hash: Option<String>,
    pub hash: String,
    pub redacted_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditPage {
    pub total: i64,
    pub events: Vec<AuditRow>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AuditProject {
    pub id: String,
    pub name: Option<String>,
}

/// The values the filters offer: only what the visible log holds.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditFacets {
    pub actors: Vec<String>,
    pub entities: Vec<String>,
    pub actions: Vec<String>,
    pub projects: Vec<AuditProject>,
    /// This device's id, so the UI can say «Este equipo».
    pub this_device: String,
}

/// Where a chain breaks (`audit::ChainBreak`), for the UI.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AuditBreak {
    /// gap | link | hash | changes
    pub kind: &'static str,
    pub seq: i64,
    /// For a gap: the number expected.
    pub expected: Option<i64>,
    /// The event at the break, when one is there.
    pub event_id: Option<String>,
    /// Its element, to open that element's history.
    pub entity_id: Option<String>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AuditChain {
    pub device_id: String,
    pub chain_workspace_id: String,
    pub chain_owner: String,
    pub count: i64,
    pub last_at: Option<String>,
    pub broken: Option<AuditBreak>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditVerify {
    pub chains: Vec<AuditChain>,
    pub this_device: String,
}

/// `user_id` filter shared by every read.
const VISIBLE: &str = "(a.user_id = ?1 OR a.user_id = '')";

fn any_of(col: &str, values: &[String], sql: &mut String, args: &mut Vec<Sql>) {
    if values.is_empty() {
        return;
    }
    let marks: Vec<String> = values
        .iter()
        .map(|v| {
            args.push(Sql::Text(v.clone()));
            format!("?{}", args.len())
        })
        .collect();
    sql.push_str(&format!(" AND {col} IN ({})", marks.join(", ")));
}

/// WHERE clause and its arguments for a query.
fn filter(user: &str, q: &AuditQuery) -> (String, Vec<Sql>) {
    let mut sql = format!("WHERE {VISIBLE}");
    let mut args = vec![Sql::Text(user.to_string())];
    fn bind(cond: &str, v: &str, sql: &mut String, args: &mut Vec<Sql>) {
        args.push(Sql::Text(v.to_string()));
        sql.push_str(&format!(
            " AND {}",
            cond.replace('?', &format!("?{}", args.len()))
        ));
    }
    if let Some(from) = q.from.as_deref().filter(|s| !s.is_empty()) {
        bind("a.at >= ?", from, &mut sql, &mut args);
    }
    if let Some(to) = q.to.as_deref().filter(|s| !s.is_empty()) {
        bind("a.at < ?", to, &mut sql, &mut args);
    }
    if let Some(id) = q.entity_id.as_deref().filter(|s| !s.is_empty()) {
        bind("a.entity_id = ?", id, &mut sql, &mut args);
    }
    if let Some(s) = q.search.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        bind(
            "instr(lower(coalesce(a.entity_key, '')), lower(?)) > 0",
            s,
            &mut sql,
            &mut args,
        );
    }
    any_of("a.actor", &q.actors, &mut sql, &mut args);
    any_of("a.entity", &q.entities, &mut sql, &mut args);
    any_of("a.action", &q.actions, &mut sql, &mut args);
    any_of(
        "coalesce(a.project_id, '')",
        &q.project_ids,
        &mut sql,
        &mut args,
    );
    (sql, args)
}

/// One page of the visible log, newest first.
pub fn list(conn: &Connection, user: &str, q: &AuditQuery) -> Result<AuditPage, String> {
    if user.trim().is_empty() {
        return Err("userId is required".into());
    }
    let limit = q.limit.unwrap_or(50).clamp(1, MAX_LIMIT);
    let offset = q.offset.max(0);
    let (cond, args) = filter(user, q);
    let total: i64 = conn
        .query_row(
            &format!("SELECT count(*) FROM audit_log a {cond}"),
            params_from_iter(args.iter()),
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT a.id, a.at, a.actor, a.on_behalf_of, a.action, a.entity, a.entity_id,
                    a.entity_key, a.project_id, p.name, a.device_id, a.changes, a.summary,
                    a.chain_workspace_id, a.chain_owner, a.chain_seq, a.prev_hash, a.hash,
                    a.redacted_at
               FROM audit_log a LEFT JOIN projects p ON p.id = a.project_id
               {cond}
              ORDER BY a.at DESC, a.hlc DESC, a.id
              LIMIT {limit} OFFSET {offset}"
        ))
        .map_err(|e| e.to_string())?;
    let events = stmt
        .query_map(params_from_iter(args.iter()), |r| {
            Ok(AuditRow {
                id: r.get(0)?,
                at: r.get(1)?,
                actor: r.get(2)?,
                on_behalf_of: r.get(3)?,
                action: r.get(4)?,
                entity: r.get(5)?,
                entity_id: r.get(6)?,
                entity_key: r.get(7)?,
                project_id: r.get(8)?,
                project_name: r.get(9)?,
                device_id: r.get(10)?,
                changes: r.get(11)?,
                summary: r.get(12)?,
                chain_workspace_id: r.get(13)?,
                chain_owner: r.get(14)?,
                chain_seq: r.get(15)?,
                prev_hash: r.get(16)?,
                hash: r.get(17)?,
                redacted_at: r.get(18)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(AuditPage { total, events })
}

fn distinct(conn: &Connection, user: &str, col: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT DISTINCT a.{col} FROM audit_log a WHERE {VISIBLE} ORDER BY 1"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([user], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// What the filters offer.
pub fn facets(conn: &Connection, user: &str) -> Result<AuditFacets, String> {
    if user.trim().is_empty() {
        return Err("userId is required".into());
    }
    let mut stmt = conn
        .prepare(&format!(
            "SELECT DISTINCT a.project_id, p.name
               FROM audit_log a LEFT JOIN projects p ON p.id = a.project_id
              WHERE {VISIBLE} AND a.project_id IS NOT NULL
              ORDER BY p.name IS NULL, lower(p.name), a.project_id"
        ))
        .map_err(|e| e.to_string())?;
    let projects = stmt
        .query_map([user], |r| {
            Ok(AuditProject {
                id: r.get(0)?,
                name: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(AuditFacets {
        actors: distinct(conn, user, "actor")?,
        entities: distinct(conn, user, "entity")?,
        actions: distinct(conn, user, "action")?,
        projects,
        this_device: oplog::device_id(conn)?,
    })
}

/// (id, entity_id) of the event at `seq` in a chain (the first, if repeated).
fn event_at(
    conn: &Connection,
    key: (&str, &str, &str),
    seq: i64,
) -> Result<Option<(String, String)>, String> {
    use rusqlite::OptionalExtension;
    conn.query_row(
        "SELECT id, entity_id FROM audit_log
          WHERE device_id = ?1 AND chain_workspace_id = ?2 AND chain_owner = ?3 AND chain_seq = ?4
          ORDER BY rowid LIMIT 1",
        rusqlite::params![key.0, key.1, key.2, seq],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// Verifies every chain the account can see (`audit::verify_chain` over the
/// whole chain, also the links it cannot see, so a hidden gap still shows).
pub fn verify(conn: &Connection, user: &str) -> Result<AuditVerify, String> {
    if user.trim().is_empty() {
        return Err("userId is required".into());
    }
    let mut stmt = conn
        .prepare(&format!(
            "SELECT a.device_id, a.chain_workspace_id, a.chain_owner
               FROM audit_log a WHERE {VISIBLE}
              GROUP BY 1, 2, 3 ORDER BY 1, 2, 3"
        ))
        .map_err(|e| e.to_string())?;
    let keys = stmt
        .query_map([user], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    let mut chains = Vec::with_capacity(keys.len());
    for (device, ws, owner) in keys {
        let (count, last_at): (i64, Option<String>) = conn
            .query_row(
                "SELECT count(*), max(at) FROM audit_log
                  WHERE device_id = ?1 AND chain_workspace_id = ?2 AND chain_owner = ?3",
                rusqlite::params![device, ws, owner],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        let key = (device.as_str(), ws.as_str(), owner.as_str());
        let broken = match audit::verify_chain(conn, &device, &ws, &owner)? {
            Ok(_) => None,
            Err(b) => {
                let (kind, seq, expected) = match b {
                    ChainBreak::Gap { expected, found } => ("gap", found, Some(expected)),
                    ChainBreak::Link { seq } => ("link", seq, None),
                    ChainBreak::Hash { seq } => ("hash", seq, None),
                    ChainBreak::Changes { seq } => ("changes", seq, None),
                };
                let at = event_at(conn, key, seq)?;
                Some(AuditBreak {
                    kind,
                    seq,
                    expected,
                    event_id: at.as_ref().map(|a| a.0.clone()),
                    entity_id: at.map(|a| a.1),
                })
            }
        };
        chains.push(AuditChain {
            device_id: device,
            chain_workspace_id: ws,
            chain_owner: owner,
            count,
            last_at,
            broken,
        });
    }
    Ok(AuditVerify {
        chains,
        this_device: oplog::device_id(conn)?,
    })
}

#[tauri::command]
pub fn audit_list(db: State<Db>, user_id: String, query: AuditQuery) -> Result<AuditPage, String> {
    db.with_conn(|conn| list(conn, &user_id, &query))
}

#[tauri::command]
pub fn audit_facets(db: State<Db>, user_id: String) -> Result<AuditFacets, String> {
    db.with_conn(|conn| facets(conn, &user_id))
}

#[tauri::command]
pub fn audit_verify(db: State<Db>, user_id: String) -> Result<AuditVerify, String> {
    db.with_conn(|conn| verify(conn, &user_id))
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;
    use serde_json::json;

    use super::*;
    use crate::db::run_migrations;
    use crate::{project, test_case};

    const U: &str = "11111111-1111-4111-8111-111111111111";
    const V: &str = "22222222-2222-4222-8222-222222222222";

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        run_migrations(&c).unwrap();
        crate::sync::assume_stable_steps_server(&c);
        c
    }

    fn new_project(c: &Connection, owner: Option<&str>, name: &str) -> String {
        let input: project::ProjectInput = match owner {
            Some(o) => serde_json::from_value(json!({"name": name, "ownerId": o})).unwrap(),
            None => serde_json::from_value(json!({"name": name})).unwrap(),
        };
        project::insert_project(c, &input).unwrap()
    }

    fn new_case(c: &Connection, project: &str, user: &str, title: &str) -> String {
        let input: test_case::TestCaseInput = serde_json::from_value(json!({
            "projectId": project, "title": title, "author": "Ada", "priority": "high",
            "data": {"steps": ["a"]}, "userId": user
        }))
        .unwrap();
        test_case::insert_case(c, &input).unwrap()
    }

    fn q() -> AuditQuery {
        AuditQuery::default()
    }

    /// U: a project and two cases; V: a project; nobody: a local project.
    fn seeded() -> (Connection, String, String) {
        let c = conn();
        let p = new_project(&c, Some(U), "Checkout");
        let c1 = new_case(&c, &p, U, "Pay");
        new_case(&c, &p, U, "Refund");
        new_project(&c, Some(V), "Theirs");
        new_project(&c, None, "Local");
        (c, p, c1)
    }

    #[test]
    fn an_account_sees_its_events_and_the_local_ones_newest_first() {
        let (c, p, _) = seeded();
        let page = list(&c, U, &q()).unwrap();
        assert_eq!(page.total, 4, "{:?}", page.events);
        assert!(page.events.iter().all(|e| e.chain_owner != V));
        assert!(page.events.windows(2).all(|w| w[0].at >= w[1].at));
        let named = page
            .events
            .iter()
            .find(|e| e.entity == "project" && e.project_id.as_deref() == Some(p.as_str()));
        assert_eq!(
            named.and_then(|e| e.project_name.as_deref()),
            Some("Checkout")
        );
        // V sees its own project and the local one, never U's.
        assert_eq!(list(&c, V, &q()).unwrap().total, 2);
        assert!(list(&c, " ", &q()).is_err());
    }

    #[test]
    fn filters_combine_and_page() {
        let (c, p, c1) = seeded();
        let cases = AuditQuery {
            entities: vec!["test_case".into()],
            ..q()
        };
        assert_eq!(list(&c, U, &cases).unwrap().total, 2);
        let creates = AuditQuery {
            actions: vec!["create".into()],
            project_ids: vec![p.clone()],
            ..q()
        };
        assert_eq!(list(&c, U, &creates).unwrap().total, 3);
        let no_project = AuditQuery {
            project_ids: vec!["".into()],
            ..q()
        };
        // Projects themselves carry their own id as project.
        assert_eq!(list(&c, U, &no_project).unwrap().total, 0);
        let one = AuditQuery {
            entity_id: Some(c1.clone()),
            ..q()
        };
        assert_eq!(list(&c, U, &one).unwrap().events[0].entity_id, c1);
        let key = list(&c, U, &one).unwrap().events[0]
            .entity_key
            .clone()
            .unwrap();
        let search = AuditQuery {
            search: Some(key.to_lowercase()),
            ..q()
        };
        assert!(list(&c, U, &search)
            .unwrap()
            .events
            .iter()
            .any(|e| e.entity_id == c1));
        let actor = AuditQuery {
            actors: vec![format!("user:{U}")],
            ..q()
        };
        assert_eq!(list(&c, U, &actor).unwrap().total, 3);
        let future = AuditQuery {
            from: Some("2999-01-01T00:00:00.000Z".into()),
            ..q()
        };
        assert_eq!(list(&c, U, &future).unwrap().total, 0);
        let past = AuditQuery {
            to: Some("2000-01-01T00:00:00.000Z".into()),
            ..q()
        };
        assert_eq!(list(&c, U, &past).unwrap().total, 0);
        let paged = AuditQuery {
            limit: Some(3),
            offset: 3,
            ..q()
        };
        let page = list(&c, U, &paged).unwrap();
        assert_eq!((page.total, page.events.len()), (4, 1));
    }

    #[test]
    fn facets_list_only_what_the_account_sees() {
        let (c, p, _) = seeded();
        let f = facets(&c, U).unwrap();
        assert_eq!(f.entities, vec!["project", "test_case"]);
        assert_eq!(f.actions, vec!["create"]);
        assert!(f.actors.contains(&format!("user:{U}")));
        assert!(!f.actors.contains(&format!("user:{V}")));
        assert!(f
            .projects
            .iter()
            .any(|x| x.id == p && x.name.as_deref() == Some("Checkout")));
        assert!(!f
            .projects
            .iter()
            .any(|x| x.name.as_deref() == Some("Theirs")));
        assert_eq!(f.this_device, oplog::device_id(&c).unwrap());
    }

    #[test]
    fn verify_reports_each_chain_and_where_it_breaks() {
        let (c, _, _) = seeded();
        let ok = verify(&c, U).unwrap();
        // U's chain and the local one ('' owner).
        assert_eq!(ok.chains.len(), 2);
        assert!(ok.chains.iter().all(|ch| ch.broken.is_none()));
        let mine = ok.chains.iter().find(|ch| ch.chain_owner == U).unwrap();
        assert_eq!(mine.count, 3);

        c.execute_batch("DROP TRIGGER audit_log_no_delete; DROP TRIGGER audit_log_only_redaction;")
            .unwrap();
        c.execute(
            "UPDATE audit_log SET actor = 'user:mallory' WHERE chain_owner = ?1 AND chain_seq = 2",
            [U],
        )
        .unwrap();
        let (tampered, element): (String, String) = c
            .query_row(
                "SELECT id, entity_id FROM audit_log WHERE chain_owner = ?1 AND chain_seq = 2",
                [U],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        let bad = verify(&c, U).unwrap();
        let mine = bad.chains.iter().find(|ch| ch.chain_owner == U).unwrap();
        assert_eq!(
            mine.broken,
            Some(AuditBreak {
                kind: "hash",
                seq: 2,
                expected: None,
                event_id: Some(tampered),
                entity_id: Some(element)
            })
        );

        c.execute(
            "DELETE FROM audit_log WHERE chain_owner = ?1 AND chain_seq = 1",
            [U],
        )
        .unwrap();
        let gap = verify(&c, U).unwrap();
        let b = gap
            .chains
            .iter()
            .find(|ch| ch.chain_owner == U)
            .unwrap()
            .broken
            .as_ref()
            .unwrap();
        assert_eq!((b.kind, b.seq, b.expected), ("gap", 2, Some(1)));
    }
}
