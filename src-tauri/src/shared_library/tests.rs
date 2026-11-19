//! CAS-01 (ADR-0055): the library, its versions, the copy in the case, the
//! propagation with the review rule, the expansion of a dataset into targets
//! and the sync documents. The vectors shared with the server are checked in
//! `vectors_match`.

use rusqlite::{params, Connection};
use serde_json::{json, Value};
use uuid::Uuid;

use super::materialize::{self, DatasetVersion, Library, SharedVersion};
use super::*;
use crate::case_review::{review_case, ReviewAction, ReviewInput};
use crate::db::ensure_workspace;
use crate::test_case;

const USER: &str = "user-1";

fn conn() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    crate::db::run_migrations(&c).unwrap();
    c
}

fn project(c: &Connection) -> String {
    let ws = ensure_workspace(c).unwrap();
    let id = Uuid::new_v4().to_string();
    c.execute(
        "INSERT INTO projects (id, workspace_id, owner_id, name, case_id_prefix, case_id_digits, \
         created_by, updated_by, created_at, updated_at, revision) \
         VALUES (?1, ?2, ?3, 'P', 'TC-', 3, ?3, ?3, datetime('now'), datetime('now'), 1)",
        params![id, ws, USER],
    )
    .unwrap();
    id
}

fn login_input(p: &str, last_step: &str) -> LibraryInput {
    serde_json::from_value(json!({
        "projectId": p, "kind": "shared_step", "name": "Iniciar sesión",
        "definition": [],
        "body": [
            {"id": "L1", "text": "Dado que estoy en la página de acceso"},
            {"id": "L2", "text": "Cuando escribo <usuario> y <clave> y pulso «Entrar»",
             "expected": "Se abre «Mi cuenta»"},
            {"id": "L3", "text": last_step}
        ],
        "userId": USER
    }))
    .unwrap()
}

fn users_input(p: &str, rows: usize) -> LibraryInput {
    let all = [
        ("ana@acme.test", "Clave-1"),
        ("luis@acme.test", "Clave-2"),
        ("admin@acme.test", "Clave-3"),
    ];
    let rows: Vec<Value> = all
        .iter()
        .take(rows)
        .enumerate()
        .map(|(i, (u, k))| json!({"id": format!("R{i}"), "values": {"cu": u, "ck": k}}))
        .collect();
    serde_json::from_value(json!({
        "projectId": p, "kind": "dataset", "name": "Usuarios válidos",
        "definition": [{"id": "cu", "name": "usuario"}, {"id": "ck", "name": "clave"}],
        "body": rows,
        "userId": USER
    }))
    .unwrap()
}

fn case_json(p: &str, title: &str, shared: &str, follow: bool) -> Value {
    json!({
        "projectId": p, "title": title, "author": "Ada", "userId": USER,
        "data": {
            "gherkinLevel": "basic",
            "steps": [{"id": "OWN00001", "text": "Cuando pago el pedido"}],
            "expectedResult": "El pedido queda «Confirmado»",
            "sharedRefs": [{"id": "CALL0001", "sharedStepId": shared, "follow": follow, "list": "steps", "args": {}}]
        }
    })
}

fn case_with_call(p: &str, title: &str, shared: &str, follow: bool) -> test_case::TestCaseInput {
    serde_json::from_value(case_json(p, title, shared, follow)).unwrap()
}

fn data_of(c: &Connection, id: &str) -> Value {
    let s: String = c
        .query_row(
            "SELECT data FROM test_cases WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .unwrap();
    serde_json::from_str(&s).unwrap()
}

fn status_of(c: &Connection, id: &str) -> (String, i64) {
    c.query_row(
        "SELECT status, revision FROM test_cases WHERE id = ?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .unwrap()
}

fn texts(data: &Value, list: &str) -> Vec<String> {
    data[list]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["text"].as_str().unwrap().to_string())
        .collect()
}

fn approve(c: &Connection, id: &str) {
    for action in [ReviewAction::Send, ReviewAction::Approve] {
        review_case(
            c,
            id,
            &ReviewInput {
                action,
                comment: None,
                user_id: USER.into(),
                user_name: "Ada".into(),
            },
        )
        .unwrap();
    }
}

#[test]
fn placeholders_and_arguments_follow_the_outline_syntax() {
    assert_eq!(
        materialize::placeholders("Escribo <usuario > y <clave> y <clave>, no < x> ni <>"),
        vec!["usuario", "clave"]
    );
    let args = json!({"usuario": "ana@acme.test", "clave": "  ", "otro": "<cliente>"});
    let args = args.as_object().unwrap();
    assert_eq!(
        materialize::substitute("<usuario>/<clave>/<otro>/< nada>", args),
        "ana@acme.test/<clave>/<cliente>/< nada>"
    );
}

#[test]
fn a_shared_step_is_validated_and_declares_its_placeholders() {
    let (params, steps) = normalize_shared(
        &json!([{"name": "clave", "default": "x"}]),
        &json!([{"text": " Escribo <usuario> "}, "Y <clave>"]),
    )
    .unwrap();
    let names: Vec<&str> = params
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, vec!["clave", "usuario"]);
    assert_eq!(steps[0]["text"], "Escribo <usuario>");
    assert!(steps[1]["id"].as_str().is_some());
    assert_eq!(
        normalize_shared(&json!([]), &json!([])).unwrap_err(),
        "shared_library.no_steps"
    );
    assert_eq!(
        normalize_shared(&json!([{"name": "a<b"}]), &json!(["x"])).unwrap_err(),
        "shared_library.bad_param_name"
    );
    let many: Vec<Value> = (0..=MAX_STEPS)
        .map(|i| json!(format!("paso {i}")))
        .collect();
    assert_eq!(
        normalize_shared(&json!([]), &Value::Array(many)).unwrap_err(),
        "shared_library.too_many:steps"
    );
}

#[test]
fn changing_a_shared_step_updates_the_cases_that_follow_it() {
    let c = conn();
    let p = project(&c);
    let login = create_item(&c, &login_input(&p, "Entonces veo mi nombre")).unwrap();
    assert_eq!(login.version, 1);
    let draft =
        test_case::insert_case(&c, &case_with_call(&p, "Borrador", &login.id, true)).unwrap();
    let approved =
        test_case::insert_case(&c, &case_with_call(&p, "Aprobado", &login.id, true)).unwrap();
    let pinned =
        test_case::insert_case(&c, &case_with_call(&p, "Fijado", &login.id, false)).unwrap();
    approve(&c, &approved);

    // The copy is in the case, with derived ids, after the case's own step.
    let d = data_of(&c, &draft);
    assert_eq!(
        texts(&d, "steps"),
        vec![
            "Cuando pago el pedido",
            "Dado que estoy en la página de acceso",
            "Cuando escribo <usuario> y <clave> y pulso «Entrar»",
            "Entonces veo mi nombre"
        ]
    );
    let first_ids: Vec<Value> = d["sharedRefs"][0]["stepIds"].as_array().unwrap().clone();
    assert_eq!(
        first_ids[0],
        json!(materialize::derived_step_id(&draft, "CALL0001", "L1"))
    );
    assert_eq!(d["sharedRefs"][0]["version"], 1);
    assert_eq!(d["gherkinLevel"], "outline");
    let (_, approved_rev) = status_of(&c, &approved);
    let (_, pinned_rev) = status_of(&c, &pinned);
    assert_eq!(get_item(&c, &login.id, USER).unwrap().used_by, 3);

    // The impact notice counts the cases that follow it, by status.
    let imp = impact(&c, &login.id, USER).unwrap();
    assert_eq!(imp.cases.len(), 3);
    assert_eq!(imp.by_status.get("draft"), Some(&json!(1)));
    assert_eq!(imp.by_status.get("approved"), Some(&json!(1)));

    let mut edit = login_input(&p, "Entonces veo mi nombre en la cabecera");
    edit.body[0]["id"] = json!("L1");
    let saved = update_item(&c, &login.id, &edit).unwrap();
    assert_eq!(saved.item.version, 2);
    assert_eq!(saved.updated_cases.len(), 2);

    // Both following cases have the new step, the same ids and version 2.
    for id in [&draft, &approved] {
        let d = data_of(&c, id);
        assert_eq!(
            texts(&d, "steps")[3],
            "Entonces veo mi nombre en la cabecera"
        );
        assert_eq!(d["sharedRefs"][0]["version"], 2);
        assert_eq!(
            d["sharedRefs"][0]["stepIds"][0],
            json!(materialize::derived_step_id(id, "CALL0001", "L1"))
        );
    }
    assert_eq!(
        data_of(&c, &draft)["sharedRefs"][0]["stepIds"][0],
        first_ids[0]
    );
    // The approved case went back to «En revisión» with a new revision; the
    // pinned one did not move.
    let (status, rev) = status_of(&c, &approved);
    assert_eq!(status, "reviewed");
    assert_eq!(rev, approved_rev + 1);
    assert_eq!(status_of(&c, &pinned).1, pinned_rev);
    assert_eq!(
        texts(&data_of(&c, &pinned), "steps")[3],
        "Entonces veo mi nombre"
    );
    // Its audit event names the cause.
    let cause: String = c
        .query_row(
            "SELECT summary FROM audit_log WHERE entity_id = ?1 AND action = 'update' ORDER BY rowid DESC LIMIT 1",
            params![draft],
            |r| r.get(0),
        )
        .unwrap();
    assert!(cause.contains(&login.id), "{cause}");
    // Two versions are kept; the pinned case says a newer one exists.
    assert_eq!(list_versions(&c, &login.id, USER).unwrap().len(), 2);
    let st = case_status(&c, &pinned, USER).unwrap();
    assert_eq!(st[0].state, "outdated");
    assert_eq!(st[0].latest_version, Some(2));
    assert_eq!(case_status(&c, &draft, USER).unwrap()[0].state, "ok");

    // A save of the description only keeps the version.
    let mut same = edit.clone();
    same.description = Some("Login".into());
    assert_eq!(update_item(&c, &login.id, &same).unwrap().item.version, 2);
    // In use: it cannot be deleted.
    assert_eq!(
        delete_item(&c, &login.id, USER).unwrap_err(),
        "shared_library.in_use"
    );
}

#[test]
fn a_dataset_of_three_rows_gives_three_targets() {
    let c = conn();
    let p = project(&c);
    let login = create_item(&c, &login_input(&p, "Entonces veo mi nombre")).unwrap();
    let users = create_item(&c, &users_input(&p, 3)).unwrap();
    let mut raw = case_json(&p, "Compra", &login.id, true);
    raw["data"]["datasetRefs"] = json!([{"id": "case", "datasetId": users.id}]);
    let input: test_case::TestCaseInput = serde_json::from_value(raw).unwrap();
    let id = test_case::insert_case(&c, &input).unwrap();
    let d = data_of(&c, &id);
    assert_eq!(d["examples"]["headers"], json!(["usuario", "clave"]));
    let rows = d["examples"]["rows"].as_array().unwrap();
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[1]["values"], json!(["luis@acme.test", "Clave-2"]));
    assert_eq!(
        rows[0]["id"],
        json!(materialize::derived_row_id(&id, "case", "R0"))
    );
    let targets = crate::runs::manual::targets_of(&id, &d, None, None);
    assert_eq!(targets.len(), 3);

    // A new row in the dataset reaches the case; the old rows keep their ids.
    let more = users_input(&p, 3);
    let mut body = more.body.as_array().unwrap().clone();
    body.push(json!({"id": "R3", "values": {"cu": "eva@acme.test", "ck": "Clave-4"}}));
    let mut more = more.clone();
    more.body = Value::Array(body);
    assert_eq!(
        update_item(&c, &users.id, &more).unwrap().updated_cases,
        vec![id.clone()]
    );
    let d = data_of(&c, &id);
    assert_eq!(d["examples"]["rows"].as_array().unwrap().len(), 4);
    assert_eq!(d["examples"]["rows"][0]["id"], rows[0]["id"]);

    // A parameter without a column is reported.
    let mut d2 = d.clone();
    d2["expectedResult"] = json!("Pago con <tarjeta>");
    let lib = DbLibrary {
        conn: &c,
        project_id: p.clone(),
    };
    let out = materialize::materialize(&id, &mut d2, &lib).unwrap();
    assert_eq!(out.missing_columns, vec!["tarjeta"]);
}

#[test]
fn advanced_cases_cannot_use_the_library_in_0_6() {
    let c = conn();
    let p = project(&c);
    let login = create_item(&c, &login_input(&p, "Entonces veo mi nombre")).unwrap();
    let mut input = case_json(&p, "Avanzado", &login.id, true);
    input["data"]["gherkinLevel"] = json!("advanced");
    let input: test_case::TestCaseInput = serde_json::from_value(input).unwrap();
    assert_eq!(
        test_case::insert_case(&c, &input).unwrap_err(),
        "shared_library.advanced_unsupported"
    );
}

#[test]
fn names_are_unique_and_unused_items_can_be_deleted() {
    let c = conn();
    let p = project(&c);
    let a = create_item(&c, &login_input(&p, "x")).unwrap();
    let mut dup = login_input(&p, "y");
    dup.name = " iniciar SESIÓN ".into();
    // Unicode lower() of SQLite is ASCII only: «SESIÓN» differs from «sesión».
    assert!(create_item(&c, &dup).is_ok());
    assert_eq!(
        create_item(&c, &login_input(&p, "z")).unwrap_err(),
        "shared_library.duplicate_name"
    );
    assert_eq!(
        set_status(&c, &a.id, OBSOLETE, USER).unwrap().status,
        OBSOLETE
    );
    delete_item(&c, &a.id, USER).unwrap();
    assert!(get_item(&c, &a.id, USER).is_err());
    assert!(create_item(&c, &login_input(&p, "again")).is_ok());
}

#[test]
fn the_sync_documents_round_trip_and_versions_check_their_id() {
    let c = conn();
    let p = project(&c);
    let a = create_item(&c, &users_input(&p, 2)).unwrap();
    let (doc, revision, deleted) = read_payload(&c, DATASET, &a.id).unwrap().unwrap();
    assert!(!deleted);
    assert_eq!(doc["columns"][0]["name"], "usuario");
    let rev_id = revision_id(DATASET, &a.id, 1, &a.content_sha256);
    let version = dataset_revision_payload(&c, &rev_id).unwrap().unwrap();
    assert_eq!(
        dataset_revision_owner(&c, &rev_id).unwrap().as_deref(),
        Some(USER)
    );

    // Another device.
    let other = conn();
    other
        .execute(
            "INSERT INTO projects (id, workspace_id, owner_id, name, case_id_prefix, case_id_digits, \
             created_by, updated_by, created_at, updated_at, revision) \
             VALUES (?1, ?2, ?3, 'P', 'TC-', 3, ?3, ?3, datetime('now'), datetime('now'), 1)",
            params![p, ensure_workspace(&other).unwrap(), USER],
        )
        .unwrap();
    let ws = ensure_workspace(&other).unwrap();
    write_doc(&other, &ws, USER, DATASET, &a.id, revision, false, &doc).unwrap();
    let got = get_item(&other, &a.id, USER).unwrap();
    assert_eq!(got.content_sha256, a.content_sha256);
    // The version row is there already, with the same id.
    assert!(dataset_revision_payload(&other, &rev_id).unwrap().is_some());
    // A version whose id does not match its content is skipped.
    let mut forged = version.clone();
    forged["id"] = json!(Uuid::new_v4().to_string());
    forged["version"] = json!(9);
    dataset_revision_insert_if_absent(&other, USER, &forged).unwrap();
    assert!(
        dataset_revision_payload(&other, forged["id"].as_str().unwrap())
            .unwrap()
            .is_none()
    );
    // A version never changes.
    assert!(c
        .execute(
            "UPDATE dataset_revisions SET name = 'x' WHERE id = ?1",
            params![rev_id]
        )
        .is_err());
}

#[test]
fn a_pulled_case_behind_the_library_is_rewritten() {
    let c = conn();
    let p = project(&c);
    let login = create_item(&c, &login_input(&p, "Entonces veo mi nombre")).unwrap();
    let case = test_case::insert_case(&c, &case_with_call(&p, "Compra", &login.id, true)).unwrap();
    // As if the case had arrived at version 1 while the library is at 2:
    // bump the library without propagating.
    let mut edit = login_input(&p, "Entonces veo mi nombre en la cabecera");
    edit.body[0]["id"] = json!("L1");
    let (definition, body) = normalize_shared(&edit.definition, &edit.body).unwrap();
    let sha =
        crate::steps::content_sha256(&content(SHARED_STEP, "Iniciar sesión", &definition, &body));
    c.execute(
        "UPDATE shared_steps SET steps = ?2, version = 2, content_sha256 = ?3 WHERE id = ?1",
        params![login.id, body.to_string(), sha],
    )
    .unwrap();
    assert_eq!(
        case_status(&c, &case, USER).unwrap()[0].latest_version,
        Some(2)
    );
    reconcile(&c, USER, std::slice::from_ref(&p)).unwrap();
    let d = data_of(&c, &case);
    assert_eq!(d["sharedRefs"][0]["version"], 2);
    assert_eq!(
        texts(&d, "steps")[3],
        "Entonces veo mi nombre en la cabecera"
    );
    // Idempotent.
    let (_, rev) = status_of(&c, &case);
    reconcile(&c, USER, &[p]).unwrap();
    assert_eq!(status_of(&c, &case).1, rev);
}

/// A library in memory, for the vectors.
struct Mem {
    shared: Vec<SharedVersion>,
    datasets: Vec<DatasetVersion>,
}

impl Library for Mem {
    fn shared(&self, item_id: &str, revision_id: Option<&str>) -> Option<SharedVersion> {
        let mut of: Vec<&SharedVersion> = self
            .shared
            .iter()
            .filter(|v| v.item_id == item_id)
            .collect();
        of.sort_by_key(|v| v.version);
        match revision_id {
            Some(r) => of.into_iter().find(|v| v.revision_id == r).cloned(),
            None => of.last().map(|v| (*v).clone()),
        }
    }
    fn dataset(&self, item_id: &str, revision_id: Option<&str>) -> Option<DatasetVersion> {
        let mut of: Vec<&DatasetVersion> = self
            .datasets
            .iter()
            .filter(|v| v.item_id == item_id)
            .collect();
        of.sort_by_key(|v| v.version);
        match revision_id {
            Some(r) => of.into_iter().find(|v| v.revision_id == r).cloned(),
            None => of.last().map(|v| (*v).clone()),
        }
    }
}

fn mem_of(lib: &Value) -> Mem {
    let s = |v: &Value, k: &str| v[k].as_str().unwrap_or_default().to_string();
    Mem {
        shared: lib["shared"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|v| SharedVersion {
                item_id: s(v, "itemId"),
                version: v["version"].as_i64().unwrap(),
                revision_id: s(v, "revisionId"),
                name: s(v, "name"),
                steps: v["steps"].as_array().cloned().unwrap_or_default(),
            })
            .collect(),
        datasets: lib["datasets"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|v| DatasetVersion {
                item_id: s(v, "itemId"),
                version: v["version"].as_i64().unwrap(),
                revision_id: s(v, "revisionId"),
                name: s(v, "name"),
                columns: v["columns"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .map(|c| (s(c, "id"), s(c, "name")))
                    .collect(),
                rows: v["rows"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .map(|r| {
                        (
                            s(r, "id"),
                            r["values"].as_object().cloned().unwrap_or_default(),
                        )
                    })
                    .collect(),
            })
            .collect(),
    }
}

/// `tests/fixtures/shared-steps-vectors.json`: the same cases the server's
/// `shared-library.ts` passes. `PHAROS_WRITE_VECTORS=1` rewrites the outputs
/// (review the diff before committing it).
#[test]
fn vectors_match() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/fixtures/shared-steps-vectors.json"
    );
    let path = if std::path::Path::new(path).exists() {
        path.to_string()
    } else {
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/shared-steps-vectors.json"
        )
        .to_string()
    };
    let mut file: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    let write = std::env::var("PHAROS_WRITE_VECTORS").is_ok_and(|v| v == "1");
    for v in file["vectors"].as_array_mut().unwrap() {
        let name = v["name"].as_str().unwrap().to_string();
        let lib = mem_of(&v["library"]);
        let mut data = v["data"].clone();
        let res = materialize::materialize(v["caseId"].as_str().unwrap(), &mut data, &lib);
        if let Some(e) = v.get("error").and_then(Value::as_str) {
            assert_eq!(res.unwrap_err(), e, "{name}");
            continue;
        }
        let out = res.unwrap();
        let missing = json!(out.missing);
        let cols = json!(out.missing_columns);
        if write {
            v["expected"] = data;
            v["missing"] = missing;
            v["missingColumns"] = cols;
            continue;
        }
        assert_eq!(data, v["expected"], "{name}");
        assert_eq!(missing, v["missing"], "{name}");
        assert_eq!(cols, v["missingColumns"], "{name}");
    }
    // The derived ids, written out so the server can check its own.
    for d in file["derivedIds"].as_array_mut().unwrap() {
        let (case_id, ref_id, item) = (
            d["caseId"].as_str().unwrap().to_string(),
            d["refId"].as_str().unwrap().to_string(),
            d["itemId"].as_str().unwrap().to_string(),
        );
        let got = if d["kind"] == "step" {
            materialize::derived_step_id(&case_id, &ref_id, &item)
        } else {
            materialize::derived_row_id(&case_id, &ref_id, &item)
        };
        if write {
            d["id"] = json!(got);
        } else {
            assert_eq!(json!(got), d["id"], "{d}");
        }
    }
    if write {
        let mut text = serde_json::to_string_pretty(&file).unwrap();
        text.push('\n');
        std::fs::write(&path, text).unwrap();
    }
}
