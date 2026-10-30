// Administración by grouped tabs (SPEC §8, ADR-0031): the tab lives in the URL,
// Motor de IA is the default, the old routes redirect, the keyboard moves
// through every tab, and each tab passes axe at phone and desktop widths.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { setViewportWidth } from "@test/viewport";
import { ADMIN_TABS, adminPath } from "../model/tabs";
import { AdminPage } from "./AdminPage";

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{`${pathname}${search}`}</output>;
}

/** The admin route plus the two redirects App.tsx declares. */
function renderAdmin(route = "/admin") {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/templates" element={<Navigate to={adminPath("templates")} replace />} />
        <Route path="/ai" element={<Navigate to={adminPath("ai")} replace />} />
      </Routes>
      <Where />
    </>,
    { route },
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("es");
  localStorage.clear();
});

describe("Administración", () => {
  it("opens Motor de IA by default, grouped Recursos · Aplicación · Cuenta y datos · Soporte", async () => {
    renderAdmin();
    const tabs = screen.getByRole("tablist", { name: "Secciones de Administración" });
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent?.replace(/\d+$/, ""))).toEqual([
      "Motor de IA",
      "Plantillas",
      "General",
      "Sincronización",
      "Seguridad",
      "Diagnóstico",
    ]);
    expect(screen.getByRole("tab", { name: "Motor de IA" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "General" })).toHaveAccessibleDescription("Aplicación");
    expect(screen.getByRole("tabpanel", { name: "Motor de IA" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Proveedor online" })).toBeInTheDocument();
  });

  it("an unknown tab falls back to Motor de IA", () => {
    renderAdmin("/admin?tab=nope");
    expect(screen.getByRole("tab", { name: "Motor de IA" })).toHaveAttribute("aria-selected", "true");
  });

  it("/templates and /ai redirect to their tabs", async () => {
    renderAdmin("/templates");
    expect(screen.getByTestId("where")).toHaveTextContent("/admin?tab=templates");
    expect(screen.getByRole("tabpanel", { name: "Plantillas" })).toBeInTheDocument();
  });

  it("clicking a tab puts it in the URL; arrows, Home and End move across groups", async () => {
    const user = userEvent.setup();
    renderAdmin();
    await user.click(screen.getByTestId("admin-tab-general"));
    expect(screen.getByTestId("where")).toHaveTextContent("/admin?tab=general");
    expect(screen.getByTestId("admin-tab-general")).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("admin-tab-sync")).toHaveFocus();
    expect(screen.getByTestId("where")).toHaveTextContent("tab=sync");
    await user.keyboard("{End}");
    expect(screen.getByTestId("admin-tab-diagnostics")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("admin-tab-ai")).toHaveFocus();
    await user.keyboard("{ArrowLeft}{Home}");
    expect(screen.getByTestId("admin-tab-ai")).toHaveAttribute("aria-selected", "true");
    // Only the current tab is in the tab order (roving tabindex).
    expect(screen.getAllByRole("tab").filter((t) => t.tabIndex === 0)).toHaveLength(1);
  });

  it("asks before leaving Motor de IA with unsaved changes", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderAdmin();
    await user.click(await screen.findByRole("radio", { name: /^OpenAI/ }));
    await user.click(screen.getByTestId("admin-tab-general"));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByTestId("where")).not.toHaveTextContent("general");
    confirm.mockReturnValue(true);
    await user.click(screen.getByTestId("admin-tab-general"));
    expect(screen.getByTestId("where")).toHaveTextContent("tab=general");
  });

  it("Seguridad holds the recovery key (SEC-03), which left Perfil", () => {
    renderAdmin("/admin?tab=security");
    expect(screen.getByRole("heading", { name: "Clave de recuperación" })).toBeInTheDocument();
  });

  it("Diagnóstico shows the version and the export action", () => {
    renderAdmin("/admin?tab=diagnostics");
    const section = screen.getByTestId("admin-diagnostics");
    expect(within(section).getByRole("button", { name: "Exportar diagnóstico" })).toBeEnabled();
  });

  it("General: the trash is an honest «Próximamente» with disabled actions", () => {
    renderAdmin("/admin?tab=general");
    const trash = screen.getByRole("group", { name: /Papelera/ });
    for (const name of ["Restaurar", "Vaciar papelera"]) {
      const button = within(trash).getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", expect.stringContaining("Próximamente"));
    }
    expect(trash).not.toHaveTextContent(/\d+ elementos/);
  });

  it("General: the theme offers «Según el sistema» and uses the theme store", async () => {
    const user = userEvent.setup();
    renderAdmin("/admin?tab=general");
    const theme = screen.getByRole("radiogroup", { name: "Tema" });
    await user.click(within(theme).getByRole("radio", { name: "Oscuro" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("pharos.theme")).toBe("dark");
    await user.click(within(theme).getByRole("radio", { name: "Según el sistema" }));
    expect(localStorage.getItem("pharos.theme")).toBe("system");
  });

  for (const width of [390, 1440]) {
    it.each(ADMIN_TABS)(`tab %s passes axe at ${width} px`, async (tab) => {
      setViewportWidth(width);
      renderAdmin(adminPath(tab));
      await waitFor(() => expect(screen.getByRole("tabpanel")).not.toBeEmptyDOMElement());
      await waitFor(() => expect(screen.queryByText("Cargando…")).not.toBeInTheDocument());
      await expectNoAxeViolations();
    });
  }
});
