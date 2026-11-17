// Notifications (RED-W2, ADR-0048): emit, pull by cursor, read marks that
// travel, dedupe, retention and who may notify whom.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { ZodError } from "zod";
import { setupTestApp, truncateAll, testEnv } from "./helpers";
import { FEATURES_HEADER, SERVER_FEATURES, SERVER_VERSION, VERSION_HEADER } from "../src/modules/sync/sync.version";
import { createTokenService } from "../src/modules/auth/tokens";
import {
  createNotificationStore,
  emitNotification,
  MAX_PER_RECIPIENT,
  notificationRoutes,
  type Membership,
} from "../src/modules/notifications/notifications";

let app: FastifyInstance;
let pool: Pool;
/** A second app whose membership says everyone shares workspace "ws-1". */
let teamApp: FastifyInstance;

const everyone: Membership = {
  canNotify: () => Promise.resolve(true),
  members: (ws) => Promise.resolve(ws === "ws-1" ? [...ids.values()] : []),
};
const ids = new Map<string, string>();

beforeAll(async () => {
  ({ app, pool } = await setupTestApp());
  teamApp = Fastify();
  const tokens = createTokenService({
    accessSecret: testEnv.JWT_ACCESS_SECRET,
    accessTtl: testEnv.ACCESS_TOKEN_TTL,
    refreshTtlDays: testEnv.REFRESH_TOKEN_TTL_DAYS,
  });
  notificationRoutes(teamApp, { tokens, store: createNotificationStore(pool, everyone) });
  teamApp.setErrorHandler((e, _req, reply) =>
    reply.code(e instanceof ZodError ? 400 : 500).send({ message: String(e) }),
  );
  await teamApp.ready();
});
afterAll(async () => {
  await teamApp.close();
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await truncateAll(pool);
  ids.clear();
});

async function user(name: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: `${name}@pharos.dev`, password: "supersecret1", displayName: name, firstName: "A", lastName: "B" },
  });
  const body = res.json() as { accessToken: string; user: { id: string } };
  ids.set(name, body.user.id);
  return body.accessToken;
}

const headers = (t: string) => ({
  authorization: `Bearer ${t}`,
  [VERSION_HEADER]: SERVER_VERSION,
  [FEATURES_HEADER]: SERVER_FEATURES.join(","),
});
const pull = (a: FastifyInstance, t: string, since = 0) =>
  a.inject({ method: "GET", url: `/api/me/notifications?since=${since}`, headers: headers(t) });
const send = (a: FastifyInstance, t: string, input: unknown) =>
  a.inject({ method: "POST", url: "/api/notifications", headers: headers(t), payload: { input } });
const markRead = (a: FastifyInstance, t: string, input: unknown) =>
  a.inject({ method: "POST", url: "/api/me/notifications/read", headers: headers(t), payload: { input } });

const subject = { entity: "defect", id: "d-1", key: "BM-DEF-031", title: "El saldo no se refresca" };

describe("/api/notifications (RED-W2)", () => {
  it("needs a session and a supported version", async () => {
    expect((await app.inject({ method: "GET", url: "/api/me/notifications" })).statusCode).toBe(401);
  });

  it("without workspaces nobody else is notified", async () => {
    const ana = await user("ana");
    await user("luis");
    const res = await send(app, ana, { kind: "defect.assigned", to: { userIds: [ids.get("luis")] }, subject });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ delivered: 0 });
  });

  it("delivers to a member, who pulls it, marks it read, and the mark travels", async () => {
    const ana = await user("ana");
    const luis = await user("luis");
    const res = await send(teamApp, ana, {
      kind: "defect.assigned",
      to: { userIds: [ids.get("luis")] },
      projectId: "p-1",
      subject,
      dedupeKey: "d-1:3:defect.assigned",
    });
    expect(res.json()).toEqual({ delivered: 1 });

    const first = (await pull(teamApp, luis)).json();
    expect(first.unread).toBe(1);
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({
      kind: "defect.assigned",
      actorId: ids.get("ana"),
      actorName: "ana",
      projectId: "p-1",
      subject,
      readAt: null,
    });
    // The sender gets nothing.
    expect((await pull(teamApp, ana)).json().items).toEqual([]);

    expect((await markRead(teamApp, luis, { ids: [first.items[0].id] })).json()).toEqual({ unread: 0 });
    const next = (await pull(teamApp, luis, first.cursor)).json();
    expect(next.items).toHaveLength(1);
    expect(next.items[0].readAt).not.toBeNull();
    expect(next.cursor).toBeGreaterThan(first.cursor);
  });

  it("stores the same event once per recipient", async () => {
    const ana = await user("ana");
    const luis = await user("luis");
    const input = { kind: "case.approved", to: { userIds: [ids.get("luis")] }, subject, dedupeKey: "c:4:case.approved" };
    await send(teamApp, ana, input);
    await send(teamApp, ana, input);
    expect((await pull(teamApp, luis)).json().items).toHaveLength(1);
  });

  it("expands a workspace to its members, without the sender", async () => {
    const ana = await user("ana");
    const luis = await user("luis");
    const eva = await user("eva");
    const res = await send(teamApp, ana, { kind: "cycle.closed", to: { workspace: true }, workspaceId: "ws-1", subject });
    expect(res.json()).toEqual({ delivered: 2 });
    expect((await pull(teamApp, luis)).json().unread).toBe(1);
    expect((await pull(teamApp, eva)).json().unread).toBe(1);
  });

  it("marks everything read", async () => {
    const ana = await user("ana");
    const luis = await user("luis");
    for (const n of [1, 2, 3]) {
      await send(teamApp, ana, { kind: "defect.assigned", to: { userIds: [ids.get("luis")] }, subject: { ...subject, id: `d-${n}` } });
    }
    expect((await markRead(teamApp, luis, { all: true })).json()).toEqual({ unread: 0 });
  });

  it("refuses local-only kinds, bad recipients and big data", async () => {
    const ana = await user("ana");
    expect((await send(teamApp, ana, { kind: "sync.conflict", to: { userIds: [ids.get("ana")] }, subject })).statusCode).toBe(400);
    expect((await send(teamApp, ana, { kind: "cycle.closed", to: { userIds: ["nope"] }, subject })).statusCode).toBe(400);
    const data = { blob: "x".repeat(3000) };
    expect(
      (await send(teamApp, ana, { kind: "cycle.closed", to: { userIds: [ids.get("ana")] }, subject, data })).statusCode,
    ).toBe(400);
  });

  it("drops what is older than 90 days and keeps the newest 500", async () => {
    await user("ana");
    const luis = await user("luis");
    const recipient = ids.get("luis") as string;
    for (let i = 0; i < MAX_PER_RECIPIENT + 3; i++) {
      await pool.query(
        `INSERT INTO notifications (recipient_id, kind, subject, created_at)
         VALUES ($1, 'cycle.closed', '{}'::jsonb, now() - make_interval(secs => $2))`,
        [recipient, MAX_PER_RECIPIENT + 3 - i],
      );
    }
    await emitNotification(
      pool,
      { kind: "cycle.closed", actorId: ids.get("ana") as string, recipientIds: [recipient], subject },
      everyone,
    );
    const { rows } = await pool.query<{ n: string }>("SELECT count(*) AS n FROM notifications WHERE recipient_id = $1", [recipient]);
    expect(Number(rows[0].n)).toBe(MAX_PER_RECIPIENT);

    await pool.query("UPDATE notifications SET created_at = now() - interval '91 days' WHERE recipient_id = $1", [recipient]);
    const res = (await pull(teamApp, luis)).json();
    expect(res.keptIds).toEqual([]);
  });
});
