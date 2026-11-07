import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { setupTestApp, truncateAll } from "./helpers";
import {
  FEATURES_HEADER,
  SERVER_VERSION,
  VERSION_HEADER,
} from "../src/modules/sync/sync.version";

// PLN-02: the web keeps the project's «Historial en el plan exportado» and
// reads, read-only, the audit events a plan's history is built from.

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

async function register(
  email: string,
): Promise<{ token: string; userId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email,
      password: "supersecret1",
      displayName: "W",
      firstName: "A",
      lastName: "B",
    },
  });
  const body = res.json();
  return { token: body.accessToken as string, userId: body.user.id as string };
}

type Method = "GET" | "POST" | "PUT";
async function call(
  token: string,
  method: Method,
  url: string,
  payload?: unknown,
) {
  const res = await app.inject({
    method,
    url,
    headers: {
      authorization: `Bearer ${token}`,
      [VERSION_HEADER]: SERVER_VERSION,
      [FEATURES_HEADER]: "key-conflicts",
    },
    payload: payload as object,
  });
  return { status: res.statusCode, body: res.body ? res.json() : undefined };
}

const planInput = (
  projectId: string,
  version: string,
  data: Record<string, unknown>,
  status = "draft",
) => ({
  projectId,
  title: "Plan",
  version,
  author: "QA",
  status,
  data,
});

describe("plan revision history on the web (PLN-02)", () => {
  it("the project keeps the setting; an update that does not send it keeps it", async () => {
    const { token } = await register("hist@pharos.dev");
    const p = (await call(token, "POST", "/api/projects", { name: "Checkout" }))
      .body;
    expect(p.planExportHistory).toBe("current");
    const on = await call(token, "PUT", `/api/projects/${p.id}`, {
      input: { name: "Checkout", planExportHistory: "revisions" },
      revision: p.revision,
    });
    expect(on.status).toBe(200);
    expect(on.body.planExportHistory).toBe("revisions");
    const renamed = await call(token, "PUT", `/api/projects/${p.id}`, {
      input: { name: "Checkout 2" },
      revision: on.body.revision,
    });
    expect(renamed.body.planExportHistory).toBe("revisions");
    expect(
      (await call(token, "GET", `/api/projects/${p.id}`)).body
        .planExportHistory,
    ).toBe("revisions");
    const list = (await call(token, "GET", "/api/projects")).body as {
      id: string;
      planExportHistory: string;
    }[];
    expect(list.find((x) => x.id === p.id)?.planExportHistory).toBe(
      "revisions",
    );
    const bad = await call(token, "PUT", `/api/projects/${p.id}`, {
      input: { name: "Checkout", planExportHistory: "all" },
      revision: renamed.body.revision,
    });
    expect(bad.status).toBe(400);
  });

  it("returns the plan's create and update events, oldest first, only to its owner", async () => {
    const { token, userId } = await register("owner@pharos.dev");
    const p = (await call(token, "POST", "/api/projects", { name: "Checkout" }))
      .body;
    const plan = (
      await call(token, "POST", "/api/test-plans", planInput(p.id, "1.0", {}))
    ).body;
    const v2 = await call(token, "PUT", `/api/test-plans/${plan.id}`, {
      input: planInput(p.id, "1.1", { summary: "s" }),
      revision: plan.revision,
    });
    await call(token, "PUT", `/api/test-plans/${plan.id}`, {
      input: planInput(p.id, "1.2", { summary: "s" }, "approved"),
      revision: v2.body.revision,
    });

    const res = await call(token, "GET", `/api/test-plans/${plan.id}/history`);
    expect(res.status).toBe(200);
    const h = res.body as {
      createdBy: string;
      revisions: unknown[];
      events: {
        action: string;
        actor: string;
        changes: Record<string, [unknown, unknown]>;
      }[];
    };
    expect(h.createdBy).toBe(userId);
    expect(h.revisions).toEqual([]);
    expect(h.events.map((e) => e.action)).toEqual([
      "create",
      "update",
      "update",
    ]);
    expect(h.events.every((e) => e.actor === `user:${userId}`)).toBe(true);
    expect(h.events[1].changes["data.summary"]).toEqual([null, "s"]);
    expect(h.events[2].changes.status).toEqual(["draft", "approved"]);

    const other = await register("other@pharos.dev");
    expect(
      (await call(other.token, "GET", `/api/test-plans/${plan.id}/history`))
        .body,
    ).toBeNull();
  });
});
