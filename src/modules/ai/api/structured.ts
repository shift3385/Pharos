// Structured AI answers (ADR-0023): the same chat path as every other AI call,
// with a strict prompt, then extraction, JSON parsing and zod validation on the
// client. Works the same with every online provider and with Ollama.

import type { z } from "zod";
import { AI_TIMEOUT_MESSAGE, type AiMessage } from "../model/types";
import { aiChatWithProvenance, type AiResult } from "./aiApi";

/** Why a structured answer was not usable. */
export type AiOutputErrorKind = "empty" | "refusal" | "invalid-json" | "invalid-schema";

/** A reply that cannot be used as is. Nothing from it is applied. `details`
 *  are short, human-readable (the model's own words for a refusal, the first
 *  failed fields for a schema mismatch). */
export class AiOutputError extends Error {
  constructor(
    readonly kind: AiOutputErrorKind,
    readonly details: string[] = [],
  ) {
    super(`ai-output:${kind}`);
    this.name = "AiOutputError";
  }
}

const MAX_ISSUES = 5;
const MAX_SNIPPET = 300;

/** The JSON object inside a reply, tolerating code fences and prose around it
 *  (null when there is none). */
export function extractJsonObject(reply: string): string | null {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  return start >= 0 && end > start ? reply.slice(start, end + 1) : null;
}

/** Validates a reply against a schema (pure — testable). Throws AiOutputError. */
export function parseStructured<T>(reply: string, schema: z.ZodType<T>): T {
  const text = reply.trim();
  if (!text) throw new AiOutputError("empty");
  const json = extractJsonObject(text);
  // Prose without any JSON object: the model answered something else, usually
  // a refusal. Its words are shown so the user knows why.
  if (json === null) throw new AiOutputError("refusal", [text.slice(0, MAX_SNIPPET)]);
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new AiOutputError("invalid-json");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AiOutputError(
      "invalid-schema",
      parsed.error.issues
        .slice(0, MAX_ISSUES)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    );
  }
  return parsed.data;
}

/** A validated list: an empty one is the model declining, with its reason. */
export function requireItems<T>(items: T[], reason?: string): T[] {
  if (!items.length) throw new AiOutputError("refusal", reason ? [reason] : []);
  return items;
}

/** Sends a structured request (JSON mode where the provider has one) and
 *  validates the reply. The provenance names the provider + model that answered. */
export async function aiJson<T>(
  messages: AiMessage[],
  schema: z.ZodType<T>,
): Promise<AiResult<T>> {
  const reply = await aiChatWithProvenance(messages, { json: true });
  return { value: parseStructured(reply.value, schema), provenance: reply.provenance };
}

/** What went wrong with an AI call, for the UI message. */
export type AiFailure =
  | { kind: AiOutputErrorKind; details: string[] }
  | { kind: "no-provider" | "timeout"; details: [] }
  | { kind: "provider"; details: string[] };

export function describeAiFailure(e: unknown): AiFailure {
  if (e instanceof AiOutputError) return { kind: e.kind, details: e.details };
  const message = e instanceof Error ? e.message : String(e);
  if (message === "no-provider") return { kind: "no-provider", details: [] };
  if (message.includes(AI_TIMEOUT_MESSAGE)) return { kind: "timeout", details: [] };
  return { kind: "provider", details: message ? [message.slice(0, MAX_SNIPPET)] : [] };
}
