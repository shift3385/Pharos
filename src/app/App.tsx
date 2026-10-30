import { Navigate, Route, Routes, useLocation } from "react-router";
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
