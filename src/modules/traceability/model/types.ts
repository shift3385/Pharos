// Traceability model (v0.0.2, TRZ-01/02). A requirement is a test basis item of
// a project (ISTQB CTFL 1.4.4). Its `requirementKey` (REQ-001…) is stable: it is
// immutable once created, links test cases (`data.requirementKeys`) and travels
// as a Gherkin tag (@REQ-001).

import type { AiProvenance } from "@modules/ai";
import type { Assert, Contract, Covers } from "@shared/contracts";

/** Where a requirement proposed by the AI came from (IA-17, ADR-0036; the
 *  image and design kinds are IA-18's): shown as its «Fuente». */
export type RequirementSource =
  | { kind: "file"; path: string; startLine?: number; endLine?: number }
  | {
      kind: "image";
      name: string;
      index: number;
      page?: number;
      sha256?: string;
      note?: string;
      /** Fractions of the image, 0..1. */
      region?: { x: number; y: number; w: number; h: number };
    }
  | {
      kind: "design";
      name: string;
      tool?: "figma" | "excalidraw" | "claude-design" | "canva" | "other";
      nodeId?: string;
      frame?: string;
      url?: string;
    };

/** The provenance of a requirement written by the AI, with the version of the
 *  instructions it followed (e.g. `req-synthesis@1`). */
export type RequirementProvenance = AiProvenance & { prompt?: string };

/** Free-form data of a requirement (`requirements.data`, IA-17). */
export interface RequirementData {
  /** IA-01: `requirement` while the AI wrote or changed it. */
  aiProvenance?: Record<string, RequirementProvenance>;
  sources?: RequirementSource[];
  [key: string]: unknown;
}

export type RequirementPriority = "low" | "medium" | "high";

export const REQUIREMENT_PRIORITIES: RequirementPriority[] = ["low", "medium", "high"];

export const REQUIREMENT_KEY_PREFIX = "REQ-";
export const REQUIREMENT_KEY_DIGITS = 3;

export interface Requirement {
  id: string;
  projectId: string;
  requirementKey: string;
  title: string;
  description: string;
  priority: RequirementPriority;
  /** Risk (RUN-00, TRZ-04): 1..5 each, null until assessed. */
  riskLikelihood?: number | null;
  riskImpact?: number | null;
  /** AI provenance and sources (IA-17); `{}` or absent when there are none. */
  data?: RequirementData;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface RequirementInput {
  projectId: string;
  /** Only honoured on create (empty → auto-numbered); keys are immutable. */
  requirementKey?: string;
  title: string;
  description?: string;
  priority?: RequirementPriority;
  /** Risk factors 1..5 (null clears); left out keeps the stored value. The
   *  desktop sets them with `requirement_risk_set` after the save. */
  riskLikelihood?: number | null;
  riskImpact?: number | null;
  /** Replaces the stored `data`; left out keeps it (IA-17). */
  data?: RequirementData;
  userId: string;
}

/** One row of a bulk import (CSV). Rows whose key exists update it. */
export interface RequirementImportRow {
  requirementKey?: string;
  title: string;
  description?: string;
  priority?: RequirementPriority;
}

export interface ImportSummary {
  created: number;
  updated: number;
  /** Keys of deleted requirements in the file: never reused, not imported. */
  skipped: string[];
}

/** A key must be usable as a Gherkin tag: no whitespace and no characters that
 *  tag expressions treat specially (mirrors the Rust validation). */
export function isValidRequirementKey(key: string): boolean {
  return /^[A-Za-z0-9_.:-]+$/.test(key);
}

// The Rust contract (BASE-05, ADR-0026): what Rust sends covers what this model
// reads, and what this model sends covers what Rust reads. `tsc` fails if a
// field is renamed, dropped or retyped on either side.
export type _RustContract = [
  Assert<Covers<Contract.Requirement, Requirement>>,
  Assert<Covers<Contract.ImportSummary, ImportSummary>>,
  Assert<Covers<RequirementInput, Contract.RequirementInput>>,
  Assert<Covers<RequirementImportRow, Contract.RequirementImportRow>>,
];
