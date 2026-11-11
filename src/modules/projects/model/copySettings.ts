// «Copiar ajustes de…» when a project is created (UX-25): a one-time copy of
// another project's settings, never its name, its prefix (NC-030) or any of
// its data. Afterwards the two projects are independent.
//
// The case-key digits and «Historial en el plan exportado» travel in the
// create itself; the custom fields (every entity, FLD-03) and the evidence
// retention (desktop only, DAT-03c) are copied right after, each on its own:
// one that fails does not stop the others nor undo the project.
import {
  FIELD_ENTITIES,
  customFieldApi,
  type FieldEntity,
} from "@modules/custom-fields";
import { projectApi } from "../api/projectApi";
import type { PlanExportHistory, ProjectInput } from "./types";

/** What can be copied, in the order the form lists it. */
export const COPY_PARTS = [
  "fields",
  "digits",
  "planHistory",
  "retention",
] as const;
export type CopyPart = (typeof COPY_PARTS)[number];

/** The parts this platform offers: the web has no evidence retention. */
export function copyParts(desktop: boolean): CopyPart[] {
  return COPY_PARTS.filter((part) => desktop || part !== "retention");
}

/** The source project's settings that travel in the create. */
export interface CopySource {
  id: string;
  caseIdDigits: number;
  planExportHistory?: PlanExportHistory;
}

/** The create input with the chosen settings of `source` (never its name or
 *  prefix: those are the new project's own). */
export function withCopiedSettings(
  input: ProjectInput,
  source: CopySource | null,
  parts: ReadonlySet<CopyPart>,
): ProjectInput {
  if (!source) return input;
  return {
    ...input,
    ...(parts.has("digits") ? { caseIdDigits: source.caseIdDigits } : {}),
    ...(parts.has("planHistory")
      ? { planExportHistory: source.planExportHistory ?? "current" }
      : {}),
  };
}

/** What the copy after the create left out. */
export interface CopyOutcome {
  /** Entities whose custom fields could not be copied. */
  fieldsFailed: FieldEntity[];
  retentionFailed: boolean;
}

export const copyFailed = (outcome: CopyOutcome) =>
  outcome.fieldsFailed.length > 0 || outcome.retentionFailed;

/** Copies the custom fields of every entity and the evidence retention of
 *  `fromId` into the project just created. Never throws: what failed is in
 *  the outcome. `api` is replaced in tests. */
export async function copyAfterCreate(
  fromId: string,
  toId: string,
  userId: string,
  parts: ReadonlySet<CopyPart>,
  api: {
    copyFields: (
      from: string,
      to: string,
      user: string,
      entity: FieldEntity,
    ) => Promise<unknown>;
    copyRetention: (from: string, to: string, user: string) => Promise<unknown>;
  } = {
    copyFields: customFieldApi.copy,
    copyRetention: projectApi.copyRetention,
  },
): Promise<CopyOutcome> {
  const fieldsFailed: FieldEntity[] = [];
  if (parts.has("fields")) {
    // One after another: each copy is its own transaction on the same store.
    for (const entity of FIELD_ENTITIES) {
      try {
        await api.copyFields(fromId, toId, userId, entity);
      } catch {
        fieldsFailed.push(entity);
      }
    }
  }
  let retentionFailed = false;
  if (parts.has("retention")) {
    try {
      await api.copyRetention(fromId, toId, userId);
    } catch {
      retentionFailed = true;
    }
  }
  return { fieldsFailed, retentionFailed };
}
