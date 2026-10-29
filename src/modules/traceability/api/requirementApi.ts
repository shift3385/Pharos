import { pushEntity } from "@modules/sync-offline";
import {
  REQUIREMENT_KEY_DIGITS,
  REQUIREMENT_KEY_PREFIX,
  REQUIREMENT_PRIORITIES,
  isValidRequirementKey,
  type ImportSummary,
  type Requirement,
  type RequirementImportRow,
  type RequirementInput,
  type RequirementPriority,
} from "../model/types";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

// Browser fallback so the UI works in `vite dev`. The real, encrypted store
// lives in Rust (`requirement.rs`); this mirrors its rules (numbering, immutable
// keys, upsert-by-key import). Writes are pushed to the backend (SYNC-04a).
const KEY = "pharos.requirements";

type Stored = Requirement & { deletedAt?: string; createdBy: string; updatedBy: string };

function loadAll(): Stored[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Stored[];
  } catch {
    return [];
  }
}
function saveAll(items: Stored[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

const live = (r: Stored) => !r.deletedAt;
const strip = ({ deletedAt: _d, createdBy: _c, updatedBy: _u, ...r }: Stored): Requirement => r;

/** Sends a requirement's latest state (or its tombstone) to the backend. */
function push(r: Stored) {
  pushEntity("requirement", r.id, r.deletedAt ? "delete" : "upsert", strip(r), r.revision, r.updatedBy);
}

function normalizePriority(p?: string): RequirementPriority {
  return REQUIREMENT_PRIORITIES.includes(p as RequirementPriority)
    ? (p as RequirementPriority)
    : "medium";
}

/** Next key within a project: highest `REQ-` suffix + 1. Soft-deleted
 *  requirements still count, so a key is never reused. */
export function nextRequirementKey(items: { projectId: string; requirementKey: string }[], projectId: string): string {
  let max = 0;
  for (const r of items) {
    if (r.projectId !== projectId || !r.requirementKey.startsWith(REQUIREMENT_KEY_PREFIX)) continue;
    const n = Number(r.requirementKey.slice(REQUIREMENT_KEY_PREFIX.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${REQUIREMENT_KEY_PREFIX}${String(max + 1).padStart(REQUIREMENT_KEY_DIGITS, "0")}`;
}

function insert(all: Stored[], input: RequirementInput): Stored {
  const given = input.requirementKey?.trim();
  if (given) {
    if (!isValidRequirementKey(given)) throw new Error(`invalid requirement key: ${given}`);
    if (all.some((r) => live(r) && r.projectId === input.projectId && r.requirementKey === given)) {
      throw new Error(`duplicate requirement key: ${given}`);
    }
  }
  const now = new Date().toISOString();
  const item: Stored = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    requirementKey: given || nextRequirementKey(all, input.projectId),
    title: input.title.trim(),
    description: input.description ?? "",
    priority: normalizePriority(input.priority),
    createdAt: now,
    updatedAt: now,
    revision: 1,
    createdBy: input.userId,
    updatedBy: input.userId,
  };
  all.push(item);
  return item;
}

function patch(item: Stored, input: RequirementInput): Stored {
  // The key is immutable: `input.requirementKey` is ignored on update.
  return {
    ...item,
    title: input.title.trim(),
    description: input.description ?? "",
    priority: normalizePriority(input.priority),
    updatedBy: input.userId,
    updatedAt: new Date().toISOString(),
    revision: item.revision + 1,
  };
}

const browserApi = {
  async list(projectId: string): Promise<Requirement[]> {
    return loadAll()
      .filter((r) => live(r) && r.projectId === projectId)
      .map(strip)
      .sort((a, b) => a.requirementKey.localeCompare(b.requirementKey, undefined, { numeric: true }));
  },
  async get(id: string): Promise<Requirement | null> {
    const r = loadAll().find((x) => x.id === id && live(x));
    return r ? strip(r) : null;
  },
  async create(input: RequirementInput): Promise<Requirement> {
    const all = loadAll();
    const item = insert(all, input);
    saveAll(all);
    push(item);
    return strip(item);
  },
  async update(id: string, input: RequirementInput): Promise<Requirement | null> {
    const all = loadAll();
    const idx = all.findIndex((r) => r.id === id && live(r));
    if (idx < 0) return null;
    all[idx] = patch(all[idx], input);
    saveAll(all);
    push(all[idx]);
    return strip(all[idx]);
  },
  async remove(id: string, userId: string): Promise<void> {
    const all = loadAll().map((r) =>
      r.id === id && live(r)
        ? { ...r, deletedAt: new Date().toISOString(), updatedBy: userId, revision: r.revision + 1 }
        : r,
    );
    saveAll(all);
    const removed = all.find((r) => r.id === id);
    if (removed?.deletedAt) push(removed);
  },
  async importRows(
    projectId: string,
    userId: string,
    rows: RequirementImportRow[],
  ): Promise<ImportSummary> {
    const all = loadAll();
    const summary: ImportSummary = { created: 0, updated: 0 };
    const touched: Stored[] = [];
    for (const row of rows) {
      if (!row.title.trim()) continue;
      const input: RequirementInput = { ...row, projectId, userId };
      const key = row.requirementKey?.trim();
      const idx = key
        ? all.findIndex((r) => live(r) && r.projectId === projectId && r.requirementKey === key)
        : -1;
      if (idx >= 0) {
        all[idx] = patch(all[idx], input);
        touched.push(all[idx]);
        summary.updated++;
      } else {
        touched.push(insert(all, input));
        summary.created++;
      }
    }
    saveAll(all);
    touched.forEach(push);
    return summary;
  },
};

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export const requirementApi = {
  list: (projectId: string): Promise<Requirement[]> =>
    isTauri() ? invoke("requirement_list", { projectId }) : browserApi.list(projectId),
  get: (id: string): Promise<Requirement | null> =>
    isTauri() ? invoke("requirement_get", { id }) : browserApi.get(id),
  create: (input: RequirementInput): Promise<Requirement | null> =>
    isTauri() ? invoke("requirement_create", { input }) : browserApi.create(input),
  update: (id: string, input: RequirementInput): Promise<Requirement | null> =>
    isTauri() ? invoke("requirement_update", { id, input }) : browserApi.update(id, input),
  remove: (id: string, userId: string): Promise<void> =>
    isTauri() ? invoke("requirement_delete", { id, userId }) : browserApi.remove(id, userId),
  importRows: (
    projectId: string,
    userId: string,
    rows: RequirementImportRow[],
  ): Promise<ImportSummary> =>
    isTauri()
      ? invoke("requirement_import", { projectId, userId, rows })
      : browserApi.importRows(projectId, userId, rows),
};
