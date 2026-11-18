import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { planAfterSave } from "../src/modules/domain/plan-review";

// The plan's review flow on the web and «Aprobación independiente» per
// workspace (PLN-08, ADR-0049).

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

async function call(a: Account, method: string, url: string, payload?: unknown) {
  const res = await app.inject({
    method: method as "GET",
    url,
    headers: {
      authorization: `Bearer ${a.token}`,
      [VERSION_HEADER]: SERVER_VERSION,
      [FEATURES_HEADER]: SERVER_FEATURES.join(","),
    },
    payload: payload as object,
  });
  return { status: res.statusCode, body: res.body ? res.json() : undefined };
}

const planInput = (projectId: string, over: object = {}) => ({
  projectId,
  title: "Plan Checkout",
  version: "1.0",
  author: "QA",
  data: { summary: "Pagos" },
  ...over,
});

async function newPlan(a: Account, projectId?: string) {
  const pid = projectId ?? (await call(a, "POST", "/api/projects", { name: "Checkout" })).body.id;
  // A forged status and approval never reach the store.
  const plan = (
    await call(a, "POST", "/api/test-plans", planInput(pid, { status: "approved", data: { summary: "Pagos", approval: { by: "x" } } }))
  ).body;
  return { projectId: pid as string, plan };
}

const review = (a: Account, id: string, body: object) =>
  call(a, "POST", `/api/test-plans/${id}/review`, { userName: "Ana Gil", ...body });

const save = (a: Account, id: string, input: object) => call(a, "PUT", `/api/test-plans/${id}`, { input });

describe("plan review flow (PLN-08)", () => {
  it("starts as draft; send, «Pedir cambios», edits and approval keep the rules", async () => {
    const ana = await register("ana@pharos.dev");
    const { projectId, plan } = await newPlan(ana);
    expect(plan.status).toBe("draft");
    expect(plan.data.approval).toBeUndefined();

    // A save cannot set the status.
    const forged = await save(ana, plan.id, planInput(projectId, { status: "approved" }));
    expect(forged.body.status).toBe("draft");

    expect((await review(ana, plan.id, { action: "approve" })).status).toBe(409);
    const sent = await review(ana, plan.id, { action: "send", comment: "Primera versión" });
    expect(sent.body).toMatchObject({ status: "reviewed", data: { review: { state: "pending", note: "Primera versión" } } });
    expect((await review(ana, plan.id, { action: "send" })).status).toBe(409);

    // «Pedir cambios»: a comment, and the plan stays in review.
    expect((await review(ana, plan.id, { action: "return", comment: " " })).status).toBe(400);
    const asked = await review(ana, plan.id, { action: "return", comment: "Falta el p95" });
    expect(asked.body).toMatchObject({ status: "reviewed", data: { review: { state: "changesRequested" } } });

    // An edit answers it and the plan stays in review.
    const fixed = await save(ana, plan.id, planInput(projectId, { version: "1.1", data: { summary: "Pagos y p95" } }));
    expect(fixed.body).toMatchObject({ status: "reviewed", version: "1.1" });
    expect(fixed.body.data.review).toMatchObject({ state: "pending", comment: "Falta el p95" });

    // Alone in the personal workspace, the author approves: a self-approval.
    const approved = await review(ana, plan.id, { action: "approve" });
    expect(approved.body).toMatchObject({ status: "approved", data: { approval: { by: ana.userId, selfApproved: true, version: "1.1" } } });

    // A save without content changes keeps the approval.
    const kept = await save(ana, plan.id, planInput(projectId, { version: "1.1", planDate: "2026-12-01", data: { summary: "Pagos y p95", documentId: "TP-1" } }));
    expect(kept.body).toMatchObject({ status: "approved", data: { approval: { selfApproved: true } } });

    // A content change sends it back to review with the next version.
    const edited = await save(ana, plan.id, planInput(projectId, { version: "1.1", data: { summary: "Otro alcance" } }));
    expect(edited.body).toMatchObject({ status: "reviewed", version: "1.2" });
    expect(edited.body.data.approval).toBeUndefined();
    expect(edited.body.data.review).toMatchObject({ state: "pending", reopenedFrom: "1.1" });

    // Obsolete, then reactivated: back to review, never to draft.
    expect((await review(ana, plan.id, { action: "obsolete" })).body.status).toBe("obsolete");
    expect((await review(ana, plan.id, { action: "reactivate" })).body.status).toBe("reviewed");
  });

  it("a plan never sent goes back to draft when reactivated", async () => {
    const ana = await register("ana@pharos.dev");
    const { plan } = await newPlan(ana);
    await review(ana, plan.id, { action: "obsolete" });
    expect((await review(ana, plan.id, { action: "reactivate" })).body.status).toBe("draft");
  });

  it("the save rule keeps the document ID, date and AI marks out of the content", () => {
    const saved = { status: "approved", title: "P", version: "1.0", data: { summary: "a", approval: { by: "u" } } };
    expect(planAfterSave(saved, "P", "1.0", { summary: "a", documentId: "TP-9", aiProvenance: { summary: {} } }))
      .toMatchObject({ status: "approved", data: { approval: { by: "u" } } });
    expect(planAfterSave(saved, "P", "1.0", { summary: "b" })).toMatchObject({ status: "reviewed", version: "1.1" });
  });
});

describe("«Aprobación independiente» (PLN-08)", () => {
  async function team() {
    const ana = await register("ana@pharos.dev"); // Test Manager, author
    const luis = await register("luis@pharos.dev"); // Test Manager
    const sara = await register("sara@pharos.dev"); // Test Analyst
    const vera = await register("vera@pharos.dev"); // Viewer
    const ws = (await call(ana, "POST", "/workspaces", { name: "QA Tienda" })).body.id as string;
    for (const [who, role] of [
      [luis, "test_manager"],
      [sara, "test_analyst"],
      [vera, "viewer"],
    ] as const) {
      const inv = await call(ana, "POST", `/workspaces/${ws}/invitations`, { role });
      expect((await call(who, "POST", "/invitations/accept", { code: inv.body.code })).status).toBe(200);
    }
    const projectId = (await call(ana, "POST", "/api/projects", { name: "Checkout" })).body.id as string;
    expect((await call(ana, "POST", `/workspaces/${ws}/move-project`, { projectId })).status).toBe(200);
    const { plan } = await newPlan(ana, projectId);
    await review(ana, plan.id, { action: "send" });
    return { ana, luis, sara, vera, ws, plan };
  }

  it("on by default in a shared workspace: the role, and never the author", async () => {
    const { ana, luis, sara, vera, ws, plan } = await team();
    const list = (await call(ana, "GET", "/workspaces")).body.workspaces as { id: string; kind: string; independentApproval: boolean }[];
    expect(list.find((w) => w.id === ws)?.independentApproval).toBe(true);
    expect(list.find((w) => w.kind === "personal")?.independentApproval).toBe(false);

    expect((await review(ana, plan.id, { action: "approve" })).body.message).toMatch(/author/);
    expect((await review(sara, plan.id, { action: "approve" })).body.message).toMatch(/role/);
    expect((await review(vera, plan.id, { action: "approve" })).status).toBe(403);
    const ok = await review(luis, plan.id, { action: "approve" });
    expect(ok.body).toMatchObject({ status: "approved", data: { approval: { by: luis.userId, selfApproved: false } } });
  });

  it("off: whoever may edit approves, the author as a self-approval; a viewer never", async () => {
    const { ana, sara, vera, ws, plan } = await team();
    // Only a Test Manager changes it, and never in a personal workspace.
    expect((await call(sara, "PATCH", `/workspaces/${ws}/policy`, { independentApproval: false })).status).toBe(403);
    const personal = ((await call(ana, "GET", "/workspaces")).body.workspaces as { id: string; kind: string }[]).find(
      (w) => w.kind === "personal",
    )!;
    expect((await call(ana, "PATCH", `/workspaces/${personal.id}/policy`, { independentApproval: true })).status).toBe(409);
    const off = await call(ana, "PATCH", `/workspaces/${ws}/policy`, { independentApproval: false });
    expect(off.body.independentApproval).toBe(false);

    expect((await review(vera, plan.id, { action: "approve" })).body.message).toMatch(/role/);
    const self = await review(ana, plan.id, { action: "approve" });
    expect(self.body).toMatchObject({ status: "approved", data: { approval: { by: ana.userId, selfApproved: true } } });

    // A Test Analyst may edit a plan, so with the policy off they approve too.
    const { plan: other } = await newPlan(ana, self.body.projectId);
    await review(ana, other.id, { action: "send" });
    expect((await review(sara, other.id, { action: "approve" })).body.status).toBe("approved");

    // The change is audited in the workspace.
    const events = await pool.query(
      `SELECT payload FROM documents WHERE workspace_id = $1 AND entity = 'audit_event' AND payload->>'entity' = 'workspace'`,
      [ws],
    );
    const changes = events.rows[0]?.payload.changes;
    expect(typeof changes === "string" ? JSON.parse(changes) : changes).toEqual({ independentApproval: [true, false] });
  });

  it("applies to cases too", async () => {
    const { ana, luis, sara, ws, plan } = await team();
    const c = (
      await call(sara, "POST", "/api/test-cases", { projectId: plan.projectId, title: "Pay", author: "QA", data: { steps: ["a"] } })
    ).body;
    await call(sara, "POST", `/api/test-cases/${c.id}/review`, { action: "send", userName: "Sara" });
    // On: the author (a Test Analyst) does not approve their own case.
    expect((await call(sara, "POST", `/api/test-cases/${c.id}/review`, { action: "approve", userName: "Sara" })).status).toBe(403);
    await call(ana, "PATCH", `/workspaces/${ws}/policy`, { independentApproval: false });
    const self = await call(sara, "POST", `/api/test-cases/${c.id}/review`, { action: "approve", userName: "Sara" });
    expect(self.body).toMatchObject({ status: "approved", data: { approval: { selfApproved: true } } });
    void luis;
  });
});
