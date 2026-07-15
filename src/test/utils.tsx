import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import i18n from "@shared/i18n";
import { ThemeProvider } from "@shared/theme/ThemeProvider";
import { AuthProvider } from "@modules/auth";

const FAKE_SESSION = {
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token",
  user: {
    id: "test-user",
    email: "qa@pharos.dev",
    displayName: "QA",
    firstName: "Quality",
    lastName: "Analyst",
    role: "test_manager",
    createdAt: new Date().toISOString(),
  },
};

interface RenderOptions {
  /** Initial route for the in-memory router. */
  route?: string;
  /** Start with an authenticated session (default) or the login screen. */
  authenticated?: boolean;
}

/** Renders a component wrapped in the app-wide providers used in production. */
export function renderWithProviders(
  ui: ReactElement,
  { route = "/", authenticated = true }: RenderOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ThemeProvider>
        <I18nextProvider i18n={i18n}>
          <AuthProvider initialSession={authenticated ? FAKE_SESSION : null}>
            <MemoryRouter
              initialEntries={[route]}
              future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
              {children}
            </MemoryRouter>
          </AuthProvider>
        </I18nextProvider>
      </ThemeProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}

export { i18n };
