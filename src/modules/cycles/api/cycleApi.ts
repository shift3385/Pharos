import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type {
  AddOutcome,
  Configuration,
  ConfigurationInput,
  CycleFilter,
  CycleItem,
  CycleItemInput,
  CycleProgress,
  CycleRun,
  CycleSummary,
  ExecuteInput,
  TestCycle,
  TestCycleInput,
} from "../model/types";

const enc = encodeURIComponent;

// The desktop reads and writes its encrypted local store (`cycles.rs`); the
// web is a client of the server, which applies the same rules (BASE-10).
// «Ejecutar» creates runs, which only the desktop has (`canExecute`).
// `userId` is the signed-in user: only cycles of projects that user owns are
// returned or changed (on the web the server takes it from the session).
export const configurationApi = {
  list: (projectId: string, userId: string, includeArchived = false): Promise<Configuration[]> =>
    isTauri()
      ? invoke("configuration_list", { projectId, userId, includeArchived })
      : serverApi.get(`/api/configurations?projectId=${enc(projectId)}&includeArchived=${includeArchived}`),
  create: (input: ConfigurationInput): Promise<Configuration | null> =>
    isTauri() ? invoke("configuration_create", { input }) : serverApi.post("/api/configurations", input),
  update: (id: string, input: ConfigurationInput): Promise<Configuration | null> =>
    isTauri()
      ? invoke("configuration_update", { id, input })
      : serverApi.put(`/api/configurations/${enc(id)}`, id, input),
  archive: (id: string, archived: boolean, userId: string): Promise<Configuration | null> =>
    isTauri()
      ? invoke("configuration_archive", { id, archived, userId })
      : serverApi.post(`/api/configurations/${enc(id)}/archive`, { archived }),
  reorder: (projectId: string, ids: string[], userId: string): Promise<Configuration[]> =>
    isTauri()
      ? invoke("configuration_reorder", { projectId, ids, userId })
      : serverApi.post("/api/configurations/reorder", { projectId, ids }),
};

export const cycleApi = {
  /** Runs are created on the desktop only (EJE-02 brings them to the web). */
  canExecute: () => isTauri(),
  list: (projectId: string, userId: string): Promise<CycleSummary[]> =>
    isTauri() ? invoke("cycle_list", { projectId, userId }) : serverApi.get(`/api/cycles?projectId=${enc(projectId)}`),
  get: (id: string, userId: string): Promise<TestCycle | null> =>
    isTauri() ? invoke("cycle_get", { id, userId }) : serverApi.get(`/api/cycles/${enc(id)}`),
  create: (input: TestCycleInput): Promise<TestCycle | null> =>
    isTauri() ? invoke("cycle_create", { input }) : serverApi.post("/api/cycles", input),
  update: (id: string, input: TestCycleInput): Promise<TestCycle | null> =>
    isTauri() ? invoke("cycle_update", { id, input }) : serverApi.put(`/api/cycles/${enc(id)}`, id, input),
  clone: (id: string, userId: string, title?: string): Promise<TestCycle | null> =>
    isTauri()
      ? invoke("cycle_clone", { id, title: title ?? null, userId })
      : serverApi.post(`/api/cycles/${enc(id)}/clone`, title ? { title } : {}),
  remove: (id: string, userId: string): Promise<void> =>
    isTauri() ? invoke("cycle_delete", { id, userId }) : serverApi.remove(`/api/cycles/${enc(id)}`, id),
  items: (cycleId: string, userId: string): Promise<CycleItem[]> =>
    isTauri()
      ? invoke("cycle_items_list", { cycleId, userId })
      : serverApi.get(`/api/cycles/${enc(cycleId)}/items`),
  addItems: (cycleId: string, items: CycleItemInput[], userId: string): Promise<AddOutcome> =>
    isTauri()
      ? invoke("cycle_items_add", { cycleId, userId, items })
      : serverApi.post(`/api/cycles/${enc(cycleId)}/items`, { items }),
  addByFilter: (cycleId: string, filter: CycleFilter, userId: string, assignee?: string): Promise<AddOutcome> =>
    isTauri()
      ? invoke("cycle_items_add_by_filter", { cycleId, userId, filter, assignee: assignee || null })
      : serverApi.post(`/api/cycles/${enc(cycleId)}/items/by-filter`, { filter, assignee: assignee || null }),
  filterPreview: (projectId: string, filter: CycleFilter, userId: string): Promise<number> =>
    isTauri()
      ? invoke("cycle_filter_preview", { projectId, userId, filter })
      : serverApi.post("/api/cycles/filter-preview", { projectId, filter }),
  setAssignee: (itemId: string, assignee: string, userId: string): Promise<void> =>
    isTauri()
      ? invoke("cycle_item_update", { id: itemId, input: { assignee, userId } })
      : serverApi.put(`/api/cycle-items/${enc(itemId)}`, itemId, { assignee }).then(() => undefined),
  removeItems: (cycleId: string, ids: string[], userId: string): Promise<number> =>
    isTauri()
      ? invoke("cycle_items_remove", { cycleId, ids, userId })
      : serverApi.post(`/api/cycles/${enc(cycleId)}/items/remove`, { ids }),
  reorderItems: (cycleId: string, ids: string[], userId: string): Promise<CycleItem[]> =>
    isTauri()
      ? invoke("cycle_items_reorder", { cycleId, ids, userId })
      : serverApi.post(`/api/cycles/${enc(cycleId)}/items/reorder`, { ids }),
  execute: (cycleId: string, input: ExecuteInput): Promise<CycleRun[]> =>
    invoke("cycle_execute", { cycleId, input }),
  runs: (cycleId: string, userId: string): Promise<CycleRun[]> =>
    isTauri() ? invoke("cycle_runs", { cycleId, userId }) : serverApi.get(`/api/cycles/${enc(cycleId)}/runs`),
  progress: (cycleId: string, userId: string): Promise<CycleProgress | null> =>
    isTauri()
      ? invoke("cycle_progress_get", { cycleId, userId })
      : serverApi.get(`/api/cycles/${enc(cycleId)}/progress`),
};
