import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

// Side-effect imports: vendored fonts, design tokens, base styles, i18n init.
import "@shared/fonts";
import "@shared/theme/tokens.css";
import "@shared/theme/base.css";
import "@shared/i18n";

import { ThemeProvider } from "@shared/theme/ThemeProvider";
import { AuthProvider } from "@modules/auth";
import { App } from "@app/App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <HashRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <App />
        </HashRouter>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
