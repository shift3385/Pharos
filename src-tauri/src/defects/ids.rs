//! Deterministic ids of the defects module (design 0.2.0 §3.3, ADR-0016): a
//! defect link is the same row on every device that links the same defect to
//! the same target. The UUIDv5 name is the JCS of the parts as a JSON array,
//! as in `runs/ids.rs`. The TS twins are `src/modules/defects/model/ids.ts`
//! and the server's `server/src/modules/sync/defects.ts`; all three check
//! `tests/fixtures/defect-vectors.json`.

use serde_json::json;
use uuid::Uuid;

pub const NS_DEFECT_LINK: Uuid = Uuid::from_u128(0x21d4_651e_667c_5993_bf7d_4d2f_8399_f56e);

/// `UUIDv5(NS_DEFECT_LINK, [defect_id, target_kind, target_id])`.
pub fn link_id(defect_id: &str, target_kind: &str, target_id: &str) -> String {
    let name = crate::steps::jcs(&json!([defect_id, target_kind, target_id]));
    Uuid::new_v5(&NS_DEFECT_LINK, name.as_bytes()).to_string()
}
