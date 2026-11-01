//! The single write gate of every audited mutation (AUD-01, ADR-0015).
//! `record` writes, in the caller's transaction, the oplog row the sync needs
//! (exactly what `oplog::record` wrote before 0.2.0) and the audit event of the
//! same change, so the two can never diverge. Repositories never call
//! `oplog::record` directly.
//!
//! Usage: take `snapshot` before the write, do the write, then `record` with
//! that snapshot; `record` reads the state after and keeps the field diff.

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Map, Value};

use crate::audit::{self, NewEvent};
use crate::db::ensure_workspace;
use crate::oplog;

/// Who made a change (ADR-0015). `agent:` (0.7.0) and `ci:` (0.5.0) join here.
#[derive(Clone, Debug, PartialEq)]
pub enum Actor {
    /// A person, by account id.
    User(String),
    /// A component acting by itself (`keys`, `sync`, `migration`…), optionally
    /// for an account.
    System {
        component: &'static str,
        on_behalf_of: Option<String>,
    },
}

impl Actor {
    pub fn user(id: &str) -> Self {
        Actor::User(id.to_string())
    }

    fn label(&self) -> String {
        match self {
            Actor::User(id) => format!("user:{id}"),
            Actor::System { component, .. } => format!("system:{component}"),
        }
    }

    fn on_behalf_of(&self) -> Option<String> {
        match self {
            Actor::User(_) => None,
            Actor::System { on_behalf_of, .. } => {
                on_behalf_of.as_ref().map(|u| format!("user:{u}"))
            }
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Action {
    Create,
    Update,
    Delete,
    Import,
    Link,
    Unlink,
    ResolveConflict,
    /// A result recorded (EJE-01, design 0.2.0 §4).
    Execute,
    /// Content removed by retention while the record of it stays (ADR-0014).
    Redact,
}

impl Action {
    fn as_str(self) -> &'static str {
        match self {
            Action::Create => "create",
            Action::Update => "update",
            Action::Delete => "delete",
            Action::Import => "import",
            Action::Link => "link",
            Action::Unlink => "unlink",
            Action::ResolveConflict => "resolve_conflict",
            Action::Execute => "execute",
            Action::Redact => "redact",
        }
    }
}

/// Whether a change leaves its own audit event. `Folded` is for the rows of a
/// bulk operation that writes one summary event instead (ADR-0015: one import
/// = one event); it still writes the oplog row the sync needs.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Audit {
    Event,
    Folded,
}

/// One mutation of an entity.
pub struct Change<'a> {
    pub entity: &'a str,
    pub id: &'a str,
    pub action: Action,
    pub actor: Actor,
    /// State before the write (`snapshot`), None for a create.
    pub before: Option<Value>,
    /// Oplog fields, as `oplog::record` always received them.
    pub op: &'a str,
    pub revision: i64,
    pub author: &'a str,
    pub audit: Audit,
    /// Extra JSON for the event (imports: counts; cascades: children).
    pub summary: Option<Value>,
}

impl<'a> Change<'a> {
    /// A change with its own event and no prior state (set it with `before`).
    pub fn new(
        entity: &'a str,
        id: &'a str,
        action: Action,
        actor: Actor,
        op: &'a str,
        revision: i64,
        author: &'a str,
    ) -> Self {
        Change {
            entity,
            id,
            action,
            actor,
            before: None,
            op,
            revision,
            author,
            audit: Audit::Event,
            summary: None,
        }
    }

    pub fn before(mut self, before: Option<Value>) -> Self {
        self.before = before;
        self
    }

    pub fn summary(mut self, summary: Value) -> Self {
        self.summary = Some(summary);
        self
    }
}

/// Payload keys that are bookkeeping, not content: never a diff of their own.
const BOOKKEEPING: [&str; 3] = ["revision", "updatedAt", "createdAt"];

/// Live state of an entity as a camelCase JSON object (deleted rows too); None
/// if the row does not exist. A template's file is represented by its sha256,
/// never its bytes.
pub fn snapshot(conn: &Connection, entity: &str, id: &str) -> Result<Option<Value>, String> {
    if entity == "template" {
        return conn
            .query_row(
                "SELECT kind, language, name, description, usage_prompt, version, file, owner_id,
                        deleted_at FROM templates WHERE id = ?1",
                params![id],
                |r| {
                    let file: Vec<u8> = r.get(6)?;
                    Ok(json!({
                        "kind": r.get::<_, String>(0)?,
                        "language": r.get::<_, String>(1)?,
                        "name": r.get::<_, String>(2)?,
                        "description": r.get::<_, String>(3)?,
                        "usagePrompt": r.get::<_, String>(4)?,
                        "version": r.get::<_, String>(5)?,
                        "fileSha256": audit::sha256_hex(&file),
                        "ownerId": r.get::<_, Option<String>>(7)?,
                        "deleted": r.get::<_, Option<String>>(8)?.is_some(),
                    }))
                },
            )
            .optional()
            .map_err(|e| e.to_string());
    }
    Ok(
        crate::sync::read_payload(conn, entity, id)?.map(|(mut payload, _, deleted)| {
            if let Value::Object(map) = &mut payload {
                map.insert("deleted".into(), Value::Bool(deleted));
            }
            payload
        }),
    )
}

/// `{ field: [before, after] }` between two snapshots; `data` is compared one
/// level down (`data.<key>`). A create has every field as `[null, after]`, a
/// delete every field as `[before, null]`.
pub fn diff(before: Option<&Value>, after: Option<&Value>) -> Map<String, Value> {
    let empty = Map::new();
    let obj = |v: Option<&Value>| v.and_then(Value::as_object).cloned();
    let b = obj(before).unwrap_or_default();
    let a = obj(after).unwrap_or_default();
    let mut out = Map::new();
    let mut keys: Vec<&String> = b.keys().chain(a.keys()).collect();
    keys.sort();
    keys.dedup();
    for key in keys {
        if BOOKKEEPING.contains(&key.as_str()) {
            continue;
        }
        let (bv, av) = (b.get(key), a.get(key));
        if key == "data"
            && matches!(bv, None | Some(Value::Object(_)))
            && matches!(av, None | Some(Value::Object(_)))
        {
            let bd = bv.and_then(Value::as_object).unwrap_or(&empty);
            let ad = av.and_then(Value::as_object).unwrap_or(&empty);
            let mut dkeys: Vec<&String> = bd.keys().chain(ad.keys()).collect();
            dkeys.sort();
            dkeys.dedup();
            for dk in dkeys {
                let (x, y) = (bd.get(dk), ad.get(dk));
                if x != y {
                    out.insert(
                        format!("data.{dk}"),
                        json!([
                            x.cloned().unwrap_or(Value::Null),
                            y.cloned().unwrap_or(Value::Null)
                        ]),
                    );
                }
            }
            continue;
        }
        if bv != av {
            out.insert(
                key.clone(),
                json!([
                    bv.cloned().unwrap_or(Value::Null),
                    av.cloned().unwrap_or(Value::Null)
                ]),
            );
        }
    }
    out
}

fn str_field(v: Option<&Value>, key: &str) -> Option<String> {
    v.and_then(|v| v.get(key))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// Project and human key of an entity, from either snapshot.
fn location(
    entity: &str,
    id: &str,
    before: Option<&Value>,
    after: Option<&Value>,
) -> (Option<String>, Option<String>) {
    let either = |key: &str| str_field(after, key).or_else(|| str_field(before, key));
    let project = if entity == "project" {
        Some(id.to_string())
    } else {
        either("projectId")
    };
    let key = either("scenarioId")
        .or_else(|| either("requirementKey"))
        .or_else(|| either("cardKey"))
        .or_else(|| either("runKey"))
        .or_else(|| either("cycleKey"));
    (project, key)
}

/// The account an event syncs with, fixed when it is written (ADR-0015, ADR-0020
/// rule 1): a person's own account (in 0.2 only a project's owner edits it);
/// for a `system:` actor, the owner of the project, or '' (stays here). A
/// `user:` actor without an id (a change made signed out, e.g. a project with
/// no `ownerId`) also gets '': like the change itself, which has no owner to
/// sync with, its event stays on this device.
fn event_owner(conn: &Connection, actor: &Actor, project: Option<&str>) -> Result<String, String> {
    if let Actor::User(id) = actor {
        return Ok(id.clone());
    }
    match project {
        Some(p) => Ok(oplog::owner_of(conn, "project", p)?.unwrap_or_default()),
        None => Ok(String::new()),
    }
}

/// Appends one audit event (and, when it has an owner, the oplog row that
/// pushes it as an `audit_event`).
#[allow(clippy::too_many_arguments)]
fn write_event(
    conn: &Connection,
    actor: &Actor,
    action: Action,
    entity: &str,
    id: &str,
    project: Option<String>,
    entity_key: Option<String>,
    changes: Map<String, Value>,
    summary: Option<Value>,
) -> Result<(), String> {
    let user_id = event_owner(conn, actor, project.as_deref())?;
    let event = audit::append(
        conn,
        NewEvent {
            workspace_id: ensure_workspace(conn)?,
            project_id: project,
            hlc: oplog::next_hlc(conn)?,
            device_id: oplog::device_id(conn)?,
            actor: actor.label(),
            on_behalf_of: actor.on_behalf_of(),
            action: action.as_str(),
            entity: entity.to_string(),
            entity_id: id.to_string(),
            entity_key,
            changes,
            summary,
            origin: "local",
            user_id: user_id.clone(),
        },
    )?;
    if !user_id.is_empty() {
        oplog::record(
            conn,
            "audit_event",
            &event.id,
            "append",
            "{}",
            1,
            &actor.label(),
        )?;
    }
    Ok(())
}

/// Records one mutation: its oplog row (unchanged from before 0.2.0) and its
/// audit event, in the caller's transaction. An update that changed no field
/// leaves the oplog row (the sync behaviour does not change) but no event.
pub fn record(conn: &Connection, change: Change) -> Result<(), String> {
    oplog::record(
        conn,
        change.entity,
        change.id,
        change.op,
        "{}",
        change.revision,
        change.author,
    )?;
    if change.audit == Audit::Folded {
        return Ok(());
    }
    let after = snapshot(conn, change.entity, change.id)?;
    let changes = match change.action {
        Action::Create => diff(None, after.as_ref()),
        Action::Delete => diff(change.before.as_ref(), None),
        _ => diff(change.before.as_ref(), after.as_ref()),
    };
    if changes.is_empty() && change.summary.is_none() && change.action == Action::Update {
        return Ok(());
    }
    let (project, key) = location(
        change.entity,
        change.id,
        change.before.as_ref(),
        after.as_ref(),
    );
    write_event(
        conn,
        &change.actor,
        change.action,
        change.entity,
        change.id,
        project,
        key,
        changes,
        change.summary,
    )
}

/// Queues one `append_only` document of `entity` for the push, with no audit
/// event of its own: a case revision (DAT-02) is part of the case change that
/// already left its event. Only for entities registered in `sync_class`.
pub fn record_append(
    conn: &Connection,
    entity: &str,
    id: &str,
    author: &str,
) -> Result<(), String> {
    if crate::sync_class::append_only(entity).is_none() {
        return Err(format!("{entity} is not an append-only entity"));
    }
    oplog::record(conn, entity, id, "append", "{}", 1, author)
}

/// An audited change with no oplog row of its own: one summary event for a
/// bulk operation (`import`), or a change of data that does not sync yet
/// (planner attachments until SYNC-04b, ADR-0014).
pub fn record_event(
    conn: &Connection,
    actor: Actor,
    action: Action,
    entity: &str,
    id: &str,
    changes: Map<String, Value>,
    summary: Option<Value>,
) -> Result<(), String> {
    let snap = snapshot(conn, entity, id)?;
    let (project, key) = location(entity, id, snap.as_ref(), None);
    write_event(
        conn, &actor, action, entity, id, project, key, changes, summary,
    )
}

/// `record_event` for an entity `snapshot` does not read (evidence
/// `attachment`s), with its project given by the caller.
#[allow(clippy::too_many_arguments)]
pub fn record_event_in(
    conn: &Connection,
    actor: Actor,
    action: Action,
    entity: &str,
    id: &str,
    project: Option<&str>,
    changes: Map<String, Value>,
    summary: Option<Value>,
) -> Result<(), String> {
    write_event(
        conn,
        &actor,
        action,
        entity,
        id,
        project.map(String::from),
        None,
        changes,
        summary,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diff_compares_fields_and_data_one_level_down() {
        let before = json!({
            "title": "a", "revision": 1, "updatedAt": "x", "status": "draft",
            "data": {"steps": [1], "custom": {"k": 1}, "gone": true}
        });
        let after = json!({
            "title": "b", "revision": 2, "updatedAt": "y", "status": "draft",
            "data": {"steps": [1], "custom": {"k": 2}, "new": "n"}
        });
        let d = diff(Some(&before), Some(&after));
        assert_eq!(
            Value::Object(d),
            json!({
                "title": ["a", "b"],
                "data.custom": [{"k": 1}, {"k": 2}],
                "data.gone": [true, null],
                "data.new": [null, "n"],
            })
        );
        assert!(diff(Some(&before), Some(&before)).is_empty());
        let created = diff(None, Some(&json!({"title": "t", "revision": 1})));
        assert_eq!(Value::Object(created), json!({"title": [null, "t"]}));
        let deleted = diff(Some(&json!({"title": "t"})), None);
        assert_eq!(Value::Object(deleted), json!({"title": ["t", null]}));
    }

    #[test]
    fn a_non_object_data_is_compared_whole() {
        let d = diff(
            Some(&json!({"data": "x"})),
            Some(&json!({"data": {"a": 1}})),
        );
        assert_eq!(Value::Object(d), json!({"data": ["x", {"a": 1}]}));
    }

    #[test]
    fn actors_have_their_adr_labels() {
        assert_eq!(Actor::user("u1").label(), "user:u1");
        let system = Actor::System {
            component: "keys",
            on_behalf_of: Some("u1".into()),
        };
        assert_eq!(system.label(), "system:keys");
        assert_eq!(system.on_behalf_of().as_deref(), Some("user:u1"));
    }
}
