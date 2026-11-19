// Sends the outbox (INT-03, ADR-0052 §4). Every tick it claims the due
// deliveries (`FOR UPDATE SKIP LOCKED`, so two server instances never take
// the same one), signs them, POSTs them through the SSRF guard and records
// the answer.
//
// - Success: any 2xx. No redirect is followed. 10 s timeout. The first KiB
//   of the answer is kept to show it in «Entregas».
// - Failure: retried at 30 s, 2 min, 10 min, 1 h, 3 h, 6 h and 12 h (about
//   22 hours); after the 8th attempt the delivery is `abandoned`.
// - 50 failed attempts in a row disable the webhook and tell the workspace's
//   Test Managers.
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { Pool, PoolClient } from "pg";
import type { Vault } from "../ai/vault.js";
import { emitNotification, type Membership } from "../notifications/index.js";
import { signatureHeaders } from "./signing.js";
import { checkUrl, guardedLookup, type TargetPolicy } from "./ssrf.js";

export const RETRY_DELAYS_S = [30, 120, 600, 3600, 10_800, 21_600, 43_200];
export const MAX_ATTEMPTS = RETRY_DELAYS_S.length + 1;
export const DISABLE_AFTER_FAILURES = 50;
const TIMEOUT_MS = 10_000;
const RESPONSE_KEPT = 1024;
/** While a delivery is being sent, nobody else takes it for this long. */
const LEASE_S = 60;
const BATCH = 10;

interface Due {
  id: string;
  webhook_id: string;
  workspace_id: string;
  name: string;
  url: string;
  attempt: number;
  payload: Record<string, unknown>;
  secret_nonce: Buffer;
  secret_ciphertext: Buffer;
  secret_kek_id: string;
  previous_nonce: Buffer | null;
  previous_ciphertext: Buffer | null;
  previous_kek_id: string | null;
  previous_until: Date | null;
}

export interface SendResult {
  ok: boolean;
  status: number | null;
  error: string | null;
  durationMs: number;
  response: string | null;
}

export type Sender = (url: string, body: string, headers: Record<string, string>, policy: TargetPolicy) => Promise<SendResult>;

/** One POST through the guard: checked URL, checked addresses, no redirects. */
export const httpSender: Sender = (url, body, headers, policy) =>
  new Promise((resolve) => {
    const started = Date.now();
    const problem = checkUrl(url, policy);
    if (problem) return resolve({ ok: false, status: null, error: `url: ${problem}`, durationMs: 0, response: null });
    const u = new URL(url);
    const req = (u.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        protocol: u.protocol,
        hostname: u.hostname.replace(/^\[|\]$/g, ""),
        port: u.port || undefined,
        path: `${u.pathname}${u.search}`,
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
          "user-agent": "Pharos-Webhooks/1",
        },
        lookup: guardedLookup(policy, u.hostname) as never,
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let kept = 0;
        res.on("data", (c: Buffer) => {
          if (kept < RESPONSE_KEPT) {
            chunks.push(c.subarray(0, RESPONSE_KEPT - kept));
            kept += Math.min(c.length, RESPONSE_KEPT - kept);
          }
          if (kept >= RESPONSE_KEPT) res.destroy();
        });
        const done = () => {
          const status = res.statusCode ?? null;
          resolve({
            ok: status !== null && status >= 200 && status < 300,
            status,
            error: status !== null && status >= 300 && status < 400 ? "redirect not followed" : null,
            durationMs: Date.now() - started,
            response: Buffer.concat(chunks).toString("utf8") || null,
          });
        };
        res.on("end", done);
        res.on("close", done);
      },
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", (e: NodeJS.ErrnoException) =>
      resolve({ ok: false, status: null, error: e.code ?? e.message, durationMs: Date.now() - started, response: null }),
    );
    req.end(body);
  });

export function createDispatcher(deps: {
  pool: Pool;
  vault: Vault | null;
  policy: TargetPolicy;
  /** Who the workspace's Test Managers are (the notifications' membership). */
  membership: Membership;
  send?: Sender;
  now?: () => number;
}) {
  const { pool, vault, policy } = deps;
  const send = deps.send ?? httpSender;
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  async function claim(): Promise<Due[]> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<Due>(
        `SELECT d.id, d.webhook_id, h.workspace_id, h.name, h.url, d.attempt, d.payload,
                h.secret_nonce, h.secret_ciphertext, h.secret_kek_id,
                h.previous_nonce, h.previous_ciphertext, h.previous_kek_id, h.previous_until
           FROM webhook_deliveries d JOIN webhooks h ON h.id = d.webhook_id
          WHERE d.status IN ('pending', 'failed') AND d.next_attempt_at <= now()
            AND h.active AND h.deleted_at IS NULL
          ORDER BY d.next_attempt_at
          LIMIT ${BATCH}
          FOR UPDATE OF d SKIP LOCKED`,
      );
      if (rows.length) {
        await client.query(
          `UPDATE webhook_deliveries SET next_attempt_at = now() + make_interval(secs => $2) WHERE id = ANY($1::uuid[])`,
          [rows.map((r) => r.id), LEASE_S],
        );
      }
      await client.query("COMMIT");
      return rows;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  /** `run.results_uploaded` gets its counts on the first attempt, once the
   *  shard's results are stored, and keeps them on every retry. */
  async function complete(d: Due): Promise<Record<string, unknown>> {
    const data = (d.payload.data ?? {}) as Record<string, unknown>;
    if (d.payload.type !== "run.results_uploaded" || data.counts) return d.payload;
    const shard = (data.shard as { id?: string } | undefined)?.id;
    const { rows } = await pool.query<{ status: string; n: string }>(
      `SELECT payload->>'status' AS status, count(*) AS n FROM documents
        WHERE workspace_id = $1 AND entity = 'result' AND NOT deleted AND payload->>'shardId' = $2
        GROUP BY 1`,
      [d.workspace_id, shard],
    );
    const counts: Record<string, number> = { passed: 0, failed: 0, blocked: 0, skipped: 0, other: 0 };
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + Number(r.n);
    const findings = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM documents WHERE workspace_id = $1 AND entity = 'finding' AND NOT deleted AND payload->>'shardId' = $2`,
      [d.workspace_id, shard],
    );
    const payload = { ...d.payload, data: { ...data, counts: { ...counts, findings: Number(findings.rows[0].n) } } };
    await pool.query(`UPDATE webhook_deliveries SET payload = $2 WHERE id = $1`, [d.id, payload]);
    return payload;
  }

  function secretsOf(d: Due): string[] {
    if (!vault) return [];
    const out: string[] = [];
    const current = vault.open({ nonce: d.secret_nonce, ciphertext: d.secret_ciphertext, kekId: d.secret_kek_id }, d.webhook_id, "webhook");
    if (current) out.push(current);
    if (d.previous_until && d.previous_until.getTime() > Date.now() && d.previous_nonce && d.previous_ciphertext && d.previous_kek_id) {
      const prev = vault.open({ nonce: d.previous_nonce, ciphertext: d.previous_ciphertext, kekId: d.previous_kek_id }, d.webhook_id, "webhook");
      if (prev) out.push(prev);
    }
    return out;
  }

  async function record(c: PoolClient, d: Due, r: SendResult) {
    const attempt = d.attempt + 1;
    if (r.ok) {
      await c.query(
        `UPDATE webhook_deliveries SET status = 'delivered', attempt = $2, last_status = $3, last_error = NULL,
                last_duration_ms = $4, last_response = $5, delivered_at = now() WHERE id = $1`,
        [d.id, attempt, r.status, r.durationMs, r.response],
      );
      await c.query(`UPDATE webhooks SET consecutive_failures = 0 WHERE id = $1`, [d.webhook_id]);
      return;
    }
    const abandoned = attempt >= MAX_ATTEMPTS;
    await c.query(
      `UPDATE webhook_deliveries SET status = $2, attempt = $3, last_status = $4, last_error = $5, last_duration_ms = $6,
              last_response = $7, next_attempt_at = now() + make_interval(secs => $8) WHERE id = $1`,
      [d.id, abandoned ? "abandoned" : "failed", attempt, r.status, r.error, r.durationMs, r.response, RETRY_DELAYS_S[attempt - 1] ?? 0],
    );
    const { rows } = await c.query<{ consecutive_failures: number }>(
      `UPDATE webhooks SET consecutive_failures = consecutive_failures + 1 WHERE id = $1 RETURNING consecutive_failures`,
      [d.webhook_id],
    );
    if ((rows[0]?.consecutive_failures ?? 0) >= DISABLE_AFTER_FAILURES) {
      const off = await c.query(
        `UPDATE webhooks SET active = false, disabled_at = now(), disabled_reason = 'failures' WHERE id = $1 AND active RETURNING id`,
        [d.webhook_id],
      );
      if (off.rowCount) {
        // ADR-0048: the workspace's Test Managers learn it in the app.
        await emitNotification(c, {
          kind: "webhook.disabled",
          // The server did it: nobody is the actor, every Test Manager is told.
          actorId: null,
          recipientIds: { workspaceId: d.workspace_id, roles: ["test_manager"] },
          trusted: true,
          workspaceId: d.workspace_id,
          subject: { entity: "webhook", id: d.webhook_id, title: d.name.slice(0, 300) },
          data: { failures: DISABLE_AFTER_FAILURES },
          dedupeKey: `webhook.disabled:${d.webhook_id}:${Date.now()}`,
        }, deps.membership);
      }
    }
  }

  async function deliver(d: Due) {
    const payload = await complete(d);
    const body = JSON.stringify(payload);
    const secrets = secretsOf(d);
    const r: SendResult = secrets.length
      ? await send(d.url, body, signatureHeaders(secrets, d.id, Math.floor((deps.now?.() ?? Date.now()) / 1000), body), policy)
      : { ok: false, status: null, error: "secret unreadable (WEBHOOK_SECRETS_KEY changed?)", durationMs: 0, response: null };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await record(client, d, r);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  return {
    /** One pass: claims and sends what is due. Returns how many it sent. */
    async runOnce(): Promise<number> {
      if (running) return 0;
      running = true;
      try {
        const due = await claim();
        await Promise.all(due.map((d) => deliver(d)));
        // Old deliveries go (ADR-0052: 30 days).
        await pool.query(`DELETE FROM webhook_deliveries WHERE created_at < now() - interval '30 days'`);
        return due.length;
      } finally {
        running = false;
      }
    },
    start(intervalMs: number, log?: { error(o: unknown, m: string): void }) {
      if (timer || !vault) return;
      timer = setInterval(() => {
        this.runOnce().catch((e) => log?.error({ err: e }, "webhook dispatcher"));
      }, intervalMs);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

export type Dispatcher = ReturnType<typeof createDispatcher>;

declare module "fastify" {
  interface FastifyInstance {
    /** The webhooks' dispatcher (`app.ts`); tests run it by hand. */
    webhookDispatcher: Dispatcher;
  }
}
