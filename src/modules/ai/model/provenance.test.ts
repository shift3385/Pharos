import { describe, expect, it, vi } from "vitest";
import { assistDraft, destinationFor, saveConfig, suggestTests } from "../api/aiApi";
import { DEFAULT_AI_CONFIG } from "./types";
import { hasPendingReview, isPendingReview, markReviewed, newProvenance, withProvenance } from "./provenance";

const at = new Date("2026-10-27T10:00:00.000Z");
const later = new Date("2026-10-27T11:00:00.000Z");

describe("AI provenance (IA-01)", () => {
  it("records which provider and model produced the content, pending review", () => {
    const p = newProvenance({ provider: "gemini", model: "gemini-2.0-flash" }, at);
    expect(p).toEqual({ provider: "gemini", model: "gemini-2.0-flash", generatedAt: at.toISOString() });
    expect(isPendingReview(p)).toBe(true);
  });

  it("stays pending until a person marks the field reviewed, and keeps the record", () => {
    const map = withProvenance({}, "summary", newProvenance({ provider: "ollama", model: "llama3.2:3b" }, at));
    expect(hasPendingReview(map)).toBe(true);
    const reviewed = markReviewed(map, "summary", "user-1", later);
    expect(hasPendingReview(reviewed)).toBe(false);
    expect(reviewed.summary).toMatchObject({
      provider: "ollama",
      reviewedBy: "user-1",
      reviewedAt: later.toISOString(),
    });
  });

  it("a new AI draft of a reviewed field is pending again", () => {
    const reviewed = markReviewed(
      withProvenance({}, "summary", newProvenance({ provider: "gemini", model: "m" }, at)),
      "summary",
      "user-1",
      later,
    );
    const redrafted = withProvenance(reviewed, "summary", newProvenance({ provider: "gemini", model: "m" }, later));
    expect(isPendingReview(redrafted.summary)).toBe(true);
  });

  it("is pending while any field is unreviewed", () => {
    let map = withProvenance({}, "a", newProvenance({ provider: "gemini", model: "m" }, at));
    map = withProvenance(map, "b", newProvenance({ provider: "gemini", model: "m" }, at));
    map = markReviewed(map, "a", "u", later);
    expect(hasPendingReview(map)).toBe(true);
    expect(hasPendingReview(undefined)).toBe(false);
  });

  it("marking an unknown field is a no-op", () => {
    expect(markReviewed({}, "nope", "u")).toEqual({});
  });

  it("maps the router choice to the concrete destination", () => {
    expect(destinationFor("online", DEFAULT_AI_CONFIG)).toEqual({ provider: "gemini", model: "gemini-2.0-flash" });
    expect(destinationFor("offline", DEFAULT_AI_CONFIG)).toEqual({ provider: "ollama", model: "llama3.2:3b" });
    expect(destinationFor(null, DEFAULT_AI_CONFIG)).toBeNull();
  });
});

describe("AI calls return their provenance (offline provider, mocked)", () => {
  it("assistDraft and suggestTests report Ollama + model as the producer", async () => {
    saveConfig({ ...DEFAULT_AI_CONFIG, mode: "offline" });
    const replies = ["Borrador.", '[{"title":"Login","description":"Entra"}]'];
    const fetchMock = vi.fn(async (url: string) => {
      const body = url.endsWith("/api/tags")
        ? { models: [{ name: "llama3.2:3b" }] }
        : { message: { content: replies.shift() } };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const draft = await assistDraft({ instruction: "x", notes: "", lang: "es" });
      expect(draft.value).toBe("Borrador.");
      expect(draft.provenance).toMatchObject({ provider: "ollama", model: "llama3.2:3b" });
      expect(isPendingReview(draft.provenance)).toBe(true);
      const suggested = await suggestTests("plan", "es");
      expect(suggested.value).toEqual([{ title: "Login", description: "Entra" }]);
      expect(suggested.provenance.provider).toBe("ollama");
    } finally {
      vi.unstubAllGlobals();
      localStorage.clear();
    }
  });
});
