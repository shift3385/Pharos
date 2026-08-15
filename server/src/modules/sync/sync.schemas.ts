import { z } from "zod";

/** A change pushed by a client: the full latest state of one entity, or a
 *  tombstone (op: "delete"). Only core entities sync in Phase 8B. */
export const deltaSchema = z.object({
  entity: z.enum(["project", "test_plan", "test_case"]),
  entityId: z.string().min(1),
  op: z.enum(["upsert", "delete"]),
  payload: z.record(z.unknown()).default({}),
  revision: z.number().int().nonnegative().default(1),
  author: z.string().default(""),
});

export const pushSchema = z.object({
  deltas: z.array(deltaSchema).max(1000),
});

export const pullSchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
});

export type Delta = z.infer<typeof deltaSchema>;
