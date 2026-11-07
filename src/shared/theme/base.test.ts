// FIX-18: a touchpad or touch swipe past the end of a scroller must not drag
// the whole app off its layout. jsdom has no scrolling, so this pins the rule.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "base.css"), "utf8");

describe("base.css", () => {
  it("turns off the elastic bounce on the document", () => {
    expect(css).toMatch(/html,\s*body\s*\{\s*overscroll-behavior:\s*none;\s*\}/);
  });

  it("keeps the document scrollable for screens outside the app shell", () => {
    expect(css).not.toMatch(/(html|body)[^{}]*\{[^}]*overflow(-x|-y)?:\s*(hidden|clip)/);
  });
});
