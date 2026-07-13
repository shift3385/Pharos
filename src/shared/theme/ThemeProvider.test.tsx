import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@test/utils";
import { ThemeToggle } from "./ThemeToggle";

describe("theme (Faro Nocturno)", () => {
  it("reflects the active theme on <html data-theme>", () => {
    renderWithProviders(<ThemeToggle />);
    expect(document.documentElement.getAttribute("data-theme")).toMatch(
      /^(light|dark)$/,
    );
  });

  it("toggles between light and dark and persists the choice", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeToggle />);

    const before = document.documentElement.getAttribute("data-theme");
    await user.click(screen.getByTestId("theme-toggle"));
    const after = document.documentElement.getAttribute("data-theme");

    expect(after).not.toBe(before);
    expect(after === "light" || after === "dark").toBe(true);
    expect(localStorage.getItem("pharos.theme")).toBe(after);
  });
});
