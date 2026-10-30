import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Moon, Sun } from "lucide-react";
import { expectNoAxeViolations } from "@test/axe";
import { Switch } from "./Switch";
import { SegmentedControl } from "./SegmentedControl";
import { TabPanel, Tabs } from "./Tabs";
import { tabPanelProps } from "./tabPanel";

function SwitchHarness({ disabled }: { disabled?: boolean }) {
  const [on, setOn] = useState(false);
  return (
    <Switch
      checked={on}
      onChange={setOn}
      label="Comparar con el periodo anterior"
      disabled={disabled}
      title={disabled ? "Necesita ejecuciones" : undefined}
    />
  );
}

describe("Switch", () => {
  it("is a named switch that toggles with click and Space", async () => {
    const user = userEvent.setup();
    render(<SwitchHarness />);
    const sw = screen.getByRole("switch", { name: "Comparar con el periodo anterior" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await user.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    await user.keyboard(" ");
    expect(sw).toHaveAttribute("aria-checked", "false");
    // Clicking the label toggles it too.
    await user.click(screen.getByText("Comparar con el periodo anterior"));
    expect(sw).toHaveAttribute("aria-checked", "true");
    await expectNoAxeViolations();
  });

  it("disabled keeps its reason and does not toggle", async () => {
    const user = userEvent.setup();
    render(<SwitchHarness disabled />);
    const sw = screen.getByRole("switch");
    expect(sw).toBeDisabled();
    expect(sw.closest(".switch")).toHaveAttribute("title", "Necesita ejecuciones");
    await user.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "false");
    await expectNoAxeViolations();
  });
});

function ThemeHarness() {
  const [v, setV] = useState<"light" | "dark" | "system">("light");
  return (
    <SegmentedControl
      label="Tema"
      value={v}
      onChange={setV}
      options={[
        { value: "light", label: "Claro", icon: Sun },
        { value: "dark", label: "Oscuro", icon: Moon },
        { value: "system", label: "Según el sistema", disabled: true, title: "Próximamente" },
      ]}
    />
  );
}

describe("SegmentedControl", () => {
  it("is a radiogroup with one Tab stop; arrows move, select and skip disabled", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">antes</button>
        <ThemeHarness />
      </>,
    );
    expect(screen.getByRole("radiogroup", { name: "Tema" })).toBeInTheDocument();
    const light = screen.getByRole("radio", { name: "Claro" });
    const dark = screen.getByRole("radio", { name: "Oscuro" });
    expect(light).toHaveAttribute("aria-checked", "true");
    expect(dark).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("radio", { name: "Según el sistema" })).toBeDisabled();

    await user.click(screen.getByText("antes"));
    await user.tab();
    expect(light).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(dark).toHaveFocus();
    expect(dark).toHaveAttribute("aria-checked", "true");
    // The disabled option is skipped: Right wraps back to «Claro».
    await user.keyboard("{ArrowRight}");
    expect(light).toHaveFocus();
    await user.keyboard("{End}");
    expect(dark).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{Home}");
    expect(light).toHaveFocus();
    expect(light).toHaveAttribute("aria-checked", "true");
    // The disabled option's reason is in the accessibility tree, not only a tooltip.
    expect(screen.getByRole("radio", { name: "Según el sistema" })).toHaveAccessibleDescription("Próximamente");
    await expectNoAxeViolations();
  });

  it("with a value that is not an enabled option, Tab enters on the first one and arrows start there", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <button type="button">antes</button>
        <SegmentedControl
          label="Vista"
          value="split"
          onChange={onChange}
          options={[
            { value: "editor", label: "Editor" },
            { value: "gherkin", label: "Gherkin" },
            { value: "split", label: "Dividida", disabled: true, title: "Solo en escritorio" },
          ]}
        />
      </>,
    );
    await user.click(screen.getByText("antes"));
    await user.tab();
    expect(screen.getByRole("radio", { name: "Editor" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("gherkin");
  });
});

function TabsHarness() {
  const [tab, setTab] = useState("summary");
  return (
    <>
      <Tabs
        label="Secciones del Inicio"
        value={tab}
        onChange={setTab}
        items={[
          { id: "summary", label: "Resumen", badge: { count: 2, tone: "danger", title: "2 criterios no se cumplen" } },
          { id: "blocked", label: "Bloqueadas", disabled: true, title: "Necesita ejecuciones" },
          { id: "tests", label: "Pruebas", badge: { count: 174, tone: "navy", title: "174 pruebas pendientes" } },
        ]}
      />
      <TabPanel id={tab}>Panel {tab}</TabPanel>
    </>
  );
}

describe("Tabs", () => {
  it("follows the tabs pattern: one Tab stop; arrows reach disabled tabs but never select them", async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);
    expect(screen.getByRole("tablist", { name: "Secciones del Inicio" })).toBeInTheDocument();
    const summary = screen.getByRole("tab", { name: /Resumen/ });
    const blocked = screen.getByRole("tab", { name: "Bloqueadas" });
    const tests = screen.getByRole("tab", { name: /Pruebas/ });
    expect(summary).toHaveAttribute("aria-selected", "true");
    // The bubble is read once, through its title.
    expect(summary).toHaveAccessibleName("Resumen · 2 criterios no se cumplen");
    expect(screen.getByRole("tabpanel", { name: /Resumen/ })).toHaveTextContent("Panel summary");

    // The disabled tab stays focusable and keeps its reason as description.
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    expect(blocked).toHaveAccessibleDescription("Necesita ejecuciones");
    summary.focus();
    await user.keyboard("{ArrowRight}");
    expect(blocked).toHaveFocus();
    expect(summary).toHaveAttribute("aria-selected", "true");
    await user.click(blocked);
    expect(summary).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowRight}");
    expect(tests).toHaveFocus();
    expect(tests).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel tests");
    await user.keyboard("{Home}");
    expect(summary).toHaveFocus();
    expect(summary).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(tests).toHaveFocus();
    expect(tests).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowRight}");
    expect(summary).toHaveFocus();
    await expectNoAxeViolations();
  });

  it("keeps a Tab stop when the value names a disabled or missing tab", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const items = [
      { id: "a", label: "Uno" },
      { id: "b", label: "Dos", disabled: true, title: "No disponible" },
      { id: "c", label: "Tres" },
    ];
    const { rerender } = render(
      <>
        <button type="button">antes</button>
        <Tabs label="Grupo" value="b" onChange={onChange} items={items} />
      </>,
    );
    await user.click(screen.getByText("antes"));
    await user.tab();
    expect(screen.getByRole("tab", { name: "Uno" })).toHaveFocus();

    rerender(
      <>
        <button type="button">antes</button>
        <Tabs label="Grupo" value="zzz" onChange={onChange} items={items} />
      </>,
    );
    expect(screen.getByRole("tab", { name: "Uno" })).toHaveAttribute("tabindex", "0");
    // From the focused tab, not from the (missing) value: Left wraps to the last.
    screen.getByRole("tab", { name: "Uno" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Tres" })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("c");
  });

  it("underline tabs: prefixed ids and test ids, a counter read as «(N)», no axe issues", async () => {
    render(
      <>
        <Tabs
          label="Estado"
          variant="underline"
          idPrefix="up-"
          value="a"
          onChange={() => {}}
          items={[
            { id: "a", label: "No ejecutadas", badge: { count: 3, tone: "muted" } },
            { id: "b", label: "Re-test", badge: { count: 0, tone: "muted" }, disabled: true, title: "Próximamente" },
          ]}
        />
        <div {...tabPanelProps("a", "up-")}>lista</div>
      </>,
    );
    const tab = screen.getByTestId("tab-up-a");
    expect(tab).toHaveAccessibleName("No ejecutadas (3)");
    expect(tab).toHaveAttribute("aria-controls", "up-tabpanel-a");
    expect(screen.getByRole("tab", { name: "Re-test" })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel", { name: "No ejecutadas (3)" })).toHaveTextContent("lista");
    await expectNoAxeViolations();
  });
});
