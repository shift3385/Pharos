// FIX-39: as server administrator (one more tab, «Usuarios») at 1440 px the
// Administración strip cut off «Diagnóstico» behind a hidden scrollbar. The
// strip wraps now; only the phone layout scrolls sideways. jsdom has no
// layout, so this pins the rules.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "Admin.css"), "utf8");
const block = (selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
};

describe("Administración tab strip (FIX-39)", () => {
  it("wraps its groups and their tabs instead of hiding them", () => {
    const strip = block(".adm-tabs");
    expect(strip).toMatch(/flex-wrap:\s*wrap;/);
    expect(strip).not.toMatch(/overflow-x:\s*auto/);
    expect(strip).not.toMatch(/scrollbar-width:\s*none/);
    expect(block(".adm-tabs__row")).toMatch(/flex-wrap:\s*wrap;/);
  });

  it("scrolls sideways only on the phone", () => {
    const phone = block('[data-viewport="mobile"] .adm-tabs');
    expect(phone).toMatch(/flex-wrap:\s*nowrap;/);
    expect(phone).toMatch(/overflow-x:\s*auto;/);
  });
});
