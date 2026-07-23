import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { App } from "./App";

describe("navigation", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });

  it("renders the dashboard at the root route", () => {
    renderWithProviders(<App />, { route: "/" });
    expect(screen.getByText("Bienvenido a Pharos")).toBeInTheDocument();
  });

  it("navigates to empty module sections from the sidebar", async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: "/" });

    await user.click(screen.getByTestId("nav-projects"));
    expect(
      screen.getByRole("heading", { name: "Proyectos" }),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("nav-planner"));
    expect(
      screen.getByRole("heading", { name: "Planificador" }),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("nav-dashboard"));
    expect(screen.getByText("Bienvenido a Pharos")).toBeInTheDocument();
  });
});
