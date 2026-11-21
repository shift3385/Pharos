// FIX-49: layout rules of Integraciones that jsdom cannot measure, read from
// the stylesheet.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "integrations.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
};

describe("Integraciones layout (FIX-49)", () => {
  it("a permission's chip stays beside its label, which wraps in its own column", () => {
    expect(rule(".int-scope")).not.toMatch(/flex-wrap:\s*wrap/);
    expect(rule(".int-scope > :is(input, .int-chip)")).toMatch(/flex:\s*none/);
  });

  it("the token tables fit their card: compact cells, stacked scopes and buttons (FIX-51)", () => {
    expect(rule(".int-table")).toMatch(/font-size:\s*var\(--fs-caption\)/);
    expect(rule(".int-table th,\n.int-table td")).toMatch(/padding:\s*8px/);
    expect(rule(".int-scopes-cell .int-chip")).toMatch(/display:\s*block/);
    expect(rule(".int-num.int-when")).toMatch(/white-space:\s*normal/);
    expect(rule(".int-actions-cell .int-actions")).toMatch(/flex-direction:\s*column/);
    // The table cell never takes the dialog's grid fieldset class again: a
    // grid `td` broke the table (FIX-51).
    const table = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "TokensTable.tsx"), "utf8");
    expect(table).not.toMatch(/<td className="int-scopes"/);
    expect(table).toContain('className="int-actions-cell"');
    expect(table).toContain('className="int-num int-when"');
  });

  it("an address or placeholder in a sentence is code, whole on one line", () => {
    const code = rule(".int-code");
    expect(code).toMatch(/white-space:\s*nowrap/);
    expect(code).toMatch(/font-family:\s*var\(--font-mono\)/);
  });
});
