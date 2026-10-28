// Migration of the v0.0.1 free-text `traceability` field to structured links
// (approved plan, D2). Pure: it only proposes. The user reviews every proposal
// and nothing is written without confirmation; the free text is kept as-is.

import { isValidRequirementKey } from "./types";

export interface MigrationCase {
  id: string;
  scenarioId: string;
  traceability: string;
  requirementKeys: string[];
}

export interface MigrationProposal {
  caseId: string;
  scenarioId: string;
  /** The token as written in the free text. */
  token: string;
  /** The requirement key it maps to (an existing one, or the token itself). */
  requirementKey: string;
  /** True when no requirement with that key exists yet (it would be created). */
  createsRequirement: boolean;
}

/** Splits free text into ID-like tokens: start with a letter, contain a digit,
 *  and are valid as tags (`REQ-1`, `US-12`, `JIRA:PRJ-7`). */
export function idTokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,;|/()[\]]+/)) {
    const token = raw.replace(/[.:]+$/, "");
    if (/^[A-Za-z][A-Za-z0-9_.:-]*\d/.test(token) && isValidRequirementKey(token) && !out.includes(token)) {
      out.push(token);
    }
  }
  return out;
}

/** Finds the existing key a token refers to: exact (case-insensitive) or the
 *  same prefix with the same number (`REQ-1` → `REQ-001`). */
export function matchKey(token: string, keys: string[]): string | undefined {
  const lower = token.toLowerCase();
  const exact = keys.find((k) => k.toLowerCase() === lower);
  if (exact) return exact;
  const split = (s: string) => s.match(/^(.*?)(\d+)$/);
  const t = split(lower);
  if (!t) return undefined;
  return keys.find((k) => {
    const m = split(k.toLowerCase());
    return !!m && m[1] === t[1] && Number(m[2]) === Number(t[2]);
  });
}

/** Proposals for every case whose free text mentions IDs it is not linked to. */
export function proposeMigration(cases: MigrationCase[], existingKeys: string[]): MigrationProposal[] {
  const proposals: MigrationProposal[] = [];
  for (const c of cases) {
    for (const token of idTokens(c.traceability)) {
      if (token.toLowerCase() === c.scenarioId.toLowerCase()) continue;
      const existing = matchKey(token, existingKeys);
      const requirementKey = existing ?? token;
      if (c.requirementKeys.includes(requirementKey)) continue;
      proposals.push({
        caseId: c.id,
        scenarioId: c.scenarioId,
        token,
        requirementKey,
        createsRequirement: !existing,
      });
    }
  }
  return proposals;
}
