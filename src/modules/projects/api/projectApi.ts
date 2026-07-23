import type { Project, ProjectInput, ProjectSummary } from "../model/types";

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

// Browser fallback so the projects UI works in `vite dev`. The real, encrypted
// store lives in Rust and is used in the desktop app.
const KEY = "pharos.projects";

function loadAll(): Project[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Project[];
  } catch {
    return [];
  }
}
function saveAll(projects: Project[]) {
  localStorage.setItem(KEY, JSON.stringify(projects));
}

const browserApi = {
  async list(): Promise<ProjectSummary[]> {
    return loadAll()
      .map(({ id, name, caseIdPrefix, caseIdDigits, updatedAt, revision }) => ({
        id,
        name,
        caseIdPrefix,
        caseIdDigits,
        updatedAt,
        revision,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async get(id: string): Promise<Project | null> {
    return loadAll().find((p) => p.id === id) ?? null;
  },
  async create(input: ProjectInput): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      id: crypto.randomUUID(),
      workspaceId: "local",
      name: input.name,
      caseIdPrefix: input.caseIdPrefix?.trim() || "ATS_",
      caseIdDigits: input.caseIdDigits ?? 3,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    saveAll([...loadAll(), project]);
    return project;
  },
  async update(id: string, input: ProjectInput): Promise<Project | null> {
    const all = loadAll();
    const idx = all.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    const updated: Project = {
      ...all[idx],
      name: input.name,
      caseIdPrefix: input.caseIdPrefix?.trim() || "ATS_",
      caseIdDigits: input.caseIdDigits ?? 3,
      updatedAt: new Date().toISOString(),
      revision: all[idx].revision + 1,
    };
    all[idx] = updated;
    saveAll(all);
    return updated;
  },
  async remove(id: string): Promise<void> {
    saveAll(loadAll().filter((p) => p.id !== id));
  },
};

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export const projectApi = {
  list: (): Promise<ProjectSummary[]> =>
    isTauri() ? invoke("project_list") : browserApi.list(),
  get: (id: string): Promise<Project | null> =>
    isTauri() ? invoke("project_get", { id }) : browserApi.get(id),
  create: (input: ProjectInput): Promise<Project | null> =>
    isTauri() ? invoke("project_create", { input }) : browserApi.create(input),
  update: (id: string, input: ProjectInput): Promise<Project | null> =>
    isTauri() ? invoke("project_update", { id, input }) : browserApi.update(id, input),
  remove: (id: string): Promise<void> =>
    isTauri() ? invoke("project_delete", { id }) : browserApi.remove(id),
};
