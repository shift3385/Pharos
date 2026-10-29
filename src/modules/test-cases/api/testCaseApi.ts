import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type {
  RevisionSummary,
  TestCase,
  TestCaseInput,
  TestCaseSummary,
} from "../model/types";

const path = (id: string) => `/api/test-cases/${encodeURIComponent(id)}`;

// The desktop reads and writes its encrypted local store (Rust); the web is a
// client of the server, which applies the same rules (BASE-10, ADR-0004): the
// project's key series, immutable scenario ids, keys never reused.
// `userId` is the signed-in user: only cases of projects that user owns are
// returned or changed (FIX-08; on the web the server takes it from the
// session). Revision history stays on the desktop (SYNC-04b): the web has none.
export const testCaseApi = {
  list: (projectId: string, userId: string): Promise<TestCaseSummary[]> =>
    isTauri()
      ? invoke("test_case_list", { projectId, userId })
      : serverApi.get(`/api/test-cases?projectId=${encodeURIComponent(projectId)}`),
  get: (id: string, userId: string): Promise<TestCase | null> =>
    isTauri() ? invoke("test_case_get", { id, userId }) : serverApi.get(path(id)),
  create: (input: TestCaseInput): Promise<TestCase | null> =>
    isTauri() ? invoke("test_case_create", { input }) : serverApi.post("/api/test-cases", input),
  update: (id: string, input: TestCaseInput): Promise<TestCase | null> =>
    isTauri() ? invoke("test_case_update", { id, input }) : serverApi.put(path(id), id, input),
  remove: (id: string, userId: string): Promise<void> =>
    isTauri() ? invoke("test_case_delete", { id, userId }) : serverApi.remove(path(id), id),
  revisions: (id: string, userId: string): Promise<RevisionSummary[]> =>
    isTauri() ? invoke("test_case_revisions", { id, userId }) : Promise.resolve([]),
};
