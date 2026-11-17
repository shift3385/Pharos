import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type { CaseBaseline, CaseBaselineInput, CaseBaselineSummary } from "../model/baseline";

const q = (projectId: string) => `projectId=${encodeURIComponent(projectId)}`;

/** Suite baselines (CAS-02, ADR-0047): created, listed and read, never
 *  changed. The desktop reads its local store (`case_baseline.rs`); the web
 *  asks the server, which applies the same rules. */
export const baselineApi = {
  list: (projectId: string, userId: string): Promise<CaseBaselineSummary[]> =>
    isTauri()
      ? invoke("case_baseline_list", { projectId, userId })
      : serverApi.get(`/api/case-baselines?${q(projectId)}`),
  get: (id: string, userId: string): Promise<CaseBaseline | null> =>
    isTauri()
      ? invoke("case_baseline_get", { id, userId })
      : serverApi.get(`/api/case-baselines/${encodeURIComponent(id)}`),
  /** The project's cases now, in the shape of a baseline (to compare). */
  current: (projectId: string, userId: string): Promise<CaseBaseline | null> =>
    isTauri()
      ? invoke("case_baseline_current", { projectId, userId })
      : serverApi.get(`/api/case-baselines/current?${q(projectId)}`),
  create: (input: CaseBaselineInput): Promise<CaseBaselineSummary | null> =>
    isTauri() ? invoke("case_baseline_create", { input }) : serverApi.post("/api/case-baselines", input),
};
