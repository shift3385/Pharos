//! Review flow of a test case (CAS-02, ADR-0047): draft → reviewed («En
//! revisión») → approved, with «return» back to draft, «obsolete» and
//! «reactivate». The stored status values are the ones the app already had,
//! so an older app still reads them.
//!
//! - A plain save never moves the status (`after_save`): it keeps the stored
//!   one, and a save that changes the content of a case in review or
//!   approved sends it back to draft and drops its approval. Once approved,
//!   the version goes up too (as the plan's, ADR-0040).
//! - Only `review_case` moves the status. Who sent the case and who approved
//!   it live in `data.review` and `data.approval`; a save or an import never
//!   writes them.
//! - Who may approve is an `ApproverCheck`. Until the roles of 0.5.0 (TEN-01)
//!   the check is `OtherThanAuthor`: someone other than the author, or the
//!   author when the workspace has nobody else (recorded as a self-approval).
//!   The workspaces track installs its role check with `set_approver_check`.

use std::sync::OnceLock;

use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{json, Map, Value};
#[cfg(test)]
use ts_rs::TS;

use crate::test_case;

pub const DRAFT: &str = "draft";
pub const REVIEWED: &str = "reviewed";
pub const APPROVED: &str = "approved";
pub const OBSOLETE: &str = "obsolete";

/// Error prefixes the UI translates.
pub const ERR_TRANSITION: &str = "review-invalid-transition";
pub const ERR_COMMENT: &str = "review-comment-required";
pub const ERR_NOT_ALLOWED: &str = "review-not-allowed";

/// Keys of `data` that record the review, not the content.
const REVIEW_KEYS: [&str; 2] = ["review", "approval"];
/// Keys of `data` outside the content of a case: changing them does not send
/// an approved case back to draft (ADR-0047).
const NOT_CONTENT: [&str; 4] = ["review", "approval", "aiProvenance", "custom"];

// ---------------------------------------------------------------- approver

/// What the approver check is asked.
#[allow(dead_code)] // `project_id` and `case_id` are for the role check of TEN-01
pub struct ApprovalRequest<'a> {
    pub workspace_id: &'a str,
    pub project_id: &'a str,
    pub case_id: &'a str,
    /// The account that created the case.
    pub author_id: &'a str,
    /// The account approving it.
    pub approver_id: &'a str,
}

/// Why an approval is refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)] // `Role` and `NotMember` come with the role check of TEN-01
pub enum DenyReason {
    /// The author, in a workspace where someone else can approve.
    Author,
    /// The account's role cannot approve (wired by the workspaces track).
    Role,
    /// The account is not a member of the workspace.
    NotMember,
}

impl DenyReason {
    pub fn as_str(self) -> &'static str {
        match self {
            DenyReason::Author => "author",
            DenyReason::Role => "role",
            DenyReason::NotMember => "notMember",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalVerdict {
    Allowed { self_approval: bool },
    Denied(DenyReason),
}

/// Who may approve a case. The default is `OtherThanAuthor`; the workspaces
/// track (TEN-01) installs one that also checks the role.
pub trait ApproverCheck: Send + Sync {
    fn can_approve(
        &self,
        conn: &Connection,
        req: &ApprovalRequest,
    ) -> Result<ApprovalVerdict, String>;
}

/// Someone other than the author approves; with nobody else in the
/// workspace, the author may, and it is recorded as a self-approval.
pub struct OtherThanAuthor {
    /// How many people the workspace has.
    pub member_count: fn(&Connection, &str) -> Result<i64, String>,
}

/// Until workspaces have members (TEN-01), every workspace has one person.
pub fn single_member(_conn: &Connection, _workspace_id: &str) -> Result<i64, String> {
    Ok(1)
}

impl ApproverCheck for OtherThanAuthor {
    fn can_approve(
        &self,
        conn: &Connection,
        req: &ApprovalRequest,
    ) -> Result<ApprovalVerdict, String> {
        if req.approver_id != req.author_id {
            return Ok(ApprovalVerdict::Allowed {
                self_approval: false,
            });
        }
        Ok(if (self.member_count)(conn, req.workspace_id)? <= 1 {
            ApprovalVerdict::Allowed {
                self_approval: true,
            }
        } else {
            ApprovalVerdict::Denied(DenyReason::Author)
        })
    }
}

static APPROVER: OnceLock<Box<dyn ApproverCheck>> = OnceLock::new();
static DEFAULT_APPROVER: OtherThanAuthor = OtherThanAuthor {
    member_count: single_member,
};

/// Installs the approver check (once, at startup). False if one was already
/// installed.
#[allow(dead_code)] // the workspaces track (TEN-01) calls it
pub fn set_approver_check(check: Box<dyn ApproverCheck>) -> bool {
    APPROVER.set(check).is_ok()
}

fn approver() -> &'static dyn ApproverCheck {
    APPROVER
        .get()
        .map(|b| b.as_ref())
        .unwrap_or(&DEFAULT_APPROVER)
}

// ------------------------------------------------------------------- saves

/// A new case starts as draft or obsolete: never in review or approved.
pub fn status_on_create(status: Option<&str>) -> &'static str {
    match status {
        Some(OBSOLETE) => OBSOLETE,
        _ => DRAFT,
    }
}

/// Removes who sent or approved the case from a `data` a caller wrote.
pub fn strip_review(data: &mut Value) {
    if let Some(map) = data.as_object_mut() {
        for key in REVIEW_KEYS {
            map.remove(key);
        }
    }
}

/// The stored case a save starts from.
pub struct Saved<'a> {
    pub status: &'a str,
    pub title: &'a str,
    pub version: &'a str,
    pub data: Option<&'a Value>,
}

/// Status and version a save writes.
pub struct AfterSave {
    pub status: String,
    pub version: String,
}

/// `data` without what is not content, and without empty values, so an
/// empty field the editor sends and one it never sent compare equal.
fn content(data: Option<&Value>) -> Map<String, Value> {
    let mut out = Map::new();
    if let Some(map) = data.and_then(Value::as_object) {
        for (k, v) in map {
            if NOT_CONTENT.contains(&k.as_str()) || is_empty(v) {
                continue;
            }
            out.insert(k.clone(), v.clone());
        }
    }
    out
}

fn is_empty(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::String(s) => s.trim().is_empty(),
        Value::Array(a) => a.is_empty(),
        Value::Object(o) => o.is_empty(),
        _ => false,
    }
}

/// True when the title or the content differ (ADR-0047: priority, the case
/// type and automation, custom fields and AI review marks are not content).
pub fn content_changed(old_title: &str, old: Option<&Value>, new_title: &str, new: &Value) -> bool {
    old_title.trim() != new_title.trim() || content(old) != content(Some(new))
}

/// Bumps the last dotted segment of a version (`1.0` → `1.1`), as the plan
/// does (`nextVersion`); a version that does not end in a number stays.
pub fn next_version(v: &str) -> String {
    match v.rsplit_once('.') {
        Some((head, last)) => match last.parse::<u64>() {
            Ok(n) => format!("{head}.{}", n + 1),
            Err(_) => v.to_string(),
        },
        None => match v.parse::<u64>() {
            Ok(n) => (n + 1).to_string(),
            Err(_) => v.to_string(),
        },
    }
}

/// What a plain save writes (`update_case`). `data` is the prepared input:
/// it gets the stored review records back, minus what the save drops.
pub fn after_save(saved: Saved, title: &str, version: Option<&str>, data: &mut Value) -> AfterSave {
    let changed = content_changed(saved.title, saved.data, title, data);
    let requested = version.unwrap_or(saved.version).to_string();
    strip_review(data);
    let kept = |key: &str| saved.data.and_then(|d| d.get(key)).cloned();
    let in_flow = saved.status == REVIEWED || saved.status == APPROVED;
    if changed && in_flow {
        // Back to draft: the submission and the approval no longer describe
        // this content. An approved case also gets its next version.
        let version = if saved.status == APPROVED && requested == saved.version {
            next_version(saved.version)
        } else {
            requested
        };
        return AfterSave {
            status: DRAFT.to_string(),
            version,
        };
    }
    if let Some(map) = data.as_object_mut() {
        for key in REVIEW_KEYS {
            if let Some(v) = kept(key) {
                map.insert(key.to_string(), v);
            }
        }
    }
    AfterSave {
        status: saved.status.to_string(),
        version: requested,
    }
}

// ------------------------------------------------------------- transitions

#[cfg_attr(test, derive(TS), ts(export, rename = "CaseReviewAction"))]
#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReviewAction {
    Send,
    Approve,
    Return,
    Obsolete,
    Reactivate,
}

#[cfg_attr(
    test,
    derive(TS),
    ts(export, rename = "CaseReviewInput", optional_fields)
)]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewInput {
    pub action: ReviewAction,
    /// The note to the reviewer (send) or why the case goes back (return).
    pub comment: Option<String>,
    /// Signed-in user making the change.
    pub user_id: String,
    /// Their name, recorded with the transition.
    pub user_name: String,
}

/// The stored case a transition starts from.
pub struct CaseState {
    pub workspace_id: String,
    pub project_id: String,
    pub status: String,
    pub version: String,
    pub revision: i64,
    pub data: Value,
    pub created_by: String,
}

fn now(conn: &Connection) -> Result<String, String> {
    conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |r| {
        r.get(0)
    })
    .map_err(|e| e.to_string())
}

fn transition_error(from: &str, action: ReviewAction) -> String {
    format!("{ERR_TRANSITION}: cannot {action:?} a case that is {from}")
}

/// Applies a transition with the installed approver check.
pub fn review_case(conn: &Connection, id: &str, input: &ReviewInput) -> Result<(), String> {
    review_with(conn, id, input, approver())
}

/// Applies a transition with the given approver check.
pub fn review_with(
    conn: &Connection,
    id: &str,
    input: &ReviewInput,
    check: &dyn ApproverCheck,
) -> Result<(), String> {
    let Some(case) = test_case::review_state(conn, id, &input.user_id)? else {
        return Err("test case not found".to_string());
    };
    let user = input.user_id.as_str();
    let name = input.user_name.trim();
    let comment = input
        .comment
        .as_deref()
        .map(str::trim)
        .filter(|c| !c.is_empty());
    let at = now(conn)?;
    // The transition is one more revision of the case.
    let revision = case.revision + 1;
    let mut data = case.data.clone();
    if !data.is_object() {
        data = json!({});
    }
    let map = data.as_object_mut().expect("an object");
    let status = match input.action {
        ReviewAction::Send => {
            if case.status != DRAFT {
                return Err(transition_error(&case.status, input.action));
            }
            let mut review = json!({
                "state": "pending",
                "sentBy": user,
                "sentByName": name,
                "sentAt": at,
                "revision": revision,
                "version": case.version,
            });
            if let Some(note) = comment {
                review["note"] = json!(note);
            }
            map.insert("review".into(), review);
            map.remove("approval");
            REVIEWED
        }
        ReviewAction::Approve => {
            if case.status != REVIEWED {
                return Err(transition_error(&case.status, input.action));
            }
            let verdict = check.can_approve(
                conn,
                &ApprovalRequest {
                    workspace_id: &case.workspace_id,
                    project_id: &case.project_id,
                    case_id: id,
                    author_id: &case.created_by,
                    approver_id: user,
                },
            )?;
            let self_approval = match verdict {
                ApprovalVerdict::Allowed { self_approval } => self_approval,
                ApprovalVerdict::Denied(reason) => {
                    return Err(format!("{ERR_NOT_ALLOWED}: {}", reason.as_str()))
                }
            };
            map.insert(
                "approval".into(),
                json!({
                    "by": user,
                    "byName": name,
                    "at": at,
                    "version": case.version,
                    "revision": revision,
                    "selfApproved": self_approval,
                }),
            );
            if let Some(review) = map.get_mut("review").and_then(Value::as_object_mut) {
                review.insert("state".into(), json!("approved"));
            }
            APPROVED
        }
        ReviewAction::Return => {
            if case.status != REVIEWED {
                return Err(transition_error(&case.status, input.action));
            }
            let Some(comment) = comment else {
                return Err(format!("{ERR_COMMENT}: say what has to change"));
            };
            let review = map
                .entry("review")
                .or_insert_with(|| json!({}))
                .as_object_mut()
                .ok_or_else(|| "data.review is not an object".to_string())?;
            review.insert("state".into(), json!("returned"));
            review.insert("returnedBy".into(), json!(user));
            review.insert("returnedByName".into(), json!(name));
            review.insert("returnedAt".into(), json!(at));
            review.insert("comment".into(), json!(comment));
            DRAFT
        }
        ReviewAction::Obsolete => {
            if case.status == OBSOLETE {
                return Err(transition_error(&case.status, input.action));
            }
            map.remove("approval");
            OBSOLETE
        }
        ReviewAction::Reactivate => {
            if case.status != OBSOLETE {
                return Err(transition_error(&case.status, input.action));
            }
            DRAFT
        }
    };
    test_case::write_review(conn, id, status, &data, user)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    const USER: &str = "user-1";
    const OTHER: &str = "user-2";

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&c).unwrap();
        c
    }

    fn project(c: &Connection) -> String {
        let ws = crate::db::ensure_workspace(c).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        c.execute(
            "INSERT INTO projects (id, workspace_id, owner_id, name, case_id_prefix, case_id_digits, \
             created_by, updated_by, created_at, updated_at, revision) \
             VALUES (?1, ?2, ?3, 'P', 'TC-', 3, ?3, ?3, datetime('now'), datetime('now'), 1)",
            params![id, ws, USER],
        )
        .unwrap();
        id
    }

    fn case_input(p: &str, title: &str, data: Value) -> test_case::TestCaseInput {
        serde_json::from_value(json!({
            "projectId": p, "title": title, "author": "Ada", "data": data, "userId": USER
        }))
        .unwrap()
    }

    fn new_case(c: &Connection, p: &str) -> String {
        test_case::insert_case(c, &case_input(p, "Pay", json!({"steps": ["a"]}))).unwrap()
    }

    fn act(action: ReviewAction, comment: Option<&str>, user: &str) -> ReviewInput {
        ReviewInput {
            action,
            comment: comment.map(String::from),
            user_id: user.to_string(),
            user_name: "Ada".to_string(),
        }
    }

    fn state(c: &Connection, id: &str) -> (String, String, Value) {
        c.query_row(
            "SELECT status, version, data FROM test_cases WHERE id = ?1",
            params![id],
            |r| {
                let d: String = r.get(2)?;
                Ok((r.get(0)?, r.get(1)?, serde_json::from_str(&d).unwrap()))
            },
        )
        .unwrap()
    }

    /// A check that pretends the workspace has several members.
    struct Team;
    impl ApproverCheck for Team {
        fn can_approve(
            &self,
            c: &Connection,
            req: &ApprovalRequest,
        ) -> Result<ApprovalVerdict, String> {
            OtherThanAuthor {
                member_count: |_, _| Ok(2),
            }
            .can_approve(c, req)
        }
    }

    #[test]
    fn send_approve_records_who_when_and_the_version() {
        let c = conn();
        let p = project(&c);
        let id = new_case(&c, &p);
        review_case(&c, &id, &act(ReviewAction::Send, Some("ready"), USER)).unwrap();
        let (status, _, data) = state(&c, &id);
        assert_eq!(status, REVIEWED);
        assert_eq!(data["review"]["state"], "pending");
        assert_eq!(data["review"]["note"], "ready");
        assert_eq!(data["review"]["revision"], 2);

        // Alone in the workspace, the author approves: a self-approval.
        review_case(&c, &id, &act(ReviewAction::Approve, None, USER)).unwrap();
        let (status, version, data) = state(&c, &id);
        assert_eq!((status.as_str(), version.as_str()), (APPROVED, "1.0"));
        assert_eq!(data["approval"]["by"], USER);
        assert_eq!(data["approval"]["byName"], "Ada");
        assert_eq!(data["approval"]["selfApproved"], true);
        assert_eq!(data["approval"]["revision"], 3);
        assert_eq!(data["review"]["state"], "approved");
    }

    #[test]
    fn with_more_people_the_author_cannot_approve_and_another_can() {
        let c = conn();
        let p = project(&c);
        let id = new_case(&c, &p);
        review_with(&c, &id, &act(ReviewAction::Send, None, USER), &Team).unwrap();
        let err = review_with(&c, &id, &act(ReviewAction::Approve, None, USER), &Team).unwrap_err();
        assert!(err.starts_with("review-not-allowed: author"), "{err}");
        assert_eq!(state(&c, &id).0, REVIEWED);
        // Until workspaces share projects (TEN-01) only the owner reaches a
        // case, so «another person» is simulated by another author.
        c.execute(
            "UPDATE test_cases SET created_by = ?2 WHERE id = ?1",
            params![id, OTHER],
        )
        .unwrap();
        review_with(&c, &id, &act(ReviewAction::Approve, None, USER), &Team).unwrap();
        let (status, _, data) = state(&c, &id);
        assert_eq!(status, APPROVED);
        assert_eq!(data["approval"]["selfApproved"], false);
    }

    #[test]
    fn returning_needs_a_comment_and_leaves_it_on_the_draft() {
        let c = conn();
        let p = project(&c);
        let id = new_case(&c, &p);
        review_case(&c, &id, &act(ReviewAction::Send, None, USER)).unwrap();
        let err = review_case(&c, &id, &act(ReviewAction::Return, Some("  "), USER)).unwrap_err();
        assert!(err.starts_with(ERR_COMMENT), "{err}");
        review_case(&c, &id, &act(ReviewAction::Return, Some("Step 3?"), USER)).unwrap();
        let (status, _, data) = state(&c, &id);
        assert_eq!(status, DRAFT);
        assert_eq!(data["review"]["state"], "returned");
        assert_eq!(data["review"]["comment"], "Step 3?");
        // A save of the returned draft keeps the comment until the next send.
        test_case::update_case(&c, &id, &case_input(&p, "Pay now", json!({"steps": ["a"]})))
            .unwrap();
        assert_eq!(state(&c, &id).2["review"]["comment"], "Step 3?");
    }

    #[test]
    fn transitions_out_of_order_are_refused() {
        let c = conn();
        let p = project(&c);
        let id = new_case(&c, &p);
        for action in [
            ReviewAction::Approve,
            ReviewAction::Return,
            ReviewAction::Reactivate,
        ] {
            let err = review_case(&c, &id, &act(action, Some("x"), USER)).unwrap_err();
            assert!(err.starts_with(ERR_TRANSITION), "{action:?}: {err}");
        }
        review_case(&c, &id, &act(ReviewAction::Obsolete, None, USER)).unwrap();
        assert_eq!(state(&c, &id).0, OBSOLETE);
        assert!(review_case(&c, &id, &act(ReviewAction::Send, None, USER)).is_err());
        review_case(&c, &id, &act(ReviewAction::Reactivate, None, USER)).unwrap();
        assert_eq!(state(&c, &id).0, DRAFT);
    }

    #[test]
    fn another_users_case_is_not_found() {
        let c = conn();
        let p = project(&c);
        let id = new_case(&c, &p);
        let err = review_case(&c, &id, &act(ReviewAction::Send, None, OTHER)).unwrap_err();
        assert_eq!(err, "test case not found");
    }

    fn approved_case(c: &Connection, p: &str) -> String {
        let id = new_case(c, p);
        review_case(c, &id, &act(ReviewAction::Send, None, USER)).unwrap();
        review_case(c, &id, &act(ReviewAction::Approve, None, USER)).unwrap();
        id
    }

    #[test]
    fn editing_the_content_of_an_approved_case_sends_it_back_to_draft() {
        let c = conn();
        let p = project(&c);
        let id = approved_case(&c, &p);
        test_case::update_case(
            &c,
            &id,
            &case_input(&p, "Pay", json!({"steps": ["a", "b"]})),
        )
        .unwrap();
        let (status, version, data) = state(&c, &id);
        assert_eq!((status.as_str(), version.as_str()), (DRAFT, "1.1"));
        assert!(data.get("approval").is_none());
        assert!(data.get("review").is_none());
    }

    #[test]
    fn a_save_without_content_changes_keeps_the_approval() {
        let c = conn();
        let p = project(&c);
        let id = approved_case(&c, &p);
        // Same content (the stored steps, with their ids), another priority,
        // an empty field, a forged status and a forged approval.
        let mut data = state(&c, &id).2;
        data["notes"] = json!("");
        data["approval"] = json!({"by": "mallory"});
        let input: test_case::TestCaseInput = serde_json::from_value(json!({
            "projectId": p, "title": "Pay", "author": "Ada", "priority": "high",
            "status": "draft", "data": data, "userId": USER
        }))
        .unwrap();
        test_case::update_case(&c, &id, &input).unwrap();
        let (status, version, data) = state(&c, &id);
        assert_eq!((status.as_str(), version.as_str()), (APPROVED, "1.0"));
        assert_eq!(data["approval"]["by"], USER);
    }

    #[test]
    fn editing_a_case_in_review_sends_it_back_to_draft() {
        let c = conn();
        let p = project(&c);
        let id = new_case(&c, &p);
        review_case(&c, &id, &act(ReviewAction::Send, None, USER)).unwrap();
        test_case::update_case(
            &c,
            &id,
            &case_input(&p, "Pay later", json!({"steps": ["a"]})),
        )
        .unwrap();
        let (status, version, data) = state(&c, &id);
        assert_eq!((status.as_str(), version.as_str()), (DRAFT, "1.0"));
        assert!(data.get("review").is_none());
    }

    #[test]
    fn a_save_cannot_put_a_case_in_review_or_approve_it() {
        let c = conn();
        let p = project(&c);
        let id = new_case(&c, &p);
        let input: test_case::TestCaseInput = serde_json::from_value(json!({
            "projectId": p, "title": "Pay", "author": "Ada", "status": "approved",
            "data": {"steps": ["a"]}, "userId": USER
        }))
        .unwrap();
        test_case::update_case(&c, &id, &input).unwrap();
        assert_eq!(state(&c, &id).0, DRAFT);
    }

    #[test]
    fn a_new_case_never_starts_approved_nor_brings_an_approval() {
        let c = conn();
        let p = project(&c);
        let input: test_case::TestCaseInput = serde_json::from_value(json!({
            "projectId": p, "title": "Imported", "author": "Ada", "status": "approved",
            "data": {"approval": {"by": "someone"}, "review": {"state": "pending"}},
            "userId": USER
        }))
        .unwrap();
        let id = test_case::insert_case(&c, &input).unwrap();
        let (status, _, data) = state(&c, &id);
        assert_eq!(status, DRAFT);
        assert!(data.get("approval").is_none() && data.get("review").is_none());
        assert_eq!(status_on_create(Some("obsolete")), OBSOLETE);
    }

    #[test]
    fn what_counts_as_content() {
        let old = json!({"steps": [{"id": "s1", "text": "a"}], "custom": {"x": 1}});
        // Custom fields, AI marks and empty fields are not content.
        let same = json!({"steps": [{"id": "s1", "text": "a"}], "custom": {"x": 2},
                          "aiProvenance": {"description": {}}, "notes": "", "postconditions": []});
        assert!(!content_changed("T", Some(&old), "T ", &same));
        let edited = json!({"steps": [{"id": "s1", "text": "b"}]});
        assert!(content_changed("T", Some(&old), "T", &edited));
        assert!(content_changed("T", Some(&old), "U", &old));
    }

    #[test]
    fn next_version_bumps_the_last_number() {
        assert_eq!(next_version("1.0"), "1.1");
        assert_eq!(next_version("1.9"), "1.10");
        assert_eq!(next_version("2"), "3");
        assert_eq!(next_version("v1-beta"), "v1-beta");
    }

    #[test]
    fn every_transition_is_journaled_and_leaves_a_revision_row() {
        let c = conn();
        let p = project(&c);
        let id = approved_case(&c, &p);
        let rows: i64 = c
            .query_row(
                "SELECT count(*) FROM test_case_revisions WHERE test_case_id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(rows, 3, "create, send and approve");
        let statuses: Vec<String> = c
            .prepare(
                "SELECT status FROM test_case_revisions WHERE test_case_id = ?1 ORDER BY revision",
            )
            .unwrap()
            .query_map(params![id], |r| r.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(statuses, ["draft", "reviewed", "approved"]);
    }
}
