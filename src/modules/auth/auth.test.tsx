import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "@shared/i18n";
import { ThemeProvider } from "@shared/theme/ThemeProvider";
import { AuthProvider } from "./state/AuthProvider";
import { AuthScreen } from "./ui/AuthScreen";

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
});
