import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import i18n from "@shared/i18n";
import { ThemeProvider } from "@shared/theme/ThemeProvider";

interface RenderOptions {
  /** Initial route for the in-memory router. */
  route?: string;
}

/** Renders a component wrapped in the app-wide providers used in production. */
export function renderWithProviders(
  ui: ReactElement,
  { route = "/" }: RenderOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ThemeProvider>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter
            initialEntries={[route]}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            {children}
          </MemoryRouter>
        </I18nextProvider>
      </ThemeProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}

export { i18n };
