import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { applyBackground } from "@modules/admin";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import "./AppShell.css";

/** Top-level layout: fixed navy sidebar + topbar + scrollable content area, with
 *  an optional user background layer behind the content. A skip link, first
 *  in the tab order, jumps past the navigation to the main content (2.4.1). */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  useEffect(() => {
    applyBackground();
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t("a11y.skipToContent")}
      </a>
      <div className="app-shell__bg" aria-hidden="true" />
      <Sidebar />
      <div className="app-shell__main">
        <Topbar />
        <main id="main-content" className="app-shell__content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
