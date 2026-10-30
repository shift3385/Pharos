import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { resizeViewport, setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import { AppShell } from "./AppShell";
import { SIDEBAR_COLLAPSED_KEY } from "./useShellState";

vi.mock("@modules/projects/api/projectApi", () => ({
  projectApi: {
    list: vi.fn(async () => [
      { id: "p1", name: "Portal Clientes v3", caseIdPrefix: "PCL", caseIdDigits: 4, updatedAt: "", revision: 1 },
      { id: "p2", name: "App Móvil Banca", caseIdPrefix: "AMB", caseIdDigits: 4, updatedAt: "", revision: 1 },
    ]),
  },
}));

function renderShell(route = "/") {
  return renderWithProviders(
    <AppShell>
      <h1>Contenido</h1>
    </AppShell>,
    { route },
  );
}

const sidebar = () => document.querySelector("aside.sidebar");

describe("AppShell (SPEC §2/§7)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });

  describe("desktop (≥ 1024 px)", () => {
    beforeEach(() => setViewportWidth(1440));

    it("shows the full sidebar: Inicio, Proyectos and Administración, no project group", () => {
      renderShell();
      expect(sidebar()).toHaveAttribute("data-mode", "full");
      expect(screen.getByTestId("nav-dashboard")).toHaveAttribute("aria-current", "page");
      expect(screen.getByTestId("nav-projects")).toBeInTheDocument();
      expect(screen.getByTestId("nav-admin")).toBeInTheDocument();
      // Templates and the AI engine moved under Administration.
      expect(screen.queryByTestId("nav-templates")).not.toBeInTheDocument();
      expect(screen.queryByTestId("nav-ai")).not.toBeInTheDocument();
      expect(screen.queryByText("Proyecto activo")).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Navegación principal" })).toBeInTheDocument();
      expect(document.querySelector(".bottom-nav")).toBeNull();
    });

    it("shows the sync status in the sidebar foot, not in the top bar", () => {
      renderShell();
      const foot = document.querySelector(".sidebar__foot") as HTMLElement;
      expect(within(foot).getByRole("button", { name: "Sincronizar ahora" })).toBeInTheDocument();
      expect(document.querySelector(".topbar .sync")).toBeNull();
    });

    it("marks «Proyectos» current on the project list", () => {
      renderShell("/projects");
      expect(screen.getByTestId("nav-projects")).toHaveAttribute("aria-current", "page");
    });

    it("shows breadcrumbs, search, notifications and the theme switch in the top bar", () => {
      renderShell();
      const crumbs = screen.getByRole("navigation", { name: "Ruta de navegación" });
      expect(within(crumbs).getByText("Inicio")).toHaveAttribute("aria-current", "page");
      expect(screen.getByTestId("search-trigger")).toHaveTextContent("Ctrl K");
      expect(screen.getByTestId("notifications-trigger")).toBeInTheDocument();
      expect(screen.getByTestId("theme-toggle")).toHaveAccessibleName("Cambiar a tema oscuro");
    });

    it("collapses to the 84 px strip and remembers it", async () => {
      const { unmount } = renderShell();
      await userEvent.click(screen.getByRole("button", { name: "Contraer menú" }));
      expect(sidebar()).toHaveAttribute("data-mode", "rail");
      expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("1");
      unmount();
      renderShell();
      expect(sidebar()).toHaveAttribute("data-mode", "rail");
      await userEvent.click(screen.getByRole("button", { name: "Expandir menú" }));
      expect(sidebar()).toHaveAttribute("data-mode", "full");
      expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("0");
    });

    it("the moon/sun button switches light and dark", async () => {
      renderShell();
      await userEvent.click(screen.getByTestId("theme-toggle"));
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      expect(screen.getByTestId("theme-toggle")).toHaveAccessibleName("Cambiar a tema claro");
    });

    it("Ctrl K opens the search placeholder; Escape closes it", async () => {
      renderShell();
      fireEvent.keyDown(document, { key: "k", ctrlKey: true });
      expect(await screen.findByRole("dialog", { name: "Buscar" })).toHaveTextContent(
        /próxima versión/,
      );
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog", { name: "Buscar" })).not.toBeInTheDocument();
    });

    it("Ctrl K does nothing while a dialog is open", async () => {
      renderShell();
      const modal = document.createElement("div");
      modal.setAttribute("aria-modal", "true");
      document.body.appendChild(modal);
      fireEvent.keyDown(document, { key: "k", ctrlKey: true });
      expect(screen.queryByRole("dialog", { name: "Buscar" })).not.toBeInTheDocument();
      modal.remove();
      // A keydown without `key` (autofill) is ignored without failing.
      fireEvent.keyDown(document, { ctrlKey: true });
      expect(screen.queryByRole("dialog", { name: "Buscar" })).not.toBeInTheDocument();
    });

    it("the bell opens the notifications placeholder", async () => {
      renderShell();
      await userEvent.click(screen.getByTestId("notifications-trigger"));
      expect(screen.getByRole("dialog", { name: "Notificaciones" })).toBeInTheDocument();
    });

    it("the user menu holds Mi perfil, Administración, Idioma and Cerrar sesión", async () => {
      renderShell();
      await userEvent.click(screen.getByTestId("user-menu-trigger"));
      const menu = screen.getByRole("menu");
      // The first item takes the focus, not the selected language.
      expect(within(menu).getByRole("menuitem", { name: "Mi perfil" })).toHaveFocus();
      expect(within(menu).getByRole("menuitem", { name: "Mi perfil" })).toBeInTheDocument();
      expect(within(menu).getByRole("menuitem", { name: "Administración" })).toBeInTheDocument();
      expect(within(menu).getByRole("menuitemradio", { name: "Español" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(within(menu).getByRole("menuitem", { name: "Cerrar sesión" })).toBeInTheDocument();
      await userEvent.click(within(menu).getByRole("menuitemradio", { name: "English" }));
      await waitFor(() => expect(i18n.resolvedLanguage).toBe("en"));
      await waitFor(() => expect(document.documentElement).toHaveAttribute("lang", "en"));
    });

    it("keeps Administración current on Plantillas and Motor de IA, with their temporary links", () => {
      renderShell("/templates");
      expect(screen.getByTestId("nav-admin")).toHaveAttribute("aria-current", "page");
      expect(screen.getByTestId("admin-section-templates")).toHaveAttribute("aria-current", "page");
      const crumbs = screen.getByRole("navigation", { name: "Ruta de navegación" });
      expect(within(crumbs).getByRole("link", { name: "Administración" })).toBeInTheDocument();
      expect(within(crumbs).getByText("Plantillas")).toHaveAttribute("aria-current", "page");
    });

    it("inside a project shows the «Proyecto activo» group and the project in the breadcrumbs", async () => {
      renderShell("/projects/p1/planner");
      expect(screen.getByText("Proyecto activo")).toBeInTheDocument();
      expect(screen.getByTestId("nav-project-planner")).toHaveAttribute("aria-current", "page");
      // Only the section is current, not «Proyectos» as well (design review).
      expect(screen.getByTestId("nav-projects")).not.toHaveAttribute("aria-current");
      expect(document.querySelectorAll('.sidebar [aria-current="page"]')).toHaveLength(1);
      expect(screen.getByTestId("nav-project-plan")).toHaveAttribute("href", "/projects/p1/plan");
      const crumbs = screen.getByRole("navigation", { name: "Ruta de navegación" });
      expect(await within(crumbs).findByRole("link", { name: "Portal Clientes v3" })).toBeInTheDocument();
      expect(within(crumbs).getByText("Planificador")).toHaveAttribute("aria-current", "page");
    });

    it("the project switcher lists the projects and filters them", async () => {
      renderShell("/projects/p1/cases");
      const switcher = await screen.findByRole("button", { name: /Portal Clientes v3/ });
      await userEvent.click(switcher);
      const search = screen.getByRole("searchbox", { name: "Buscar proyecto…" });
      // The search field takes the focus; Tab enters the list and Shift+Tab
      // goes back, without closing the menu.
      expect(search).toHaveFocus();
      await userEvent.tab();
      expect(screen.getByRole("menuitemradio", { name: /Portal Clientes v3/ })).toHaveFocus();
      await userEvent.tab({ shift: true });
      expect(search).toHaveFocus();
      expect(screen.getByRole("menuitemradio", { name: /Portal Clientes v3/ })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      // Home/End move the caret in the field, not the focus.
      await userEvent.type(search, "x{Home}");
      expect(search).toHaveFocus();
      await userEvent.clear(search);
      await userEvent.type(search, "banca");
      expect(screen.queryByRole("menuitemradio", { name: /Portal/ })).not.toBeInTheDocument();
      expect(screen.getByRole("menuitemradio", { name: /App Móvil Banca/ })).toBeInTheDocument();
    });

    it("has no axe violations", async () => {
      renderShell("/projects/p1/plan");
      await screen.findByRole("link", { name: "Portal Clientes v3" });
      await expectNoAxeViolations();
    });
  });

  describe("resizing the app container (CAMBIO-vista-adaptativa)", () => {
    it("goes from the sidebar to the strip below 1024 px and to the mobile bars below 640 px", () => {
      setViewportWidth(1440);
      renderShell();
      expect(sidebar()).toHaveAttribute("data-mode", "full");
      resizeViewport(1024);
      expect(sidebar()).toHaveAttribute("data-mode", "full");
      resizeViewport(1023);
      expect(sidebar()).toHaveAttribute("data-mode", "rail");
      expect(screen.queryByTestId("sidebar-collapse")).not.toBeInTheDocument();
      resizeViewport(640);
      expect(sidebar()).toHaveAttribute("data-mode", "rail");
      resizeViewport(639);
      expect(sidebar()).toBeNull();
      expect(document.querySelector(".bottom-nav")).not.toBeNull();
      resizeViewport(1440);
      expect(sidebar()).toHaveAttribute("data-mode", "full");
    });
  });

  describe("tablet (640–1023 px)", () => {
    it("shows the icon strip, without the collapse button", () => {
      setViewportWidth(820);
      renderShell();
      expect(sidebar()).toHaveAttribute("data-mode", "rail");
      expect(screen.queryByTestId("sidebar-collapse")).not.toBeInTheDocument();
      expect(screen.getByTestId("search-trigger")).toBeInTheDocument();
      // Only the sync dot in the strip; it syncs on click.
      expect(screen.getByTestId("sync-compact")).toHaveAccessibleName(/Sincronizar ahora/);
    });
  });

  describe("mobile (< 640 px)", () => {
    beforeEach(() => setViewportWidth(390));

    it("swaps the sidebar for the navy top bar and the bottom bar", () => {
      renderShell();
      expect(sidebar()).toBeNull();
      const tabs = within(screen.getByRole("navigation", { name: "Navegación principal" }));
      expect(tabs.getAllByRole("link").map((a) => a.textContent)).toEqual([
        "Inicio",
        "Proyectos",
        "Admin",
        "Perfil",
      ]);
      expect(screen.getByTestId("nav-dashboard")).toHaveAttribute("aria-current", "page");
    });

    it("keeps «Proyectos» current in the bottom bar inside a project", () => {
      renderShell("/projects/p1/plan");
      expect(screen.getByTestId("nav-projects")).toHaveAttribute("aria-current", "page");
    });

    it("inside a project: back arrow, section title and the sections as pills", async () => {
      renderShell("/projects/p1/traceability");
      expect(screen.getByRole("link", { name: "Volver a Proyectos" })).toHaveAttribute("href", "/projects");
      expect(await screen.findByText("Portal Clientes v3")).toBeInTheDocument();
      const pills = within(screen.getByRole("navigation", { name: "Secciones del proyecto" }));
      expect(pills.getByRole("link", { name: "Trazab." })).toHaveAttribute("aria-current", "page");
    });

    it("the magnifier turns the top bar into the search field", async () => {
      renderShell();
      await userEvent.click(screen.getByTestId("search-trigger"));
      expect(screen.getByRole("searchbox", { name: "Buscar" })).toHaveFocus();
      await userEvent.click(screen.getByRole("button", { name: "Cerrar la búsqueda" }));
      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    });

    it("the user menu is a bottom sheet with Cerrar sesión", async () => {
      renderShell();
      await userEvent.click(screen.getByTestId("user-menu-trigger"));
      const sheet = await screen.findByRole("dialog");
      expect(sheet).toHaveClass("bs");
      // Portaled out of the navy bar: its focus colour and stacking do not apply.
      expect(sheet.closest(".mtopbar")).toBeNull();
      expect(within(sheet).getByRole("button", { name: "Sincronizar ahora" })).toBeInTheDocument();
      expect(within(sheet).getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
      await waitFor(() => expect(within(sheet).getByRole("button", { name: "Español" })).toHaveAttribute("aria-pressed", "true"));
    });
  });
});
