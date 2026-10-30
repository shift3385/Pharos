// WCAG 2.1 AA audit of the app shell, the shared dialogs and form parts, and admin (UX-05, ADR-0027). axe checks the markup;
// keyboard and form behaviour axe cannot see is asserted directly. Report:
// docs/accesibilidad/auditoria-wcag-0.1.0.md.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { AppShell } from "@app/layout/AppShell";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { ImportReportModal } from "@shared/ui/ImportReportModal";
import { CheckboxGroup, ListField, PairListField } from "@shared/ui/fields";
import { AdminPage } from "@modules/admin";
import { AuthScreen } from "@modules/auth";
import { setViewportWidth } from "@test/viewport";

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("app shell", () => {
  it("starts with a skip link to the main landmark", async () => {
    renderWithProviders(
      <AppShell>
        <h1>Page</h1>
      </AppShell>,
    );
    await userEvent.tab();
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(
      screen.getByRole("navigation", { name: "Main navigation" }),
    ).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});

describe("found in the live browser pass", () => {
  it("the skip link focuses the content without touching the hash route", async () => {
    window.location.hash = "#/projects";
    renderWithProviders(
      <AppShell>
        <h1>Page</h1>
      </AppShell>,
    );
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("main")).toHaveFocus();
    expect(window.location.hash).toBe("#/projects");
  });

});

describe("login (RED-V1)", () => {
  it("passes axe on desktop and names the language menu by the visible language", async () => {
    setViewportWidth(1440);
    renderWithProviders(<AuthScreen />, { authenticated: false });
    await expectNoAxeViolations();
    const trigger = screen.getByRole("button", { name: /^Language: ?English$/ });
    await userEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "English" })).toHaveAttribute("aria-checked", "true");
    await expectNoAxeViolations();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Language" })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("passes axe on mobile, also in the sign-up form", async () => {
    setViewportWidth(390);
    renderWithProviders(<AuthScreen />, { authenticated: false });
    await expectNoAxeViolations();
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});

describe("shared dialogs", () => {
  it("ConfirmDialog is an alert dialog that starts on Cancel", async () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        title="Delete project"
        message="This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    const dialog = screen.getByRole("alertdialog", { name: "Delete project" });
    expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    await expectNoAxeViolations();
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("ImportReportModal exposes named progress", async () => {
    renderWithProviders(
      <>
        <ImportReportModal
          title="Import plan"
          parsing
          done={1}
          total={2}
          rows={[
            {
              labelKey: "testPlan.fieldTitle",
              status: "filled",
              preview: "Plan",
            },
          ]}
          onApply={() => {}}
          onCancel={() => {}}
        />
      </>,
    );
    expect(
      screen.getByRole("progressbar", { name: "Import plan" }),
    ).toHaveAttribute("aria-valuenow", "50");
    await expectNoAxeViolations();
  });
});

describe("shared form parts", () => {
  it("lists name their group and rows and warn about repeated rows", async () => {
    renderWithProviders(
      <>
        <ListField
          label="Scope"
          items={["Login", "login"]}
          onChange={() => {}}
        />
        <PairListField
          label="Roles"
          items={[{ a: "QA", b: "Tests" }]}
          keys={["a", "b"]}
          labels={["Role", "Responsibility"]}
          onChange={() => {}}
        />
        <CheckboxGroup
          label="Levels"
          options={["unit"]}
          selected={[]}
          onChange={() => {}}
          labelFor={(k) => k}
        />
      </>,
    );
    expect(screen.getByRole("group", { name: "Scope" })).toBeInTheDocument();
    const second = screen.getByRole("textbox", { name: "Scope · Row 2" });
    expect(second).not.toHaveAttribute("aria-invalid");
    expect(second).toHaveAccessibleDescription(/Duplicate row/);
    expect(
      screen.getByRole("textbox", { name: "Responsibility · Row 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete: Scope · Row 2" }),
    ).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});

describe("admin", () => {
  it("passes axe and blocks an out-of-range retention with a summary", async () => {
    renderWithProviders(<AdminPage />, { route: "/admin?tab=general" });
    await expectNoAxeViolations();
    const retention = screen.getByRole("spinbutton", {
      name: /Retention|Retención/,
    });
    await userEvent.clear(retention);
    expect(retention).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(
      screen.getByRole("button", { name: i18n.t("admin.settings.save") }),
    );
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  });
});
