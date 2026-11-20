import { describe, it, expect, beforeEach, vi } from "vitest";
import "@test/slow";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { renderWithProviders, i18n } from "@test/utils";
import { DbConvertingScreen, DbErrorScreen } from "./DbErrorScreen";
import {
  CONVERT_FAILED_ERROR,
  CONVERT_NO_SPACE_ERROR,
  DB_IN_USE_ERROR,
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

  it("takes the theme stored on this device, even with a dark system (FIX-39)", async () => {
    localStorage.setItem("pharos.theme", "light");
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("dark"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    renderWithProviders(<DbErrorScreen error={`${DB_IN_USE_ERROR}: locked`} />);
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "light"));
    vi.unstubAllGlobals();
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

  it("explains that another Pharos process has the data folder open", () => {
    const error = `${DB_IN_USE_ERROR}: another Pharos process is using this data folder`;
    renderWithProviders(<DbErrorScreen error={error} />);
    expect(
      screen.getByText("Otro Pharos está actualizando tus datos"),
    ).toBeInTheDocument();
    expect(screen.getByText(error)).toBeInTheDocument();
  });

  it("offers to try again when there was no space to convert the data", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    const error = `${CONVERT_NO_SPACE_ERROR}: need 1900 MB, 700 MB free in D:/data`;
    renderWithProviders(<DbErrorScreen error={error} onRetry={onRetry} />);
    expect(
      screen.getByText("Falta espacio para actualizar tus datos"),
    ).toBeInTheDocument();
    expect(screen.getByText(error)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("says the data is intact when the conversion failed and offers to try again", () => {
    renderWithProviders(
      <DbErrorScreen error={`${CONVERT_FAILED_ERROR}: row count differs`} onRetry={vi.fn()} />,
    );
    expect(screen.getByText(/Tus datos están intactos/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("shows the conversion screen while the data is converted", () => {
    renderWithProviders(<DbConvertingScreen />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Actualizando el formato de tus datos",
    );
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
    const wrong = await screen.findByText(/no abre esta base de datos/);
    // Since 0.6 the data file is pharos.db and its copies pharos.db.bak-…
    // (FIX-39): the 0.5 file name would send the user to the wrong copy.
    expect(wrong).toHaveTextContent("pharos.db.bak-…");
    expect(wrong).not.toHaveTextContent("pharos.db.enc");

    expect(onRecovered).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).not.toHaveTextContent("7K3M");
    expect(screen.getByRole("status")).not.toHaveTextContent(/7k3m/i);
  });

  it("names the files of 0.6 wherever the recovery key's texts mention one (FIX-39)", () => {
    for (const lng of ["es", "en"]) {
      const texts = ["recoveryKey.intro", "recoveryKey.guideBackup", "dbError.recovery.wrong"].map((k) =>
        i18n.t(k, { lng }),
      );
      for (const text of texts) {
        expect(text).toContain("pharos.db");
        expect(text).not.toContain("pharos.db.enc");
      }
      expect(texts[0]).toContain("evidence");
      expect(texts[1]).toContain("evidence");
    }
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
