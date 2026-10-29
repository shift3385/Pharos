// WCAG 2.1 AA audit of the plan wizard (UX-05, ADR-0027). axe checks the markup;
// keyboard and form behaviour axe cannot see is asserted directly. Report:
// docs/accesibilidad/auditoria-wcag-0.1.0.md.
import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { TestPlanWizard } from "./ui/TestPlanWizard";

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("plan wizard", () => {
  it("every step passes axe and moving steps focuses the step heading", async () => {
    renderWithProviders(
      <TestPlanWizard planId={null} projectId="p1" onClose={() => {}} />,
    );
    await screen.findByRole("textbox", { name: /Title/ });
    const nav = screen.getByRole("navigation");
    const steps = within(nav).getAllByRole("button");
    expect(steps[0]).toHaveAttribute("aria-current", "step");

    for (let i = 0; i < steps.length; i++) {
      if (i > 0) {
        await userEvent.click(screen.getByRole("button", { name: "Next →" }));
        expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
        expect(steps[i]).toHaveAttribute("aria-current", "step");
      }
      await expectNoAxeViolations();
    }
  }, 30_000);

  it("a blank title shows a focused summary instead of a disabled Save", async () => {
    renderWithProviders(
      <TestPlanWizard planId={null} projectId="p1" onClose={() => {}} />,
    );
    const title = await screen.findByRole("textbox", { name: /Title/ });
    await userEvent.clear(title);
    await userEvent.click(screen.getByRole("button", { name: "Next →" }));
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.getByRole("textbox", { name: /Title/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
