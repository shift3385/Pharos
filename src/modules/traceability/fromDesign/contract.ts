// What IA-18 hands over to the common proposals flow of IA-17 (ADR-0036): the
// types live there; this file only names the ones the design readers use.

import type { RequirementSource } from "../model/types";

export type { CandidateRequirement } from "../proposals/types";
export type { RequirementSource };

export type DesignTool = NonNullable<Extract<RequirementSource, { kind: "design" }>["tool"]>;
