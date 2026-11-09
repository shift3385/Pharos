import { describe, expect, it } from "vitest";
import { overlappingProject, prefixCore, prefixIssue, prefixesOverlap, suggestPrefix } from "./prefix";

const p = (id: string, caseIdPrefix: string, name = `Proyecto ${id}`) => ({ id, name, caseIdPrefix });

describe("case-key prefixes (NC-030)", () => {
  it("compares prefixes without their separator and ignoring case", () => {
    expect(prefixCore("ph-")).toBe("PH");
    expect(prefixCore("ATS_")).toBe("ATS");
    expect(prefixesOverlap("PH-", "ph_")).toBe(true);
  });

  it("overlap: equal, or one starts with the other (PH_ and PHA_)", () => {
    expect(prefixesOverlap("PH_", "PHA_")).toBe(true);
    expect(prefixesOverlap("PHA-", "PH-")).toBe(true);
    expect(prefixesOverlap("API-", "AP-")).toBe(true);
    expect(prefixesOverlap("PH-", "API-")).toBe(false);
    expect(prefixesOverlap("APP-", "API-")).toBe(false);
    expect(prefixesOverlap("", "PH-")).toBe(false);
  });

  it("names the other project, never the project itself", () => {
    const all = [p("1", "PH-", "Pharos"), p("2", "API-")];
    expect(overlappingProject("PHA-", all)?.name).toBe("Pharos");
    expect(overlappingProject("PH-", all, "1")).toBeUndefined();
    expect(prefixIssue("PHA-", all)).toMatchObject({ code: "projects.prefix.overlap", params: { name: "Pharos", prefix: "PH-" } });
    expect(prefixIssue(" - ", all)).toMatchObject({ code: "projects.prefix.required" });
    expect(prefixIssue("QA-", all)).toBeNull();
  });

  it("suggests a free prefix from the name", () => {
    expect(suggestPrefix("Pharos", [])).toBe("PHA-");
    expect(suggestPrefix("Árbol de decisión", [])).toBe("ARB-");
    // Taken: the initials of the words, without «de».
    expect(suggestPrefix("API de sincronización", [p("1", "API_")])).toBe("AS-");
    // «PHA» and «PH» overlap «PH-»: «PHAR» too; then the fallbacks.
    expect(suggestPrefix("Pharos", [p("1", "PH-")])).toBe("PAA-");
    const s = suggestPrefix("Pharos", [p("1", "PHA-"), p("2", "PAA-")]);
    expect(s).toBe("PAB-");
    // No letters: it starts from «P».
    expect(suggestPrefix("—", [])).toBe("PAA-");
  });

  it("every suggestion overlaps none of the projects it was given", () => {
    const all = [p("1", "PH-"), p("2", "PHA-"), p("3", "PA-"), p("4", "P1-")];
    const s = suggestPrefix("Pharos", all);
    expect(all.some((x) => prefixesOverlap(s, x.caseIdPrefix))).toBe(false);
  });
});
