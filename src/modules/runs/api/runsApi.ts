import { desktopOnly, serverApi } from "@modules/sync-offline";
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
import { webDrafts } from "../model/webDrafts";

// Runs on the desktop (EJE-01, EJE-02) and, since EJE-06, on the web through
// the server's runs API (`/api/runs`, `/api/run-items`, `/api/results`),
// which writes the same documents. On the web the execution drafts are this
// browser's (`model/webDrafts.ts`), and files stay on the desktop (SYNC-04b):
// imports, the «Sin vincular» tray and attachments are desktop only.

const enc = encodeURIComponent;
/** The run of each item this page has read (web drafts are kept by run). */
const runOfItem = new Map<string, string>();
const targetKeyOf = (flowId: string | null | undefined, rowId: string | null | undefined) =>
  `${flowId ?? "-"}/${rowId ?? "-"}`;

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
    isTauri()
      ? invoke("run_list", { projectId, userId })
      : serverApi.get(`/api/runs?projectId=${enc(projectId)}`),
  results: (runId: string, userId: string): Promise<ResultView[]> =>
    isTauri()
      ? invoke("results_list", { runId, userId })
      : serverApi.get(`/api/runs/${enc(runId)}/results`),
  /** Final results by status of every run of the project, in one call. */
  counts: (projectId: string, userId: string): Promise<RunCounts[]> =>
    isTauri()
      ? invoke("run_counts_list", { projectId, userId })
      : serverApi.get(`/api/runs/counts?projectId=${enc(projectId)}`),
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

  // ---- manual execution (EJE-02; on the web since EJE-06) ----

  /** The run screen in one call: header, items with progress, counts. On
   *  the web, `hasDraft` is this browser's. */
  overview: async (runId: string, userId: string): Promise<RunOverview | null> => {
    if (isTauri()) return invoke("run_overview", { runId, userId });
    const o = await serverApi.get<RunOverview | null>(`/api/runs/${enc(runId)}/overview`);
    // A run gone (deleted elsewhere) or cancelled keeps no drafts here.
    if (!o || o.run.status === "aborted") webDrafts.dropRun(userId, runId);
    if (!o) return o;
    return {
      ...o,
      items: o.items.map((i) => {
        runOfItem.set(i.item.id, runId);
        return { ...i, hasDraft: webDrafts.has(userId, i.item.id) };
      }),
    };
  },
  /** One item for the executor: frozen revision, targets, attempts, draft.
   *  On the web the draft is this browser's and there are no files. */
  itemDetail: async (runItemId: string, userId: string): Promise<RunItemDetail | null> => {
    if (isTauri()) return invoke("run_item_detail", { runItemId, userId });
    const d = await serverApi.get<RunItemDetail | null>(`/api/run-items/${enc(runItemId)}`);
    if (!d) {
      webDrafts.forget(userId, runItemId);
      return d;
    }
    runOfItem.set(runItemId, d.item.runId);
    if (d.runStatus === "aborted") webDrafts.dropRun(userId, d.item.runId);
    webDrafts.noteRecorded(runItemId, d.results.map((r) => r.id));
    return { ...d, draft: webDrafts.load(userId, runItemId) };
  },
  /** A manual run over the chosen cases (design §4, step 1): the run and
   *  its items in one transaction, so a refused case leaves no empty run. */
  createManual: (input: RunInput, items: RunItemInput[]): Promise<Run | null> =>
    isTauri()
      ? invoke("run_create_manual", { input, items })
      : serverApi.post("/api/runs", { input, items }),
  /** The project's live configurations, to give a manual run its context. */
  configurations: (projectId: string, userId: string): Promise<Configuration[]> =>
    isTauri()
      ? invoke("configuration_list", { projectId, userId, includeArchived: false })
      : serverApi.get(`/api/configurations?projectId=${enc(projectId)}`),
  addItems: (runId: string, userId: string, items: RunItemInput[]): Promise<RunItem[]> =>
    isTauri()
      ? invoke("run_items_add", { runId, userId, items })
      : serverApi.post(`/api/runs/${enc(runId)}/items`, { items }),
  /** Edits the header, closes (`completed`/`aborted`) or reopens
   *  (`in_progress`) a run. `context` is left out so it keeps its value. */
  update: (
    id: string,
    input: Omit<RunInput, "context">,
  ): Promise<Run | null> =>
    isTauri()
      ? invoke("run_update", { id, input })
      : serverApi.put(`/api/runs/${enc(id)}`, id, input),
  /** Closes a run; `aborted` (or `discardDrafts`) also discards its drafts
   *  and their files. */
  close: async (
    runId: string,
    status: "completed" | "aborted",
    discardDrafts: boolean,
    userId: string,
  ): Promise<Run | null> => {
    if (isTauri()) return invoke("run_close", { runId, status, discardDrafts, userId });
    const run = await serverApi.post<Run | null>(`/api/runs/${enc(runId)}/close`, { status });
    if (status === "aborted" || discardDrafts) webDrafts.dropRun(userId, runId);
    return run;
  },
  draftSave: (
    runItemId: string,
    targetKey: string,
    state: unknown,
    userId: string,
  ): Promise<void> => {
    if (isTauri()) return invoke("execution_draft_save", { runItemId, targetKey, state, userId });
    // Synchronous: a refused save throws before anything else runs.
    try {
      webDrafts.save(userId, runOfItem.get(runItemId) ?? "", runItemId, targetKey, state as Record<string, unknown>);
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  },
  draftDiscard: (runItemId: string, targetKey: string, userId: string): Promise<void> => {
    if (isTauri()) return invoke("execution_draft_discard", { runItemId, targetKey, userId });
    webDrafts.discard(userId, runItemId, targetKey);
    return Promise.resolve();
  },
  /** Records the attempt from its draft; returns the result id. On the web
   *  the server makes it idempotent by its `attemptId`; the browser checks
   *  the draft first and drops the target after, as the desktop does. */
  record: async (input: ResultInput): Promise<string> => {
    if (isTauri()) return invoke("execution_record", { input });
    const key = targetKeyOf(input.flowId, input.exampleRowId);
    webDrafts.checkRecordable(input.userId, input.runItemId, key, input.attemptId ?? "");
    const { id } = await serverApi.post<{ id: string }>("/api/results", { input });
    webDrafts.recorded(input.userId, input.runItemId, key, id);
    return id;
  },
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
