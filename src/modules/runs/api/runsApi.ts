import { desktopOnly } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type {
  ReportImportOutcome,
  ReportImportPreview,
  ReportImportRequest,
  ResultView,
  Run,
  RunCounts,
  UnlinkedTest,
} from "@shared/contracts/contract";

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
};
