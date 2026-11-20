// FIX-40: in the sidebar strip (1024 px) the selector read «Perso…". Its
// name is set like the strip's labels and may take two lines; jsdom cannot
// measure, so the rules are read from the stylesheet.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "workspaces.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
};

describe("workspace selector in the strip (FIX-40)", () => {
  it("uses the strip's label size and the whole width", () => {
    const compact = rule(".ws-switcher[data-compact]");
    expect(compact).toMatch(/font-size:\s*10\.5px/);
    expect(compact).toMatch(/padding:\s*6px 2px/);
  });

  it("lets the name take two lines before cutting it", () => {
    const name = rule(".ws-switcher[data-compact] .ws-switcher__name");
    expect(name).toMatch(/white-space:\s*normal/);
    expect(name).toMatch(/-webkit-line-clamp:\s*2/);
  });
});
