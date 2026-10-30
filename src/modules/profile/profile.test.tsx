import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { ProfilePage } from "./ui/ProfilePage";
import { setViewportWidth } from "@test/viewport";

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
    expect(screen.getByTitle("qa@pharos.dev")).toHaveTextContent("qa@pharos.dev");
    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).toBeNull();
    unmount();

    setViewportWidth(390);
    renderWithProviders(<ProfilePage />);
    await screen.findByDisplayValue("Quality");
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  });
});
