// NC-027: at 1024 × 768 with the 9 project sections, the sidebar foot (sync
// status and avatar) left the window and the strip had to be scrolled. Only
// the nav scrolls now; brand and foot stay. jsdom has no layout, so this pins
// the rules.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "AppShell.css"), "utf8");
const block = (selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
};

describe("sidebar layout (NC-027)", () => {
  it("the sidebar itself does not scroll", () => {
    expect(block(".sidebar")).toMatch(/overflow:\s*hidden;/);
    expect(block(".sidebar")).not.toMatch(/overflow-y:\s*auto/);
  });

  it("the nav is the one scroller and can shrink below its content", () => {
    const nav = block(".sidebar__nav");
    expect(nav).toMatch(/flex:\s*1;/);
    expect(nav).toMatch(/min-height:\s*0;/);
    expect(nav).toMatch(/overflow-y:\s*auto;/);
  });

  it("keeps room for the focus ring inside the scroller", () => {
    const nav = block(".sidebar__nav");
    expect(nav).toMatch(/margin:\s*-4px;/);
    expect(nav).toMatch(/padding:\s*4px;/);
  });

  it("brand and foot never shrink", () => {
    expect(css).toMatch(/\.sidebar__brand,\s*\.sidebar__foot\s*\{\s*flex:\s*none;\s*\}/);
  });
});
