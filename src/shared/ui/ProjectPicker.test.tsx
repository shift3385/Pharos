import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { setViewportWidth } from "@test/viewport";
import { Dialog } from "./Dialog";
import { ProjectSelect, type ProjectChoice } from "./ProjectPicker";

const PROJECTS: ProjectChoice[] = [
  { id: "bm", name: "Banca Móvil", caseIdPrefix: "BM_" },
  { id: "p1", name: "Proyecto 1", caseIdPrefix: "P_" },
  { id: "x", name: "Sin prefijo" },
];

function Harness({ onChange }: { onChange?: (id: string) => void }) {
  const [value, setValue] = useState("bm");
  return (
    <ProjectSelect
      label="Proyecto"
      projects={PROJECTS}
      value={value}
      onChange={(id) => {
        setValue(id);
        onChange?.(id);
      }}
      testId="picker"
    />
  );
}

const items = () => screen.getAllByRole("menuitemradio");

beforeEach(async () => {
  await i18n.changeLanguage("es");
  setViewportWidth(1280);
});

describe("ProjectSelect", () => {
  it("shows the chosen project with its prefix, and names both", () => {
    renderWithProviders(<Harness />);
    const trigger = screen.getByRole("button", { name: "Proyecto: Banca Móvil" });
    expect(trigger).toHaveTextContent("BM_Banca Móvil");
  });

  it("opens in the search field, with the chosen one checked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByTestId("picker"));
    expect(screen.getByRole("searchbox", { name: "Buscar proyecto…" })).toHaveFocus();
    expect(items()).toHaveLength(3);
    expect(screen.getByRole("menuitemradio", { name: /Banca Móvil/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("Ver todos los proyectos")).not.toBeInTheDocument();
  });

  it("searches by name or prefix, says when nothing matches and starts over on reopening", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByTestId("picker"));
    const search = screen.getByRole("searchbox");
    await user.type(search, "móvil");
    expect(items()).toHaveLength(1);
    await user.clear(search);
    await user.type(search, "p_");
    expect(screen.getByRole("menuitemradio")).toHaveTextContent("Proyecto 1");
    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.getByText("Ningún proyecto coincide.")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("picker"));
    expect(items()).toHaveLength(3);
  });

  it("choosing changes the value, closes and returns the focus", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness onChange={onChange} />);
    await user.click(screen.getByTestId("picker"));
    await user.click(screen.getByRole("menuitemradio", { name: /Proyecto 1/ }));
    expect(onChange).toHaveBeenCalledWith("p1");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Proyecto: Proyecto 1" });
    expect(trigger).toHaveFocus();
  });

  it("works inside a dialog: searching keeps the focus and Escape closes only the menu", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Dialog labelledBy="t" onClose={() => {}}>
        <h3 id="t">Título</h3>
        <Harness />
      </Dialog>,
    );
    await user.click(screen.getByTestId("picker"));
    const search = screen.getByRole("searchbox");
    await user.type(search, "pro");
    expect(search).toHaveFocus();
    expect(search).toHaveValue("pro");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("is a bottom sheet on mobile", async () => {
    setViewportWidth(390);
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByTestId("picker"));
    expect(screen.getByRole("dialog", { name: "Proyecto" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Proyecto 1/, pressed: false }));
    expect(screen.getByRole("button", { name: "Proyecto: Proyecto 1" })).toBeInTheDocument();
  });

  it.each([390, 1280])("passes axe open at %i px", async (width) => {
    setViewportWidth(width);
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByTestId("picker"));
    await expectNoAxeViolations();
  });
});
