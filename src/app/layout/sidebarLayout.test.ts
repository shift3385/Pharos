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

// FIX-46: at 1440 × 900 with a project open, «Configuración › Administración»
// was scrolled out of the nav and the top of its label showed as a stray dot.
describe("sidebar at 900 px of height (FIX-46)", () => {
  const media = (query: string) => {
    const at = css.indexOf(`@media (${query}) {`);
    let depth = 0;
    for (let i = css.indexOf("{", at); i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}" && --depth === 0) return css.slice(at, i);
    }
    return "";
  };
  const px = (text: string, selector: string, prop: string) => {
    const at = text.indexOf(`${selector} {`);
    const rule = at < 0 ? "" : text.slice(at, text.indexOf("}", at));
    const m = new RegExp(`\\n\\s*${prop}:\\s*(\\d+)px`).exec(rule);
    return m ? Number(m[1]) : NaN;
  };

  it("fits every group, Administración included", () => {
    const compact = media("max-height: 960px");
    const full = '.sidebar:not([data-mode="rail"])';
    const link = px(compact, `${full} .sidebar__link`, "height");
    const groupGap = px(compact, `${full} .sidebar__nav`, "gap");
    const sideGap = px(compact, full, "gap");
    // Measured on the manual's captures: brand 35, sidebar padding 20 + 14,
    // foot (sync status and button, user) 119, workspace switcher 67, group
    // label 23, project chip 39 + its margin, 2 px between entries.
    const nav = 900 - 20 - 35 - 2 * sideGap - 133 + 8;
    const main = 2 * link + 2;
    const project = 23 + 2 + 41 + 2 + 10 * link + 9 * 2;
    const config = 23 + 2 + link;
    const content = 67 + main + project + config + 3 * groupGap;
    expect(content).toBeLessThanOrEqual(nav);
  });

  it("the strip of a 1024 × 768 tablet fits every entry, «Admin» included (FIX-49)", () => {
    const tight = media("max-height: 800px");
    const rail = '.sidebar[data-mode="rail"]';
    const rule = (selector: string) => {
      const at = tight.indexOf(`${selector} {`);
      return at < 0 ? "" : tight.slice(at, tight.indexOf("}", at));
    };
    const pad = /padding:\s*(\d+)px 0 (\d+)px/.exec(
      rule(`${rail} .sidebar__link`),
    );
    const gap = Number(
      /gap:\s*(\d+)px/.exec(rule(`${rail} .sidebar__link`))?.[1],
    );
    expect(pad).not.toBeNull();
    // An entry: padding, 18 px icon, gap, 13 px label; 0 px between entries.
    const entry = Number(pad![1]) + 18 + gap + 13 + Number(pad![2]);
    expect(entry).toBeGreaterThanOrEqual(24);
    // Measured on navegacion/11: the strip from the workspace chip (y 92) to
    // the divider above the foot (y 665) holds the 12 entries.
    expect(12 * entry).toBeLessThanOrEqual(665 - 92);
    expect(rule(`${rail} .sidebar__nav,\n  ${rail} .sidebar__group`)).toMatch(
      /gap:\s*0;/,
    );
  });

  it("on a phone the content's scrollbar takes no room beside full-width cards (FIX-49)", () => {
    expect(block('[data-viewport="mobile"] .app-shell__content')).toMatch(/scrollbar-width:\s*none/);
  });

  it("fades the nav's lower edge only while there is more below", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const base = readFileSync(join(here, "../../shared/theme/base.css"), "utf8");
    expect(base).toMatch(/@property --scroll-fade\s*\{[^}]*initial-value:\s*0px;/);
    expect(base).toMatch(/\.u-scroll-fade\s*\{[^}]*animation-timeline:\s*scroll\(self\);/);
    expect(base).toMatch(/mask-image:\s*linear-gradient\([\s\S]*?var\(--scroll-fade\)/);
    expect(readFileSync(join(here, "Sidebar.tsx"), "utf8")).toContain('className="sidebar__nav u-scroll-fade"');
  });
});
