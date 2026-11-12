import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import { FormField } from "./FormField";
import { DatePicker } from "./DatePicker";

function Harness({
  initial = "",
  onChange = () => {},
  min,
  clearable,
  issue,
}: {
  initial?: string;
  onChange?: (v: string) => void;
  min?: string;
  clearable?: boolean;
  issue?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <FormField
        id="due"
        label="Fecha"
        hint="La del documento"
        issue={issue ? { code: "required", severity: "error" } : null}
      >
        {(p) => (
          <DatePicker
            {...p}
            value={value}
            min={min}
            clearable={clearable}
            onChange={(v) => {
              setValue(v);
              onChange(v);
            }}
          />
        )}
      </FormField>
      <output data-testid="value">{value}</output>
    </>
  );
}

const field = () => screen.getByRole("textbox", { name: "Fecha" });
const button = () => screen.getByRole("button", { name: /Abrir calendario|Cambiar fecha/ });
const dialog = () => screen.getByRole("dialog");
const cell = (iso: string) => document.querySelector<HTMLElement>(`[data-day="${iso}"]`)!;
const value = () => screen.getByTestId("value").textContent;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 11, 10));
  await i18n.changeLanguage("es");
  setViewportWidth(1440);
});
afterEach(() => vi.useRealTimers());

describe("DatePicker (UX-36)", () => {
  it("is a text field, labelled and described by FormField, that shows dd/mm/aaaa and keeps ISO", async () => {
    render(<Harness initial="2026-10-29" issue />);
    expect(field()).toHaveValue("29/10/2026");
    expect(field()).toHaveAttribute("id", "due");
    expect(field()).toHaveAttribute("placeholder", "dd/mm/aaaa");
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field()).toHaveAccessibleDescription(/La del documento/);
    expect(document.querySelector('input[type="date"]')).toBeNull();
    // The button names the date it would change.
    expect(button()).toHaveAccessibleName("Cambiar fecha, 29/10/2026");
    expect(button()).toHaveAttribute("aria-haspopup", "dialog");
    expect(button()).toHaveAttribute("aria-expanded", "false");
  });

  it("applies a typed date as soon as it is a real day, and puts back the value when what is typed is not", async () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-10-29" onChange={onChange} />);
    await userEvent.clear(field());
    expect(value()).toBe("");
    await userEvent.type(field(), "3/2/2027");
    expect(value()).toBe("2027-02-03");
    await userEvent.tab();
    expect(field()).toHaveValue("03/02/2027");
    // ISO typed is read too.
    await userEvent.clear(field());
    await userEvent.type(field(), "2027-12-31");
    expect(value()).toBe("2027-12-31");
    // Not a real day: the value stays, the field goes back to it on leaving.
    await userEvent.clear(field());
    await userEvent.type(field(), "31/02/2027");
    expect(value()).toBe("");
    await userEvent.tab();
    expect(field()).toHaveValue("");
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("without «Borrar», an emptied field keeps its date", async () => {
    render(<Harness initial="2026-10-29" clearable={false} />);
    await userEvent.clear(field());
    await userEvent.tab();
    expect(value()).toBe("2026-10-29");
    expect(field()).toHaveValue("29/10/2026");
    await userEvent.click(button());
    expect(within(dialog()).queryByRole("button", { name: "Borrar" })).not.toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "Hoy" })).toBeInTheDocument();
  });

  it("opens the month of the date in a popover: «Octubre de 2026», ‹ ›, lower-case weekdays, the day filled and today ringed", async () => {
    render(<Harness initial="2026-10-29" />);
    await userEvent.click(button());
    expect(button()).toHaveAttribute("aria-expanded", "true");
    const d = dialog();
    expect(d).toHaveAccessibleName("Fecha");
    expect(button()).toHaveAttribute("aria-controls", d.querySelector(".pdate-cal")!.id);
    expect(within(d).getByRole("heading", { name: "Octubre de 2026" })).toBeInTheDocument();
    expect(within(d).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "lun",
      "mar",
      "mié",
      "jue",
      "vie",
      "sáb",
      "dom",
    ]);
    expect(cell("2026-10-29")).toHaveAttribute("aria-selected", "true");
    expect(cell("2026-10-29").querySelector("[data-filled]")).not.toBeNull();
    // The focus starts on the chosen day.
    expect(cell("2026-10-29")).toHaveFocus();
    expect(cell("2026-10-29")).toHaveAccessibleName("jueves, 29 de octubre de 2026");
    await userEvent.click(within(d).getByRole("button", { name: "Mes siguiente" }));
    expect(within(d).getByRole("heading", { name: "Noviembre de 2026" })).toBeInTheDocument();
    expect(cell("2026-11-11").querySelector("[data-today]")).not.toBeNull();
    expect(cell("2026-11-11")).toHaveAccessibleName("miércoles, 11 de noviembre de 2026 · hoy");
    await userEvent.click(within(d).getByRole("button", { name: "Mes anterior" }));
    await userEvent.click(within(d).getByRole("button", { name: "Mes anterior" }));
    expect(within(d).getByRole("heading", { name: "Septiembre de 2026" })).toBeInTheDocument();
    // A click picks the day, closes and gives the focus back to the button.
    await userEvent.click(cell("2026-09-14"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(value()).toBe("2026-09-14");
    expect(field()).toHaveValue("14/09/2026");
    expect(button()).toHaveFocus();
  });

  it("an empty field opens on today; Alt+↓ in the field opens it too", async () => {
    render(<Harness />);
    await userEvent.click(field());
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(within(dialog()).getByRole("heading", { name: "Noviembre de 2026" })).toBeInTheDocument();
    expect(cell("2026-11-11")).toHaveFocus();
  });

  it("the keyboard: arrows, Home/End, PageUp/PageDown, Enter picks; Esc closes and gives the focus back", async () => {
    render(<Harness initial="2026-11-11" />);
    await userEvent.click(button());
    expect(cell("2026-11-11")).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(cell("2026-11-12")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(cell("2026-11-19")).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}{ArrowUp}");
    expect(cell("2026-11-11")).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(cell("2026-11-09")).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(cell("2026-11-15")).toHaveFocus();
    await userEvent.keyboard("{PageDown}");
    expect(within(dialog()).getByRole("heading", { name: "Diciembre de 2026" })).toBeInTheDocument();
    expect(cell("2026-12-15")).toHaveFocus();
    await userEvent.keyboard("{PageUp}{PageUp}");
    expect(within(dialog()).getByRole("heading", { name: "Octubre de 2026" })).toBeInTheDocument();
    expect(cell("2026-10-15")).toHaveFocus();
    // Out of the month with an arrow: the month follows.
    await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(within(dialog()).getByRole("heading", { name: "Septiembre de 2026" })).toBeInTheDocument();
    expect(cell("2026-09-24")).toHaveFocus();
    // Only the focused day is a tab stop; Tab stays inside the dialog.
    expect(dialog().querySelectorAll('[role="gridcell"][tabindex="0"]')).toHaveLength(1);
    await userEvent.tab();
    expect(within(dialog()).getByRole("button", { name: "Borrar" })).toHaveFocus();
    await userEvent.tab();
    expect(within(dialog()).getByRole("button", { name: "Hoy" })).toHaveFocus();
    await userEvent.tab();
    expect(within(dialog()).getByRole("button", { name: "Mes anterior" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(within(dialog()).getByRole("button", { name: "Hoy" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button()).toHaveFocus();
    expect(value()).toBe("2026-11-11");
    // Enter picks the focused day.
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{Enter}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(value()).toBe("2026-11-13");
  });

  it("«Hoy» picks today and «Borrar» empties the field", async () => {
    render(<Harness initial="2025-01-20" />);
    await userEvent.click(button());
    await userEvent.click(within(dialog()).getByRole("button", { name: "Hoy" }));
    expect(value()).toBe("2026-11-11");
    expect(field()).toHaveValue("11/11/2026");
    await userEvent.click(button());
    await userEvent.click(within(dialog()).getByRole("button", { name: "Borrar" }));
    expect(value()).toBe("");
    expect(field()).toHaveValue("");
    expect(button()).toHaveAccessibleName("Abrir calendario");
  });

  it("a range end opens on the start's month and the days before it are disabled", async () => {
    render(<Harness min="2027-03-10" />);
    await userEvent.click(button());
    expect(within(dialog()).getByRole("heading", { name: "Marzo de 2027" })).toBeInTheDocument();
    expect(cell("2027-03-10")).toHaveFocus();
    expect(cell("2027-03-09")).toHaveAttribute("aria-disabled", "true");
    expect(cell("2027-03-01")).toHaveAttribute("aria-disabled", "true");
    expect(cell("2027-03-10")).not.toHaveAttribute("aria-disabled");
    // A disabled day cannot be picked, by click or by Enter.
    await userEvent.click(cell("2027-03-09"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}{Enter}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(value()).toBe("");
    // Today is before the start: «Hoy» is off, and says why.
    const today = within(dialog()).getByRole("button", { name: "Hoy" });
    expect(today).toBeDisabled();
    expect(today).toHaveAttribute("title", "Hoy queda fuera de las fechas permitidas.");
    await userEvent.click(cell("2027-03-12"));
    expect(value()).toBe("2027-03-12");
  });

  it("on mobile the calendar is a bottom sheet titled like the field", async () => {
    setViewportWidth(390);
    render(<Harness initial="2026-10-29" />);
    await userEvent.click(button());
    const sheet = screen.getByRole("dialog", { name: "Fecha" });
    expect(sheet).toHaveClass("bs");
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(within(sheet).getByRole("heading", { name: "Octubre de 2026" })).toBeInTheDocument();
    expect(cell("2026-10-29")).toHaveFocus();
    await userEvent.click(cell("2026-10-30"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(value()).toBe("2026-10-30");
  });

  it("has no axe violations, closed and open (desktop and mobile)", async () => {
    const { unmount } = render(<Harness initial="2026-10-29" />);
    await expectNoAxeViolations();
    await userEvent.click(button());
    await expectNoAxeViolations();
    unmount();
    setViewportWidth(390);
    render(<Harness initial="2026-10-29" min="2026-10-05" />);
    await userEvent.click(button());
    await expectNoAxeViolations();
  });
});
