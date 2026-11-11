import { describe, expect, it } from "vitest";
import { visionFor } from "./capabilities";
import { checkAttachments } from "../api/aiApi";
import { ollamaMessage } from "../providers/ollama";
import { describeAiFailure } from "../api/structured";
import type { AiMessage } from "./types";

// IA-18, ADR-0037: which models see images, and what stops before sending.
describe("visionFor", () => {
  it("knows the families that read images and PDF", () => {
    expect(visionFor("anthropic", "claude-opus-5-5")).toEqual({ images: "yes", pdf: true });
    expect(visionFor("anthropic", "claude-2.1").images).toBe("no");
    expect(visionFor("gemini", "gemini-2.0-flash")).toEqual({ images: "yes", pdf: true });
    expect(visionFor("gemini", "text-embedding-004").images).toBe("no");
    expect(visionFor("openai", "gpt-4o").images).toBe("yes");
    expect(visionFor("openai", "gpt-5").images).toBe("yes");
    expect(visionFor("openai", "gpt-3.5-turbo").images).toBe("no");
    expect(visionFor("openai", "o3-mini").images).toBe("no");
  });

  it("reads OpenRouter ids by their family and leaves others unknown", () => {
    expect(visionFor("openrouter", "anthropic/claude-sonnet-5-5").images).toBe("yes");
    expect(visionFor("openrouter", "google/gemini-2.5-pro").images).toBe("yes");
    expect(visionFor("openrouter", "meta-llama/llama-3-70b").images).toBe("unknown");
    expect(visionFor("custom", "whatever").images).toBe("unknown");
  });

  it("Ollama: only vision models, and never a PDF", () => {
    for (const m of ["llava:7b", "llama3.2-vision:11b", "qwen2.5vl:7b", "gemma3:4b", "minicpm-v", "moondream"]) {
      expect(visionFor("ollama", m)).toEqual({ images: "yes", pdf: false });
    }
    expect(visionFor("ollama", "llama3.2:3b").images).toBe("no");
    expect(visionFor("ollama", "qwen2.5:7b").images).toBe("no");
  });
});

describe("checkAttachments", () => {
  const img = (mediaType: "image/png" | "application/pdf"): AiMessage[] => [
    { role: "user", content: "x", images: [{ mediaType, data: "QUJD" }] },
  ];

  it("lets text through to any model", () => {
    expect(() => checkAttachments([{ role: "user", content: "x" }], { provider: "ollama", model: "llama3.2:3b" })).not.toThrow();
  });

  it("stops images for a text-only model and PDF for an image-only one", () => {
    expect(() => checkAttachments(img("image/png"), { provider: "ollama", model: "llama3.2:3b" })).toThrow("no-vision");
    expect(() => checkAttachments(img("application/pdf"), { provider: "ollama", model: "llava" })).toThrow("no-pdf");
    expect(() => checkAttachments(img("application/pdf"), { provider: "anthropic", model: "claude-opus-5-5" })).not.toThrow();
    expect(() => checkAttachments(img("image/png"), { provider: "custom", model: "x" })).not.toThrow();
  });

  it("names both failures for the UI", () => {
    expect(describeAiFailure(new Error("no-vision")).kind).toBe("no-vision");
    expect(describeAiFailure(new Error("no-pdf")).kind).toBe("no-pdf");
  });
});

describe("ollamaMessage", () => {
  it("sends images as a list of base64 strings and plain messages as before", () => {
    expect(ollamaMessage({ role: "user", content: "x" })).toEqual({ role: "user", content: "x" });
    expect(ollamaMessage({ role: "user", content: "x", images: [{ mediaType: "image/webp", data: "QUJD", name: "a" }] })).toEqual({
      role: "user",
      content: "x",
      images: ["QUJD"],
    });
    expect(() => ollamaMessage({ role: "user", content: "x", images: [{ mediaType: "application/pdf", data: "QUJD" }] })).toThrow();
  });
});
