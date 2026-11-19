// Outgoing webhooks of a workspace (INT-03, ADR-0052 §4): managing them, the
// outbox every document write feeds, and the deliveries list.
//
// - A Test Manager (`token.manage`) creates, edits, rotates, tests and
//   deletes them; every member sees the list, without the secret and with
//   only the host of the URL.
// - The secret is shown once and stored encrypted (`WEBHOOK_SECRETS_KEY`,
//   the AI vault's AES-256-GCM, bound to the webhook by its AAD). Without the
//   key webhooks are off: `/auth/capabilities` says so and nothing is stored.
// - Every change is a `webhook` audit event, never with the secret.
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { AppError } from "../auth/errors.js";
import { appendWebEvent } from "../audit/audit.store.js";
import type { Vault } from "../ai/vault.js";
import type { ServerClock } from "../sync/sync.hlc.js";
import { lockWorkspaces, type DocumentHook, type DocumentWrite } from "../sync/sync.repository.js";
import { requireMembership, requireRole } from "../workspaces/access.js";
import { can } from "../workspaces/roles.js";
import { deriveEvents, EVENT_ENTITIES, PING, WEBHOOK_EVENTS, type WebhookEvent } from "./events.js";
import { newSecret } from "./signing.js";
import { checkUrl, type TargetPolicy } from "./ssrf.js";

/** Live webhooks per workspace. */
export const MAX_WEBHOOKS = 20;
/** Deliveries kept, and how long. */
export const DELIVERY_RETENTION_DAYS = 30;
/** A rotation keeps the old secret signing this long. */
export const ROTATION_OVERLAP_HOURS = 24;

type Json = Record<string, unknown>;

export const WebhookErrors = {
  disabled: () =>
    new AppError(409, "webhooks_disabled", "Webhooks are off on this server: its administrator sets WEBHOOK_SECRETS_KEY."),
  notFound: () => new AppError(404, "webhook_not_found", "Webhook not found."),
  url: (reason: string) =>
    new AppError(400, "webhook_url", "Use an https address on the internet (a private one only if the server allows it).", { reason }),
  limit: () => new AppError(409, "webhook_limit", `At most ${MAX_WEBHOOKS} webhooks per workspace.`, { max: MAX_WEBHOOKS }),
  project: () => new AppError(404, "not_found", "Project not found in this workspace."),
  delivery: () => new AppError(404, "delivery_not_found", "Delivery not found."),
};

export interface WebhookView {
  id: string;
  workspaceId: string;
  name: string;
  /** The whole URL for a Test Manager; only its host for the others. */
  url: string;
  projectId: string | null;
  projectName: string | null;
  events: WebhookEvent[];
  active: boolean;
  disabledReason: "manual" | "failures" | null;
  consecutiveFailures: number;
  rotating: boolean;
  lastDelivery: { status: string; httpStatus: number | null; at: string } | null;
  createdAt: string;
}

export interface DeliveryView {
  id: string;
  eventType: string;
  status: "pending" | "delivered" | "failed" | "abandoned";
  attempt: number;
  nextAttemptAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
  lastDurationMs: number | null;
  lastResponse: string | null;
  createdAt: string;
  deliveredAt: string | null;
  payload: Json;
}

interface Row {
  id: string;
  workspace_id: string;
  name: string;
  url: string;
  project_id: string | null;
  project_name: string | null;
  events: string[];
  active: boolean;
  disabled_reason: "manual" | "failures" | null;
  consecutive_failures: number;
  previous_until: Date | null;
  created_at: Date;
  last_status: string | null;
  last_http: number | null;
  last_at: Date | null;
}

const SELECT = `
  SELECT h.id, h.workspace_id, h.name, h.url, h.project_id, p.payload->>'name' AS project_name, h.events,
         h.active, h.disabled_reason, h.consecutive_failures, h.previous_until, h.created_at,
         d.status AS last_status, d.last_status AS last_http, coalesce(d.delivered_at, d.created_at) AS last_at
    FROM webhooks h
    LEFT JOIN documents p ON p.workspace_id = h.workspace_id AND p.entity = 'project' AND p.entity_id = h.project_id
    LEFT JOIN LATERAL (SELECT status, last_status, delivered_at, created_at FROM webhook_deliveries
                        WHERE webhook_id = h.id AND attempt > 0 ORDER BY created_at DESC LIMIT 1) d ON true`;

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

function view(r: Row, full: boolean): WebhookView {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    url: full ? r.url : hostOf(r.url),
    projectId: r.project_id,
    projectName: r.project_name,
    events: r.events.filter((e): e is WebhookEvent => (WEBHOOK_EVENTS as readonly string[]).includes(e)),
    active: r.active,
    disabledReason: r.disabled_reason,
    consecutiveFailures: r.consecutive_failures,
    rotating: !!r.previous_until && r.previous_until.getTime() > Date.now(),
    lastDelivery: r.last_status ? { status: r.last_status, httpStatus: r.last_http, at: (r.last_at as Date).toISOString() } : null,
    createdAt: r.created_at.toISOString(),
  };
}

/** The URL with its query and fragment hidden, for the audit trail. */
const maskedUrl = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}${u.search ? "?…" : ""}`;
  } catch {
    return "";
  }
};

export interface WebhookInput {
  name: string;
  url: string;
  projectId: string | null;
  events: WebhookEvent[];
}

export function createWebhookService(deps: {
  pool: Pool;
  clock: ServerClock;
  vault: Vault | null;
  policy: TargetPolicy;
  /** The web app's address, for the links of an event. */
  publicUrl?: string;
}) {
  const { pool, clock, vault, policy } = deps;

  async function inTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  const requireVault = () => {
    if (!vault) throw WebhookErrors.disabled();
    return vault;
  };

  async function row(q: Pool | PoolClient, workspaceId: string, id: string): Promise<Row> {
    const { rows } = await q.query<Row>(`${SELECT} WHERE h.id = $1 AND h.workspace_id = $2 AND h.deleted_at IS NULL`, [id, workspaceId]);
    if (!rows[0]) throw WebhookErrors.notFound();
    return rows[0];
  }

  async function audit(c: PoolClient, userId: string, workspaceId: string, action: "create" | "update" | "delete", r: { id: string; name: string; url: string; project_id?: string | null }, changes: Json, summary: Json = {}) {
    await lockWorkspaces(c, [workspaceId]);
    await appendWebEvent(c, clock, {
      userId,
      workspaceId,
      action,
      entity: "webhook",
      entityId: r.id,
      projectId: r.project_id ?? null,
      entityKey: r.name,
      changes,
      summary: { name: r.name, url: maskedUrl(r.url), ...summary },
    });
  }

  async function checkTarget(c: Pool | PoolClient, workspaceId: string, input: WebhookInput) {
    const problem = checkUrl(input.url, policy);
    if (problem) throw WebhookErrors.url(problem);
    if (input.projectId) {
      const p = await c.query(
        `SELECT 1 FROM documents WHERE workspace_id = $1 AND entity = 'project' AND entity_id = $2 AND NOT deleted`,
        [workspaceId, input.projectId],
      );
      if (!p.rowCount) throw WebhookErrors.project();
    }
  }

  /** The envelope of an event (ADR-0052 §4). */
  async function envelope(
    c: Pool | PoolClient,
    ev: { id: string; type: string; workspaceId: string; projectId: string | null; actorId: string | null; data: Json; occurredAt: string },
  ): Promise<Json> {
    const { rows } = await c.query<{ ws: string; project: string | null; actor: string | null }>(
      `SELECT w.name AS ws,
              (SELECT payload->>'name' FROM documents WHERE workspace_id = w.id AND entity = 'project' AND entity_id = $2) AS project,
              (SELECT coalesce(nullif(display_name, ''), email) FROM users WHERE id = $3) AS actor
         FROM workspaces w WHERE w.id = $1`,
      [ev.workspaceId, ev.projectId, ev.actorId],
    );
    const base = deps.publicUrl?.replace(/\/$/, "");
    const run = (ev.data.run as Json | undefined)?.id;
    return {
      id: ev.id,
      type: ev.type,
      occurredAt: ev.occurredAt,
      workspace: { id: ev.workspaceId, name: rows[0]?.ws ?? null },
      project: ev.projectId ? { id: ev.projectId, name: rows[0]?.project ?? null } : null,
      actor: ev.actorId ? { kind: "user", id: ev.actorId, name: rows[0]?.actor ?? null } : null,
      data: ev.data,
      links: base && typeof run === "string" ? { app: `${base}/runs/${run}` } : {},
    };
  }

  /** The outbox (ADR-0052 §4): every write of an entity with events, in the
   *  writer's transaction, queues one delivery per subscribed webhook. */
  const outbox: DocumentHook = {
    entities: EVENT_ENTITIES,
    async onWrite(client: PoolClient, w: DocumentWrite) {
      const events = deriveEvents(w);
      if (events.length === 0) return;
      const { rows: hooks } = await client.query<{ id: string; events: string[]; project_id: string | null }>(
        `SELECT id, events, project_id FROM webhooks
          WHERE workspace_id = $1 AND active AND deleted_at IS NULL`,
        [w.scope.workspaceId],
      );
      if (hooks.length === 0) return;
      for (const ev of events) {
        const targets = hooks.filter((h) => h.events.includes(ev.type) && (!h.project_id || h.project_id === ev.projectId));
        if (targets.length === 0) continue;
        const payload = await envelope(client, {
          id: randomUUID(),
          type: ev.type,
          workspaceId: w.scope.workspaceId,
          projectId: ev.projectId,
          actorId: w.scope.userId,
          data: ev.data,
          occurredAt: new Date().toISOString(),
        });
        for (const h of targets) {
          await client.query(
            `INSERT INTO webhook_deliveries (webhook_id, event_id, event_type, payload) VALUES ($1, $2, $3, $4)`,
            [h.id, payload.id, ev.type, payload],
          );
        }
      }
    },
  };

  return {
    outbox,
    enabled: () => vault !== null,

    async list(userId: string, workspaceId: string): Promise<WebhookView[]> {
      const m = await requireMembership(pool, userId, workspaceId);
      const { rows } = await pool.query<Row>(
        `${SELECT} WHERE h.workspace_id = $1 AND h.deleted_at IS NULL ORDER BY h.created_at DESC`,
        [workspaceId],
      );
      return rows.map((r) => view(r, can(m.role, "token.manage")));
    },

    async create(userId: string, workspaceId: string, input: WebhookInput): Promise<{ secret: string; view: WebhookView }> {
      const v = requireVault();
      const secret = newSecret();
      const id = await inTx(async (c) => {
        await requireRole(c, userId, workspaceId, "token.manage");
        await checkTarget(c, workspaceId, input);
        const n = await c.query<{ n: string }>(`SELECT count(*) AS n FROM webhooks WHERE workspace_id = $1 AND deleted_at IS NULL`, [workspaceId]);
        if (Number(n.rows[0].n) >= MAX_WEBHOOKS) throw WebhookErrors.limit();
        const newId = randomUUID();
        const sealed = v.seal(secret, newId, "webhook");
        await c.query(
          `INSERT INTO webhooks (id, workspace_id, project_id, name, url, events, secret_nonce, secret_ciphertext, secret_kek_id, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [newId, workspaceId, input.projectId, input.name.trim(), input.url, input.events, sealed.nonce, sealed.ciphertext, sealed.kekId, userId],
        );
        await audit(c, userId, workspaceId, "create", { id: newId, name: input.name.trim(), url: input.url, project_id: input.projectId }, {
          name: [null, input.name.trim()],
          events: [null, input.events],
        });
        return newId;
      });
      return { secret, view: view(await row(pool, workspaceId, id), true) };
    },

    async update(userId: string, workspaceId: string, id: string, input: Partial<WebhookInput> & { active?: boolean }): Promise<WebhookView> {
      await inTx(async (c) => {
        await requireRole(c, userId, workspaceId, "token.manage");
        const r = await row(c, workspaceId, id);
        const next = {
          name: input.name?.trim() ?? r.name,
          url: input.url ?? r.url,
          projectId: input.projectId === undefined ? r.project_id : input.projectId,
          events: input.events ?? (r.events as WebhookEvent[]),
        };
        await checkTarget(c, workspaceId, next);
        const reactivate = input.active === true && !r.active;
        await c.query(
          `UPDATE webhooks SET name = $3, url = $4, project_id = $5, events = $6, updated_at = now(),
                  active = coalesce($7, active),
                  disabled_at = CASE WHEN $7 = false THEN now() WHEN $7 = true THEN NULL ELSE disabled_at END,
                  disabled_reason = CASE WHEN $7 = false THEN 'manual' WHEN $7 = true THEN NULL ELSE disabled_reason END,
                  consecutive_failures = CASE WHEN $7 = true THEN 0 ELSE consecutive_failures END
            WHERE id = $1 AND workspace_id = $2`,
          [id, workspaceId, next.name, next.url, next.projectId, next.events, input.active ?? null],
        );
        // Reactivated: what is still pending is sent again from now.
        if (reactivate) {
          await c.query(
            `UPDATE webhook_deliveries SET status = 'pending', next_attempt_at = now()
              WHERE webhook_id = $1 AND status IN ('pending', 'failed')`,
            [id],
          );
        }
        const changes: Json = {};
        if (next.name !== r.name) changes.name = [r.name, next.name];
        if (next.url !== r.url) changes.url = [maskedUrl(r.url), maskedUrl(next.url)];
        if (next.projectId !== r.project_id) changes.projectId = [r.project_id, next.projectId];
        if (JSON.stringify(next.events) !== JSON.stringify(r.events)) changes.events = [r.events, next.events];
        if (input.active !== undefined && input.active !== r.active) changes.active = [r.active, input.active];
        if (Object.keys(changes).length) await audit(c, userId, workspaceId, "update", { id, name: next.name, url: next.url, project_id: next.projectId }, changes);
      });
      return view(await row(pool, workspaceId, id), true);
    },

    async remove(userId: string, workspaceId: string, id: string): Promise<void> {
      await inTx(async (c) => {
        await requireRole(c, userId, workspaceId, "token.manage");
        const r = await row(c, workspaceId, id);
        await c.query(`UPDATE webhooks SET deleted_at = now(), active = false WHERE id = $1`, [id]);
        await c.query(`DELETE FROM webhook_deliveries WHERE webhook_id = $1 AND status IN ('pending', 'failed')`, [id]);
        await audit(c, userId, workspaceId, "delete", r, { deletedAt: [null, new Date().toISOString()] });
      });
    },

    /** A new secret; the old one keeps signing for 24 hours. */
    async rotate(userId: string, workspaceId: string, id: string): Promise<{ secret: string; view: WebhookView }> {
      const v = requireVault();
      const secret = newSecret();
      await inTx(async (c) => {
        await requireRole(c, userId, workspaceId, "token.manage");
        const r = await row(c, workspaceId, id);
        const sealed = v.seal(secret, id, "webhook");
        await c.query(
          `UPDATE webhooks SET previous_nonce = secret_nonce, previous_ciphertext = secret_ciphertext, previous_kek_id = secret_kek_id,
                  previous_until = now() + make_interval(hours => $5),
                  secret_nonce = $2, secret_ciphertext = $3, secret_kek_id = $4, updated_at = now()
            WHERE id = $1`,
          [id, sealed.nonce, sealed.ciphertext, sealed.kekId, ROTATION_OVERLAP_HOURS],
        );
        await audit(c, userId, workspaceId, "update", r, { secret: ["rotated", "rotated"] }, { rotated: true });
      });
      return { secret, view: view(await row(pool, workspaceId, id), true) };
    },

    /** «Enviar prueba»: a `ping` delivery, sent by the dispatcher like any other. */
    async test(userId: string, workspaceId: string, id: string): Promise<{ deliveryId: string }> {
      requireVault();
      await requireRole(pool, userId, workspaceId, "token.manage");
      const r = await row(pool, workspaceId, id);
      const payload = await envelope(pool, {
        id: randomUUID(),
        type: PING,
        workspaceId,
        projectId: r.project_id,
        actorId: userId,
        data: { webhook: { id, name: r.name } },
        occurredAt: new Date().toISOString(),
      });
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO webhook_deliveries (webhook_id, event_id, event_type, payload) VALUES ($1, $2, $3, $4) RETURNING id`,
        [id, payload.id, PING, payload],
      );
      return { deliveryId: rows[0].id };
    },

    async deliveries(userId: string, workspaceId: string, id: string): Promise<DeliveryView[]> {
      await requireRole(pool, userId, workspaceId, "token.manage");
      await row(pool, workspaceId, id);
      const { rows } = await pool.query(
        `SELECT id, event_type, status, attempt, next_attempt_at, last_status, last_error, last_duration_ms, last_response,
                created_at, delivered_at, payload
           FROM webhook_deliveries WHERE webhook_id = $1 AND created_at > now() - make_interval(days => $2)
          ORDER BY created_at DESC LIMIT 100`,
        [id, DELIVERY_RETENTION_DAYS],
      );
      return rows.map((d) => ({
        id: d.id,
        eventType: d.event_type,
        status: d.status,
        attempt: d.attempt,
        nextAttemptAt: d.status === "delivered" || d.status === "abandoned" ? null : (d.next_attempt_at as Date).toISOString(),
        lastStatus: d.last_status,
        lastError: d.last_error,
        lastDurationMs: d.last_duration_ms,
        lastResponse: d.last_response,
        createdAt: (d.created_at as Date).toISOString(),
        deliveredAt: d.delivered_at ? (d.delivered_at as Date).toISOString() : null,
        payload: d.payload,
      }));
    },

    /** Sends a delivery again now, whatever its state. */
    async redeliver(userId: string, workspaceId: string, id: string, deliveryId: string): Promise<void> {
      await requireRole(pool, userId, workspaceId, "token.manage");
      await row(pool, workspaceId, id);
      const res = await pool.query(
        `UPDATE webhook_deliveries SET status = 'pending', next_attempt_at = now() WHERE id = $1 AND webhook_id = $2`,
        [deliveryId, id],
      );
      if (!res.rowCount) throw WebhookErrors.delivery();
    },
  };
}

export type WebhookService = ReturnType<typeof createWebhookService>;
