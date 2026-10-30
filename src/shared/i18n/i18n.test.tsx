import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { act } from "react";
import { renderWithProviders, i18n } from "@test/utils";
import { fakeServer } from "@test/server";
import { DashboardPage } from "@app/dashboard/DashboardPage";

describe("i18n (es default / en)", () => {
  beforeEach(async () => {
    // The dashboard reads from the server on the web (BASE-10).
    fakeServer([]);
    await i18n.changeLanguage("es");
  });

  it("renders Spanish by default and switches all copy to English", async () => {
    renderWithProviders(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "Hola, Quality" })).toBeInTheDocument();

    // What the language menus (user menu, Login, Perfil) call.
    await act(() => i18n.changeLanguage("en"));

    expect(screen.getByRole("heading", { name: "Hello, Quality" })).toBeInTheDocument();
    expect(document.documentElement.getAttribute("lang")).toBe("en");
    expect(localStorage.getItem("pharos.language")).toBe("en");
  });
});
