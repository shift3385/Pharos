// Response schemas of /api/v1 (INT-02, ADR-0052 §1): the routes parse what
// they send with them, and `openapi.ts` turns them into the contract.
import { z } from "zod";
import { API_SCOPES } from "./scopes";

export const meSchema = z
  .object({
    token: z.object({
      id: z.uuid(),
      kind: z.enum(["project", "personal"]),
      name: z.string(),
      prefix: z.string(),
      scopes: z.array(z.enum(API_SCOPES)),
      expiresAt: z.string(),
      workspaceId: z.uuid().nullable(),
      projectId: z.string().nullable(),
    }),
    owner: z.object({ id: z.uuid(), name: z.string() }),
  });

export const projectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    caseIdPrefix: z.string(),
    workspace: z.object({ id: z.uuid(), name: z.string() }),
  });

export const projectListSchema = z.object({ projects: z.array(projectSchema) });

export const errorSchema = z
  .looseObject({ code: z.string(), message: z.string() })
  .meta({ description: "Every error: a stable `code` and a readable `message`, plus fields of that error." });

// ---- runs and results (A2) ---------------------------------------------------

const optText = (max: number) => z.string().trim().min(1).max(max).optional();

/** Formats of `?format=` (ADR-0052 §2). `allure` and `trx` answer 422
 *  `unsupported_format` until track F ships their parsers. */
export const uploadFormatSchema = z.enum([
  "pharos_run_json",
  "junit",
  "ctrf",
  "playwright_json",
  "cucumber_messages",
  "sarif",
  "axe",
  "k6",
  "allure",
  "trx",
]);

/** Where an uploaded report goes and how it is named (query parameters). */
export const uploadQuerySchema = z
  .object({
    format: uploadFormatSchema.optional().meta({ description: "Checked against the format the server detects; without it, the detected one is used." }),
    runKey: optText(100).meta({ description: "An open run of the project (RUN-012)." }),
    externalId: optText(500).meta({
      description: "The run of this id in the project, created by the first upload: the jobs of a CI matrix converge on one run (e.g. github:owner/repo:run_id:attempt).",
    }),
    runName: optText(500).meta({ description: "Title of a run this upload creates." }),
    cycleKey: optText(100).meta({ description: "Cycle of a run this upload creates (CYC-…)." }),
    configuration: optText(200).meta({ description: "Configuration (by name) of a run this upload creates." }),
    caseKey: optText(200).meta({ description: "Link every result of the file without a case of its own to this case (PH-001)." }),
    fileName: optText(500).meta({ description: "Name the raw report is kept under." }),
  })
  .strict();

const warningSchema = z.object({ code: z.string(), testKey: z.string().nullable(), detail: z.string().nullable() });

export const uploadResponseSchema = z.object({
  run: z.object({ id: z.uuid(), key: z.string(), url: z.string().nullable(), status: z.enum(["in_progress", "completed", "aborted"]) }),
  shard: z.object({ id: z.uuid(), created: z.boolean(), format: z.string() }),
  counts: z.object({
    results: z.number().int(),
    linked: z.number().int(),
    unlinked: z.number().int(),
    byStatus: z.record(z.string(), z.number().int()),
    findings: z.number().int(),
    metrics: z.number().int(),
  }),
  warnings: z.array(warningSchema),
});

export const runSchema = z.looseObject({
  id: z.uuid(),
  projectId: z.string(),
  runKey: z.string(),
  title: z.string(),
  trigger: z.string(),
  status: z.enum(["in_progress", "completed", "aborted"]),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  environment: z.string().nullable(),
  build: z.string().nullable(),
  commitSha: z.string().nullable(),
  branch: z.string().nullable(),
  ciUrl: z.string().nullable(),
  cycleId: z.string().nullable(),
  configurationId: z.string().nullable(),
});

export const runListSchema = z.object({ runs: z.array(runSchema) });

export const runCreateSchema = z
  .object({
    externalId: optText(500),
    name: optText(500),
    cycleKey: optText(100),
    configuration: optText(200),
    environment: optText(200),
    build: optText(200),
    commitSha: optText(200),
    branch: optText(500),
    ciUrl: optText(2000),
  })
  .strict();

export const runCloseSchema = z.object({ status: z.enum(["completed", "aborted"]).default("completed") }).strict();

export const runSummarySchema = z.object({
  run: runSchema,
  counts: z.object({
    results: z.number().int(),
    linked: z.number().int(),
    unlinked: z.number().int(),
    byStatus: z.record(z.string(), z.number().int()),
  }),
});

export const resultSchema = z.looseObject({
  id: z.string(),
  shardId: z.string().nullable(),
  testKey: z.string(),
  caseKey: z.string().nullable(),
  testCaseId: z.string().nullable().meta({ description: "The case it links to, derived when read." }),
  configurationLabel: z.string().nullable(),
  attempt: z.number().int(),
  status: z.string(),
  durationMs: z.number().nullable(),
  errorMessage: z.string().nullable(),
  isFinal: z.boolean(),
});

export const resultListSchema = z.object({ results: z.array(resultSchema) });
