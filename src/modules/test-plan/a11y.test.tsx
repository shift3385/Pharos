// WCAG 2.1 AA audit of the plan wizard (UX-05, ADR-0027). axe checks the markup;
// keyboard and form behaviour axe cannot see is asserted directly. Report:
// docs/accesibilidad/auditoria-wcag-0.1.0.md.
import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { setViewportWidth } from "@test/viewport";
import { WithHeader } from "./ui/wizard/testHarness";
import { TestPlanWizard } from "./ui/TestPlanWizard";

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

const wizard = () =>
  renderWithProviders(
    <WithHeader>
      <TestPlanWizard planId={null} projectId="p1" />
    </WithHeader>,
  );

describe("plan wizard", () => {
  it("every step passes axe and moving steps focuses the step heading", async () => {
    setViewportWidth(1440);
    wizard();
    await screen.findByRole("textbox", { name: /Title/ });
    // The vertical list (shown from 1360 px of container by CSS).
    const rail = document.querySelector<HTMLElement>(".tpw-rail")!;
    const steps = within(rail).getAllByRole("button");
    expect(steps).toHaveLength(19);
    expect(steps[0]).toHaveAttribute("aria-current", "step");

    for (let i = 0; i < steps.length; i++) {
      if (i > 0) {
        await userEvent.click(screen.getByRole("button", { name: /^Next:/ }));
        expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
        expect(steps[i]).toHaveAttribute("aria-current", "step");
      }
      await expectNoAxeViolations();
    }
  }, 60_000);

  it("a blank title shows a focused summary instead of a disabled Save", async () => {
    setViewportWidth(1440);
    wizard();
    const title = await screen.findByRole("textbox", { name: /Title/ });
    await userEvent.clear(title);
    await userEvent.click(screen.getByRole("button", { name: /^Next:/ }));
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.getByRole("textbox", { name: /Title/ })).toHaveAttribute("aria-invalid", "true");
  });

  it("the Import / Export menu and the mobile step sheet pass axe", async () => {
    setViewportWidth(1440);
    const { unmount } = wizard();
    await screen.findByRole("textbox", { name: /Title/ });
    await userEvent.click(screen.getByRole("button", { name: "Import / Export" }));
    expect(screen.getByRole("menuitem", { name: "Export .pdf" })).toHaveAccessibleDescription(
      "A document ready to sign",
    );
    await expectNoAxeViolations();
    unmount();

    setViewportWidth(390);
    wizard();
    await userEvent.click(await screen.findByRole("button", { name: "Show steps" }));
    expect(screen.getByRole("dialog", { name: "Plan steps" })).toBeInTheDocument();
    await expectNoAxeViolations();
  }, 30_000);
});
