import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { renderWithProviders, i18n } from "@test/utils";
import { DbErrorScreen } from "./DbErrorScreen";
import {
  INVALID_RECOVERY_KEY,
  KEY_MISMATCH_ERROR,
  KEY_MISSING_ERROR,
  NEWER_DB_ERROR,
  WRONG_RECOVERY_KEY,
} from "./dbStatus";

describe("DbErrorScreen (SEC-06)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });

  it("explains a database written by a newer Pharos", () => {
    const error = `${NEWER_DB_ERROR}: unknown migrations: 0099_future.sql`;
    renderWithProviders(<DbErrorScreen error={error} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText("Estos datos son de una versión más nueva de Pharos"),
    ).toBeInTheDocument();
    expect(screen.getByText(error)).toBeInTheDocument();
  });

  it("falls back to a generic message for other open errors", async () => {
    await i18n.changeLanguage("en");
    renderWithProviders(
      <DbErrorScreen error="failed to decrypt local database" />,
    );
    expect(
      screen.getByText("The local database could not be opened"),
    ).toBeInTheDocument();
  });
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("DbErrorScreen recovery (SEC-03)", () => {
  // A made-up key shape: the Rust side does the real check.
  const TYPED =
    "7k3m q9xa 2b4c d5e6 f7g8 h9j0 k1m2 n3p4 q5r6 s7t8 v9w0 x1y2 z3a4 b5c6";

  beforeEach(async () => {
    await i18n.changeLanguage("es");
    vi.mocked(invoke).mockReset();
  });

  it("offers the recovery key when the keychain key is missing and opens the app", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const onRecovered = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <DbErrorScreen
        error={`${KEY_MISSING_ERROR}: not in the keychain`}
        onRecovered={onRecovered}
      />,
    );
    expect(
      screen.getByText("Falta la clave de la base de datos local"),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Clave de recuperación"), TYPED);
    await user.click(
      screen.getByRole("button", { name: "Abrir con la clave" }),
    );

    expect(invoke).toHaveBeenCalledWith("db_recover", { recoveryKey: TYPED });
    await waitFor(() => expect(onRecovered).toHaveBeenCalledTimes(1));
  });

  it("explains a typo and a wrong key without repeating the key", async () => {
    const onRecovered = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <DbErrorScreen
        error={`${KEY_MISMATCH_ERROR}: another key`}
        onRecovered={onRecovered}
      />,
    );
    expect(
      screen.getByText("La clave guardada no abre la base de datos local"),
    ).toBeInTheDocument();
    const input = screen.getByLabelText("Clave de recuperación");
    const submit = screen.getByRole("button", { name: "Abrir con la clave" });

    vi.mocked(invoke).mockRejectedValueOnce(
      `${INVALID_RECOVERY_KEY}: does not pass its check`,
    );
    await user.type(input, TYPED);
    await user.click(submit);
    expect(await screen.findByText(/error de escritura/)).toBeInTheDocument();

    vi.mocked(invoke).mockRejectedValueOnce(
      `${WRONG_RECOVERY_KEY}: does not open it`,
    );
    await user.click(submit);
    expect(
      await screen.findByText(/no es la de esta base de datos/),
    ).toBeInTheDocument();

    expect(onRecovered).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).not.toHaveTextContent("7K3M");
    expect(screen.getByRole("status")).not.toHaveTextContent(/7k3m/i);
  });

  it("does not offer recovery for other open errors", () => {
    renderWithProviders(
      <DbErrorScreen
        error={`${NEWER_DB_ERROR}: unknown migrations`}
        onRecovered={vi.fn()}
      />,
    );
    expect(
      screen.queryByLabelText("Clave de recuperación"),
    ).not.toBeInTheDocument();
  });
});
