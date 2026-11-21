// FIX-45: layout rules of the runs screens that jsdom cannot measure, pinned
// from the CSS (as the other layout tests do).
import { readFileSync, readdirSync } from "node:fs";
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

describe("«Informe de estado» never covers its last line (FIX-49)", () => {
  it("scrolls its body, which ends above the buttons, not the dialog", () => {
    const report = blockOf(read("../report/StatusReport.css"));
    expect(report(".sr-modal")).toMatch(/overflow:\s*hidden;/);
    const body = report(".sr-scroll");
    expect(body).toMatch(/overflow-y:\s*auto;/);
    expect(body).toMatch(/min-height:\s*0;/);
    expect(report(".sr-actions")).toMatch(/flex:\s*none;/);
    expect(report(".sr-actions")).not.toMatch(/position:\s*sticky/);
  });

  it("every dialog of class `sr-modal` has the scrolling body (FIX-51)", () => {
    // FIX-49 changed the shared class but wrapped only one of its two users.
    const srcRoot = join(here, "../../..");
    const users = (readdirSync(srcRoot, { recursive: true }) as string[])
      .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
      .filter((f) => readFileSync(join(srcRoot, f), "utf8").includes('"cd sr-modal"'));
    expect(users.length).toBeGreaterThanOrEqual(2);
    for (const file of users) {
      const src = readFileSync(join(srcRoot, file), "utf8");
      const scroll = src.indexOf('className="sr-scroll"');
      expect(scroll, file).toBeGreaterThan(src.indexOf('className="sr"'));
      expect(src.indexOf("sr-actions"), file).toBeGreaterThan(scroll);
    }
  });
});

describe("runs surfaces and wrapping (FIX-45)", () => {
  it("keeps a build or key whole", () => {
    expect(runs(".rn-nowrap")).toMatch(/white-space:\s*nowrap;/);
  });

  it("draws the thresholds line and the tray's «?» on a surface", () => {
    // FIX-47: the thresholds line is the shared `.ui-card`, kept one line of text.
    expect(read("MetricsPanel.tsx")).toContain('className="ui-card fd-kpi"');
    expect(findings(".fd-kpi")).toMatch(/display:\s*block;/);
    expect(findings(".fd-kpi")).not.toMatch(/background:/);
    // FIX-51: the «Checks» heading too, not text on the photo.
    expect(read("MetricsPanel.tsx")).toContain('className="ui-card fd-sub"');
    expect(runs(".rn-tray__bar .infotip")).toMatch(/background:\s*var\(--color-surface-1\);/);
  });

  it("makes the filters compact beside the executor", () => {
    expect(execution('.ex-run[data-split="true"] .ex-items .chips__chip')).toMatch(/padding:\s*0 7px;/);
  });
});
