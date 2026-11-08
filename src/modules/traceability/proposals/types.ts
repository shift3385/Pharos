// Requirement proposals of the AI (IA-17, ADR-0036): the contract shared with
// IA-18 (requirements from images and designs). Each source of material turns
// its own material into `CandidateRequirement`s; the synthesis against the
// existing requirements, the review view and the apply are common.

import type {
  RequirementPriority,
  RequirementProvenance,
  RequirementSource,
} from "../model/types";

export type RequirementBasis = "stated" | "inferred";

/** A requirement a source of material shows, before the common synthesis. */
export interface CandidateRequirement {
  title: string;
  /** «The system shall …», EARS when it fits. */
  description: string;
  priority?: RequirementPriority;
  kind?: "functional" | "non-functional" | "constraint";
  /** stated: written in the documentation, the specification or the design's
   *  text; inferred: deduced from code, tests or an image. */
  basis?: RequirementBasis;
  acceptance?: string[];
  assumptions?: string[];
  questions?: string[];
  /** A short quote of the material. */
  evidence?: string;
  /** At least one. */
  sources: RequirementSource[];
}

/** What a new or improved requirement brings with it from its candidates. */
export interface ProposalSupport {
  basis?: RequirementBasis;
  acceptance?: string[];
  assumptions?: string[];
  questions?: string[];
  sources: RequirementSource[];
}

/** One change the AI proposes to the project's requirements. `id` is its
 *  position in the answer, stable while the person reviews it. */
export type RequirementProposal =
  | ({
      id: number;
      action: "add";
      title: string;
      description: string;
      priority: RequirementPriority;
      reason: string;
      /** An existing requirement that looks alike: a warning, not a link. */
      similarTo?: string;
    } & ProposalSupport)
  | ({
      id: number;
      action: "improve";
      key: string;
      /** The revision the proposal was made against: a requirement changed
       *  since is not overwritten. */
      revision: number;
      title?: string;
      description?: string;
      priority?: RequirementPriority;
      reason: string;
    } & ProposalSupport)
  | {
      id: number;
      action: "merge";
      /** Two or more existing keys; `keep` is one of them. */
      keys: string[];
      keep: string;
      title?: string;
      description?: string;
      reason: string;
    }
  | {
      id: number;
      action: "remove";
      key: string;
      coveredBy?: string;
      reason: string;
    };

export type ProposalAction = RequirementProposal["action"];

export interface ApplyResult {
  created: number;
  updated: number;
  removed: number;
  /** Proposals not applied on purpose, with why (`changed` since the answer,
   *  `linked` to test cases, `missing`). */
  skipped: { id: number; why: "changed" | "linked" | "missing" }[];
  /** Proposals whose save failed: the person may retry them. */
  failed: number[];
}

export type { RequirementProvenance, RequirementSource };
