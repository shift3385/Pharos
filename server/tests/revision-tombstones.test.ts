import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { applyMigration, schemaAt } from "./schema-at";
import { createSyncRepository } from "../src/modules/sync/sync.repository";
import {
  FEATURES_HEADER,
  SERVER_FEATURES,
  SERVER_VERSION,
  VERSION_HEADER,
} from "../src/modules/sync/sync.version";

// Case revisions follow their project's delete (SYNC-11, ADR-0051): the
// cascade tombstones them (`deletedWith`), spares one another project's live
// result points to, brings them back with the project, and migration 0028
// repairs the projects deleted before.

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

const H = (n: number) => `${String(n).padStart(15, "0")}-00000-dev`;

async function login(): Promise<Record<string, string>> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email: "rev@pharos.dev",
      password: "supersecret1",
      displayName: "rev",
      firstName: "F",
      lastName: "L",
    },
  });
  return {
    authorization: `Bearer ${res.json().accessToken}`,
    [VERSION_HEADER]: SERVER_VERSION,
    [FEATURES_HEADER]: SERVER_FEATURES.join(","),
  };
}
const push = (headers: Record<string, string>, deltas: object[]) =>
  app.inject({
    method: "POST",
    url: "/sync/push",
    headers,
    payload: { deltas },
  });

/** A project delta on top of `base` ([revision, hlc] the server holds). */
const project = (
  id: string,
  op: "upsert" | "delete",
  revision: number,
  hlc: number,
  base?: [number, number],
) => ({
  entity: "project",
  entityId: id,
  op,
  revision,
  author: "A",
  hlc: H(hlc),
  baseRevision: base ? base[0] : null,
  baseHlc: base ? H(base[1]) : null,
  payload: { id, name: `P ${id}`, caseIdPrefix: "CP-" },
});
const revision = (id: string, projectId: string) => ({
  entity: "test_case_revision",
  entityId: id,
  op: "append",
  revision: 1,
  author: "A",
  hlc: H(5),
  payload: {
    id,
    testCaseId: `case-${id}`,
    projectId,
    revision: 1,
    title: "T",
    contentSha256: id,
  },
});

async function rows(): Promise<
  Record<
    string,
    { deleted: boolean; deletedWith: string | null; projectId: string | null }
  >
> {
  const { rows } = await pool.query<{
    entity_id: string;
    deleted: boolean;
    payload: Record<string, unknown>;
  }>(
    "SELECT entity_id, deleted, payload FROM documents WHERE entity = 'test_case_revision'",
  );
  return Object.fromEntries(
    rows.map((r) => [
      r.entity_id,
      {
        deleted: r.deleted,
        deletedWith: (r.payload.deletedWith as string) ?? null,
        projectId: (r.payload.projectId as string) ?? null,
      },
    ]),
  );
}

describe("case revisions and their project's delete (SYNC-11)", () => {
  it("deleting a project tombstones its revisions, keeping their content until the purge", async () => {
    const h = await login();
    await push(h, [
      project("p1", "upsert", 1, 1),
      project("p2", "upsert", 1, 2),
      revision("r1", "p1"),
      revision("r2", "p2"),
    ]);
    const res = await push(h, [project("p1", "delete", 2, 10, [1, 1])]);
    expect(res.json().accepted).toBe(1);
    expect(await rows()).toEqual({
      r1: { deleted: true, deletedWith: "p1", projectId: "p1" },
      r2: { deleted: false, deletedWith: null, projectId: "p2" },
    });
    // The purge (SYNC-06) leaves it without content.
    await pool.query(
      "UPDATE documents SET updated_at = now() - interval '40 days' WHERE entity = 'test_case_revision'",
    );
    expect(
      await createSyncRepository(pool).compactTombstones(30),
    ).toBeGreaterThan(0);
    const { rows: purged } = await pool.query(
      "SELECT entity_id FROM documents WHERE entity = 'test_case_revision' AND payload = '{}'::jsonb",
    );
    expect(purged.map((r) => r.entity_id)).toEqual(["r1"]);
  });

  it("spares a revision that a live result of another project points to", async () => {
    const h = await login();
    await push(h, [
      project("p1", "upsert", 1, 1),
      revision("r1", "p1"),
      revision("r2", "p1"),
    ]);
    const { rows: ws } = await pool.query(
      "SELECT workspace_id FROM documents WHERE entity = 'project' LIMIT 1",
    );
    await pool.query(
      `INSERT INTO documents (workspace_id, entity, entity_id, payload, revision, author, deleted, hlc, updated_at, seq)
       VALUES ($1, 'result', 'res-x', $2, 1, 'A', false, $3, now(), nextval('documents_seq'))`,
      [
        ws[0].workspace_id,
        { id: "res-x", projectId: "p-other", testCaseRevisionId: "r1" },
        H(6),
      ],
    );
    await push(h, [project("p1", "delete", 2, 10, [1, 1])]);
    const after = await rows();
    expect(after.r1.deleted).toBe(false);
    expect(after.r2.deleted).toBe(true);
  });

  it("a revision pushed after the delete arrives as a tombstone", async () => {
    const h = await login();
    await push(h, [project("p1", "upsert", 1, 1)]);
    await push(h, [project("p1", "delete", 2, 10, [1, 1])]);
    await push(h, [revision("late", "p1")]);
    expect((await rows()).late).toEqual({
      deleted: true,
      deletedWith: "p1",
      projectId: "p1",
    });
  });

  it("brings the revisions back when the project comes back", async () => {
    const h = await login();
    await push(h, [project("p1", "upsert", 1, 1), revision("r1", "p1")]);
    await push(h, [project("p1", "delete", 2, 10, [1, 1])]);
    // Another device kept its edit in the conflict: the project lives again.
    const back = await push(h, [project("p1", "upsert", 3, 20, [2, 10])]);
    expect(back.json().accepted).toBe(1);
    expect((await rows()).r1).toEqual({
      deleted: false,
      deletedWith: null,
      projectId: "p1",
    });
  });
});

describe("migration 0028 on projects deleted before SYNC-11", () => {
  it("tombstones their revisions, except those another project's live result uses, and leaves moves alone", async () => {
    const { client, drop } = await schemaAt(
      pool,
      "mig_0028",
      "0027_account_disable.sql",
    );
    try {
      await client.query("TRUNCATE users CASCADE");
      const user = (
        await client.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, display_name, first_name, last_name)
           VALUES ('m@pharos.dev', 'x', 'm', 'F', 'L') RETURNING id`,
        )
      ).rows[0].id;
      const ws = (
        await client.query<{ id: string }>(
          "SELECT id FROM workspaces WHERE created_by = $1",
          [user],
        )
      ).rows[0].id;
      const doc = (
        entity: string,
        id: string,
        payload: object,
        deleted = false,
        hlc = 1,
      ) =>
        client.query(
          `INSERT INTO documents (workspace_id, entity, entity_id, payload, revision, author, deleted, hlc, updated_at, seq)
           VALUES ($1, $2, $3, $4, 1, 'A', $5, $6, now(), nextval('documents_seq'))`,
          [ws, entity, id, payload, deleted, H(hlc)],
        );
      await doc("project", "gone", { id: "gone" }, true, 50);
      await doc("project", "moved", { movedTo: "elsewhere" }, true, 50);
      await doc("project", "live", { id: "live" });
      await doc(
        "test_case_revision",
        "r-gone",
        { id: "r-gone", projectId: "gone" },
        false,
        3,
      );
      await doc("test_case_revision", "r-kept", {
        id: "r-kept",
        projectId: "gone",
      });
      await doc("test_case_revision", "r-moved", {
        id: "r-moved",
        projectId: "moved",
      });
      await doc("test_case_revision", "r-live", {
        id: "r-live",
        projectId: "live",
      });
      await doc("result", "res", {
        id: "res",
        projectId: "live",
        testCaseRevisionId: "r-kept",
      });
      await applyMigration(client, "0028_revision_tombstones.sql");
      const { rows } = await client.query<{
        entity_id: string;
        deleted: boolean;
        dw: string | null;
        hlc: string;
      }>(
        `SELECT entity_id, deleted, payload->>'deletedWith' AS dw, hlc FROM documents
          WHERE entity = 'test_case_revision' ORDER BY entity_id`,
      );
      expect(rows).toEqual([
        { entity_id: "r-gone", deleted: true, dw: "gone", hlc: H(50) },
        { entity_id: "r-kept", deleted: false, dw: null, hlc: H(1) },
        { entity_id: "r-live", deleted: false, dw: null, hlc: H(1) },
        { entity_id: "r-moved", deleted: false, dw: null, hlc: H(1) },
      ]);
    } finally {
      await drop();
    }
  });
});
