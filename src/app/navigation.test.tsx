import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { fakeServer } from "@test/server";
import { App } from "./App";

// Signing in answers with this session; signing out needs no server.
vi.mock("@modules/auth/api/authApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@modules/auth/api/authApi")>();
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      logout: vi.fn(async () => undefined),
      login: vi.fn(async () => ({
        accessToken: "t2",
        refreshToken: "r2",
        user: {
          id: "test-user",
          email: "qa@pharos.dev",
          displayName: "QA",
          firstName: "Quality",
          lastName: "Analyst",
          role: "test_manager",
          createdAt: "2026-11-01T00:00:00.000Z",
        },
      })),
    },
  };
});

describe("navigation", () => {
  beforeEach(async () => {
    // The web reads its data from the server (BASE-10): an empty account.
    fakeServer([]);
    await i18n.changeLanguage("es");
  });

  it("renders the Home at the root route, without the Fase 0 placeholder", () => {
    renderWithProviders(<App />, { route: "/" });
    expect(screen.getByRole("heading", { name: "Hola, Quality" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo proyecto" })).toBeInTheDocument();
    expect(screen.queryByText(/Fase 0/)).not.toBeInTheDocument();
  });

  it("navigates to empty module sections from the sidebar", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: "/" });

    await user.click(screen.getByTestId("nav-projects"));
    expect(
      screen.getByRole("heading", { name: "Proyectos" }),
    ).toBeInTheDocument();

    // Templates live under Administration (SPEC §7), not in the sidebar.
    expect(screen.queryByTestId("nav-templates")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("nav-admin"));
    await user.click(screen.getByTestId("admin-tab-templates"));
    expect(
      screen.getByRole("tabpanel", { name: "Plantillas" }),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("nav-dashboard"));
    expect(screen.getByRole("heading", { name: "Hola, Quality" })).toBeInTheDocument();
  });

  it("always opens Inicio after signing in, wherever the last session ended (UX-27)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: "/profile" });
    expect(screen.getByRole("heading", { level: 1, name: "Perfil" })).toBeInTheDocument();
    await user.click(screen.getByTestId("user-menu-trigger"));
    await user.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));
    await user.type(await screen.findByLabelText("Correo electrónico"), "qa@pharos.dev");
    await user.type(screen.getByLabelText("Contraseña"), "una-clave-de-prueba");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("heading", { name: "Hola, Quality" })).toBeInTheDocument();
  });
});
