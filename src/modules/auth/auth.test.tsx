import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "@shared/i18n";
import { ThemeProvider } from "@shared/theme/ThemeProvider";
import { AuthProvider } from "./state/AuthProvider";
import { AuthScreen } from "./ui/AuthScreen";
import { renderWithProviders } from "@test/utils";
import { setViewportWidth } from "@test/viewport";

vi.mock("./api/authApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/authApi")>();
  return {
    ...actual,
    authApi: {
      login: vi.fn(),
      register: vi.fn(),
      refresh: vi.fn(),
      logout: vi.fn(),
      me: vi.fn(),
    },
  };
});

import { authApi, ApiError } from "./api/authApi";

const emptyStore = {
  load: async () => null,
  save: async () => {},
  clear: async () => {},
};

const fakeSession = {
  accessToken: "a",
  refreshToken: "r",
  user: {
    id: "1",
    email: "qa@pharos.dev",
    displayName: "QA",
    firstName: "Quality",
    lastName: "Analyst",
    role: "test_manager",
    createdAt: new Date().toISOString(),
  },
};

function renderAuthScreen() {
  return render(
    <ThemeProvider>
      <I18nextProvider i18n={i18n}>
        <AuthProvider store={emptyStore}>
          <AuthScreen />
        </AuthProvider>
      </I18nextProvider>
    </ThemeProvider>,
  );
}

describe("auth screen", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    vi.clearAllMocks();
  });

  it("submits login credentials to the API", async () => {
    vi.mocked(authApi.login).mockResolvedValue(fakeSession);
    const user = userEvent.setup();
    renderAuthScreen();

    await user.type(
      screen.getByLabelText("Correo electrónico"),
      "qa@pharos.dev",
    );
    await user.type(screen.getByLabelText("Contraseña"), "supersecret1");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(authApi.login).toHaveBeenCalledWith({
      email: "qa@pharos.dev",
      password: "supersecret1",
    });
  });

  it("shows a localized error on invalid credentials", async () => {
    vi.mocked(authApi.login).mockRejectedValue(
      new ApiError(401, "invalid_credentials", "nope"),
    );
    const user = userEvent.setup();
    renderAuthScreen();

    await user.type(
      screen.getByLabelText("Correo electrónico"),
      "qa@pharos.dev",
    );
    await user.type(screen.getByLabelText("Contraseña"), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Correo o contraseña incorrectos.",
    );
  });

  it("explains the login attempt limit (429 rate_limited)", async () => {
    vi.mocked(authApi.login).mockRejectedValue(
      new ApiError(429, "rate_limited", "Too many attempts."),
    );
    const user = userEvent.setup();
    renderAuthScreen();

    await user.type(
      screen.getByLabelText("Correo electrónico"),
      "qa@pharos.dev",
    );
    await user.type(screen.getByLabelText("Contraseña"), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Demasiados intentos. Espera un momento y vuelve a intentarlo.",
    );
  });
});

describe("login layout (RED-V1, SPEC §8)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });

  it("switches to the sign-up form from «Regístrate» and back", async () => {
    const user = userEvent.setup();
    setViewportWidth(1440);
    renderWithProviders(<AuthScreen />, { authenticated: false });

    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toHaveAttribute(
      "placeholder",
      "nombre@empresa.com",
    );
    await user.click(screen.getByRole("button", { name: "Regístrate" }));
    expect(screen.getByRole("heading", { name: "Crear cuenta" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toBeRequired();
    await user.click(screen.getByRole("button", { name: "Inicia sesión" }));
    expect(screen.queryByLabelText("Nombre")).toBeNull();
  });

  it("keeps Google sign-in disabled and explains why", () => {
    setViewportWidth(1440);
    renderWithProviders(<AuthScreen />, { authenticated: false });
    const google = screen.getByTestId("login-google");
    expect(google).toBeDisabled();
    expect(google).toHaveTextContent("Continuar con Google");
    expect(google).toHaveTextContent("Próximamente");
    expect(google).toHaveAttribute("title", "Inicio de sesión con Google: próximamente");
  });

  it("shows and hides the password", async () => {
    const user = userEvent.setup();
    setViewportWidth(1440);
    renderWithProviders(<AuthScreen />, { authenticated: false });
    const password = screen.getByLabelText("Contraseña");
    const reveal = screen.getByRole("button", { name: "Mostrar contraseña" });
    expect(password).toHaveAttribute("type", "password");
    await user.click(reveal);
    expect(password).toHaveAttribute("type", "text");
    expect(reveal).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the brand panel and the version from 600 px", () => {
    setViewportWidth(600);
    renderWithProviders(<AuthScreen />, { authenticated: false });
    expect(screen.getByRole("complementary", { name: "Pharos" })).toHaveTextContent(
      "Trazabilidad requisito ↔ caso ↔ defecto",
    );
    expect(screen.getByText(/^v\d/)).toBeInTheDocument();
  });

  it("on mobile drops the panel and opens the languages as a sheet", async () => {
    const user = userEvent.setup();
    setViewportWidth(390);
    renderWithProviders(<AuthScreen />, { authenticated: false });
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByText("Tus datos se guardan cifrados en este equipo.")).toBeInTheDocument();

    await user.click(screen.getByTestId("login-language"));
    const sheet = screen.getByRole("dialog", { name: "Idioma" });
    await user.click(within(sheet).getByTestId("lang-en"));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});
