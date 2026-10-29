// WCAG 2.1 AA audit of the export progress dialog (UX-05, ADR-0027). axe checks the markup;
// keyboard and form behaviour axe cannot see is asserted directly. Report:
// docs/accesibilidad/auditoria-wcag-0.1.0.md.
import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { ExportProgressModal } from "./ui/ExportProgressModal";

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("export progress", () => {
  it("ExportProgressModal cannot be dismissed while it works", async () => {
    renderWithProviders(
      <ExportProgressModal
        title="Exporting"
        phase="building"
        done={1}
        total={4}
        label="a.xlsx"
        percent={0}
      />,
    );
    expect(
      screen.getByRole("progressbar", { name: "Exporting" }),
    ).toBeInTheDocument();
    await expectNoAxeViolations();
    await userEvent.keyboard("{Escape}");
    expect(
      screen.getByRole("dialog", { name: "Exporting" }),
    ).toBeInTheDocument();
  });
});
