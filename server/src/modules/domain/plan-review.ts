import { afterSave, statusOnCreate, stripReview } from "./case-review";

// Review flow of a test plan for the web (PLN-08, ADR-0049): the same flow
// as a case (`case-review.ts`), with the plan's own content. The desktop's
// `test_plan_review.rs` applies the same rules.

type Payload = Record<string, unknown>;

/** Keys of a plan's `data` that are not its content (PLN-03): the review
 *  records, the review marks of AI drafts and the document ID. The status,
 *  the date and the version are not in `data`. */
export const PLAN_NOT_CONTENT: ReadonlySet<string> = new Set(["review", "approval", "aiProvenance", "documentId"]);

const isObject = (v: unknown): v is Payload => typeof v === "object" && v !== null && !Array.isArray(v);

/** A new plan starts as draft (or obsolete), without review records. */
export function planOnCreate(status: string | undefined, data: unknown): { status: string; data: Payload } {
  return { status: statusOnCreate(status), data: stripReview(isObject(data) ? data : {}) };
}

/** What a plain save writes over a stored plan: the client never sets the
 *  status or the review records (see `afterSave`). */
export function planAfterSave(
  saved: Payload,
  title: string,
  version: string | undefined,
  data: unknown,
): { status: string; version: string; data: Payload } {
  return afterSave(
    {
      status: typeof saved.status === "string" ? saved.status : "draft",
      title: typeof saved.title === "string" ? saved.title : "",
      version: typeof saved.version === "string" ? saved.version : "1.0",
      data: saved.data,
    },
    title,
    version,
    isObject(data) ? data : {},
    PLAN_NOT_CONTENT,
  );
}
