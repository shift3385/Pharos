// API tokens (INT-02, ADR-0052 §3): project tokens for CI and personal
// access tokens, their management and their authentication.
//
// - Stored as the SHA-256 of the token (`tokenFormat.ts`); the token itself
//   is returned once, by `create` and `rotate`.
// - A token acts as its owner. Each request checks, in the database, that it
//   is live, that its scope covers the route and that the owner is still an
//   active member whose current role has the capability (`authorize`).
// - Every change (create, rotate, reassign, revoke) is an audit event of the
//   web chain, entity `api_token`, in the token's workspace (a personal token
//   without a workspace: the owner's personal one). Never the token itself.
import type { Pool, PoolClient } from "pg";
import { AppError, AuthErrors } from "../auth/errors";
import { appendWebEvent } from "../audit/audit.store";
import type { ServerClock } from "../sync/sync.hlc";
import { lockWorkspaces } from "../sync/sync.repository";
import { requireMembership, requireRole, WorkspaceErrors } from "../workspaces/access";
import { membership, personalOf, type Queryable } from "../workspaces/members";
import { can } from "../workspaces/roles";
import { API_SCOPES, SCOPE_CAPABILITY, type ApiScope } from "./scopes";
import { hashToken, newToken, parseToken, type TokenKind } from "./tokenFormat";

/** Longest life of a token: one year (approved 2026-11-18, decision 4). */
export const MAX_TOKEN_DAYS = 366;
/** Live project tokens per workspace and personal tokens per person. */
export const MAX_PROJECT_TOKENS = 50;
export const MAX_PERSONAL_TOKENS = 20;
/** «Caduca pronto» in the lists. */
const EXPIRING_DAYS = 7;
/** A rotated token may keep working this long so CI can switch secrets. */
export const MAX_ROTATION_OVERLAP_HOURS = 24;
/** `last_used_at` is written at most this often per token. */
const LAST_USED_EVERY_MS = 60_000;
const DAY_MS = 86_400_000;

export type TokenStatus = "active" | "inactive" | "expired" | "revoked";
export type RevokeReason = "manual" | "admin" | "rotated";

export interface TokenView {
  id: string;
  kind: TokenKind;
  name: string;
  displayPrefix: string;
  workspaceId: string | null;
  workspaceName: string | null;
  projectId: string | null;
  projectName: string | null;
  scopes: ApiScope[];
  owner: { id: string; name: string };
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  /** Only for whoever manages the token (owner, Test Manager, administrator). */
  lastUsedIp?: string | null;
  status: TokenStatus;
  /** Inactive: the owner is no longer a member of the token's workspace,
   *  or an administrator disabled their account (SEC-12). */
  inactiveReason: "owner_left" | "owner_disabled" | null;
  expiringSoon: boolean;
  revokedAt: string | null;
  revokeReason: RevokeReason | null;
}

/** A created or rotated token: its view plus the secret, this once. */
export interface IssuedToken {
  token: string;
  view: TokenView;
}

/** Who a request with a valid token acts as. */
export interface ApiPrincipal {
  tokenId: string;
  kind: TokenKind;
  name: string;
  displayPrefix: string;
  ownerId: string;
  workspaceId: string | null;
  projectId: string | null;
  scopes: ApiScope[];
  expiresAt: string;
}

export const TokenErrors = {
  invalid: () => new AppError(401, "token_invalid", "The API token is missing, malformed or unknown."),
  revoked: () => new AppError(401, "token_revoked", "This API token was revoked."),
  expired: () => new AppError(401, "token_expired", "This API token has expired."),
  inactive: (reason: string) =>
    new AppError(401, "token_inactive", "The owner of this API token can no longer use it.", { reason }),
  scope: (scope: ApiScope) =>
    new AppError(403, "insufficient_scope", "This API token does not have the scope this request needs.", { scope }),
  projectScope: () => new AppError(404, "not_found", "Project not found."),
  notFound: () => new AppError(404, "token_not_found", "Token not found."),
  limit: (max: number) => new AppError(409, "token_limit", `At most ${max} live tokens.`, { max }),
  badExpiry: () => new AppError(400, "invalid_expiry", `A token expires between tomorrow and ${MAX_TOKEN_DAYS} days from now.`),
  projectNotInWorkspace: () => new AppError(404, "not_found", "Project not found in this workspace."),
};

interface Row {
  id: string;
  kind: TokenKind;
  name: string;
  display_prefix: string;
  workspace_id: string | null;
  workspace_name: string | null;
  project_id: string | null;
  project_name: string | null;
  scopes: string[];
  owner_user_id: string;
  owner_name: string;
  created_at: Date;
  expires_at: Date;
  last_used_at: Date | null;
  last_used_ip: string | null;
  revoked_at: Date | null;
  revoke_reason: RevokeReason | null;
  owner_active: boolean;
  owner_disabled: boolean;
}

/** Every column a view needs. `owner_active`: the owner is an active member
 *  of the token's workspace (always true for a personal token without one).
 *  `owner_disabled`: an administrator disabled the owner's account (SEC-12). */
const SELECT = `
  SELECT t.id, t.kind, t.name, t.display_prefix, t.workspace_id, w.name AS workspace_name,
         t.project_id, p.payload->>'name' AS project_name, t.scopes, t.owner_user_id,
         coalesce(nullif(u.display_name, ''), u.email) AS owner_name,
         t.created_at, t.expires_at, t.last_used_at, t.last_used_ip, t.revoked_at, t.revoke_reason,
         u.disabled_at IS NOT NULL AS owner_disabled,
         (t.workspace_id IS NULL OR (w.deleted_at IS NULL AND EXISTS (
            SELECT 1 FROM workspace_members m
             WHERE m.workspace_id = t.workspace_id AND m.user_id = t.owner_user_id AND m.removed_at IS NULL))) AS owner_active
    FROM api_tokens t
    JOIN users u ON u.id = t.owner_user_id
    LEFT JOIN workspaces w ON w.id = t.workspace_id
    LEFT JOIN documents p ON p.workspace_id = t.workspace_id AND p.entity = 'project' AND p.entity_id = t.project_id`;

function view(r: Row, withIp: boolean, now = Date.now()): TokenView {
  const expired = r.expires_at.getTime() <= now;
  const status: TokenStatus = r.revoked_at
    ? "revoked"
    : expired
      ? "expired"
      : r.owner_active && !r.owner_disabled
        ? "active"
        : "inactive";
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    displayPrefix: r.display_prefix,
    workspaceId: r.workspace_id,
    workspaceName: r.workspace_name,
    projectId: r.project_id,
    projectName: r.project_name,
    scopes: r.scopes.filter((s): s is ApiScope => (API_SCOPES as readonly string[]).includes(s)),
    owner: { id: r.owner_user_id, name: r.owner_name },
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    lastUsedAt: r.last_used_at?.toISOString() ?? null,
    ...(withIp ? { lastUsedIp: r.last_used_ip } : {}),
    status,
    inactiveReason: status !== "inactive" ? null : r.owner_disabled ? "owner_disabled" : "owner_left",
    expiringSoon: status === "active" && r.expires_at.getTime() - now <= EXPIRING_DAYS * DAY_MS,
    revokedAt: r.revoked_at?.toISOString() ?? null,
    revokeReason: r.revoke_reason,
  };
}

/** The expiry of a new token: a date between tomorrow and a year away. */
function expiry(expiresAt: string): Date {
  const at = new Date(expiresAt);
  const now = Date.now();
  if (Number.isNaN(at.getTime()) || at.getTime() < now + DAY_MS / 2 || at.getTime() > now + MAX_TOKEN_DAYS * DAY_MS) {
    throw TokenErrors.badExpiry();
  }
  return at;
}

const uniqueScopes = (scopes: ApiScope[]) => API_SCOPES.filter((s) => scopes.includes(s));

export interface ProjectTokenInput {
  name: string;
  projectId: string;
  scopes: ApiScope[];
  expiresAt: string;
}

export interface PersonalTokenInput {
  name: string;
  /** Limit the token to one workspace of the owner; null: all of theirs. */
  workspaceId: string | null;
  scopes: ApiScope[];
  expiresAt: string;
}

export function createApiTokenService(pool: Pool, clock: ServerClock) {
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

  async function row(q: Queryable, id: string): Promise<Row | null> {
    const { rows } = await q.query<Row>(`${SELECT} WHERE t.id = $1`, [id]);
    return rows[0] ?? null;
  }

  /** The workspace an event about the token is stored in. */
  async function auditWorkspace(q: Queryable, r: { workspace_id: string | null; owner_user_id: string }): Promise<string> {
    return r.workspace_id ?? (await personalOf(q, r.owner_user_id));
  }

  async function audit(
    c: PoolClient,
    actorId: string,
    r: Row,
    action: "create" | "update" | "delete",
    changes: Record<string, unknown>,
    summary: Record<string, unknown>,
  ): Promise<void> {
    const workspaceId = await auditWorkspace(c, r);
    await lockWorkspaces(c, [workspaceId]);
    await appendWebEvent(c, clock, {
      userId: actorId,
      workspaceId,
      action,
      entity: "api_token",
      entityId: r.id,
      projectId: r.project_id,
      entityKey: r.name,
      changes,
      summary: { kind: r.kind, name: r.name, prefix: r.display_prefix, ...summary },
    });
  }

  /** A project token of `workspaceId` the user manages (Test Manager). */
  async function managedToken(c: Queryable, userId: string, workspaceId: string, tokenId: string): Promise<Row> {
    await requireRole(c, userId, workspaceId, "token.manage");
    const r = await row(c, tokenId);
    if (!r || r.kind !== "project" || r.workspace_id !== workspaceId) throw TokenErrors.notFound();
    return r;
  }

  async function insert(
    c: PoolClient,
    t: {
      kind: TokenKind;
      name: string;
      ownerId: string;
      createdBy: string;
      workspaceId: string | null;
      projectId: string | null;
      scopes: ApiScope[];
      expiresAt: Date;
    },
  ): Promise<{ id: string; raw: string }> {
    const tok = newToken(t.kind);
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO api_tokens (kind, name, display_prefix, token_hash, owner_user_id, workspace_id, project_id, scopes, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [t.kind, t.name.trim(), tok.displayPrefix, tok.hash, t.ownerId, t.workspaceId, t.projectId, uniqueScopes(t.scopes), t.createdBy, t.expiresAt],
    );
    return { id: rows[0].id, raw: tok.raw };
  }

  async function revokeRow(c: PoolClient, actorId: string, r: Row, reason: RevokeReason): Promise<void> {
    if (r.revoked_at) return;
    await c.query(`UPDATE api_tokens SET revoked_at = now(), revoked_by = $2, revoke_reason = $3 WHERE id = $1`, [r.id, actorId, reason]);
    await audit(c, actorId, r, "delete", { revokedAt: [null, new Date().toISOString()] }, { reason });
  }

  return {
    // ------------------------------------------------ project tokens

    /** The project tokens of a workspace. Every member sees them; the IP of
     *  the last use, only a Test Manager. */
    async listWorkspace(userId: string, workspaceId: string): Promise<TokenView[]> {
      const m = await requireMembership(pool, userId, workspaceId);
      const { rows } = await pool.query<Row>(
        `${SELECT} WHERE t.kind = 'project' AND t.workspace_id = $1 ORDER BY t.revoked_at IS NOT NULL, t.created_at DESC`,
        [workspaceId],
      );
      return rows.map((r) => view(r, can(m.role, "token.manage")));
    },

    /** The live projects of a workspace a project token may be bound to. */
    async workspaceProjects(userId: string, workspaceId: string): Promise<{ id: string; name: string }[]> {
      await requireMembership(pool, userId, workspaceId);
      const { rows } = await pool.query<{ id: string; name: string | null }>(
        `SELECT entity_id AS id, payload->>'name' AS name FROM documents
          WHERE workspace_id = $1 AND entity = 'project' AND NOT deleted
          ORDER BY lower(payload->>'name'), entity_id`,
        [workspaceId],
      );
      return rows.map((r) => ({ id: r.id, name: r.name ?? "" }));
    },

    async createProject(userId: string, workspaceId: string, input: ProjectTokenInput): Promise<IssuedToken> {
      const expiresAt = expiry(input.expiresAt);
      const id = await inTx(async (c) => {
        await requireRole(c, userId, workspaceId, "token.manage");
        await lockWorkspaces(c, [workspaceId]);
        const project = await c.query(
          `SELECT 1 FROM documents WHERE workspace_id = $1 AND entity = 'project' AND entity_id = $2 AND NOT deleted`,
          [workspaceId, input.projectId],
        );
        if (!project.rowCount) throw TokenErrors.projectNotInWorkspace();
        const live = await c.query<{ n: string }>(
          `SELECT count(*) AS n FROM api_tokens WHERE kind = 'project' AND workspace_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
          [workspaceId],
        );
        if (Number(live.rows[0].n) >= MAX_PROJECT_TOKENS) throw TokenErrors.limit(MAX_PROJECT_TOKENS);
        const made = await insert(c, {
          kind: "project",
          name: input.name,
          ownerId: userId,
          createdBy: userId,
          workspaceId,
          projectId: input.projectId,
          scopes: input.scopes,
          expiresAt,
        });
        const r = (await row(c, made.id))!;
        await audit(c, userId, r, "create", { name: [null, r.name], scopes: [null, r.scopes], expiresAt: [null, r.expires_at.toISOString()] }, {});
        return made;
      });
      return { token: id.raw, view: view((await row(pool, id.id))!, true) };
    },

    async revokeProject(userId: string, workspaceId: string, tokenId: string): Promise<void> {
      await inTx(async (c) => {
        const r = await managedToken(c, userId, workspaceId, tokenId);
        await revokeRow(c, userId, r, "manual");
      });
    },

    /** A new secret for the same token (name, project, scopes, owner, expiry).
     *  The old one stops now or, with `overlapHours`, after that long. */
    async rotateProject(userId: string, workspaceId: string, tokenId: string, overlapHours: number): Promise<IssuedToken> {
      const made = await inTx(async (c) => {
        const r = await managedToken(c, userId, workspaceId, tokenId);
        if (r.revoked_at || r.expires_at.getTime() <= Date.now()) throw TokenErrors.notFound();
        const next = await insert(c, {
          kind: "project",
          name: r.name,
          ownerId: r.owner_user_id,
          createdBy: userId,
          workspaceId,
          projectId: r.project_id,
          scopes: r.scopes as ApiScope[],
          expiresAt: r.expires_at,
        });
        if (overlapHours > 0) {
          await c.query(
            `UPDATE api_tokens SET rotated_to = $2, expires_at = least(expires_at, now() + make_interval(hours => $3)) WHERE id = $1`,
            [r.id, next.id, overlapHours],
          );
        } else {
          await c.query(
            `UPDATE api_tokens SET rotated_to = $2, revoked_at = now(), revoked_by = $3, revoke_reason = 'rotated' WHERE id = $1`,
            [r.id, next.id, userId],
          );
        }
        const nr = (await row(c, next.id))!;
        await audit(c, userId, nr, "create", { rotatedFrom: [null, r.id] }, { rotatedFrom: r.display_prefix, overlapHours });
        return next;
      });
      return { token: made.raw, view: view((await row(pool, made.id))!, true) };
    },

    /** The Test Manager takes the token over: it acts as them from now on,
     *  with the same secret, so CI keeps working (decision 2). */
    async reassignProject(userId: string, workspaceId: string, tokenId: string): Promise<TokenView> {
      await inTx(async (c) => {
        const r = await managedToken(c, userId, workspaceId, tokenId);
        if (r.revoked_at) throw TokenErrors.notFound();
        if (r.owner_user_id === userId) return;
        await c.query(`UPDATE api_tokens SET owner_user_id = $2 WHERE id = $1`, [r.id, userId]);
        await audit(c, userId, r, "update", { ownerId: [r.owner_user_id, userId] }, { reassigned: true });
      });
      return view((await row(pool, tokenId))!, true);
    },

    // ------------------------------------------------ personal tokens

    async listMine(userId: string): Promise<TokenView[]> {
      const { rows } = await pool.query<Row>(
        `${SELECT} WHERE t.kind = 'personal' AND t.owner_user_id = $1 ORDER BY t.revoked_at IS NOT NULL, t.created_at DESC`,
        [userId],
      );
      return rows.map((r) => view(r, true));
    },

    async createPersonal(userId: string, input: PersonalTokenInput): Promise<IssuedToken> {
      const expiresAt = expiry(input.expiresAt);
      const made = await inTx(async (c) => {
        if (input.workspaceId) await requireMembership(c, userId, input.workspaceId);
        const live = await c.query<{ n: string }>(
          `SELECT count(*) AS n FROM api_tokens WHERE kind = 'personal' AND owner_user_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
          [userId],
        );
        if (Number(live.rows[0].n) >= MAX_PERSONAL_TOKENS) throw TokenErrors.limit(MAX_PERSONAL_TOKENS);
        const t = await insert(c, {
          kind: "personal",
          name: input.name,
          ownerId: userId,
          createdBy: userId,
          workspaceId: input.workspaceId,
          projectId: null,
          scopes: input.scopes,
          expiresAt,
        });
        const r = (await row(c, t.id))!;
        await audit(c, userId, r, "create", { name: [null, r.name], scopes: [null, r.scopes], expiresAt: [null, r.expires_at.toISOString()] }, {});
        return t;
      });
      return { token: made.raw, view: view((await row(pool, made.id))!, true) };
    },

    async revokeMine(userId: string, tokenId: string): Promise<void> {
      await inTx(async (c) => {
        const r = await row(c, tokenId);
        if (!r || r.kind !== "personal" || r.owner_user_id !== userId) throw TokenErrors.notFound();
        await revokeRow(c, userId, r, "manual");
      });
    },

    // ------------------------------------------------ server administrator

    /** Every token an account owns (the route checks the administrator). */
    async listOfUser(targetUserId: string): Promise<TokenView[]> {
      const { rows } = await pool.query<Row>(
        `${SELECT} WHERE t.owner_user_id = $1 ORDER BY t.revoked_at IS NOT NULL, t.created_at DESC`,
        [targetUserId],
      );
      return rows.map((r) => view(r, true));
    },

    /** Revokes one token, whoever owns it. */
    async adminRevoke(adminId: string, tokenId: string): Promise<void> {
      await inTx(async (c) => {
        const r = await row(c, tokenId);
        if (!r) throw TokenErrors.notFound();
        await revokeRow(c, adminId, r, "admin");
      });
    },

    /** Revokes every live token of an account (a leak). Returns how many. */
    async adminRevokeAll(adminId: string, targetUserId: string): Promise<number> {
      return inTx(async (c) => {
        const { rows } = await c.query<Row>(
          `${SELECT} WHERE t.owner_user_id = $1 AND t.revoked_at IS NULL AND t.expires_at > now()`,
          [targetUserId],
        );
        for (const r of rows) await revokeRow(c, adminId, r, "admin");
        return rows.length;
      });
    },

    // ------------------------------------------------ authentication

    /** The principal of a token, or the error that says why there is none.
     *  Writes `last_used_*` at most once a minute. */
    async authenticate(raw: string, ip: string): Promise<ApiPrincipal> {
      if (!parseToken(raw)) throw TokenErrors.invalid();
      const { rows } = await pool.query<Row>(`${SELECT} WHERE t.token_hash = $1`, [hashToken(raw)]);
      const r = rows[0];
      if (!r) throw TokenErrors.invalid();
      if (r.revoked_at) throw TokenErrors.revoked();
      if (r.expires_at.getTime() <= Date.now()) throw TokenErrors.expired();
      // SEC-12: a disabled account's tokens are suspended, not revoked: the
      // same 403 as its sessions, and they work again once it is re-enabled.
      if (r.owner_disabled) throw AuthErrors.accountDisabled();
      if (!r.owner_active) throw TokenErrors.inactive("owner_left");
      await pool.query(
        `UPDATE api_tokens SET last_used_at = now(), last_used_ip = $2
          WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - make_interval(secs => $3))`,
        [r.id, ip, LAST_USED_EVERY_MS / 1000],
      );
      return {
        tokenId: r.id,
        kind: r.kind,
        name: r.name,
        displayPrefix: r.display_prefix,
        ownerId: r.owner_user_id,
        workspaceId: r.workspace_id,
        projectId: r.project_id,
        scopes: r.scopes as ApiScope[],
        expiresAt: r.expires_at.toISOString(),
      };
    },

    /** The request may use `scope` in `workspaceId`: the token has the scope,
     *  reaches that workspace, and its owner's current role there has the
     *  capability. A workspace out of reach is answered as not found. */
    async authorize(p: ApiPrincipal, scope: ApiScope, workspaceId: string): Promise<void> {
      if (!p.scopes.includes(scope)) throw TokenErrors.scope(scope);
      if (p.workspaceId && p.workspaceId !== workspaceId) throw WorkspaceErrors.notFound();
      const m = await membership(pool, p.ownerId, workspaceId);
      if (!m) throw p.workspaceId ? TokenErrors.inactive("owner_left") : WorkspaceErrors.notFound();
      if (!can(m.role, SCOPE_CAPABILITY[scope])) throw WorkspaceErrors.forbidden(SCOPE_CAPABILITY[scope]);
    },
  };
}

export type ApiTokenService = ReturnType<typeof createApiTokenService>;
