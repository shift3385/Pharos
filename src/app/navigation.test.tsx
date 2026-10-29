import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { App } from "./App";

describe("navigation", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });

  it("renders the Home at the root route, without the Fase 0 placeholder", () => {
    renderWithProviders(<App />, { route: "/" });
    expect(screen.getByRole("heading", { name: "Hola, Quality" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Iniciar nuevo proyecto de pruebas/ })).toBeInTheDocument();
    expect(screen.queryByText(/Fase 0/)).not.toBeInTheDocument();
  });

  it("navigates to empty module sections from the sidebar", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: "/" });

    await user.click(screen.getByTestId("nav-projects"));
    expect(
      screen.getByRole("heading", { name: "Proyectos" }),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("nav-templates"));
    expect(
      screen.getByRole("heading", { name: "Plantillas" }),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("nav-dashboard"));
    expect(screen.getByRole("heading", { name: "Hola, Quality" })).toBeInTheDocument();
  });
});
