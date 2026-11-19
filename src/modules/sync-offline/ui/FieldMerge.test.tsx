import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { FieldMerge } from "./FieldMerge";
import { keyLabel } from "./keyLabel";

// The field-level part of the conflict panel (SYNC-02, ADR-0051).

beforeEach(async () => {
  await i18n.changeLanguage("es");
});

describe("FieldMerge", () => {
  it("lists what was combined, asks only for the keys that collide, and applies the choices", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    renderWithProviders(
      <FieldMerge
        origins={{ title: "both", priority: "remote", "data.steps": "both" }}
        conflicts={[
          {
            key: "title",
            type: "scalar",
            base: "Login",
            local: "Login SSO",
            remote: "Inicio",
          },
          {
            key: "data.steps#S2",
            type: "idList",
            base: { id: "S2", text: "b" },
            local: { id: "S2", text: "b editado" },
            remote: null,
          },
        ]}
        busy={false}
        onApply={onApply}
      />,
    );
    expect(
      screen.getByText("Se combinó 1 campo sin preguntar"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Prioridad/)).toBeInTheDocument();
    const apply = screen.getByRole("button", { name: "Aplicar" });
    expect(apply).toBeDisabled();
    expect(screen.getByText("Faltan 2 campos por elegir")).toBeInTheDocument();
    await user.click(
      within(screen.getByTestId("merge-key-title")).getByRole("radio", {
        name: "Título: Mi versión (este equipo)",
      }),
    );
    await user.click(
      within(screen.getByTestId("merge-key-data.steps#S2")).getByRole("radio", {
        name: "Pasos · elemento: Versión del servidor",
      }),
    );
    expect(apply).toBeEnabled();
    await expectNoAxeViolations();
    await user.click(apply);
    expect(onApply).toHaveBeenCalledWith({
      title: "local",
      "data.steps#S2": "remote",
    });
  });

  it("names keys in words", () => {
    const t = i18n.t.bind(i18n) as (
      k: string,
      o?: Record<string, unknown>,
    ) => string;
    expect(keyLabel("data.steps@order", t)).toBe("Pasos · orden");
    expect(keyLabel("data.steps#S1.expected", t)).toBe(
      "Pasos · elemento · Resultado esperado",
    );
    expect(keyLabel("group:risk", t)).toBe("Riesgo");
  });
});
