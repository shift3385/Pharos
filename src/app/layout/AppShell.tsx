import { useEffect, type ReactNode } from "react";
import { applyBackground } from "@modules/admin";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import "./AppShell.css";

/** Top-level layout: fixed navy sidebar + topbar + scrollable content area, with
 *  an optional user background layer behind the content. */
export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyBackground();
  }, []);

  return (
    <div className="app-shell">
      <div className="app-shell__bg" aria-hidden="true" />
      <Sidebar />
      <div className="app-shell__main">
        <Topbar />
        <main className="app-shell__content">{children}</main>
      </div>
    </div>
  );
}
