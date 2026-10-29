import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth, AuthScreen } from "@modules/auth";
import { AppShell } from "./layout/AppShell";
import { AppSplash } from "./AppSplash";
import { DbErrorScreen } from "./DbErrorScreen";
import { useDbOpenError } from "./dbStatus";
import { DashboardPage } from "./dashboard/DashboardPage";
import { ProjectsPage } from "@modules/projects";
import { TemplatesPage } from "@modules/templates";
import { AiPage } from "@modules/ai";
import { AdminPage } from "@modules/admin";
import { ProfilePage } from "@modules/profile";

export function App() {
  const { status } = useAuth();
  const dbError = useDbOpenError();

  if (dbError) return <DbErrorScreen error={dbError} />;
  if (status === "loading" || dbError === undefined) return <AppSplash />;
  if (status === "unauthenticated") return <AuthScreen />;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/ai" element={<AiPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
