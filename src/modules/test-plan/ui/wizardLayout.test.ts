// FIX-40: layout rules of the plan wizard that jsdom cannot measure, read
// from the stylesheet. Each one kept a text from being cut or broken letter
// by letter at 1440 px, where the step sits between the side panels.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "TestPlanWizard.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** The declarations of the first rule whose selector is exactly `selector`,
 *  after `from` (to reach a rule inside an `@container`). */
const rule = (selector: string, from = 0) => {
  const at = css.indexOf(`${selector} {`, from);
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
};

describe("plan wizard layout (FIX-40)", () => {
  it("«Métricas» lays its rows out by the step's width, not the window's", () => {
    expect(rule(".tpw-metrics")).toMatch(/container-type:\s*inline-size/);
    const narrow = css.indexOf("@container (max-width: 719.98px)", css.indexOf(".tpw-metrics__row {"));
    expect(narrow).toBeGreaterThan(-1);
    // «Cómo se mide», «Criterio de salida» and delete: one line, each its own column.
    expect(rule(".tpw-metrics__row", narrow)).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) auto 38px/);
  });

  it("the step list fades at its bottom edge instead of slicing a step (FIX-51)", () => {
    const fade = rule(".tpw-rail::after");
    expect(fade).toMatch(/position:\s*sticky/);
    expect(fade).toMatch(/bottom:/);
    expect(fade).toMatch(/linear-gradient\(to bottom, transparent, var\(--color-surface-1\)/);
    expect(fade).toMatch(/pointer-events:\s*none/);
  });

  it("each independence option centres its label (FIX-51)", () => {
    expect(rule(".tpw-scale__option span")).toMatch(/align-items:\s*center/);
  });

  it("the step's footer is not held over the page, so no control is ever half under it (FIX-49)", () => {
    const foot = rule(".tpw__foot");
    expect(foot).toMatch(/display:\s*flex/);
    expect(foot).not.toMatch(/position:\s*(sticky|fixed)/);
    // No other rule of the wizard pins it either.
    expect(css).not.toMatch(
      /\.tpw__foot[^{]*\{[^}]*position:\s*(sticky|fixed)/,
    );
  });

  it("«Metodología» puts the meetings under the way of working below 560 px (FIX-49)", () => {
    const narrow = css.indexOf("@container (max-width: 559.98px)");
    expect(narrow).toBeGreaterThan(-1);
    expect(rule(".tpw-meth .tpw-cols__grid", narrow)).toMatch(
      /grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    const wide = css.indexOf("@container (min-width: 560px)");
    expect(rule(".tpw-meth .tpw-cols__grid", wide)).toMatch(
      /minmax\(200px, 2fr\) minmax\(min-content, 3fr\)/,
    );
  });

  it("stacked under the calendar, the schedule rows have no scroll box of their own (FIX-44)", () => {
    const stacked = rule('.tps[data-layout="stacked"] .tps-lists');
    expect(stacked).toMatch(/overflow-y:\s*visible/);
    expect(stacked).not.toMatch(/max-block-size/);
  });

  it("a milestone's diamond sits inside its day, under the number (FIX-44)", () => {
    expect(rule(".tps-day")).toMatch(/height:\s*40px/);
    expect(rule(".tps-diamond")).toMatch(/bottom:\s*5px/);
    expect(rule(".tps-diamond")).not.toMatch(/\btop:/);
  });

  it("«Título» takes the whole row; the approver's name shares the label's row when it fits (FIX-44, FIX-49)", () => {
    expect(rule(".tpw-ident")).toMatch(
      /grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    const pair = rule(".tpw-facts__pair");
    expect(pair).toMatch(/grid-column:\s*1 \/ -1/);
    expect(pair).toMatch(/flex-wrap:\s*wrap/);
  });

  it("«Aprobado por» wraps instead of being cut, moving the whole name before breaking it", () => {
    const wrap = rule(".tpw-facts dd.tpw-facts__wrap");
    expect(wrap).toMatch(/overflow-wrap:\s*break-word/);
    expect(wrap).toMatch(/white-space:\s*normal/);
  });

  it("the «Propios» field keeps room for its whole placeholder and «Añadir» wraps under it", () => {
    expect(rule(".tpw-cols .tpw-cols__add")).toMatch(/flex-wrap:\s*wrap/);
    expect(rule(".tpw-cols .tpw-cols__add .tpw-input")).toMatch(/flex:\s*1 1 12em/);
  });
});
