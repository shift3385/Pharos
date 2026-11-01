// Defects model (DEF-01, ADR-0016). A defect is its own entity: severity
// (impact) apart from priority (urgency), a fixed lifecycle with a
// resolution on `closed`/`rejected`, typed links to cases, requirements and
// results, and where it was found.

import type { Assert, Contract, Covers } from "@shared/contracts";

export const DEFECT_STATUSES = [
  "new",
  "open",
  "in_progress",
  "fixed",
  "retest",
  "closed",
  "rejected",
  "deferred",
] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];

/** Board columns: the main flow, then «Otros» with the side exits. */
export const BOARD_COLUMNS = ["new", "open", "in_progress", "fixed", "retest", "closed", "other"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];
export const OTHER_STATUSES: readonly DefectStatus[] = ["rejected", "deferred"];

export const DEFECT_SEVERITIES = ["critical", "major", "minor", "trivial"] as const;
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];

export const DEFECT_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type DefectPriority = (typeof DEFECT_PRIORITIES)[number];

export const DEFECT_RESOLUTIONS = ["fixed", "duplicate", "not_reproducible", "wont_fix", "by_design"] as const;
export type DefectResolution = (typeof DEFECT_RESOLUTIONS)[number];

export type LinkTargetKind = "result" | "test_case" | "requirement" | "finding" | "session_note";

export const DEFECT_KEY_PREFIX = "DEF-";

export interface DefectLink {
  id: string;
  targetKind: string;
  targetId: string;
  /** The case or requirement key, or `RUN-001 · ATS_001 #2` for a result. */
  label: string | null;
}

export interface LinkTarget {
  targetKind: LinkTargetKind;
  targetId: string;
}

export interface DefectData {
  labels?: string[];
  /** Custom field values (ADR-0018). */
  custom?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Defect {
  id: string;
  projectId: string;
  defectKey: string;
  title: string;
  description: string;
  stepsToReproduce: string;
  expected: string | null;
  actual: string | null;
  severity: DefectSeverity;
  priority: DefectPriority;
  status: DefectStatus;
  resolution: DefectResolution | null;
  foundInRunId: string | null;
  foundInBuild: string | null;
  foundInEnvironment: string | null;
  fixedInBuild: string | null;
  reporter: string;
  assignee: string | null;
  externalSystem: string | null;
  externalKey: string | null;
  externalUrl: string | null;
  externalSyncedAt: string | null;
  data: DefectData;
  createdAt: string;
  updatedAt: string;
  revision: number;
  links: DefectLink[];
  /** Cases it reaches: linked directly or through a linked result. */
  caseIds: string[];
}

/** What the editor sends; on update every editable field is replaced. */
export interface DefectInput {
  projectId: string;
  userId: string;
  title: string;
  description?: string;
  stepsToReproduce?: string;
  expected?: string;
  actual?: string;
  severity?: DefectSeverity;
  priority?: DefectPriority;
  status?: DefectStatus;
  resolution?: DefectResolution;
  foundInRunId?: string;
  foundInBuild?: string;
  foundInEnvironment?: string;
  fixedInBuild?: string;
  assignee?: string;
  externalSystem?: string;
  externalKey?: string;
  externalUrl?: string;
  data: DefectData;
  /** Create only. */
  links?: LinkTarget[];
  /** Create only, desktop only: the failed result it comes from. */
  fromResult?: { resultId: string; stepId?: string };
}

/** A failed attempt a defect can be linked to or created from. */
export interface ResultCandidate {
  resultId: string;
  runId: string;
  runKey: string;
  runTitle: string;
  testCaseId: string | null;
  caseKey: string | null;
  testKey: string;
  attempt: number;
  status: string;
  createdAt: string;
}

export interface DefectAttachment {
  id: string;
  name: string;
  mime: string | null;
  size: number;
  purged: boolean;
}

/** Something of the project a defect can be linked to (supplied by the
 *  composing module, so this one depends on no other). */
export interface LinkableItem {
  id: string;
  key: string;
  title: string;
}

// The Rust contract (BASE-05, ADR-0026): what Rust sends covers what this
// model reads, and what this model sends covers what Rust reads.
export type _RustContract = [
  Assert<Covers<Contract.Defect, Omit<Defect, "severity" | "priority" | "status" | "resolution" | "data" | "links">>>,
  Assert<Covers<Contract.DefectLink, DefectLink>>,
  Assert<Covers<Contract.ResultCandidate, ResultCandidate>>,
  Assert<Covers<Contract.DefectAttachment, DefectAttachment>>,
  Assert<Covers<DefectInput, Contract.DefectInput>>,
];
