// `data` of a requirement (IA-17, ADR-0036): the AI provenance and the sources
// of a requirement proposed by the AI. The web API stores it, keeps it when an
// input leaves it out, and the `requirement-data` sync feature keeps it when a
// client that does not know it pushes the requirement.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import {
  FEATURES_HEADER,
  SERVER_FEATURES,
  SERVER_VERSION,
  VERSION_HEADER,
} from "../src/modules/sync/sync.version";

let app: FastifyInstance;
let pool: Pool;

beforeAll(async () => {
  ({ app, pool } = await setupTestApp());
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  await pool.query("TRUNCATE key_blocks");
});

async function register(email = "reqdata@pharos.dev"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email,
      password: "supersecret1",
      displayName: "R",
      firstName: "A",
      lastName: "B",
    },
  });
  return res.json().accessToken as string;
}

const headers = (token: string, features: string) => ({
  authorization: `Bearer ${token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: features,
});
/** A desktop build before IA-17: it sends its whole state, without `data`. */
const BEFORE =
  "key-conflicts,append-only,complete-payload,stable-steps,runs,custom-fields,cycles,defects";

type Method = "GET" | "POST" | "PUT";
async function call(
  token: string,
  method: Method,
  url: string,
  payload?: unknown,
) {
  const res = await app.inject({
    method,
    url,
    headers: headers(token, "key-conflicts"),
    payload: payload as object,
  });
  return { status: res.statusCode, body: res.body ? res.json() : undefined };
}

const DATA = {
  aiProvenance: {
    requirement: {
      provider: "ollama",
      model: "m",
      generatedAt: "2026-11-07T00:00:00Z",
    },
  },
  sources: [{ kind: "file", path: "docs/spec.md", startLine: 4, endLine: 9 }],
};

async function newRequirement(token: string) {
  const project = (await call(token, "POST", "/api/projects", { name: "P" }))
    .body as { id: string };
  const res = await call(token, "POST", "/api/requirements", {
    projectId: project.id,
    title: "Pay",
    data: DATA,
  });
  expect(res.status).toBe(200);
  return {
    projectId: project.id,
    req: res.body as { id: string; data: unknown },
  };
}

describe("requirement data", () => {
  it("the server lists requirement-data", () => {
    expect(SERVER_FEATURES).toContain("requirement-data");
  });

  it("the web API stores it, keeps it when left out and replaces it with an object", async () => {
    const token = await register();
    const { projectId, req } = await newRequirement(token);
    expect(req.data).toEqual(DATA);

    await call(token, "PUT", `/api/requirements/${req.id}`, {
      input: { projectId, title: "Pay fast" },
    });
    let got = (await call(token, "GET", `/api/requirements/${req.id}`)).body;
    expect(got).toMatchObject({ title: "Pay fast", data: DATA });

    await call(token, "PUT", `/api/requirements/${req.id}`, {
      input: { projectId, title: "Pay fast", data: {} },
    });
    got = (await call(token, "GET", `/api/requirements/${req.id}`)).body;
    expect(got.data).toEqual({});

    const bad = await call(token, "POST", "/api/requirements", {
      projectId,
      title: "X",
      data: ["no"],
    });
    expect(bad.status).toBe(400);
  });

  it("a push from a client without requirement-data keeps the stored data", async () => {
    const token = await register();
    const { req } = await newRequirement(token);
    const { rows } = await pool.query<{
      payload: Record<string, unknown>;
      revision: number;
      hlc: string;
    }>(
      "SELECT payload, revision, hlc FROM documents WHERE entity = 'requirement' AND entity_id = $1",
      [req.id],
    );
    const { data: _dropped, ...older } = rows[0].payload;
    const res = await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: headers(token, BEFORE),
      payload: {
        deltas: [
          {
            entity: "requirement",
            entityId: req.id,
            op: "upsert",
            revision: rows[0].revision + 1,
            author: "u",
            hlc: "999999999999999-00000-desk",
            baseRevision: rows[0].revision,
            baseHlc: rows[0].hlc,
            payload: { ...older, title: "Pay v2" },
          },
        ],
      },
    });
    expect(res.json().accepted).toBe(1);
    const got = (await call(token, "GET", `/api/requirements/${req.id}`)).body;
    expect(got).toMatchObject({ title: "Pay v2", data: DATA });
  });
});
