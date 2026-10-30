import { desktopOnly, serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type {
  AttachmentData,
  AttachmentSummary,
  CardStatus,
  PlannerCard,
  PlannerCardInput,
} from "../model/types";

const path = (id: string) => `/api/planner-cards/${encodeURIComponent(id)}`;

// The desktop reads and writes its encrypted local store (cards + attachment
// blobs, Rust); the web is a client of the server, which applies the same
// rules (BASE-10, ADR-0004): positions per column, defect keys never reused.
// Attachments stay on the desktop until the server stores them (SYNC-04b): the
// web lists none and cannot add one.
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
  attachmentAdd: async (
    cardId: string,
    ownerId: string,
    name: string,
    mime: string | null,
    dataBase64: string,
  ): Promise<AttachmentSummary | null> =>
    isTauri()
      ? invoke("planner_attachment_add", { cardId, ownerId, name, mime, dataBase64 })
      : desktopOnly("attachments"),
  // Attachments are owner-scoped through their card (FIX-08).
  attachmentList: (cardId: string, ownerId: string): Promise<AttachmentSummary[]> =>
    isTauri()
      ? invoke("planner_attachment_list", { cardId, ownerId })
      : Promise.resolve([]),
  attachmentGet: (id: string, ownerId: string): Promise<AttachmentData | null> =>
    isTauri() ? invoke("planner_attachment_get", { id, ownerId }) : Promise.resolve(null),
  attachmentDelete: async (id: string, ownerId: string): Promise<void> =>
    isTauri() ? invoke("planner_attachment_delete", { id, ownerId }) : desktopOnly("attachments"),
};

/** Defect cards of a project (for the traceability matrix). */
export async function projectDefects(projectId: string, ownerId: string): Promise<PlannerCard[]> {
  return (await plannerApi.list(projectId, ownerId)).filter((c) => c.kind === "defect");
}

/** How many cards a project's board has (all kinds and columns). */
export async function projectCardCount(projectId: string, ownerId: string): Promise<number> {
  return (await plannerApi.list(projectId, ownerId)).length;
}
