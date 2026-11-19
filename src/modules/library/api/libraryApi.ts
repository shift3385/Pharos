import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type {
  LibraryImpact,
  LibraryInput,
  LibraryItem,
  LibraryKind,
  LibraryRefStatus,
  LibrarySave,
  LibraryVersion,
} from "../model/types";

const path = (id: string) => `/api/library/${encodeURIComponent(id)}`;

/** The web schema takes no `null` description and no `userId` (the server
 *  takes the user from the session). */
function webInput(input: LibraryInput) {
  const { userId: _user, description, ...rest } = input;
  return description == null ? rest : { ...rest, description };
}

/** The project library (CAS-01, ADR-0055). The desktop reads and writes its
 *  local store (`shared_library.rs`); the web asks the server, which applies
 *  the same rules (`shared-library.service.ts`). Errors are codes such as
 *  `shared_library.in_use`: `libraryErrorMessage` turns them into text. */
export const libraryApi = {
  list: (
    projectId: string,
    kind: LibraryKind,
    userId: string,
  ): Promise<LibraryItem[]> =>
    isTauri()
      ? invoke("library_list", { projectId, kind, userId })
      : serverApi.get(
          `/api/library?projectId=${encodeURIComponent(projectId)}&kind=${kind}`,
        ),
  get: (id: string, userId: string): Promise<LibraryItem> =>
    isTauri() ? invoke("library_get", { id, userId }) : serverApi.get(path(id)),
  create: (input: LibraryInput): Promise<LibraryItem> =>
    isTauri()
      ? invoke("library_create", { input })
      : serverApi.post("/api/library", webInput(input)),
  /** Saves a change; a content change rewrites the cases that follow it. On
   *  the web the answer nests the item (`{item, updatedCases}`), so it is
   *  read again: `serverApi` then knows its new revision for the next save. */
  update: (id: string, input: LibraryInput): Promise<LibrarySave> =>
    isTauri()
      ? invoke("library_update", { id, input })
      : serverApi
          .put<LibrarySave>(path(id), id, webInput(input))
          .then(async (saved) => ({
            ...saved,
            item: await serverApi.get<LibraryItem>(path(id)),
          })),
  /** What saving a change would do to the cases (the impact notice). */
  impact: (id: string, userId: string): Promise<LibraryImpact> =>
    isTauri()
      ? invoke("library_impact", { id, userId })
      : serverApi.get(`${path(id)}/impact`),
  setStatus: (
    item: LibraryItem,
    status: "active" | "obsolete",
    userId: string,
  ): Promise<LibraryItem> =>
    isTauri()
      ? invoke("library_set_status", { id: item.id, status, userId })
      : serverApi.post(`${path(item.id)}/status`, {
          status,
          revision: item.revision,
        }),
  /** Only when no live case uses it (`shared_library.in_use` otherwise). */
  remove: (id: string, userId: string): Promise<void> =>
    isTauri()
      ? invoke("library_delete", { id, userId })
      : serverApi.remove(path(id), id),
  versions: (id: string, userId: string): Promise<LibraryVersion[]> =>
    isTauri()
      ? invoke("library_versions", { id, userId })
      : serverApi.get(`${path(id)}/versions`),
  /** The state of each call and binding of a saved case. */
  caseStatus: (caseId: string, userId: string): Promise<LibraryRefStatus[]> =>
    isTauri()
      ? invoke("library_case_status", { caseId, userId })
      : serverApi.get(
          `/api/test-cases/${encodeURIComponent(caseId)}/library-status`,
        ),
  /** A case's data with its calls and bindings materialized, not saved. */
  preview: <T extends object>(
    projectId: string,
    caseId: string | null,
    data: T,
    userId: string,
  ): Promise<T> =>
    isTauri()
      ? invoke("library_preview", {
          projectId,
          caseId: caseId ?? null,
          data,
          userId,
        })
      : serverApi.post("/api/library/preview", {
          projectId,
          ...(caseId ? { caseId } : {}),
          data,
        }),
};
