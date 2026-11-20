// FIX-46: every settings card and row opened with a standing help paragraph
// (Evidencias: five of them). The help now lives behind «?», still in the DOM
// for the control's aria-describedby; a short state can stay inline.
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@test/utils";
import { SettingsRow, SettingsSection } from "./SettingsSection";

describe("SettingsSection and SettingsRow", () => {
  it("put the card's and the row's help behind «?»", () => {
    renderWithProviders(
      <SettingsSection title="Almacén" desc="Los adjuntos se guardan cifrados.">
        <SettingsRow label="Ocupa" hint="Solo los archivos de este equipo." hintId="row-hint">
          <span>1 KB</span>
        </SettingsRow>
        <SettingsRow label="Capturas" hint="Ahora: 45 días" hintInline>
          <span>45</span>
        </SettingsRow>
      </SettingsSection>,
    );
    expect(document.querySelector("p.adm-hint")).toBeNull();
    expect(document.getElementById("row-hint")).toHaveTextContent("Solo los archivos de este equipo.");
    expect(document.getElementById("row-hint")).not.toHaveClass("adm-hint");
    expect(screen.getByRole("region", { name: "Almacén" })).toHaveAccessibleDescription("Los adjuntos se guardan cifrados.");
    expect(screen.getByText("Ahora: 45 días")).toHaveClass("adm-hint");
  });
});
