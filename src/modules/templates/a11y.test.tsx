// WCAG 2.1 AA audit of the template form (UX-05, ADR-0027). axe checks the markup;
// keyboard and form behaviour axe cannot see is asserted directly. Report:
// docs/accesibilidad/auditoria-wcag-0.1.0.md.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { TemplateFormModal } from "./ui/TemplateFormModal";

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("template form", () => {
  it("TemplateFormModal: a blank name is explained, not a disabled button", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <TemplateFormModal
        mode="create"
        fileName=".xlsx"
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );
    const name = screen.getByRole("textbox", { name: /Name/ });
    expect(name).toHaveFocus();
    expect(name).not.toHaveAttribute("aria-invalid"); // not before a save attempt
    await expectNoAxeViolations();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(name).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(name, "Plan base");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Plan base" }),
    );
  });

  it("Escape asks before throwing typed changes away (draft rule)", async () => {
    const onCancel = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithProviders(<TemplateFormModal mode="create" fileName="base.xlsx" onSubmit={() => {}} onCancel={onCancel} />);
    await userEvent.keyboard("{Escape}"); // untouched: closes without asking
    expect(confirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("with typed changes, Escape and Cancel ask first and can keep the form", async () => {
    const onCancel = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithProviders(<TemplateFormModal mode="create" fileName="base.xlsx" onSubmit={() => {}} onCancel={onCancel} />);
    await userEvent.type(screen.getByRole("textbox", { name: /Name/ }), " v2");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(onCancel).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
