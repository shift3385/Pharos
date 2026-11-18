// Attachments and templates (SYNC-04b, ADR-0042 §7): their content by hash
// in `/blobs`, their documents in the oplog behind the `blobs` feature.
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { diskBlobStore } from "../src/modules/blobs/blobStore";

let app: FastifyInstance;
let pool: Pool;

beforeAll(async () => {
  ({ app, pool } = await setupTestApp({ BLOB_DIR: mkdtempSync(join(tmpdir(), "pharos-blobs-")), BLOB_MAX_BYTES: 64 }));
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
});

interface Account {
  token: string;
  userId: string;
}

async function register(email: string): Promise<Account> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: email.split("@")[0], firstName: "F", lastName: "L" },
  });
  const body = res.json();
  return { token: body.accessToken, userId: body.user.id };
}

const headers = (a: Account, features: readonly string[] = SERVER_FEATURES) => ({
  authorization: `Bearer ${a.token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: features.join(","),
});
const call = (a: Account, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as "GET", url, headers: headers(a), payload: payload as object });

async function createShared(a: Account): Promise<string> {
  const res = await call(a, "POST", "/workspaces", { name: "Equipo QA" });
  expect(res.statusCode).toBe(201);
  return res.json().id;
}
async function join_(owner: Account, ws: string, who: Account, role: string): Promise<void> {
  const inv = await call(owner, "POST", `/workspaces/${ws}/invitations`, { role });
  expect((await call(who, "POST", "/invitations/accept", { code: inv.json().code })).statusCode).toBe(200);
}
const personalOf = async (a: Account): Promise<string> =>
  (await call(a, "GET", "/workspaces")).json().workspaces.find((w: { kind: string }) => w.kind === "personal").id;

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const upload = (a: Account, ws: string, bytes: Buffer, hash = sha(bytes)) =>
  app.inject({
    method: "PUT",
    url: `/blobs/${hash}?workspace=${ws}`,
    headers: { ...headers(a), "content-type": "application/octet-stream", "x-pharos-blob-mime": "image/png" },
    payload: bytes,
  });
const download = (a: Account, ws: string, hash: string) =>
  app.inject({ method: "GET", url: `/blobs/${hash}?workspace=${ws}`, headers: headers(a) });

const H = (n: number) => `${String(n).padStart(15, "0")}-00000-dev`;
const project = (id = "p1") => ({
  entity: "project",
  entityId: id,
  op: "upsert",
  revision: 1,
  author: "A",
  hlc: H(1),
  payload: { id, name: "Pagos", caseIdPrefix: "PAY-" },
});
const attachment = (id: string, hash: string, over: object = {}) => ({
  entity: "attachment",
  entityId: id,
  op: "upsert",
  revision: 1,
  author: "A",
  hlc: H(2),
  payload: { id, projectId: "p1", sha256: hash, size: 3, name: "shot.png", ownerEntity: "defect", ownerId: "d1", ...over },
});
const template = (id: string, hash: string) => ({
  entity: "template",
  entityId: id,
  op: "upsert",
  revision: 1,
  author: "A",
  hlc: H(3),
  payload: { id, kind: "case", language: "es", name: "Plantilla", sha256: hash, size: 3 },
});
const push = (a: Account, ws: string, deltas: object[], features?: readonly string[]) =>
  app.inject({ method: "POST", url: "/sync/push", headers: headers(a, features), payload: { deltas, workspaceId: ws } });
const pull = (a: Account, ws: string, features?: readonly string[]) =>
  app.inject({ method: "GET", url: `/sync/pull?since=0&workspace=${ws}`, headers: headers(a, features) });

describe("blob store on disk", () => {
  it("writes each content once, under its hash, and reads it back", async () => {
    const store = diskBlobStore(mkdtempSync(join(tmpdir(), "pharos-store-")));
    const bytes = Buffer.from("hola");
    const key = await store.put(sha(bytes), bytes);
    expect(key).toBe(`${sha(bytes).slice(0, 2)}/${sha(bytes)}`);
    expect(await store.put(sha(bytes), bytes)).toBe(key);
    const opened = await store.open(key);
    expect(opened?.size).toBe(4);
    expect(await store.open("../../etc/passwd")).toBeNull();
    expect(await store.open("ab/missing")).toBeNull();
  });
});

describe("/blobs", () => {
  it("uploads, says what is missing and downloads within the workspace", async () => {
    const ana = await register("ana@example.com");
    const ws = await personalOf(ana);
    const bytes = Buffer.from("png");
    const other = "f".repeat(64);
    expect((await call(ana, "POST", "/blobs/missing", { workspaceId: ws, hashes: [sha(bytes), other] })).json()).toEqual({
      missing: [sha(bytes), other],
    });
    expect((await upload(ana, ws, bytes)).statusCode).toBe(204);
    // The same content again is a no-op.
    expect((await upload(ana, ws, bytes)).statusCode).toBe(204);
    expect((await call(ana, "POST", "/blobs/missing", { workspaceId: ws, hashes: [sha(bytes), other] })).json()).toEqual({
      missing: [other],
    });
    const got = await download(ana, ws, sha(bytes));
    expect(got.statusCode).toBe(200);
    expect(got.rawPayload.equals(bytes)).toBe(true);
    expect(got.headers["x-pharos-blob-mime"]).toBe("image/png");
    expect((await download(ana, ws, other)).json().code).toBe("blob_not_found");
  });

  it("refuses content that does not match its hash, or is too big", async () => {
    const ana = await register("ana@example.com");
    const ws = await personalOf(ana);
    const res = await upload(ana, ws, Buffer.from("png"), "a".repeat(64));
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("hash_mismatch");
    expect((await upload(ana, ws, Buffer.alloc(65))).statusCode).toBe(413);
    expect((await call(ana, "GET", `/blobs/not-a-hash?workspace=${ws}`)).statusCode).toBe(400);
  });

  it("a workspace never learns another one's contents; a Viewer only reads", async () => {
    const ana = await register("ana@example.com");
    const bob = await register("bob@example.com");
    const shared = await createShared(ana);
    const bytes = Buffer.from("png");
    expect((await upload(ana, shared, bytes)).statusCode).toBe(204);
    // Bob is not a member: nothing of the shared workspace, not even what it holds.
    expect((await download(bob, shared, sha(bytes))).statusCode).toBe(404);
    expect((await call(bob, "POST", "/blobs/missing", { workspaceId: shared, hashes: [sha(bytes)] })).statusCode).toBe(404);
    // His personal workspace does not have it, although the disk does.
    expect((await download(bob, await personalOf(bob), sha(bytes))).statusCode).toBe(404);
    await join_(ana, shared, bob, "viewer");
    expect((await download(bob, shared, sha(bytes))).statusCode).toBe(200);
    const refused = await upload(bob, shared, Buffer.from("otro"));
    expect(refused.statusCode).toBe(403);
  });
});

describe("attachment and template documents", () => {
  it("sync behind the blobs feature", async () => {
    const ana = await register("ana@example.com");
    const ws = await personalOf(ana);
    const hash = sha(Buffer.from("png"));
    const without = SERVER_FEATURES.filter((f) => f !== "blobs");
    const refused = await push(ana, ws, [project(), attachment("a1", hash)], without);
    expect(refused.statusCode).toBe(400);
    expect(refused.json().code).toBe("blobs_unsupported");
    expect((await push(ana, ws, [project(), attachment("a1", hash), template("t1", hash)])).statusCode).toBe(200);
    const entities = (r: { json: () => { docs: { entity: string }[] } }) => r.json().docs.map((d) => d.entity).sort();
    expect(entities(await pull(ana, ws))).toEqual(["attachment", "project", "template"]);
    expect(entities(await pull(ana, ws, without))).toEqual(["project"]);
  });

  it("are checked: a hash, a name, a template kind", async () => {
    const ana = await register("ana@example.com");
    const ws = await personalOf(ana);
    expect((await push(ana, ws, [project(), attachment("a1", "nope")])).statusCode).toBe(400);
    const bad = template("t1", sha(Buffer.from("x")));
    bad.payload = { ...bad.payload, kind: "suite" };
    expect((await push(ana, ws, [bad])).statusCode).toBe(400);
  });

  it("go with their project when it moves, contents included", async () => {
    const ana = await register("ana@example.com");
    const personal = await personalOf(ana);
    const shared = await createShared(ana);
    const bytes = Buffer.from("png");
    expect((await upload(ana, personal, bytes)).statusCode).toBe(204);
    expect((await push(ana, personal, [project(), attachment("a1", sha(bytes))])).statusCode).toBe(200);
    expect((await call(ana, "POST", `/workspaces/${shared}/move-project`, { projectId: "p1" })).statusCode).toBe(200);
    expect((await download(ana, shared, sha(bytes))).statusCode).toBe(200);
    const docs = (await pull(ana, shared)).json().docs as { entity: string; deleted: boolean }[];
    expect(docs.filter((d) => d.entity === "attachment" && !d.deleted)).toHaveLength(1);
  });

  it("a Viewer may not add an attachment; a Product Owner may; only TM and TA edit templates", async () => {
    const ana = await register("ana@example.com");
    const vic = await register("vic@example.com");
    const pol = await register("pol@example.com");
    const ws = await createShared(ana);
    await join_(ana, ws, vic, "viewer");
    await join_(ana, ws, pol, "product_owner");
    expect((await push(ana, ws, [project()])).statusCode).toBe(200);
    const hash = sha(Buffer.from("png"));
    const rejected = (r: { json: () => { rejected?: { entityId: string }[] } }) =>
      (r.json().rejected ?? []).map((x) => x.entityId);
    expect(rejected(await push(vic, ws, [attachment("a1", hash)]))).toEqual(["a1"]);
    expect(rejected(await push(pol, ws, [attachment("a2", hash)]))).toEqual([]);
    expect(rejected(await push(pol, ws, [template("t1", hash)]))).toEqual(["t1"]);
    expect(rejected(await push(ana, ws, [template("t2", hash)]))).toEqual([]);
  });
});
