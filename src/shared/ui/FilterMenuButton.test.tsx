import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setViewportWidth } from "@test/viewport";
import { i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { FilterMenuButton } from "./FilterMenuButton";

const OPTIONS = [
  { value: "critical", label: "Crítica", description: "Bloquea el pago o expone datos" },
  { value: "high", label: "Alta" },
];

function Harness({ disabled }: { disabled?: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return (
    <FilterMenuButton
      label="Prioridad"
      options={OPTIONS}
      selected={selected}
      onChange={setSelected}
      disabled={disabled}
      disabledReason="Próximamente"
    />
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("es");
});

describe("FilterMenuButton", () => {
  it("checks several options without closing and counts them", async () => {
    setViewportWidth(1440);
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Prioridad" }));
    const menu = screen.getByRole("menu", { name: "Prioridad" });
    const critical = within(menu).getByRole("menuitemcheckbox", { name: "Crítica" });
    expect(critical).toHaveAccessibleDescription("Bloquea el pago o expone datos");
    await userEvent.click(critical);
    await userEvent.click(within(menu).getByRole("menuitemcheckbox", { name: "Alta" }));
    expect(critical).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menu", { name: "Prioridad" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Prioridad\s*:\s*2$/ })).toBeInTheDocument();
    await expectNoAxeViolations();
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Limpiar filtro" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prioridad" })).toBeInTheDocument();
  });

  it("is a bottom sheet on mobile", async () => {
    setViewportWidth(390);
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Prioridad" }));
    const sheet = screen.getByRole("dialog", { name: "Prioridad" });
    const critical = within(sheet).getByRole("button", { name: "Crítica" });
    await userEvent.click(critical);
    expect(critical).toHaveAttribute("aria-pressed", "true");
  });

  it("disabled, it stays focusable, explains why and does not open", async () => {
    setViewportWidth(1440);
    render(<Harness disabled />);
    const button = screen.getByRole("button", { name: "Prioridad" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("title", "Próximamente");
    await userEvent.click(button);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
