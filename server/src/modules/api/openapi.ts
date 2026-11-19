// The OpenAPI 3.1 contract of /api/v1 (INT-02, ADR-0052 §1), built from the
// zod schemas the routes answer with, so it cannot drift from them. It is
// served at /api/v1/openapi.json and versioned as
// docs/formats/openapi-v1.json (`tests/api.openapi.test.ts` holds them equal).
// v1 only grows: new paths, new optional fields. Objects are open
// (no `additionalProperties: false`) so a client accepts fields added later.
import { z } from "zod";
import { API_SCOPES } from "./scopes";
import {
  errorSchema,
  meSchema,
  projectListSchema,
  projectSchema,
  resultListSchema,
  runCloseSchema,
  runCreateSchema,
  runListSchema,
  runSchema,
  runSummarySchema,
  uploadFormatSchema,
  uploadQuerySchema,
  uploadResponseSchema,
} from "./v1.schemas";

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

/** The upload's query parameters, one by one, from their schema. */
function uploadParameters() {
  const s = open(z.toJSONSchema(uploadQuerySchema, { io: "input" })) as {
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
 *  major is a new path (`/api/v2`). 1.1.0: runs and report uploads (A2). */
export const API_V1_CONTRACT_VERSION = "1.1.0";

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
            "SARIF findings and k6/axe metrics are kept in the raw report until track F stores them (ADR-0053); `counts.findings` and `counts.metrics` are 0 until then and a `findings-in-raw-report` warning says how many.",
          ].join("\n\n"),
          parameters: [PROJECT, ...uploadParameters()],
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
