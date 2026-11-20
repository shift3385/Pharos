// FIX-46: a disabled button stays readable. The pale orange of a faded primary
// button («Aprobar versión 1.0», «Pensando…») could not be read in the manual.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "buttons.css"), "utf8");

describe("disabled buttons", () => {
  const at = css.indexOf("button.ui-btn:is(:disabled");
  const rule = at < 0 ? "" : css.slice(at, css.indexOf("}", at));

  it("are neutral and opaque, never faded", () => {
    expect(rule).toMatch(/opacity:\s*1;/);
    expect(rule).toMatch(/color:\s*var\(--color-text-secondary\);/);
    expect(rule).toMatch(/background:\s*var\(--color-surface-2\);/);
    expect(css).not.toMatch(/\.ui-btn:disabled[^{]*\{[^}]*opacity:\s*0\./);
  });

  it("cover the modules' primary buttons too", () => {
    for (const cls of [".cd__confirm", ".header-action[data-primary]", ".auth-form__submit", ".recovery-codes__done", ".adm-btn--primary"]) {
      expect(rule).toContain(cls);
    }
  });
});
