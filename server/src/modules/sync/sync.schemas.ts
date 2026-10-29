import { z } from "zod";

/** Entities that sync (Phase 8B core + SYNC-04a requirements and planner
 *  cards). Templates and attachments follow in SYNC-04b. */
export const SYNCED_ENTITIES = ["project", "test_plan", "test_case", "requirement", "planner_card"] as const;

/** Children removed with their project (FIX-05): their payload carries
 *  `projectId`. */
export const PROJECT_CHILDREN = ["test_plan", "test_case", "requirement", "planner_card"] as const;

/** Most deltas per push and documents per pull page. Clients send batches
 *  and page through pulls (FIX-02/03). */
export const MAX_PUSH_DELTAS = 500;
export const MAX_PULL_LIMIT = 500;

/** A change pushed by a client: the full latest state of one entity, or a
 *  tombstone (op: "delete"). Since 8C a delta carries its HLC and, from the
 *  desktop, the base version it was built on (for conflict detection). */
export const deltaSchema = z.object({
  entity: z.enum(SYNCED_ENTITIES),
  entityId: z.string().min(1),
  op: z.enum(["upsert", "delete"]),
  payload: z.record(z.string(), z.unknown()).default({}),
  revision: z.number().int().nonnegative().default(1),
  author: z.string().default(""),
  hlc: z.string().max(200).default(""),
  baseRevision: z.number().int().nonnegative().nullish(),
  baseHlc: z.string().max(200).nullish(),
});

export const pushSchema = z.object({
  deltas: z.array(deltaSchema).max(MAX_PUSH_DELTAS),
});

export const pullSchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(MAX_PULL_LIMIT).default(MAX_PULL_LIMIT),
});

export type Delta = z.infer<typeof deltaSchema>;

/** Human-readable keys (DAT-01, ADR-0010): the kind of key each keyed entity
 *  carries and the payload field that holds it. */
export const KEY_KINDS = ["case", "requirement", "defect"] as const;
export type KeyKind = (typeof KEY_KINDS)[number];
export const KEY_ENTITY: Record<KeyKind, string> = {
  case: "test_case",
  requirement: "requirement",
  defect: "planner_card",
};
export const KEY_FIELD: Record<string, string> = {
  test_case: "scenarioId",
  requirement: "requirementKey",
  planner_card: "cardKey",
};

/** Numbers per leased block; the desktop asks for another when fewer than 10
 *  are left. */
export const KEY_BLOCK_SIZE = 50;

/** A provisional key (`ATS_?KQZD`) is local and never checked for duplicates. */
export const isProvisionalKey = (key: string): boolean => key.includes("?");

/** Lease of key blocks: per project and kind, the lowest number the device
 *  may still use (`floor`: its own next number, so a project numbered before
 *  its first push keeps its keys). */
export const keyBlocksSchema = z.object({
  requests: z
    .array(
      z.object({
        projectId: z.string().min(1).max(200),
        kind: z.enum(KEY_KINDS),
        // The key prefix of the series (`ATS_`, `REQ-`): only keys with it count
        // for the floor. Empty: the device floor alone.
        prefix: z.string().max(64).default(""),
        floor: z.number().int().positive().max(1e12).default(1),
      }),
    )
    .max(300),
});
