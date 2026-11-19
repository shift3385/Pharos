// The OpenAPI 3.1 contract of /api/v1 (INT-02, ADR-0052 §1), built from the
// zod schemas the routes answer with, so it cannot drift from them. It is
// served at /api/v1/openapi.json and versioned as
// docs/formats/openapi-v1.json (`tests/api.openapi.test.ts` holds them equal).
// v1 only grows: new paths, new optional fields. Objects are open
// (no `additionalProperties: false`) so a client accepts fields added later.
import { z } from "zod";
import { API_SCOPES } from "./scopes.js";
import { READ_RESOURCES } from "./v1.reads.js";
import {
  caseListSchema,
  caseSchema,
  cycleSchema,
  errorSchema,
  meSchema,
  projectListSchema,
  projectSchema,
  readItemSchema,
  readListSchema,
  readQuerySchema,
  resultListSchema,
  runCloseSchema,
  runCreateSchema,
  runListSchema,
  runSchema,
  runSummarySchema,
  uploadFormatSchema,
  uploadQuerySchema,
  uploadResponseSchema,
} from "./v1.schemas.js";

const COMPONENTS = {
  Me: meSchema,
  Project: projectSchema,
  ProjectList: projectListSchema,
  Run: runSchema,
  RunList: runListSchema,
  RunCreate: runCreateSchema,
  RunClose: runCloseSchema,
  RunSummary: runSummarySchema,
  ResultList: resultListSchema,
  UploadFormat: uploadFormatSchema,
  UploadResult: uploadResponseSchema,
  Item: readItemSchema,
  ItemList: readListSchema,
  Case: caseSchema,
  CaseList: caseListSchema,
  Cycle: cycleSchema,
  Error: errorSchema,
};
type Component = keyof typeof COMPONENTS;

const open = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(open);
  if (!v || typeof v !== "object") return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (k === "$schema" || k === "$id" || (k === "additionalProperties" && x === false)) continue;
    out[k] = open(x);
  }
  return out;
};

/** JSON Schema of the components, with refs between them and every object
 *  left open. */
function components(): Record<string, unknown> {
  const registry = z.registry<{ id: string }>();
  for (const [id, schema] of Object.entries(COMPONENTS)) registry.add(schema, { id });
  const { schemas } = z.toJSONSchema(registry, { uri: (id) => `#/components/schemas/${id}` }) as {
    schemas: Record<string, Record<string, unknown>>;
  };
  return Object.fromEntries(Object.entries(schemas).map(([id, s]) => [id, open(s)]));
}

/** Query parameters, one by one, from their schema. */
function queryParameters(schema: z.ZodType = uploadQuerySchema) {
  const s = open(z.toJSONSchema(schema, { io: "input" })) as {
    properties: Record<string, Record<string, unknown>>;
  };
  return Object.entries(s.properties).map(([name, schema]) => {
    const { description, ...rest } = schema;
    return { name, in: "query", required: false, description, schema: rest };
  });
}

const ref = (id: Component) => ({ $ref: `#/components/schemas/${id}` });
const json = (id: Component, description: string) => ({
  description,
  content: { "application/json": { schema: ref(id) } },
});
const ERRORS = {
  "401": json("Error", "No valid token: `token_invalid`, `token_revoked`, `token_expired` or `token_inactive`."),
  "403": json(
    "Error",
    "`insufficient_scope` (the token lacks the scope), `forbidden` (its owner's role lacks the capability) or `account_disabled`.",
  ),
  "429": json("Error", "`rate_limited`: too many requests for this token. Honour `Retry-After`."),
};
const PROJECT = {
  name: "projectId",
  in: "path",
  required: true,
  description:
    "The project's id, or its case-ID prefix (`PHR`) when it is unique within the token's reach (409 `ambiguous_project` otherwise).",
  schema: { type: "string" },
};
const RUN_KEY = { name: "runKey", in: "path", required: true, description: "The run's key (`RUN-012`).", schema: { type: "string" } };
const NOT_FOUND = json("Error", "`not_found` or `run_not_found`: not in the token's reach, or it does not exist.");

/** The version of the v1 contract (VERSIONING §6.6): the minor grows with
 *  each additive change, the patch with corrections of the text. A new
 *  major is a new path (`/api/v2`). 1.1.0: runs and report uploads (A2). 1.1.1: findings and metrics are stored (A2b); the text changes, not the shapes. 1.2.0: read-only cases, cycles, defects and requirements with a cursor (A4). 1.3.0: `format=xcresult` for uploads (ING-07, F7). */
export const API_V1_CONTRACT_VERSION = "1.3.0";

/** The read paths of A4 (`v1.reads.ts`): a list and an item each. */
function readPaths(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of READ_RESOURCES) {
    const [list, one]: [Component, Component] =
      r.path === "cases" ? ["CaseList", "Case"] : r.path === "cycles" ? ["ItemList", "Cycle"] : ["ItemList", "Item"];
    out[`/projects/{projectId}/${r.path}`] = {
      get: {
        operationId: `list${r.noun}s`,
        summary: `The project's ${r.path} changed after a cursor, oldest change first.`,
        description: [
          `Scope \`${r.scope}\`. Read-only in v1.`,
          "Incremental: keep `nextCursor` and send it back as `updatedSince` to get only what changed since (more pages while `hasMore`). Deletions come as `deleted: true` without `data`, unless `includeDeleted=false`.",
          "`status` filters on the item's `status` field.",
        ].join("\n\n"),
        parameters: [PROJECT, ...queryParameters(readQuerySchema)],
        responses: { "200": json(list, `The ${r.path}.`), "400": json("Error", "`validation_error`: a bad cursor or limit."), "404": NOT_FOUND, ...ERRORS },
      },
    };
    out[`/projects/{projectId}/${r.path}/{key}`] = {
      get: {
        operationId: `get${r.noun}`,
        summary: `One ${r.noun.toLowerCase()}, by key or id.`,
        description: `Scope \`${r.scope}\`. A live item wins over a deleted one that once had the key.`,
        parameters: [
          PROJECT,
          {
            name: "key",
            in: "path",
            required: true,
            description: "Its key (`TC-001`, `CYC-003`, `DEF-007`, `REQ-002`) or its id.",
            schema: { type: "string" },
          },
        ],
        responses: { "200": json(one, `The ${r.noun.toLowerCase()}.`), "404": NOT_FOUND, ...ERRORS },
      },
    };
  }
  return out;
}

/** The document. */
export function buildOpenApi() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Pharos API",
      version: API_V1_CONTRACT_VERSION,
      description:
        "Public API of a Pharos server for CI and scripts. Authenticate with a project token or a personal access token: `Authorization: Bearer phr_…`. A token acts as its owner and never does more than the owner's current role allows. Retry only network errors, 429, 502, 503 and 504; an upload is idempotent (the same file in the same run answers 200 and writes nothing).",
    },
    servers: [{ url: "/api/v1" }],
    security: [{ token: [] }],
    paths: {
      "/me": {
        get: {
          operationId: "getMe",
          summary: "The token of the request and its owner.",
          responses: { "200": json("Me", "The token and its owner."), ...ERRORS },
        },
      },
      "/projects": {
        get: {
          operationId: "listProjects",
          summary: "Projects the token reaches.",
          description: "Scope `projects:read`. A project token lists only its project.",
          responses: { "200": json("ProjectList", "The projects."), ...ERRORS },
        },
      },
      "/projects/{projectId}": {
        get: {
          operationId: "getProject",
          summary: "One project.",
          description: "Scope `projects:read`. A project out of the token's reach is answered 404, like one that does not exist.",
          parameters: [PROJECT],
          responses: { "200": json("Project", "The project."), "404": NOT_FOUND, "409": json("Error", "`ambiguous_project`."), ...ERRORS },
        },
      },
      "/projects/{projectId}/results": {
        post: {
          operationId: "uploadResults",
          summary: "Upload one test report.",
          description: [
            "Scope `runs:write`. The body is the report file itself, one file per request (several files: several requests to the same run).",
            "Formats: Pharos Run JSON 1.x, JUnit XML, CTRF, Playwright JSON, Cucumber Messages (NDJSON), SARIF, axe-core JSON and k6 summary; `allure` and `trx` answer 422 `unsupported_format` until their parsers ship.",
            "`Content-Encoding: gzip` is accepted. The body is limited compressed (413) and once decompressed (413); a DTD in XML is refused (422 `invalid_report`, reason `doctype`); reading has a time limit (422 `report_timeout`). Errors never quote the file.",
            "The run: `runKey`, or `externalId` (created by the first upload, open until closed), or a new run closed as completed once imported. Case links are derived when read, from `@<prefix><n>` tags or `caseKey`.",
            "SARIF, axe and k6 bring findings and metrics instead of results: they are stored with the shard as the desktop stores them (ADR-0053) and counted in `counts.findings` and `counts.metrics`. A finding without its rule, severity, message or fingerprint, or a metric without a name or a finite value, is 422 `invalid_report` and nothing is written.",
          ].join("\n\n"),
          parameters: [PROJECT, ...queryParameters()],
          requestBody: {
            required: true,
            description: "The report file.",
            content: Object.fromEntries(
              ["application/xml", "application/json", "application/x-ndjson", "application/zip", "application/octet-stream"].map((t) => [
                t,
                { schema: { type: "string", format: "binary" } },
              ]),
            ),
          },
          responses: {
            "201": json("UploadResult", "A new shard was stored."),
            "200": json("UploadResult", "The same file was already in that run: nothing was written."),
            "400": json("Error", "`format_mismatch`, `validation_error` (bad parameters, empty body) or `token_in_url`."),
            "404": NOT_FOUND,
            "409": json("Error", "`run_closed` or `ambiguous_project`."),
            "413": json("Error", "`payload_too_large`: compressed or decompressed."),
            "415": json("Error", "`unsupported_media_type`: a Content-Encoding other than gzip."),
            "422": json("Error", "`invalid_report` (with `reason`), `report_timeout` or `unsupported_format`."),
            ...ERRORS,
          },
        },
      },
      "/projects/{projectId}/runs": {
        get: {
          operationId: "listRuns",
          summary: "The project's live runs, newest first.",
          description: "Scope `runs:read`.",
          parameters: [PROJECT],
          responses: { "200": json("RunList", "The runs."), "404": NOT_FOUND, ...ERRORS },
        },
        post: {
          operationId: "createRun",
          summary: "An empty open run to upload into.",
          description:
            "Scope `runs:write`. With `externalId`, the run of that id: created once (201), found afterwards (200), so any job of a CI matrix may call it.",
          parameters: [PROJECT],
          requestBody: { required: false, content: { "application/json": { schema: ref("RunCreate") } } },
          responses: {
            "201": json("Run", "The run, created."),
            "200": json("Run", "The run of that externalId, which already existed."),
            "404": NOT_FOUND,
            ...ERRORS,
          },
        },
      },
      "/projects/{projectId}/runs/{runKey}": {
        get: {
          operationId: "getRun",
          summary: "A run and its counts (final attempts by status, linked and unlinked results).",
          description: "Scope `runs:read`.",
          parameters: [PROJECT, RUN_KEY],
          responses: { "200": json("RunSummary", "The run."), "404": NOT_FOUND, ...ERRORS },
        },
      },
      "/projects/{projectId}/runs/{runKey}/results": {
        get: {
          operationId: "listRunResults",
          summary: "Every result of a run, with its derived case link.",
          description: "Scope `runs:read`.",
          parameters: [PROJECT, RUN_KEY],
          responses: { "200": json("ResultList", "The results."), "404": NOT_FOUND, ...ERRORS },
        },
      },
      "/projects/{projectId}/runs/{runKey}/close": {
        post: {
          operationId: "closeRun",
          summary: "Close an open run: completed (default) or aborted.",
          description: "Scope `runs:write`; the owner's role needs to execute runs.",
          parameters: [PROJECT, RUN_KEY],
          requestBody: { required: false, content: { "application/json": { schema: ref("RunClose") } } },
          responses: {
            "200": json("RunSummary", "The run, closed."),
            "404": NOT_FOUND,
            "409": json("Error", "`run_closed`: already closed."),
            ...ERRORS,
          },
        },
      },
      ...readPaths(),
    },
    components: {
      securitySchemes: {
        token: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "phr_prj_… (project token) or phr_pat_… (personal access token)",
          description: `Scopes: ${API_SCOPES.join(", ")}.`,
        },
      },
      schemas: components(),
    },
  };
}
