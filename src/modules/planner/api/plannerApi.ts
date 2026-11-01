import { desktopOnly, serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type { SaveResult } from "@shared/export/saveFile";
import type {
  AttachmentSummary,
  CardStatus,
  PlannerCard,
  PlannerCardInput,
} from "../model/types";

const path = (id: string) => `/api/planner-cards/${encodeURIComponent(id)}`;

// The desktop reads and writes its encrypted local store (cards in the
// database, attachment contents in the evidence store, ADR-0014); the web is a
// client of the server, which applies the same rules (BASE-10, ADR-0004):
// positions per column. Attachments stay on the
// desktop until the server stores them (SYNC-04b): the web lists none and
// cannot add one.

/** Largest attachment (ADR-0014; the Rust side enforces it too). */
export const MAX_ATTACHMENT_MB = 200;
/** Bytes per upload call: a file is sent in raw chunks, never whole. */
export const UPLOAD_CHUNK = 4 * 1024 * 1024;

/** Sends `file` to the evidence store in raw chunks; returns the upload id. */
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
export const plannerApi = {
  list: (projectId: string, ownerId: string): Promise<PlannerCard[]> =>
    isTauri()
      ? invoke("planner_list", { projectId, ownerId })
      : serverApi.get(`/api/planner-cards?projectId=${encodeURIComponent(projectId)}`),
  create: (input: PlannerCardInput): Promise<PlannerCard | null> =>
    isTauri() ? invoke("planner_create", { input }) : serverApi.post("/api/planner-cards", input),
  update: (id: string, input: PlannerCardInput): Promise<PlannerCard | null> =>
    isTauri() ? invoke("planner_update", { id, input }) : serverApi.put(path(id), id, input),
  remove: (id: string, ownerId: string): Promise<void> =>
    isTauri() ? invoke("planner_delete", { id, ownerId }) : serverApi.remove(path(id), id),
  reorder: (ownerId: string, status: CardStatus, ids: string[]): Promise<void> =>
    isTauri()
      ? invoke("planner_reorder", { ownerId, status, ids })
      : serverApi.post("/api/planner-cards/reorder", { status, ids }),
  attachmentAdd: async (cardId: string, ownerId: string, file: File): Promise<AttachmentSummary | null> => {
    if (!isTauri()) return desktopOnly("attachments");
    const uploadId = await upload(file);
    return invoke("planner_attachment_add", {
      cardId,
      ownerId,
      uploadId,
      name: file.name,
      mime: file.type || null,
    });
  },
  // Attachments are owner-scoped through their card (FIX-08).
  attachmentList: (cardId: string, ownerId: string): Promise<AttachmentSummary[]> =>
    isTauri()
      ? invoke("planner_attachment_list", { cardId, ownerId })
      : Promise.resolve([]),
  /** Rust decrypts it straight into the download folder (Mark-of-the-Web). */
  attachmentSave: async (id: string, ownerId: string): Promise<SaveResult> =>
    isTauri() ? invoke("planner_attachment_save", { id, ownerId }) : desktopOnly("attachments"),
  attachmentDelete: async (id: string, ownerId: string): Promise<void> =>
    isTauri() ? invoke("planner_attachment_delete", { id, ownerId }) : desktopOnly("attachments"),
};

/** How many cards a project's board has (all kinds and columns). */
export async function projectCardCount(projectId: string, ownerId: string): Promise<number> {
  return (await plannerApi.list(projectId, ownerId)).length;
}
