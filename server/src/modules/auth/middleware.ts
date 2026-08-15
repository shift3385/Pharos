import type { FastifyRequest } from "fastify";
import type { TokenService } from "./tokens";
import { AuthErrors } from "./errors";

/** Builds a Fastify preHandler that authenticates the Bearer access token and
 *  sets `req.userId` / `req.userRole`. Shared by protected routes. */
export function makeRequireAuth(tokens: TokenService) {
  return async function requireAuth(req: FastifyRequest): Promise<void> {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw AuthErrors.unauthorized();
    try {
      const claims = await tokens.verifyAccessToken(header.slice(7));
      req.userId = claims.sub;
      req.userRole = claims.role;
    } catch {
      throw AuthErrors.unauthorized();
    }
  };
}
