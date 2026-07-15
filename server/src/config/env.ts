import { z } from "zod";
import dotenv from "dotenv";

// Load .env from the server dir and the repo root (compose/root .env).
dotenv.config();
dotenv.config({ path: "../.env" });

const schema = z.object({
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
});

export type Env = z.infer<typeof schema>;

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
