import type {
  RevisionSummary,
  TestPlan,
  TestPlanInput,
  TestPlanSummary,
} from "../model/types";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

// Browser fallback so the test-plan UI works in `vite dev`. The real, encrypted
// store lives in Rust and is used in the desktop app.
const KEY = "pharos.testPlans";
const REV_KEY = "pharos.testPlanRevisions";

function loadAll(): TestPlan[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as TestPlan[];
  } catch {
    return [];
  }
}
function saveAll(plans: TestPlan[]) {
  localStorage.setItem(KEY, JSON.stringify(plans));
}
function loadRevs(): RevisionSummary[] {
  try {
    return JSON.parse(localStorage.getItem(REV_KEY) ?? "[]") as RevisionSummary[];
  } catch {
    return [];
  }
}

const browserApi = {
  async list(): Promise<TestPlanSummary[]> {
    return loadAll()
      .map(({ id, title, version, status, updatedAt, revision }) => ({
        id,
        title,
        version,
        status,
        updatedAt,
        revision,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async get(id: string): Promise<TestPlan | null> {
    return loadAll().find((p) => p.id === id) ?? null;
  },
  async create(input: TestPlanInput): Promise<TestPlan> {
    const now = new Date().toISOString();
    const plan: TestPlan = {
      id: crypto.randomUUID(),
      workspaceId: "local",
      title: input.title,
      version: input.version ?? "1.0",
      planDate: input.planDate ?? null,
      author: input.author,
      status: input.status ?? "draft",
      data: input.data,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    saveAll([...loadAll(), plan]);
    return plan;
  },
  async update(id: string, input: TestPlanInput): Promise<TestPlan | null> {
    const plans = loadAll();
    const idx = plans.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    const prev = plans[idx];
    const revs = loadRevs();
    revs.push({
      id: crypto.randomUUID(),
      revision: prev.revision,
      title: prev.title,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem(REV_KEY, JSON.stringify(revs));
    const updated: TestPlan = {
      ...prev,
      title: input.title,
      version: input.version ?? prev.version,
      planDate: input.planDate ?? null,
      author: input.author,
      status: input.status ?? prev.status,
      data: input.data,
      updatedAt: new Date().toISOString(),
      revision: prev.revision + 1,
    };
    plans[idx] = updated;
    saveAll(plans);
    return updated;
  },
  async remove(id: string): Promise<void> {
    saveAll(loadAll().filter((p) => p.id !== id));
  },
  async revisions(): Promise<RevisionSummary[]> {
    return loadRevs().sort((a, b) => b.revision - a.revision);
  },
};

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export const testPlanApi = {
  list: (): Promise<TestPlanSummary[]> =>
    isTauri() ? invoke("test_plan_list") : browserApi.list(),
  get: (id: string): Promise<TestPlan | null> =>
    isTauri() ? invoke("test_plan_get", { id }) : browserApi.get(id),
  create: (input: TestPlanInput): Promise<TestPlan | null> =>
    isTauri() ? invoke("test_plan_create", { input }) : browserApi.create(input),
  update: (id: string, input: TestPlanInput): Promise<TestPlan | null> =>
    isTauri()
      ? invoke("test_plan_update", { id, input })
      : browserApi.update(id, input),
  remove: (id: string): Promise<void> =>
    isTauri() ? invoke("test_plan_delete", { id }) : browserApi.remove(id),
  revisions: (id: string): Promise<RevisionSummary[]> =>
    isTauri() ? invoke("test_plan_revisions", { id }) : browserApi.revisions(),
};
