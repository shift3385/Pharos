// Pharos Run JSON (KND-01, ADR-0012; RUN-00, ADR-0013; design 0.2.0 §3.10):
// the one format that enters the core. Every importer (Cucumber Messages,
// CTRF, JUnit, Playwright JSON: step 9) produces it, and one piece of code
// persists it. It is a superset of CTRF: `results[]` takes the fields of CTRF
// `results.tests[]` as they are, so a CTRF test is already a valid result.
// `findings[]`, `metrics[]` and `exploratorySession` have their shape fixed
// now and get their tables in 0.5.0 (ING-06) and 0.4.0 (EXP-01); until then a
// document that brings them is still valid and is kept whole as the shard's
// raw report (ADR-0014).
//
// Versioned as an exported format (VERSIONING §6.6): `schemaVersion` is
// SemVer; a reader takes every 1.x.y and refuses another major. The JSON
// Schema in `docs/formats/pharos-run-1.schema.json` is generated from this
// file (`schema.test.ts` fails if they drift). Unknown keys pass everywhere:
// the persister keeps them in `attributes`.

import { z } from "zod";

/** The version this build writes. */
export const PHAROS_RUN_SCHEMA_VERSION = "1.0.0";

/** Result and step statuses: Pharos's (`passed | failed | blocked | skipped |
 *  other`, ADR-0013) plus CTRF's `pending`, which the persister stores as
 *  `skipped` with `rawStatus: "pending"`. `blocked` only comes from manual
 *  execution. */
export const RESULT_STATUSES = ["passed", "failed", "blocked", "skipped", "pending", "other"] as const;

const text = z.string();
const optText = z.string().optional();
const count = z.number().int().nonnegative();
/** A time: ISO 8601 text, or epoch milliseconds as CTRF sends them. */
const time = z.union([z.string().min(1), z.number().nonnegative()]);
const attributes = z.record(z.string(), z.unknown());

/** An attachment of the document, referenced by `ref` from results, steps and
 *  session notes. The bytes travel next to the document (or are found at
 *  `path`); the importer stores them as evidence (ADR-0014). */
export const attachmentSchema = z.looseObject({
  ref: text.min(1),
  name: text.min(1),
  contentType: optText,
  kind: z.enum(["evidence", "screenshot", "video", "trace", "log", "raw_report"]).optional(),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
  size: count.optional(),
  path: optText,
});

/** A step of a result: CTRF's `{ name, status }` or Pharos's `text` with the
 *  stable `stepId` of the executed revision (ADR-0011). */
export const stepSchema = z
  .looseObject({
    name: optText,
    text: optText,
    status: z.enum(RESULT_STATUSES),
    stepId: optText,
    keyword: optText,
    actual: optText,
    durationMs: count.optional(),
    gherkinLine: z.number().int().positive().optional(),
    attachments: z.array(z.string()).optional(),
  })
  .refine((s) => (s.text ?? s.name ?? "") !== "", {
    message: "A step needs its text (or CTRF name).",
    path: ["text"],
  });

/** An attachment of a result: the `ref` of one of the document's
 *  `attachments[]`, or a CTRF attachment as the tool wrote it. */
const resultAttachment = z.union([
  z.string(),
  z.looseObject({ name: text.min(1), contentType: optText, path: optText }),
]);

/** One attempt of one test. CTRF's test fields first, then Pharos's. */
export const resultSchema = z.looseObject({
  // CTRF results.tests[] (specVersion 0.x).
  name: text.min(1),
  status: z.enum(RESULT_STATUSES),
  duration: z.number().nonnegative().optional(),
  start: time.optional(),
  stop: time.optional(),
  suite: z.union([text, z.array(text)]).optional(),
  message: optText,
  trace: optText,
  snippet: optText,
  rawStatus: optText,
  tags: z.array(text).optional(),
  type: optText,
  filePath: optText,
  retries: count.optional(),
  flaky: z.boolean().optional(),
  browser: optText,
  device: optText,
  screenshot: optText,
  parameters: attributes.optional(),
  steps: z.array(stepSchema).optional(),
  extra: attributes.optional(),
  // Pharos (ADR-0013). Without testKey the persister derives it (normalized
  // path + name + row, ING-01 §3).
  testKey: text.min(1).optional(),
  externalId: optText,
  caseKey: optText,
  flowId: optText,
  exampleRowId: optText,
  exampleRow: count.optional(),
  exampleValues: z.unknown().optional(),
  configurationLabel: optText,
  attempt: count.optional(),
  shardRef: optText,
  startedAt: time.optional(),
  finishedAt: time.optional(),
  attributes: attributes.optional(),
  attachments: z.array(resultAttachment).optional(),
});

/** One upload or import inside the run (ADR-0013). */
export const shardSchema = z.looseObject({
  ref: optText,
  shardIndex: count.optional(),
  shardTotal: z.number().int().positive().optional(),
  sourceFormat: z.enum([
    "cucumber_messages",
    "ctrf",
    "junit",
    "playwright_json",
    "pharos_run_json",
    "sarif",
    "k6",
    "axe",
  ]),
  sourceFileSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
  formatVersion: optText,
  rawReportRef: optText,
});

/** A rule broken at a location (SARIF, axe): ADR-0012. Never marks a case as
 *  failed; the quality gates decide (DOC-02). */
export const findingSchema = z.looseObject({
  ruleId: text.min(1),
  ruleName: optText,
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  rawSeverity: optText,
  message: text.min(1),
  location: attributes.default({}),
  fingerprint: optText,
  standardRefs: z.array(text).default([]),
  helpUri: optText,
  caseKey: optText,
  shardRef: optText,
  attributes: attributes.optional(),
});

/** A measured value, with or without a threshold (k6, Stryker, LLM
 *  evaluations): ADR-0012. */
export const metricSchema = z.looseObject({
  name: text.min(1),
  aggregation: optText,
  scope: optText,
  value: z.number(),
  unit: optText,
  threshold: optText,
  passed: z.boolean().nullable().optional(),
  caseKey: optText,
  shardRef: optText,
  attributes: attributes.optional(),
});

/** A run made by hand with a charter and a timebox (EXP-01, 0.4.0). */
export const exploratorySessionSchema = z.looseObject({
  charter: text.min(1),
  areas: z.array(text).default([]),
  timeboxMinutes: z.number().int().positive().optional(),
  tester: text.min(1),
  startedAt: time.optional(),
  endedAt: time.optional(),
  notes: z
    .array(
      z.looseObject({
        kind: z.enum(["note", "bug", "question", "idea"]),
        text: text.min(1),
        at: time,
        attachments: z.array(z.string()).optional(),
      }),
    )
    .default([]),
});

/** The run's context (ADR-0013): what it ran against. */
export const runSchema = z.looseObject({
  title: optText,
  trigger: z.enum(["manual", "local", "agent", "ci", "cloud", "import"]).optional(),
  sourceTool: optText,
  sourceToolVersion: optText,
  environment: optText,
  build: optText,
  commitSha: optText,
  branch: optText,
  repositoryUrl: optText,
  ciUrl: optText,
  dataset: optText,
  configurationLabel: optText,
  startedAt: time.optional(),
  finishedAt: time.optional(),
  context: attributes.optional(),
});

export const pharosRunSchema = z.looseObject({
  schemaVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "schemaVersion is SemVer (MAJOR.MINOR.PATCH)")
    .refine((v) => v.split(".")[0] === "1", {
      message: "This build reads Pharos Run JSON 1.x; update Pharos to read a newer major.",
    }),
  run: runSchema.default({}),
  shards: z.array(shardSchema).default([]),
  results: z.array(resultSchema).default([]),
  findings: z.array(findingSchema).default([]),
  metrics: z.array(metricSchema).default([]),
  exploratorySession: exploratorySessionSchema.optional(),
  attachments: z.array(attachmentSchema).default([]),
});

export type PharosRun = z.infer<typeof pharosRunSchema>;
export type PharosRunResult = z.infer<typeof resultSchema>;

export interface PharosRunIssue {
  /** Where, as `results.3.status`. */
  path: string;
  message: string;
}

export type PharosRunParse = { ok: true; value: PharosRun } | { ok: false; issues: PharosRunIssue[] };

/** Validates a parsed document. On success, the defaults are filled in. A
 *  `ref` used by a result, step, note or shard must name one of
 *  `attachments[]` / `shards[]`. */
export function parsePharosRun(input: unknown): PharosRunParse {
  const parsed = pharosRunSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  const doc = parsed.data;
  const issues: PharosRunIssue[] = [];
  const attachments = new Set(doc.attachments.map((a) => a.ref));
  const shards = new Set(doc.shards.flatMap((s) => (s.ref ? [s.ref] : [])));
  const refs = (path: string, list: readonly unknown[] | undefined) =>
    (list ?? []).forEach((r, n) => {
      if (typeof r === "string" && !attachments.has(r)) {
        issues.push({ path: `${path}.${n}`, message: `Unknown attachment ref: ${r}` });
      }
    });
  const shard = (path: string, ref: string | undefined) => {
    if (ref !== undefined && !shards.has(ref)) issues.push({ path, message: `Unknown shard ref: ${ref}` });
  };
  doc.results.forEach((r, i) => {
    refs(`results.${i}.attachments`, r.attachments);
    shard(`results.${i}.shardRef`, r.shardRef);
    r.steps?.forEach((s, j) => refs(`results.${i}.steps.${j}.attachments`, s.attachments));
  });
  doc.findings.forEach((f, i) => shard(`findings.${i}.shardRef`, f.shardRef));
  doc.metrics.forEach((m, i) => shard(`metrics.${i}.shardRef`, m.shardRef));
  doc.exploratorySession?.notes.forEach((n, i) => refs(`exploratorySession.notes.${i}.attachments`, n.attachments));
  doc.shards.forEach((s, i) => {
    if (s.rawReportRef !== undefined && !attachments.has(s.rawReportRef)) {
      issues.push({ path: `shards.${i}.rawReportRef`, message: `Unknown attachment ref: ${s.rawReportRef}` });
    }
  });
  return issues.length ? { ok: false, issues } : { ok: true, value: doc };
}

/** The JSON Schema of the format (draft 2020-12), as committed in `docs/`. */
export function pharosRunJsonSchema(): Record<string, unknown> {
  return {
    $id: "https://github.com/shift3385/Pharos/blob/main/docs/formats/pharos-run-1.schema.json",
    title: `Pharos Run JSON ${PHAROS_RUN_SCHEMA_VERSION}`,
    ...(z.toJSONSchema(pharosRunSchema, { io: "input" }) as Record<string, unknown>),
  };
}
