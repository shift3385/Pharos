import { describe, expect, it } from "vitest";
import { parseCsv, parsePriority, parseRequirementCsv } from "./requirementCsv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes and newlines inside cells", () => {
    const text = 'a,b\r\n"x, y","he said ""hi""\nagain"\n\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"\nagain'],
    ]);
  });

  it("auto-detects the semicolon delimiter (Excel es)", () => {
    expect(parseCsv(String.fromCharCode(0xfeff) + "id;título\nREQ-1;Login")).toEqual([
      ["id", "título"],
      ["REQ-1", "Login"],
    ]);
  });
});

describe("parsePriority", () => {
  it("maps es/en words to the 3-level scale", () => {
    expect(parsePriority("Alta")).toBe("high");
    expect(parsePriority("Critical")).toBe("high");
    expect(parsePriority("media")).toBe("medium");
    expect(parsePriority("Baja")).toBe("low");
    expect(parsePriority("??")).toBeUndefined();
  });
});

describe("parseRequirementCsv", () => {
  it("detects Spanish headers and maps every column", () => {
    const csv = [
      "ID;Título;Descripción;Prioridad",
      "REQ-014;Inicio de sesión;El usuario entra con email;Alta",
      ";Recuperar contraseña;;Baja",
    ].join("\n");
    const result = parseRequirementCsv(csv);
    expect(result.columns).toEqual({
      requirementKey: "ID",
      title: "Título",
      description: "Descripción",
      priority: "Prioridad",
    });
    expect(result.rows).toEqual([
      {
        requirementKey: "REQ-014",
        title: "Inicio de sesión",
        description: "El usuario entra con email",
        priority: "high",
      },
      { requirementKey: undefined, title: "Recuperar contraseña", description: undefined, priority: "low" },
    ]);
    expect(result.issues).toEqual([]);
  });

  it("uses the description as title when there is no title column (template headers)", () => {
    const csv = "REQUIREMENT ID,REQUIREMENT DESCRIPTION,PRIORITY\nREQ-001,User can log in,High";
    const result = parseRequirementCsv(csv);
    expect(result.columns.title).toBe("REQUIREMENT DESCRIPTION");
    expect(result.rows[0]).toMatchObject({ requirementKey: "REQ-001", title: "User can log in", priority: "high" });
  });

  it("reports file line numbers, skipping fully blank lines silently", () => {
    // Line 3 is blank (skipped), line 4 has a key but no title.
    const csv = "key,title\nREQ-1,A\n,\nREQ-9,\nREQ 2,B\nREQ-1,C";
    const result = parseRequirementCsv(csv);
    expect(result.rows.map((r) => r.title)).toEqual(["A"]);
    expect(result.issues).toEqual([
      { line: 4, reason: "noTitle" },
      { line: 5, reason: "invalidKey", value: "REQ 2" },
      { line: 6, reason: "duplicateKey", value: "REQ-1" },
    ]);
  });

  it("keeps counting lines across newlines inside quoted cells", () => {
    const csv = 'title,key\n"multi\nline",\n,\nB,REQ 1';
    const result = parseRequirementCsv(csv);
    expect(result.rows.map((r) => r.title)).toEqual(["multi\nline"]);
    expect(result.issues).toEqual([{ line: 5, reason: "invalidKey", value: "REQ 1" }]);
  });
});
