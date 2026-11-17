/** Fired on `window` after a case is created or deleted, so the project
 *  header reloads its «N casos» count at once (FIX-13; projects composes
 *  test-cases and listens). */
export const CASES_CHANGED_EVENT = "pharos:cases-changed";

/** Tells the listeners that the project's cases changed. A single create or
 *  delete does it itself (`testCaseApi`); a loop over many cases passes
 *  `{ quiet: true }` to each call and announces once at the end, so the
 *  header reloads once per batch however slow each call is. */
export function announceCasesChanged(): void {
  window.dispatchEvent(new Event(CASES_CHANGED_EVENT));
}

/** Option of `testCaseApi.create/remove` for the calls of a batch. */
export interface BatchOptions {
  /** Do not announce this change: the batch announces once when done. */
  quiet?: boolean;
}

/** Fired on `window` (a `CustomEvent` whose `detail` is a `CaseReviewEvent`)
 *  after the store accepted a review transition (CAS-02, ADR-0047). The
 *  notifications track (RED-W2) listens through `onCaseReview`. The name and
 *  the payload are a stable contract: add fields, never rename or drop one. */
export const CASE_REVIEW_EVENT = "pharos:case-review";

export interface CaseReviewEvent {
  kind: "sent" | "approved" | "returned";
  caseId: string;
  /** The case key (ATS-014). */
  scenarioId: string;
  title: string;
  projectId: string;
  /** The workspace of the case, so a listener can find its members. */
  workspaceId: string;
  /** The account that created the case. */
  authorId: string;
  /** Who sent, approved or returned it. */
  actorId: string;
  actorName: string;
  /** When (ISO). */
  at: string;
  version: string;
  /** The case's revision after the transition: with `caseId` and `kind`, a
   *  key that tells two events apart (a case sent, returned and sent again
   *  keeps its version). */
  revision: number;
  /** The note to the reviewer (sent) or why it came back (returned). */
  comment?: string;
  /** Approved by its author, alone in the workspace. */
  selfApproval?: boolean;
}

/** Announces a review transition the store already wrote. */
export function emitCaseReview(event: CaseReviewEvent): void {
  window.dispatchEvent(new CustomEvent<CaseReviewEvent>(CASE_REVIEW_EVENT, { detail: event }));
}

/** Calls `listener` for each review transition; returns the unsubscribe. */
export function onCaseReview(listener: (event: CaseReviewEvent) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<CaseReviewEvent>).detail);
  window.addEventListener(CASE_REVIEW_EVENT, handler);
  return () => window.removeEventListener(CASE_REVIEW_EVENT, handler);
}
