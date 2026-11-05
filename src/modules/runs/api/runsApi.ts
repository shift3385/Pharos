import { desktopOnly } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type {
  Configuration,
  ExecutionAttachment,
  ReportImportOutcome,
  ReportImportPreview,
  ReportImportRequest,
  ResultInput,
  ResultView,
  Run,
  RunCounts,
  RunInput,
  RunItem,
  RunItemDetail,
  RunItemInput,
  RunOverview,
  UnlinkedTest,
} from "@shared/contracts/contract";
import type { SaveResult } from "@shared/export/saveFile";

// Runs and imports live on the desktop (EJE-01, ING-02..05): the server keeps
// their documents but has no API for them until INT-02 (0.5.0), so the web
// lists nothing and cannot import.

/** Bytes per upload call: a file is sent in raw chunks, never whole (the
 *  same protocol as the planner's attachments, `evidence_upload_*`). */
export const UPLOAD_CHUNK = 4 * 1024 * 1024;

/** Sends `file` to the evidence store in raw chunks; returns the upload id. */
async function upload(file: Blob): Promise<string> {
  const uploadId = await invoke<string>("evidence_upload_begin", {
    size: file.size,
  });
  try {
    for (let offset = 0; offset < file.size; offset += UPLOAD_CHUNK) {
      const chunk = new Uint8Array(
        await file.slice(offset, offset + UPLOAD_CHUNK).arrayBuffer(),
      );
      await invoke("evidence_upload_chunk", chunk, {
        headers: { "x-pharos-upload": uploadId },
      });
    }
  } catch (e) {
    await invoke("evidence_upload_cancel", { uploadId }).catch(() => undefined);
    throw e;
  }
  return uploadId;
}

export const runsApi = {
  list: (projectId: string, userId: string): Promise<Run[]> =>
    isTauri() ? invoke("run_list", { projectId, userId }) : Promise.resolve([]),
  results: (runId: string, userId: string): Promise<ResultView[]> =>
    isTauri() ? invoke("results_list", { runId, userId }) : Promise.resolve([]),
  /** Final results by status of every run of the project, in one call. */
  counts: (projectId: string, userId: string): Promise<RunCounts[]> =>
    isTauri()
      ? invoke("run_counts_list", { projectId, userId })
      : Promise.resolve([]),
  unlinked: (projectId: string, userId: string): Promise<UnlinkedTest[]> =>
    isTauri()
      ? invoke("unlinked_tests_list", { projectId, userId })
      : Promise.resolve([]),
  /** Links (or with null, unlinks) every result of a `test_key` (ING-05). */
  link: (
    projectId: string,
    testKey: string,
    testCaseId: string | null,
    userId: string,
  ): Promise<string> =>
    isTauri()
      ? invoke("unlinked_mapping_set", {
          projectId,
          testKey,
          testCaseId,
          userId,
        })
      : desktopOnly("attachments"),
  preview: (request: ReportImportRequest): Promise<ReportImportPreview> =>
    isTauri()
      ? invoke("run_import_preview", { request })
      : desktopOnly("attachments"),
  /** Sends the report file as the raw report, then commits the import. */
  importReport: async (
    request: ReportImportRequest,
    file: Blob,
  ): Promise<ReportImportOutcome> => {
    if (!isTauri()) return desktopOnly("attachments");
    const rawUploadId = await upload(file);
    return invoke("run_import", { request, rawUploadId });
  },
  /** One attachment of an imported report, to its result or step result. */
  attach: async (
    ownerEntity: string,
    ownerId: string,
    file: Blob,
    name: string,
    mime: string | undefined,
    kind: string | undefined,
    userId: string,
  ): Promise<string> => {
    if (!isTauri()) return desktopOnly("attachments");
    const uploadId = await upload(file);
    return invoke("run_import_attach", {
      ownerEntity,
      ownerId,
      uploadId,
      name,
      mime: mime ?? null,
      kind: kind ?? null,
      userId,
    });
  },

  // ---- manual execution (EJE-02, desktop only; the web reads nothing) ----

  /** The run screen in one call: header, items with progress, counts. */
  overview: (runId: string, userId: string): Promise<RunOverview | null> =>
    isTauri() ? invoke("run_overview", { runId, userId }) : Promise.resolve(null),
  /** One item for the executor: frozen revision, targets, attempts, draft. */
  itemDetail: (runItemId: string, userId: string): Promise<RunItemDetail | null> =>
    isTauri()
      ? invoke("run_item_detail", { runItemId, userId })
      : Promise.resolve(null),
  /** A manual run over the chosen cases (design §4, step 1). */
  createManual: async (
    input: RunInput,
    items: RunItemInput[],
  ): Promise<Run | null> => {
    if (!isTauri()) return desktopOnly("attachments");
    const run = await invoke<Run | null>("run_create", {
      input: { ...input, trigger: "manual" },
    });
    if (run && items.length > 0) {
      await invoke("run_items_add", { runId: run.id, userId: input.userId, items });
    }
    return run;
  },
  /** The project's live configurations, to give a manual run its context. */
  configurations: (projectId: string, userId: string): Promise<Configuration[]> =>
    isTauri()
      ? invoke("configuration_list", { projectId, userId, includeArchived: false })
      : Promise.resolve([]),
  addItems: (runId: string, userId: string, items: RunItemInput[]): Promise<RunItem[]> =>
    isTauri()
      ? invoke("run_items_add", { runId, userId, items })
      : desktopOnly("attachments"),
  /** Edits the header, closes (`completed`/`aborted`) or reopens
   *  (`in_progress`) a run. `context` is left out so it keeps its value. */
  update: (
    id: string,
    input: Omit<RunInput, "context">,
  ): Promise<Run | null> =>
    isTauri()
      ? invoke("run_update", { id, input })
      : desktopOnly("attachments"),
  draftSave: (
    runItemId: string,
    targetKey: string,
    state: unknown,
    userId: string,
  ): Promise<void> =>
    isTauri()
      ? invoke("execution_draft_save", { runItemId, targetKey, state, userId })
      : Promise.resolve(),
  draftDiscard: (runItemId: string, targetKey: string, userId: string): Promise<void> =>
    isTauri()
      ? invoke("execution_draft_discard", { runItemId, targetKey, userId })
      : Promise.resolve(),
  /** Records the attempt from its draft; returns the result id. */
  record: (input: ResultInput): Promise<string> =>
    isTauri() ? invoke("execution_record", { input }) : desktopOnly("attachments"),
  /** A file (or pasted capture) for a draft's target, or one of its steps. */
  attachToDraft: async (
    runItemId: string,
    targetKey: string,
    stepId: string | null,
    file: Blob,
    name: string,
    kind: "evidence" | "screenshot",
    userId: string,
  ): Promise<ExecutionAttachment> => {
    if (!isTauri()) return desktopOnly("attachments");
    const uploadId = await upload(file);
    return invoke("execution_attach", {
      runItemId,
      targetKey,
      stepId,
      uploadId,
      name,
      mime: file.type || null,
      kind,
      userId,
    });
  },
  deleteDraftAttachment: (id: string, userId: string): Promise<void> =>
    isTauri()
      ? invoke("execution_attachment_delete", { id, userId })
      : desktopOnly("attachments"),
  saveAttachment: (id: string, userId: string): Promise<SaveResult> =>
    isTauri()
      ? invoke("execution_attachment_save", { id, userId })
      : desktopOnly("attachments"),
  /** A `data:` URL for an image's thumbnail, or null. */
  previewAttachment: (id: string, userId: string): Promise<string | null> =>
    isTauri()
      ? invoke("execution_attachment_preview", { id, userId })
      : Promise.resolve(null),
};
