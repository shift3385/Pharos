import { z } from "zod";

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
  author: text(200).default(""),
  data,
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

export const plannerCardInputSchema = z.object({
  projectId: text(200).min(1),
  kind: z.enum(["task", "defect"]),
  title: text(500),
  status: text(50).optional(),
  priority: text(50).optional(),
  data,
});

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
