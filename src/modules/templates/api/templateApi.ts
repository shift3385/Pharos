import type {
  TemplateData,
  TemplateInput,
  TemplateMeta,
  TemplateSeedItem,
  TemplateSummary,
} from "../model/types";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

// Browser fallback so the templates UI works in `vite dev`. The real, encrypted
// store lives in Rust and is used in the desktop app.
const KEY = "pharos.templates";

function loadAll(): TemplateData[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as TemplateData[];
  } catch {
    return [];
  }
}
function saveAll(items: TemplateData[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}
const toSummary = (t: TemplateData): TemplateSummary => {
  const { dataBase64: _omit, ...rest } = t;
  return { ...rest, updatedAt: new Date(0).toISOString() };
};

const browserApi = {
  async list(): Promise<TemplateSummary[]> {
    return loadAll()
      .map(toSummary)
      .sort(
        (a, b) =>
          Number(b.isBuiltin) - Number(a.isBuiltin) ||
          a.kind.localeCompare(b.kind) ||
          a.name.localeCompare(b.name),
      );
  },
  async get(id: string): Promise<TemplateData | null> {
    return loadAll().find((t) => t.id === id) ?? null;
  },
  async create(input: TemplateInput): Promise<TemplateData | null> {
    const item: TemplateData = {
      id: crypto.randomUUID(),
      kind: input.kind,
      language: input.language,
      name: input.name,
      description: input.description ?? "",
      usagePrompt: input.usagePrompt ?? "",
      version: input.version ?? "1.0",
      isBuiltin: false,
      dataBase64: input.dataBase64,
    };
    saveAll([...loadAll(), item]);
    return item;
  },
  async update(id: string, meta: TemplateMeta): Promise<TemplateData | null> {
    const items = loadAll();
    const idx = items.findIndex((t) => t.id === id);
    if (idx < 0) return null;
    items[idx] = {
      ...items[idx],
      name: meta.name,
      description: meta.description ?? "",
      usagePrompt: meta.usagePrompt ?? "",
      version: meta.version ?? items[idx].version,
    };
    saveAll(items);
    return items[idx];
  },
  async remove(id: string): Promise<void> {
    const items = loadAll();
    const target = items.find((t) => t.id === id);
    if (target?.isBuiltin) throw new Error("built-in templates cannot be deleted");
    saveAll(items.filter((t) => t.id !== id));
  },
  async seed(seeds: TemplateSeedItem[]): Promise<void> {
    const items = loadAll();
    const ids = new Set(items.map((t) => t.id));
    for (const s of seeds) {
      if (ids.has(s.id)) continue;
      items.push({
        id: s.id,
        kind: s.kind,
        language: s.language,
        name: s.name,
        description: s.description ?? "",
        usagePrompt: s.usagePrompt ?? "",
        version: s.version ?? "1.0",
        isBuiltin: true,
        dataBase64: s.dataBase64,
      });
    }
    saveAll(items);
  },
};

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// `userId` is the signed-in user (FIX-08b): the desktop store only lists, reads
// or changes the built-in templates and that user's own. The browser fallback
// ignores it until BASE-10 removes it.
export const templateApi = {
  list: (userId: string): Promise<TemplateSummary[]> =>
    isTauri() ? invoke("template_list", { userId }) : browserApi.list(),
  get: (id: string, userId: string): Promise<TemplateData | null> =>
    isTauri() ? invoke("template_get", { id, userId }) : browserApi.get(id),
  create: (input: TemplateInput, userId: string): Promise<TemplateData | null> =>
    isTauri() ? invoke("template_create", { input, userId }) : browserApi.create(input),
  update: (id: string, meta: TemplateMeta, userId: string): Promise<TemplateData | null> =>
    isTauri() ? invoke("template_update", { id, meta, userId }) : browserApi.update(id, meta),
  remove: (id: string, userId: string): Promise<void> =>
    isTauri() ? invoke("template_delete", { id, userId }) : browserApi.remove(id),
  seed: (items: TemplateSeedItem[]): Promise<void> =>
    isTauri() ? invoke("template_seed", { items }) : browserApi.seed(items),
};
