import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { HSTS, httpsOnly, tlsWarnings } from "../src/modules/security/httpsOnly";

// SEC-07: in production only https gets through (from a reverse proxy, via
// X-Forwarded-Proto); plain http only from this machine without a proxy.
// No database: the hook is mounted on a bare Fastify instance.

let app: FastifyInstance | undefined;

async function build(nodeEnv: "production" | "development", trustProxy: boolean) {
  app = Fastify({ trustProxy });
  app.addHook("onRequest", httpsOnly({ NODE_ENV: nodeEnv }));
  app.get("/health", async () => ({ status: "ok" }));
  await app.ready();
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("httpsOnly (SEC-07)", () => {
  it("refuses plain http from another machine in production", async () => {
    const res = await (await build("production", true)).inject({
      url: "/health",
      remoteAddress: "10.0.4.21",
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("https_required");
  });

  it("serves https from the proxy and sends HSTS", async () => {
    const res = await (await build("production", true)).inject({
      url: "/health",
      remoteAddress: "127.0.0.1",
      headers: { "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.7" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["strict-transport-security"]).toBe(HSTS);
  });

  it("refuses the proxy's http forward", async () => {
    const res = await (await build("production", true)).inject({
      url: "/health",
      remoteAddress: "127.0.0.1",
      headers: { "x-forwarded-proto": "http", "x-forwarded-for": "203.0.113.7" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("refuses a proxied request when TRUST_PROXY is off (E7)", async () => {
    const res = await (await build("production", false)).inject({
      url: "/health",
      remoteAddress: "127.0.0.1",
      headers: { "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.7" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("https_required");
  });

  it("serves plain http straight from this machine", async () => {
    for (const remoteAddress of ["127.0.0.1", "::1"]) {
      const res = await (await build("production", true)).inject({ url: "/health", remoteAddress });
      expect(res.statusCode).toBe(200);
      expect(res.headers["strict-transport-security"]).toBeUndefined();
      await app?.close();
    }
  });

  it("changes nothing outside production", async () => {
    const res = await (await build("development", false)).inject({
      url: "/health",
      remoteAddress: "10.0.4.21",
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("tlsWarnings", () => {
  it("is quiet for the documented deployment", () => {
    expect(tlsWarnings({ NODE_ENV: "production", HOST: "127.0.0.1", TRUST_PROXY: true })).toEqual([]);
    expect(tlsWarnings({ NODE_ENV: "development", HOST: "0.0.0.0", TRUST_PROXY: false })).toEqual([]);
  });

  it("warns about a missing proxy setting and an open HOST", () => {
    const warnings = tlsWarnings({ NODE_ENV: "production", HOST: "0.0.0.0", TRUST_PROXY: false });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/TRUST_PROXY/);
    expect(warnings[1]).toMatch(/HOST=0\.0\.0\.0/);
  });
});
