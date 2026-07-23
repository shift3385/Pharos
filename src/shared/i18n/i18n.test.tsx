import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { DashboardPage } from "@app/dashboard/DashboardPage";
import { LanguageToggle } from "./LanguageToggle";

describe("i18n (es default / en)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });

  it("renders Spanish by default and switches all copy to English", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <LanguageToggle />
        <DashboardPage />
      </>,
    );

    expect(screen.getByText("Bienvenido a Pharos")).toBeInTheDocument();
    expect(screen.getByTestId("lang-trigger")).toHaveTextContent("ES");

    // Open the language dropdown, then pick English.
    await user.click(screen.getByTestId("lang-trigger"));
    await user.click(screen.getByTestId("lang-en"));

    expect(screen.getByText("Welcome to Pharos")).toBeInTheDocument();
    expect(document.documentElement.getAttribute("lang")).toBe("en");
    expect(localStorage.getItem("pharos.language")).toBe("en");
  });
});
