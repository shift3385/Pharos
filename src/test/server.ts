// Test helper for the web build (BASE-10): a signed-in session and a fake
// server that answers every request, recording `METHOD /path` of each call.

import { vi } from "vitest";

export interface FakeServer {
  /** `METHOD /path?query` of every request, in order. */
  calls(): string[];
  /** The JSON body of request `i` (undefined if it had none). */
  body(i: number): unknown;
}

/** Signs `userId` in and stubs `fetch`: DELETE answers 204, anything else
 *  `answer` (by default an item `{ id, revision: 1 }`). */
export function fakeServer(answer: unknown = { id: "x", revision: 1, createdAt: "2026-10-29T00:00:00.000Z" }, userId = "u1"): FakeServer {
  localStorage.setItem(
    "pharos.session",
    JSON.stringify({ accessToken: "tok", refreshToken: "r", user: { id: userId } }),
  );
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
    init.method === "DELETE"
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify(answer), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return {
    calls: () =>
      fetchMock.mock.calls.map(
        ([url, init]) => `${init.method} ${String(url).replace(/^https?:\/\/[^/]+/, "")}`,
      ),
    body: (i) => {
      const raw = fetchMock.mock.calls[i]?.[1].body;
      return raw ? JSON.parse(raw as string) : undefined;
    },
  };
}
