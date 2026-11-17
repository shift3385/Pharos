import type { Pool, PoolClient } from "pg";
import { createHash, randomBytes } from "node:crypto";
import type { AuthRepository, UserRow } from "./auth.repository";
import type { Session } from "./auth.service";
import type { ChangePasswordInput, RecoverInput } from "./auth.schemas";
import { AuthErrors } from "./errors";
import { hashPassword, verifyPassword } from "./password";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyRecoveryCode,
} from "./recovery-codes";
import type { Mailer } from "./mailer";
import { resetEmail, resetLink } from "./reset-email";
import { appendWebEvent } from "../audit/audit.store";
import type { ServerClock } from "../sync/sync.hlc";
import { LOCK_USER_SQL } from "../sync/sync.repository";

// Changing and recovering the account password (SEC-08, SEC-09 by email;
// ADR-0045). Every change runs in one transaction under the user's write
// lock and leaves an `account` event in the user's web audit chain (AUD-01b)
// that never holds a password, a code or a token. A password set without the
// current one (code or link) closes every session; a change from the profile
// keeps the session it was made from. Access tokens already issued stay
// valid until they expire (ACCESS_TOKEN_TTL, 15 minutes): ADR-0045.

/** Wrong codes per account before recovery by code locks, and for how long
 *  the count and the lock last. */
export const MAX_CODE_FAILURES = 5;
const ATTEMPT_WINDOW = "15 minutes";
/** One reset email per account per minute at most. */
const EMAIL_COOLDOWN = "60 seconds";

export interface RecoveryStatus {
  total: number;
  remaining: number;
  generatedAt: Date | null;
  lastUsedAt: Date | null;
}

type AccountEvent =
  | {
      event: "password_changed";
      method: "profile" | "recovery_code" | "email_link" | "admin";
      sessionsClosed: number;
      codesRemaining?: number;
    }
  | { event: "recovery_codes_generated"; codes: number }
  | { event: "password_reset_requested"; method: "email_link" };

const sha256 = (raw: string) => createHash("sha256").update(raw).digest("hex");

export function createAccountService(deps: {
  pool: Pool;
  repo: AuthRepository;
  clock: ServerClock;
  issueSession: (user: UserRow) => Promise<Session>;
  mailer: Mailer | null;
  publicUrl: string | undefined;
  resetTtlMs: number;
  log?: { error: (obj: unknown, msg: string) => void };
}) {
  const { pool, repo, clock, mailer, publicUrl } = deps;
  const emailReset = Boolean(mailer && publicUrl);

  /** A hash to verify against when the email is unknown, so an unknown
   *  account costs about the same time as a wrong code. */
  let decoy: Promise<string> | null = null;
  const decoyHash = () => (decoy ??= hashRecoveryCode("00000-00000"));

  /** Runs `fn` in one transaction; `fn` takes the user's lock itself. */
  async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const lock = (client: PoolClient, userId: string) =>
    client.query(LOCK_USER_SQL, [userId]);

  function audit(client: PoolClient, userId: string, summary: AccountEvent) {
    return appendWebEvent(client, clock, {
      userId,
      action: "update",
      entity: "account",
      entityId: userId,
      projectId: null,
      entityKey: null,
      changes: {},
      summary,
    });
  }

  /** Sets the password hash, spends the open reset links and closes the
   *  sessions (all, or all but `keepTokenHash`). Returns how many closed. */
  async function setPassword(
    client: PoolClient,
    userId: string,
    plain: string,
    keepTokenHash?: string,
  ): Promise<number> {
    const passwordHash = await hashPassword(plain);
    await client.query(
      `UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1`,
      [userId, passwordHash],
    );
    await client.query(
      `UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );
    const closed = await client.query(
      `UPDATE refresh_tokens SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
          AND ($2::text IS NULL OR token_hash <> $2)`,
      [userId, keepTokenHash ?? null],
    );
    return closed.rowCount ?? 0;
  }

  /** Replaces the user's codes. New codes are audited; the first ones are
   *  part of creating the account, which leaves no event either (and an event
   *  would be the only document a brand-new account syncs). */
  async function writeCodes(
    client: PoolClient,
    userId: string,
    audited: boolean,
  ): Promise<string[]> {
    const codes = generateRecoveryCodes();
    const hashes = await Promise.all(codes.map(hashRecoveryCode));
    await client.query(
      `DELETE FROM account_recovery_codes WHERE user_id = $1`,
      [userId],
    );
    await client.query(
      `INSERT INTO account_recovery_codes (user_id, code_hash) SELECT $1, unnest($2::text[])`,
      [userId, hashes],
    );
    if (audited)
      await audit(client, userId, {
        event: "recovery_codes_generated",
        codes: codes.length,
      });
    return codes;
  }

  async function requireUser(userId: string): Promise<UserRow> {
    const user = await repo.findById(userId);
    if (!user) throw AuthErrors.unauthorized();
    return user;
  }

  async function checkCurrentPassword(
    user: UserRow,
    plain: string,
  ): Promise<void> {
    if (!(await verifyPassword(user.password_hash, plain)))
      throw AuthErrors.wrongPassword();
  }

  return {
    capabilities: () => ({ emailReset }),

    /** The first codes of a new account (sign-up). */
    issueInitialCodes(userId: string): Promise<string[]> {
      return tx(async (client) => {
        await lock(client, userId);
        return writeCodes(client, userId, false);
      });
    },

    async recoveryStatus(userId: string): Promise<RecoveryStatus> {
      const { rows } = await pool.query<{
        total: string;
        remaining: string;
        generated_at: Date | null;
        last_used_at: Date | null;
      }>(
        `SELECT count(*) AS total, count(*) FILTER (WHERE used_at IS NULL) AS remaining,
                max(created_at) AS generated_at, max(used_at) AS last_used_at
           FROM account_recovery_codes WHERE user_id = $1`,
        [userId],
      );
      const r = rows[0];
      return {
        total: Number(r.total),
        remaining: Number(r.remaining),
        generatedAt: r.generated_at,
        lastUsedAt: r.last_used_at,
      };
    },

    /** New codes for the signed-in user; the old ones stop working. */
    async regenerateCodes(
      userId: string,
      currentPassword: string,
    ): Promise<string[]> {
      await checkCurrentPassword(await requireUser(userId), currentPassword);
      return tx(async (client) => {
        await lock(client, userId);
        return writeCodes(client, userId, true);
      });
    },

    /** Changes the password from the profile; `refreshToken` is the session
     *  that stays open. */
    async changePassword(
      userId: string,
      input: ChangePasswordInput,
    ): Promise<{ sessionsClosed: number }> {
      const user = await requireUser(userId);
      await checkCurrentPassword(user, input.currentPassword);
      if (await verifyPassword(user.password_hash, input.newPassword))
        throw AuthErrors.samePassword();
      const keep = input.refreshToken ? sha256(input.refreshToken) : undefined;
      return tx(async (client) => {
        await lock(client, userId);
        const sessionsClosed = await setPassword(
          client,
          userId,
          input.newPassword,
          keep,
        );
        await audit(client, userId, {
          event: "password_changed",
          method: "profile",
          sessionsClosed,
        });
        return { sessionsClosed };
      });
    },

    /** Sets a new password with a recovery code and opens a session. */
    async recover(
      input: RecoverInput,
    ): Promise<Session & { recoveryCodesRemaining: number }> {
      const user = await repo.findByEmail(input.email.toLowerCase());
      const code = normalizeRecoveryCode(input.code);
      if (!user) {
        await verifyRecoveryCode(await decoyHash(), code ?? "0000000000");
        throw AuthErrors.invalidRecovery();
      }
      const outcome = await tx(async (client) => {
        await lock(client, user.id);
        const { rows: attempts } = await client.query<{ locked: boolean }>(
          `SELECT locked_until IS NOT NULL AND locked_until > now() AS locked
             FROM account_recovery_attempts WHERE user_id = $1`,
          [user.id],
        );
        if (attempts[0]?.locked) return "locked" as const;

        const { rows: codes } = await client.query<{
          id: string;
          code_hash: string;
        }>(
          `SELECT id, code_hash FROM account_recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
          [user.id],
        );
        let match: string | null = null;
        if (code) {
          for (const row of codes) {
            if (await verifyRecoveryCode(row.code_hash, code)) {
              match = row.id;
              break;
            }
          }
        }
        if (!match) {
          // Counted in its own window; the 5th wrong code locks recovery by
          // code for this account.
          await client.query(
            `INSERT INTO account_recovery_attempts (user_id, failures, window_start)
             VALUES ($1, 1, now())
             ON CONFLICT (user_id) DO UPDATE SET
               failures = CASE WHEN account_recovery_attempts.window_start < now() - $2::interval
                               THEN 1 ELSE account_recovery_attempts.failures + 1 END,
               window_start = CASE WHEN account_recovery_attempts.window_start < now() - $2::interval
                                   THEN now() ELSE account_recovery_attempts.window_start END,
               locked_until = NULL`,
            [user.id, ATTEMPT_WINDOW],
          );
          await client.query(
            `UPDATE account_recovery_attempts SET locked_until = now() + $3::interval
              WHERE user_id = $1 AND failures >= $2`,
            [user.id, MAX_CODE_FAILURES, ATTEMPT_WINDOW],
          );
          return "wrong" as const;
        }

        await client.query(
          `UPDATE account_recovery_codes SET used_at = now() WHERE id = $1`,
          [match],
        );
        await client.query(
          `DELETE FROM account_recovery_attempts WHERE user_id = $1`,
          [user.id],
        );
        const sessionsClosed = await setPassword(
          client,
          user.id,
          input.newPassword,
        );
        const codesRemaining = codes.length - 1;
        await audit(client, user.id, {
          event: "password_changed",
          method: "recovery_code",
          sessionsClosed,
          codesRemaining,
        });
        return { codesRemaining };
      });
      if (outcome === "locked") throw AuthErrors.tooManyAttempts();
      if (outcome === "wrong") throw AuthErrors.invalidRecovery();
      const fresh = await requireUser(user.id);
      return {
        ...(await deps.issueSession(fresh)),
        recoveryCodesRemaining: outcome.codesRemaining,
      };
    },

    /** Emails a reset link when the account exists. Always resolves the same
     *  way, so the answer never tells whether an email is registered. */
    async requestReset(email: string, locale?: "es" | "en"): Promise<void> {
      if (!mailer || !publicUrl) throw AuthErrors.emailResetDisabled();
      const user = await repo.findByEmail(email.toLowerCase());
      if (!user) return;
      const raw = randomBytes(32).toString("base64url");
      const sent = await tx(async (client) => {
        await lock(client, user.id);
        const { rowCount: recent } = await client.query(
          `SELECT 1 FROM password_reset_tokens WHERE user_id = $1 AND issued_by IS NULL
              AND created_at > now() - $2::interval`,
          [user.id, EMAIL_COOLDOWN],
        );
        if (recent) return false;
        await client.query(
          `UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
          [user.id],
        );
        await client.query(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, now() + make_interval(secs => $3::double precision / 1000))`,
          [user.id, sha256(raw), deps.resetTtlMs],
        );
        await audit(client, user.id, {
          event: "password_reset_requested",
          method: "email_link",
        });
        return true;
      });
      if (!sent) return;
      const message = resetEmail({
        to: user.email,
        link: resetLink(publicUrl, raw),
        publicUrl,
        ttlMs: deps.resetTtlMs,
        locale,
      });
      // Not awaited: the answer does not wait for (or reveal) the delivery.
      void mailer.send(message).catch((error: unknown) => {
        deps.log?.error(
          {
            err: error instanceof Error ? error.message : String(error),
            userId: user.id,
          },
          "reset email not sent",
        );
      });
    },

    /** The account a reset link is for, while it can still be used. */
    async checkReset(token: string): Promise<{ email: string }> {
      const { rows } = await pool.query<{ email: string }>(
        `SELECT u.email FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
          WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()`,
        [sha256(token)],
      );
      if (!rows[0]) throw AuthErrors.invalidResetToken();
      return { email: rows[0].email };
    },

    /** Sets a new password with a reset link; the link is spent by the same
     *  statement that checks it, so it works once. */
    async confirmReset(token: string, newPassword: string): Promise<void> {
      await tx(async (client) => {
        const { rows } = await client.query<{
          user_id: string;
          issued_by: string | null;
        }>(
          `UPDATE password_reset_tokens SET used_at = now()
            WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
            RETURNING user_id, issued_by`,
          [sha256(token)],
        );
        const spent = rows[0];
        if (!spent) throw AuthErrors.invalidResetToken();
        await lock(client, spent.user_id);
        const sessionsClosed = await setPassword(
          client,
          spent.user_id,
          newPassword,
        );
        await audit(client, spent.user_id, {
          event: "password_changed",
          method: spent.issued_by ? "admin" : "email_link",
          sessionsClosed,
        });
      });
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
