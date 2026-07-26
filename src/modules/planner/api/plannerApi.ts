import type {
  AttachmentData,
  AttachmentSummary,
  CardStatus,
  PlannerCard,
  PlannerCardInput,
} from "../model/types";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

// Browser fallback so the board works in `vite dev`. The real, encrypted store
// (cards + attachment blobs) lives in Rust.
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
    return card;
  },
  async update(id: string, input: PlannerCardInput): Promise<PlannerCard | null> {
    const all = loadAll();
    const idx = all.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    all[idx] = {
      ...all[idx],
      kind: input.kind,
      title: input.title,
      priority: input.priority ?? all[idx].priority,
      data: input.data,
      updatedAt: new Date().toISOString(),
      revision: all[idx].revision + 1,
    };
    saveAll(all);
    return all[idx];
  },
  async remove(id: string): Promise<void> {
    saveAll(loadAll().filter((c) => c.id !== id));
    saveAtt(loadAtt().filter((a) => a.cardId !== id));
  },
  async reorder(status: CardStatus, ids: string[]): Promise<void> {
    const all = loadAll();
    ids.forEach((id, i) => {
      const c = all.find((x) => x.id === id);
      if (c) {
        c.status = status;
        c.position = i;
      }
    });
    saveAll(all);
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
  attachmentList: (cardId: string): Promise<AttachmentSummary[]> =>
    isTauri()
      ? invoke("planner_attachment_list", { cardId })
      : browserApi.attachmentList(cardId),
  attachmentGet: (id: string): Promise<AttachmentData | null> =>
    isTauri() ? invoke("planner_attachment_get", { id }) : browserApi.attachmentGet(id),
  attachmentDelete: (id: string): Promise<void> =>
    isTauri()
      ? invoke("planner_attachment_delete", { id })
      : browserApi.attachmentDelete(id),
};
