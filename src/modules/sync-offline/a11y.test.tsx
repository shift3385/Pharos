// WCAG 2.1 AA audit of the conflict panel (UX-05, ADR-0027). axe checks the markup;
// keyboard and form behaviour axe cannot see is asserted directly. Report:
// docs/accesibilidad/auditoria-wcag-0.1.0.md.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { ConflictPanel } from "./ui/ConflictPanel";

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("conflict panel", () => {
  it("ConflictPanel is a named dialog that closes with Escape", async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <ConflictPanel onClose={onClose} onResolved={() => {}} />,
    );
    await screen.findByRole("status");
    expect(
      screen.getByRole("dialog", { name: i18n.t("sync.conflict.title") }),
    ).toBeInTheDocument();
    await expectNoAxeViolations();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
