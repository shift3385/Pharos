// FIX-45: layout rules of the runs screens that jsdom cannot measure, pinned
// from the CSS (as the other layout tests do).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), "utf8");
const blockOf = (css: string) => (selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
};
const runs = blockOf(read("Runs.css"));
const findings = blockOf(read("Findings.css"));
const execution = blockOf(read("Execution.css"));

describe("«Importar informe» fits any window (FIX-45)", () => {
  it("scrolls its form, not the dialog, so the buttons stay in view", () => {
    expect(runs(".rn-import")).toMatch(/overflow:\s*hidden;/);
    const body = runs(".rn-modal__body");
    expect(body).toMatch(/overflow-y:\s*auto;/);
    expect(body).toMatch(/min-height:\s*0;/);
    expect(body).toMatch(/flex:\s*1 1 auto;/);
    expect(runs(".rn-import .cd__actions")).toMatch(/flex:\s*none;/);
  });
});

describe("runs surfaces and wrapping (FIX-45)", () => {
  it("keeps a build or key whole", () => {
    expect(runs(".rn-nowrap")).toMatch(/white-space:\s*nowrap;/);
  });

  it("draws the thresholds line and the tray's «?» on a surface", () => {
    expect(findings(".fd-kpi")).toMatch(/background:\s*var\(--color-surface-1\);/);
    expect(runs(".rn-tray__bar .infotip")).toMatch(/background:\s*var\(--color-surface-1\);/);
  });

  it("makes the filters compact beside the executor", () => {
    expect(execution('.ex-run[data-split="true"] .ex-items .chips__chip')).toMatch(/padding:\s*0 7px;/);
  });
});
