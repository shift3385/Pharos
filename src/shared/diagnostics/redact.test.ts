import { describe, expect, it } from "vitest";
import fixture from "./redaction-fixture.json";
import { redact } from "./redact";

// The same cases run against `diag::redact` in src-tauri/src/diag.rs, so the
// frontend and the desktop mask the same things.
describe("redact (mirror of diag::redact)", () => {
  it.each(fixture.masked)("masks $input", ({ input, secrets, expect: wanted }) => {
    const out = redact(input);
    for (const secret of secrets) expect(out).not.toContain(secret);
    for (const part of wanted) expect(out).toContain(part);
  });

  it.each(fixture.kept)("keeps %s", (text) => {
    expect(redact(text)).toBe(text);
  });
});
