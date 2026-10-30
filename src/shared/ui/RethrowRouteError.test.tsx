import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@shared/i18n";
import { logClientError } from "@shared/diagnostics";
import { TestRouter } from "@test/TestRouter";
import { ErrorBoundary } from "./ErrorBoundary";

vi.mock("@shared/diagnostics", async (original) => ({
  ...(await original<typeof import("@shared/diagnostics")>()),
  logClientError: vi.fn(),
  exportDiagnostics: vi.fn(),
}));

function BrokenShell(): never {
  throw new Error("shell exploded");
}

describe("a crash in the shell under the data router (RED-V3k)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("reaches our ErrorBoundary (logged, «Exportar diagnóstico»), not the router's default screen", () => {
    render(
      <ErrorBoundary variant="app">
        <TestRouter route="/">
          <BrokenShell />
        </TestRouter>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Algo salió mal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exportar diagnóstico" })).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected Application Error/)).not.toBeInTheDocument();
    expect(logClientError).toHaveBeenCalled();
  });
});
