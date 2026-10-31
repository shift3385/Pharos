import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { readFileSync } from "node:fs";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { encodeHlc, parseHlc, recvHlc, tickHlc } from "../src/modules/sync/sync.hlc";

// The sync fixtures shared with the desktop and the client (BASE-05,
// ADR-0026), in src/shared/contracts/fixtures/sync/.

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../src/shared/contracts/fixtures/sync/${name}`, import.meta.url), "utf8"));

type H = { wallMs: number; counter: number; deviceId: string };

/** The desktop's timestamp form (SQLite `datetime('now')`, UTC). */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

describe("HLC (shared fixture)", () => {
  const f = fixture("hlc.json");
  it("encodes, parses, orders, ticks and receives like the desktop and the client", () => {
    for (const { hlc, text } of f.encode as { hlc: H; text: string }[]) {
      expect(encodeHlc(hlc)).toBe(text);
      expect(parseHlc(text)).toEqual(hlc);
    }
    for (const text of f.invalid as string[]) expect(parseHlc(text), text).toBeNull();
    const sorted = f.sorted as string[];
    expect([...sorted].sort()).toEqual(sorted);
    for (const c of f.tick) expect(tickHlc(c.prev, c.nowMs, c.deviceId)).toEqual(c.next);
    for (const c of f.recv) expect(recvHlc(c.prev, c.remote, c.nowMs, c.deviceId)).toEqual(c.next);
  });
});

describe("documents written by the web (shared fixture)", () => {
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

  const kind = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

  it("have the fields and value types of the desktop's documents", async () => {
    const reg = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "contract@pharos.dev", password: "supersecret1", displayName: "C", firstName: "A", lastName: "B" },
    });
    const headers = {
      authorization: `Bearer ${reg.json().accessToken}`,
      [VERSION_HEADER]: SERVER_VERSION,
      [FEATURES_HEADER]: "key-conflicts,stable-steps",
    };
    const post = async (url: string, payload: object) => (await app.inject({ method: "POST", url, headers, payload })).json();
    const project = await post("/api/projects", { name: "Checkout" });
    const projectId = project.id as string;
    await post("/api/test-plans", { projectId, title: "Plan", author: "QA", data: {}, planDate: "2026-11-01" });
    await post("/api/test-cases", { projectId, title: "Pay", author: "QA", data: {} });
    await post("/api/requirements", { projectId, title: "Cards" });
    await post("/api/planner-cards", { projectId, kind: "defect", title: "Bug", data: {} });

    const pulled = (await app.inject({ method: "GET", url: "/sync/pull?since=0", headers })).json().docs as {
      entity: string;
      payload: Record<string, unknown>;
    }[];
    const docs = fixture("documents.json").docs as { entity: string; payload: Record<string, unknown> }[];
    for (const want of docs) {
      const got = pulled.find((d) => d.entity === want.entity);
      expect(got, want.entity).toBeDefined();
      expect(Object.keys(got!.payload).sort(), want.entity).toEqual(Object.keys(want.payload).sort());
      for (const [key, value] of Object.entries(want.payload)) {
        expect(kind(got!.payload[key]), `${want.entity}.${key}`).toBe(kind(value));
      }
      // One timestamp form on both sides: they sort as text.
      for (const key of ["createdAt", "updatedAt"]) {
        expect(got!.payload[key], `${want.entity}.${key}`).toMatch(TIMESTAMP);
        expect(want.payload[key], `fixture ${want.entity}.${key}`).toMatch(TIMESTAMP);
      }
    }
  });
});
