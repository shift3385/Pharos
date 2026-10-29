//! Generator of `pharos.db.enc` (BASE-04). NOT compiled by this crate: it runs
//! inside a checkout of tag `v0.1.0-alpha.1`, so the fixture is written by the
//! real 0.1.0-alpha.1 repositories (including their bugs, e.g. FIX-06). See the
//! README next to this file for the exact steps.
//!
//! Every write goes through the same functions the alpha.1 commands call; where
//! a command has its SQL inline (delete, attachments, templates, cursor), the
//! same statement is repeated here.

use std::path::PathBuf;

use rusqlite::params;
use serde_json::json;

use crate::db::Db;

/// Test-only key. Never used for real data.
pub const FIXTURE_KEY: [u8; 32] = [0x5A; 32];
pub const USER_1: &str = "11111111-1111-4111-8111-111111111111";
pub const USER_2: &str = "22222222-2222-4222-8222-222222222222";

#[test]
#[ignore = "writes the BASE-04 fixture; run on demand inside v0.1.0-alpha.1"]
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

        // User 2 on the same installation (FIX-07/FIX-08 scenario).
        let p2: crate::project::ProjectInput = serde_json::from_value(json!({
            "name": "Billing", "caseIdPrefix": "TC-", "caseIdDigits": 4, "ownerId": USER_2
        }))
        .unwrap();
        let project_2 = crate::project::insert_project(c, &p2)?;

        // Plans: one per project; the first one edited (one revision).
        let plan_in = |project: &str, title: &str, data: serde_json::Value| -> crate::test_plan::TestPlanInput {
            serde_json::from_value(json!({
                "projectId": project, "title": title, "author": "Ada Lovelace",
                "planDate": "2026-10-01", "data": data
            }))
            .unwrap()
        };
        let plan_1 = crate::test_plan::insert_plan(c, &plan_in(&project_1, "Plan checkout", json!({})))?;
        crate::test_plan::update_plan(
            c,
            &plan_1,
            &plan_in(&project_1, "Plan checkout v2", json!({"scope": {"in": ["cart", "payment"]}})),
        )?;
        crate::test_plan::insert_plan(c, &plan_in(&project_2, "Plan billing", json!({})))?;

        // Requirements of project 1: REQ-001 live, REQ-002 deleted.
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

        // Cases of project 1: ATS_001 edited, ATS_002, ATS_003 deleted.
        let case_in = |project: &str, scenario: Option<&str>, title: &str| -> crate::test_case::TestCaseInput {
            serde_json::from_value(json!({
                "projectId": project, "scenarioId": scenario, "title": title, "author": "Ada Lovelace",
                "priority": "high",
                "data": {
                    "gherkinLevel": "basic", "requirementKeys": ["REQ-001"],
                    "steps": [{"given": "a cart", "when": "I pay", "then": "the order is placed"}],
                    "aiProvenance": {"description": {"provider": "ollama", "model": "llama3.2:3b", "generatedAt": "2026-10-01T10:00:00Z"}}
                }
            }))
            .unwrap()
        };
        let case_1 = crate::test_case::insert_case(c, &case_in(&project_1, None, "Pay with card"))?;
        crate::test_case::update_case(c, &case_1, &case_in(&project_1, Some("ATS_001"), "Pay with a valid card"))?;
        crate::test_case::insert_case(c, &case_in(&project_1, None, "Pay with expired card"))?;
        let case_3 = crate::test_case::insert_case(c, &case_in(&project_1, None, "Obsolete"))?;
        // Same statements as the alpha.1 `test_case_delete` command.
        c.execute("UPDATE test_cases SET deleted_at = datetime('now') WHERE id = ?1", params![case_3])
            .map_err(|e| e.to_string())?;
        crate::oplog::record(c, "test_case", &case_3, "delete", "{}", 0, "")?;
        crate::test_case::insert_case(c, &case_in(&project_2, None, "Invoice total"))?;

        // Planner of project 1: a task and a defect (DEF-001) with an attachment.
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
        // Same statement as the alpha.1 `planner_attachment_add` command.
        c.execute(
            "INSERT INTO planner_attachments (id, card_id, name, mime, bytes) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![uuid::Uuid::new_v4().to_string(), defect, "log.txt", "text/plain", b"stack trace\n\x00\xff".to_vec()],
        )
        .map_err(|e| e.to_string())?;

        // A user template. Same statement as the alpha.1 `template_create` command.
        let template_id = uuid::Uuid::new_v4().to_string();
        let ws = crate::db::ensure_workspace(c)?;
        c.execute(
            "INSERT INTO templates (id, workspace_id, kind, language, name, description, usage_prompt, \
             version, file, is_builtin, created_at, updated_at) \
             VALUES (?1, ?2, 'case', 'es', 'Plantilla propia', 'desc', 'usar para web', '1.0', ?3, 0, \
             datetime('now'), datetime('now'))",
            params![template_id, ws, b"PK\x03\x04 fake xlsx".to_vec()],
        )
        .map_err(|e| e.to_string())?;
        crate::oplog::record(c, "template", &template_id, "upsert", "{}", 1, "")?;

        // Sync: push everything pending (the server accepted it) and store a cursor.
        let pending = serde_json::to_value(crate::sync::build_pending(c)?).unwrap();
        let pushed: Vec<crate::sync::PushedDelta> =
            serde_json::from_value(pending["deltas"].clone()).unwrap();
        crate::sync::mark_pushed(c, &pushed)?;
        c.execute(
            "INSERT INTO sync_state (key, value) VALUES ('pull_cursor', '42') \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [],
        )
        .map_err(|e| e.to_string())?;

        // A case pulled from another device (written by `write_doc`).
        let pulled: crate::sync::RemoteDoc = serde_json::from_value(json!({
            "entity": "test_case", "entityId": uuid::Uuid::new_v4().to_string(), "revision": 1,
            "hlc": "000001900000000:00000:other-device",
            "payload": {"projectId": project_1, "scenarioId": "ATS_004", "title": "Pulled case",
                        "version": "1.0", "status": "draft", "priority": "low",
                        "author": "Grace Hopper", "data": {"gherkinLevel": "basic"}}
        }))
        .unwrap();
        crate::sync::apply_doc(c, &ws, &pulled)?;

        // A local edit after the push, then a diverging remote version → open conflict.
        crate::test_case::update_case(c, &case_1, &case_in(&project_1, Some("ATS_001"), "Pay with a valid card (local)"))?;
        let remote: crate::sync::RemoteDoc = serde_json::from_value(json!({
            "entity": "test_case", "entityId": case_1, "revision": 4,
            "hlc": "000001900000001:00000:other-device",
            "payload": {"projectId": project_1, "scenarioId": "ATS_001", "title": "Pay with a valid card (remote)",
                        "version": "1.0", "status": "ready", "priority": "high",
                        "author": "Grace Hopper", "data": {}}
        }))
        .unwrap();
        crate::sync::apply_doc(c, &ws, &remote)?;
        Ok(())
    })
    .unwrap();

    db.persist().unwrap();
}
