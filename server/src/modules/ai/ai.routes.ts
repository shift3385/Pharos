// AI for the web with the desktop's key (IA-12, ADR-0034).
//
// - `GET /ai/web-access`: whether the account has a key here, its provider and
//   model, and whether this server can use it. Never the key.
// - `PUT /ai/web-access`: stores the key the desktop's Rust core read from the
//   keychain (the web cannot upload one: it never holds the key).
// - `DELETE /ai/web-access`: removes it (desktop or web).
// - `POST /ai/chat`: one chat completion with the stored key.
//
// Every route acts only on the signed-in account (`req.userId`); none takes a
// user id. The key never goes into a response, a log line or an error: the
// routes' own error handler answers fixed texts for anything but their own
// errors (a malformed JSON body would otherwise be quoted back), and nothing
// here logs a body.
import type { FastifyError, FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { Env } from "../../config/env";
import { AppError } from "../auth/errors";
import { makeRequireAuth } from "../auth/middleware";
import type { TokenService } from "../auth/tokens";
import { requireSupportedVersion } from "../sync/sync.version";
import { WEB_PROVIDERS, ProviderError, chat, messagesSchema, validModel, type Fetch, type WebProvider } from "./providers";
import { createVault, type Vault } from "./vault";

/** What the account has on this server. */
export interface WebAccess {
  /** This server has `AI_VAULT_KEY`: it can keep and use a key. */
  available: boolean;
  /** A key is stored for this account. */
  enabled: boolean;
  provider: WebProvider | null;
  model: string | null;
  updatedAt: string | null;
  /** Stored under another `AI_VAULT_KEY`: it must be uploaded again. */
  needsReupload: boolean;
}

interface Row {
  provider: WebProvider;
  model: string;
  nonce: Buffer;
  ciphertext: Buffer;
  kek_id: string;
  updated_at: Date;
}

export function createAiVaultStore(pool: Pool) {
  return {
    async get(userId: string): Promise<Row | null> {
      const { rows } = await pool.query<Row>(
        "SELECT provider, model, nonce, ciphertext, kek_id, updated_at FROM ai_vault WHERE user_id = $1",
        [userId],
      );
      return rows[0] ?? null;
    },
    async put(userId: string, provider: WebProvider, model: string, sealed: { nonce: Buffer; ciphertext: Buffer; kekId: string }) {
      await pool.query(
        `INSERT INTO ai_vault (user_id, provider, model, nonce, ciphertext, kek_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE SET
           provider = EXCLUDED.provider, model = EXCLUDED.model, nonce = EXCLUDED.nonce,
           ciphertext = EXCLUDED.ciphertext, kek_id = EXCLUDED.kek_id, updated_at = now()`,
        [userId, provider, model, sealed.nonce, sealed.ciphertext, sealed.kekId],
      );
    },
    async remove(userId: string): Promise<void> {
      await pool.query("DELETE FROM ai_vault WHERE user_id = $1", [userId]);
    },
  };
}

export type AiVaultStore = ReturnType<typeof createAiVaultStore>;

const AiErrors = {
  disabled: () =>
    new AppError(503, "ai_vault_disabled", "This server does not keep AI keys for the web (AI_VAULT_KEY is not set)."),
  off: () => new AppError(404, "ai_web_access_off", "No AI key is stored for the web on this account."),
  reupload: () =>
    new AppError(409, "ai_vault_reupload", "The stored AI key can no longer be read here; upload it again from the desktop."),
  invalid: () => new AppError(400, "validation_error", "Invalid input."),
};

const putSchema = z.object({
  provider: z.enum(WEB_PROVIDERS),
  model: z.string().trim(),
  key: z
    .string()
    .trim()
    .min(1)
    .max(1024)
    .regex(/^[\x21-\x7e]+$/),
});

const chatSchema = z.object({
  messages: messagesSchema,
  temperature: z.number().min(0).max(2).optional(),
});

function view(row: Row | null, vault: Vault | null): WebAccess {
  return {
    available: vault !== null,
    enabled: row !== null,
    provider: row?.provider ?? null,
    model: row?.model ?? null,
    updatedAt: row?.updated_at.toISOString() ?? null,
    needsReupload: row !== null && vault !== null && row.kek_id !== vault.kekId,
  };
}

/** Parses with a fixed error: zod issues could quote what was sent. */
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw AiErrors.invalid();
  return result.data;
}

/** Client errors of Fastify itself, by status, without its message (a JSON
 *  parse error quotes part of the body). */
const CLIENT_ERRORS: Record<number, [string, string]> = {
  400: ["bad_request", "Malformed request."],
  413: ["payload_too_large", "The request is too large."],
  415: ["unsupported_media_type", "Send JSON."],
};

export function aiRoutes(
  app: FastifyInstance,
  deps: { tokens: TokenService; store: AiVaultStore; env: Env; fetch?: Fetch },
) {
  const vault = deps.env.AI_VAULT_KEY ? createVault(deps.env.AI_VAULT_KEY) : null;
  // A new array per route: the rate-limit plugin appends its check to it.
  const auth = makeRequireAuth(deps.tokens);
  const preHandler = () => [auth, requireSupportedVersion];
  // Per account, after authentication (so one account cannot use up another's).
  const perUser = (scope: string, max: number, timeWindow: number) => ({
    rateLimit: { max, timeWindow, hook: "preHandler" as const, keyGenerator: (req: FastifyRequest) => `${scope}:${req.userId ?? req.ip}` },
  });
  const vaultLimit = perUser("ai-vault", deps.env.AI_VAULT_RATE_LIMIT_MAX, deps.env.AI_VAULT_RATE_LIMIT_WINDOW);

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ ...error.details, code: error.code, message: error.message });
    }
    const status = (error as FastifyError).statusCode;
    if (status && status >= 400 && status < 500) {
      const [code, message] = CLIENT_ERRORS[status] ?? ["client_error", "Invalid request."];
      return reply.code(status).send({ code, message });
    }
    // Only the kind of failure: the error itself may hold what was sent.
    req.log.error({ errName: (error as Error)?.name, errCode: (error as FastifyError)?.code }, "AI route failed");
    return reply.code(500).send({ code: "internal_error", message: "Internal server error." });
  });

  app.get("/ai/web-access", { preHandler: preHandler() }, async (req) =>
    view(await deps.store.get(req.userId as string), vault),
  );

  app.put("/ai/web-access", { preHandler: preHandler(), config: vaultLimit }, async (req) => {
    if (!vault) throw AiErrors.disabled();
    const input = parse(putSchema, req.body);
    if (!validModel(input.provider, input.model)) throw AiErrors.invalid();
    const userId = req.userId as string;
    await deps.store.put(userId, input.provider, input.model, vault.seal(input.key, userId, input.provider));
    return view(await deps.store.get(userId), vault);
  });

  app.delete("/ai/web-access", { preHandler: preHandler(), config: vaultLimit }, async (req, reply) => {
    await deps.store.remove(req.userId as string);
    return reply.code(204).send();
  });

  app.post(
    "/ai/chat",
    {
      preHandler: preHandler(),
      bodyLimit: deps.env.AI_CHAT_BODY_LIMIT_BYTES,
      config: perUser("ai-chat", deps.env.AI_CHAT_RATE_LIMIT_MAX, deps.env.AI_CHAT_RATE_LIMIT_WINDOW),
    },
    async (req) => {
      if (!vault) throw AiErrors.disabled();
      const input = parse(chatSchema, req.body);
      const userId = req.userId as string;
      const row = await deps.store.get(userId);
      if (!row) throw AiErrors.off();
      if (row.kek_id !== vault.kekId) throw AiErrors.reupload();
      const key = vault.open({ nonce: row.nonce, ciphertext: row.ciphertext, kekId: row.kek_id }, userId, row.provider);
      if (key === null) throw AiErrors.reupload();
      try {
        const value = await chat(row.provider, key, row.model, input.temperature, input.messages, deps.fetch);
        return { value, provider: row.provider, model: row.model };
      } catch (e) {
        if (!(e instanceof ProviderError)) throw new Error("AI provider call failed");
        const status = e.kind === "timeout" ? 504 : 502;
        throw new AppError(status, "ai_provider_error", e.message, {
          kind: e.kind,
          provider: row.provider,
          ...(e.status ? { providerStatus: e.status } : {}),
        });
      }
    },
  );
}
