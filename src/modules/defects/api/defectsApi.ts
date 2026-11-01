import { desktopOnly, serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type { SaveResult } from "@shared/export/saveFile";
import type {
  Defect,
  DefectAttachment,
  DefectInput,
  DefectResolution,
  DefectStatus,
  LinkTarget,
  ResultCandidate,
} from "../model/types";

const path = (id: string) => `/api/defects/${encodeURIComponent(id)}`;

// The desktop reads and writes its encrypted local store (defects in the
// database, attachment contents in the evidence store, ADR-0014); the web is
// a client of the server, which applies the same rules (BASE-10, ADR-0004):
// the DEF series, the lifecycle, links with deterministic ids. Attachments
// and «create from a result» stay on the desktop (SYNC-04b): the evidence of
// a result lives there.

/** Largest attachment (ADR-0014; the Rust side enforces it too). */
export const MAX_ATTACHMENT_MB = 200;
const UPLOAD_CHUNK = 4 * 1024 * 1024;

async function upload(file: Blob): Promise<string> {
  const uploadId = await invoke<string>("evidence_upload_begin", { size: file.size });
  try {
    for (let offset = 0; offset < file.size; offset += UPLOAD_CHUNK) {
      const chunk = new Uint8Array(await file.slice(offset, offset + UPLOAD_CHUNK).arrayBuffer());
      await invoke("evidence_upload_chunk", chunk, { headers: { "x-pharos-upload": uploadId } });
    }
  } catch (e) {
    await invoke("evidence_upload_cancel", { uploadId }).catch(() => undefined);
    throw e;
  }
  return uploadId;
}

export const defectsApi = {
  list: (projectId: string, userId: string): Promise<Defect[]> =>
    isTauri()
      ? invoke("defect_list", { projectId, userId })
      : serverApi.get(`/api/defects?projectId=${encodeURIComponent(projectId)}`),
  get: (id: string, userId: string): Promise<Defect | null> =>
    isTauri() ? invoke("defect_get", { id, userId }) : serverApi.get(path(id)),
  create: (input: DefectInput): Promise<Defect | null> =>
    isTauri() ? invoke("defect_create", { input }) : serverApi.post("/api/defects", input),
  update: (id: string, input: DefectInput): Promise<Defect | null> =>
    isTauri() ? invoke("defect_update", { id, input }) : serverApi.put(path(id), id, input),
  transition: (
    id: string,
    userId: string,
    status: DefectStatus,
    resolution?: DefectResolution | null,
    fixedInBuild?: string | null,
  ): Promise<Defect | null> =>
    isTauri()
      ? invoke("defect_transition", { id, userId, status, resolution, fixedInBuild })
      : serverApi.post(`${path(id)}/transition`, { status, resolution, fixedInBuild }),
  remove: (id: string, userId: string): Promise<void> =>
    isTauri() ? invoke("defect_delete", { id, userId }) : serverApi.remove(path(id), id),
  link: (defectId: string, userId: string, target: LinkTarget, linked: boolean): Promise<Defect | null> =>
    isTauri()
      ? invoke("defect_link_set", { defectId, userId, target, linked })
      : serverApi.post(`${path(defectId)}/links`, { target, linked }),
  /** The editor's prefill for a defect created from a failed result. */
  draftFromResult: async (resultId: string, userId: string, stepId?: string): Promise<DefectInput> =>
    isTauri()
      ? invoke("defect_draft_from_result", { resultId, stepId: stepId ?? null, userId })
      : desktopOnly("results"),
  /** The project's failed attempts, newest first (desktop: results live there
   *  until the API queries them, INT-02). */
  results: (projectId: string, userId: string): Promise<ResultCandidate[]> =>
    isTauri() ? invoke("defect_result_list", { projectId, userId }) : Promise.resolve([]),
  attachmentAdd: async (defectId: string, userId: string, file: File): Promise<DefectAttachment | null> => {
    if (!isTauri()) return desktopOnly("attachments");
    const uploadId = await upload(file);
    return invoke("defect_attachment_add", { defectId, userId, uploadId, name: file.name, mime: file.type || null });
  },
  attachmentList: (defectId: string, userId: string): Promise<DefectAttachment[]> =>
    isTauri() ? invoke("defect_attachment_list", { defectId, userId }) : Promise.resolve([]),
  attachmentSave: async (id: string, userId: string): Promise<SaveResult> =>
    isTauri() ? invoke("defect_attachment_save", { id, userId }) : desktopOnly("attachments"),
  attachmentDelete: async (id: string, userId: string): Promise<void> =>
    isTauri() ? invoke("defect_attachment_delete", { id, userId }) : desktopOnly("attachments"),
};

/** Live defects of a project (the traceability matrix, the dashboard). */
export const projectDefects = (projectId: string, userId: string): Promise<Defect[]> =>
  defectsApi.list(projectId, userId);
