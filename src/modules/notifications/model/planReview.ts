// The plan's review events (PLN-08) as notifications (FIX-43), as a case's
// (`caseReview.ts`): «Pedir cambios» and «Aprobar» by someone else tell the
// plan's author. The plan module fires `pharos:plan-review` on `window` after
// the store accepted the transition (`testPlanApi.review`); the shell listens
// for it by name, so this module does not depend on the plan's.
import type { NotifyInput } from "./types";

export const PLAN_REVIEW_EVENT = "pharos:plan-review";

export interface PlanReviewEvent {
  kind: "approved" | "returned";
  planId: string;
  title: string;
  version: string;
  projectId: string;
  workspaceId?: string;
  /** The account that created the plan: its author in the review flow. */
  authorId: string;
  actorId: string;
  at: string;
  /** The plan's revision after the transition. */
  revision: number;
  comment?: string;
  selfApproval?: boolean;
}

/** The notification of a plan review event, or null when nobody else is to
 *  be told (a self-approval, the author acting on their own plan, or an
 *  author the store does not know). */
export function notificationOfPlanReview(e: PlanReviewEvent): NotifyInput | null {
  if (e.selfApproval || !e.authorId || e.actorId === e.authorId) return null;
  const subject = { entity: "test_plan", id: e.planId, title: e.title };
  const data: Record<string, unknown> = { version: e.version, at: e.at };
  const base = { projectId: e.projectId, workspaceId: e.workspaceId ?? null, subject, to: { userIds: [e.authorId] } };
  return e.kind === "approved"
    ? { ...base, kind: "plan.approved", data, dedupeKey: `${e.planId}:${e.revision}:plan.approved` }
    : {
        ...base,
        kind: "plan.changes_requested",
        data: { ...data, ...(e.comment ? { comment: e.comment.slice(0, 1000) } : {}) },
        dedupeKey: `${e.planId}:${e.revision}:plan.changes_requested`,
      };
}

const isEvent = (v: unknown): v is PlanReviewEvent =>
  !!v &&
  typeof v === "object" &&
  typeof (v as PlanReviewEvent).planId === "string" &&
  typeof (v as PlanReviewEvent).kind === "string" &&
  typeof (v as PlanReviewEvent).revision === "number";

/** The payload of a `pharos:plan-review` event, if it is one. */
export const planReviewEventOf = (e: Event): PlanReviewEvent | null => {
  const detail = (e as CustomEvent<unknown>).detail;
  return isEvent(detail) ? detail : null;
};
