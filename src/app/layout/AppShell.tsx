import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { applyBackground } from "@modules/admin";
import { LegacyUnsentNotice, SyncStatusProvider } from "@modules/sync-offline";
import { isTauri } from "@shared/platform";
import { ADMIN, isCurrent } from "@app/navConfig";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { Sidebar } from "./Sidebar";
import { BottomNav, MobileTopbar, ProjectPills, Topbar } from "./Topbar";
import { AdminSectionNav } from "./AdminSectionNav";
import { useActiveProject, useSidebarToggle } from "./useShellState";
import "./AppShell.css";

/**
 * Top-level layout (SPEC §2, amended 2026-10-30): the app fills the window,
 * the navigation stays put and only the content scrolls. The view follows the
 * app container's width (`ViewportProvider`), not the window's:
 * - ≥ 1280 px: 248 px navy sidebar (collapsible to the 84 px strip) + 64 px top bar.
 * - 600–1279 px: 84 px icon strip + top bar.
 * - < 600 px: 56 px navy top bar + bottom bar.
 * An optional user background sits behind the content. A skip link, first in
 * the tab order, jumps past the navigation to the main content (2.4.1).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const breakpoint = useBreakpoint();
  const { collapsed, phase, toggle } = useSidebarToggle();
  const active = useActiveProject();
  useEffect(() => {
    applyBackground();
  }, []);

  const mobile = breakpoint === "mobile";
  const rail =
    breakpoint === "tablet" || (breakpoint === "desktop" && collapsed);

  return (
    // One sync state for the whole shell: the sidebar foot, the strip and the
    // mobile user sheet only show it.
    <SyncStatusProvider>
      <div className="app-shell" data-layout={breakpoint}>
        {/* The router lives in the URL hash, so following "#main-content" would
          change the route: move the focus instead. */}
        <a
          className="skip-link"
          href="#main-content"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("main-content")?.focus();
          }}
        >
          {t("a11y.skipToContent")}
        </a>
        <div className="app-shell__bg" aria-hidden="true" />
        {!mobile && (
          <Sidebar
            mode={rail ? "rail" : "full"}
            collapsible={breakpoint === "desktop"}
            onToggle={toggle}
            phase={phase}
            active={active}
          />
        )}
        <div className="app-shell__main">
          {mobile ? (
            <MobileTopbar active={active} />
          ) : (
            <Topbar active={active} />
          )}
          {mobile && active && <ProjectPills active={active} />}
          {/* Web only: data an older web version left unsent (BASE-10). */}
          {!isTauri() && (
            <div className="shell-notice sync">
              <LegacyUnsentNotice />
            </div>
          )}
          <main
            id="main-content"
            className="app-shell__content screen-root"
            tabIndex={-1}
          >
            <div className="app-shell__page">
              {isCurrent(ADMIN, pathname) && <AdminSectionNav />}
              {children}
            </div>
          </main>
          {mobile && <BottomNav />}
        </div>
      </div>
    </SyncStatusProvider>
  );
}
