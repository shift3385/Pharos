import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type {
  RevisionDetail,
  RevisionSummary,
  TestPlan,
  TestPlanInput,
  TestPlanSummary,
} from "../model/types";

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
  remove: (id: string, userId: string): Promise<void> =>
    isTauri() ? invoke("test_plan_delete", { id, userId }) : serverApi.remove(path(id), id),
  revisions: (id: string, userId: string): Promise<RevisionSummary[]> =>
    isTauri() ? invoke("test_plan_revisions", { id, userId }) : Promise.resolve([]),
  revisionDetail: (id: string, userId: string): Promise<RevisionDetail | null> =>
    isTauri() ? invoke("test_plan_revision_get", { id, userId }) : Promise.resolve(null),
};
