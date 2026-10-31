import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type {
  CopySummary,
  CustomField,
  CustomFieldInput,
  FieldEntity,
} from "../model/types";

const path = (id: string) => `/api/custom-fields/${encodeURIComponent(id)}`;
const query = (projectId: string, entity: FieldEntity) =>
  `projectId=${encodeURIComponent(projectId)}&entity=${entity}`;

// The desktop reads and writes its encrypted local store (`custom_fields.rs`);
// the web is a client of the server, which applies the same rules (BASE-10):
// deterministic ids, immutable key and type, archive instead of delete.
// `userId` is the signed-in user: only fields of projects that user owns are
// returned or changed (on the web the server takes it from the session).
export const customFieldApi = {
  list: (
    projectId: string,
    userId: string,
    entity: FieldEntity = "test_case",
  ): Promise<CustomField[]> =>
    isTauri()
      ? invoke("custom_field_list", { projectId, entity, userId })
      : serverApi.get(`/api/custom-fields?${query(projectId, entity)}`),
  create: (input: CustomFieldInput): Promise<CustomField> =>
    isTauri()
      ? invoke("custom_field_create", { input })
      : serverApi.post("/api/custom-fields", input),
  update: (id: string, input: CustomFieldInput): Promise<CustomField> =>
    isTauri()
      ? invoke("custom_field_update", { id, input })
      : serverApi.put(path(id), id, input),
  archive: (
    id: string,
    archived: boolean,
    userId: string,
  ): Promise<CustomField> =>
    isTauri()
      ? invoke("custom_field_archive", { id, archived, userId })
      : serverApi.post(`${path(id)}/archive`, { archived }),
  reorder: (
    projectId: string,
    ids: string[],
    userId: string,
    entity: FieldEntity = "test_case",
  ): Promise<unknown> =>
    isTauri()
      ? invoke("custom_field_reorder", { projectId, entity, ids, userId })
      : serverApi.post("/api/custom-fields/reorder", {
          projectId,
          entity,
          ids,
        }),
  copy: (
    fromProjectId: string,
    toProjectId: string,
    userId: string,
    entity: FieldEntity = "test_case",
  ): Promise<CopySummary> =>
    isTauri()
      ? invoke("custom_field_copy", {
          fromProjectId,
          toProjectId,
          entity,
          userId,
        })
      : serverApi.post("/api/custom-fields/copy", {
          fromProjectId,
          toProjectId,
          entity,
        }),
};
