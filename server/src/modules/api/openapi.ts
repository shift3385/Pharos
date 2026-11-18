// The OpenAPI 3.1 contract of /api/v1 (INT-02, ADR-0052 §1), built from the
// zod schemas the routes answer with, so it cannot drift from them. It is
// served at /api/v1/openapi.json and versioned as
// docs/formats/openapi-v1.json (`tests/api.openapi.test.ts` holds them equal).
// v1 only grows: new paths, new optional fields. Objects are open
// (no `additionalProperties: false`) so a client accepts fields added later.
import { z } from "zod";
import { API_SCOPES } from "./scopes";
import { errorSchema, meSchema, projectListSchema, projectSchema } from "./v1.schemas";

const COMPONENTS = { Me: meSchema, Project: projectSchema, ProjectList: projectListSchema, Error: errorSchema };

/** JSON Schema of the components, with refs between them and every object
 *  left open. */
function components(): Record<string, unknown> {
  const registry = z.registry<{ id: string }>();
  for (const [id, schema] of Object.entries(COMPONENTS)) registry.add(schema, { id });
  const { schemas } = z.toJSONSchema(registry, { uri: (id) => `#/components/schemas/${id}` }) as {
    schemas: Record<string, Record<string, unknown>>;
  };
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
  return Object.fromEntries(Object.entries(schemas).map(([id, s]) => [id, open(s)]));
}

const ref = (id: keyof typeof COMPONENTS) => ({ $ref: `#/components/schemas/${id}` });
const json = (id: keyof typeof COMPONENTS, description: string) => ({
  description,
  content: { "application/json": { schema: ref(id) } },
});
const ERRORS = {
  "401": json("Error", "No valid token: `token_invalid`, `token_revoked`, `token_expired` or `token_inactive`."),
  "403": json("Error", "`insufficient_scope` (the token lacks the scope) or `forbidden` (its owner's role lacks the capability)."),
  "429": json("Error", "`rate_limited`: too many requests for this token."),
};

/** The version of the v1 contract (VERSIONING §6.6): the minor grows with
 *  each additive change, the patch with corrections of the text. A new
 *  major is a new path (`/api/v2`). */
export const API_V1_CONTRACT_VERSION = "1.0.0";

/** The document. */
export function buildOpenApi() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Pharos API",
      version: API_V1_CONTRACT_VERSION,
      description:
        "Public API of a Pharos server for CI and scripts. Authenticate with a project token or a personal access token: `Authorization: Bearer phr_…`. A token acts as its owner and never does more than the owner's current role allows.",
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
          parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": json("Project", "The project."), "404": json("Error", "`not_found`."), ...ERRORS },
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
