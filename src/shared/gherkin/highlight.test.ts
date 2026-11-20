import { describe, expect, it } from "vitest";
import { highlightGherkin } from "./highlight";

const keywords = (html: string) =>
  [...html.matchAll(/<span class="token atrule">([^<]*)<\/span>/g)].map((m) => m[1]);

describe("highlightGherkin (FIX-44)", () => {
  it("marks only the step keyword at the start of the line, never a word of the step text", () => {
    const html = highlightGherkin("    Then Se abre «Inicio»\n    And Y luego De nuevo\n    When Abrir Pharos");
    expect(keywords(html)).toEqual(["Then", "And", "When"]);
  });

  it("still marks every English step keyword and the asterisk", () => {
    const html = highlightGherkin("Given a\nWhen b\nThen c\nAnd d\nBut e\n* f");
    expect(keywords(html)).toEqual(["Given", "When", "Then", "And", "But", "*"]);
  });
});
