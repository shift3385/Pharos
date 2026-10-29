import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generatedCasesSchema } from "../model/schemas";
import { AI_TIMEOUT_MESSAGE } from "../model/types";
import { chatTemperature } from "./aiApi";
import { AiOutputError, describeAiFailure, extractJsonObject, parseStructured, requireItems } from "./structured";

const schema = z.object({ items: z.array(z.string().min(1)).default([]), reason: z.string().optional() });

function failureOf(fn: () => unknown): AiOutputError {
  try {
    fn();
  } catch (e) {
    if (e instanceof AiOutputError) return e;
    throw e;
  }
  throw new Error("expected an AiOutputError");
}

describe("structured AI answers (ADR-0023)", () => {
  it("extracts the JSON object from fences and prose", () => {
    expect(extractJsonObject('Sure:\n```json\n{"items":["a"]}\n```\nDone.')).toBe('{"items":["a"]}');
    expect(extractJsonObject("no json here")).toBeNull();
  });

  it("returns the validated value", () => {
    expect(parseStructured('```json\n{"items":["a","b"]}\n```', schema)).toEqual({ items: ["a", "b"] });
  });

  it("reports an empty reply", () => {
    expect(failureOf(() => parseStructured("   ", schema)).kind).toBe("empty");
  });

  it("treats prose without JSON as a refusal and keeps the model's words", () => {
    const e = failureOf(() => parseStructured("I can't help with that request.", schema));
    expect(e.kind).toBe("refusal");
    expect(e.details).toEqual(["I can't help with that request."]);
  });

  it("reports malformed JSON", () => {
    expect(failureOf(() => parseStructured('{"items": ["a",]}', schema)).kind).toBe("invalid-json");
  });

  it("reports a schema mismatch with the failed fields", () => {
    const e = failureOf(() => parseStructured('{"items": ["ok", 3]}', schema));
    expect(e.kind).toBe("invalid-schema");
    expect(e.details[0]).toMatch(/^items\.1: /);
  });

  it("rejects the whole answer when a single case is invalid (never half-applied)", () => {
    const reply = JSON.stringify({
      cases: [
        { title: "Valid", priority: "high", when: ["log in"], then: ["sees the dashboard"] },
        { title: "Broken", priority: "urgent", when: ["log in"], then: [] },
      ],
    });
    const e = failureOf(() => parseStructured(reply, generatedCasesSchema));
    expect(e.kind).toBe("invalid-schema");
    expect(e.details.join("\n")).toContain("cases.1.priority");
    expect(e.details.join("\n")).toContain("cases.1.then");
  });

  it("an empty list is the model declining, with its reason", () => {
    const e = failureOf(() => requireItems([], "The requirement is too vague"));
    expect(e.kind).toBe("refusal");
    expect(e.details).toEqual(["The requirement is too vague"]);
    expect(requireItems(["x"])).toEqual(["x"]);
  });

  it("describes every failure for the UI", () => {
    expect(describeAiFailure(new AiOutputError("invalid-json"))).toEqual({ kind: "invalid-json", details: [] });
    expect(describeAiFailure(new Error("no-provider")).kind).toBe("no-provider");
    // Rust rejects with a plain string; Ollama with an Error carrying the same text.
    expect(describeAiFailure(AI_TIMEOUT_MESSAGE).kind).toBe("timeout");
    expect(describeAiFailure(new Error(AI_TIMEOUT_MESSAGE)).kind).toBe("timeout");
    expect(describeAiFailure("Invalid API key")).toEqual({ kind: "provider", details: ["Invalid API key"] });
  });

  it("caps the temperature of structured calls only", () => {
    expect(chatTemperature(0.7, true)).toBe(0.3);
    expect(chatTemperature(0.1, true)).toBe(0.1);
    expect(chatTemperature(0.7, false)).toBe(0.7);
  });
});
