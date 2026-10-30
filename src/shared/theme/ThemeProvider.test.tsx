import { describe, it, expect, vi } from "vitest";
import { act, screen } from "@testing-library/react";
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

describe("theme preference «Según el sistema»", () => {
  function mockSystem(dark: boolean) {
    const listeners = new Set<() => void>();
    const media = {
      matches: dark,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    };
    vi.stubGlobal("matchMedia", () => media);
    return (next: boolean) => {
      media.matches = next;
      act(() => listeners.forEach((cb) => cb()));
    };
  }

  function Probe() {
    const { theme, preference, setPreference, toggleTheme } = useTheme();
    return (
      <>
        <span data-testid="probe">{`${preference}:${theme}`}</span>
        <button type="button" onClick={() => setPreference("system")}>system</button>
        <button type="button" onClick={toggleTheme}>toggle</button>
      </>
    );
  }

  it("follows the OS live and stores «system»", async () => {
    localStorage.setItem("pharos.theme", "system");
    const setSystemDark = mockSystem(false);
    renderWithProviders(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("system:light");
    setSystemDark(true);
    expect(screen.getByTestId("probe")).toHaveTextContent("system:dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("pharos.theme")).toBe("system");
  });

  it("the moon/sun toggle fixes an explicit mode; «system» goes back to the OS", async () => {
    localStorage.setItem("pharos.theme", "system");
    mockSystem(true);
    const user = userEvent.setup();
    renderWithProviders(<Probe />);
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("probe")).toHaveTextContent("light:light");
    expect(localStorage.getItem("pharos.theme")).toBe("light");
    await user.click(screen.getByRole("button", { name: "system" }));
    expect(screen.getByTestId("probe")).toHaveTextContent("system:dark");
  });
});
