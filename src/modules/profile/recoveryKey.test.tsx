import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { expectNoAxeViolations } from "@test/axe";
import { RecoveryKeySection } from "./ui/RecoveryKeySection";

vi.mock("./api/recoveryKeyApi", () => ({
  recoveryKeyApi: {
    available: vi.fn(),
    reveal: vi.fn(),
    lastShownAt: vi.fn(),
    markShown: vi.fn(),
  },
}));

import { recoveryKeyApi } from "./api/recoveryKeyApi";

// A made-up key shape: the format itself is tested in Rust (recovery.rs).
const KEY =
  "7K3M-Q9XA-2B4C-D5E6-F7G8-H9J0-K1M2-N3P4-Q5R6-S7T8-V9W0-X1Y2-Z3A4-B5C6";

describe("recovery key export (SEC-03)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    vi.clearAllMocks();
    vi.mocked(recoveryKeyApi.available).mockReturnValue(true);
    vi.mocked(recoveryKeyApi.reveal).mockResolvedValue(KEY);
    vi.mocked(recoveryKeyApi.lastShownAt).mockReturnValue(null);
    vi.mocked(recoveryKeyApi.markShown).mockReturnValue("2026-10-29T10:00:00Z");
  });

  it("asks before revealing, shows the key once and forgets it on close", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecoveryKeySection />);

    await user.click(
      screen.getByRole("button", { name: "Mostrar clave de recuperación" }),
    );
    expect(
      screen.getByText("¿Mostrar la clave de recuperación?"),
    ).toBeInTheDocument();
    expect(recoveryKeyApi.reveal).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Mostrar" }));
    const shown = await screen.findByTestId("recovery-key");
    expect(shown.querySelectorAll("code")).toHaveLength(14);
    expect(shown).toHaveTextContent("7K3M");
    expect(screen.getByText(/gestor de contraseñas/)).toBeInTheDocument();

    // Nothing reaches the clipboard without a click (user-event stubs it).
    expect(await navigator.clipboard.readText()).toBe("");
    const close = screen.getByRole("button", { name: "Cerrar" });
    expect(close).toBeDisabled();
    await user.click(
      screen.getByLabelText("Ya la he guardado en un lugar seguro"),
    );
    await user.click(close);

    expect(screen.queryByTestId("recovery-key")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("7K3M");
    expect(recoveryKeyApi.markShown).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Mostrada por última vez/)).toBeInTheDocument();
  });

  it("both dialogs pass axe; Escape cancels the question but not the key (UX-05)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecoveryKeySection />);
    const open = screen.getByRole("button", { name: "Mostrar clave de recuperación" });
    await user.click(open);
    expect(screen.getByRole("dialog", { name: "¿Mostrar la clave de recuperación?" })).toBeInTheDocument();
    await expectNoAxeViolations();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(open).toHaveFocus();

    await user.click(open);
    await user.click(screen.getByRole("button", { name: "Mostrar" }));
    await screen.findByTestId("recovery-key");
    await expectNoAxeViolations();
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("recovery-key")).toBeInTheDocument();
  });

  it("copies the key only when the user clicks Copy", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecoveryKeySection />);
    await user.click(
      screen.getByRole("button", { name: "Mostrar clave de recuperación" }),
    );
    await user.click(screen.getByRole("button", { name: "Mostrar" }));
    await screen.findByTestId("recovery-key");

    await user.click(
      screen.getByRole("button", { name: "Copiar al portapapeles" }),
    );
    expect(await navigator.clipboard.readText()).toBe(KEY);
    expect(screen.getByRole("button", { name: "Copiada" })).toBeInTheDocument();
  });

  it("cancelling the confirmation never asks for the key", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecoveryKeySection />);
    await user.click(
      screen.getByRole("button", { name: "Mostrar clave de recuperación" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(recoveryKeyApi.reveal).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is disabled outside the desktop app", () => {
    vi.mocked(recoveryKeyApi.available).mockReturnValue(false);
    renderWithProviders(<RecoveryKeySection />);
    expect(
      screen.getByRole("button", { name: "Mostrar clave de recuperación" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Disponible solo en la app de escritorio."),
    ).toBeInTheDocument();
  });
});
