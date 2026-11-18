// Workspaces with roles (SYNC-07, ADR-0042): members and invitations, moving
// a project, the role checks of push and web, isolation between workspaces,
// and how a client of the earlier minor sees it all (read only).
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { CAPABILITIES, WORKSPACE_ROLES, can } from "../src/modules/workspaces/roles";
import {
  authorNeverApproves,
  requiresApproverRole,
  roleAndNotAuthor,
  workspaceApproverCheck,
} from "../src/modules/workspaces/approval";
import { isMember, listMembers, managedMembers } from "../src/modules/workspaces/members";
import { hashCode, newInvitationCode, normalizeCode } from "../src/modules/workspaces/invitations";
import { createWorkspaceService, WORKSPACE_PATHS } from "../src/modules/workspaces/workspaces.service";
import { createServerClock } from "../src/modules/sync/sync.hlc";

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

/** A current client: every feature, `workspaces` included. */
const current = (a: Account) => ({
  authorization: `Bearer ${a.token}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: SERVER_FEATURES.join(","),
});
/** A client of the previous minor: today's features but `workspaces`. */
const [major, minor] = SERVER_VERSION.split(".").map(Number);
const PREVIOUS = `${major}.${minor - 1}.0`;
const previousMinor = (a: Account) => ({
  authorization: `Bearer ${a.token}`,
  [VERSION_HEADER]: PREVIOUS,
  [FEATURES_HEADER]: SERVER_FEATURES.filter((f) => f !== "workspaces").join(","),
});
/** A development build of this minor without `workspaces`. */
const devBuild = (a: Account) => ({ ...previousMinor(a), [VERSION_HEADER]: SERVER_VERSION });

const call = (a: Account, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as "GET", url, headers: current(a), payload: payload as object });

async function createShared(a: Account, name = "Equipo QA"): Promise<string> {
  const res = await call(a, "POST", "/workspaces", { name });
  expect(res.statusCode).toBe(201);
  return res.json().id;
}

async function join(owner: Account, ws: string, who: Account, role: string): Promise<void> {
  const inv = await call(owner, "POST", `/workspaces/${ws}/invitations`, { role });
  expect(inv.statusCode).toBe(201);
  const ok = await call(who, "POST", "/invitations/accept", { code: inv.json().code });
  expect(ok.statusCode).toBe(200);
}

const H = (n: number) => `${String(n).padStart(15, "0")}-00000-dev`;
const project = (id = "p1", over: object = {}) => ({
  entity: "project",
  entityId: id,
  op: "upsert",
  revision: 1,
  author: "A",
  hlc: H(1),
  payload: { id, name: "Pagos", workspaceId: "whatever", caseIdPrefix: "PAY-", ...over },
});
const testCase = (id: string, over: object = {}, revision = 1, hlc = H(2)) => ({
  entity: "test_case",
  entityId: id,
  op: "upsert",
  revision,
  author: "A",
  hlc,
  payload: { id, projectId: "p1", title: "Pago con tarjeta", workspaceId: "whatever", ...over },
});

async function push(a: Account, deltas: object[], workspaceId?: string, headers = current(a)) {
  return app.inject({ method: "POST", url: "/sync/push", headers, payload: { deltas, ...(workspaceId ? { workspaceId } : {}) } });
}
async function pull(a: Account, workspace?: string, headers = current(a)) {
  const q = workspace ? `&workspace=${workspace}` : "";
  return app.inject({ method: "GET", url: `/sync/pull?since=0${q}`, headers });
}

describe("roles", () => {
  it("mirror the shared contract exactly", () => {
    const shared = JSON.parse(
      readFileSync(new URL("../../src/shared/contracts/workspace-roles.json", import.meta.url), "utf8"),
    ) as { roles: string[]; capabilities: Record<string, string[]> };
    expect([...WORKSPACE_ROLES]).toEqual(shared.roles);
    expect(Object.fromEntries(Object.entries(CAPABILITIES).map(([k, v]) => [k, [...v]]))).toEqual(shared.capabilities);
  });

  it("follow the ADR-0019 table: a Viewer only reads and exports", () => {
    for (const cap of Object.keys(CAPABILITIES) as (keyof typeof CAPABILITIES)[]) {
      expect(can("viewer", cap), cap).toBe(cap === "read" || cap === "export");
    }
    expect(can("product_owner", "defect.create")).toBe(true);
    expect(can("product_owner", "defect.edit")).toBe(false);
    expect(can("test_analyst", "case.approve")).toBe(true);
    expect(can("automation_engineer", "case.approve")).toBe(false);
    expect(can("test_analyst", "audit.read")).toBe(false);
  });
});

describe("invitation codes", () => {
  it("carry 128 random bits and are read the way people type them", () => {
    const code = newInvitationCode();
    expect(code).toMatch(/^PHX(-[0-9A-HJKMNP-TV-Z]{1,4}){7}$/);
    expect(normalizeCode(code)).toHaveLength(26);
    expect(hashCode(code.toLowerCase().replace(/-/g, " "))).toBe(hashCode(code));
    expect(newInvitationCode()).not.toBe(code);
  });
});

describe("workspaces and members", () => {
  it("every account starts with its personal workspace", async () => {
    const a = await register("ana@pharos.dev");
    const res = await call(a, "GET", "/workspaces");
    expect(res.json().workspaces).toEqual([
      expect.objectContaining({ kind: "personal", role: "test_manager", members: [expect.objectContaining({ userId: a.userId })] }),
    ]);
  });

  it("invites by a one-time code, shows it first, and keeps a Test Manager", async () => {
    const ana = await register("ana@pharos.dev");
    const luis = await register("luis@pharos.dev");
    const marta = await register("marta@pharos.dev");
    const ws = await createShared(ana);
    const inv = (await call(ana, "POST", `/workspaces/${ws}/invitations`, { role: "viewer", note: "marta@pharos.dev" })).json();
    expect(inv).toMatchObject({ role: "viewer", status: "pending", code: expect.stringMatching(/^PHX-/) });
    // Only the hash is stored.
    const stored = await pool.query("SELECT token_hash FROM workspace_invitations");
    expect(stored.rows[0].token_hash).toBe(hashCode(inv.code));
    expect(JSON.stringify(stored.rows)).not.toContain(normalizeCode(inv.code));

    expect((await call(marta, "POST", "/invitations/preview", { code: inv.code })).json()).toEqual({
      workspaceName: "Equipo QA",
      role: "viewer",
      invitedBy: "ana",
    });
    expect((await call(marta, "POST", "/invitations/accept", { code: inv.code })).statusCode).toBe(200);
    // One use only.
    const again = await call(luis, "POST", "/invitations/accept", { code: inv.code });
    expect([again.statusCode, again.json().code]).toEqual([410, "invitation_invalid"]);
    // Only a Test Manager invites or changes roles.
    expect((await call(marta, "POST", `/workspaces/${ws}/invitations`, { role: "viewer" })).statusCode).toBe(403);
    await join(ana, ws, luis, "test_analyst");
    expect(await listMembers(pool, ws)).toEqual([
      { userId: ana.userId, role: "test_manager" },
      { userId: marta.userId, role: "viewer" },
      { userId: luis.userId, role: "test_analyst" },
    ]);
    // The last Test Manager can neither leave nor lose the role.
    expect((await call(ana, "DELETE", `/workspaces/${ws}/members/${ana.userId}`)).json().code).toBe("last_test_manager");
    expect((await call(ana, "PATCH", `/workspaces/${ws}/members/${ana.userId}`, { role: "viewer" })).json().code).toBe(
      "last_test_manager",
    );
    expect((await call(ana, "PATCH", `/workspaces/${ws}/members/${luis.userId}`, { role: "test_manager" })).statusCode).toBe(200);
    expect((await call(ana, "DELETE", `/workspaces/${ws}/members/${ana.userId}`)).statusCode).toBe(204);
    expect(await isMember(pool, ana.userId, ws)).toBe(false);
    expect(await managedMembers(pool, luis.userId)).toEqual([marta.userId].sort());
  });

  it("a revoked or expired code says so; nobody joins a personal workspace", async () => {
    const ana = await register("ana@pharos.dev");
    const luis = await register("luis@pharos.dev");
    const ws = await createShared(ana);
    const inv = (await call(ana, "POST", `/workspaces/${ws}/invitations`, { role: "viewer" })).json();
    expect((await call(ana, "DELETE", `/workspaces/${ws}/invitations/${inv.id}`)).statusCode).toBe(204);
    expect((await call(luis, "POST", "/invitations/accept", { code: inv.code })).statusCode).toBe(410);
    const old = (await call(ana, "POST", `/workspaces/${ws}/invitations`, { role: "viewer", expiresInDays: 1 })).json();
    await pool.query("UPDATE workspace_invitations SET expires_at = now() - interval '1 minute' WHERE id = $1", [old.id]);
    expect((await call(luis, "POST", "/invitations/accept", { code: old.code })).statusCode).toBe(410);
    expect((await call(ana, "GET", `/workspaces/${ws}/invitations`)).json().invitations.map((i: { status: string }) => i.status)).toEqual([
      "expired",
      "revoked",
    ]);
    const personal = (await call(ana, "GET", "/workspaces")).json().workspaces.find((w: { kind: string }) => w.kind === "personal").id;
    expect((await call(ana, "POST", `/workspaces/${personal}/invitations`, { role: "viewer" })).json().code).toBe("personal_workspace");
  });
});

describe("sharing a project (move-project) and roles on push", () => {
  async function team() {
    const ana = await register("ana@pharos.dev"); // Test Manager
    const marta = await register("marta@pharos.dev"); // Viewer («auditor»)
    const luis = await register("luis@pharos.dev"); // Test Analyst
    const ws = await createShared(ana);
    await join(ana, ws, marta, "viewer");
    await join(ana, ws, luis, "test_analyst");
    // Ana's project, as her desktop pushed it to her personal workspace.
    expect((await push(ana, [project(), testCase("c1")])).json().accepted).toBe(2);
    const moved = await call(ana, "POST", `/workspaces/${ws}/move-project`, { projectId: "p1" });
    expect(moved.statusCode).toBe(200);
    return { ana, marta, luis, ws, moved: moved.json() };
  }

  it("moves the project with everything under it and leaves move tombstones", async () => {
    const { ana, ws, moved } = await team();
    expect(moved).toMatchObject({ to: ws });
    const personal = moved.from as string;
    const rows = (
      await pool.query("SELECT workspace_id, entity, entity_id, deleted, payload FROM documents WHERE entity <> 'audit_event' ORDER BY workspace_id, entity")
    ).rows;
    const inShared = rows.filter((r) => r.workspace_id === ws);
    expect(inShared.map((r) => [r.entity, r.deleted, r.payload.workspaceId])).toEqual([
      ["project", false, ws],
      ["test_case", false, ws],
    ]);
    expect(rows.filter((r) => r.workspace_id === personal).map((r) => [r.entity, r.deleted, r.payload])).toEqual([
      ["project", true, { movedTo: ws }],
      ["test_case", true, { movedTo: ws }],
    ]);
    // An event in each workspace.
    const events = (await pool.query("SELECT workspace_id, payload FROM documents WHERE entity = 'audit_event'")).rows;
    expect(events.map((e) => e.workspace_id).sort()).toEqual([personal, ws].sort());
    // Ana's device still pushing to her personal workspace is told where it went.
    const late = (await push(ana, [testCase("c1", { title: "x" }, 2, H(9))])).json();
    expect(late.rejected).toEqual([{ entity: "test_case", entityId: "c1", reason: "moved", workspaceId: ws }]);
  });

  it("a Viewer sees the project and cannot edit it; a Test Analyst can (exit criterion)", async () => {
    const { ana, marta, luis, ws } = await team();
    const seen = (await pull(marta, ws)).json().docs.map((d: { entity: string }) => d.entity).sort();
    expect(seen).toEqual(["project", "test_case"]);
    // Marta forces a push: refused, nothing written.
    const forced = (await push(marta, [testCase("c1", { title: "edited by the viewer" }, 2, H(5))], ws)).json();
    expect(forced).toMatchObject({ accepted: 0, rejected: [{ entity: "test_case", entityId: "c1", reason: "forbidden" }] });
    expect((await pull(ana, ws)).json().docs.find((d: { entityId: string }) => d.entityId === "c1").payload.title).toBe(
      "Pago con tarjeta",
    );
    // The web refuses her too.
    const web = await call(marta, "DELETE", "/api/test-cases/c1?revision=1");
    expect([web.statusCode, web.json().code]).toEqual([403, "forbidden"]);
    // Luis edits; Ana pulls it.
    expect((await push(luis, [testCase("c1", { title: "Pago rechazado" }, 2, H(6))], ws)).json().accepted).toBe(1);
    const c1 = (await pull(ana, ws)).json().docs.find((d: { entityId: string }) => d.entityId === "c1");
    expect([c1.payload.title, c1.revision]).toEqual(["Pago rechazado", 2]);
    // Luis cannot delete the project (project.manage).
    const del = (await push(luis, [{ ...project(), op: "delete", revision: 2, hlc: H(7), payload: {} }], ws)).json();
    expect(del.rejected).toEqual([{ entity: "project", entityId: "p1", reason: "forbidden" }]);
  });

  it("only the Test Manager reads the audit; a pushed event must be one's own", async () => {
    const { ana, marta, luis, ws } = await team();
    const kinds = async (a: Account) => (await pull(a, ws)).json().docs.map((d: { entity: string }) => d.entity);
    expect(await kinds(ana)).toContain("audit_event");
    expect(await kinds(marta)).not.toContain("audit_event");
    expect((await call(marta, "GET", "/api/audit-events")).json().total).toBe(0);
    const event = (owner: string) => ({
      entity: "audit_event",
      entityId: `e-${owner}`,
      op: "append",
      revision: 1,
      author: "x",
      hlc: H(8),
      payload: { id: `e-${owner}`, deviceId: "dev-luis", chainOwner: owner, chainWorkspaceId: ws, chainSeq: 1, hash: "h" },
    });
    expect((await push(luis, [event(luis.userId)], ws)).json().accepted).toBe(1);
    expect((await push(luis, [event(ana.userId)], ws)).json().rejected).toEqual([
      { entity: "audit_event", entityId: `e-${ana.userId}`, reason: "forbidden" },
    ]);
  });

  it("a removed member gets workspace_revoked; an outsider learns nothing", async () => {
    const { ana, marta, ws } = await team();
    const outsider = await register("eve@pharos.dev");
    for (const res of [
      await pull(outsider, ws),
      await push(outsider, [testCase("c1", {}, 9, H(9))], ws),
      await app.inject({ method: "POST", url: "/sync/key-blocks", headers: current(outsider), payload: { workspaceId: ws, requests: [{ projectId: "p1", kind: "case" }] } }),
    ]) {
      expect([res.statusCode, res.json().code]).toEqual([404, "workspace_not_found"]);
    }
    expect((await call(outsider, "GET", "/api/projects")).json()).toEqual([]);
    expect((await call(outsider, "GET", "/api/test-cases/c1")).json()).toBeNull();
    // Its own push of the same ids lands in its own workspace, untouched by the team's.
    expect((await push(outsider, [project(), testCase("c1", { title: "mine" })])).json().accepted).toBe(2);
    expect((await pull(ana, ws)).json().docs.find((d: { entityId: string }) => d.entityId === "c1").payload.title).toBe(
      "Pago con tarjeta",
    );

    expect((await call(ana, "DELETE", `/workspaces/${ws}/members/${marta.userId}`)).statusCode).toBe(204);
    const gone = await pull(marta, ws);
    expect([gone.statusCode, gone.json().code]).toEqual([403, "workspace_revoked"]);
    expect((await call(marta, "GET", "/api/projects")).json()).toEqual([]);
  });

  it("key blocks: any member who creates that kind of key leases them in the shared project", async () => {
    const { marta, luis, ws } = await team();
    const lease = (a: Account) =>
      app.inject({ method: "POST", url: "/sync/key-blocks", headers: current(a), payload: { workspaceId: ws, requests: [{ projectId: "p1", kind: "case", prefix: "PAY-", size: 2 }] } });
    expect((await lease(luis)).json().blocks).toHaveLength(1);
    expect((await lease(marta)).json()).toEqual({ blocks: [], refused: [{ projectId: "p1", kind: "case" }] });
  });
});

describe("clients without `workspaces` (ADR-0042 §3)", () => {
  it("the previous minor only reads: the union of its workspaces, without move tombstones", async () => {
    const ana = await register("ana@pharos.dev");
    const ws = await createShared(ana);
    await push(ana, [project(), testCase("c1"), project("p2", { name: "Personal" })]);
    await call(ana, "POST", `/workspaces/${ws}/move-project`, { projectId: "p1" });
    const res = await push(ana, [testCase("c9")], undefined, previousMinor(ana));
    expect([res.statusCode, res.json().code]).toEqual([426, "read_only_client_version"]);
    const docs = ((await pull(ana, undefined, previousMinor(ana))).json().docs as { entity: string; entityId: string; deleted: boolean }[]).filter(
      (d) => d.entity !== "audit_event",
    );
    // p1 and c1 come live (from the shared workspace), p2 from the personal
    // one; never the tombstones the move left.
    expect(docs.filter((d) => !d.deleted).map((d) => d.entityId).sort()).toEqual(["c1", "p1", "p2"]);
    expect(docs.filter((d) => d.deleted)).toEqual([]);
  });

  it("a development build of this minor works in its personal workspace", async () => {
    const ana = await register("ana@pharos.dev");
    expect((await push(ana, [project()], undefined, devBuild(ana))).json()).toMatchObject({ accepted: 1 });
    const ws = await createShared(ana);
    await call(ana, "POST", `/workspaces/${ws}/move-project`, { projectId: "p1" });
    // A change of the moved project would be `rejected`, which it cannot read.
    const res = await push(ana, [project("p1", { name: "x" })], undefined, devBuild(ana));
    expect([res.statusCode, res.json().code]).toEqual([426, "unsupported_client_version"]);
  });
});

describe("notifications of the app (RED-W2 wired, ADR-0048)", () => {
  it("an invitation, a join and a removal reach the right people", async () => {
    const ana = await register("ana@pharos.dev");
    const luis = await register("luis@pharos.dev");
    const ws = await createShared(ana);
    const kinds = async (a: Account) =>
      ((await call(a, "GET", "/api/me/notifications?since=0")).json().items as { kind: string }[]).map((n) => n.kind);
    const inv = (await call(ana, "POST", `/workspaces/${ws}/invitations`, { role: "test_analyst", note: "luis@pharos.dev" })).json();
    expect(await kinds(luis)).toEqual(["invitation.received"]);
    await call(luis, "POST", "/invitations/accept", { code: inv.code });
    expect(await kinds(ana)).toEqual(["member.joined"]);
    await call(ana, "DELETE", `/workspaces/${ws}/members/${luis.userId}`);
    expect(await kinds(luis)).toEqual(["invitation.received", "member.removed"]);
  });
});

describe("hooks for notifications (track R)", () => {
  it("fire inside the transaction with R's event shapes", async () => {
    const ana = await register("ana@pharos.dev");
    const luis = await register("luis@pharos.dev");
    const seen: [string, unknown, boolean][] = [];
    const inTx = async (c: { query: (q: string) => Promise<{ rows: { tx: boolean }[] }> }) =>
      (await c.query("SELECT txid_current_if_assigned() IS NOT NULL AS tx")).rows[0].tx;
    const service = createWorkspaceService(pool, createServerClock(), {
      invitationCreated: async (c, ev) => void seen.push(["invitationCreated", ev, await inTx(c)]),
      memberJoined: async (c, ev) => void seen.push(["memberJoined", ev, await inTx(c)]),
      memberRemoved: async (c, ev) => void seen.push(["memberRemoved", ev, await inTx(c)]),
    });
    const ws = await service.create(ana.userId, "Equipo QA");
    const anonymous = await service.invite(ana.userId, ws.id, { role: "viewer", expiresInDays: 7 });
    const named = await service.invite(ana.userId, ws.id, { role: "test_analyst", note: "LUIS@pharos.dev", expiresInDays: 7 });
    await service.accept(luis.userId, named.code);
    await service.removeMember(ana.userId, ws.id, luis.userId);
    const base = { workspaceId: ws.id, workspaceName: "Equipo QA" };
    expect(seen).toEqual([
      ["invitationCreated", { ...base, invitationId: anonymous.id, actorId: ana.userId, inviteeUserId: null, role: "viewer", path: WORKSPACE_PATHS.invitation }, true],
      ["invitationCreated", { ...base, invitationId: named.id, actorId: ana.userId, inviteeUserId: luis.userId, role: "test_analyst", path: WORKSPACE_PATHS.invitation }, true],
      ["memberJoined", { ...base, userId: luis.userId, role: "test_analyst", path: WORKSPACE_PATHS.members }, true],
      ["memberRemoved", { ...base, userId: luis.userId, actorId: ana.userId }, true],
    ]);
  });
});

describe("another person approves a case (exit criterion, CAS-02 wired)", () => {
  it("on the web: a Test Analyst approves; the author and an Automation Engineer cannot", async () => {
    const ana = await register("ana@pharos.dev"); // Test Manager, author
    const luis = await register("luis@pharos.dev"); // Test Analyst
    const jorge = await register("jorge@pharos.dev"); // Automation Engineer
    const ws = await createShared(ana);
    await join(ana, ws, luis, "test_analyst");
    await join(ana, ws, jorge, "automation_engineer");
    const p = (await call(ana, "POST", "/api/projects", { name: "Pagos" })).json();
    expect((await call(ana, "POST", `/workspaces/${ws}/move-project`, { projectId: p.id })).statusCode).toBe(200);
    const c = (await call(ana, "POST", "/api/test-cases", { projectId: p.id, title: "Pago", author: "Ana", data: { steps: ["abrir"] } })).json();
    const review = (a: Account, action: string) =>
      call(a, "POST", `/api/test-cases/${c.id}/review`, { action, userName: a === ana ? "Ana" : "Otro" });
    // Everyone sees Ana as the author (from the case's first revision).
    expect((await call(luis, "GET", `/api/test-cases/${c.id}`)).json().createdBy).toBe(ana.userId);
    expect((await call(luis, "GET", `/api/test-cases?projectId=${p.id}`)).json()[0].createdBy).toBe(ana.userId);
    expect((await review(ana, "send")).statusCode).toBe(200);
    for (const [who, reason] of [
      [ana, "author"],
      [jorge, "role"],
    ] as const) {
      const res = await review(who, "approve");
      expect([res.statusCode, res.json().code, res.json().message]).toEqual([
        403,
        "review_not_allowed",
        `This account cannot approve the case (${reason}).`,
      ]);
    }
    const ok = await review(luis, "approve");
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ status: "approved", data: { approval: { selfApproved: false } } });
  });

  it("the rule decides what is required (PLN-08 replaces it); policies add refusals", async () => {
    const ana = await register("ana@pharos.dev");
    const luis = await register("luis@pharos.dev");
    const marta = await register("marta@pharos.dev");
    const ws = await createShared(ana);
    await join(ana, ws, luis, "test_analyst");
    await join(ana, ws, marta, "viewer");
    const ask = (check: ReturnType<typeof workspaceApproverCheck>, approverId: string, authorId: string, subject?: "case" | "plan") =>
      check.canApprove({ workspaceId: ws, projectId: "p1", caseId: "c1", authorId, approverId, ...(subject ? { subject } : {}) });
    // The default rule: role (by subject), then never the author.
    const defaults = workspaceApproverCheck(pool);
    expect(await ask(defaults, luis.userId, ana.userId)).toEqual({ ok: true, selfApproval: false });
    expect(await ask(defaults, luis.userId, ana.userId, "plan")).toEqual({ ok: false, reason: "role" });
    expect(await ask(defaults, ana.userId, luis.userId, "plan")).toEqual({ ok: true, selfApproval: false });
    expect(await ask(defaults, ana.userId, ana.userId)).toEqual({ ok: false, reason: "author" });
    expect(await ask(defaults, marta.userId, ana.userId)).toEqual({ ok: false, reason: "role" });
    // «Aprobación independiente» off (a rule that requires nothing): anyone
    // in the workspace, the author too, as a self-approval.
    const off = workspaceApproverCheck(pool, { rule: async () => null });
    expect(await ask(off, ana.userId, ana.userId)).toEqual({ ok: true, selfApproval: true });
    expect(await ask(off, marta.userId, ana.userId, "plan")).toEqual({ ok: true, selfApproval: false });
    // The parts compose: the author rule alone.
    const authorOnly = workspaceApproverCheck(pool, { rule: authorNeverApproves });
    expect(await ask(authorOnly, marta.userId, ana.userId)).toEqual({ ok: true, selfApproval: false });
    expect(await ask(authorOnly, ana.userId, ana.userId)).toEqual({ ok: false, reason: "author" });
    // An extra policy refuses on top of the rule.
    const tmOnly = workspaceApproverCheck(pool, {
      policies: [async (_req, m) => (m.role === "test_manager" ? null : { ok: false, reason: "role" })],
    });
    expect(await ask(tmOnly, luis.userId, ana.userId)).toEqual({ ok: false, reason: "role" });
    expect(await ask(tmOnly, ana.userId, luis.userId)).toEqual({ ok: true, selfApproval: false });
    expect(await roleAndNotAuthor({ workspaceId: ws, projectId: "p", caseId: "c", authorId: "x", approverId: "y" }, { workspaceId: ws, role: "viewer", kind: "shared", name: "W" })).toEqual({ ok: false, reason: "role" });
    expect(await requiresApproverRole({ workspaceId: ws, projectId: "p", caseId: "c", authorId: "x", approverId: "y", subject: "plan" }, { workspaceId: ws, role: "test_manager", kind: "shared", name: "W" })).toBeNull();
  });
});

describe("approver check (CAS-02, for track K)", () => {
  it("Test Manager or Test Analyst, never the author; alone in a personal workspace", async () => {
    const ana = await register("ana@pharos.dev");
    const luis = await register("luis@pharos.dev");
    const jorge = await register("jorge@pharos.dev");
    const eve = await register("eve@pharos.dev");
    const ws = await createShared(ana);
    await join(ana, ws, luis, "test_analyst");
    await join(ana, ws, jorge, "automation_engineer");
    const check = workspaceApproverCheck(pool);
    const req = (approverId: string, authorId = jorge.userId, workspaceId = ws) =>
      check.canApprove({ workspaceId, projectId: "p1", caseId: "c1", authorId, approverId });
    expect(await req(luis.userId)).toEqual({ ok: true, selfApproval: false });
    expect(await req(ana.userId)).toEqual({ ok: true, selfApproval: false });
    expect(await req(luis.userId, luis.userId)).toEqual({ ok: false, reason: "author" });
    expect(await req(jorge.userId, luis.userId)).toEqual({ ok: false, reason: "role" });
    expect(await req(eve.userId)).toEqual({ ok: false, reason: "notMember" });
    const personal = (await call(ana, "GET", "/workspaces")).json().workspaces[0].id;
    expect(await req(ana.userId, ana.userId, personal)).toEqual({ ok: true, selfApproval: true });
  });
});

describe("isolation without RLS (ADR-0042 §9)", () => {
  /** Every SQL text of the server that reads or writes `documents` names
   *  the workspace: the defense RLS would otherwise give. The exceptions are
   *  listed with the reason. */
  it("every query on documents filters by workspace", () => {
    const allowed = [
      // Server-wide maintenance of old tombstones (SYNC-06).
      "make_interval(days => $1)",
      // The 0010 data step, written for both shapes of the table.
      "${part}",
      // Key series are per project id across the server (`key_blocks`).
      "entity = 'project' AND entity_id = $1 AND workspace_id <> $2",
      // The audit reader builds every WHERE from AUDIT_SCOPE (workspaces
      // where the user may read the audit).
      "${AUDIT_SCOPE}",
      "WHERE ${sql}",
      "WHERE ${base}",
      // A nested template literal cuts this one short; its WHERE names the
      // workspace further on (`storeAppend`).
      "SET payload = (payload ${LOCATION_KEYS",
    ];
    const files: string[] = [];
    const walk = (dir: URL) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(new URL(`${e.name}/`, dir));
        else if (e.name.endsWith(".ts")) files.push(new URL(e.name, dir).pathname);
      }
    };
    walk(new URL("../src/modules/", import.meta.url));
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(decodeURIComponent(file).replace(/^\/([A-Za-z]:)/, "$1"), "utf8");
      for (const sql of text.match(/`[^`]*`/g) ?? []) {
        if (!/\b(FROM|UPDATE|INTO)\s+documents\b/.test(sql)) continue;
        if (sql.includes("workspace_id") || sql.includes("${VISIBLE}") || allowed.some((a) => sql.includes(a))) continue;
        offenders.push(`${file.split("/").pop()}: ${sql.slice(0, 80).replace(/\s+/g, " ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
