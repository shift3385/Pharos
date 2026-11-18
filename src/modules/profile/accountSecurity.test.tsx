import { describe, it, expect, vi, beforeEach } from "vitest";
import "@test/slow";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, i18n } from "@test/utils";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import { AccountSecuritySection } from "./ui/AccountSecuritySection";

// Mi perfil › Seguridad de la cuenta (SEC-08, ADR-0045).

vi.mock("@modules/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@modules/auth")>();
  return {
    ...actual,
    accountApi: {
      changePassword: vi.fn(),
      recoveryStatus: vi.fn(),
      regenerateCodes: vi.fn(),
    },
  };
});

import { accountApi, ApiError } from "@modules/auth";

const CODES = [
  "7K2QD-M9XRT",
  "H4V8N-2CPWE",
  "QZ3JF-T6B1A",
  "P8WMX-4KD7R",
  "C1N5G-Y9HQV",
  "R6TEB-3MZ8K",
  "W2FQA-7JX4N",
  "D9KVC-5RP2M",
  "Y3HBT-8GW6E",
  "M5XZR-1QN9F",
];

beforeEach(async () => {
  await i18n.changeLanguage("es");
  vi.clearAllMocks();
  setViewportWidth(1440);
  vi.mocked(accountApi.recoveryStatus).mockResolvedValue({
    total: 10,
    remaining: 7,
    generatedAt: "2026-11-12T10:42:00Z",
    lastUsedAt: "2026-11-15T18:03:00Z",
  });
});

describe("change the password", () => {
  it("needs the repeat to match, then says how many devices were signed out", async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.changePassword).mockResolvedValue({
      sessionsClosed: 2,
    });
    renderWithProviders(<AccountSecuritySection />);
    await screen.findByTestId("codes-remaining");
    await expectNoAxeViolations();

    await user.type(screen.getByLabelText("Contraseña actual"), "supersecret1");
    await user.type(
      screen.getByLabelText("Contraseña nueva"),
      "a-long-passphrase",
    );
    await user.type(
      screen.getByLabelText("Repite la contraseña nueva"),
      "a-long-pass",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No coincide con la contraseña nueva.",
    );
    const submit = screen.getByRole("button", {
      name: "Cambiar la contraseña",
    });
    expect(submit).toBeDisabled();

    await user.type(
      screen.getByLabelText("Repite la contraseña nueva"),
      "phrase",
    );
    await user.click(submit);
    expect(
      await screen.findByText(
        "Contraseña cambiada. Se cerró la sesión en 2 dispositivos.",
      ),
    ).toBeInTheDocument();
    expect(accountApi.changePassword).toHaveBeenCalledWith(
      "supersecret1",
      "a-long-passphrase",
    );
    expect(screen.getByLabelText("Contraseña actual")).toHaveValue("");
  });

  it("explains a wrong current password", async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.changePassword).mockRejectedValue(
      new ApiError(403, "wrong_password", "x"),
    );
    renderWithProviders(<AccountSecuritySection />);
    await user.type(screen.getByLabelText("Contraseña actual"), "nope-nope");
    await user.type(
      screen.getByLabelText("Contraseña nueva"),
      "a-long-passphrase",
    );
    await user.type(
      screen.getByLabelText("Repite la contraseña nueva"),
      "a-long-passphrase",
    );
    await user.click(
      screen.getByRole("button", { name: "Cambiar la contraseña" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La contraseña actual no es correcta.",
    );
  });
});

describe("recovery codes", () => {
  it("shows how many are left and generates new ones behind the password", async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.regenerateCodes).mockResolvedValue({
      recoveryCodes: CODES,
    });
    renderWithProviders(<AccountSecuritySection />);
    expect(await screen.findByTestId("codes-remaining")).toHaveTextContent(
      "Te quedan 7 de 10",
    );

    await user.click(
      screen.getByRole("button", { name: "Generar códigos nuevos" }),
    );
    const confirm = screen.getByRole("dialog", {
      name: "Generar códigos de recuperación",
    });
    await user.type(
      within(confirm).getByLabelText("Contraseña actual"),
      "supersecret1",
    );
    await user.click(
      within(confirm).getByRole("button", { name: "Generar códigos nuevos" }),
    );

    const shown = await screen.findByRole("dialog", {
      name: "Guarda tus códigos de recuperación",
    });
    expect(within(shown).getByTestId("recovery-codes")).toHaveTextContent(
      CODES[9],
    );
    expect(accountApi.regenerateCodes).toHaveBeenCalledWith("supersecret1");
    const done = within(shown).getByRole("button", { name: "Listo" });
    expect(done).toBeDisabled();
    await user.click(
      within(shown).getByLabelText(
        "He guardado los códigos en un lugar seguro",
      ),
    );
    await user.click(done);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText(CODES[0])).toBeNull();
    expect(accountApi.recoveryStatus).toHaveBeenCalledTimes(2);
  });

  it("warns an account created before 0.5.0 that it has no codes, without forcing it", async () => {
    vi.mocked(accountApi.recoveryStatus).mockResolvedValue({
      total: 0,
      remaining: 0,
      generatedAt: null,
      lastUsedAt: null,
    });
    renderWithProviders(<AccountSecuritySection />);
    expect(
      await screen.findByText(/Aún no tienes códigos de recuperación/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generar códigos" }),
    ).toBeEnabled();
  });
});
