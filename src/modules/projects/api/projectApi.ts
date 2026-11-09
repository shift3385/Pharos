import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import { PROJECT_SAVED_EVENT } from "../model/events";
import type { Project, ProjectInput, ProjectSummary } from "../model/types";

/** Announces a saved project to the views that cache the list (FIX-11). */
function announced(saved: Promise<Project | null>): Promise<Project | null> {
  return saved.then((project) => {
    window.dispatchEvent(new Event(PROJECT_SAVED_EVENT));
    return project;
  });
}

// The desktop reads and writes its encrypted local store (Rust); the web is a
// client of the server, which applies the same rules (BASE-10, ADR-0004).
// Every call carries the signed-in user so a project is only visible to its
// owner; on the web the server takes the owner from the session.
export const projectApi = {
  list: (ownerId: string): Promise<ProjectSummary[]> =>
    isTauri() ? invoke("project_list", { ownerId }) : serverApi.get("/api/projects"),
  get: (id: string, ownerId: string): Promise<Project | null> =>
    isTauri()
      ? invoke("project_get", { id, ownerId })
      : serverApi.get(`/api/projects/${encodeURIComponent(id)}`),
  create: (input: ProjectInput): Promise<Project | null> =>
    isTauri() ? invoke("project_create", { input }) : serverApi.post("/api/projects", input),
  update: (id: string, input: ProjectInput): Promise<Project | null> =>
    announced(
      isTauri()
        ? invoke("project_update", { id, input })
        : serverApi.put(`/api/projects/${encodeURIComponent(id)}`, id, input),
    ),
  remove: (id: string, ownerId: string): Promise<void> =>
    isTauri()
      ? invoke("project_delete", { id, ownerId })
      : serverApi.remove(`/api/projects/${encodeURIComponent(id)}`, id),
  /** Copies the evidence retention of one project to another (UX-25); how
   *  many kinds changed. Desktop only: the retention is a setting of this
   *  device (DAT-03c) and the web has none, so it refuses there. */
  copyRetention: (fromProjectId: string, toProjectId: string, userId: string): Promise<number> =>
    isTauri()
      ? invoke("evidence_retention_copy", { fromProjectId, toProjectId, userId })
      : Promise.reject(new Error("evidence-retention-desktop-only")),
};
