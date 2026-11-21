import { describe, it, expect, vi, beforeEach } from "vitest";
import "@test/slow";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "@shared/i18n";
import { ThemeProvider } from "@shared/theme/ThemeProvider";
import { TestRouter } from "@test/TestRouter";
import { setViewportWidth } from "@test/viewport";
import { expectNoAxeViolations } from "@test/axe";
import { AuthProvider } from "./state/AuthProvider";
import { useAuth } from "./state/useAuth";
import { AuthScreen } from "./ui/AuthScreen";
import { tokenFromLink } from "./api/accountApi";

// Account recovery screens (SEC-08, SEC-09 by email; ADR-0045).

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
vi.mock("./api/accountApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/accountApi")>();
  return {
    ...actual,
    accountApi: {
      capabilities: vi.fn(),
      recover: vi.fn(),
      requestReset: vi.fn(),
      checkReset: vi.fn(),
      confirmReset: vi.fn(),
      changePassword: vi.fn(),
      recoveryStatus: vi.fn(),
      regenerateCodes: vi.fn(),
    },
  };
});

import { authApi, ApiError } from "./api/authApi";
import { accountApi } from "./api/accountApi";

const user0 = {
  id: "u1",
  email: "qa@pharos.dev",
  displayName: "QA",
  firstName: "Ana",
  lastName: "Pérez",
  role: "test_manager",
  createdAt: new Date().toISOString(),
};
const session = { accessToken: "a", refreshToken: "r", user: user0 };
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

function memoryStore() {
  let saved: unknown = null;
  return {
    load: async () => saved as never,
    save: async (s: unknown) => void (saved = s),
    clear: async () => void (saved = null),
  };
}

/** The status, so a test sees when the app would open. */
function Status() {
  const { status } = useAuth();
  return <output data-testid="status">{status}</output>;
}

function renderScreen(route = "/") {
  return render(
    <ThemeProvider>
      <I18nextProvider i18n={i18n}>
        <AuthProvider store={memoryStore()}>
          <TestRouter route={route}>
            <Status />
            <AuthScreen />
          </TestRouter>
        </AuthProvider>
      </I18nextProvider>
    </ThemeProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("es");
  vi.clearAllMocks();
  setViewportWidth(1440);
  vi.mocked(accountApi.capabilities).mockResolvedValue({ emailReset: false });
});

describe("recovery codes at sign-up", () => {
  it("shows the codes once and opens the app only after «He guardado…»", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.register).mockResolvedValue({
      ...session,
      recoveryCodes: CODES,
    });
    renderScreen();
    await user.click(screen.getByRole("button", { name: "Regístrate" }));
    await user.type(screen.getByLabelText("Nombre"), "Ana");
    await user.type(screen.getByLabelText("Apellidos"), "Pérez");
    await user.type(screen.getByLabelText("Alias (nombre para mostrar)"), "QA");
    await user.type(
      screen.getByLabelText("Correo electrónico"),
      "QA@pharos.dev",
    );
    await user.type(screen.getByLabelText("Contraseña"), "supersecret1");
    await user.click(screen.getByRole("button", { name: "Registrarme" }));

    expect(
      await screen.findByRole("heading", {
        name: "Guarda tus códigos de recuperación",
      }),
    ).toBeInTheDocument();
    const list = screen.getByTestId("recovery-codes");
    for (const c of CODES) expect(list).toHaveTextContent(c);
    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
    await expectNoAxeViolations();

    const go = screen.getByRole("button", { name: "Continuar" });
    expect(go).toBeDisabled();
    await user.click(
      screen.getByLabelText("He guardado los códigos en un lugar seguro"),
    );
    await user.click(go);
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );
  });
});

describe("«¿Olvidaste tu contraseña?»", () => {
  it("recovers with a code, checks the repeat and signs in", async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.recover).mockResolvedValue({
      ...session,
      recoveryCodesRemaining: 2,
    });
    renderScreen();
    await user.click(
      screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" }),
    );
    expect(
      screen.getByRole("heading", { name: "Recupera el acceso" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Con un código" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.type(
      screen.getByLabelText("Correo electrónico"),
      "qa@pharos.dev",
    );
    await user.type(
      screen.getByLabelText("Código de recuperación"),
      "7k2qd-m9xrt",
    );
    await user.type(
      screen.getByLabelText("Contraseña nueva"),
      "a-long-passphrase",
    );
    await user.type(
      screen.getByLabelText("Repite la contraseña nueva"),
      "a-long-passphrasX",
    );
    await user.click(
      screen.getByRole("button", { name: "Cambiar la contraseña y entrar" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No coincide con la contraseña nueva.",
    );
    expect(accountApi.recover).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Repite la contraseña nueva"));
    await user.type(
      screen.getByLabelText("Repite la contraseña nueva"),
      "a-long-passphrase",
    );
    await user.click(
      screen.getByRole("button", { name: "Cambiar la contraseña y entrar" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );
    expect(accountApi.recover).toHaveBeenCalledWith({
      email: "qa@pharos.dev",
      code: "7k2qd-m9xrt",
      newPassword: "a-long-passphrase",
    });
  });

  it("says the email or the code is not valid, without saying which", async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.recover).mockRejectedValue(
      new ApiError(400, "invalid_recovery", "x"),
    );
    renderScreen();
    await user.click(
      screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" }),
    );
    await user.type(
      screen.getByLabelText("Correo electrónico"),
      "qa@pharos.dev",
    );
    await user.type(
      screen.getByLabelText("Código de recuperación"),
      "00000-00000",
    );
    await user.type(
      screen.getByLabelText("Contraseña nueva"),
      "a-long-passphrase",
    );
    await user.type(
      screen.getByLabelText("Repite la contraseña nueva"),
      "a-long-passphrase",
    );
    await user.click(
      screen.getByRole("button", { name: "Cambiar la contraseña y entrar" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El correo o el código no son válidos.",
    );
  });

  it("explains that the server sends no email, and still accepts a pasted link", async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.checkReset).mockResolvedValue({
      email: "qa@pharos.dev",
    });
    renderScreen();
    await user.click(
      screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" }),
    );
    await user.click(screen.getByRole("tab", { name: "Por correo" }));
    expect(
      await screen.findByText(/Este servidor no envía correos/),
    ).toBeInTheDocument();
    // FIX-46: without mail the send form is not offered at all.
    expect(screen.queryByRole("button", { name: "Enviar enlace" })).toBeNull();
    expect(document.getElementById("reset-email")).toBeNull();

    await user.type(
      screen.getByLabelText("¿Ya tienes el enlace?"),
      "https://qa.example.com/#/restablecer?token=abcdefghijklmnopqrstuvwxyz012345",
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      await screen.findByText("Cuenta: qa@pharos.dev"),
    ).toBeInTheDocument();
    expect(accountApi.checkReset).toHaveBeenCalledWith(
      "abcdefghijklmnopqrstuvwxyz012345",
    );
  });

  it("sends the link with the app's language and answers the same for any email", async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.capabilities).mockResolvedValue({ emailReset: true });
    vi.mocked(accountApi.requestReset).mockResolvedValue({
      status: "sent_if_registered",
    });
    renderScreen();
    await user.click(
      screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" }),
    );
    await user.click(screen.getByRole("tab", { name: "Por correo" }));
    const send = screen.getByRole("button", { name: "Enviar enlace" });
    await waitFor(() =>
      expect(screen.getByLabelText("Correo electrónico")).toBeEnabled(),
    );
    await user.type(
      screen.getByLabelText("Correo electrónico"),
      "qa@pharos.dev",
    );
    await user.click(send);
    expect(
      await screen.findByText(/Si hay una cuenta con ese correo/),
    ).toBeInTheDocument();
    expect(accountApi.requestReset).toHaveBeenCalledWith("qa@pharos.dev", "es");
  });
});

describe("the reset page", () => {
  it("opens from the link, sets the password and goes back to sign in", async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.checkReset).mockResolvedValue({
      email: "qa@pharos.dev",
    });
    vi.mocked(accountApi.confirmReset).mockResolvedValue(null);
    renderScreen("/restablecer?token=tok_abcdefghijklmnopqrstuvwxyz");
    expect(
      await screen.findByRole("heading", {
        name: "Elige una contraseña nueva",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Cuenta: qa@pharos.dev"),
    ).toBeInTheDocument();
    await expectNoAxeViolations();
    await user.type(
      screen.getByLabelText("Contraseña nueva"),
      "a-long-passphrase",
    );
    await user.type(
      screen.getByLabelText("Repite la contraseña nueva"),
      "a-long-passphrase",
    );
    await user.click(
      screen.getByRole("button", { name: "Guardar la contraseña" }),
    );
    expect(
      await screen.findByText(/Se cerró la sesión en todos tus dispositivos/),
    ).toBeInTheDocument();
    expect(accountApi.confirmReset).toHaveBeenCalledWith(
      "tok_abcdefghijklmnopqrstuvwxyz",
      "a-long-passphrase",
    );
    await user.click(screen.getByRole("button", { name: "Inicia sesión" }));
    expect(
      screen.getByRole("heading", { name: "Iniciar sesión" }),
    ).toBeInTheDocument();
  });

  it("names the server administrator who made the link (SEC-11)", async () => {
    vi.mocked(accountApi.checkReset).mockResolvedValue({ email: "qa@pharos.dev", issuedBy: "Luis Gómez" });
    renderScreen("/restablecer?token=tok_abcdefghijklmnopqrstuvwxyz");
    expect(
      await screen.findByText("Enlace generado por Luis Gómez (administrador del servidor)"),
    ).toBeInTheDocument();
  });

  it("tells an expired or used link and offers another", async () => {
    const user = userEvent.setup();
    vi.mocked(accountApi.checkReset).mockRejectedValue(
      new ApiError(400, "invalid_reset_token", "x"),
    );
    renderScreen("/restablecer?token=tok_abcdefghijklmnopqrstuvwxyz");
    expect(
      await screen.findByText(/Este enlace no es válido o ha caducado/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pedir otro enlace" }));
    expect(screen.getByRole("tab", { name: "Por correo" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("tokenFromLink", () => {
  it("takes the token from the link or a bare token, and nothing else", () => {
    expect(
      tokenFromLink(
        " https://x.dev/#/restablecer?token=Ab_c-12345678901234567890 ",
      ),
    ).toBe("Ab_c-12345678901234567890");
    expect(tokenFromLink("Ab_c-12345678901234567890")).toBe(
      "Ab_c-12345678901234567890",
    );
    expect(tokenFromLink("hola")).toBeNull();
    expect(tokenFromLink("")).toBeNull();
  });
});
