// FIX-49: layout rules of the sign-in screens that jsdom cannot measure, read
// from the stylesheets.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string) =>
  readFileSync(join(here, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rules = (css: string, selector: string) =>
  [
    ...css.matchAll(
      new RegExp(
        `(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`,
        "g",
      ),
    ),
  ]
    .map((m) => m[1])
    .join("\n");

describe("sign-in screens (FIX-49)", () => {
  it("a link in a sentence is always underlined, with or without the pointer on it", () => {
    const css = read("AuthScreen.css");
    expect(rules(css, ".auth-form__link")).toMatch(
      /text-decoration:\s*underline/,
    );
    expect(rules(css, ".auth-form__link:hover")).toBe("");
  });

  it("«He guardado los códigos» uses the app's 18 px navy checkbox, not the browser's", () => {
    const box = rules(
      read("RecoveryCodesPanel.css"),
      ".recovery-codes__check input",
    );
    expect(box).toMatch(/width:\s*18px/);
    expect(box).toMatch(/height:\s*18px/);
    expect(box).toMatch(/accent-color:\s*var\(--color-navy-500\)/);
  });
});
