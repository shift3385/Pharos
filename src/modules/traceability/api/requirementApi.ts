import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type {
  ImportSummary,
  Requirement,
  RequirementImportRow,
  RequirementInput,
} from "../model/types";

const path = (id: string) => `/api/requirements/${encodeURIComponent(id)}`;
const ofProject = (projectId: string) => `projectId=${encodeURIComponent(projectId)}`;

// The desktop reads and writes its encrypted local store (`requirement.rs`);
// the web is a client of the server, which applies the same rules (BASE-10,
// ADR-0004): numbering, immutable keys, keys never reused, upsert-by-key
// import. `userId` is the signed-in user: only requirements of projects that
// user owns are returned or changed (FIX-08; on the web the server takes it
// from the session).
/** The desktop keeps the risk in its own command (`requirement_risk_set`,
 *  RUN-00): set it after a create or update when the input carries it. */
async function withRisk(saved: Requirement | null, input: RequirementInput): Promise<Requirement | null> {
  if (!saved) return saved;
  const likelihood = input.riskLikelihood === undefined ? (saved.riskLikelihood ?? null) : input.riskLikelihood;
  const impact = input.riskImpact === undefined ? (saved.riskImpact ?? null) : input.riskImpact;
  // Only when it changed: no second write (and event) for an unchanged risk.
  if (likelihood === (saved.riskLikelihood ?? null) && impact === (saved.riskImpact ?? null)) return saved;
  return invoke("requirement_risk_set", { id: saved.id, likelihood, impact, userId: input.userId });
}

export const requirementApi = {
  list: (projectId: string, userId: string): Promise<Requirement[]> =>
    isTauri()
      ? invoke("requirement_list", { projectId, userId })
      : serverApi.get(`/api/requirements?${ofProject(projectId)}`),
  get: (id: string, userId: string): Promise<Requirement | null> =>
    isTauri() ? invoke("requirement_get", { id, userId }) : serverApi.get(path(id)),
  create: (input: RequirementInput): Promise<Requirement | null> =>
    isTauri()
      ? invoke<Requirement | null>("requirement_create", { input }).then((r) => withRisk(r, input))
      : serverApi.post("/api/requirements", input),
  update: (id: string, input: RequirementInput): Promise<Requirement | null> =>
    isTauri()
      ? invoke<Requirement | null>("requirement_update", { id, input }).then((r) => withRisk(r, input))
      : serverApi.put(path(id), id, input),
  remove: (id: string, userId: string): Promise<void> =>
    isTauri() ? invoke("requirement_delete", { id, userId }) : serverApi.remove(path(id), id),
  importRows: (
    projectId: string,
    userId: string,
    rows: RequirementImportRow[],
  ): Promise<ImportSummary> =>
    isTauri()
      ? invoke("requirement_import", { projectId, userId, rows })
      : serverApi.post(`/api/requirements/import?${ofProject(projectId)}`, { rows }),
};
