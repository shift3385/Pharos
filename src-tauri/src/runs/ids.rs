//! Deterministic ids where two devices can create "the same" row (design 0.2.0
//! §3.3, ADR-0013): a shard per run and file, an imported result per shard,
//! test, configuration and attempt, and one unlinked mapping per project and
//! `test_key`. The UUIDv5 name is the JCS of the parts as a JSON array, so no
//! separator inside a `test_key` (`manual:<case>/…`, a path with `:`) can make
//! two different tuples collide. Manual attempts use random ids instead: two
//! simultaneous attempts are two facts. The TS twin is
//! `src/shared/contracts/pharos-run/ids.ts`; both check
//! `tests/fixtures/run-id-vectors.json`.

use serde_json::{json, Value};
use uuid::Uuid;

pub const NS_RUN_SHARD: Uuid = Uuid::from_u128(0x3b6d_1f0a_8c2e_5d47_a913_6e0f_2b8c_4d71);
pub const NS_RESULT: Uuid = Uuid::from_u128(0x9a4e_7c21_0b5f_5e83_b6d2_1c9a_3f70_e845);
pub const NS_UNLINKED_MAPPING: Uuid = Uuid::from_u128(0x5c8f_2d93_e1a4_5b06_8f37_d4b2_6a10_c9e2);
pub const NS_STEP_RESULT: Uuid = Uuid::from_u128(0xe2b7_4c18_6d3a_5f91_b0c5_8a1d_4e6f_2b37);

fn v5(ns: &Uuid, parts: Value) -> String {
    Uuid::new_v5(ns, crate::steps::jcs(&parts).as_bytes()).to_string()
}

/// `UUIDv5(NS_RUN_SHARD, [run_id, source_file_sha256])`: the same file in the
/// same run is the same shard on every device, so re-uploading it adds nothing.
pub fn shard_id(run_id: &str, source_file_sha256: &str) -> String {
    v5(
        &NS_RUN_SHARD,
        json!([run_id, source_file_sha256.to_ascii_lowercase()]),
    )
}

/// `UUIDv5(NS_RESULT, [shard_id, test_key, configuration_label, attempt])`,
/// with a missing label as "".
pub fn imported_result_id(
    shard_id: &str,
    test_key: &str,
    configuration_label: Option<&str>,
    attempt: i64,
) -> String {
    v5(
        &NS_RESULT,
        json!([
            shard_id,
            test_key,
            configuration_label.unwrap_or(""),
            attempt
        ]),
    )
}

/// `UUIDv5(NS_STEP_RESULT, [result_id, position])`: a step of an imported
/// result, so two devices importing the same file write the same document
/// (ADR-0013, step 9 note).
pub fn imported_step_result_id(result_id: &str, position: i64) -> String {
    v5(&NS_STEP_RESULT, json!([result_id, position]))
}

/// `UUIDv5(NS_UNLINKED_MAPPING, [project_id, test_key])`: one rule per key on
/// every device; the last change wins.
pub fn unlinked_mapping_id(project_id: &str, test_key: &str) -> String {
    v5(&NS_UNLINKED_MAPPING, json!([project_id, test_key]))
}

/// `test_key` of a manual attempt: `manual:<case>/<flow|->/<row|->`.
pub fn manual_test_key(case_id: &str, flow_id: Option<&str>, row_id: Option<&str>) -> String {
    format!(
        "manual:{case_id}/{}/{}",
        flow_id.filter(|f| !f.is_empty()).unwrap_or("-"),
        row_id.filter(|r| !r.is_empty()).unwrap_or("-")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const VECTORS: &str = include_str!("../../tests/fixtures/run-id-vectors.json");

    #[test]
    fn ids_match_the_shared_vectors() {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        let s = |x: &Value, k: &str| x[k].as_str().unwrap().to_string();
        for x in v["shards"].as_array().unwrap() {
            assert_eq!(shard_id(&s(x, "runId"), &s(x, "sha256")), s(x, "id"));
        }
        for x in v["results"].as_array().unwrap() {
            let label = x["configurationLabel"].as_str();
            let attempt = x["attempt"].as_i64().unwrap();
            assert_eq!(
                imported_result_id(&s(x, "shardId"), &s(x, "testKey"), label, attempt),
                s(x, "id")
            );
        }
        for x in v["mappings"].as_array().unwrap() {
            assert_eq!(
                unlinked_mapping_id(&s(x, "projectId"), &s(x, "testKey")),
                s(x, "id")
            );
        }
        for x in v["stepResults"].as_array().unwrap() {
            let position = x["position"].as_i64().unwrap();
            assert_eq!(
                imported_step_result_id(&s(x, "resultId"), position),
                s(x, "id")
            );
        }
        for x in v["manualKeys"].as_array().unwrap() {
            assert_eq!(
                manual_test_key(&s(x, "caseId"), x["flowId"].as_str(), x["rowId"].as_str()),
                s(x, "testKey")
            );
        }
    }

    #[test]
    fn separators_inside_a_key_never_collide() {
        assert_ne!(
            imported_result_id("s", "a:b", Some("c"), 0),
            imported_result_id("s", "a", Some("b:c"), 0)
        );
        assert_ne!(
            imported_result_id("s", "k", None, 1),
            imported_result_id("s", "k", Some("1"), 0)
        );
        assert_eq!(shard_id("r", "ABC"), shard_id("r", "abc"));
    }
}
