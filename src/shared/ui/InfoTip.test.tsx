import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { FormField } from "./FormField";
import { Dialog } from "./Dialog";

const HELP = "Lowercase letters, digits and underscores.";

function Field() {
  return (
    <FormField label="Key" info={HELP} hint="Short hint">
      {(p) => <input {...p} />}
    </FormField>
  );
}

describe("InfoTip (UX-10)", () => {
  it("describes the control without opening, and names the button", async () => {
    renderWithProviders(<Field />);
    const input = screen.getByRole("textbox", { name: "Key" });
    expect(input).toHaveAccessibleDescription(`Short hint ${HELP}`);
    const button = screen.getByRole("button", {
      name: i18n.t("common.moreInfo", { label: "Key" }),
    });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("tooltip")).toBeNull();
    await expectNoAxeViolations();
  });

  it("opens on keyboard focus and closes with Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Field />);
    // The [?] sits next to the label, before the control.
    await user.tab();
    const button = screen.getByRole("button", { name: /Key/ });
    expect(button).toHaveFocus();
    expect(screen.getByRole("tooltip")).toHaveTextContent(HELP);
    expect(button).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("toggles on click/tap and closes on a tap outside", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <Field />
        <p>outside</p>
      </>,
    );
    const button = screen.getByRole("button", { name: /Key/ });
    fireEvent.pointerDown(button, { pointerType: "touch" });
    await user.click(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByText("outside"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("Escape closes the tip, not the dialog around it", async () => {
    const user = userEvent.setup();
    let closed = 0;
    renderWithProviders(
      <Dialog label="Field" onClose={() => closed++}>
        <Field />
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: /Key/ }));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(closed).toBe(0);
    await user.keyboard("{Escape}");
    expect(closed).toBe(1);
  });
});

describe("FormField order (UX-10)", () => {
  it("renders label → control → hint, so controls in a row line up", () => {
    const { container } = renderWithProviders(<Field />);
    const field = container.querySelector(".tp-field")!;
    const kids = Array.from(field.children).map((el) => el.tagName.toLowerCase() + "." + el.className);
    expect(kids).toEqual(["span.tp-field__head", "input.", "span.tp-field__hint"]);
  });
});
