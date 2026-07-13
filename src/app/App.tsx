import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { DashboardPage } from "./dashboard/DashboardPage";
import { ProjectsPage } from "@modules/projects";
import { TestPlanPage } from "@modules/test-plan";
import { TestCasesPage } from "@modules/test-cases";
import { PlannerPage } from "@modules/planner";
import { TemplatesPage } from "@modules/templates";
import { AiPage } from "@modules/ai";
import { AdminPage } from "@modules/admin";

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/test-plan" element={<TestPlanPage />} />
        <Route path="/test-cases" element={<TestCasesPage />} />
        <Route path="/planner" element={<PlannerPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/ai" element={<AiPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
