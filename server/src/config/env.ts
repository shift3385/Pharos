import { z } from "zod";
import dotenv from "dotenv";
import { isExplicitOrigin, parseOrigins } from "./origins";

// Load .env from the server dir and the repo root (compose/root .env).
dotenv.config();
dotenv.config({ path: "../.env" });

/** Secrets shipped in this repository (.env.example, docker-compose.yml,
 *  tests). Anyone can read them, so production refuses them (BASE-06). */
export const KNOWN_DEFAULT_SECRETS = [
  "dev-insecure-secret-change-me-please-min32",
  "test-secret-at-least-16-characters",
];
const PLACEHOLDER_SECRET = /change-?me|insecure/i;
export const MIN_PRODUCTION_SECRET_LENGTH = 32;

const DURATION_UNITS_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  second: 1_000,
  seconds: 1_000,
  m: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
};

/** Parses "60000", "30 s", "1 minute", "2 hours"… to milliseconds (a bare
 *  number is milliseconds); anything else is invalid. */
export function parseDurationMs(value: string): number | null {
  const m = /^(\d+)\s*([a-z]*)$/i.exec(value.trim());
  if (!m) return null;
  const unit = m[2].toLowerCase() || "ms";
  const factor = DURATION_UNITS_MS[unit];
  const ms = Number(m[1]) * (factor ?? NaN);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

const duration = z.string().transform((value, ctx) => {
  const ms = parseDurationMs(value);
  if (ms === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `"${value}" is not a duration (e.g. "60000", "30 seconds", "1 minute")`,
    });
    return z.NEVER;
  }
  return ms;
});

const LOOPBACK_HOSTS = ["127.0.0.1", "::1", "localhost"];

const flag = z
  .enum(["true", "false", "1", "0"])
  .default("false")
  .transform((v) => v === "true" || v === "1");

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z
      .string()
      .min(16, "JWT_ACCESS_SECRET must be at least 16 characters"),
    ACCESS_TOKEN_TTL: z.string().default("15m"),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    CORS_ORIGIN: z.string().default("*"),
    // Behind a reverse proxy, take the client IP from X-Forwarded-For so the
    // login limit counts per client and not per proxy.
    TRUST_PROXY: flag,
    // Attempts per client IP on /auth/login and /auth/register per window.
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    LOGIN_RATE_LIMIT_WINDOW: duration.default("1 minute"),
    // Request body limits: everything except sync, and /sync/* (push batches:
    // the server accepts up to 500 deltas; the desktop client sends at most
    // 200 deltas / 512 KiB per push). Larger bodies get 413 payload_too_large.
    BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576),
    SYNC_BODY_LIMIT_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(8_388_608),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    const secret = env.JWT_ACCESS_SECRET;
    if (
      KNOWN_DEFAULT_SECRETS.includes(secret) ||
      PLACEHOLDER_SECRET.test(secret)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_ACCESS_SECRET"],
        message:
          "is a default/placeholder value; set a long random secret in production",
      });
    } else if (secret.length < MIN_PRODUCTION_SECRET_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_ACCESS_SECRET"],
        message: `must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production`,
      });
    }
    const origins = parseOrigins(env.CORS_ORIGIN);
    if (origins.length === 0 || origins.includes("*")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGIN"],
        message:
          'must list the allowed origins explicitly in production (not "*"), e.g. "https://pharos.example.com,http://tauri.localhost"',
      });
    } else {
      for (const origin of origins.filter((o) => !isExplicitOrigin(o))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGIN"],
          message: `"${origin}" is not an origin (scheme://host[:port], no path)`,
        });
      }
    }
  });

export type Env = z.infer<typeof schema>;

/** Start-up warnings for a configuration that is valid but risky: outside
 *  production none of the production checks run, so an API reachable from
 *  other machines should say so (NODE_ENV defaults to "development"). */
export function startupWarnings(env: Env): string[] {
  if (env.NODE_ENV === "production" || LOOPBACK_HOSTS.includes(env.HOST)) {
    return [];
  }
  return [
    `NODE_ENV=${env.NODE_ENV} with HOST=${env.HOST}: the API is reachable from other machines but the production checks (JWT secret, CORS) are off. Set NODE_ENV=production for any shared deployment.`,
  ];
}

export function loadEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): Env {
  const parsed = schema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
