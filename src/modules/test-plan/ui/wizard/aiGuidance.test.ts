// IA-15: each assisted field asks for what its section is for.
import { describe, expect, it } from "vitest";
import i18n from "@shared/i18n";
import { ASSIST_INSTRUCTION } from "./aiGuidance";
import { conclusionBrief, defaults } from "./formState";

const form = defaults(i18n.getFixedT("es"));

describe("what the AI is asked to write", () => {
  it("a conclusion is a judgment against objectives and exit criteria, never invented results", () => {
    const text = ASSIST_INSTRUCTION.conclusion;
    expect(text).toContain("judgment");
    expect(text).toContain("exit criteria");
    expect(text).toContain("risks remain open");
    expect(text).toContain("Report results only if the context gives them");
  });

  it("the purpose does not drift into results or conclusions", () => {
    expect(ASSIST_INSTRUCTION.purpose).toContain("test objectives");
    expect(ASSIST_INSTRUCTION.purpose).toContain("Do not describe results");
  });

  it("defect management asks for the workflow and the classification rules", () => {
    expect(ASSIST_INSTRUCTION.defectManagement).toContain("from discovery to closure");
    expect(ASSIST_INSTRUCTION.defectManagement).toContain("classification rules");
  });

  it("the conclusion receives the risks and the exit criteria of the plan", () => {
    const brief = conclusionBrief({
      ...form,
      risks: [{ risk: "Datos reales en pruebas", mitigation: "" }],
      closureCriteria: [
        { criterion: "Cobertura de requisitos", metric: "≥ 90 %" },
        { criterion: "Sin métrica", metric: "" },
        { criterion: "", metric: "" },
      ],
    });
    expect(brief).toContain("Risks: Datos reales en pruebas");
    expect(brief).toContain("Exit criteria: Cobertura de requisitos (≥ 90 %); Sin métrica");
  });
});
