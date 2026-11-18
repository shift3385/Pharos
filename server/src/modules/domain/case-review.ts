import { AppError } from "../auth/errors";

// Review flow of a test case for the web (CAS-02, ADR-0047): the rules of
// the desktop's `case_review.rs`, on the server's documents. A plain save
// keeps the stored status and review records; a save that changes the
// content of a case in review or approved sends it back to draft (and, once
// approved, bumps its version). Only a review transition moves the status,
// and who approves is decided by an `ApproverCheck`.

type Payload = Record<string, unknown>;

export const DRAFT = "draft";
export const REVIEWED = "reviewed";
export const APPROVED = "approved";
export const OBSOLETE = "obsolete";

export const REVIEW_ACTIONS = ["send", "approve", "return", "obsolete", "reactivate"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

/** Keys of `data` that record the review, not the content. */
const REVIEW_KEYS = ["review", "approval"] as const;
/** Keys of `data` outside the content of a case (ADR-0047). */
const NOT_CONTENT = new Set(["review", "approval", "aiProvenance", "custom"]);

// ---------------------------------------------------------------- approver

export interface ApprovalRequest {
  /** What is approved: a test case (CAS-02, the default) or a test plan
   *  (PLN-08). The role policy picks the capability from it. */
  subject?: "case" | "plan";
  workspaceId: string;
  projectId: string;
  caseId: string;
  /** The account that created the case. */
  authorId: string;
  /** The account approving it. */
  approverId: string;
}

export type ApprovalVerdict =
  | { ok: true; selfApproval: boolean }
  | { ok: false; reason: "author" | "role" | "notMember" };

/** Who may approve a case. The workspaces track (TEN-01) installs one that
 *  also checks the role (Test Manager or Test Analyst). */
export interface ApproverCheck {
  canApprove(req: ApprovalRequest): Promise<ApprovalVerdict>;
}

/** Someone other than the author; alone in the workspace, the author may,
 *  recorded as a self-approval. */
export function otherThanAuthor(memberCount: (workspaceId: string) => Promise<number>): ApproverCheck {
  return {
    async canApprove(req) {
      if (req.approverId !== req.authorId) return { ok: true, selfApproval: false };
      return (await memberCount(req.workspaceId)) <= 1
        ? { ok: true, selfApproval: true }
        : { ok: false, reason: "author" };
    },
  };
}

/** Until workspaces have members (TEN-01), each has one person. */
const singleMember = async () => 1;

let installed: ApproverCheck = otherThanAuthor(singleMember);

/** Installs the approver check (the workspaces track, at startup). */
export function setApproverCheck(check: ApproverCheck): void {
  installed = check;
}

export const approverCheck = (): ApproverCheck => installed;

// ------------------------------------------------------------------- saves

const isObject = (v: unknown): v is Payload => typeof v === "object" && v !== null && !Array.isArray(v);

/** A new case starts as draft or obsolete. */
export const statusOnCreate = (status?: string): string => (status === OBSOLETE ? OBSOLETE : DRAFT);

/** `data` without who sent or approved the case. */
export function stripReview(data: Payload): Payload {
  const out = { ...data };
  for (const k of REVIEW_KEYS) delete out[k];
  return out;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (isObject(v)) return Object.keys(v).length === 0;
  return false;
}

/** JSON with sorted keys, so two equal objects give the same text. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (isObject(v)) {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

function content(data: unknown): string {
  const out: Payload = {};
  if (isObject(data)) {
    for (const [k, v] of Object.entries(data)) {
      if (!NOT_CONTENT.has(k) && !isEmpty(v)) out[k] = v;
    }
  }
  return canonical(out);
}

/** True when the title or the content differ (priority, case type,
 *  automation, custom fields and AI review marks are not content). */
export const contentChanged = (oldTitle: string, oldData: unknown, newTitle: string, newData: unknown): boolean =>
  oldTitle.trim() !== newTitle.trim() || content(oldData) !== content(newData);

/** Bumps the last dotted number (`1.0` → `1.1`), as the plan's `nextVersion`. */
export function nextVersion(v: string): string {
  const parts = v.split(".");
  const last = parts[parts.length - 1];
  if (!/^\d+$/.test(last)) return v;
  parts[parts.length - 1] = String(Number(last) + 1);
  return parts.join(".");
}

/** Status, version and `data` a plain save writes over a stored case. */
export function afterSave(
  saved: { status: string; title: string; version: string; data: unknown },
  title: string,
  version: string | undefined,
  data: Payload,
): { status: string; version: string; data: Payload } {
  const changed = contentChanged(saved.title, saved.data, title, data);
  const requested = version ?? saved.version;
  const clean = stripReview(data);
  const inFlow = saved.status === REVIEWED || saved.status === APPROVED;
  if (changed && inFlow) {
    return {
      status: DRAFT,
      version: saved.status === APPROVED && requested === saved.version ? nextVersion(saved.version) : requested,
      data: clean,
    };
  }
  const stored = isObject(saved.data) ? saved.data : {};
  for (const k of REVIEW_KEYS) if (stored[k] !== undefined) clean[k] = stored[k];
  return { status: saved.status, version: requested, data: clean };
}

// ------------------------------------------------------------- transitions

export interface ReviewRequest {
  action: ReviewAction;
  comment?: string;
  userId: string;
  userName: string;
  /** When the transition happens (ISO). */
  at: string;
  /** The case's revision after the transition. */
  revision: number;
}

const invalid = (from: string, action: ReviewAction) =>
  new AppError(409, "review_invalid_transition", `Cannot ${action} a case that is ${from}.`);

/** The status and `data` after a transition; throws when it is not allowed. */
export async function reviewTransition(
  stored: Payload,
  req: ReviewRequest,
  check: ApproverCheck,
  where: { workspaceId: string; projectId: string; caseId: string; authorId: string },
): Promise<{ status: string; data: Payload }> {
  const status = typeof stored.status === "string" ? stored.status : DRAFT;
  const version = typeof stored.version === "string" ? stored.version : "1.0";
  const data: Payload = isObject(stored.data) ? { ...stored.data } : {};
  const name = req.userName.trim();
  const comment = req.comment?.trim() || undefined;
  switch (req.action) {
    case "send": {
      if (status !== DRAFT) throw invalid(status, req.action);
      data.review = {
        state: "pending",
        sentBy: req.userId,
        sentByName: name,
        sentAt: req.at,
        revision: req.revision,
        version,
        ...(comment ? { note: comment } : {}),
      };
      delete data.approval;
      return { status: REVIEWED, data };
    }
    case "approve": {
      if (status !== REVIEWED) throw invalid(status, req.action);
      const verdict = await check.canApprove({ ...where, approverId: req.userId });
      if (!verdict.ok) {
        throw new AppError(403, "review_not_allowed", `This account cannot approve the case (${verdict.reason}).`);
      }
      data.approval = {
        by: req.userId,
        byName: name,
        at: req.at,
        version,
        revision: req.revision,
        selfApproved: verdict.selfApproval,
      };
      if (isObject(data.review)) data.review = { ...data.review, state: "approved" };
      return { status: APPROVED, data };
    }
    case "return": {
      if (status !== REVIEWED) throw invalid(status, req.action);
      if (!comment) throw new AppError(400, "review_comment_required", "Say what has to change.");
      data.review = {
        ...(isObject(data.review) ? data.review : {}),
        state: "returned",
        returnedBy: req.userId,
        returnedByName: name,
        returnedAt: req.at,
        comment,
      };
      return { status: DRAFT, data };
    }
    case "obsolete": {
      if (status === OBSOLETE) throw invalid(status, req.action);
      delete data.approval;
      return { status: OBSOLETE, data };
    }
    case "reactivate": {
      if (status !== OBSOLETE) throw invalid(status, req.action);
      return { status: DRAFT, data };
    }
  }
}
