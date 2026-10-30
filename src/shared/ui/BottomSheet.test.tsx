import { useState } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectNoAxeViolations } from "@test/axe";
import { i18n } from "@test/utils";
import { BottomSheet, MenuItem } from "./Menu";

function Harness() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("Alta");
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Prioridad: {value}
      </button>
      {open && (
        <BottomSheet title="Prioridad" onClose={() => setOpen(false)}>
          {["Crítica", "Alta", "Media"].map((v) => (
            <MenuItem key={v} selected={v === value} onSelect={() => setValue(v)}>
              {v}
            </MenuItem>
          ))}
        </BottomSheet>
      )}
    </>
  );
}

const openSheet = () => userEvent.click(screen.getByRole("button", { name: /Prioridad/ }));

describe("BottomSheet (SPEC §6)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });

  it("is a named modal with a handle, a title, a close button and 46 px options", async () => {
    render(<Harness />);
    await openSheet();
    const sheet = screen.getByRole("dialog", { name: "Prioridad" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(sheet.querySelector(".bs__handle")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alta" })).toHaveClass("menu__item--sheet");
    expect(screen.getByRole("button", { name: "Alta" })).toHaveAttribute("aria-pressed", "true");
    await expectNoAxeViolations();
  });

  it("choosing an option closes it", async () => {
    render(<Harness />);
    await openSheet();
    await userEvent.click(screen.getByRole("button", { name: "Media" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prioridad: Media" })).toBeInTheDocument();
  });

  it("the ✕, the backdrop and Escape close it", async () => {
    render(<Harness />);
    await openSheet();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await openSheet();
    fireEvent.mouseDown(document.querySelector(".bs-overlay") as Element);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await openSheet();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
