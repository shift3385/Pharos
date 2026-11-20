// FIX-45: «Usar» and its switch sit on a card, not on the background photo.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "Ai.css"), "utf8");
const block = (selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
};

describe("Motor de IA mode row (FIX-45)", () => {
  it("has its own surface", () => {
    const row = block(".ai-tab__mode");
    expect(row).toMatch(/background:\s*var\(--color-surface-1\);/);
    expect(row).toMatch(/border-radius:\s*var\(--radius-lg\);/);
  });
});
