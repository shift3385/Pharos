import type {
  RevisionSummary,
  TestCase,
  TestCaseInput,
  TestCaseSummary,
} from "../model/types";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

// Browser fallback so the UI works in `vite dev`. The real, encrypted store
// lives in Rust and is used in the desktop app.
const KEY = "pharos.testCases";
const REV_KEY = "pharos.testCaseRevisions";

type StoredRevision = RevisionSummary & { caseId: string };

function loadAll(): TestCase[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as TestCase[];
  } catch {
    return [];
  }
}
function saveAll(cases: TestCase[]) {
  localStorage.setItem(KEY, JSON.stringify(cases));
}
function loadRevs(): StoredRevision[] {
  try {
    return JSON.parse(localStorage.getItem(REV_KEY) ?? "[]") as StoredRevision[];
  } catch {
    return [];
  }
}

function nextScenarioId(cases: TestCase[]): string {
  return `ATS_${String(cases.length + 1).padStart(3, "0")}`;
}

const browserApi = {
  async list(): Promise<TestCaseSummary[]> {
    return loadAll()
      .map((c) => ({
        id: c.id,
        scenarioId: c.scenarioId,
        title: c.title,
        status: c.status,
        priority: c.priority,
        gherkinLevel: c.data?.gherkinLevel ?? "basic",
        updatedAt: c.updatedAt,
        revision: c.revision,
      }))
      .sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
  },
  async get(id: string): Promise<TestCase | null> {
    return loadAll().find((c) => c.id === id) ?? null;
  },
  async create(input: TestCaseInput): Promise<TestCase> {
    const all = loadAll();
    const now = new Date().toISOString();
    const testCase: TestCase = {
      id: crypto.randomUUID(),
      workspaceId: "local",
      scenarioId: input.scenarioId?.trim() || nextScenarioId(all),
      title: input.title,
      version: input.version ?? "1.0",
      status: input.status ?? "draft",
      priority: input.priority ?? "medium",
      author: input.author,
      data: input.data,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    saveAll([...all, testCase]);
    return testCase;
  },
  async update(id: string, input: TestCaseInput): Promise<TestCase | null> {
    const all = loadAll();
    const idx = all.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    const prev = all[idx];
    const revs = loadRevs();
    revs.push({
      id: crypto.randomUUID(),
      caseId: id,
      revision: prev.revision,
      title: prev.title,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem(REV_KEY, JSON.stringify(revs));
    const updated: TestCase = {
      ...prev,
      scenarioId: input.scenarioId?.trim() || prev.scenarioId,
      title: input.title,
      version: input.version ?? prev.version,
      status: input.status ?? prev.status,
      priority: input.priority ?? prev.priority,
      author: input.author,
      data: input.data,
      updatedAt: new Date().toISOString(),
      revision: prev.revision + 1,
    };
    all[idx] = updated;
    saveAll(all);
    return updated;
  },
  async remove(id: string): Promise<void> {
    saveAll(loadAll().filter((c) => c.id !== id));
    localStorage.setItem(
      REV_KEY,
      JSON.stringify(loadRevs().filter((r) => r.caseId !== id)),
    );
  },
  async revisions(id: string): Promise<RevisionSummary[]> {
    return loadRevs()
      .filter((r) => r.caseId === id)
      .sort((a, b) => b.revision - a.revision);
  },
};

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export const testCaseApi = {
  list: (): Promise<TestCaseSummary[]> =>
    isTauri() ? invoke("test_case_list") : browserApi.list(),
  get: (id: string): Promise<TestCase | null> =>
    isTauri() ? invoke("test_case_get", { id }) : browserApi.get(id),
  create: (input: TestCaseInput): Promise<TestCase | null> =>
    isTauri() ? invoke("test_case_create", { input }) : browserApi.create(input),
  update: (id: string, input: TestCaseInput): Promise<TestCase | null> =>
    isTauri()
      ? invoke("test_case_update", { id, input })
      : browserApi.update(id, input),
  remove: (id: string): Promise<void> =>
    isTauri() ? invoke("test_case_delete", { id }) : browserApi.remove(id),
  revisions: (id: string): Promise<RevisionSummary[]> =>
    isTauri() ? invoke("test_case_revisions", { id }) : browserApi.revisions(id),
};
