import type { Pool } from "pg";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  first_name: string;
  last_name: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
  revoked_at: Date | null;
  replaced_by: string | null;
}

export interface CreateUserInput {
  email: string;
  password_hash: string;
  display_name: string;
  first_name: string;
  last_name: string;
}

export function createAuthRepository(pool: Pool) {
  return {
    async createUser(input: CreateUserInput): Promise<UserRow> {
      const { rows } = await pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, display_name, first_name, last_name)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          input.email,
          input.password_hash,
          input.display_name,
          input.first_name,
          input.last_name,
        ],
      );
      return rows[0];
    },

    async findByEmail(email: string): Promise<UserRow | null> {
      const { rows } = await pool.query<UserRow>(
        `SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1`,
        [email],
      );
      return rows[0] ?? null;
    },

    async findById(id: string): Promise<UserRow | null> {
      const { rows } = await pool.query<UserRow>(
        `SELECT * FROM users WHERE id = $1 LIMIT 1`,
        [id],
      );
      return rows[0] ?? null;
    },

    async createRefreshToken(
      userId: string,
      tokenHash: string,
      expiresAt: Date,
    ): Promise<string> {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [userId, tokenHash, expiresAt],
      );
      return rows[0].id;
    },

    async findRefreshToken(tokenHash: string): Promise<RefreshTokenRow | null> {
      const { rows } = await pool.query<RefreshTokenRow>(
        `SELECT * FROM refresh_tokens WHERE token_hash = $1 LIMIT 1`,
        [tokenHash],
      );
      return rows[0] ?? null;
    },

    async revokeRefreshToken(id: string, replacedBy?: string): Promise<void> {
      await pool.query(
        `UPDATE refresh_tokens
         SET revoked_at = now(), replaced_by = $2
         WHERE id = $1 AND revoked_at IS NULL`,
        [id, replacedBy ?? null],
      );
    },

    async revokeAllForUser(userId: string): Promise<void> {
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
    },
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
