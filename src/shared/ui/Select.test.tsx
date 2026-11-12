import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Flag } from "lucide-react";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import { FormField } from "./FormField";
import { Select, type SelectItems } from "./Select";

const OPTIONS: SelectItems = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media", icon: Flag, description: "Por defecto" },
  {
    label: "Urgentes",
    options: [
      { value: "high", label: "Alta" },
      { value: "blocked", label: "Bloqueante", disabled: true, reason: "Solo para defectos" },
      { value: "critical", label: "Crítica" },
    ],
  },
];

function Harness({
  initial = "medium",
  onChange = () => {},
  issue,
}: {
  initial?: string;
  onChange?: (v: string) => void;
  issue?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <FormField
        label="Prioridad"
        hint="Lo que urge"
        issue={issue ? { code: "required", severity: "error" } : null}
      >
        {(p) => (
          <Select
            {...p}
            value={value}
            onChange={(v) => {
              setValue(v);
              onChange(v);
            }}
            options={OPTIONS}
            data-testid="prio"
          />
        )}
      </FormField>
      <button type="button">Después</button>
    </>
  );
}

const combo = () => screen.getByRole("combobox", { name: "Prioridad" });

describe("Select (UX-30)", () => {
  it("is a named combobox that shows the value and opens a listbox with the ✓ on it", async () => {
    render(<Harness />);
    expect(combo()).toHaveTextContent("Media");
    expect(combo()).toHaveAttribute("aria-haspopup", "listbox");
    expect(combo()).toHaveAttribute("aria-expanded", "false");
    expect(combo()).toHaveAttribute("data-testid", "prio");
    await userEvent.click(combo());
    const list = screen.getByRole("listbox", { name: "Prioridad" });
    expect(combo()).toHaveAttribute("aria-expanded", "true");
    expect(combo()).toHaveAttribute("aria-controls", list.id);
    expect(within(list).getByRole("option", { name: "Media" })).toHaveAttribute("aria-selected", "true");
    expect(within(list).getByRole("option", { name: "Media" })).toHaveAccessibleDescription("Por defecto");
    expect(within(list).getByRole("group", { name: "Urgentes" })).toBeInTheDocument();
    // The focus stays on the combobox and the active option is the chosen one.
    expect(combo()).toHaveFocus();
    expect(combo()).toHaveAttribute("aria-activedescendant", within(list).getByRole("option", { name: "Media" }).id);
    await expectNoAxeViolations();
  });

  it("takes FormField's id, description and invalid state", async () => {
    render(<Harness issue />);
    expect(combo()).toHaveAccessibleDescription(expect.stringContaining("Lo que urge"));
    expect(combo()).toHaveAttribute("aria-invalid", "true");
    await expectNoAxeViolations();
  });

  it("picks with the mouse and calls onChange with the value", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(combo());
    await userEvent.click(screen.getByRole("option", { name: "Alta" }));
    expect(onChange).toHaveBeenCalledWith("high");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(combo()).toHaveTextContent("Alta");
    expect(combo()).toHaveAttribute("data-value", "high");
    expect(combo()).toHaveFocus();
  });

  it("a disabled option says why and can't be picked", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(combo());
    const blocked = screen.getByRole("option", { name: "Bloqueante" });
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    expect(blocked).toHaveAttribute("title", "Solo para defectos");
    expect(blocked).toHaveAccessibleDescription("Solo para defectos");
    await userEvent.click(blocked);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves with the arrows (skipping disabled ones), Home/End, and Enter picks", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    combo().focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    const activeName = () =>
      document
        .getElementById(combo().getAttribute("aria-activedescendant") ?? "")
        ?.querySelector(".menu__title:not(.menu__text--stack), .menu__text:not(.menu__text--stack)")?.textContent;
    expect(activeName()).toBe("Media");
    await userEvent.keyboard("{ArrowDown}");
    expect(activeName()).toBe("Alta");
    await userEvent.keyboard("{ArrowDown}");
    expect(activeName()).toBe("Crítica"); // «Bloqueante» is skipped
    await userEvent.keyboard("{Home}");
    expect(activeName()).toBe("Baja");
    await userEvent.keyboard("{End}");
    expect(activeName()).toBe("Crítica");
    await userEvent.keyboard("{ArrowUp}");
    expect(activeName()).toBe("Alta");
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("high");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(combo()).toHaveFocus();
  });

  it("typing a letter jumps to the option that starts with it (accents ignored)", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    combo().focus();
    await userEvent.keyboard("c");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(combo().getAttribute("aria-activedescendant")).toBe(screen.getByRole("option", { name: "Crítica" }).id);
    await userEvent.keyboard("{ArrowUp}b");
    // «Bloqueante» is disabled: «b» lands on «Baja».
    expect(combo().getAttribute("aria-activedescendant")).toBe(screen.getByRole("option", { name: "Baja" }).id);
    // Right after a letter a space belongs to the typed prefix; Intro picks.
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("low");
  });

  it("Escape closes without changing the value and the focus stays on the button", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(combo());
    await userEvent.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(combo()).toHaveFocus();
    expect(combo()).toHaveTextContent("Media");
  });

  it("Tab keeps the active option and moves on", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    combo().focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Tab}");
    expect(onChange).toHaveBeenCalledWith("high");
    expect(screen.getByRole("button", { name: "Después" })).toHaveFocus();
  });

  it("a <label htmlFor> names it and a value outside the options shows the placeholder", () => {
    render(
      <>
        <label htmlFor="s1">Ciclo</label>
        <Select id="s1" value="" placeholder="Elige un ciclo" onChange={() => {}} options={[{ value: "a", label: "A" }]} />
      </>,
    );
    const c = screen.getByRole("combobox", { name: "Ciclo" });
    expect(c).toHaveTextContent("Elige un ciclo");
  });

  it("on mobile opens a bottom sheet titled like its label, with the chosen option pressed", async () => {
    setViewportWidth(375);
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(combo()).toHaveAttribute("aria-haspopup", "dialog");
    await userEvent.click(combo());
    const sheet = screen.getByRole("dialog", { name: "Prioridad" });
    expect(within(sheet).getByRole("button", { name: "Media" })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByRole("button", { name: "Bloqueante" })).toBeDisabled();
    await expectNoAxeViolations();
    await userEvent.click(within(sheet).getByRole("button", { name: "Crítica" }));
    expect(onChange).toHaveBeenCalledWith("critical");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(combo()).toHaveTextContent("Crítica");
  });

  it("its chevron turns with aria-expanded: on open, and back on Esc, a click outside or a choice", async () => {
    render(<Harness />);
    // The chevron is the one base.css turns (button[aria-expanded] .lucide-chevron-down).
    expect(combo().querySelector("svg.lucide-chevron-down")).not.toBeNull();
    await userEvent.click(combo());
    expect(combo()).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    expect(combo()).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(combo());
    await userEvent.click(screen.getByRole("button", { name: "Después" }));
    expect(combo()).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(combo());
    await userEvent.click(screen.getByRole("option", { name: "Baja" }));
    expect(combo()).toHaveAttribute("aria-expanded", "false");
  });
});
