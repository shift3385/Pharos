import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders, i18n } from "@test/utils";
import { CaseChanges } from "./CaseChanges";

// What the reviewer reads (CAS-02): each change named as what it is, with the
// kind agreeing with the field (FIX-41).
describe("CaseChanges", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });

  it("names a checklist item as a check and agrees in gender and number", () => {
    renderWithProviders(
      <CaseChanges
        changes={[
          { field: "checks", kind: "added", position: 4, after: "Revisar el log" },
          { field: "steps", kind: "added", position: 2, after: "Pulsar" },
          { field: "preconditions", kind: "removed", position: 1, before: "Sesión" },
          { field: "notes", kind: "changed", before: "a", after: "b" },
        ]}
      />,
    );
    const labels = [...document.querySelectorAll(".tc-diff__label")].map((e) => e.textContent);
    expect(labels).toEqual(["Comprobación 4 añadida", "Paso 2 añadido", "Precondición 1 quitada", "Notas cambiadas"]);
    expect(screen.queryByText(/Paso 4/)).toBeNull();
  });

  it("English needs no agreement", async () => {
    await i18n.changeLanguage("en");
    renderWithProviders(<CaseChanges changes={[{ field: "checks", kind: "added", position: 4, after: "Check the log" }]} />);
    expect(document.querySelector(".tc-diff__label")?.textContent).toBe("Check 4 added");
  });
});
