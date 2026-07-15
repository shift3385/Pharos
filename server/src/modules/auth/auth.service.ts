import type { AuthRepository, UserRow } from "./auth.repository";
import type { TokenService } from "./tokens";
import { hashPassword, verifyPassword } from "./password";
import { AuthErrors } from "./errors";
import type { LoginInput, RegisterInput } from "./auth.schemas";

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  role: string;
  createdAt: Date;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

const PG_UNIQUE_VIOLATION = "23505";

export function createAuthService(deps: {
  repo: AuthRepository;
  tokens: TokenService;
}) {
  const { repo, tokens } = deps;

  function toPublicUser(user: UserRow): PublicUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      createdAt: user.created_at,
    };
  }

  async function issueSession(user: UserRow): Promise<Session> {
    const accessToken = await tokens.signAccessToken({
      sub: user.id,
      role: user.role,
    });
    const refresh = tokens.generateRefreshToken();
    await repo.createRefreshToken(user.id, refresh.hash, refresh.expiresAt);
    return { accessToken, refreshToken: refresh.raw, user: toPublicUser(user) };
  }

  return {
    async register(input: RegisterInput): Promise<Session> {
      const email = input.email.toLowerCase();
      if (await repo.findByEmail(email)) throw AuthErrors.emailInUse();

      const passwordHash = await hashPassword(input.password);
      let user: UserRow;
      try {
        user = await repo.createUser({
          email,
          password_hash: passwordHash,
          display_name: input.displayName,
          first_name: input.firstName,
          last_name: input.lastName,
        });
      } catch (error) {
        if ((error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
          throw AuthErrors.emailInUse();
        }
        throw error;
      }
      return issueSession(user);
    },

    async login(input: LoginInput): Promise<Session> {
      const user = await repo.findByEmail(input.email.toLowerCase());
      if (!user) throw AuthErrors.invalidCredentials();
      const ok = await verifyPassword(user.password_hash, input.password);
      if (!ok) throw AuthErrors.invalidCredentials();
      return issueSession(user);
    },

    async refresh(rawToken: string): Promise<Session> {
      const record = await repo.findRefreshToken(
        tokens.hashRefreshToken(rawToken),
      );
      if (
        !record ||
        record.revoked_at !== null ||
        record.expires_at.getTime() <= Date.now()
      ) {
        throw AuthErrors.invalidRefreshToken();
      }
      const user = await repo.findById(record.user_id);
      if (!user) throw AuthErrors.invalidRefreshToken();

      // Rotate: mint a new refresh token and revoke the old one, linking them.
      const next = tokens.generateRefreshToken();
      const nextId = await repo.createRefreshToken(
        user.id,
        next.hash,
        next.expiresAt,
      );
      await repo.revokeRefreshToken(record.id, nextId);

      const accessToken = await tokens.signAccessToken({
        sub: user.id,
        role: user.role,
      });
      return {
        accessToken,
        refreshToken: next.raw,
        user: toPublicUser(user),
      };
    },

    async logout(rawToken: string): Promise<void> {
      const record = await repo.findRefreshToken(
        tokens.hashRefreshToken(rawToken),
      );
      if (record && record.revoked_at === null) {
        await repo.revokeRefreshToken(record.id);
      }
    },

    async me(userId: string): Promise<PublicUser> {
      const user = await repo.findById(userId);
      if (!user) throw AuthErrors.unauthorized();
      return toPublicUser(user);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
