import { useState } from "react";
import { describe, expect, it } from "vitest";
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
    await expectNoAxeViolations();
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
  it("follows the tabs pattern: one Tab stop, arrows select and skip disabled tabs", async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);
    const list = screen.getByRole("tablist", { name: "Secciones del Inicio" });
    expect(list).toBeInTheDocument();
    const summary = screen.getByRole("tab", { name: /Resumen/ });
    const tests = screen.getByRole("tab", { name: /Pruebas/ });
    expect(summary).toHaveAttribute("aria-selected", "true");
    expect(summary).toHaveAccessibleName("Resumen 2 · 2 criterios no se cumplen");
    expect(screen.getByRole("tabpanel", { name: /Resumen/ })).toHaveTextContent("Panel summary");

    summary.focus();
    await user.keyboard("{ArrowRight}");
    expect(tests).toHaveFocus();
    expect(tests).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel tests");
    await user.keyboard("{ArrowRight}");
    expect(summary).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Bloqueadas" })).toHaveAttribute("title", "Necesita ejecuciones");
    await expectNoAxeViolations();
  });

  it("hides empty bubbles and links panels by id prefix", () => {
    render(
      <>
        <Tabs
          label="Estado"
          variant="underline"
          idPrefix="up-"
          value="a"
          onChange={() => {}}
          items={[{ id: "a", label: "No ejecutadas", badge: { count: 0, tone: "muted" } }]}
        />
        <div {...tabPanelProps("a", "up-")}>lista</div>
      </>,
    );
    expect(screen.getByRole("tab", { name: "No ejecutadas" })).toHaveAttribute("aria-controls", "up-tabpanel-a");
    expect(screen.getByRole("tabpanel", { name: "No ejecutadas" })).toHaveTextContent("lista");
  });
});
