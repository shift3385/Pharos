// The read side of the audit log on the server (AUD-01, ADR-0015 «Enmienda
// AUD-01»): what Administración › Auditoría lists, filters and verifies in the
// web, the twin of the desktop's `audit_read.rs`. Read-only. Each account
// reads its own `audit_event` documents: the web's chain and the ones its
// desktops pushed. Roles (TEN-01) will narrow this to the Test Manager.
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { makeRequireAuth } from "../auth/middleware";
import type { TokenService } from "../auth/tokens";
import { requireSupportedVersion } from "../sync/sync.version";
import { verifyChain, type AuditEvent } from "./audit.chain";
import { WEB_DEVICE } from "./audit.store";

/** Largest page served (the UI asks for 50; the export pages through). */
export const MAX_LIMIT = 500;

/** `a` or `a&a=b` → a list; an empty value means no filter. */
const list = z.preprocess(
  (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.string().max(200)).max(100),
);
const text = z.string().max(200).optional();

export const auditQuerySchema = z.object({
  from: text,
  to: text,
  actors: list,
  entities: list,
  actions: list,
  projectIds: list,
  entityId: text,
  search: text,
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(50),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export interface AuditRow {
  id: string;
  at: string;
  actor: string;
  onBehalfOf: string | null;
  action: string;
  entity: string;
  entityId: string;
  entityKey: string | null;
  projectId: string | null;
  projectName: string | null;
  deviceId: string;
  changes: string | null;
  summary: string | null;
  chainWorkspaceId: string;
  chainOwner: string;
  chainSeq: number;
  prevHash: string | null;
  hash: string;
  redactedAt: string | null;
}

export interface AuditChainStatus {
  deviceId: string;
  chainWorkspaceId: string;
  chainOwner: string;
  count: number;
  lastAt: string | null;
  broken: {
    kind: "gap" | "link" | "hash" | "changes";
    seq: number;
    expected: number | null;
    eventId: string | null;
    entityId: string | null;
  } | null;
}

const P = "d.payload";

/** WHERE clause and its arguments; `$1` is the user. */
function where(userId: string, q: AuditQuery): { sql: string; args: unknown[] } {
  const args: unknown[] = [userId];
  const parts = ["d.user_id = $1", "d.entity = 'audit_event'", "NOT d.deleted"];
  const bind = (cond: (n: string) => string, v: unknown) => {
    args.push(v);
    parts.push(cond(`$${args.length}`));
  };
  if (q.from) bind((n) => `${P}->>'at' >= ${n}`, q.from);
  if (q.to) bind((n) => `${P}->>'at' < ${n}`, q.to);
  if (q.entityId) bind((n) => `${P}->>'entityId' = ${n}`, q.entityId);
  if (q.search?.trim()) bind((n) => `strpos(lower(coalesce(${P}->>'entityKey', '')), lower(${n})) > 0`, q.search.trim());
  if (q.actors.length) bind((n) => `${P}->>'actor' = ANY(${n}::text[])`, q.actors);
  if (q.entities.length) bind((n) => `${P}->>'entity' = ANY(${n}::text[])`, q.entities);
  if (q.actions.length) bind((n) => `${P}->>'action' = ANY(${n}::text[])`, q.actions);
  if (q.projectIds.length) bind((n) => `coalesce(${P}->>'projectId', '') = ANY(${n}::text[])`, q.projectIds);
  return { sql: parts.join(" AND "), args };
}

const PROJECT_JOIN = `LEFT JOIN documents p ON p.user_id = d.user_id AND p.entity = 'project'
  AND p.entity_id = ${P}->>'projectId'`;

function toRow(payload: AuditEvent, projectName: string | null): AuditRow {
  return {
    id: payload.id,
    at: payload.at,
    actor: payload.actor,
    onBehalfOf: payload.onBehalfOf ?? null,
    action: payload.action,
    entity: payload.entity,
    entityId: payload.entityId,
    entityKey: payload.entityKey ?? null,
    projectId: payload.projectId ?? null,
    projectName,
    deviceId: payload.deviceId,
    changes: payload.changes ?? null,
    summary: payload.summary ?? null,
    chainWorkspaceId: payload.chainWorkspaceId,
    chainOwner: payload.chainOwner ?? "",
    chainSeq: Number(payload.chainSeq),
    prevHash: payload.prevHash ?? null,
    hash: payload.hash,
    redactedAt: payload.redactedAt ?? null,
  };
}

export function createAuditReader(pool: Pool) {
  return {
    async list(userId: string, q: AuditQuery): Promise<{ total: number; events: AuditRow[] }> {
      const { sql, args } = where(userId, q);
      const count = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM documents d WHERE ${sql}`, args);
      const { rows } = await pool.query<{ payload: AuditEvent; project_name: string | null }>(
        `SELECT d.payload, p.payload->>'name' AS project_name FROM documents d ${PROJECT_JOIN}
          WHERE ${sql}
          ORDER BY ${P}->>'at' DESC, ${P}->>'hlc' DESC, d.entity_id
          LIMIT ${q.limit} OFFSET ${q.offset}`,
        args,
      );
      return { total: Number(count.rows[0].n), events: rows.map((r) => toRow(r.payload, r.project_name)) };
    },

    async facets(userId: string) {
      const base = "d.user_id = $1 AND d.entity = 'audit_event' AND NOT d.deleted";
      const distinct = async (field: string) =>
        (
          await pool.query<{ v: string }>(
            `SELECT DISTINCT ${P}->>'${field}' AS v FROM documents d WHERE ${base} AND ${P}->>'${field}' IS NOT NULL ORDER BY 1`,
            [userId],
          )
        ).rows.map((r) => r.v);
      const projects = await pool.query<{ id: string; name: string | null }>(
        `SELECT DISTINCT ${P}->>'projectId' AS id, p.payload->>'name' AS name FROM documents d ${PROJECT_JOIN}
          WHERE ${base} AND ${P}->>'projectId' IS NOT NULL
          ORDER BY 2 NULLS LAST, 1`,
        [userId],
      );
      return {
        actors: await distinct("actor"),
        entities: await distinct("entity"),
        actions: await distinct("action"),
        projects: projects.rows,
        thisDevice: WEB_DEVICE,
      };
    },

    /** Every chain of the account, checked from its first link. */
    async verify(userId: string): Promise<{ chains: AuditChainStatus[]; thisDevice: string }> {
      const { rows } = await pool.query<{ payload: AuditEvent }>(
        `SELECT d.payload FROM documents d
          WHERE d.user_id = $1 AND d.entity = 'audit_event' AND NOT d.deleted`,
        [userId],
      );
      const groups = new Map<string, AuditEvent[]>();
      for (const { payload } of rows) {
        const key = JSON.stringify([payload.deviceId, payload.chainWorkspaceId, payload.chainOwner ?? ""]);
        const group = groups.get(key) ?? [];
        group.push({ ...payload, chainSeq: Number(payload.chainSeq) });
        groups.set(key, group);
      }
      const chains = [...groups.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, events]): AuditChainStatus => {
          const first = events[0];
          const result = verifyChain(events);
          const lastAt = events.reduce<string | null>((m, e) => (m === null || e.at > m ? e.at : m), null);
          let broken: AuditChainStatus["broken"] = null;
          if (!result.ok) {
            const b = result.break;
            const seq = b.kind === "gap" ? b.found : b.seq;
            const at = events.find((e) => e.chainSeq === seq);
            broken = {
              kind: b.kind,
              seq,
              expected: b.kind === "gap" ? b.expected : null,
              eventId: at?.id ?? null,
              entityId: at?.entityId ?? null,
            };
          }
          return {
            deviceId: first.deviceId,
            chainWorkspaceId: first.chainWorkspaceId,
            chainOwner: first.chainOwner ?? "",
            count: events.length,
            lastAt,
            broken,
          };
        });
      return { chains, thisDevice: WEB_DEVICE };
    },
  };
}

export type AuditReader = ReturnType<typeof createAuditReader>;

export function auditRoutes(app: FastifyInstance, deps: { tokens: TokenService; reader: AuditReader }) {
  const preHandler = [makeRequireAuth(deps.tokens), requireSupportedVersion];
  const user = (req: FastifyRequest) => req.userId as string;
  app.get("/api/audit-events", { preHandler }, (req) => deps.reader.list(user(req), auditQuerySchema.parse(req.query)));
  app.get("/api/audit-events/facets", { preHandler }, (req) => deps.reader.facets(user(req)));
  app.get("/api/audit-events/verify", { preHandler }, (req) => deps.reader.verify(user(req)));
}
