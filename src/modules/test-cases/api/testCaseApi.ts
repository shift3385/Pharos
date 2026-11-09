import { reserveKeys, serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type {
  RevisionSummary,
  TestCase,
  TestCaseInput,
  TestCaseSummary,
} from "../model/types";
import type { TestCaseRevisionDetail } from "@shared/contracts/contract";
import { announceCasesChanged, type BatchOptions } from "../model/events";

/** Announces a created or deleted case once the store has it (FIX-13),
 *  unless it is one call of a batch that announces once at the end. */
function announced<T>(change: Promise<T>, options?: BatchOptions): Promise<T> {
  return change.then((result) => {
    if (!options?.quiet) announceCasesChanged();
    return result;
  });
}

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
  create: (input: TestCaseInput, options?: BatchOptions): Promise<TestCase | null> =>
    announced(
      isTauri()
        ? (input.scenarioId?.trim() ? Promise.resolve() : reserveKeys(input.projectId, "case")).then(() =>
            invoke<TestCase | null>("test_case_create", { input }),
          )
        : serverApi.post("/api/test-cases", input),
      options,
    ),
  update: (id: string, input: TestCaseInput): Promise<TestCase | null> =>
    isTauri() ? invoke("test_case_update", { id, input }) : serverApi.put(path(id), id, input),
  remove: (id: string, userId: string, options?: BatchOptions): Promise<void> =>
    announced(
      isTauri() ? invoke("test_case_delete", { id, userId }) : serverApi.remove(path(id), id),
      options,
    ),
  revisions: (id: string, userId: string): Promise<RevisionSummary[]> =>
    isTauri() ? invoke("test_case_revisions", { id, userId }) : Promise.resolve([]),
  /** One revision's content, to restore it in the editor (NC-018). */
  revisionDetail: (id: string, userId: string): Promise<TestCaseRevisionDetail | null> =>
    isTauri() ? invoke("test_case_revision_get", { id, userId }) : Promise.resolve(null),
};
