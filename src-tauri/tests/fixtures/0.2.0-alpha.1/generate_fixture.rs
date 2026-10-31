//! Generator of `pharos.db.enc` (VERSIONING §6.2). NOT compiled by this crate:
//! it runs inside a checkout of `v0.2.0-alpha.1` (or a commit whose
//! `src-tauri/` is identical to it), so the fixture is written by the real
//! 0.2.0-alpha.1 repositories. See the README next to this file.
//!
//! Every write goes through the same functions the 0.2.0-alpha.1 commands call;
//! where a command has its SQL inline (attachments), the same statement is
//! repeated here.

use std::path::PathBuf;

use rusqlite::params;
use serde_json::json;

use crate::db::Db;

/// Test-only key. Never used for real data.
pub const FIXTURE_KEY: [u8; 32] = [0x5A; 32];
pub const USER_1: &str = "11111111-1111-4111-8111-111111111111";
pub const USER_2: &str = "22222222-2222-4222-8222-222222222222";

#[test]
#[ignore = "writes the 0.2.0-alpha.1 fixture; run on demand inside v0.2.0-alpha.1"]
fn generate_fixture() {
    let out = PathBuf::from(std::env::var("PHAROS_FIXTURE_OUT").expect("PHAROS_FIXTURE_OUT"));
    std::fs::create_dir_all(&out).unwrap();
    assert!(!out.join("pharos.db.enc").exists(), "output dir must be empty");
    let db = Db::open_with_key(&out, FIXTURE_KEY).unwrap();

    db.with_conn(|c| {
        crate::profile::upsert_profile(c, "Ada", "Ada", "Lovelace", "test_manager")?;

        // User 1: project, renamed once.
        let p1: crate::project::ProjectInput = serde_json::from_value(json!({
            "name": "Checkout web", "caseIdPrefix": "ATS_", "caseIdDigits": 3, "ownerId": USER_1
        }))
        .unwrap();
        let project_1 = crate::project::insert_project(c, &p1)?;
        let p1b: crate::project::ProjectInput = serde_json::from_value(json!({
            "name": "Checkout web · Ñandú ✓", "caseIdPrefix": "ATS_", "caseIdDigits": 3, "ownerId": USER_1
        }))
        .unwrap();
        crate::project::update_project(c, &project_1, &p1b)?;

        // User 2 on the same installation (FIX-07/FIX-08).
        let p2: crate::project::ProjectInput = serde_json::from_value(json!({
            "name": "Billing", "caseIdPrefix": "TC-", "caseIdDigits": 4, "ownerId": USER_2
        }))
        .unwrap();
        let project_2 = crate::project::insert_project(c, &p2)?;

        let plan_in = |project: &str, user: &str, title: &str, data: serde_json::Value| -> crate::test_plan::TestPlanInput {
            serde_json::from_value(json!({
                "projectId": project, "title": title, "author": "Ada Lovelace",
                "planDate": "2026-10-01", "data": data, "userId": user
            }))
            .unwrap()
        };
        let plan_1 = crate::test_plan::insert_plan(c, &plan_in(&project_1, USER_1, "Plan checkout", json!({})))?;
        crate::test_plan::update_plan(
            c,
            &plan_1,
            &plan_in(&project_1, USER_1, "Plan checkout v2", json!({"scope": {"in": ["cart", "payment"]}})),
        )?;
        crate::test_plan::insert_plan(c, &plan_in(&project_2, USER_2, "Plan billing", json!({})))?;

        // Requirements of project 1: REQ-001 live, REQ-002 deleted, REQ-003 by import.
        let req_in = |title: &str| -> crate::requirement::RequirementInput {
            serde_json::from_value(json!({
                "projectId": project_1, "title": title, "description": "Descripción con acentos",
                "priority": "high", "userId": USER_1
            }))
            .unwrap()
        };
        crate::requirement::insert_requirement(c, &req_in("Pay with card"))?;
        let req_2 = crate::requirement::insert_requirement(c, &req_in("Pay with voucher"))?;
        crate::requirement::delete_requirement(c, &req_2, USER_1)?;
        let rows: Vec<crate::requirement::RequirementImportRow> = serde_json::from_value(json!([
            {"title": "Refunds", "priority": "low"}
        ]))
        .unwrap();
        crate::requirement::import_requirements(c, &project_1, USER_1, &rows)?;

        // Cases of project 1: ATS_001 edited, ATS_002, ATS_003 deleted; one of project 2.
        let case_in = |project: &str, user: &str, scenario: Option<&str>, title: &str| -> crate::test_case::TestCaseInput {
            serde_json::from_value(json!({
                "projectId": project, "scenarioId": scenario, "title": title, "author": "Ada Lovelace",
                "priority": "high", "userId": user,
                "data": {
                    "gherkinLevel": "basic", "requirementKeys": ["REQ-001"],
                    "steps": [{"given": "a cart", "when": "I pay", "then": "the order is placed"}],
                    "aiProvenance": {"description": {"provider": "ollama", "model": "llama3.2:3b", "generatedAt": "2026-10-01T10:00:00Z"}}
                }
            }))
            .unwrap()
        };
        let case_1 = crate::test_case::insert_case(c, &case_in(&project_1, USER_1, None, "Pay with card"))?;
        crate::test_case::update_case(c, &case_1, &case_in(&project_1, USER_1, None, "Pay with a valid card"))?;
        crate::test_case::insert_case(c, &case_in(&project_1, USER_1, None, "Pay with expired card"))?;
        let case_3 = crate::test_case::insert_case(c, &case_in(&project_1, USER_1, None, "Obsolete"))?;
        crate::test_case::delete_case(c, &case_3, USER_1)?;
        crate::test_case::insert_case(c, &case_in(&project_2, USER_2, None, "Invoice total"))?;

        // Planner of project 1: a task and a defect with an attachment.
        let card_in = |kind: &str, title: &str| -> crate::planner::PlannerCardInput {
            serde_json::from_value(json!({
                "projectId": project_1, "ownerId": USER_1, "kind": kind, "title": title,
                "data": {"testCaseIds": [case_1]}
            }))
            .unwrap()
        };
        let task = crate::planner::insert_card(c, &card_in("task", "Prepare test data"))?;
        let defect = crate::planner::insert_card(c, &card_in("defect", "Card declined twice"))?;
        crate::planner::reorder(c, USER_1, "in_progress", &[defect.clone(), task])?;
        // Same statement as the `planner_attachment_add` command.
        c.execute(
            "INSERT INTO planner_attachments (id, card_id, name, mime, bytes) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![uuid::Uuid::new_v4().to_string(), defect, "log.txt", "text/plain", b"stack trace\n\x00\xff".to_vec()],
        )
        .map_err(|e| e.to_string())?;

        // A user template.
        let template: crate::template::TemplateInput = serde_json::from_value(json!({
            "kind": "case", "language": "es", "name": "Plantilla propia", "description": "desc",
            "usagePrompt": "usar para web", "dataBase64": "UEsDBCBmYWtlIHhsc3g="
        }))
        .unwrap();
        crate::template::insert_template(c, &template, USER_1)?;

        // Sync of user 1: push everything pending (accepted) and store a cursor.
        let pending = serde_json::to_value(crate::sync::build_pending(c, USER_1)?).unwrap();
        let pushed: Vec<crate::sync::PushedDelta> =
            serde_json::from_value(pending["deltas"].clone()).unwrap();
        crate::sync::mark_pushed(c, USER_1, &pushed)?;
        c.execute(
            "INSERT INTO sync_state (key, value) VALUES (?1, '42') \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![format!("cursor:{USER_1}")],
        )
        .map_err(|e| e.to_string())?;

        // A case pulled from another device.
        let ws = crate::db::ensure_workspace(c)?;
        let pulled: crate::sync::RemoteDoc = serde_json::from_value(json!({
            "entity": "test_case", "entityId": uuid::Uuid::new_v4().to_string(), "revision": 1,
            "hlc": "000001900000000:00000:other-device",
            "payload": {"projectId": project_1, "scenarioId": "ATS_090", "title": "Pulled case",
                        "version": "1.0", "status": "draft", "priority": "low",
                        "author": "Grace Hopper", "data": {"gherkinLevel": "basic"}}
        }))
        .unwrap();
        crate::sync::apply_doc(c, &ws, USER_1, &pulled)?;

        // After the push the project is numbered by the server: a new case gets a
        // provisional key until a block is leased (DAT-01).
        crate::test_case::insert_case(c, &case_in(&project_1, USER_1, None, "Created offline"))?;

        // A requirement whose key the server refused → key conflict.
        let req_4 = crate::requirement::insert_requirement(c, &req_in("Split payment"))?;
        let refused: Vec<crate::key_sync::RejectedKey> = serde_json::from_value(json!([
            {"entity": "requirement", "entityId": req_4, "takenBy": "someone-else"}
        ]))
        .unwrap();
        crate::key_sync::record_rejected(c, USER_1, &refused)?;

        // A local edit after the push, then a diverging remote version → open conflict.
        crate::test_case::update_case(c, &case_1, &case_in(&project_1, USER_1, None, "Pay with a valid card (local)"))?;
        let remote: crate::sync::RemoteDoc = serde_json::from_value(json!({
            "entity": "test_case", "entityId": case_1, "revision": 4,
            "hlc": "000001900000001:00000:other-device",
            "payload": {"projectId": project_1, "scenarioId": "ATS_001", "title": "Pay with a valid card (remote)",
                        "version": "1.0", "status": "ready", "priority": "high",
                        "author": "Grace Hopper", "data": {}}
        }))
        .unwrap();
        crate::sync::apply_doc(c, &ws, USER_1, &remote)?;
        Ok(())
    })
    .unwrap();

    db.persist().unwrap();
}
