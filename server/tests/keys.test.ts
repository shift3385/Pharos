import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { readFileSync } from "node:fs";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";

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

async function tokenFor(email: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: "S", firstName: "A", lastName: "B" },
  });
  return res.json().accessToken as string;
}

const headers = (token: string) => ({
  authorization: `Bearer ${token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: "key-conflicts,stable-steps",
});

type Req = { projectId: string; kind: "case" | "requirement" | "defect"; prefix?: string; floor?: number };
async function lease(token: string, requests: Req[]) {
  const res = await app.inject({ method: "POST", url: "/sync/key-blocks", headers: headers(token), payload: { requests } });
  expect(res.statusCode).toBe(200);
  return res.json() as {
    blocks: { projectId: string; kind: string; start: number; end: number }[];
    refused: { projectId: string; kind: string }[];
  };
}

async function push(token: string, deltas: Record<string, unknown>[]) {
  const res = await app.inject({ method: "POST", url: "/sync/push", headers: headers(token), payload: { deltas } });
  expect(res.statusCode).toBe(200);
  return res.json() as {
    accepted: number;
    conflicts: unknown[];
    keyConflicts: { entity: string; entityId: string; key: string; takenBy: string }[];
  };
}

const caseDelta = (id: string, key: string, projectId = "p1", hlc = "000000000000100-00000-d") => ({
  entity: "test_case",
  entityId: id,
  op: "upsert",
  payload: { id, projectId, scenarioId: key, title: id },
  revision: 1,
  hlc,
});

describe("key blocks (DAT-01)", () => {
  it("hands out consecutive blocks of 50 from the device floor", async () => {
    const token = await tokenFor("a@pharos.dev");
    const first = await lease(token, [{ projectId: "p1", kind: "case", floor: 8 }]);
    expect(first.blocks).toEqual([{ projectId: "p1", kind: "case", start: 8, end: 57 }]);
    const second = await lease(token, [{ projectId: "p1", kind: "case", floor: 1 }]);
    expect(second.blocks[0]).toMatchObject({ start: 58, end: 107 });
    // Each kind has its own numbers.
    expect((await lease(token, [{ projectId: "p1", kind: "requirement" }])).blocks[0]).toMatchObject({
      start: 1,
      end: 50,
    });
  });

  it("never hands out the same range twice, even concurrently", async () => {
    const token = await tokenFor("a@pharos.dev");
    const results = await Promise.all(Array.from({ length: 12 }, () => lease(token, [{ projectId: "p1", kind: "case" }])));
    const starts = results.map((r) => r.blocks[0].start).sort((a, b) => a - b);
    expect(new Set(starts).size).toBe(12);
    starts.forEach((s, i) => expect(s).toBe(1 + i * 50));
  });

  it("starts above the keys of the series the server already stores for the project", async () => {
    const token = await tokenFor("a@pharos.dev");
    await push(token, [
      caseDelta("c1", "ATS_041"),
      caseDelta("c2", "TC-007"),
      caseDelta("c3", "ATS_?KQZD"),
      // A typed key of another series must not push the numbering.
      caseDelta("c4", "JIRA-48213"),
      caseDelta("c5", "ATS_X99"),
    ]);
    expect((await lease(token, [{ projectId: "p1", kind: "case", prefix: "ATS_" }])).blocks[0].start).toBe(42);
    // Without a prefix only the device floor counts.
    expect((await lease(token, [{ projectId: "p1", kind: "requirement", floor: 5 }])).blocks[0].start).toBe(5);
  });

  it("refuses blocks of a project owned by another account", async () => {
    const owner = await tokenFor("a@pharos.dev");
    const other = await tokenFor("b@pharos.dev");
    await push(owner, [{ entity: "project", entityId: "p1", op: "upsert", payload: { name: "P" }, revision: 1 }]);
    expect(await lease(other, [{ projectId: "p1", kind: "case" }])).toEqual({
      blocks: [],
      refused: [{ projectId: "p1", kind: "case" }],
    });
    // A project leased first by one account belongs to that account.
    await lease(owner, [{ projectId: "p2", kind: "case" }]);
    expect((await lease(other, [{ projectId: "p2", kind: "case" }])).refused).toHaveLength(1);
  });
});

describe("duplicate keys on push (DAT-01)", () => {
  it("rejects an upsert whose key another live document of the project uses", async () => {
    const token = await tokenFor("a@pharos.dev");
    expect((await push(token, [caseDelta("c1", "ATS_007")])).accepted).toBe(1);
    const res = await push(token, [caseDelta("c2", "ATS_007"), caseDelta("c3", "ATS_007", "p2")]);
    expect(res.accepted).toBe(1);
    expect(res.keyConflicts).toEqual([{ entity: "test_case", entityId: "c2", key: "ATS_007", takenBy: "c1" }]);
    const stored = await pool.query("SELECT entity_id FROM documents WHERE entity = 'test_case' ORDER BY entity_id");
    expect(stored.rows.map((r) => r.entity_id)).toEqual(["c1", "c3"]);
  });

  it("answers 426 to a client that cannot read keyConflicts, instead of a silent refusal", async () => {
    const token = await tokenFor("a@pharos.dev");
    await push(token, [caseDelta("c1", "ATS_007")]);
    // A client that does not read keyConflicts (only the read-only gate of
    // DAT-02 is passed, to reach the key check).
    const old = { authorization: `Bearer ${token}`, [VERSION_HEADER]: SERVER_VERSION, [FEATURES_HEADER]: "stable-steps" };
    const res = await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: old,
      payload: { deltas: [caseDelta("c2", "ATS_007")] },
    });
    expect(res.statusCode).toBe(426);
    expect(res.json().code).toBe("unsupported_client_version");
    const stored = await pool.query("SELECT entity_id FROM documents WHERE entity = 'test_case'");
    expect(stored.rows.map((r) => r.entity_id)).toEqual(["c1"]);
    // Without a key conflict it syncs as before.
    const fine = await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: old,
      payload: { deltas: [caseDelta("c3", "ATS_008")] },
    });
    expect(fine.statusCode).toBe(200);
  });

  it("lets an entity keep its own key; deleted and provisional keys never collide", async () => {
    const token = await tokenFor("a@pharos.dev");
    await push(token, [caseDelta("c1", "ATS_007")]);
    // The same entity again (an edit) is not a duplicate.
    const edit = { ...caseDelta("c1", "ATS_007", "p1", "000000000000200-00000-d"), revision: 2 };
    expect((await push(token, [edit])).keyConflicts).toEqual([]);
    // Provisional keys are local and never collide.
    expect((await push(token, [caseDelta("pa", "ATS_?AAAA"), caseDelta("pb", "ATS_?AAAA")])).keyConflicts).toEqual([]);
    // A deleted document no longer holds its key on the server (the desktop
    // still never hands it out again, ADR-0010).
    await push(token, [
      { entity: "test_case", entityId: "c1", op: "delete", payload: {}, revision: 3, hlc: "000000000000300-00000-d" },
    ]);
    expect((await push(token, [caseDelta("c9", "ATS_007")])).keyConflicts).toEqual([]);
  });

  it("migration 0006 renames duplicates already stored, keeping the lowest id", async () => {
    await tokenFor("a@pharos.dev");
    const { rows } = await pool.query<{ id: string }>("SELECT id FROM users LIMIT 1");
    await pool.query(
      `INSERT INTO documents (user_id, entity, entity_id, payload, revision, hlc) VALUES
         ($1, 'test_case', 'b', '{"projectId":"p1","scenarioId":"ATS_004"}', 1, 'h'),
         ($1, 'test_case', 'a', '{"projectId":"p1","scenarioId":"ATS_004"}', 1, 'h'),
         ($1, 'test_case', 'c', '{"projectId":"p1","scenarioId":"ATS_004"}', 1, 'h'),
         ($1, 'requirement', 'r2', '{"projectId":"p1","requirementKey":"REQ-001"}', 1, 'h'),
         ($1, 'requirement', 'r1', '{"projectId":"p1","requirementKey":"REQ-001"}', 1, 'h'),
         ($1, 'test_case', 'elsewhere', '{"projectId":"p2","scenarioId":"ATS_004"}', 1, 'h')`,
      [rows[0].id],
    );
    const before = Number((await pool.query("SELECT max(seq) AS s FROM documents")).rows[0].s);
    await pool.query(readFileSync(new URL("../migrations/0006_document_keys.sql", import.meta.url), "utf8"));
    const after = await pool.query(
      `SELECT entity_id, coalesce(payload->>'scenarioId', payload->>'requirementKey') AS key, revision, seq
         FROM documents ORDER BY entity_id`,
    );
    const byId = Object.fromEntries(after.rows.map((r) => [r.entity_id, r]));
    expect([byId.a.key, byId.b.key, byId.c.key]).toEqual(["ATS_004", "ATS_004-dup1", "ATS_004-dup2"]);
    expect([byId.r1.key, byId.r2.key]).toEqual(["REQ-001", "REQ-001-dup1"]);
    expect(byId.elsewhere.key).toBe("ATS_004");
    expect(byId.b.revision).toBe(2);
    expect(Number(byId.b.seq)).toBeGreaterThan(before);
    expect(Number(byId.a.seq)).toBeLessThanOrEqual(before);
  });
});
