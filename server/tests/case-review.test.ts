import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import { FEATURES_HEADER, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
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

  it("returning needs a comment; transitions out of order are refused", async () => {
    const token = await tokenFor();
    const { c } = await newCase(token);
    expect((await review(token, c.id, { action: "approve" })).status).toBe(409);
    await review(token, c.id, { action: "send" });
    expect((await review(token, c.id, { action: "return", comment: "  " })).status).toBe(400);
    const back = await review(token, c.id, { action: "return", comment: "Step 3?" });
    expect(back.body.status).toBe("draft");
    expect(back.body.data.review).toMatchObject({ state: "returned", comment: "Step 3?" });
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

    // The steps change: back to draft, approval gone, next version.
    const edited = await call(token, "PUT", `/api/test-cases/${c.id}`, {
      input: { projectId, title: "Pay", author: "QA", data: { ...approved.data, steps: [{ id: "x", text: "pay" }] } },
    });
    expect(edited.body).toMatchObject({ status: "draft", version: "1.1" });
    expect(edited.body.data.approval).toBeUndefined();
    expect(edited.body.data.review).toBeUndefined();
  });

  it("the review base is the last approved or sent state", async () => {
    const token = await tokenFor();
    const { projectId, c } = await newCase(token);
    expect((await call(token, "GET", `/api/test-cases/${c.id}/review-base`)).body).toBeNull();
    await review(token, c.id, { action: "send" });
    const sent = (await call(token, "GET", `/api/test-cases/${c.id}`)).body;
    await review(token, c.id, { action: "return", comment: "More" });
    await call(token, "PUT", `/api/test-cases/${c.id}`, {
      input: { projectId, title: "Pay now", author: "QA", data: sent.data },
    });
    await review(token, c.id, { action: "send" });
    const base = (await call(token, "GET", `/api/test-cases/${c.id}/review-base`)).body;
    expect(base).toMatchObject({ revision: 2, status: "reviewed", title: "Pay" });
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
    expect(now.items.find((i: { caseId: string }) => i.caseId === c.id)).toMatchObject({ title: "Pay later", status: "draft" });
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
    expect(afterSave(saved, "T", "1.0", { steps: [2] })).toMatchObject({ status: "draft", version: "1.1" });
  });
});
