import { describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { renderWithProviders } from "@test/utils";
import { GherkinEditor } from "./GherkinEditor";

// FIX-49 (NC-129, R3-010): a long step that wraps continues under its own
// text, not at column 0. The editor's textarea cannot indent a wrapped line,
// so the code at rest shows with hanging indents and typing shows the
// editor's own layout.

const CODE = [
  "Feature: Iniciar sesión",
  "  Scenario: Credenciales válidas",
  "    Given La cuenta de prueba existe en el servidor de staging",
  "",
  "    When Abrir Pharos",
].join("\n");

describe("Gherkin editor at rest (FIX-49)", () => {
  it("indents each line's continuation under its own text, and keeps the code's text", () => {
    renderWithProviders(
      <GherkinEditor
        value={CODE}
        onChange={vi.fn()}
        fileName="PH-001.feature"
      />,
    );
    const view = screen.getByTestId("gherkin-resting");
    expect(view).toHaveAttribute("aria-hidden", "true");
    expect(view.textContent).toBe(CODE);
    const lines = view.querySelectorAll<HTMLElement>(".tc-hang");
    expect(lines).toHaveLength(5);
    // Column 0 for «Feature», 2 + 2 for the scenario, 4 + 2 for a step.
    expect(lines[0].style.paddingLeft).toBe("2ch");
    expect(lines[1].style.paddingLeft).toBe("4ch");
    expect(lines[2].style.paddingLeft).toBe("6ch");
    expect(lines[2].style.textIndent).toBe("-6ch");
  });

  it("gives way to the editor's own layout while typing, and comes back after", () => {
    renderWithProviders(<GherkinEditor value={CODE} onChange={vi.fn()} />);
    const textarea = screen.getByRole("textbox");
    act(() => textarea.focus());
    expect(screen.queryByTestId("gherkin-resting")).not.toBeInTheDocument();
    act(() => textarea.blur());
    expect(screen.getByTestId("gherkin-resting")).toBeInTheDocument();
  });

  it("the mobile editor keeps its numbered lines and no resting view", () => {
    renderWithProviders(
      <GherkinEditor value={CODE} onChange={vi.fn()} keyboardBar />,
    );
    expect(screen.queryByTestId("gherkin-resting")).not.toBeInTheDocument();
  });
});
