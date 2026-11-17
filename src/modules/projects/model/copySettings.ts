// A new project from another one's settings (UX-25, «Nuevo proyecto» wizard
// UX-29): a one-time copy of another project's settings, never its name, its
// prefix (NC-030) or any of its data. Afterwards the two projects are
// independent.
//
// The case-key digits are a field of «Datos generales» (prefilled from the
// source, editable) and «Historial en el plan exportado» travels in the create
// itself, as do the risk bands (TRZ-04); the custom fields (every entity, FLD-03) and the evidence retention
// (desktop only, DAT-03c) are copied right after, each on its own: one that
// fails does not stop the others nor undo the project.
import {
  FIELD_ENTITIES,
  customFieldApi,
  type FieldEntity,
} from "@modules/custom-fields";
import type { EvidenceRetention } from "@shared/contracts/contract";
import { projectApi } from "../api/projectApi";
import { projectRiskBands } from "@shared/risk/bands";
import type { PlanExportHistory, ProjectInput } from "./types";

/** What can be copied, in the order the wizard lists it. */
export const COPY_PARTS = [
  "fields",
  "digits",
  "planHistory",
  "riskBands",
  "retention",
] as const;
export type CopyPart = (typeof COPY_PARTS)[number];

/** Whether this platform can copy `part`: the web has no evidence retention. */
export const partOffered = (part: CopyPart, desktop: boolean) =>
  desktop || part !== "retention";

/** The parts this platform offers, all checked when a source is chosen. */
export function copyParts(desktop: boolean): CopyPart[] {
  return COPY_PARTS.filter((part) => partOffered(part, desktop));
}

/** The source project's settings that travel in the create. */
export interface CopySource {
  id: string;
  caseIdDigits: number;
  planExportHistory?: PlanExportHistory;
  riskBandLow?: number;
  riskBandMedium?: number;
}

/** The source's risk bands as a create input (TRZ-04); the defaults when it
 *  has none. */
function riskBandsInput(source: CopySource): Pick<ProjectInput, "riskBandLow" | "riskBandMedium"> {
  const bands = projectRiskBands(source);
  return { riskBandLow: bands.low, riskBandMedium: bands.medium };
}

/** «Datos generales» of the wizard: always the new project's own. */
export interface GeneralData {
  name: string;
  prefix: string;
  digits: number;
}

/** The create input: the general data as typed (the digits are a field, so
 *  a copied value the user changed is not overwritten) plus the source's plan
 *  history when it is copied. Never the source's name or prefix. */
export function newProjectInput(
  data: GeneralData,
  ownerId: string,
  source: CopySource | null,
  parts: ReadonlySet<CopyPart>,
): ProjectInput {
  return {
    name: data.name.trim(),
    ownerId,
    caseIdPrefix: data.prefix.trim(),
    caseIdDigits: data.digits,
    ...(source && parts.has("planHistory")
      ? { planExportHistory: source.planExportHistory ?? "current" }
      : {}),
    ...(source && parts.has("riskBands")
      ? riskBandsInput(source)
      : {}),
  };
}

/** What the source has of each copyable setting, to show its real value.
 *  null = not read (the web for the retention) or the read failed. */
export interface SourceFacts {
  /** Live (not archived) custom fields per entity. */
  fields: Partial<Record<FieldEntity, number>> | null;
  retention: EvidenceRetention | null;
}

/** Reads what the wizard shows of the source. Never throws. */
export async function loadSourceFacts(
  sourceId: string,
  userId: string,
  desktop: boolean,
  api: {
    listFields: (
      projectId: string,
      user: string,
      entity: FieldEntity,
    ) => Promise<{ archivedAt: string | null }[]>;
    retention: (projectId: string, user: string) => Promise<EvidenceRetention>;
  } = { listFields: customFieldApi.list, retention: projectApi.retention },
): Promise<SourceFacts> {
  const fields = await Promise.all(
    FIELD_ENTITIES.map(
      async (entity) =>
        [
          entity,
          (await api.listFields(sourceId, userId, entity)).filter(
            (f) => !f.archivedAt,
          ).length,
        ] as const,
    ),
  )
    .then(
      (pairs) =>
        Object.fromEntries(pairs.filter(([, n]) => n > 0)) as Partial<
          Record<FieldEntity, number>
        >,
    )
    .catch(() => null);
  const retention = desktop
    ? await api.retention(sourceId, userId).catch(() => null)
    : null;
  return { fields, retention };
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
