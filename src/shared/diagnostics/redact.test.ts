import { describe, expect, it } from "vitest";
import { redact } from "./redact";

const EMAIL = "ana.perez@cliente.example";
const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJlLXNlY3JldA";
const OPENAI_KEY = "sk-proj-AbCdEf0123456789GhIjKl";
const GEMINI_KEY = "AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q";
const REFRESH = "f3a9c1d2e4b5a6978877665544332211aabbccdd";

describe("redact (mirror of diag::redact)", () => {
  it("masks emails, tokens, keys, secrets and the Windows user name", () => {
    const text =
      `user ${EMAIL} Authorization: Bearer ${JWT} key=${OPENAI_KEY} g=${GEMINI_KEY} ` +
      `refresh_token=${REFRESH} at C:\\Users\\anabel\\AppData "password":"hunter2"`;
    const out = redact(text);
    for (const secret of [
      EMAIL,
      JWT,
      OPENAI_KEY,
      GEMINI_KEY,
      REFRESH,
      "anabel",
      "hunter2",
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain("<email>");
    expect(out).toContain("C:\\Users\\<user>\\AppData");
  });

  it("keeps ordinary diagnostics untouched", () => {
    const text =
      "TypeError: x is undefined at src/modules/test-cases/ui/TestCaseEditor.tsx:42 " +
      "id 3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    expect(redact(text)).toBe(text);
  });
});
