// Public API of the defects module (DEF-01, ADR-0016). The page is scoped to
// a project; the editor and `createDefectFromResult` are for the execution
// screen (EJE-02, step 7) to open a defect prefilled from a failed result.
export { DefectsPage } from "./ui/DefectsPage";
export { DefectEditor } from "./ui/DefectEditor";
export { defectsApi, projectDefects } from "./api/defectsApi";
export { isOpenDefect } from "./model/lifecycle";
export type { Defect, DefectInput, LinkableItem } from "./model/types";

import { defectsApi } from "./api/defectsApi";

/** The editor's prefill for a defect created from a failed result (and, if
 *  given, the step that failed): pass it to `DefectEditor` as `draft`. */
export const createDefectFromResult = (resultId: string, userId: string, stepId?: string) =>
  defectsApi.draftFromResult(resultId, userId, stepId);
