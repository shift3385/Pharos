import { pushEntity } from "@modules/sync-offline";
import type {
  AttachmentData,
  AttachmentSummary,
  CardStatus,
  PlannerCard,
  PlannerCardInput,
} from "../model/types";
import { DEFECT_KEY_PREFIX } from "../model/types";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

// Browser fallback so the board works in `vite dev`. The real, encrypted store
// (cards + attachment blobs) lives in Rust. Card writes are pushed to the
// backend (SYNC-04a); attachments stay local until SYNC-04b.
const KEY = "pharos.plannerCards";
const ATT_KEY = "pharos.plannerAttachments";

type StoredAttachment = AttachmentSummary & { cardId: string; dataBase64: string };

function loadAll(): PlannerCard[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as PlannerCard[];
  } catch {
    return [];
  }
}
function saveAll(cards: PlannerCard[]) {
  localStorage.setItem(KEY, JSON.stringify(cards));
}
function loadAtt(): StoredAttachment[] {
  try {
    return JSON.parse(localStorage.getItem(ATT_KEY) ?? "[]") as StoredAttachment[];
  } catch {
    return [];
  }
}
function saveAtt(a: StoredAttachment[]) {
  localStorage.setItem(ATT_KEY, JSON.stringify(a));
}

/** Next defect key of a project (mirrors the Rust numbering; the fallback
 *  hard-deletes cards, so here a deleted defect's key can be reused). */
function nextDefectKey(cards: PlannerCard[], projectId: string): string {
  let max = 0;
  for (const c of cards) {
    if (c.projectId !== projectId || !c.cardKey?.startsWith(DEFECT_KEY_PREFIX)) continue;
    const n = Number(c.cardKey.slice(DEFECT_KEY_PREFIX.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${DEFECT_KEY_PREFIX}${String(max + 1).padStart(3, "0")}`;
}

/** Sends a card's latest state (or its tombstone) to the backend. */
function push(card: PlannerCard, op: "upsert" | "delete" = "upsert") {
  const ownerId = (card as { ownerId?: string }).ownerId ?? "";
  pushEntity("planner_card", card.id, op, card, card.revision, ownerId);
}

const browserApi = {
  async list(projectId: string, ownerId: string): Promise<PlannerCard[]> {
    return loadAll()
      .filter((c) => c.projectId === projectId && (c as { ownerId?: string }).ownerId === ownerId)
      .sort((a, b) => a.position - b.position);
  },
  async create(input: PlannerCardInput): Promise<PlannerCard> {
    const all = loadAll();
    const status = input.status ?? "backlog";
    const position =
      Math.max(
        -1,
        ...all
          .filter((c) => c.projectId === input.projectId && c.status === status)
          .map((c) => c.position),
      ) + 1;
    const now = new Date().toISOString();
    const card = {
      id: crypto.randomUUID(),
      projectId: input.projectId,
      ownerId: input.ownerId,
      kind: input.kind,
      cardKey: input.kind === "defect" ? nextDefectKey(all, input.projectId) : null,
      title: input.title,
      status,
      priority: input.priority ?? "medium",
      position,
      data: input.data,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    } as PlannerCard & { ownerId: string };
    saveAll([...all, card]);
    push(card);
    return card;
  },
  async update(id: string, input: PlannerCardInput): Promise<PlannerCard | null> {
    const all = loadAll();
    const idx = all.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    all[idx] = {
      ...all[idx],
      kind: input.kind,
      cardKey:
        all[idx].cardKey ??
        (input.kind === "defect" ? nextDefectKey(all, all[idx].projectId) : null),
      title: input.title,
      priority: input.priority ?? all[idx].priority,
      data: input.data,
      updatedAt: new Date().toISOString(),
      revision: all[idx].revision + 1,
    };
    saveAll(all);
    push(all[idx]);
    return all[idx];
  },
  async remove(id: string): Promise<void> {
    const card = loadAll().find((c) => c.id === id);
    saveAll(loadAll().filter((c) => c.id !== id));
    if (card) push({ ...card, revision: card.revision + 1 }, "delete");
    saveAtt(loadAtt().filter((a) => a.cardId !== id));
  },
  async reorder(status: CardStatus, ids: string[]): Promise<void> {
    const all = loadAll();
    ids.forEach((id, i) => {
      const c = all.find((x) => x.id === id);
      if (c) {
        c.status = status;
        c.position = i;
        c.revision += 1;
      }
    });
    saveAll(all);
    for (const c of all) if (ids.includes(c.id)) push(c);
  },
  async attachmentAdd(
    cardId: string,
    name: string,
    mime: string | null,
    dataBase64: string,
  ): Promise<AttachmentSummary> {
    const att = loadAtt();
    const summary: StoredAttachment = {
      id: crypto.randomUUID(),
      cardId,
      name,
      mime,
      size: Math.floor((dataBase64.length * 3) / 4),
      dataBase64,
    };
    saveAtt([...att, summary]);
    return summary;
  },
  async attachmentList(cardId: string): Promise<AttachmentSummary[]> {
    return loadAtt()
      .filter((a) => a.cardId === cardId)
      .map(({ id, name, mime, size }) => ({ id, name, mime, size }));
  },
  async attachmentGet(id: string): Promise<AttachmentData | null> {
    const a = loadAtt().find((x) => x.id === id);
    return a ? { name: a.name, mime: a.mime, dataBase64: a.dataBase64 } : null;
  },
  async attachmentDelete(id: string): Promise<void> {
    saveAtt(loadAtt().filter((a) => a.id !== id));
  },
};

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export const plannerApi = {
  list: (projectId: string, ownerId: string): Promise<PlannerCard[]> =>
    isTauri()
      ? invoke("planner_list", { projectId, ownerId })
      : browserApi.list(projectId, ownerId),
  create: (input: PlannerCardInput): Promise<PlannerCard | null> =>
    isTauri() ? invoke("planner_create", { input }) : browserApi.create(input),
  update: (id: string, input: PlannerCardInput): Promise<PlannerCard | null> =>
    isTauri() ? invoke("planner_update", { id, input }) : browserApi.update(id, input),
  remove: (id: string, ownerId: string): Promise<void> =>
    isTauri() ? invoke("planner_delete", { id, ownerId }) : browserApi.remove(id),
  reorder: (ownerId: string, status: CardStatus, ids: string[]): Promise<void> =>
    isTauri()
      ? invoke("planner_reorder", { ownerId, status, ids })
      : browserApi.reorder(status, ids),
  attachmentAdd: (
    cardId: string,
    ownerId: string,
    name: string,
    mime: string | null,
    dataBase64: string,
  ): Promise<AttachmentSummary | null> =>
    isTauri()
      ? invoke("planner_attachment_add", { cardId, ownerId, name, mime, dataBase64 })
      : browserApi.attachmentAdd(cardId, name, mime, dataBase64),
  // Attachments are owner-scoped through their card (FIX-08).
  attachmentList: (cardId: string, ownerId: string): Promise<AttachmentSummary[]> =>
    isTauri()
      ? invoke("planner_attachment_list", { cardId, ownerId })
      : browserApi.attachmentList(cardId),
  attachmentGet: (id: string, ownerId: string): Promise<AttachmentData | null> =>
    isTauri()
      ? invoke("planner_attachment_get", { id, ownerId })
      : browserApi.attachmentGet(id),
  attachmentDelete: (id: string, ownerId: string): Promise<void> =>
    isTauri()
      ? invoke("planner_attachment_delete", { id, ownerId })
      : browserApi.attachmentDelete(id),
};

/** Defect cards of a project (for the traceability matrix). */
export async function projectDefects(projectId: string, ownerId: string): Promise<PlannerCard[]> {
  return (await plannerApi.list(projectId, ownerId)).filter((c) => c.kind === "defect");
}
