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

  it("a control the page scrolls to stops clear of the sticky footer (FIX-44)", () => {
    expect(rule(".tpw__fields :is(input, textarea, select, button, [tabindex])")).toMatch(/scroll-margin-bottom:\s*120px/);
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

  it("«Título» takes the whole row and the approver's name its own line (FIX-44)", () => {
    expect(rule(".tpw-ident")).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\);/);
    expect(rule(".tpw-facts dt.tpw-facts__full")).toMatch(/grid-column:\s*1 \/ -1/);
  });

  it("«Aprobado por» wraps instead of being cut", () => {
    const wrap = rule(".tpw-facts dd.tpw-facts__wrap");
    expect(wrap).toMatch(/overflow-wrap:\s*anywhere/);
    expect(wrap).toMatch(/white-space:\s*normal/);
  });

  it("the «Propios» field keeps room for its whole placeholder and «Añadir» wraps under it", () => {
    expect(rule(".tpw-cols .tpw-cols__add")).toMatch(/flex-wrap:\s*wrap/);
    expect(rule(".tpw-cols .tpw-cols__add .tpw-input")).toMatch(/flex:\s*1 1 12em/);
  });
});
