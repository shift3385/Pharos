import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import { renderWithProviders } from "@test/utils";
import { SortMenu, type SortDirection } from "./SortMenu";

type Key = "access" | "name" | "defects";

function Harness({ onChange = () => {} }: { onChange?: (v: Key, d: SortDirection) => void }) {
  const [value, setValue] = useState<Key>("access");
  const [dir, setDir] = useState<SortDirection>("desc");
  return (
    <SortMenu<Key>
      options={[
        { value: "access", label: "Último acceso" },
        { value: "name", label: "Nombre (A–Z)" },
        { value: "defects", label: "Defectos abiertos", disabled: true, title: "Próximamente" },
      ]}
      value={value}
      direction={dir}
      onChange={(v, d) => {
        setValue(v);
        setDir(d);
        onChange(v, d);
      }}
    />
  );
}

describe("SortMenu", () => {
  it("shows the current order and lists the keys with the current one checked", async () => {
    setViewportWidth(1440);
    renderWithProviders(<Harness />);
    const trigger = screen.getByRole("button", { name: "Orden: Último acceso" });
    await userEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "Ordenar por" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Último acceso" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Descendente" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Defectos abiertos" })).toBeDisabled();
    await expectNoAxeViolations();
  });

  it("changes the key keeping the direction, and the direction keeping the key", async () => {
    setViewportWidth(1440);
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Orden/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Nombre (A–Z)" }));
    expect(onChange).toHaveBeenLastCalledWith("name", "desc");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Orden: Nombre (A–Z)" }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Ascendente" }));
    expect(onChange).toHaveBeenLastCalledWith("name", "asc");
  });

  it("opens as a bottom sheet on mobile", async () => {
    setViewportWidth(390);
    renderWithProviders(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: /Orden/ }));
    expect(screen.getByRole("dialog", { name: "Ordenar por" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Último acceso" })).toHaveAttribute("aria-pressed", "true");
    await expectNoAxeViolations();
  });
});
