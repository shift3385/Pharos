// WCAG 2.1 AA audit of the traceability dialogs (UX-05, ADR-0027). axe checks the markup;
// keyboard and form behaviour axe cannot see is asserted directly. Report:
// docs/accesibilidad/auditoria-wcag-0.1.0.md.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { RequirementFormModal } from "./ui/RequirementFormModal";
import { RequirementImportModal } from "./ui/RequirementImportModal";
import { MigrateTraceabilityModal } from "./ui/MigrateTraceabilityModal";

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("traceability dialogs", () => {
  it("RequirementFormModal blocks an invalid or repeated key and says why", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <RequirementFormModal
        requirement={null}
        existingKeys={["REQ-001"]}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /Title/ }),
      "Login",
    );
    const key = screen.getByRole("textbox", { name: "Requirement ID" });
    await userEvent.type(key, "REQ-001");
    expect(key).toHaveAttribute("aria-invalid", "true");
    expect(key).toHaveAccessibleDescription(/already exists/);
    await expectNoAxeViolations();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveFocus();
  });

  it("RequirementImportModal names its preview and its skipped rows", async () => {
    renderWithProviders(
      <RequirementImportModal
        fileName="reqs.csv"
        existingKeys={[]}
        result={{
          columns: { requirementKey: "ID", title: "Title" },
          rows: [
            {
              requirementKey: "REQ-1",
              title: "Login",
              description: "",
              priority: "high",
            },
          ],
          issues: [{ line: 3, reason: "duplicateKey", value: "REQ-1" }],
        }}
        onConfirm={async () => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.getByRole("table", { name: "Requirements preview" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Rows that will be skipped (1)" }),
    ).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("MigrateTraceabilityModal names each checkbox by its link", async () => {
    renderWithProviders(
      <MigrateTraceabilityModal
        proposals={[
          {
            caseId: "c1",
            scenarioId: "TC-001",
            token: "REQ-1",
            requirementKey: "REQ-1",
            createsRequirement: true,
          },
        ]}
        onApply={async () => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: /TC-001 → REQ-1/ }),
    ).toBeChecked();
    await expectNoAxeViolations();
  });
});
