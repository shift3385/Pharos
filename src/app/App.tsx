import { useLayoutEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { ErrorBoundary } from "@shared/ui/ErrorBoundary";
import { useAuth, AuthScreen, RESET_PATH } from "@modules/auth";
import { AppShell } from "./layout/AppShell";
import { AppSplash } from "./AppSplash";
import { DbConvertingScreen, DbErrorScreen } from "./DbErrorScreen";
import { useDbOpenError, useExternalDbChanges } from "./dbStatus";
import { DashboardPage } from "./dashboard/DashboardPage";
import { ProjectDetailPage, ProjectsPage } from "@modules/projects";
import { AdminPage, adminPath } from "@modules/admin";
import { ProfilePage } from "@modules/profile";
import { JoinWorkspacePage, WorkspaceMembersPage } from "@modules/workspaces";

export function App() {
  const { status } = useAuth();
  const db = useDbOpenError();
  useExternalDbChanges();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // Signing in always opens Inicio (UX-27), wherever the last session ended
  // (the address stays on the sign-in screen). Restoring a saved session at
  // startup or on a reload keeps the address.
  const previous = useRef(status);
  useLayoutEffect(() => {
    if (previous.current === "unauthenticated" && status === "authenticated" && pathname !== "/")
      navigate("/", { replace: true });
    previous.current = status;
  }, [status, pathname, navigate]);

  if (db.error)
    return (
      <DbErrorScreen error={db.error} onRecovered={db.markOpened} onRetry={db.retry} />
    );
  if (db.error === undefined && db.converting) return <DbConvertingScreen />;
  if (status === "loading" || db.error === undefined) return <AppSplash />;
  // The reset link opens its page even in a signed-in browser (ADR-0045).
  if (status === "unauthenticated" || pathname === RESET_PATH) return <AuthScreen />;

  return (
    <AppShell>
      {/* A crashing page keeps the shell usable; navigating away clears it. */}
      <ErrorBoundary resetKey={pathname}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          {/* A project and its section live in the URL (ADR-0029). */}
          <Route path="/projects/:projectId/:section?" element={<ProjectDetailPage />} />
          {/* A run of «Ejecuciones» (EJE-02). */}
          <Route path="/projects/:projectId/runs/:runId" element={<ProjectDetailPage />} />
          {/* Plantillas and Motor de IA are Administration tabs (ADR-0031). */}
          <Route path="/templates" element={<Navigate to={adminPath("templates")} replace />} />
          <Route path="/ai" element={<Navigate to={adminPath("ai")} replace />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          {/* Workspaces with roles (SYNC-07, ADR-0042). */}
          <Route path="/workspaces/members" element={<WorkspaceMembersPage />} />
          <Route path="/workspaces/join" element={<JoinWorkspacePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </AppShell>
  );
}
