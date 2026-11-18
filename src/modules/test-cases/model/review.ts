// The review flow of a case (CAS-02, ADR-0047, changed by PLN-08,
// ADR-0049): draft → reviewed («En revisión») → approved. Borrador is only
// the stage before the first send; «Pedir cambios» (`return`) and an edit
// keep the case in review, and an edit of an approved case sends it back. The desktop core (`case_review.rs`) and the server
// (`case-review.ts`) enforce it; this module only reads what they stored and
// says, for the screen, what each person may do.

/** A transition the review command accepts. */
export const REVIEW_ACTIONS = ["send", "approve", "return", "obsolete", "reactivate"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

/** `data.review`: the last submission and how it ended. */
export interface CaseReview {
  /** `returned`: a draft sent back before PLN-08 (0.5.0 betas). */
  state: "pending" | "changesRequested" | "returned" | "approved";
  sentBy: string;
  sentByName: string;
  sentAt: string;
  /** The case's revision once sent. */
  revision: number;
  version: string;
  /** The note to the reviewer. */
  note?: string;
  returnedBy?: string;
  returnedByName?: string;
  returnedAt?: string;
  /** What has to change («Pedir cambios»). */
  comment?: string;
  /** The approved version an edit sent back to review (PLN-08). */
  reopenedFrom?: string;
}

/** `data.approval`: who approved which version, and when. */
export interface CaseApproval {
  by: string;
  byName: string;
  at: string;
  version: string;
  /** The case's revision once approved. */
  revision: number;
  /** The author approved it, alone in the workspace. */
  selfApproved: boolean;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** `data.review` when it is well formed; null otherwise. */
export function reviewOf(value: unknown): CaseReview | null {
  if (!isObject(value)) return null;
  const state = value.state;
  if (state !== "pending" && state !== "changesRequested" && state !== "returned" && state !== "approved") return null;
  return value as unknown as CaseReview;
}

/** `data.approval` when it is well formed; null otherwise. */
export function approvalOf(value: unknown): CaseApproval | null {
  if (!isObject(value) || typeof value.by !== "string" || typeof value.at !== "string") return null;
  return { selfApproved: false, byName: "", version: "", revision: 0, ...value } as CaseApproval;
}

/** A reviewer asked for changes, still unanswered (PLN-08); or, from a
 *  0.5.0 beta, the draft came back from review. */
export const isReturned = (status: string, review: CaseReview | null): boolean =>
  (status === "reviewed" && review?.state === "changesRequested") ||
  (status === "draft" && review?.state === "returned");

/** Changes were saved after a «Pedir cambios»: ready to approve again. */
export const changesMade = (status: string, review: CaseReview | null): boolean =>
  status === "reviewed" && review?.state === "pending" && !!review.comment;

/** The transitions a case's status allows. Approving also needs the
 *  approver check (`approver.ts`). */
export function allowedActions(status: string): ReviewAction[] {
  switch (status) {
    case "draft":
      return ["send", "obsolete"];
    case "reviewed":
      return ["approve", "return", "obsolete"];
    case "approved":
      return ["obsolete"];
    case "obsolete":
      return ["reactivate"];
    default:
      return [];
  }
}

// ------------------------------------------------------------------ content

/** Keys of `data` outside the content of a case (ADR-0047): changing them
 *  never sends an approved case back to draft. */
const NOT_CONTENT = new Set(["review", "approval", "aiProvenance", "custom"]);

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (isObject(v)) return Object.keys(v).length === 0;
  return false;
}

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

/** The content of a case's `data` as one comparable text. */
export function contentKey(title: string, data: unknown): string {
  const out: Record<string, unknown> = {};
  if (isObject(data)) {
    for (const [k, v] of Object.entries(data)) if (!NOT_CONTENT.has(k) && !isEmpty(v)) out[k] = v;
  }
  return `${title.trim()}\u0000${canonical(out)}`;
}

/** True when saving `next` over `prev` changes the content: a case in review
 *  or approved would stay in or go back to review (the cores apply the same
 *  rule, PLN-08). */
export const contentChanged = (
  prev: { title: string; data: unknown },
  next: { title: string; data: unknown },
): boolean => contentKey(prev.title, prev.data) !== contentKey(next.title, next.data);

/** The error a review command answered (desktop text or server code), as a
 *  translation key. */
export function reviewErrorKey(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  if (/not[-_]allowed/.test(text)) return "testCase.review.errors.notAllowed";
  if (/comment[-_]required/.test(text)) return "testCase.review.errors.comment";
  if (/invalid[-_]transition|stale|409/.test(text)) return "testCase.review.errors.transition";
  return "testCase.review.errors.generic";
}
