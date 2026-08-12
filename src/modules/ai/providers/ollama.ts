import type { AiProvider } from "../model/types";

/** Offline provider (Ollama). Runs locally over HTTP — no key, no TLS. */
export function ollamaProvider(endpoint: string): AiProvider {
  return {
    async chat(messages, opts) {
      const res = await fetch(`${endpoint}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: opts.model,
          messages,
          stream: false,
          options: { temperature: opts.temperature },
        }),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = (await res.json()) as { message?: { content?: string } };
      return data.message?.content ?? "";
    },
  };
}

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
