import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";

export interface AccessTokenClaims {
  sub: string;
  role: string;
}

export interface TokenServiceOptions {
  accessSecret: string;
  accessTtl: string; // e.g. "15m"
  refreshTtlDays: number;
}

const ISSUER = "pharos";

/** Access tokens are signed JWTs; refresh tokens are opaque random strings whose
 *  SHA-256 hash is stored server-side (rotation + revocation). */
export function createTokenService(opts: TokenServiceOptions) {
  const secret = new TextEncoder().encode(opts.accessSecret);

  return {
    async signAccessToken(claims: AccessTokenClaims): Promise<string> {
      return new SignJWT({ role: claims.role })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(claims.sub)
        .setIssuer(ISSUER)
        .setIssuedAt()
        .setExpirationTime(opts.accessTtl)
        .sign(secret);
    },

    async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
      const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
      return { sub: String(payload.sub), role: String(payload.role) };
    },

    generateRefreshToken() {
      const raw = randomBytes(32).toString("base64url");
      return {
        raw,
        hash: hashToken(raw),
        expiresAt: new Date(
          Date.now() + opts.refreshTtlDays * 24 * 60 * 60 * 1000,
        ),
      };
    },

    hashRefreshToken: hashToken,
  };
}

export type TokenService = ReturnType<typeof createTokenService>;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
