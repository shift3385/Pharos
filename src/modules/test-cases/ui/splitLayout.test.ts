import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// jsdom does no layout: the rule itself is checked (FIX-41). In split view
// the Gherkin pane is as tall as its text and sticks beside the form; it is
// never stretched to the form's height, which left an empty white column
// beside the lower half of a long case.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "TestCase.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? null : css.slice(at, css.indexOf("}", at));
};

describe("split view layout (FIX-41)", () => {
  it("the Gherkin pane sticks and keeps its own height", () => {
    const pane = rule(".tc-split__pane--gherkin");
    expect(pane).toMatch(/position: sticky/);
    expect(pane).toMatch(/align-self: start/);
    expect(pane).toMatch(/overflow-y: auto/);
    expect(rule(".tc-split .tc-gherkin")).toBeNull();
    expect(rule(".tc-split .tc-gherkin__editor")).toBeNull();
  });
});
