// FIX-45: layout rules of the project header and settings that jsdom cannot
// measure, pinned from the CSS.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const blockOf = (file: string) => {
  const css = readFileSync(join(here, file), "utf8");
  return (selector: string) => {
    // The last rule of the selector: a shared one («a,\nb {») comes first.
    const at = css.lastIndexOf(`\n${selector} {`);
    return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
  };
};
const header = blockOf("ProjectHeader.css");
const projects = blockOf("Projects.css");

describe("project header meta line (FIX-45)", () => {
  it("hides the «·» of an item that starts a line: the gutter falls outside a clip", () => {
    expect(header(".pj-header__meta-clip")).toMatch(/overflow:\s*hidden;/);
    expect(header(".pj-header__meta")).toMatch(/margin-left:\s*calc\(-1 \* var\(--pj-meta-gap\)\);/);
    expect(header(".pj-header__meta > *")).toMatch(/margin-left:\s*var\(--pj-meta-gap\);/);
    const dot = header(".pj-header__meta-item + .pj-header__meta-item::before");
    expect(dot).toMatch(/margin-left:\s*calc\(-1 \* var\(--pj-meta-gap\)\);/);
    expect(dot).toMatch(/width:\s*var\(--pj-meta-gap\);/);
  });

  it("on a phone, a button too long for the row goes to the next one instead of clipping", () => {
    expect(header(".pj-header--mobile .pj-header__actions > *")).toMatch(/flex:\s*1 1 auto;/);
  });
});

describe("settings cards (FIX-45)", () => {
  it("puts the title and its «?» on one row", () => {
    expect(projects(".pj-card-box__title-row")).toMatch(/display:\s*flex;/);
  });

  it("names the axes of the risk grid", () => {
    expect(projects(".pj-heat__ytitle")).toMatch(/writing-mode:\s*vertical-rl;/);
    expect(projects(".pj-heat__xtitle")).toMatch(/grid-column:\s*2;/);
  });
});
