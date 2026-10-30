import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import { Menu, MenuItem, MenuSeparator, ResponsiveMenu } from "./Menu";
import { usePopover } from "./usePopover";

function Harness({
  name = "Opciones",
  onPick = () => {},
  responsive,
}: {
  name?: string;
  onPick?: (v: string) => void;
  responsive?: boolean;
}) {
  const menu = usePopover("menu");
  const props = {
    open: menu.open,
    onClose: menu.close,
    anchorRef: menu.anchorRef,
    id: menu.id,
    label: name,
  };
  const items = (
    <>
      <MenuItem onSelect={() => onPick("a")}>Uno</MenuItem>
      <MenuItem onSelect={() => onPick("b")} selected>
        Dos
      </MenuItem>
      <MenuSeparator />
      <MenuItem onSelect={() => onPick("c")} tone="danger">
        Tres
      </MenuItem>
    </>
  );
  return (
    <>
      <button type="button" {...menu.triggerProps}>
        {name}
      </button>
      {responsive ? (
        <ResponsiveMenu {...props} title={name}>
          {items}
        </ResponsiveMenu>
      ) : (
        <Menu {...props}>{items}</Menu>
      )}
      <div data-testid="outside">fuera</div>
    </>
  );
}

describe("Menu (SPEC §6/§10)", () => {
  it("opens from its trigger as a named menu, focusing the selected item", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Opciones" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu", { name: "Opciones" })).toBeInTheDocument();
    const selected = screen.getByRole("menuitemradio", { name: "Dos" });
    expect(selected).toHaveFocus();
    expect(selected).toHaveAttribute("aria-checked", "true");
    await expectNoAxeViolations();
  });

  it("moves with the arrow keys, looping, and jumps with Home/End", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Opciones" }));
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Tres" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Uno" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Tres" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Uno" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Tres" })).toHaveFocus();
  });

  it("choosing an option runs it and closes the menu", async () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await userEvent.click(screen.getByRole("button", { name: "Opciones" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Uno" }));
    expect(onPick).toHaveBeenCalledWith("a");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("Escape closes it and gives the focus back to the trigger", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Opciones" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on a click outside, but not on a click inside", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Opciones" }));
    fireEvent.mouseDown(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on a scroll outside, but not on a scroll inside", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Opciones" }));
    fireEvent.scroll(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.scroll(screen.getByTestId("outside"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps only one menu open at a time", async () => {
    render(
      <>
        <Harness name="Primero" />
        <Harness name="Segundo" />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Primero" }));
    expect(screen.getByRole("menu", { name: "Primero" })).toBeInTheDocument();
    // A plain click event (no mousedown "outside"): the open-menu registry
    // alone must close the first one.
    act(() => screen.getByRole("button", { name: "Segundo" }).click());
    expect(screen.queryByRole("menu", { name: "Primero" })).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "Segundo" })).toBeInTheDocument();
  });

  it("is a bottom sheet on mobile, with the same items", async () => {
    setViewportWidth(390);
    const onPick = vi.fn();
    render(<Harness responsive onPick={onPick} />);
    await userEvent.click(screen.getByRole("button", { name: "Opciones" }));
    expect(screen.getByRole("dialog", { name: "Opciones" })).toHaveClass("bs");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const option = screen.getByRole("button", { name: "Dos" });
    expect(option).toHaveClass("menu__item--sheet");
    expect(option).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Uno" }));
    expect(onPick).toHaveBeenCalledWith("a");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a dropdown from 640 px", async () => {
    setViewportWidth(820);
    render(<Harness responsive />);
    await userEvent.click(screen.getByRole("button", { name: "Opciones" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});
