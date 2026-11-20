import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type {
  PlanHistorySource,
  RevisionDetail,
  RevisionSummary,
  TestPlan,
  TestPlanInput,
  TestPlanSummary,
} from "../model/types";
import { planReviewOf, type PlanReviewAction } from "../model/review";
import { PLAN_REVIEW_EVENT, type PlanReviewEvent } from "../model/events";

/** «Aprobar» and «Pedir cambios» told to the notifications (FIX-43), as a
 *  case's review is (`PLAN_REVIEW_EVENT`): from the plan as stored. */
function announcePlanReview(saved: TestPlan, input: { action: PlanReviewAction; userId: string }) {
  const kind = input.action === "approve" ? "approved" : input.action === "return" ? "returned" : null;
  if (!kind) return;
  const review = planReviewOf(saved.data?.review);
  const approval = saved.data?.approval ?? null;
  const at = (kind === "approved" ? approval?.at : review?.returnedAt) ?? new Date().toISOString();
  const detail: PlanReviewEvent = {
    kind,
    planId: saved.id,
    title: saved.title,
    version: saved.version,
    projectId: saved.projectId ?? "",
    workspaceId: saved.workspaceId,
    authorId: saved.createdBy ?? "",
    actorId: input.userId,
    at,
    revision: saved.revision,
    ...(kind === "returned" && review?.comment ? { comment: review.comment } : {}),
    ...(kind === "approved" ? { selfApproval: approval?.selfApproved ?? false } : {}),
  };
  window.dispatchEvent(new CustomEvent(PLAN_REVIEW_EVENT, { detail }));
}

const path = (id: string) => `/api/test-plans/${encodeURIComponent(id)}`;

// The desktop reads and writes its encrypted local store (Rust); the web is a
// client of the server, which applies the same rules (BASE-10, ADR-0004).
// `userId` is the signed-in user: only plans of projects that user owns are
// returned or changed (FIX-08; on the web the server takes it from the
// session). Revision history stays on the desktop (SYNC-04b): the web has none.
export const testPlanApi = {
  list: (userId: string): Promise<TestPlanSummary[]> =>
    isTauri() ? invoke("test_plan_list", { userId }) : serverApi.get("/api/test-plans"),
  get: (id: string, userId: string): Promise<TestPlan | null> =>
    isTauri() ? invoke("test_plan_get", { id, userId }) : serverApi.get(path(id)),
  byProject: (projectId: string, userId: string): Promise<TestPlan | null> =>
    isTauri()
      ? invoke("test_plan_by_project", { projectId, userId })
      : serverApi.get(`/api/test-plans?projectId=${encodeURIComponent(projectId)}`),
  create: (input: TestPlanInput): Promise<TestPlan | null> =>
    isTauri() ? invoke("test_plan_create", { input }) : serverApi.post("/api/test-plans", input),
  update: (id: string, input: TestPlanInput): Promise<TestPlan | null> =>
    isTauri() ? invoke("test_plan_update", { id, input }) : serverApi.put(path(id), id, input),
  /** A review transition (PLN-08, ADR-0049): send, approve, «Pedir
   *  cambios» (`return`), obsolete, reactivate. The core decides who
   *  approves; the plan as it stands after it. */
  review: async (
    plan: Pick<TestPlan, "id" | "revision">,
    input: { action: PlanReviewAction; comment?: string; userId: string; userName: string },
  ): Promise<TestPlan | null> => {
    const saved: TestPlan | null = isTauri()
      ? await invoke("test_plan_review", { id: plan.id, input })
      : await serverApi.post(`${path(plan.id)}/review`, {
          action: input.action,
          comment: input.comment,
          userName: input.userName,
          revision: plan.revision,
        });
    if (saved) announcePlanReview(saved, input);
    return saved;
  },
  remove: (id: string, userId: string): Promise<void> =>
    isTauri() ? invoke("test_plan_delete", { id, userId }) : serverApi.remove(path(id), id),
  revisions: (id: string, userId: string): Promise<RevisionSummary[]> =>
    isTauri() ? invoke("test_plan_revisions", { id, userId }) : Promise.resolve([]),
  revisionDetail: (id: string, userId: string): Promise<RevisionDetail | null> =>
    isTauri() ? invoke("test_plan_revision_get", { id, userId }) : Promise.resolve(null),
  /** What the exported plan's revision history is built from (PLN-02):
   *  on the web, only the audit events (no revision copies). */
  history: (id: string, userId: string): Promise<PlanHistorySource | null> =>
    isTauri() ? invoke("test_plan_history", { id, userId }) : serverApi.get(`${path(id)}/history`),
};
