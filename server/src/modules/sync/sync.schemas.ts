import { z } from "zod";
import { FIELD_ENTITIES, fieldId, validKey } from "../domain/custom-fields";

/** Entities of the `lww` sync class (Phase 8B core + SYNC-04a requirements
 *  and planner cards, EJE-01 runs, run items and unlinked mappings, FLD-01
 *  custom field definitions): base check, then last-write-wins by HLC
 *  (ADR-0002). Templates and attachments follow in SYNC-04b. */
export const LWW_ENTITIES = [
  "project",
  "test_plan",
  "test_case",
  "requirement",
  "planner_card",
  "run",
  "run_item",
  "unlinked_mapping",
  "custom_field",
] as const;

/** Entities of the `append_only` sync class (design 0.2.0 §3.2, ADR-0011):
 *  inserted if absent, never a conflict, content never changes. Registering
 *  one is one line here and one in the desktop's `sync_class.rs`; add it to
 *  `PROJECT_CHILDREN` too if deleting its project must tombstone it. Only
 *  clients that send the `append-only` feature push or pull them. */
export const APPEND_ONLY_ENTITIES = [
  "audit_event",
  "test_case_revision",
  "run_shard",
  "result",
] as const;

/** The execution entities (EJE-01, ADR-0013), of both classes. Only clients
 *  that send the `runs` feature pull them; the others never knew them and
 *  get the answers they got before (VERSIONING §6.5). */
export const EXECUTION_ENTITIES = ["run", "run_item", "unlinked_mapping", "run_shard", "result"] as const;

export const isExecution = (entity: string): boolean =>
  (EXECUTION_ENTITIES as readonly string[]).includes(entity);

/** Payload keys a feature introduced on existing entities. A client without
 *  the feature does not know them, so its upsert keeps the stored values even
 *  when it sends its whole state (`complete-payload`): `storeDoc`. */
export const FEATURE_KEYS: Record<string, Partial<Record<string, readonly string[]>>> = {
  runs: { requirement: ["riskLikelihood", "riskImpact"] },
  "custom-fields": { test_case: ["caseType", "automationStatus"] },
};

/** The same for keys inside `data` (FLD-01: `data.custom`, the values of
 *  the project's custom fields, which a client without `custom-fields` drops
 *  when it saves a case). */
export const FEATURE_DATA_KEYS: Record<string, Partial<Record<string, readonly string[]>>> = {
  "custom-fields": { test_case: ["custom"] },
};

/** Every entity that syncs, of either class. */
export const SYNCED_ENTITIES = [...LWW_ENTITIES, ...APPEND_ONLY_ENTITIES] as const;

export const isAppendOnly = (entity: string): boolean =>
  (APPEND_ONLY_ENTITIES as readonly string[]).includes(entity);

/** Payload keys of an append-only document that say where it lives, not what
 *  it is: they stay outside its immutable content (design §3.5), so moving a
 *  project between workspaces (ADR-0019) is not a content change. */
export const LOCATION_KEYS = ["workspaceId", "projectId"] as const;

/** Further payload keys of an append-only entity that are bookkeeping, not
 *  content: two devices may write the same document with different values
 *  here, and it is still the same document (a no-op, not `appendRejected`),
 *  and they never change once stored. A case revision's content is what its
 *  hash covers (ADR-0011 rule 2): timestamps, authors and the clock stay out. */
export const NON_CONTENT_KEYS: Partial<
  Record<(typeof APPEND_ONLY_ENTITIES)[number], readonly string[]>
> = {
  test_case_revision: ["createdAt", "createdBy", "hlc"],
  // Two devices that import the same file write the same shard and results
  // (deterministic ids, ADR-0013) at different times and clocks.
  run_shard: ["importedAt", "importedBy", "hlc"],
  result: ["createdAt", "createdBy", "hlc"],
};

/** Every payload key of `entity` outside its immutable content. */
export const outsideContent = (entity: string): readonly string[] => [
  ...LOCATION_KEYS,
  ...(NON_CONTENT_KEYS[entity as (typeof APPEND_ONLY_ENTITIES)[number]] ?? []),
];

/** Children removed with their project (FIX-05): their payload carries
 *  `projectId`. Shards and results go too (append-only, ADR-0011: a
 *  tombstone is one of the three changes allowed); case revisions and audit
 *  events stay until SYNC-11. */
export const PROJECT_CHILDREN = [
  "test_plan",
  "test_case",
  "requirement",
  "planner_card",
  "run",
  "run_item",
  "unlinked_mapping",
  "run_shard",
  "result",
  "custom_field",
] as const;

const RESULT_STATUSES = ["passed", "failed", "blocked", "skipped", "other"] as const;
const id = z.string().min(1).max(200);

/** What the server checks of an execution document (design §3.11: it
 *  validates, it does not interpret). Extra keys pass. */
const EXECUTION_PAYLOADS: Partial<Record<string, z.ZodType>> = {
  run: z.looseObject({
    projectId: id,
    runKey: z.string().min(1).max(100),
    title: z.string().max(500),
    status: z.enum(["in_progress", "completed", "aborted"]),
  }),
  run_item: z.looseObject({ projectId: id, runId: id, testCaseId: id, testCaseRevisionId: id }),
  unlinked_mapping: z.looseObject({ projectId: id, testKey: z.string().min(1).max(2000) }),
  run_shard: z.looseObject({
    projectId: id,
    runId: id,
    sourceFormat: z.string().min(1).max(100),
    sourceFileSha256: z.string().regex(/^[0-9a-f]{64}$/i),
  }),
  result: z.looseObject({
    projectId: id,
    runId: id,
    testKey: z.string().min(1).max(2000),
    status: z.enum(RESULT_STATUSES),
    attempt: z.number().int().nonnegative(),
    steps: z
      .array(z.looseObject({ text: z.string(), status: z.enum(RESULT_STATUSES) }))
      .max(5000)
      .default([]),
  }),
};

/** Most deltas per push and documents per pull page. Clients send batches
 *  and page through pulls (FIX-02/03). */
export const MAX_PUSH_DELTAS = 500;
export const MAX_PULL_LIMIT = 500;

/** A change pushed by a client: the full latest state of one entity, or a
 *  tombstone (op: "delete"). Since 8C a delta carries its HLC and, from the
 *  desktop, the base version it was built on (for conflict detection).  An
 *  append-only document travels as op "append", and only it does. A client
 *  that sends `complete-payload` pushes its whole state: a key it omits is
 *  cleared. For an older client an omitted key keeps the stored value
 *  (`storeDoc`, VERSIONING §6.5). Sending `null` to clear is still the
 *  recommended practice. */
export const deltaSchema = z
  .object({
    entity: z.enum(SYNCED_ENTITIES),
    entityId: z.string().min(1),
    op: z.enum(["upsert", "delete", "append"]),
    payload: z.record(z.string(), z.unknown()).default({}),
    revision: z.number().int().nonnegative().default(1),
    author: z.string().default(""),
    hlc: z.string().max(200).default(""),
    baseRevision: z.number().int().nonnegative().nullish(),
    baseHlc: z.string().max(200).nullish(),
  })
  .refine((d) => isAppendOnly(d.entity) === (d.op === "append"), {
    message: 'Append-only entities are sent with op "append", and only they are.',
    path: ["op"],
  })
  .superRefine((d, ctx) => {
    // A custom field is its id: project, entity and key derive it (FLD-01),
    // so none of them can change under an existing id.
    if (d.entity === "custom_field" && d.op === "upsert") {
      const p = d.payload;
      const ok =
        typeof p.projectId === "string" &&
        (FIELD_ENTITIES as readonly unknown[]).includes(p.entity) &&
        typeof p.fieldKey === "string" &&
        validKey(p.fieldKey) &&
        typeof p.fieldType === "string" &&
        d.entityId === fieldId(p.projectId, p.entity as string, p.fieldKey);
      if (!ok)
        ctx.addIssue({
          code: "custom",
          message: "A custom field's id must be fieldId(projectId, entity, fieldKey).",
          path: ["entityId"],
        });
    }
    const schema = d.op === "delete" ? undefined : EXECUTION_PAYLOADS[d.entity];
    const parsed = schema?.safeParse(d.payload);
    if (parsed && !parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ code: "custom", message: issue.message, path: ["payload", ...issue.path] });
      }
    }
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
export const KEY_KINDS = ["case", "requirement", "defect", "run", "cycle"] as const;
export type KeyKind = (typeof KEY_KINDS)[number];
/** `cycle` (CYC-, ADR-0017) is accepted now (migration 0008) and gets its
 *  entity with step 6. */
export const KEY_ENTITY: Record<KeyKind, string> = {
  case: "test_case",
  requirement: "requirement",
  defect: "planner_card",
  run: "run",
  cycle: "test_cycle",
};
export const KEY_FIELD: Record<string, string> = {
  test_case: "scenarioId",
  requirement: "requirementKey",
  planner_card: "cardKey",
  run: "runKey",
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
