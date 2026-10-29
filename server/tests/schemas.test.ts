import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "../src/modules/auth/auth.schemas";
import { deltaSchema, pullSchema } from "../src/modules/sync/sync.schemas";

// Request schemas on zod 4 (BASE-18): the behaviour the routes rely on, so a
// zod upgrade that changes defaults or validation fails here, not in a client.
describe("request schemas (zod 4)", () => {
  const delta = { entity: "project", entityId: "p1", op: "upsert" } as const;

  it("fills the delta defaults", () => {
    expect(deltaSchema.parse(delta)).toEqual({
      ...delta,
      payload: {},
      revision: 1,
      author: "",
      hlc: "",
    });
  });

  it("takes an object payload with any values and refuses anything else", () => {
    const payload = { name: "Alpha", tags: ["a"], meta: { n: 1 }, gone: null };
    expect(deltaSchema.parse({ ...delta, payload }).payload).toEqual(payload);
    expect(deltaSchema.safeParse({ ...delta, payload: ["x"] }).success).toBe(false);
    expect(deltaSchema.safeParse({ ...delta, payload: "x" }).success).toBe(false);
  });

  it("refuses unknown entities and operations", () => {
    expect(deltaSchema.safeParse({ ...delta, entity: "user" }).success).toBe(false);
    expect(deltaSchema.safeParse({ ...delta, op: "patch" }).success).toBe(false);
  });

  it("coerces and bounds the pull query", () => {
    expect(pullSchema.parse({})).toEqual({ since: 0, limit: 500 });
    expect(pullSchema.parse({ since: "7", limit: "20" })).toEqual({ since: 7, limit: 20 });
    expect(pullSchema.safeParse({ limit: "501" }).success).toBe(false);
  });

  it("validates emails on login and register", () => {
    expect(loginSchema.safeParse({ email: "qa@pharos.dev", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
    const register = {
      email: "qa@pharos.dev",
      password: "short",
      displayName: " QA ",
      firstName: "Q",
      lastName: "A",
    };
    const res = registerSchema.safeParse(register);
    expect(res.success).toBe(false);
    expect(res.error?.issues[0].message).toBe("Password must be at least 8 characters");
    expect(registerSchema.parse({ ...register, password: "long enough" }).displayName).toBe("QA");
  });
});
