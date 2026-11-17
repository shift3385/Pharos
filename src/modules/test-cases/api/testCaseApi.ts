import { reserveKeys, serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type {
  RevisionSummary,
  TestCase,
  TestCaseInput,
  TestCaseSummary,
} from "../model/types";
import type { TestCaseRevisionDetail } from "@shared/contracts/contract";
import {
  announceCasesChanged,
  emitCaseReview,
  type BatchOptions,
  type CaseReviewEvent,
} from "../model/events";
import { approvalOf, reviewOf, type ReviewAction } from "../model/review";

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
  /** A review transition (CAS-02, ADR-0047). Once the store accepted it,
   *  «sent», «approved» and «returned» are announced (`onCaseReview`). */
  review: async (
    testCase: Pick<TestCase, "id" | "revision">,
    input: { action: ReviewAction; comment?: string; userId: string; userName: string },
  ): Promise<TestCase | null> => {
    const saved: TestCase | null = isTauri()
      ? await invoke("test_case_review", { id: testCase.id, input })
      : await serverApi.post(`${path(testCase.id)}/review`, {
          action: input.action,
          comment: input.comment,
          userName: input.userName,
          revision: testCase.revision,
        });
    if (saved) announceReview(saved, input);
    return saved;
  },
  /** The earlier state a reviewer compares the case with: the latest one
   *  approved or sent to review (CAS-02). */
  reviewBase: (id: string, userId: string): Promise<TestCaseRevisionDetail | null> =>
    isTauri()
      ? invoke("test_case_review_base", { id, userId })
      : serverApi.get(`${path(id)}/review-base`),
};

const EVENT_KIND: Partial<Record<ReviewAction, CaseReviewEvent["kind"]>> = {
  send: "sent",
  approve: "approved",
  return: "returned",
};

/** The notifications contract (`CASE_REVIEW_EVENT`), from the stored case. */
function announceReview(saved: TestCase, input: { action: ReviewAction; comment?: string; userId: string; userName: string }) {
  const kind = EVENT_KIND[input.action];
  if (!kind) return;
  const data = (saved.data ?? {}) as Record<string, unknown>;
  const review = reviewOf(data.review);
  const approval = approvalOf(data.approval);
  const at = (kind === "approved" ? approval?.at : kind === "returned" ? review?.returnedAt : review?.sentAt) ?? new Date().toISOString();
  const comment = kind === "sent" ? review?.note : kind === "returned" ? review?.comment : undefined;
  emitCaseReview({
    kind,
    caseId: saved.id,
    scenarioId: saved.scenarioId,
    title: saved.title,
    projectId: saved.projectId ?? "",
    authorId: saved.createdBy,
    actorId: input.userId,
    actorName: input.userName,
    at,
    version: saved.version,
    revision: saved.revision,
    ...(comment ? { comment } : {}),
    ...(kind === "approved" ? { selfApproval: approval?.selfApproved ?? false } : {}),
  });
}
