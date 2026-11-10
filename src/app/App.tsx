import { useLayoutEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { ErrorBoundary } from "@shared/ui/ErrorBoundary";
import { useAuth, AuthScreen } from "@modules/auth";
import { AppShell } from "./layout/AppShell";
import { AppSplash } from "./AppSplash";
import { DbErrorScreen } from "./DbErrorScreen";
import { useDbOpenError } from "./dbStatus";
import { DashboardPage } from "./dashboard/DashboardPage";
import { ProjectDetailPage, ProjectsPage } from "@modules/projects";
import { AdminPage, adminPath } from "@modules/admin";
import { ProfilePage } from "@modules/profile";

export function App() {
  const { status } = useAuth();
  const [dbError, markDbOpened] = useDbOpenError();
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

  if (dbError)
    return <DbErrorScreen error={dbError} onRecovered={markDbOpened} />;
  if (status === "loading" || dbError === undefined) return <AppSplash />;
  if (status === "unauthenticated") return <AuthScreen />;

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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </AppShell>
  );
}
