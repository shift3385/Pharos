import { AI_REQUEST_TIMEOUT_MS, AI_TIMEOUT_MESSAGE, type AiProvider } from "../model/types";

/** Ollama answers within a context window of `num_ctx` tokens and silently
 *  drops what does not fit; its default is a few thousand. A long request
 *  (IA-17 sends whole files) asks for room for itself plus the answer, within
 *  what a local machine can hold. Pure — testable. */
export const OLLAMA_MIN_CTX = 4096;
export const OLLAMA_MAX_CTX = 32768;
export function ollamaContext(messages: { content: string }[]): number | undefined {
  const chars = messages.reduce((n, m) => n + m.content.length, 0);
  const prompt = Math.ceil(chars / 3.5);
  // A short request fits the default window with room to answer.
  if (prompt + 1024 <= OLLAMA_MIN_CTX) return undefined;
  return Math.min(OLLAMA_MAX_CTX, Math.ceil((prompt + 4096) / 1024) * 1024);
}

/** Offline provider (Ollama). Runs locally over HTTP — no key, no TLS. A call
 *  slower than the online limit fails with the same timeout error. */
export function ollamaProvider(endpoint: string): AiProvider {
  return {
    async chat(messages, opts) {
      let res: Response;
      try {
        res = await fetch(`${endpoint}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: opts.model,
            messages,
            stream: false,
            // Native JSON mode: small local models drift from the schema without it.
            ...(opts.json ? { format: "json" } : {}),
            options: { temperature: opts.temperature, ...numCtx(messages) },
          }),
          signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
        });
      } catch (e) {
        if ((e as { name?: string })?.name === "TimeoutError") throw new Error(AI_TIMEOUT_MESSAGE);
        throw e;
      }
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = (await res.json()) as { message?: { content?: string } };
      return data.message?.content ?? "";
    },
  };
}

const numCtx = (messages: { content: string }[]) => {
  const ctx = ollamaContext(messages);
  return ctx ? { num_ctx: ctx } : {};
};

/** Lists the models already pulled locally (throws if Ollama is not reachable). */
export async function ollamaModels(endpoint: string): Promise<string[]> {
  const res = await fetch(`${endpoint}/api/tags`);
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = (await res.json()) as { models?: { name: string }[] };
  return (data.models ?? []).map((m) => m.name);
}

export interface PullProgress {
  status: string;
  percent: number | null;
  /** Bytes downloaded / total for the current layer (when Ollama reports them). */
  completed?: number;
  total?: number;
}

/** Pulls a model, streaming NDJSON progress lines from Ollama's /api/pull. */
export async function ollamaPull(
  endpoint: string,
  model: string,
  onProgress: (p: PullProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${endpoint}/api/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Ollama HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const obj = JSON.parse(line) as { status?: string; total?: number; completed?: number };
      const percent =
        obj.total && obj.completed ? Math.round((obj.completed / obj.total) * 100) : null;
      onProgress({
        status: obj.status ?? "",
        percent,
        completed: obj.completed,
        total: obj.total,
      });
    }
  }
}
