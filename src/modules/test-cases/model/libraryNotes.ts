// What the case exports say about the project library (CAS-01, ADR-0055 §8):
// the copy of a shared step and the bound table are ordinary steps and rows,
// and the exports only name where they come from, «nombre (vN)».

import type { TestCaseData } from "./types";

/** The shared-step call a copied step belongs to. */
export interface CallNote {
  callId: string;
  name: string;
  version: number | null;
}

/** By step id, the call of each copied step (`data.sharedRefs[].stepIds`). */
export function callsByStep(data: TestCaseData): Map<string, CallNote> {
  const out = new Map<string, CallNote>();
  for (const r of data.sharedRefs ?? []) {
    if (!r || !Array.isArray(r.stepIds)) continue;
    const note = {
      callId: r.id,
      name: typeof r.name === "string" ? r.name : "",
      version: typeof r.version === "number" ? r.version : null,
    };
    for (const id of r.stepIds)
      if (typeof id === "string" && !out.has(id)) out.set(id, note);
  }
  return out;
}

/** The dataset bound to the case's own Examples (`datasetRefs` entry
 *  `"case"`), if any. */
export function boundDataset(
  data: TestCaseData,
): { name: string; version: number | null } | null {
  const r = (data.datasetRefs ?? []).find((x) => x && x.id === "case");
  if (!r) return null;
  return {
    name: typeof r.name === "string" ? r.name : "",
    version: typeof r.version === "number" ? r.version : null,
  };
}

/** «Iniciar sesión (v4)»: how the exports name a library element. */
export const libraryName = (n: { name: string; version: number | null }) =>
  n.version === null ? n.name : `${n.name} (v${n.version})`;

/** The id of a step, if it has one. */
export const stepIdOf = (s: unknown): string | null =>
  s && typeof s === "object" && typeof (s as { id?: unknown }).id === "string"
    ? (s as { id: string }).id
    : null;

/** For each step of a list, the call whose block starts there (the first of
 *  a run of steps of the same call), else null. */
export function blockStarts(
  steps: readonly unknown[] | undefined,
  calls: Map<string, CallNote>,
): (CallNote | null)[] {
  let prev: string | null = null;
  return (steps ?? []).map((s) => {
    const id = stepIdOf(s);
    const call = id ? calls.get(id) : undefined;
    const starts = call && call.callId !== prev ? call : null;
    prev = call ? call.callId : null;
    return starts;
  });
}

/** «Dataset: Usuarios válidos (v2)» for B31 of the .xlsx, or nothing when the
 *  case binds no dataset. */
export function datasetLineOf(
  data: TestCaseData | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | undefined {
  const ds = data ? boundDataset(data) : null;
  return ds
    ? t("library.export.datasetLine", {
        name: ds.name,
        version: ds.version ?? "?",
      })
    : undefined;
}
