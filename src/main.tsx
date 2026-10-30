import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router";

// Side-effect imports: vendored fonts, design tokens, base styles, i18n init.
import "@shared/fonts";
import "@shared/theme/tokens.css";
import "@shared/theme/base.css";
import "@shared/theme/typography.css";
import "@shared/i18n";

import { installGlobalErrorHandlers } from "@shared/diagnostics";
import { ErrorBoundary } from "@shared/ui/ErrorBoundary";
import { ThemeProvider } from "@shared/theme/ThemeProvider";
import { ToastProvider } from "@shared/ui/Toast";
import { AuthProvider } from "@modules/auth";
import { App } from "@app/App";

// Uncaught errors and rejections go to the desktop log (BASE-08).
installGlobalErrorHandlers();

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
            <HashRouter>
              <App />
            </HashRouter>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
