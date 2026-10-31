// Stable steps and case revisions on the server (DAT-02, ADR-0011): the shared
// vectors, the read-only gate for clients without `stable-steps` (VERSIONING
// §6.5), the text-step shape they pull, the append rules of
// `test_case_revision`, and the web's writes.
import { readFileSync } from "node:fs";
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
import {
  contentSha256,
  deriveId,
  flattenCaseData,
  jcs,
  normalizeCaseData,
  revisionContent,
  revisionId,
  STASH_KEY,
  align,
} from "../src/modules/sync/stable-steps";

const vectors = JSON.parse(
  readFileSync(
    new URL(
      "../../src-tauri/tests/fixtures/stable-steps-vectors.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("shared vectors (the desktop checks the same file)", () => {
  it("JCS", () => {
    for (const v of vectors.jcs) expect(jcs(v.input)).toBe(v.output);
  });
  it("derived ids", () => {
    for (const v of vectors.derivedIds)
      expect(deriveId(v.caseId, v.list, v.index, new Set(v.used))).toBe(v.id);
  });
  it("normalization, idempotent", () => {
    for (const v of vectors.normalize) {
      const { data, changed } = normalizeCaseData(v.caseId, v.input);
      expect(data, v.name).toEqual(v.output);
      expect(changed, v.name).toBe(jcs(v.input) !== jcs(v.output));
      expect(normalizeCaseData(v.caseId, data).changed, v.name).toBe(false);
    }
  });
  it("align (rule 9)", () => {
    for (const v of vectors.align) expect(align(v.prev, v.next)).toEqual(v.out);
  });
  it("revision hashes and ids", () => {
    for (const v of vectors.revisions) {
      const sha = contentSha256(revisionContent(v.content));
      expect(sha).toBe(v.contentSha256);
      expect(revisionId(v.caseId, v.revision, sha)).toBe(v.id);
    }
  });
  it("flattening gives an older client back the text steps it wrote", () => {
    const legacy = {
      gherkinLevel: "advanced",
      preconditions: ["p"],
      steps: ["a", "b"],
      background: ["bg"],
      examples: { headers: ["x"], rows: [["1"], ["2"]] },
      flows: [
        {
          id: "f",
          name: "F",
          steps: ["s"],
          examples: { headers: ["y"], rows: [["3"]] },
        },
      ],
    };
    const stable = normalizeCaseData("c1", legacy).data as unknown as {
      steps: Record<string, unknown>[];
    };
    stable.steps[0] = { ...stable.steps[0], expected: "only for 0.2" };
    const flat = flattenCaseData(stable) as Record<string, unknown>;
    const { [STASH_KEY]: stash, ...visible } = flat;
    expect(visible).toEqual(legacy);
    // The stable lists travel in the stash, and the upgrade gives them back
    // exactly: same ids, same expected, same hash (review B1).
    expect(stash).toBeDefined();
    expect(normalizeCaseData("c1", flat).data).toEqual(stable);
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

async function tokenFor(email = "steps@pharos.dev"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email,
      password: "supersecret1",
      displayName: "S",
      firstName: "A",
      lastName: "B",
    },
  });
  return res.json().accessToken as string;
}

type Headers = Record<string, string>;
const client = (token: string, features: string): Headers => ({
  authorization: `Bearer ${token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: features,
});
const current = (token: string) =>
  client(token, "key-conflicts,append-only,complete-payload,stable-steps");
/** 0.2.0-alpha.1 (same version string as the server). */
const alpha1 = (token: string) => client(token, "key-conflicts");
/** 0.1.0-beta.1: the previous minor. */
const beta01 = (token: string) => ({
  authorization: `Bearer ${token}`,
  [VERSION_HEADER]: "0.1.0-beta.1",
  [FEATURES_HEADER]: "key-conflicts",
});
/** A build of E1 (append-only, before stable steps). */
const e1 = (token: string) =>
  client(token, "key-conflicts,append-only,complete-payload");

const H = (wall: number, device = "desk") =>
  `${String(wall).padStart(15, "0")}-00000-${device}`;
const push = (headers: Headers, deltas: unknown[]) =>
  app.inject({
    method: "POST",
    url: "/sync/push",
    headers,
    payload: { deltas },
  });
const pull = async (headers: Headers, since = 0) =>
  (
    await app.inject({
      method: "GET",
      url: `/sync/pull?since=${since}`,
      headers,
    })
  ).json();
const count = async () =>
  (await pool.query("SELECT count(*)::int AS n FROM documents")).rows[0]
    .n as number;

const stableData = normalizeCaseData("c1", {
  gherkinLevel: "outline",
  steps: ["I log in as <user>"],
  examples: { headers: ["user"], rows: [["ana"]] },
}).data;
const caseDelta = (data: unknown = stableData, wall = 10) => ({
  entity: "test_case",
  entityId: "c1",
  op: "upsert",
  revision: 1,
  author: "u",
  hlc: H(wall),
  payload: {
    id: "c1",
    projectId: "p1",
    scenarioId: "ATS_001",
    title: "Login",
    version: "1.0",
    status: "draft",
    priority: "medium",
    data,
  },
});

function revisionDoc(
  over: Record<string, unknown> = {},
  data: unknown = stableData,
) {
  const fields = {
    scenarioId: "ATS_001",
    title: "Login",
    version: "1.0",
    status: "draft",
    priority: "medium",
    data,
  };
  const sha = contentSha256(revisionContent(fields));
  const id = revisionId("c1", 1, sha);
  return {
    entity: "test_case_revision",
    entityId: id,
    op: "append",
    revision: 1,
    author: "u",
    hlc: H(20),
    payload: {
      id,
      testCaseId: "c1",
      projectId: "p1",
      workspaceId: "ws-a",
      revision: 1,
      ...fields,
      caseType: null,
      automationStatus: null,
      contentSha256: sha,
      createdAt: "2026-10-31 10:00:00",
      createdBy: "u",
      hlc: H(20),
      ...over,
    },
  };
}

describe("clients without stable-steps may only read (VERSIONING §6.5)", () => {
  it("their push gets 426 read_only_client_version and writes nothing", async () => {
    const token = await tokenFor();
    for (const headers of [alpha1(token), beta01(token), e1(token)]) {
      const res = await push(headers, [caseDelta(["a plain step"])]);
      expect(res.statusCode).toBe(426);
      expect(res.json()).toMatchObject({
        code: "read_only_client_version",
        serverVersion: SERVER_VERSION,
      });
    }
    expect(await count()).toBe(0);
  });

  it("their pull still works, and key blocks too", async () => {
    const token = await tokenFor();
    expect((await push(current(token), [caseDelta()])).statusCode).toBe(200);
    for (const headers of [alpha1(token), beta01(token)]) {
      const body = await pull(headers);
      expect(body.docs).toHaveLength(1);
      const blocks = await app.inject({
        method: "POST",
        url: "/sync/key-blocks",
        headers,
        payload: {
          requests: [
            { projectId: "p1", kind: "case", prefix: "ATS_", floor: 1 },
          ],
        },
      });
      expect(blocks.statusCode).toBe(200);
    }
  });

  it("they pull cases in the text-step shape they know; current clients get the ids", async () => {
    const token = await tokenFor();
    await push(current(token), [caseDelta()]);
    const old = (await pull(alpha1(token))).docs[0].payload.data;
    const { [STASH_KEY]: stash, ...visible } = old;
    expect(visible).toEqual({
      gherkinLevel: "outline",
      steps: ["I log in as <user>"],
      examples: { headers: ["user"], rows: [["ana"]] },
    });
    expect(stash).toEqual({ steps: stableData.steps, examples: stableData.examples });
    const now = (await pull(current(token))).docs[0].payload.data;
    expect(now).toEqual(stableData);
    // The stored document is untouched.
    const stored = (
      await pool.query(
        "SELECT payload FROM documents WHERE entity = 'test_case'",
      )
    ).rows[0].payload;
    expect(stored.data).toEqual(stableData);
  });

  it("once upgraded, the case it pulled flattened is the server's again: no new revision", async () => {
    const token = await tokenFor();
    await push(current(token), [caseDelta(), revisionDoc()]);
    const revisions = async () =>
      (await pool.query("SELECT count(*)::int AS n, max(seq) AS seq FROM documents WHERE entity = 'test_case_revision'"))
        .rows[0];
    const before = await revisions();
    // What the read-only client stored, normalized by its upgrade.
    const pulled = (await pull(alpha1(token))).docs[0].payload.data;
    const upgraded = normalizeCaseData("c1", pulled).data;
    expect(upgraded).toEqual(stableData);
    // The revision its migration queues is the one the server already holds.
    const fields = { scenarioId: "ATS_001", title: "Login", version: "1.0", status: "draft", priority: "medium", data: upgraded };
    const sha = contentSha256(revisionContent(fields));
    expect(revisionId("c1", 1, sha)).toBe(revisionDoc().entityId);
    const res = (await push(current(token), [revisionDoc({ createdAt: "2026-11-05 09:00:00", createdBy: "u-b", hlc: H(77, "b") })])).json();
    expect(res.appendRejected).toEqual([]);
    expect(await revisions()).toEqual(before);
  });

  it("the server lists stable-steps to current clients", async () => {
    const token = await tokenFor();
    expect(SERVER_FEATURES).toContain("stable-steps");
    expect((await pull(current(token))).features).toContain("stable-steps");
  });
});

describe("test_case_revision (append_only)", () => {
  it("is stored once; the same revision from another device is a no-op", async () => {
    const token = await tokenFor();
    const first = revisionDoc();
    expect((await push(current(token), [first])).json()).toMatchObject({
      accepted: 1,
      appendRejected: [],
    });
    const seq = (await pool.query("SELECT seq FROM documents")).rows[0].seq;
    // Device B made the same row: other bookkeeping, same content.
    const again = revisionDoc({
      createdAt: "2026-11-02 08:00:00",
      createdBy: "u-other",
      hlc: H(99, "b"),
    });
    expect((await push(current(token), [again])).json()).toMatchObject({
      accepted: 1,
      appendRejected: [],
    });
    const rows = (await pool.query("SELECT seq, payload FROM documents")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].seq).toBe(seq);
    expect(rows[0].payload.createdAt).toBe("2026-10-31 10:00:00");
  });

  it("refuses other content under the same id", async () => {
    const token = await tokenFor();
    await push(current(token), [revisionDoc()]);
    const forged = revisionDoc({ title: "changed" });
    const res = (await push(current(token), [forged])).json();
    expect(res.appendRejected).toEqual([
      {
        entity: "test_case_revision",
        entityId: forged.entityId,
        reason: "content_changed",
      },
    ]);
  });

  it("a move keeps the stored bookkeeping and takes the new location", async () => {
    const token = await tokenFor();
    await push(current(token), [revisionDoc()]);
    await push(current(token), [
      revisionDoc({ workspaceId: "ws-b", createdAt: "2030-01-01 00:00:00" }),
    ]);
    const { payload } = (await pool.query("SELECT payload FROM documents"))
      .rows[0];
    expect(payload.workspaceId).toBe("ws-b");
    expect(payload.createdAt).toBe("2026-10-31 10:00:00");
  });

  it("audit events still compare everything but their location (E1 unchanged)", async () => {
    const token = await tokenFor();
    const event = (over: Record<string, unknown>) => ({
      entity: "audit_event",
      entityId: "e1",
      op: "append",
      revision: 1,
      author: "user:u",
      hlc: H(5),
      payload: {
        id: "e1",
        workspaceId: "ws",
        projectId: "p1",
        at: "t1",
        hlc: H(5),
        createdAt: "x",
        hash: "h",
        ...over,
      },
    });
    await push(current(token), [event({})]);
    for (const over of [
      { hlc: H(6) },
      { createdAt: "y" },
      { createdBy: "someone" },
      { at: "t2" },
    ]) {
      const res = (await push(current(token), [event(over)])).json();
      expect(res.appendRejected, JSON.stringify(over)).toHaveLength(1);
    }
    const moved = (
      await push(current(token), [event({ projectId: "p2" })])
    ).json();
    expect(moved.appendRejected).toEqual([]);
    const { payload } = (await pool.query("SELECT payload FROM documents"))
      .rows[0];
    expect(payload).toEqual({
      id: "e1",
      workspaceId: "ws",
      projectId: "p2",
      at: "t1",
      hlc: H(5),
      createdAt: "x",
      hash: "h",
    });
  });

  it("only clients with append-only pull it", async () => {
    const token = await tokenFor();
    await push(current(token), [caseDelta(), revisionDoc()]);
    expect(
      (await pull(current(token))).docs.map(
        (d: { entity: string }) => d.entity,
      ),
    ).toEqual(["test_case", "test_case_revision"]);
    expect(
      (await pull(alpha1(token))).docs.map((d: { entity: string }) => d.entity),
    ).toEqual(["test_case"]);
  });
});

describe("the web's test cases (domain API)", () => {
  const api = async (
    token: string,
    method: "GET" | "POST" | "PUT",
    url: string,
    payload?: object,
  ) =>
    (
      await app.inject({ method, url, headers: current(token), payload })
    ).json();

  it("stores steps with ids and the revision the desktop would, on every save", async () => {
    const token = await tokenFor();
    const project = await api(token, "POST", "/api/projects", { name: "P" });
    const created = await api(token, "POST", "/api/test-cases", {
      projectId: project.id,
      title: "T",
      author: "QA",
      data: {
        steps: ["open", "pay"],
        examples: { headers: ["a"], rows: [["1"]] },
      },
    });
    const [open, pay] = created.data.steps;
    expect([open.text, pay.text]).toEqual(["open", "pay"]);
    expect(open.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(created.data.examples.rows[0]).toMatchObject({ values: ["1"] });
    // Reorder and edit: ids stay with their steps.
    const updated = await api(token, "PUT", `/api/test-cases/${created.id}`, {
      input: {
        projectId: project.id,
        title: "T2",
        author: "QA",
        data: { steps: [{ ...pay, text: "pay now" }, open] },
      },
      revision: created.revision,
    });
    expect(updated.data.steps.map((s: { id: string }) => s.id)).toEqual([
      pay.id,
      open.id,
    ]);

    const revisions = (
      await pool.query(
        "SELECT entity_id, payload FROM documents WHERE entity = 'test_case_revision' ORDER BY seq",
      )
    ).rows;
    expect(revisions.map((r) => r.payload.revision)).toEqual([1, 2]);
    for (const [r, doc] of [
      [revisions[0], created],
      [revisions[1], updated],
    ]) {
      const sha = contentSha256(revisionContent({ ...doc, data: doc.data }));
      expect(r.payload.contentSha256).toBe(sha);
      expect(r.entity_id).toBe(revisionId(created.id, doc.revision, sha));
    }
  });

  it("reads a case an older client stored with the ids every device derives", async () => {
    const token = await tokenFor();
    const project = await api(token, "POST", "/api/projects", { name: "P" });
    const legacy = { gherkinLevel: "basic", steps: ["a", "b"] };
    await push(current(token), [
      {
        ...caseDelta(legacy),
        payload: { ...caseDelta(legacy).payload, projectId: project.id },
      },
    ]);
    const read = await api(token, "GET", "/api/test-cases/c1");
    expect(read.data).toEqual(normalizeCaseData("c1", legacy).data);
  });
});
