//! Local mode end to end through `run`: a data folder of the test's own,
//! opened with the test's own key (never the user's `db-key`), and a fixed
//! signed-in account.

use std::path::{Path, PathBuf};

use pharos_core::api::{self, SignedInUser};
use pharos_core::db::Db;
use serde_json::Value;

use super::Local;
use crate::config::Env;

const U: &str = "11111111-1111-4111-8111-111111111111";
const KEY: [u8; 32] = [7u8; 32];

struct TestLocal {
    dir: PathBuf,
    user: Option<SignedInUser>,
}

impl Local for TestLocal {
    fn user(&self) -> Result<Option<SignedInUser>, String> {
        Ok(self.user.clone())
    }
    fn open(&self, data_dir: &Path) -> Result<Db, String> {
        api::open_with_key(data_dir, KEY)
    }
    fn default_data_dir(&self) -> Result<PathBuf, String> {
        Ok(self.dir.clone())
    }
}

struct Fixture {
    root: PathBuf,
    data: PathBuf,
    local: TestLocal,
}

impl Fixture {
    /// A data folder with the project «Auth» (prefix `TC-`) of the user.
    fn new() -> Fixture {
        let root = std::env::temp_dir().join(format!("pharos-cli-{}", uuid::Uuid::new_v4()));
        let data = root.join("data");
        let work = root.join("work");
        std::fs::create_dir_all(&work).unwrap();
        {
            let db = api::open_with_key(&data, KEY).unwrap();
            api::create_project_for_tests(&db, U, "Auth", "TC-").unwrap();
        }
        let local = TestLocal {
            dir: data.clone(),
            user: Some(SignedInUser {
                id: U.into(),
                display_name: "Ana Pérez".into(),
                email: "ana@example.com".into(),
                server: None,
            }),
        };
        Fixture { root, data, local }
    }

    fn work(&self) -> PathBuf {
        self.root.join("work")
    }

    fn write(&self, name: &str, text: &str) {
        std::fs::write(self.work().join(name), text).unwrap();
    }

    fn run(&self, args: &[&str], vars: &[(&str, &str)]) -> (i32, String, String) {
        let env = Env {
            vars: vars
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            cwd: self.work(),
            user_config_dir: None,
            tty: false,
            stdin: None,
        };
        let argv: Vec<String> = args.iter().map(|s| s.to_string()).collect();
        let (mut out, mut err) = (Vec::new(), Vec::new());
        let code = crate::run(&argv, &env, &mut out, &mut err, &self.local);
        (
            code,
            String::from_utf8(out).unwrap(),
            String::from_utf8(err).unwrap(),
        )
    }

    fn db(&self) -> Db {
        api::open_with_key(&self.data, KEY).unwrap()
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

/// A normalized ING-01 snapshot of the formats package: real Pharos Run JSON.
fn report(name: &str) -> String {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../packages/formats/src/fixtures/ing01/normalized/"
    );
    let snap: Value =
        serde_json::from_str(&std::fs::read_to_string(format!("{path}{name}.json")).unwrap())
            .unwrap();
    serde_json::to_string_pretty(&snap["doc"]).unwrap()
}

fn json_lines(out: &str) -> Vec<Value> {
    out.lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect()
}

#[test]
fn a_report_is_imported_into_a_new_closed_run_the_app_will_see() {
    let f = Fixture::new();
    f.write("ctrf.json", &report("single__ctrf.json"));
    let (code, out, err) = f.run(&["upload", "ctrf.json", "-p", "TC", "--lang", "es"], &[]);
    assert_eq!(code, 0, "{out}\n{err}");
    assert!(out.contains("Modo local"), "{out}");
    assert!(out.contains("RUN-001 creado"), "{out}");
    assert!(out.contains("Importados 1 de 1 al run RUN-001."), "{out}");
    let db = f.db();
    let projects = api::list_projects(&db, U).unwrap();
    let run = api::find_run(&db, &projects[0].id, U, "RUN-001")
        .unwrap()
        .unwrap();
    assert_eq!(run.status, "completed");
}

#[test]
fn several_files_go_into_one_run_and_a_repeat_writes_nothing() {
    let f = Fixture::new();
    std::fs::create_dir_all(f.work().join("reports")).unwrap();
    f.write("reports/a.json", &report("single__ctrf.json"));
    f.write("reports/b.json", &report("single__pw.json"));
    let (code, out, err) = f.run(&["upload", "reports/*.json", "-p", "TC-", "--json"], &[]);
    assert_eq!(code, 0, "{out}\n{err}");
    let lines = json_lines(&out);
    assert_eq!(lines.len(), 3, "{out}");
    assert_eq!(lines[0]["run"]["key"], "RUN-001");
    assert_eq!(lines[1]["run"]["key"], "RUN-001");
    assert_eq!(lines[2]["summary"]["uploaded"], 2);
    let db = f.db();
    let p = &api::list_projects(&db, U).unwrap()[0];
    assert_eq!(
        api::find_run(&db, &p.id, U, "RUN-001")
            .unwrap()
            .unwrap()
            .status,
        "completed"
    );
    drop(db);

    // The same file again into a new run is a no-op, not an error.
    let (code, out, _) = f.run(
        &["upload", "reports/a.json", "-p", "TC", "--lang", "en"],
        &[],
    );
    assert_eq!(code, 0, "{out}");
    assert!(out.contains("already imported into RUN-001"), "{out}");
}

#[test]
fn a_dry_run_writes_nothing() {
    let f = Fixture::new();
    f.write("ctrf.json", &report("single__ctrf.json"));
    let (code, out, _) = f.run(
        &[
            "upload",
            "ctrf.json",
            "-p",
            "TC",
            "--dry-run",
            "--lang",
            "en",
        ],
        &[],
    );
    assert_eq!(code, 0, "{out}");
    assert!(out.contains("Dry-ran 1 of 1."), "{out}");
    let db = f.db();
    let p = &api::list_projects(&db, U).unwrap()[0];
    assert_eq!(api::find_run(&db, &p.id, U, "RUN-001").unwrap(), None);
}

/// SEC-05b: the CLI writes while the app has the database open, and the
/// app's own connection sees the run at once.
#[test]
fn with_the_app_open_it_writes_and_the_app_sees_it() {
    let f = Fixture::new();
    f.write("ctrf.json", &report("single__ctrf.json"));
    let app = f.db(); // the app has the data folder open
    let (code, _, err) = f.run(&["upload", "ctrf.json", "-p", "TC", "--lang", "es"], &[]);
    assert_eq!(code, 0, "{err}");
    let p = &api::list_projects(&app, U).unwrap()[0];
    assert!(api::find_run(&app, &p.id, U, "RUN-001").unwrap().is_some());
    drop(app);
}

#[test]
fn other_formats_and_bad_documents_are_refused_and_the_rest_still_imports() {
    let f = Fixture::new();
    f.write("ok.json", &report("single__ctrf.json"));
    f.write("eslint.sarif", r#"{"version":"2.1.0","runs":[]}"#);
    f.write(
        "results.trx",
        "<?xml version=\"1.0\"?><TestRun><Results/></TestRun>",
    );
    f.write("broken.xml", "<testsuites><testsuite></testsuites>");
    f.write(
        "bad.json",
        r#"{"schemaVersion":"1.0.0","results":[{"name":"t","status":"green"}]}"#,
    );
    let (code, _, err) = f.run(&["upload", "eslint.sarif", "-p", "TC", "--lang", "en"], &[]);
    assert_eq!(code, 5);
    assert!(
        err.contains("SARIF can't be imported in local mode"),
        "{err}"
    );
    assert!(err.contains("[format-not-local]"), "{err}");
    let (code, _, err) = f.run(&["upload", "results.trx", "-p", "TC", "--lang", "es"], &[]);
    assert_eq!(code, 5);
    assert!(
        err.contains("TRX no se puede importar en modo local"),
        "{err}"
    );
    let (code, _, err) = f.run(&["upload", "broken.xml", "-p", "TC", "--lang", "en"], &[]);
    assert_eq!(code, 5);
    assert!(err.contains("broken.xml: not valid XML."), "{err}");
    assert!(err.contains("[invalid-report]"), "{err}");
    let (code, _, err) = f.run(&["upload", "bad.json", "-p", "TC", "--lang", "en"], &[]);
    assert_eq!(code, 5);
    assert!(err.contains("results.0.status"), "{err}");
    let (code, out, err) = f.run(
        &["upload", "ok.json", "bad.json", "-p", "TC", "--lang", "en"],
        &[],
    );
    assert_eq!(code, 8, "{out}\n{err}");
    assert!(out.contains("Imported 1 of 2"), "{out}");
}

#[test]
fn what_is_missing_has_its_own_exit_code() {
    let mut f = Fixture::new();
    f.write("ctrf.json", &report("single__ctrf.json"));
    // A project the account does not have.
    let (code, _, err) = f.run(&["upload", "ctrf.json", "-p", "NOPE"], &[]);
    assert_eq!(code, 4, "{err}");
    assert!(err.contains("[project-not-found]"), "{err}");
    // No project at all.
    assert_eq!(f.run(&["upload", "ctrf.json"], &[]).0, 2);
    // A run that does not exist, or a cycle.
    assert_eq!(
        f.run(&["upload", "ctrf.json", "-p", "TC", "--run", "RUN-9"], &[])
            .0,
        4
    );
    assert_eq!(
        f.run(
            &["upload", "ctrf.json", "-p", "TC", "--cycle", "CYC-9"],
            &[]
        )
        .0,
        4
    );
    // A file that does not exist.
    assert_eq!(f.run(&["upload", "nope.json", "-p", "TC"], &[]).0, 2);
    // Another data folder without Pharos data: nothing is created there.
    let empty = f.root.join("empty");
    let (code, _, err) = f.run(
        &[
            "upload",
            "ctrf.json",
            "-p",
            "TC",
            "--data-dir",
            empty.to_str().unwrap(),
        ],
        &[],
    );
    assert_eq!(code, 4, "{err}");
    assert!(!empty.exists());
    // In CI there is no desktop Pharos.
    assert_eq!(
        f.run(&["upload", "ctrf.json", "-p", "TC"], &[("CI", "true")])
            .0,
        2
    );
    // A server makes it remote; without a token nothing is sent.
    let (code, _, err) = f.run(
        &["upload", "ctrf.json", "-p", "TC"],
        &[("PHAROS_URL", "https://x.example")],
    );
    assert_eq!(code, 3);
    assert!(err.contains("[no-token]"), "{err}");
    // Nobody signed in to the app.
    f.local.user = None;
    let (code, _, err) = f.run(&["upload", "ctrf.json", "-p", "TC"], &[]);
    assert_eq!(code, 3);
    assert!(err.contains("[not-signed-in]"), "{err}");
}

#[test]
fn projects_and_doctor_read_the_local_data() {
    let f = Fixture::new();
    let (code, out, _) = f.run(&["projects", "--lang", "en"], &[]);
    assert_eq!(code, 0);
    assert!(out.contains("TC") && out.contains("Auth"), "{out}");
    let (code, out, _) = f.run(&["projects", "--json"], &[]);
    assert_eq!(code, 0);
    assert_eq!(json_lines(&out)[0]["projects"][0]["caseIdPrefix"], "TC-");
    let (code, out, err) = f.run(&["doctor", "--lang", "en"], &[]);
    assert_eq!(code, 0, "{out}\n{err}");
    assert!(out.contains("Signed in as Ana Pérez"), "{out}");
    assert!(out.contains("The database opens (1 projects)"), "{out}");
}

fn project_ref(id: &str, prefix: &str) -> api::ProjectRef {
    api::ProjectRef {
        id: id.into(),
        name: format!("Proyecto {id}"),
        case_id_prefix: prefix.into(),
    }
}

#[test]
fn projects_are_picked_by_id_or_prefix_as_the_api_does() {
    let pag = project_ref("p1", "PAG-");
    let mut all = vec![pag.clone(), project_ref("p2", "AJ-")];
    for wanted in ["PAG-", "PAG", "pag", "p1"] {
        assert_eq!(
            super::pick_project(&all, wanted).unwrap(),
            Some(pag.clone()),
            "{wanted}"
        );
    }
    assert_eq!(super::pick_project(&all, "NOPE").unwrap(), None);
    // The exact case wins; ignoring case, two share it.
    all.push(project_ref("p3", "pag-"));
    assert_eq!(super::pick_project(&all, "PAG").unwrap(), Some(pag.clone()));
    all.push(project_ref("p4", "PAG-"));
    assert_eq!(
        super::pick_project(&all, "PAG").unwrap_err().code,
        "ambiguous-project"
    );
}

/// A raw ING-01 sample of the formats package.
fn sample(name: &str) -> String {
    std::fs::read_to_string(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../packages/formats/src/fixtures/ing01/"
        )
        .to_string()
            + name,
    )
    .unwrap()
}

#[test]
fn a_junit_report_is_imported_locally_with_its_retries() {
    let f = Fixture::new();
    f.write("junit.xml", &sample("single/pw-junit.xml"));
    let (code, out, err) = f.run(&["upload", "junit.xml", "-p", "TC", "--json"], &[]);
    assert_eq!(
        code, 0,
        "{out}
{err}"
    );
    let lines = json_lines(&out);
    assert_eq!(lines[0]["format"], "junit");
    assert_eq!(lines[0]["run"]["key"], "RUN-001");
    let expected = crate::junit::parse(&sample("single/pw-junit.xml")).unwrap();
    assert_eq!(
        lines[0]["counts"]["results"],
        expected["results"].as_array().unwrap().len()
    );
    // The same JUnit again is a no-op, as in the app.
    let (code, out, _) = f.run(&["upload", "junit.xml", "-p", "TC", "--lang", "en"], &[]);
    assert_eq!(code, 0, "{out}");
    assert!(out.contains("already imported into RUN-001"), "{out}");
}
