// Upgrade from a 0.4 server (ADR-0019 «Test de actualización», ADR-0042 §9):
// a store as 0.4 left it (per user; one user with two devices whose payloads
// carry different workspace ids, web writes with "local", the web audit chain,
// key blocks) goes through migration 0019, and then two clients of the same
// user, a 0.4 one and a current one, see the same data.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool, type PoolClient } from "pg";
import { buildApp } from "../src/app";
import { hashPassword } from "../src/modules/auth/password";
import { buildEvent } from "../src/modules/audit/audit.store";
import { verifyChain, type AuditEvent } from "../src/modules/audit/audit.chain";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { TEST_DATABASE_URL, testEnv } from "./helpers";
import { applyMigration, schemaAt } from "./schema-at";

const SCHEMA = "mig_0019";
let client: PoolClient;
let drop: () => Promise<void>;
let pool: Pool;
let app: FastifyInstance;
let schemaPool: Pool;
const users: Record<string, string> = {};
const before: Record<string, unknown>[] = [];
let webEvents: AuditEvent[] = [];

const H = (n: number) => `${String(n).padStart(15, "0")}-00000-dev`;

async function seed04(c: PoolClient) {
  const hash = await hashPassword("supersecret1");
  for (const name of ["ana", "bea"]) {
    users[name] = (
      await c.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, display_name, first_name, last_name)
         VALUES ($1, $2, $3, 'F', 'L') RETURNING id`,
        [`${name}@pharos.dev`, hash, name],
      )
    ).rows[0].id;
  }
  const doc = (user: string, entity: string, id: string, payload: object, deleted = false) =>
    c.query(
      `INSERT INTO documents (user_id, entity, entity_id, payload, revision, author, deleted, hlc)
       VALUES ($1, $2, $3, $4, 1, 'dev', $5, $6)`,
      [user, entity, id, payload, deleted, H(before.length + 1)],
    );
  // Ana's two devices each had their own random "My workspace".
  await doc(users.ana, "project", "p1", { id: "p1", name: "Pagos", workspaceId: "dev-a-ws", ownerId: users.ana });
  await doc(users.ana, "test_case", "c1", { id: "c1", projectId: "p1", title: "Pago", workspaceId: "dev-b-ws" });
  // The web wrote "local".
  await doc(users.ana, "requirement", "r1", { id: "r1", projectId: "p1", requirementKey: "REQ-001", workspaceId: "local" });
  await doc(users.ana, "test_case", "gone", { id: "gone", projectId: "p1", workspaceId: "dev-a-ws" }, true);
  // A compacted tombstone carries no location.
  await doc(users.ana, "test_case", "old", {}, true);
  await doc(users.bea, "project", "p9", { id: "p9", name: "Bea", workspaceId: "dev-c-ws", ownerId: users.bea });
  // Ana's web audit chain ("web"), as 0.4 wrote it.
  webEvents = [];
  let prev: { seq: number; hash: string } | null = null;
  for (const [i, entityId] of ["p1", "r1"].entries()) {
    const ev = buildEvent(
      { userId: users.ana, action: "create", entity: i ? "requirement" : "project", entityId, projectId: "p1", entityKey: null, changes: { name: [null, "x"] }, summary: null },
      prev,
      { id: `ev${i}`, at: `2026-11-0${i + 1}T10:00:00.000Z`, hlc: H(20 + i) },
    );
    webEvents.push(ev);
    prev = { seq: ev.chainSeq, hash: ev.hash };
    await c.query(
      `INSERT INTO documents (user_id, entity, entity_id, payload, revision, author, deleted, hlc)
       VALUES ($1, 'audit_event', $2, $3, 1, $4, false, $5)`,
      [users.ana, ev.id, ev, ev.actor, ev.hlc],
    );
  }
  await c.query(
    `INSERT INTO audit_chain_heads (user_id, device_id, chain_workspace_id, chain_owner, seq, hash)
     VALUES ($1, 'web', 'web', $4, $2, $3)`,
    [users.ana, prev!.seq, prev!.hash, users.ana],
  );
  await c.query(`INSERT INTO key_blocks (project_id, kind, owner_id, next_value) VALUES ('p1', 'case', $1, 51)`, [users.ana]);
  before.push(...(await c.query("SELECT user_id, entity, entity_id, revision, hlc, deleted FROM documents ORDER BY entity_id")).rows);
}

beforeAll(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  ({ client, drop } = await schemaAt(pool, SCHEMA, "0018_audit_read_index.sql"));
  await seed04(client);
  await applyMigration(client, "0019_workspaces.sql");
  schemaPool = new Pool({ connectionString: TEST_DATABASE_URL, options: `-c search_path=${SCHEMA}` });
  app = buildApp({ pool: schemaPool, env: testEnv });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await schemaPool.end();
  await drop();
  await pool.end();
});

const personal = async (user: string) =>
  (await client.query<{ id: string }>("SELECT id FROM workspaces WHERE created_by = $1 AND kind = 'personal'", [user])).rows[0].id;

describe("migration 0019 on a 0.4 store", () => {
  it("gives every user a personal workspace and keeps every document, one to one", async () => {
    const after = (
      await client.query(
        `SELECT w.created_by AS user_id, d.author_user_id, d.entity, d.entity_id, d.revision, d.hlc, d.deleted
           FROM documents d JOIN workspaces w ON w.id = d.workspace_id ORDER BY d.entity_id`,
      )
    ).rows;
    expect(after.map(({ author_user_id: _a, ...r }) => r)).toEqual(before);
    for (const r of after) expect(r.author_user_id).toBe(r.user_id);
    const pk = await client.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'documents_pkey'`,
    );
    expect(pk.rows[0].def).toBe("PRIMARY KEY (workspace_id, entity, entity_id)");
  });

  it("rewrites the meaningless workspaceId of payloads, and only where there was one", async () => {
    const ana = await personal(users.ana);
    const bea = await personal(users.bea);
    const ws = Object.fromEntries(
      (await client.query("SELECT entity_id, payload->'workspaceId' AS w FROM documents")).rows.map((r) => [r.entity_id, r.w]),
    );
    expect(ws).toMatchObject({ p1: ana, c1: ana, r1: ana, gone: ana, p9: bea, old: null });
  });

  it("keeps the 0.4 web chain valid and moves key blocks and chain heads to the workspace", async () => {
    const ana = await personal(users.ana);
    const events = (
      await client.query<{ payload: AuditEvent }>("SELECT payload FROM documents WHERE entity = 'audit_event'")
    ).rows.map((r) => ({ ...r.payload, chainSeq: Number(r.payload.chainSeq) }));
    expect(events.every((e) => e.workspaceId === ana && e.chainWorkspaceId === "web")).toBe(true);
    expect(verifyChain(events)).toEqual({ ok: true, count: 2 });
    expect((await client.query("SELECT workspace_id FROM key_blocks")).rows).toEqual([{ workspace_id: ana }]);
    expect((await client.query("SELECT workspace_id FROM audit_chain_heads")).rows).toEqual([{ workspace_id: ana }]);
  });

  it("a new account gets its personal workspace from the trigger", async () => {
    const id = (
      await client.query<{ id: string }>(
        "INSERT INTO users (email, password_hash, display_name, first_name, last_name) VALUES ('new@pharos.dev', 'x', 'n', 'F', 'L') RETURNING id",
      )
    ).rows[0].id;
    expect((await client.query("SELECT role FROM workspace_members WHERE user_id = $1", [id])).rows).toEqual([{ role: "test_manager" }]);
  });
});

describe("two clients of the same user after the upgrade", () => {
  async function login(): Promise<string> {
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "ana@pharos.dev", password: "supersecret1" } });
    expect(res.statusCode).toBe(200);
    return res.json().accessToken;
  }
  const [major, minor] = SERVER_VERSION.split(".").map(Number);
  const old = (token: string) => ({
    authorization: `Bearer ${token}`,
    [VERSION_HEADER]: `${major}.${minor - 1}.0`,
    [FEATURES_HEADER]: SERVER_FEATURES.filter((f) => f !== "workspaces").join(","),
  });
  const now = (token: string) => ({
    authorization: `Bearer ${token}`,
    [VERSION_HEADER]: SERVER_VERSION,
    [FEATURES_HEADER]: SERVER_FEATURES.join(","),
  });
  const ids = (docs: { entityId: string }[]) => docs.map((d) => d.entityId).sort();

  it("see the same documents; the old one reads, the current one also writes", async () => {
    const token = await login();
    const ws = await personal(users.ana);
    const oldPull = (await app.inject({ method: "GET", url: "/sync/pull?since=0", headers: old(token) })).json();
    const newPull = (await app.inject({ method: "GET", url: `/sync/pull?since=0&workspace=${ws}`, headers: now(token) })).json();
    expect(ids(oldPull.docs)).toEqual(ids(newPull.docs));
    expect(ids(newPull.docs)).toEqual(["c1", "ev0", "ev1", "gone", "old", "p1", "r1"]);
    // Bea's data never reaches Ana.
    expect(ids(newPull.docs)).not.toContain("p9");
    const push = (headers: Record<string, string>, payload: object) =>
      app.inject({ method: "POST", url: "/sync/push", headers, payload });
    const edit = {
      deltas: [{ entity: "test_case", entityId: "c1", op: "upsert", revision: 2, author: "A", hlc: H(99), payload: { id: "c1", projectId: "p1", title: "Pago 2" } }],
    };
    expect((await push(old(token), edit)).json().code).toBe("read_only_client_version");
    expect((await push(now(token), { ...edit, workspaceId: ws })).json()).toMatchObject({ accepted: 1, rejected: [] });
  });
});
