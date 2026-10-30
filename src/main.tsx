import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

// Side-effect imports: vendored fonts, design tokens, base styles, i18n init.
import "@shared/fonts";
import "@shared/theme/tokens.css";
import "@shared/theme/base.css";
import "@shared/theme/typography.css";
import "@shared/i18n";

import { installGlobalErrorHandlers } from "@shared/diagnostics";
import { ErrorBoundary } from "@shared/ui/ErrorBoundary";
import { RethrowRouteError } from "@shared/ui/RethrowRouteError";
import { ThemeProvider } from "@shared/theme/ThemeProvider";
import { ToastProvider } from "@shared/ui/Toast";
import { ViewportProvider } from "@shared/ui/ViewportProvider";
import { AuthProvider } from "@modules/auth";
import { App } from "@app/App";

// Uncaught errors and rejections go to the desktop log (BASE-08).
installGlobalErrorHandlers();

// A data router (RED-V3k) so screens can hold a navigation that would drop
// unsaved changes (`useBlocker`, `useUnsavedChangesGuard`). One splat route
// renders the app, which keeps declaring its own `<Routes>` unchanged.
const router = createHashRouter([
  {
    path: "*",
    // A crash in the shell goes to our ErrorBoundary below, not to React
    // Router's default error screen.
    ErrorBoundary: RethrowRouteError,
    element: (
      // Measures the app container for every screen, sign-in included.
      <ViewportProvider>
        <App />
      </ViewportProvider>
    ),
  },
]);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary variant="app">
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
