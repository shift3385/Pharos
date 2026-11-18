// The review flow of a plan (PLN-08, ADR-0049), the same as a case's:
// Borrador → En revisión → Aprobado. Borrador is only the stage before the
// first «Enviar a revisión»; «Pedir cambios» and an edit keep the plan in
// review, and an edit of an approved plan sends it back to review with its
// next version. The desktop core (`test_plan.rs` with `case_review.rs`) and
// the server (`plan-review.ts`) enforce it; this module only reads what they
// stored and says what the screen may offer.

/** The tone of each plan status (the «Estado del plan» panel and the
 *  «Identificación» step). */
export const PLAN_STATUS_TONE: Record<string, "neutral" | "info" | "success"> = {
  draft: "neutral",
  reviewed: "info",
  approved: "success",
  obsolete: "neutral",
};

/** A transition the review command accepts (`return` is «Pedir cambios»). */
export const PLAN_REVIEW_ACTIONS = ["send", "approve", "return", "obsolete", "reactivate"] as const;
export type PlanReviewAction = (typeof PLAN_REVIEW_ACTIONS)[number];

/** `data.review`: the last submission and how it stands. */
export interface PlanReview {
  state: "pending" | "changesRequested" | "approved";
  sentBy?: string;
  sentByName?: string;
  sentAt?: string;
  version?: string;
  /** The note to the reviewer. */
  note?: string;
  returnedBy?: string;
  returnedByName?: string;
  returnedAt?: string;
  /** What has to change («Pedir cambios»). */
  comment?: string;
  /** The approved version an edit sent back to review. */
  reopenedFrom?: string;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** `data.review` when it is well formed; null otherwise. */
export function planReviewOf(value: unknown): PlanReview | null {
  if (!isObject(value)) return null;
  const state = value.state;
  if (state !== "pending" && state !== "changesRequested" && state !== "approved") return null;
  return value as unknown as PlanReview;
}

/** The transitions a plan's status allows. Approving also asks the
 *  approver check, and the core has the last word. */
export function planActions(status: string): PlanReviewAction[] {
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

/** A reviewer asked for changes that nobody has answered yet. */
export const changesRequested = (status: string, review: PlanReview | null): boolean =>
  status === "reviewed" && review?.state === "changesRequested";

/** Changes were saved after a «Pedir cambios». */
export const changesMade = (status: string, review: PlanReview | null): boolean =>
  status === "reviewed" && review?.state === "pending" && !!review.comment;

/** The error a review command answered (desktop text or server code), as a
 *  translation key. */
export function planReviewErrorKey(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  // Why the approver check refused: the desktop says «review-not-allowed:
  // author», the server «… cannot approve the plan (author).».
  const reason = /not[-_]allowed\W+(author|role|notMember)\b|\((author|role|notMember)\)/.exec(text);
  if (reason) return `testPlan.review.notAllowed.${reason[1] ?? reason[2]}`;
  if (/not[-_]allowed|403/.test(text)) return "testPlan.review.errors.notAllowed";
  if (/comment[-_]required/.test(text)) return "testPlan.review.errors.comment";
  if (/invalid[-_]transition|stale|409/.test(text)) return "testPlan.review.errors.transition";
  return "testPlan.review.errors.generic";
}
