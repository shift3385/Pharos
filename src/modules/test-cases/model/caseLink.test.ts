import { describe, expect, it } from "vitest";
import { caseLink } from "./caseLink";

describe("caseLink", () => {
  it("is the Casos section of the project with the case open", () => {
    expect(caseLink("p1", "c-42")).toBe("/projects/p1/cases?case=c-42");
  });

  it("encodes both ids", () => {
    expect(caseLink("p 1", "a/b&c")).toBe("/projects/p%201/cases?case=a%2Fb%26c");
  });
});
