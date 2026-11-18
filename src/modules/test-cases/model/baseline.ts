// Suite baselines (CAS-02, ADR-0047): a named set of a project's cases, each
// frozen at the revision it had. The types mirror `case_baseline.rs` (BASE-05).

import type { Assert, Contract, Covers } from "@shared/contracts";
import { contentKey } from "./review";
import { diffCase, type FieldChange } from "./caseDiff";

export interface CaseBaselineSummary {
  id: string;
  projectId: string;
  name: string;
  description: string;
  /** How the cases were chosen, as the user saw it. */
  scopeLabel: string;
  approvedOnly: boolean;
  createdBy: string;
  createdAt: string;
  itemCount: number;
}

export interface CaseBaselineItem {
  caseId: string;
  /** The immutable revision row; empty for the current state. */
  revisionId: string;
  revision: number;
  scenarioId: string;
  title: string;
  status: string;
  version: string;
  priority: string;
  data: unknown;
}

/** A baseline with its cases; the current state of a project has the same
 *  shape, with an empty id. */
export interface CaseBaseline extends CaseBaselineSummary {
  items: CaseBaselineItem[];
}

export interface CaseBaselineInput {
  projectId: string;
  name: string;
  description?: string;
  scopeLabel?: string;
  approvedOnly: boolean;
  caseIds: string[];
  userId: string;
}

export type _RustContract = [
  Assert<Covers<Contract.CaseBaselineSummary, CaseBaselineSummary>>,
  Assert<Covers<Contract.CaseBaselineItem, CaseBaselineItem>>,
  Assert<Covers<Contract.CaseBaseline, CaseBaseline>>,
  Assert<Covers<CaseBaselineInput, Contract.CaseBaselineInput>>,
];

// ---------------------------------------------------------------- compare

export type CaseChange = "added" | "removed" | "content" | "status";

export interface CaseComparison {
  caseId: string;
  scenarioId: string;
  title: string;
  from: CaseBaselineItem | null;
  to: CaseBaselineItem | null;
  /** Empty: the case did not change. */
  changes: CaseChange[];
  /** Field by field, when the content changed. */
  fields: FieldChange[];
}

export interface BaselineComparison {
  rows: CaseComparison[];
  counts: Record<CaseChange | "same", number>;
}

/** Compares two baselines (or one with the current state), case by case:
 *  added, removed, content changed, only the status changed, or the same. */
export function compareBaselines(from: CaseBaseline, to: CaseBaseline): BaselineComparison {
  const before = new Map(from.items.map((i) => [i.caseId, i]));
  const after = new Map(to.items.map((i) => [i.caseId, i]));
  const ids = [...new Set([...before.keys(), ...after.keys()])];
  const counts: BaselineComparison["counts"] = { added: 0, removed: 0, content: 0, status: 0, same: 0 };
  const rows = ids.map((caseId): CaseComparison => {
    const a = before.get(caseId) ?? null;
    const b = after.get(caseId) ?? null;
    const changes: CaseChange[] = [];
    let fields: FieldChange[] = [];
    if (!a) changes.push("added");
    else if (!b) changes.push("removed");
    else {
      if (contentKey(a.title, a.data) !== contentKey(b.title, b.data)) {
        changes.push("content");
        fields = diffCase(a, b);
      }
      if (a.status !== b.status) changes.push("status");
    }
    if (changes.length === 0) counts.same++;
    else if (changes[0] === "added" || changes[0] === "removed") counts[changes[0]]++;
    else if (changes.includes("content")) counts.content++;
    else counts.status++;
    const shown = b ?? a!;
    return { caseId, scenarioId: shown.scenarioId, title: shown.title, from: a, to: b, changes, fields };
  });
  rows.sort((x, y) => x.scenarioId.localeCompare(y.scenarioId, undefined, { numeric: true }));
  return { rows, counts };
}
