import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@shared/i18n";
import pkg from "../../../package.json";
import { exportDiagnostics, logClientError } from "@shared/diagnostics";
import { ErrorBoundary } from "./ErrorBoundary";

vi.mock("@shared/diagnostics", async (original) => ({
  ...(await original<typeof import("@shared/diagnostics")>()),
  logClientError: vi.fn(),
  exportDiagnostics: vi.fn(),
}));

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error("render exploded");
  return <p>page content</p>;
}

describe("ErrorBoundary (BASE-08)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    // React reports caught render errors on console.error; keep the output clean.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows the fallback with the version and logs the error", () => {
    render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Algo salió mal")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Exportar diagnóstico" }),
    ).toBeInTheDocument();
    expect(screen.getByText(`Versión ${pkg.version}`)).toBeInTheDocument();
    expect(vi.mocked(logClientError)).toHaveBeenCalledWith(
      expect.objectContaining({ message: "render exploded" }),
      expect.anything(),
    );
  });

  it("retry renders the children again", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [explode, setExplode] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setExplode(false)}>
            fix
          </button>
          <ErrorBoundary>
            <Boom explode={explode} />
          </ErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    await user.click(screen.getByText("fix"));
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("clears the error when the reset key changes (navigation)", () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rerender(
      <ErrorBoundary resetKey="/b">
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("exports diagnostics from the fallback", async () => {
    const user = userEvent.setup();
    vi.mocked(exportDiagnostics).mockResolvedValue("pharos-diagnostic-x.zip");
    render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );
    await user.click(
      screen.getByRole("button", { name: "Exportar diagnóstico" }),
    );
    expect(
      await screen.findByText(
        "Diagnóstico guardado en pharos-diagnostic-x.zip",
      ),
    ).toBeInTheDocument();
  });
});
