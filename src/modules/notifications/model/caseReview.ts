// K's case review events (CAS-02) as notifications (RED-W2). K fires
// `pharos:case-review` on `window` after the local write commits
// (`onCaseReview` in `@modules/test-cases`); the shell listens for it by name,
// so this module does not depend on K's.
import type { NotifyInput } from "./types";

export const CASE_REVIEW_EVENT = "pharos:case-review";

/** K's payload (agreed contract). */
export interface CaseReviewEvent {
  kind: "sent" | "approved" | "returned";
  caseId: string;
  scenarioId: string;
  title: string;
  projectId: string;
  authorId: string;
  actorId: string;
  actorName: string;
  at: string;
  version: string;
  /** The case's revision after the transition: goes up on every write. */
  revision: number;
  comment?: string;
  selfApproval?: boolean;
}

/** The notification of a review event, or null when nobody else is to be
 *  told (a self-approval, or the author acting on their own case). */
export function notificationOfReview(e: CaseReviewEvent): NotifyInput | null {
  if (e.selfApproval) return null;
  const subject = { entity: "test_case", id: e.caseId, key: e.scenarioId, title: e.title };
  const data: Record<string, unknown> = { version: e.version, at: e.at };
  const base = { projectId: e.projectId, subject, data };
  switch (e.kind) {
    case "sent":
      // To the reviewers; until roles exist, the workspace (without the sender).
      return { ...base, kind: "case.review_requested", to: { workspace: true }, dedupeKey: key(e, "case.review_requested") };
    case "approved":
      if (e.actorId === e.authorId) return null;
      return { ...base, kind: "case.approved", to: { userIds: [e.authorId] }, dedupeKey: key(e, "case.approved") };
    case "returned":
      if (e.actorId === e.authorId) return null;
      return {
        ...base,
        kind: "case.changes_requested",
        to: { userIds: [e.authorId] },
        data: { ...data, ...(e.comment ? { comment: e.comment.slice(0, 1000) } : {}) },
        dedupeKey: key(e, "case.changes_requested"),
      };
    default:
      return null;
  }
}

// `revision`, not `version`: sending, returning and sending again keeps the
// version, and the second «sent» must not be taken for the first.
const key = (e: CaseReviewEvent, kind: string) => `${e.caseId}:${e.revision}:${kind}`;

const isEvent = (v: unknown): v is CaseReviewEvent =>
  !!v &&
  typeof v === "object" &&
  typeof (v as CaseReviewEvent).caseId === "string" &&
  typeof (v as CaseReviewEvent).kind === "string" &&
  typeof (v as CaseReviewEvent).revision === "number";

/** The payload of a `pharos:case-review` event, if it is one. */
export const reviewEventOf = (e: Event): CaseReviewEvent | null => {
  const detail = (e as CustomEvent<unknown>).detail;
  return isEvent(detail) ? detail : null;
};
