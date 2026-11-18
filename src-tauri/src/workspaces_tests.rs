// Workspaces on the desktop (SYNC-07, ADR-0042 §6).

use super::*;
use crate::case_review::{
    ApprovalRequest, ApprovalVerdict, ApproverCheck, DenyReason, SUBJECT_CASE, SUBJECT_PLAN,
};
use crate::db::run_migrations;
use serde_json::json;

const ANA: &str = "ana";
const LUIS: &str = "luis";
const PERSONAL: &str = "11111111-1111-4111-8111-111111111111";
const SHARED: &str = "22222222-2222-4222-8222-222222222222";

fn conn() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    run_migrations(&c).unwrap();
    c
}

fn ws(id: &str, kind: &str, role: &str) -> WorkspaceDto {
    WorkspaceDto {
        id: id.into(),
        name: if kind == "personal" {
            "Personal".into()
        } else {
            "Equipo QA".into()
        },
        kind: kind.into(),
        role: role.into(),
        independent_approval: false,
        members: vec![],
    }
}

fn project(c: &Connection, owner: &str) -> String {
    crate::project::insert_project(
        c,
        &serde_json::from_value(json!({ "name": "Pagos", "ownerId": owner })).unwrap(),
    )
    .unwrap()
}

fn case(c: &Connection, project: &str, user: &str) -> Result<String, String> {
    crate::test_case::insert_case(
        c,
        &serde_json::from_value(
            json!({ "projectId": project, "title": "Pago", "author": "Ana", "userId": user }),
        )
        .unwrap(),
    )
}

fn ws_of(c: &Connection, table: &str, id: &str) -> String {
    c.query_row(
        &format!("SELECT workspace_id FROM {table} WHERE id = ?1"),
        [id],
        |r| r.get(0),
    )
    .unwrap()
}

/// A project as a pull from `ws` brings it (created by `creator`).
fn pulled_project(c: &Connection, ws: &str, user: &str, id: &str, creator: &str) {
    crate::sync::apply_remote_doc(
        c,
        ws,
        user,
        "project",
        id,
        json!({ "id": id, "name": "Compartido", "ownerId": creator, "caseIdPrefix": "PAY-", "caseIdDigits": 3 }),
        1,
        "000000000000001-00000-srv",
    )
    .unwrap();
}

#[test]
fn the_matrix_is_the_shared_one() {
    assert!(can("test_analyst", "case.approve"));
    assert!(!can("viewer", "case.edit"));
    assert!(can("viewer", "export"));
    assert!(can("product_owner", "defect.create"));
    assert!(!can("product_owner", "defect.edit"));
    assert_eq!(capability_for("defect", true), "defect.create");
    assert_eq!(capability_for("defect", false), "defect.edit");
    assert_eq!(capability_for("something_new", false), "members.manage");
}

#[test]
fn the_first_sync_moves_the_accounts_local_rows_to_its_personal_workspace() {
    let c = conn();
    let p = project(&c, ANA);
    let k = case(&c, &p, ANA).unwrap();
    let other = project(&c, LUIS); // another account of this device
    let local = ws_of(&c, "projects", &p);
    let applied = apply(&c, ANA, &[ws(PERSONAL, "personal", "test_manager")]).unwrap();
    assert_eq!(applied.remapped, 1);
    assert!(applied.revoked.is_empty());
    assert_eq!(ws_of(&c, "projects", &p), PERSONAL);
    assert_eq!(ws_of(&c, "test_cases", &k), PERSONAL);
    assert_eq!(
        ws_of(&c, "projects", &other),
        local,
        "Luis's rows stay until Luis syncs"
    );
    let events: i64 = c
        .query_row(
            "SELECT count(*) FROM audit_log WHERE project_id = ?1 AND workspace_id = ?2",
            params![p, PERSONAL],
            |r| r.get(0),
        )
        .unwrap();
    assert!(events >= 2, "the audit events move with their project");
    let pending_elsewhere: i64 = c
        .query_row(
            "SELECT count(*) FROM oplog WHERE user_id = ?1 AND synced_at IS NULL AND workspace_id IS NOT ?2",
            params![ANA, PERSONAL],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(pending_elsewhere, 0);
    // Idempotent.
    assert_eq!(
        apply(&c, ANA, &[ws(PERSONAL, "personal", "test_manager")])
            .unwrap()
            .remapped,
        0
    );
}

#[test]
fn two_devices_of_the_same_user_end_in_the_same_workspace() {
    let (a, b) = (conn(), conn());
    let pa = project(&a, ANA);
    let pb = project(&b, ANA);
    assert_ne!(
        ws_of(&a, "projects", &pa),
        ws_of(&b, "projects", &pb),
        "random local workspaces"
    );
    for c in [&a, &b] {
        apply(c, ANA, &[ws(PERSONAL, "personal", "test_manager")]).unwrap();
    }
    assert_eq!(ws_of(&a, "projects", &pa), PERSONAL);
    assert_eq!(ws_of(&b, "projects", &pb), PERSONAL);
}

#[test]
fn a_viewer_cannot_write_and_a_test_analyst_can() {
    let c = conn();
    apply(
        &c,
        ANA,
        &[
            ws(PERSONAL, "personal", "test_manager"),
            ws(SHARED, "shared", "viewer"),
        ],
    )
    .unwrap();
    pulled_project(&c, SHARED, ANA, "p-team", LUIS);
    // As a command runs it: in one transaction.
    let refused = crate::db::in_tx(&c, |c| case(c, "p-team", ANA)).unwrap_err();
    assert!(refused.starts_with("forbidden:case.edit"), "{refused}");
    let nothing: i64 = c
        .query_row(
            "SELECT count(*) FROM test_cases WHERE project_id = 'p-team'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    assert_eq!(nothing, 0, "the whole write is rolled back");

    apply(
        &c,
        ANA,
        &[
            ws(PERSONAL, "personal", "test_manager"),
            ws(SHARED, "shared", "test_analyst"),
        ],
    )
    .unwrap();
    let k = case(&c, "p-team", ANA).unwrap();
    assert_eq!(
        ws_of(&c, "test_cases", &k),
        SHARED,
        "a row under a project takes its workspace"
    );
    let stamped: Option<String> = c
        .query_row(
            "SELECT workspace_id FROM oplog WHERE entity = 'test_case' AND entity_id = ?1",
            [&k],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(stamped.as_deref(), Some(SHARED));
}

#[test]
fn a_pulled_project_is_held_by_the_puller_and_keeps_its_creator() {
    let c = conn();
    apply(
        &c,
        ANA,
        &[
            ws(PERSONAL, "personal", "test_manager"),
            ws(SHARED, "shared", "test_manager"),
        ],
    )
    .unwrap();
    pulled_project(&c, SHARED, ANA, "p-team", LUIS);
    let (owner, creator): (String, String) = c
        .query_row(
            "SELECT owner_id, creator_id FROM projects WHERE id = 'p-team'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!((owner.as_str(), creator.as_str()), (ANA, LUIS));
    let (payload, _, _) = crate::sync::read_payload(&c, "project", "p-team")
        .unwrap()
        .unwrap();
    assert_eq!(payload["ownerId"], LUIS, "the creator goes back unchanged");
    assert_eq!(payload["workspaceId"], SHARED);
}

#[test]
fn a_moved_project_takes_its_rows_and_its_tombstone_deletes_nothing() {
    let c = conn();
    apply(
        &c,
        ANA,
        &[
            ws(PERSONAL, "personal", "test_manager"),
            ws(SHARED, "shared", "test_manager"),
        ],
    )
    .unwrap();
    let p = project(&c, ANA);
    apply(
        &c,
        ANA,
        &[
            ws(PERSONAL, "personal", "test_manager"),
            ws(SHARED, "shared", "test_manager"),
        ],
    )
    .unwrap();
    let k = case(&c, &p, ANA).unwrap();
    assert_eq!(ws_of(&c, "test_cases", &k), PERSONAL);
    // Pushed before the move (the move needs it, ADR-0042 §5).
    c.execute("UPDATE oplog SET synced_at = datetime('now')", [])
        .unwrap();
    // The origin's tombstone first (as the personal workspace is pulled first).
    let tomb: crate::sync::RemoteDoc = serde_json::from_value(json!({
        "entity": "project", "entityId": p, "payload": { "movedTo": SHARED },
        "revision": 1, "deleted": true, "hlc": "000000000000009-00000-srv"
    }))
    .unwrap();
    crate::sync::apply_doc(&c, PERSONAL, ANA, &tomb).unwrap();
    let deleted: Option<String> = c
        .query_row("SELECT deleted_at FROM projects WHERE id = ?1", [&p], |r| {
            r.get(0)
        })
        .unwrap();
    assert!(deleted.is_none());
    pulled_project(&c, SHARED, ANA, &p, ANA);
    assert_eq!(ws_of(&c, "projects", &p), SHARED);
    assert_eq!(ws_of(&c, "test_cases", &k), SHARED);
}

#[test]
fn a_lost_workspace_is_reported_and_dropped_on_confirmation() {
    let c = conn();
    apply(
        &c,
        ANA,
        &[
            ws(PERSONAL, "personal", "test_manager"),
            ws(SHARED, "shared", "test_analyst"),
        ],
    )
    .unwrap();
    pulled_project(&c, SHARED, ANA, "p-team", LUIS);
    case(&c, "p-team", ANA).unwrap();
    let applied = apply(&c, ANA, &[ws(PERSONAL, "personal", "test_manager")]).unwrap();
    assert_eq!(applied.revoked.len(), 1);
    let lost = &applied.revoked[0];
    assert_eq!(
        (lost.id.as_str(), lost.name.as_str(), lost.projects),
        (SHARED, "Equipo QA", 1)
    );
    assert!(lost.pending > 0, "the case written there is pending");
    // Nothing is deleted until the user confirms.
    assert_eq!(ws_of(&c, "projects", "p-team"), SHARED);
    assert_eq!(drop_copy(&c, ANA, SHARED).unwrap(), 1);
    let left: i64 = c
        .query_row(
            "SELECT (SELECT count(*) FROM projects WHERE workspace_id = ?1)
                  + (SELECT count(*) FROM test_cases WHERE workspace_id = ?1)
                  + (SELECT count(*) FROM oplog WHERE workspace_id = ?1 AND synced_at IS NULL)",
            [SHARED],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(left, 0);
    assert!(list(&c, ANA).unwrap().iter().all(|w| w.id != SHARED));
}

#[test]
fn refusals_relocate_wait_or_mark_the_project_without_access() {
    let c = conn();
    apply(
        &c,
        ANA,
        &[
            ws(PERSONAL, "personal", "test_manager"),
            ws(SHARED, "shared", "test_manager"),
        ],
    )
    .unwrap();
    let p = project(&c, ANA);
    apply(
        &c,
        ANA,
        &[
            ws(PERSONAL, "personal", "test_manager"),
            ws(SHARED, "shared", "test_manager"),
        ],
    )
    .unwrap();
    let k = case(&c, &p, ANA).unwrap();
    let refused = |reason: &str, id: &str, entity: &str, w: Option<&str>| Refused {
        entity: entity.into(),
        entity_id: id.into(),
        reason: reason.into(),
        workspace_id: w.map(str::to_string),
    };
    record_refused(&c, ANA, &[refused("moved", &k, "test_case", Some(SHARED))]).unwrap();
    assert_eq!(ws_of(&c, "test_cases", &k), SHARED);

    record_refused(&c, ANA, &[refused("forbidden", &k, "test_case", None)]).unwrap();
    let pending = crate::sync::build_pending(&c, ANA).unwrap();
    assert!(
        !serde_json::to_value(&pending).unwrap()["deltas"]
            .as_array()
            .unwrap()
            .iter()
            .any(|d| d["entityId"] == k.as_str()),
        "a refused change is held back until the user discards it"
    );

    record_refused(&c, ANA, &[refused("not_found", &p, "project", None)]).unwrap();
    let err = case(&c, &p, ANA).unwrap_err();
    assert!(err.starts_with("access_lost"), "{err}");
}

/// A shared workspace as the server sends it, with its «Aprobación
/// independiente» (PLN-08).
fn shared(role: &str, independent_approval: bool) -> WorkspaceDto {
    WorkspaceDto {
        independent_approval,
        ..ws(SHARED, "shared", role)
    }
}

#[test]
fn approvals_follow_the_role_in_shared_workspaces() {
    let c = conn();
    apply(
        &c,
        ANA,
        &[
            ws(PERSONAL, "personal", "test_manager"),
            shared("viewer", true),
        ],
    )
    .unwrap();
    let ask = |subject: &'static str, ws_id: &str, approver: &str, author: &str| {
        WorkspaceApprover
            .can_approve(
                &c,
                &ApprovalRequest {
                    subject,
                    workspace_id: ws_id,
                    project_id: "p",
                    case_id: "c",
                    author_id: author,
                    approver_id: approver,
                },
            )
            .unwrap()
    };
    let case =
        |ws_id: &str, approver: &str, author: &str| ask(SUBJECT_CASE, ws_id, approver, author);
    let plan =
        |ws_id: &str, approver: &str, author: &str| ask(SUBJECT_PLAN, ws_id, approver, author);
    assert_eq!(
        case(PERSONAL, ANA, ANA),
        ApprovalVerdict::Allowed {
            self_approval: true
        }
    );
    assert_eq!(
        case(SHARED, ANA, LUIS),
        ApprovalVerdict::Denied(DenyReason::Role)
    );
    assert_eq!(
        case(SHARED, LUIS, ANA),
        ApprovalVerdict::Denied(DenyReason::NotMember)
    );
    // «Aprobación independiente» on: the role, never the author.
    apply(
        &c,
        ANA,
        &[
            ws(PERSONAL, "personal", "test_manager"),
            shared("test_analyst", true),
        ],
    )
    .unwrap();
    assert_eq!(
        case(SHARED, ANA, ANA),
        ApprovalVerdict::Denied(DenyReason::Author)
    );
    assert_eq!(
        case(SHARED, ANA, LUIS),
        ApprovalVerdict::Allowed {
            self_approval: false
        }
    );
    // A Test Analyst approves cases, not plans.
    assert_eq!(
        plan(SHARED, ANA, LUIS),
        ApprovalVerdict::Denied(DenyReason::Role)
    );
    // Off: whoever may edit approves, the author too (a self-approval).
    apply(
        &c,
        ANA,
        &[
            ws(PERSONAL, "personal", "test_manager"),
            shared("test_analyst", false),
        ],
    )
    .unwrap();
    assert_eq!(
        case(SHARED, ANA, ANA),
        ApprovalVerdict::Allowed {
            self_approval: true
        }
    );
    assert_eq!(
        plan(SHARED, ANA, LUIS),
        ApprovalVerdict::Allowed {
            self_approval: false
        }
    );
    // A viewer never approves, whatever the policy.
    apply(
        &c,
        ANA,
        &[
            ws(PERSONAL, "personal", "test_manager"),
            shared("viewer", false),
        ],
    )
    .unwrap();
    assert_eq!(
        plan(SHARED, ANA, ANA),
        ApprovalVerdict::Denied(DenyReason::Role)
    );
}

/// Known limit (ADR-0042, «Implementación del escritorio»; ROADMAP SYNC-07b):
/// two accounts of one device that both belong to a shared workspace. The
/// account that pulled a row first holds it (`owner_id`); the other one's
/// pull leaves it alone (FIX-07), so it does not see it on this device. Nothing
/// is lost: the holder keeps its row, its edits and its pending changes.
#[test]
fn two_accounts_of_one_device_in_the_same_workspace_the_first_holds_the_row() {
    let c = conn();
    for user in [ANA, LUIS] {
        apply(&c, user, &[ws(SHARED, "shared", "test_analyst")]).unwrap();
    }
    pulled_project(&c, SHARED, ANA, "p-team", ANA);
    let k = crate::db::in_tx(&c, |c| case(c, "p-team", ANA)).unwrap();
    let pending_before: i64 = c
        .query_row(
            "SELECT count(*) FROM oplog WHERE user_id = ?1 AND synced_at IS NULL",
            [ANA],
            |r| r.get(0),
        )
        .unwrap();
    // Luis's pull of the same project, a newer version included.
    crate::sync::apply_remote_doc(
        &c,
        SHARED,
        LUIS,
        "project",
        "p-team",
        json!({ "id": "p-team", "name": "Renombrado", "ownerId": ANA, "caseIdPrefix": "PAY-", "caseIdDigits": 3 }),
        2,
        "000000000000005-00000-srv",
    )
    .unwrap();
    let (owner, name, ws_id): (String, String, String) = c
        .query_row(
            "SELECT owner_id, name, workspace_id FROM projects WHERE id = 'p-team'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(owner, ANA, "the first account keeps holding it");
    assert_eq!(
        name, "Compartido",
        "the other account's pull does not write it"
    );
    assert_eq!(ws_id, SHARED);
    // Nothing of Ana's is lost.
    assert_eq!(ws_of(&c, "test_cases", &k), SHARED);
    let pending_after: i64 = c
        .query_row(
            "SELECT count(*) FROM oplog WHERE user_id = ?1 AND synced_at IS NULL",
            [ANA],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(pending_after, pending_before);
    // Luis neither sees nor pushes it here.
    let luis_rows: i64 = c
        .query_row(
            "SELECT count(*) FROM projects WHERE owner_id = ?1",
            [LUIS],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(luis_rows, 0);
    let luis_pending: i64 = c
        .query_row(
            "SELECT count(*) FROM oplog WHERE user_id = ?1 AND synced_at IS NULL",
            [LUIS],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(luis_pending, 0);
}
