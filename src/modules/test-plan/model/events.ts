/** Fired on `window` after the plan wizard saves, so the project header
 *  reloads the plan status (projects composes test-plan and listens). */
export const PLAN_SAVED_EVENT = "pharos:plan-saved";

/** Fired on `window` after a plan's «Aprobar» or «Pedir cambios» is stored
 *  (FIX-43): the notifications tell the plan's author. The agreed contract
 *  of `@modules/notifications` (`model/planReview.ts`). */
export const PLAN_REVIEW_EVENT = "pharos:plan-review";

export interface PlanReviewEvent {
  kind: "approved" | "returned";
  planId: string;
  title: string;
  version: string;
  projectId: string;
  workspaceId?: string;
  authorId: string;
  actorId: string;
  at: string;
  revision: number;
  comment?: string;
  selfApproval?: boolean;
}
