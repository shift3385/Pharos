// WCAG 2.1 AA audit of the case editor (UX-05, ADR-0027). axe checks the markup;
// keyboard and form behaviour axe cannot see is asserted directly. Report:
// docs/accesibilidad/auditoria-wcag-0.1.0.md.
import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { TestCaseEditor } from "./ui/TestCaseEditor";
import { SortableSteps } from "./ui/SortableSteps";
import { ExamplesTable } from "./ui/ExamplesTable";

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("case editor", () => {
  it("the level picker and the editor pass axe", async () => {
    renderWithProviders(
      <TestCaseEditor projectId="p1" caseId={null} onClose={() => {}} />,
    );
    await expectNoAxeViolations();
    await userEvent.click(
      screen.getAllByRole("button", { name: /Basic|Básico/ })[0],
    );
    await screen.findByRole("textbox", { name: /Title/ });
    await expectNoAxeViolations();
  });

  it("steps have names and keyboard-reorder instructions", async () => {
    renderWithProviders(
      <SortableSteps
        label="Steps"
        steps={["Open", "Open"]}
        onChange={() => {}}
      />,
    );
    const handle = screen.getByRole("button", {
      name: "Drag to reorder: Step 1",
    });
    expect(handle).toHaveAccessibleDescription(/arrows/);
    // A repeated step is normal ("Click Next" twice): no warning.
    expect(screen.getByRole("textbox", { name: "Step 2" })).not.toHaveAccessibleDescription(
      /Duplicate row/,
    );
    await expectNoAxeViolations();
  });

  it("Examples cells are named by column and row; repeats are listed", async () => {
    renderWithProviders(
      <ExamplesTable
        value={{
          headers: ["user", "user"],
          rows: [
            ["a", "b"],
            ["a", "b"],
          ],
        }}
        onChange={() => {}}
      />,
    );
    for (const cell of screen.getAllByRole("textbox", { name: "user · Row 2" }))
      expect(cell).toHaveAccessibleDescription(/Duplicate row/);
    expect(
      screen.getByRole("textbox", { name: "Column 2" }),
    ).toHaveAccessibleDescription(/Duplicate row/);
    await expectNoAxeViolations();
  });
});
