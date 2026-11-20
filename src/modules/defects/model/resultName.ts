import type { LinkableItem, ResultCandidate } from "./types";

/** A case as the defects screens name it: «clave · título» (its key alone
 *  when it has no title). */
export function caseLabel(key: string, title?: string | null): string {
  const t = title?.trim();
  return t ? `${key} · ${t}` : key;
}

/** A result linked to a case (by its tag, or later by hand from «Sin
 *  vincular») is named by the case's current key and title; an unlinked one
 *  by its test (FIX-42). */
export function resultName(r: ResultCandidate, cases: Map<string, LinkableItem>): string {
  const c = r.testCaseId ? cases.get(r.testCaseId) : undefined;
  return c ? caseLabel(c.key, c.title) : (r.caseKey ?? r.testKey);
}

/** Where a defect drafted from a result comes from, for the «Prerrellenado
 *  desde …» banner: the run and the result as the picker named it (FIX-43). */
export function originLabel(runKey: string, name: string | null | undefined): string {
  return [runKey, name].filter(Boolean).join(" · ");
}
