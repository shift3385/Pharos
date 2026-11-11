// IA-14: exit criteria should answer to this plan's risks, so the AI receives them.
import { describe, expect, it } from "vitest";
import i18n from "@shared/i18n";
import { closureBrief, defaults } from "./formState";

const form = defaults(i18n.getFixedT("es"));

describe("the context of the suggested exit criteria", () => {
  it("adds the written risks to the plan's brief", () => {
    const brief = closureBrief({
      ...form,
      title: "Banca Móvil",
      risks: [
        { risk: " Datos reales en pruebas ", mitigation: "Datos sintéticos" },
        { risk: "", mitigation: "Sin riesgo escrito" },
        { risk: "Retraso en la entrega", mitigation: "" },
      ],
    });
    expect(brief).toContain("Title: Banca Móvil");
    expect(brief).toContain("Risks: Datos reales en pruebas; Retraso en la entrega");
    expect(brief).not.toContain("Sin riesgo escrito");
  });

  it("says nothing about risks when there are none", () => {
    expect(closureBrief({ ...form, risks: [] })).not.toContain("Risks:");
  });
});
