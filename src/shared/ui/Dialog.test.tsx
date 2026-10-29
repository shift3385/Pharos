import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectNoAxeViolations } from "@test/axe";
import { Dialog } from "./Dialog";

function Harness({ onClose = () => {}, dismissable = true }: { onClose?: () => void; dismissable?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      {open && (
        <Dialog
          labelledBy="t"
          dismissable={dismissable}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <h3 id="t">Title</h3>
          <button type="button">first</button>
          <button type="button">last</button>
        </Dialog>
      )}
    </>
  );
}

describe("Dialog", () => {
  it("is a named modal and moves the focus inside", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText("open"));
    const dialog = screen.getByRole("dialog", { name: "Title" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("first")).toHaveFocus();
    await expectNoAxeViolations();
  });

  it("keeps Tab and Shift+Tab inside the dialog", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText("open"));
    await userEvent.tab();
    expect(screen.getByText("last")).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByText("first")).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByText("last")).toHaveFocus();
  });

  it("closes on Escape and returns the focus to the opener", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByText("open"));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("open")).toHaveFocus();
  });

  it("ignores Escape and the backdrop while not dismissable", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} dismissable={false} />);
    await userEvent.click(screen.getByText("open"));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on a backdrop click but not on a click inside", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByText("open"));
    await userEvent.click(screen.getByText("Title"));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("lets only the innermost of two stacked dialogs handle Escape", async () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <Dialog label="outer" onClose={outer}>
        <button type="button">a</button>
        <Dialog label="inner" onClose={inner}>
          <button type="button">b</button>
        </Dialog>
      </Dialog>,
    );
    await userEvent.keyboard("{Escape}");
    expect(inner).toHaveBeenCalledOnce();
    expect(outer).not.toHaveBeenCalled();
  });
});
