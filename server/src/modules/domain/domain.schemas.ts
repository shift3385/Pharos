import { z } from "zod";
import { AUTOMATION_STATUSES, CASE_TYPES, FIELD_ENTITIES } from "./custom-fields";
import {
  DEFECT_PRIORITIES,
  DEFECT_RESOLUTIONS,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  LINK_TARGET_KINDS,
} from "../sync/defects";

/** Inputs of the web's domain endpoints (BASE-10). They mirror the inputs of
 *  the desktop's Tauri commands; the owner always comes from the access token,
 *  so the `userId`/`ownerId` a client sends is ignored. */

const text = (max: number) => z.string().max(max);
const data = z.record(z.string(), z.unknown()).default({});

export const projectInputSchema = z.object({
  name: text(200).trim().min(1),
  caseIdPrefix: text(32).optional(),
  caseIdDigits: z.number().int().min(1).max(12).optional(),
});

export const testPlanInputSchema = z.object({
  projectId: text(200).min(1),
  title: text(500),
  version: text(50).optional(),
  planDate: text(50).nullish(),
  author: text(200).default(""),
  status: text(50).optional(),
  data,
});

export const testCaseInputSchema = z.object({
  projectId: text(200).min(1),
  scenarioId: text(100).optional(),
  title: text(500),
  version: text(50).optional(),
  status: text(50).optional(),
  priority: text(50).optional(),
  /** Omitted on an update: the stored value stays (FLD-01). */
  caseType: z.enum(CASE_TYPES).optional(),
  automationStatus: z.enum(AUTOMATION_STATUSES).optional(),
  author: text(200).default(""),
  data,
});

const fieldOption = z.object({
  id: text(40).default(""),
  label: text(200),
  archived: z.boolean().default(false),
});

/** A custom field definition (FLD-01, `custom_fields.rs::CustomFieldInput`).
 *  The key and the type are only read on create; they never change. */
export const customFieldInputSchema = z.object({
  projectId: text(200).min(1),
  entity: z.enum(FIELD_ENTITIES).default("test_case"),
  fieldKey: text(100),
  label: text(500),
  description: text(2_000).optional(),
  fieldType: text(50),
  options: z.array(fieldOption).max(500).default([]),
  required: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  appliesToCaseTypes: z.array(text(50)).nullish(),
});

export const customFieldArchiveSchema = z.object({
  archived: z.boolean(),
});

export const customFieldReorderSchema = z.object({
  projectId: text(200).min(1),
  entity: z.enum(FIELD_ENTITIES).default("test_case"),
  ids: z.array(text(200)).max(2000),
});

export const customFieldCopySchema = z.object({
  fromProjectId: text(200).min(1),
  toProjectId: text(200).min(1),
  entity: z.enum(FIELD_ENTITIES).default("test_case"),
});

export const customFieldQuerySchema = z.object({
  projectId: text(200).min(1),
  entity: z.enum(FIELD_ENTITIES).default("test_case"),
});

export const requirementInputSchema = z.object({
  projectId: text(200).min(1),
  requirementKey: text(100).optional(),
  title: text(500).trim().min(1),
  description: text(20_000).optional(),
  priority: text(50).optional(),
});

export const requirementImportSchema = z.object({
  rows: z
    .array(
      z.object({
        requirementKey: text(100).optional(),
        title: text(500),
        description: text(20_000).optional(),
        priority: text(50).optional(),
      }),
    )
    .max(5000),
});

/** Card kinds, as in the desktop (`planner.rs`) and the client (`CARD_KINDS`). */
export const CARD_KINDS = ["task", "defect", "test_data"] as const;

export const plannerCardInputSchema = z.object({
  projectId: text(200).min(1),
  kind: z.enum(CARD_KINDS),
  title: text(500),
  status: text(50).optional(),
  priority: text(50).optional(),
  data,
});

/** What a defect links to (DEF-01, `defects.rs::LinkTarget`). */
export const linkTargetSchema = z.object({
  targetKind: z.enum(LINK_TARGET_KINDS),
  targetId: text(200).min(1),
});

/** A defect as the editor sends it (`defects.rs::DefectInput`; the result
 *  it comes from is desktop only: its evidence lives there). */
export const defectInputSchema = z.object({
  projectId: text(200).min(1),
  title: text(500).trim().min(1),
  description: text(20_000).optional(),
  stepsToReproduce: text(20_000).optional(),
  expected: text(20_000).nullish(),
  actual: text(20_000).nullish(),
  severity: z.enum(DEFECT_SEVERITIES).optional(),
  priority: z.enum(DEFECT_PRIORITIES).optional(),
  status: z.enum(DEFECT_STATUSES).optional(),
  resolution: z.enum(DEFECT_RESOLUTIONS).nullish(),
  foundInRunId: text(200).nullish(),
  foundInBuild: text(200).nullish(),
  foundInEnvironment: text(200).nullish(),
  fixedInBuild: text(200).nullish(),
  assignee: text(200).nullish(),
  externalSystem: text(200).nullish(),
  externalKey: text(200).nullish(),
  externalUrl: text(2000).nullish(),
  data,
  links: z.array(linkTargetSchema).max(500).optional(),
});

/** The board's move (`defect_transition`). */
export const defectTransitionSchema = z.object({
  status: z.enum(DEFECT_STATUSES),
  resolution: z.enum(DEFECT_RESOLUTIONS).nullish(),
  fixedInBuild: text(200).nullish(),
  revision: z.number().int().nonnegative().optional(),
});

export const defectLinkSchema = z.object({ target: linkTargetSchema, linked: z.boolean() });

export const reorderSchema = z.object({
  status: text(50).min(1),
  ids: z.array(text(200)).max(2000),
});

/** An update carries the revision the client read, so a change made
 *  elsewhere meanwhile is answered with 409 instead of being overwritten. */
export const updateOf = <T extends z.ZodType>(input: T) =>
  z.object({ input, revision: z.number().int().nonnegative().optional() });

export const deleteQuerySchema = z.object({
  revision: z.coerce.number().int().nonnegative().optional(),
});

export const projectQuerySchema = z.object({ projectId: text(200).min(1) });

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type TestPlanInput = z.infer<typeof testPlanInputSchema>;
export type TestCaseInput = z.infer<typeof testCaseInputSchema>;
export type RequirementInput = z.infer<typeof requirementInputSchema>;
export type RequirementImportRow = z.infer<typeof requirementImportSchema>["rows"][number];
export type PlannerCardInput = z.infer<typeof plannerCardInputSchema>;
export type CustomFieldInput = z.infer<typeof customFieldInputSchema>;
export type DefectInput = z.infer<typeof defectInputSchema>;
export type DefectTransition = z.infer<typeof defectTransitionSchema>;
export type LinkTargetInput = z.infer<typeof linkTargetSchema>;
