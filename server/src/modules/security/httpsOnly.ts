import type { FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../../config/env";

// SEC-07 (ADR-0006, ADR-0046): in production the server only serves https.
// TLS is ended by a reverse proxy on the same machine (Caddy, see
// docs/despliegue.md), which passes `X-Forwarded-Proto`; with TRUST_PROXY the
// request's protocol comes from that header. A plain http request is only
// served when it comes straight from this machine without a proxy (a health
// check, an admin's curl). Development and tests are not affected.

/** Six months, the usual HSTS lifetime; no subdomains, no preload (a
 *  self-hosted server should not decide that for the whole domain). */
export const HSTS = "max-age=15552000";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** The address of the connection itself, never a forwarded one. */
function peerIsLoopback(req: FastifyRequest): boolean {
  const peer = req.raw.socket?.remoteAddress ?? "";
  return LOOPBACK.has(peer) || peer.startsWith("127.") || peer.startsWith("::ffff:127.");
}

function cameThroughProxy(req: FastifyRequest): boolean {
  return req.headers["x-forwarded-proto"] !== undefined || req.headers["x-forwarded-for"] !== undefined;
}

/** onRequest hook: 403 `https_required` for plain http in production, and
 *  HSTS on every https answer. */
export function httpsOnly(env: Pick<Env, "NODE_ENV">) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (env.NODE_ENV !== "production") return;
    if (req.protocol === "https") {
      void reply.header("strict-transport-security", HSTS);
      return;
    }
    if (peerIsLoopback(req) && !cameThroughProxy(req)) return;
    return reply.code(403).send({
      code: "https_required",
      message:
        "This server only accepts https. If it sits behind a reverse proxy, set TRUST_PROXY=true and make the proxy send X-Forwarded-Proto (docs/despliegue.md).",
    });
  };
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

/** Deployment mistakes worth a warning at start (production only). */
export function tlsWarnings(env: Pick<Env, "NODE_ENV" | "HOST" | "TRUST_PROXY">): string[] {
  if (env.NODE_ENV !== "production") return [];
  const warnings: string[] = [];
  if (!env.TRUST_PROXY) {
    warnings.push(
      "TRUST_PROXY is off: requests from other machines are refused with https_required unless a reverse proxy ends TLS and TRUST_PROXY=true (SEC-07, docs/despliegue.md).",
    );
  }
  if (!LOOPBACK_HOSTS.has(env.HOST)) {
    warnings.push(
      `HOST=${env.HOST}: make sure only the reverse proxy can reach this port (HOST=127.0.0.1 on a plain server; in Docker, do not publish it)${env.TRUST_PROXY ? ", or a client that reaches it directly could claim https" : ""}.`,
    );
  }
  return warnings;
}
