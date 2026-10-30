import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectNoAxeViolations } from "@test/axe";
import { FilterChips } from "./FilterChips";

const OPTIONS = [
  { value: "all", label: "Todos", count: 240 },
  { value: "draft", label: "Borrador", count: 12 },
  { value: "soon", label: "Ejecución", disabled: true, title: "Próximamente" },
];

describe("FilterChips", () => {
  it("is a named group of toggle buttons with their counts", async () => {
    const onChange = vi.fn();
    render(<FilterChips label="Estado" options={OPTIONS} value="all" onChange={onChange} />);
    expect(screen.getByRole("group", { name: "Estado" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Todos 240" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Borrador 12" }));
    expect(onChange).toHaveBeenCalledWith("draft");
    await expectNoAxeViolations();
  });

  it("a disabled option explains why and does nothing", async () => {
    const onChange = vi.fn();
    render(<FilterChips label="Estado" options={OPTIONS} value="all" onChange={onChange} />);
    const soon = screen.getByRole("button", { name: "Ejecución" });
    expect(soon).toHaveAttribute("aria-disabled", "true");
    expect(soon).toHaveAttribute("title", "Próximamente");
    await userEvent.click(soon);
    expect(onChange).not.toHaveBeenCalled();
  });
});
