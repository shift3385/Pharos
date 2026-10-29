import { hasPendingReview } from "@modules/ai";
import { pushEntity } from "@modules/sync-offline";
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

// Next number per project, kept apart from the cases so the id of a deleted
// case is never handed out again (DAT-01, ADR-0010), as in the Rust store.
const COUNTER_KEY = "pharos.testCaseCounters";

function loadCounters(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(COUNTER_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

// Next id within a project: the project's counter, never below the highest
// live suffix for the prefix + 1 (empty project → 1).
function nextScenarioId(
  cases: TestCase[],
  projectId: string,
  prefix: string,
  digits: number,
): string {
  let max = 0;
  for (const c of cases) {
    if (c.projectId !== projectId) continue;
    if (!c.scenarioId.startsWith(prefix)) continue;
    const n = Number(c.scenarioId.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  const counters = loadCounters();
  const next = Math.max(max + 1, counters[projectId] ?? 1);
  localStorage.setItem(COUNTER_KEY, JSON.stringify({ ...counters, [projectId]: next + 1 }));
  return `${prefix}${String(next).padStart(digits, "0")}`;
}

const browserApi = {
  async list(projectId: string): Promise<TestCaseSummary[]> {
    return loadAll()
      .filter((c) => c.projectId === projectId)
      .map((c) => ({
        id: c.id,
        scenarioId: c.scenarioId,
        title: c.title,
        status: c.status,
        priority: c.priority,
        gherkinLevel: c.data?.gherkinLevel ?? "basic",
        aiPending: hasPendingReview(c.data?.aiProvenance),
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
      projectId: input.projectId,
      scenarioId:
        input.scenarioId?.trim() ||
        nextScenarioId(all, input.projectId, input.caseIdPrefix ?? "ATS_", input.caseIdDigits ?? 3),
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
    pushEntity("test_case", testCase.id, "upsert", testCase, testCase.revision, testCase.author);
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
      scenarioId: prev.scenarioId,
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
    pushEntity("test_case", id, "upsert", updated, updated.revision, updated.author);
    return updated;
  },
  async remove(id: string): Promise<void> {
    const item = loadAll().find((c) => c.id === id);
    saveAll(loadAll().filter((c) => c.id !== id));
    localStorage.setItem(
      REV_KEY,
      JSON.stringify(loadRevs().filter((r) => r.caseId !== id)),
    );
    pushEntity("test_case", id, "delete", { id }, (item?.revision ?? 0) + 1, item?.author ?? "");
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

// `userId` is the signed-in user: the desktop store only returns or changes
// cases of projects that user owns (FIX-08).
export const testCaseApi = {
  list: (projectId: string, userId: string): Promise<TestCaseSummary[]> =>
    isTauri() ? invoke("test_case_list", { projectId, userId }) : browserApi.list(projectId),
  get: (id: string, userId: string): Promise<TestCase | null> =>
    isTauri() ? invoke("test_case_get", { id, userId }) : browserApi.get(id),
  create: (input: TestCaseInput): Promise<TestCase | null> =>
    isTauri() ? invoke("test_case_create", { input }) : browserApi.create(input),
  update: (id: string, input: TestCaseInput): Promise<TestCase | null> =>
    isTauri()
      ? invoke("test_case_update", { id, input })
      : browserApi.update(id, input),
  remove: (id: string, userId: string): Promise<void> =>
    isTauri() ? invoke("test_case_delete", { id, userId }) : browserApi.remove(id),
  revisions: (id: string, userId: string): Promise<RevisionSummary[]> =>
    isTauri() ? invoke("test_case_revisions", { id, userId }) : browserApi.revisions(id),
};
