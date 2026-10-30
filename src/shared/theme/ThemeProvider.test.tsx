import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@test/utils";
import { useTheme } from "./useTheme";

/** Minimal consumer: the theme switches live in the shell and Perfil. */
function ThemeProbe() {
  const { theme, setTheme } = useTheme();
  return (
    <button type="button" data-testid="theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
      {theme}
    </button>
  );
}

describe("theme (Faro Nocturno)", () => {
  it("reflects the active theme on <html data-theme>", () => {
    renderWithProviders(<ThemeProbe />);
    expect(document.documentElement.getAttribute("data-theme")).toMatch(
      /^(light|dark)$/,
    );
  });

  it("toggles between light and dark and persists the choice", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeProbe />);

    const before = document.documentElement.getAttribute("data-theme");
    await user.click(screen.getByTestId("theme-toggle"));
    const after = document.documentElement.getAttribute("data-theme");

    expect(after).not.toBe(before);
    expect(after === "light" || after === "dark").toBe(true);
    expect(localStorage.getItem("pharos.theme")).toBe(after);
  });
});
