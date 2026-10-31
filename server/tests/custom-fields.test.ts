// Custom fields and case fields on the server (FLD-01, ADR-0018): the shared
// vectors, `custom_field` as an lww document (with the project cascade), the
// `custom-fields` feature that keeps the case fields of clients that do not
// know them, the stash for read-only clients, and the web's domain API.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { contentSha256, revisionContent, revisionId } from "../src/modules/sync/stable-steps";
import {
  CASE_FIELDS_STASH_KEY,
  fieldId,
  validateValue,
  validateValues,
  validKey,
  type FieldRule,
} from "../src/modules/domain/custom-fields";

const vectors = JSON.parse(
  readFileSync(new URL("../../src-tauri/tests/fixtures/custom-field-vectors.json", import.meta.url), "utf8"),
);

describe("shared vectors (the desktop and the client check the same file)", () => {
  it("ids and keys", () => {
    for (const v of vectors.ids) expect(fieldId(v.projectId, v.entity, v.fieldKey)).toBe(v.id);
    for (const k of vectors.keys) expect(validKey(k.key), k.key).toBe(k.valid);
  });
  it("values", () => {
    for (const v of vectors.values)
      expect(validateValue(v.field as FieldRule, v.value, v.previous), JSON.stringify(v).slice(0, 120)).toBe(v.error);
  });
  it("whole case saves", () => {
    for (const c of vectors.cases) {
      const got = validateValues(vectors.caseFields as FieldRule[], c.caseType, c.data, c.previous);
      if (c.error) expect(got, c.name).toEqual({ error: c.error });
      else expect(got, c.name).toEqual({ data: c.expected });
    }
  });
});

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
});

async function tokenFor(email = "fields@pharos.dev"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: "F", firstName: "A", lastName: "B" },
  });
  return res.json().accessToken as string;
}

type Headers = Record<string, string>;
const client = (token: string, features: string): Headers => ({
  authorization: `Bearer ${token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: features,
});
const BEFORE_FIELDS = "key-conflicts,append-only,complete-payload,stable-steps";
/** A build with stable steps but before FLD-01. */
const dat02 = (token: string) => client(token, BEFORE_FIELDS);
const current = (token: string) => client(token, `${BEFORE_FIELDS},custom-fields`);
/** 0.2.0-alpha.1: read-only. */
const alpha1 = (token: string) => client(token, "key-conflicts");

const H = (wall: number) => `${String(wall).padStart(15, "0")}-00000-desk`;
const push = (headers: Headers, deltas: unknown[]) =>
  app.inject({ method: "POST", url: "/sync/push", headers, payload: { deltas } });
const pull = async (headers: Headers) =>
  (await app.inject({ method: "GET", url: "/sync/pull?since=0", headers })).json();
const stored = async (entity: string, id: string) =>
  (await pool.query("SELECT payload, deleted FROM documents WHERE entity = $1 AND entity_id = $2", [entity, id]))
    .rows[0] as { payload: Record<string, unknown>; deleted: boolean } | undefined;

const caseDelta = (payload: Record<string, unknown>, revision: number, base?: number, wall = 10 + revision) => ({
  entity: "test_case",
  entityId: "c1",
  op: "upsert",
  revision,
  author: "u",
  hlc: H(wall),
  ...(base ? { baseRevision: base, baseHlc: H(10 + base) } : {}),
  payload: {
    id: "c1",
    projectId: "p1",
    scenarioId: "ATS_001",
    title: "Login",
    version: "1.0",
    status: "draft",
    priority: "medium",
    ...payload,
  },
});

const fieldDoc = (over: Record<string, unknown> = {}) => {
  const id = fieldId("p1", "test_case", "browser");
  return {
    entity: "custom_field",
    entityId: id,
    op: "upsert",
    revision: 1,
    author: "u",
    hlc: H(5),
    payload: {
      id,
      projectId: "p1",
      entity: "test_case",
      fieldKey: "browser",
      label: "Browser",
      fieldType: "select",
      options: [{ id: "OPT00001", label: "Chrome", archived: false }],
      position: 0,
      ...over,
    },
  };
};

describe("custom fields sync", () => {
  it("the server lists custom-fields", async () => {
    expect(SERVER_FEATURES).toContain("custom-fields");
    const body = await pull(current(await tokenFor()));
    expect(body.features).toContain("custom-fields");
  });

  it("a definition is an lww document, tombstoned with its project", async () => {
    const h = current(await tokenFor());
    const project = { entity: "project", entityId: "p1", op: "upsert", revision: 1, author: "u", hlc: H(1), payload: { id: "p1", name: "P" } };
    expect((await push(h, [project, fieldDoc()])).json().accepted).toBe(2);
    // A stale write loses like any lww entity.
    const stale = await push(h, [{ ...fieldDoc({ label: "Old" }), hlc: H(2) }]);
    expect(stale.json().conflicts).toHaveLength(1);
    await push(h, [{ ...project, op: "delete", revision: 2, hlc: H(50), baseRevision: 1, baseHlc: H(1) }]);
    expect((await stored("custom_field", fieldDoc().entityId))?.deleted).toBe(true);
  });

  it("a test_case push from a client without custom-fields keeps the case fields", async () => {
    const token = await tokenFor();
    await push(current(token), [
      caseDelta({ caseType: "checklist", automationStatus: "automated", data: { steps: [], custom: { browser: "OPT00001" } } }, 1),
    ]);
    // That client sends its whole state, but does not know these three.
    const res = await push(dat02(token), [caseDelta({ title: "Login v2", data: { steps: [] } }, 2, 1)]);
    expect(res.json().accepted).toBe(1);
    const p = (await stored("test_case", "c1"))!.payload;
    expect(p).toMatchObject({ title: "Login v2", caseType: "checklist", automationStatus: "automated" });
    expect(p.data).toEqual({ steps: [], custom: { browser: "OPT00001" } });
  });

  it("a current client clears what it leaves out", async () => {
    const token = await tokenFor();
    await push(current(token), [caseDelta({ caseType: "checklist", data: { custom: { a: 1 } } }, 1)]);
    await push(current(token), [caseDelta({ data: {} }, 2, 1)]);
    const p = (await stored("test_case", "c1"))!.payload;
    expect(p.caseType).toBeUndefined();
    expect(p.data).toEqual({});
  });

  it("a read-only client pulls the case fields in data, for its upgrade (0027)", async () => {
    const token = await tokenFor();
    await push(current(token), [caseDelta({ caseType: "checklist", automationStatus: null, data: { steps: [] } }, 1)]);
    const legacy = (await pull(alpha1(token))).docs.find((d: { entity: string }) => d.entity === "test_case");
    expect(legacy.payload.data[CASE_FIELDS_STASH_KEY]).toEqual({ caseType: "checklist" });
    const fresh = (await pull(current(token))).docs.find((d: { entity: string }) => d.entity === "test_case");
    expect(fresh.payload.data[CASE_FIELDS_STASH_KEY]).toBeUndefined();
  });
});

describe("custom fields through the web's domain API", () => {
  const api = (token: string) => {
    const headers = current(token);
    const call = async (method: "GET" | "POST" | "PUT", url: string, payload?: object) => {
      const res = await app.inject({ method, url, headers, payload });
      return { status: res.statusCode, body: res.body ? res.json() : null };
    };
    return call;
  };

  it("creates, edits, archives, reorders and copies definitions, with audit events", async () => {
    const call = api(await tokenFor());
    const projectId = (await call("POST", "/api/projects", { name: "Checkout" })).body.id;
    const browser = await call("POST", "/api/custom-fields", {
      projectId,
      fieldKey: "browser",
      label: "Browser",
      fieldType: "select",
      options: [{ label: "Chrome" }, { label: "Firefox" }],
    });
    expect(browser.status).toBe(200);
    expect(browser.body.id).toBe(fieldId(projectId, "test_case", "browser"));
    expect(browser.body.options.every((o: { id: string }) => o.id.length === 8)).toBe(true);
    // Same payload fields as the desktop's (the shared documents fixture).
    const fixture = JSON.parse(
      readFileSync(new URL("../../src/shared/contracts/fixtures/sync/documents.json", import.meta.url), "utf8"),
    );
    const want = fixture.docs.find((d: { entity: string }) => d.entity === "custom_field").payload;
    expect(Object.keys(browser.body).sort()).toEqual(Object.keys(want).sort());

    expect((await call("POST", "/api/custom-fields", { projectId, fieldKey: "browser", label: "B", fieldType: "text" })).status).toBe(409);
    expect((await call("POST", "/api/custom-fields", { projectId, fieldKey: "Bad", label: "B", fieldType: "text" })).body.message).toBe(
      "custom_field.key",
    );
    const points = (await call("POST", "/api/custom-fields", { projectId, fieldKey: "points", label: "Points", fieldType: "integer" })).body;
    const typeChange = await call("PUT", `/api/custom-fields/${browser.body.id}`, {
      input: { projectId, fieldKey: "browser", label: "B", fieldType: "text" },
    });
    expect(typeChange.body.message).toBe("custom_field.type_immutable");
    const renamed = await call("PUT", `/api/custom-fields/${browser.body.id}`, {
      input: { projectId, fieldKey: "browser", label: "Navegador", fieldType: "select", options: [browser.body.options[0]] },
      revision: browser.body.revision,
    });
    expect(renamed.body.options).toHaveLength(2);
    expect(renamed.body.options[1].archived).toBe(true);
    await call("POST", `/api/custom-fields/reorder`, { projectId, ids: [points.id] });
    const archived = await call("POST", `/api/custom-fields/${points.id}/archive`, { archived: true });
    expect(typeof archived.body.archivedAt).toBe("string");
    const list = (await call("GET", `/api/custom-fields?projectId=${projectId}`)).body;
    expect(list.map((f: { fieldKey: string }) => f.fieldKey)).toEqual(["points", "browser"]);

    const other = (await call("POST", "/api/projects", { name: "Other" })).body.id;
    const copy = await call("POST", "/api/custom-fields/copy", { fromProjectId: projectId, toProjectId: other });
    expect(copy.body).toEqual({ copied: 1, skipped: [] });

    const events = await pool.query(
      `SELECT payload->>'action' AS action FROM documents
        WHERE entity = 'audit_event' AND payload->>'entity' = 'custom_field'
        ORDER BY (payload->>'chainSeq')::bigint`,
    );
    // browser, points, rename, reorder (points first), archive, the copy.
    expect(events.rows.map((r) => r.action)).toEqual(["create", "create", "update", "update", "update", "update", "create"]);
  });

  it("a case save checks values, keeps what it does not send, and stores the desktop's revision", async () => {
    const call = api(await tokenFor());
    const projectId = (await call("POST", "/api/projects", { name: "Checkout" })).body.id;
    await call("POST", "/api/custom-fields", { projectId, fieldKey: "points", label: "Points", fieldType: "integer" });
    const bad = await call("POST", "/api/test-cases", { projectId, title: "Pay", data: { custom: { points: "x" } } });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe("custom_field.type:points");
    const created = (
      await call("POST", "/api/test-cases", {
        projectId,
        title: "Pay",
        automationStatus: "to_automate",
        data: { custom: { points: 3, unknown_key: true } },
      })
    ).body;
    expect(created).toMatchObject({ caseType: "standard", automationStatus: "to_automate" });
    const updated = (
      await call("PUT", `/api/test-cases/${created.id}`, {
        input: { projectId, title: "Pay v2", data: { notes: "x" } },
        revision: created.revision,
      })
    ).body;
    expect(updated.caseType).toBe("standard");
    expect(updated.data.custom).toEqual({ points: 3, unknown_key: true });

    // The revision document has the id the desktop computes for the same case.
    const fields = {
      scenarioId: updated.scenarioId,
      title: "Pay v2",
      version: "1.0",
      status: "draft",
      priority: "medium",
      caseType: "standard",
      automationStatus: "to_automate",
      data: updated.data,
    };
    const id = revisionId(created.id, updated.revision, contentSha256(revisionContent(fields)));
    expect(await stored("test_case_revision", id)).toBeDefined();

    const listed = (await call("GET", `/api/test-cases?projectId=${projectId}`)).body;
    expect(listed[0]).toMatchObject({ caseType: "standard", automationStatus: "to_automate", custom: { points: 3 } });
  });
});
