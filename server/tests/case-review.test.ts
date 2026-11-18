import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import {
  afterSave,
  contentChanged,
  nextVersion,
  otherThanAuthor,
  setApproverCheck,
} from "../src/modules/domain/case-review";

// The review flow of a case and suite baselines on the web (CAS-02,
// ADR-0047): the rules of the desktop's `case_review.rs` and
// `case_baseline.rs`, applied by the server.

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
afterEach(() => {
  setApproverCheck(otherThanAuthor(async () => 1));
});

async function tokenFor(email = "review@pharos.dev"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, password: "supersecret1", displayName: "R", firstName: "Ana", lastName: "Gil" },
  });
  return res.json().accessToken as string;
}

type Method = "GET" | "POST" | "PUT";
async function call(token: string, method: Method, url: string, payload?: unknown) {
  const res = await app.inject({
    method,
    url,
    headers: {
      authorization: `Bearer ${token}`,
      [VERSION_HEADER]: SERVER_VERSION,
      [FEATURES_HEADER]: "key-conflicts,stable-steps",
    },
    payload: payload as object,
  });
  return { status: res.statusCode, body: res.body ? res.json() : undefined };
}

async function newCase(token: string) {
  const p = (await call(token, "POST", "/api/projects", { name: "Checkout" })).body as { id: string };
  const c = (
    await call(token, "POST", "/api/test-cases", {
      projectId: p.id,
      title: "Pay",
      author: "QA",
      status: "approved",
      data: { steps: ["open"], approval: { by: "mallory" } },
    })
  ).body;
  return { projectId: p.id, c };
}

const review = (token: string, id: string, body: object) =>
  call(token, "POST", `/api/test-cases/${id}/review`, { userName: "Ana Gil", ...body });

describe("case review on the web (CAS-02)", () => {
  it("a new case never starts approved; send and approve record who and when", async () => {
    const token = await tokenFor();
    const { c } = await newCase(token);
    expect(c.status).toBe("draft");
    expect(c.data.approval).toBeUndefined();

    const sent = await review(token, c.id, { action: "send", comment: "ready", revision: c.revision });
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe("reviewed");
    expect(sent.body.data.review).toMatchObject({ state: "pending", sentByName: "Ana Gil", note: "ready", revision: 2 });

    // Alone in the workspace, the author approves: a self-approval.
    const approved = await review(token, c.id, { action: "approve" });
    expect(approved.body.status).toBe("approved");
    expect(approved.body.data.approval).toMatchObject({ byName: "Ana Gil", version: "1.0", revision: 3, selfApproved: true });
    expect(approved.body.data.review.state).toBe("approved");
  });

  it("with more people the author cannot approve", async () => {
    setApproverCheck(otherThanAuthor(async () => 2));
    const token = await tokenFor();
    const { c } = await newCase(token);
    await review(token, c.id, { action: "send" });
    const res = await review(token, c.id, { action: "approve" });
    expect(res.status).toBe(403);
    expect(res.body.code ?? res.body.error).toBeDefined();
    expect((await call(token, "GET", `/api/test-cases/${c.id}`)).body.status).toBe("reviewed");
  });

  it("«Pedir cambios» needs a comment and keeps the case in review (PLN-08)", async () => {
    const token = await tokenFor();
    const { c } = await newCase(token);
    expect((await review(token, c.id, { action: "approve" })).status).toBe(409);
    await review(token, c.id, { action: "send" });
    expect((await review(token, c.id, { action: "return", comment: "  " })).status).toBe(400);
    const back = await review(token, c.id, { action: "return", comment: "Step 3?" });
    expect(back.body.status).toBe("reviewed");
    expect(back.body.data.review).toMatchObject({ state: "changesRequested", comment: "Step 3?" });
    // Sending again is not a step of its own: the case is still in review.
    expect((await review(token, c.id, { action: "send" })).status).toBe(409);
  });

  it("a plain save keeps the status and the approval unless the content changes", async () => {
    const token = await tokenFor();
    const { projectId, c } = await newCase(token);
    await review(token, c.id, { action: "send" });
    const approved = (await review(token, c.id, { action: "approve" })).body;

    // Another priority and a forged status: still approved, same version.
    const kept = await call(token, "PUT", `/api/test-cases/${c.id}`, {
      input: { projectId, title: "Pay", author: "QA", priority: "high", status: "draft", data: approved.data },
    });
    expect(kept.body).toMatchObject({ status: "approved", version: "1.0", priority: "high" });
    expect(kept.body.data.approval.byName).toBe("Ana Gil");

    // The steps change: back to review (PLN-08), approval gone, next version.
    const edited = await call(token, "PUT", `/api/test-cases/${c.id}`, {
      input: { projectId, title: "Pay", author: "QA", data: { ...approved.data, steps: [{ id: "x", text: "pay" }] } },
    });
    expect(edited.body).toMatchObject({ status: "reviewed", version: "1.1" });
    expect(edited.body.data.approval).toBeUndefined();
    expect(edited.body.data.review).toMatchObject({ state: "pending", version: "1.1", reopenedFrom: "1.0" });
  });

  it("the review base is the last approved or sent state", async () => {
    const token = await tokenFor();
    const { projectId, c } = await newCase(token);
    expect((await call(token, "GET", `/api/test-cases/${c.id}/review-base`)).body).toBeNull();
    await review(token, c.id, { action: "send" });
    const sent = (await call(token, "GET", `/api/test-cases/${c.id}`)).body;
    await review(token, c.id, { action: "return", comment: "More" });
    const fixed = await call(token, "PUT", `/api/test-cases/${c.id}`, {
      input: { projectId, title: "Pay now", author: "QA", data: sent.data },
    });
    // The answer to «Pedir cambios» keeps the case in review (PLN-08).
    expect(fixed.body).toMatchObject({ status: "reviewed", data: { review: { state: "pending", comment: "More" } } });
    const base = (await call(token, "GET", `/api/test-cases/${c.id}/review-base`)).body;
    expect(base).toMatchObject({ revision: 3, status: "reviewed", title: "Pay" });
  });
});

describe("suite baselines on the web (CAS-02)", () => {
  it("freezes the chosen cases, leaves the unapproved out and stays frozen", async () => {
    const token = await tokenFor();
    const { projectId, c } = await newCase(token);
    const other = (await call(token, "POST", "/api/test-cases", { projectId, title: "Refund", author: "QA", data: {} })).body;
    expect(
      (await call(token, "POST", "/api/case-baselines", { projectId, name: "R1", approvedOnly: true, caseIds: [c.id, other.id] }))
        .status,
    ).toBe(400);
    await review(token, c.id, { action: "send" });
    await review(token, c.id, { action: "approve" });
    const created = await call(token, "POST", "/api/case-baselines", {
      projectId,
      name: " Release 2.4 ",
      approvedOnly: true,
      caseIds: [c.id, other.id, "unknown"],
    });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ name: "Release 2.4", itemCount: 1, approvedOnly: true });

    const approved = (await call(token, "GET", `/api/test-cases/${c.id}`)).body;
    await call(token, "PUT", `/api/test-cases/${c.id}`, {
      input: { projectId, title: "Pay later", author: "QA", data: approved.data },
    });
    const base = (await call(token, "GET", `/api/case-baselines/${created.body.id}`)).body;
    expect(base.items).toHaveLength(1);
    expect(base.items[0]).toMatchObject({ caseId: c.id, title: "Pay", status: "approved", revision: 3 });
    expect(base.items[0].data.steps[0].text).toBe("open");

    const now = (await call(token, "GET", `/api/case-baselines/current?projectId=${projectId}`)).body;
    expect(now.items.find((i: { caseId: string }) => i.caseId === c.id)).toMatchObject({ title: "Pay later", status: "reviewed" });
    const list = (await call(token, "GET", `/api/case-baselines?projectId=${projectId}`)).body;
    expect(list).toHaveLength(1);
  });

  it("another account sees none of them", async () => {
    const mine = await tokenFor();
    const other = await tokenFor("other@pharos.dev");
    const { projectId, c } = await newCase(mine);
    const b = (await call(mine, "POST", "/api/case-baselines", { projectId, name: "B", caseIds: [c.id] })).body;
    expect((await call(other, "GET", `/api/case-baselines/${b.id}`)).body).toBeNull();
    expect((await call(other, "GET", `/api/case-baselines?projectId=${projectId}`)).body).toEqual([]);
    expect((await call(other, "POST", "/api/case-baselines", { projectId, name: "X", caseIds: [c.id] })).status).toBe(404);
  });
});

describe("the save rules", () => {
  it("what counts as content and the next version", () => {
    expect(contentChanged("T", { steps: [1], custom: { a: 1 } }, "T ", { steps: [1], custom: { a: 2 }, notes: "" })).toBe(false);
    expect(contentChanged("T", { steps: [1] }, "T", { steps: [2] })).toBe(true);
    expect(nextVersion("1.9")).toBe("1.10");
    expect(nextVersion("v1")).toBe("v1");
    const saved = { status: "approved", title: "T", version: "1.0", data: { steps: [1], approval: { by: "u" } } };
    expect(afterSave(saved, "T", "1.0", { steps: [1] })).toMatchObject({ status: "approved", data: { approval: { by: "u" } } });
    expect(afterSave(saved, "T", "1.0", { steps: [2] })).toMatchObject({ status: "reviewed", version: "1.1" });
    // In review, an edit stays in review and answers a «Pedir cambios».
    const asked = { status: "reviewed", title: "T", version: "1.0", data: { steps: [1], review: { state: "changesRequested", comment: "x" } } };
    expect(afterSave(asked, "T", undefined, { steps: [2] })).toMatchObject({
      status: "reviewed",
      version: "1.0",
      data: { review: { state: "pending", comment: "x" } },
    });
    // A draft stays a draft (Borrador is only the first stage).
    expect(afterSave({ ...saved, status: "draft" }, "T", "1.0", { steps: [2] }).status).toBe("draft");
  });
});

describe("suite baselines over sync (CAS-02)", () => {
  async function pull(token: string, features: string) {
    const res = await app.inject({
      method: "GET",
      url: "/sync/pull?since=0",
      headers: { authorization: `Bearer ${token}`, [VERSION_HEADER]: SERVER_VERSION, [FEATURES_HEADER]: features },
    });
    return (res.json().docs as { entity: string; payload: Record<string, unknown> }[]).filter(
      (d) => d.entity === "case_baseline",
    );
  }

  it("only clients that announce case-baselines pull them, with their location", async () => {
    const token = await tokenFor();
    const { projectId, c } = await newCase(token);
    await call(token, "POST", "/api/case-baselines", { projectId, name: "B", caseIds: [c.id] });
    const full = "key-conflicts,append-only,complete-payload,stable-steps,runs,custom-fields,cycles,defects,requirement-data";
    expect(await pull(token, full)).toHaveLength(0);
    const docs = await pull(token, `${full},case-baselines`);
    expect(docs).toHaveLength(1);
    expect(docs[0].payload).toMatchObject({ projectId, name: "B" });
    expect(typeof docs[0].payload.workspaceId).toBe("string");
  });

  it("a push of a baseline from a client without the feature is refused", async () => {
    const token = await tokenFor();
    const res = await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: {
        authorization: `Bearer ${token}`,
        [VERSION_HEADER]: SERVER_VERSION,
        [FEATURES_HEADER]: "key-conflicts,append-only,complete-payload,stable-steps",
      },
      payload: {
        deltas: [
          {
            entity: "case_baseline",
            entityId: "b1",
            op: "append",
            payload: { id: "b1", projectId: "p", name: "B", items: [] },
            revision: 1,
            author: "x",
            hlc: "0000000000001-0000-dev",
          },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("case_baselines_unsupported");
  });
});

describe("suite baselines and move-project (CAS-02 with ADR-0042)", () => {
  it("moving the project moves its baselines and their case revisions; the web still reads them", async () => {
    const token = await tokenFor();
    const { projectId, c } = await newCase(token);
    await review(token, c.id, { action: "send" });
    await review(token, c.id, { action: "approve" });
    const b = (await call(token, "POST", "/api/case-baselines", { projectId, name: "R1", caseIds: [c.id] })).body;
    const ws = await app.inject({
      method: "POST",
      url: "/workspaces",
      headers: { authorization: `Bearer ${token}`, [VERSION_HEADER]: SERVER_VERSION, [FEATURES_HEADER]: SERVER_FEATURES.join(",") },
      payload: { name: "Equipo QA" },
    });
    expect(ws.statusCode).toBe(201);
    const shared = ws.json().id as string;
    const moved = await app.inject({
      method: "POST",
      url: `/workspaces/${shared}/move-project`,
      headers: { authorization: `Bearer ${token}`, [VERSION_HEADER]: SERVER_VERSION, [FEATURES_HEADER]: SERVER_FEATURES.join(",") },
      payload: { projectId },
    });
    expect(moved.statusCode).toBe(200);
    const rows = (
      await pool.query(
        "SELECT workspace_id, entity, deleted, payload FROM documents WHERE entity IN ('case_baseline', 'test_case_revision')",
      )
    ).rows as { workspace_id: string; entity: string; deleted: boolean; payload: Record<string, unknown> }[];
    const live = rows.filter((r) => !r.deleted);
    // Every live baseline and revision is in the shared workspace, located there.
    expect(live.length).toBeGreaterThan(1);
    for (const r of live) expect([r.workspace_id, r.payload.workspaceId]).toEqual([shared, shared]);
    // The origin keeps only move tombstones.
    for (const r of rows.filter((x) => x.workspace_id !== shared)) {
      expect(r.deleted).toBe(true);
      expect(r.payload).toEqual({ movedTo: shared });
    }
    // The content did not change, and the web still resolves it.
    const base = (await call(token, "GET", `/api/case-baselines/${b.id}`)).body;
    expect(base).toMatchObject({ name: "R1", itemCount: 1 });
    expect(base.items[0]).toMatchObject({ caseId: c.id, status: "approved" });
    expect(base.items[0].data.steps[0].text).toBe("open");
  });
});
