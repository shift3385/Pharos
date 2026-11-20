// FIX-45: board layout rules jsdom cannot measure, pinned from the CSS.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "Planner.css"), "utf8");
const block = (selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
};

describe("board (FIX-45)", () => {
  it("draws its filters on a card, never on the photo", () => {
    const bar = block(".pl-toolbar");
    expect(bar).toMatch(/background:\s*var\(--color-surface-1\);/);
    expect(bar).toMatch(/border:\s*1px solid var\(--color-border\);/);
  });

  it("counts with the body font, not the monospace slashed zero", () => {
    const count = block(".pl-col__count");
    expect(count).not.toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(count).toMatch(/color:\s*var\(--color-text-secondary\);/);
  });

  it("shows no scroll thumb under the swiped columns on a phone", () => {
    expect(block('[data-viewport="mobile"] .pl-board')).toMatch(/scrollbar-width:\s*none;/);
  });

  it("aligns the attachments with their label", () => {
    expect(block(".pl-attach__list")).toMatch(/padding:\s*0;/);
  });
});
