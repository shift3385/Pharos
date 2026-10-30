import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { ProfilePage } from "./ui/ProfilePage";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";

vi.mock("./api/profileApi", () => ({
  profileApi: {
    get: vi.fn(),
    upsert: vi.fn(),
  },
}));

import { profileApi } from "./api/profileApi";

const savedProfile = {
  id: "1",
  workspaceId: "w",
  displayName: "QA",
  firstName: "Quality",
  lastName: "Analyst",
  role: "test_manager",
  createdBy: "1",
  updatedBy: "1",
  createdAt: "2026-07-15T00:00:00Z",
  updatedAt: "2026-07-15T00:00:00Z",
  revision: 2,
};

describe("profile page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    vi.clearAllMocks();
    vi.mocked(profileApi.get).mockResolvedValue(null);
  });

  it("prefills from the signed-in user and saves via the API", async () => {
    vi.mocked(profileApi.upsert).mockResolvedValue(savedProfile);
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);

    // Seeded from the authenticated user (test session).
    await screen.findByDisplayValue("Quality");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(profileApi.upsert).toHaveBeenCalledWith({
      displayName: "QA",
      firstName: "Quality",
      lastName: "Analyst",
    });
    expect(await screen.findByText("Guardado")).toBeInTheDocument();
    expect(screen.getByTestId("profile-revision")).toHaveTextContent("2");
  });

  it("shows who is signed in and keeps «Cerrar sesión» for mobile only", async () => {
    setViewportWidth(1440);
    const { unmount } = renderWithProviders(<ProfilePage />);
    await screen.findByDisplayValue("Quality");
    expect(screen.getByText("Quality Analyst")).toBeInTheDocument();
    expect(screen.getByTitle("qa@pharos.dev")).toHaveTextContent(
      "qa@pharos.dev",
    );
    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).toBeNull();
    unmount();

    setViewportWidth(390);
    renderWithProviders(<ProfilePage />);
    await screen.findByDisplayValue("Quality");
    expect(
      screen.getByRole("button", { name: "Cerrar sesión" }),
    ).toBeInTheDocument();
  });

  it("changes language and theme from Preferencias", async () => {
    const user = userEvent.setup();
    setViewportWidth(1440);
    renderWithProviders(<ProfilePage />);
    await screen.findByDisplayValue("Quality");

    const theme = screen.getByRole("radiogroup", { name: "Tema" });
    const before = document.documentElement.getAttribute("data-theme");
    const other = before === "dark" ? "Claro" : "Oscuro";
    await user.click(within(theme).getByRole("radio", { name: other }));
    expect(within(theme).getByRole("radio", { name: other })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(document.documentElement.getAttribute("data-theme")).not.toBe(
      before,
    );

    const language = screen.getByRole("radiogroup", { name: "Idioma" });
    expect(
      within(language).getByRole("radio", { name: "Español" }),
    ).toHaveAttribute("aria-checked", "true");
    await user.click(within(language).getByRole("radio", { name: "English" }));
    expect(
      screen.getByRole("heading", { name: "Preferences" }),
    ).toBeInTheDocument();
    await i18n.changeLanguage("es");
  });

  it("keeps the recovery key until Administración › Seguridad has it, and passes axe", async () => {
    setViewportWidth(390);
    renderWithProviders(<ProfilePage />);
    await screen.findByDisplayValue("Quality");
    expect(
      screen.getByRole("heading", { name: "Clave de recuperación" }),
    ).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});
