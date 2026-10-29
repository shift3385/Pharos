import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type { Project, ProjectInput, ProjectSummary } from "../model/types";

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
    isTauri()
      ? invoke("project_update", { id, input })
      : serverApi.put(`/api/projects/${encodeURIComponent(id)}`, id, input),
  remove: (id: string, ownerId: string): Promise<void> =>
    isTauri()
      ? invoke("project_delete", { id, ownerId })
      : serverApi.remove(`/api/projects/${encodeURIComponent(id)}`, id),
};
