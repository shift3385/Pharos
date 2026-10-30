import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useParams } from "react-router";
import { useAuth } from "@modules/auth";
import { PLAN_SAVED_EVENT, TestPlanPage, projectPlanStatus } from "@modules/test-plan";
import {
  TestCasesPage,
  projectCaseCount,
  projectTraceableCases,
  type RequirementOption,
} from "@modules/test-cases";
import { PlannerBoard, type LinkableCase } from "@modules/planner";
import { TraceabilityPage, requirementApi } from "@modules/traceability";
import { projectApi } from "../api/projectApi";
import type { Project } from "../model/types";
import { recordProjectAccess } from "../model/lastAccess";
import {
  isProjectSection,
  projectPath,
  type ProjectSection,
} from "../model/sections";
import { ProjectHeaderLayout, type ProjectHeaderInfo } from "./ProjectHeader";
import { ProjectSettings } from "./ProjectSettings";
import "./Projects.css";

/** Route `/projects/:projectId/:section` (ADR-0029). A missing or unknown
 *  section opens the plan. Keyed by the project: switching project (e.g. from
 *  the sidebar switcher while in Ajustes) mounts a fresh workspace, so no
 *  form or option of the previous project is shown, or saved, for the new one. */
export function ProjectDetailPage() {
  const { projectId, section } = useParams();
  if (!projectId) return <Navigate to="/projects" replace />;
  if (!isProjectSection(section)) return <Navigate to={projectPath(projectId)} replace />;
  return <ProjectDetail key={projectId} projectId={projectId} tab={section} />;
}

/** A project's workspace: its test plan, its test cases and its settings, all
 *  scoped to this project (spec §5.1 — the project is the container). The open
 *  section comes from the URL. */
export function ProjectDetail({ projectId, tab }: { projectId: string; tab: ProjectSection }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  // undefined while loading; null when it does not exist (deleted, maybe on
  // another device and just synced): then the list is shown instead.
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const latest = useRef(0);
  // Cross-module options, loaded by this composing module so test-cases and
  // planner never depend on traceability (or on each other).
  const [requirements, setRequirements] = useState<RequirementOption[]>([]);
  const [linkableCases, setLinkableCases] = useState<LinkableCase[]>([]);

  /** Loads the project; an answer that arrives after a newer request is
   *  dropped, so a slow response never overwrites newer data. */
  async function refresh() {
    const request = ++latest.current;
    const found = await projectApi.get(projectId, ownerId);
    if (request === latest.current) setProject(found);
  }
  // The last access is recorded only for a project that exists.
  const exists = Boolean(project);
  useEffect(() => {
    if (exists) recordProjectAccess(ownerId, projectId);
  }, [exists, ownerId, projectId]);
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, ownerId]);

  useEffect(() => {
    let live = true;
    if (tab === "cases") {
      void requirementApi.list(projectId, ownerId).then((list) => {
        if (live)
          setRequirements(list.map((r) => ({ requirementKey: r.requirementKey, title: r.title })));
      });
    } else if (tab === "planner") {
      void projectTraceableCases(projectId, ownerId).then((list) => {
        if (live)
          setLinkableCases(list.map((c) => ({ id: c.id, scenarioId: c.scenarioId, title: c.title })));
      });
    }
    return () => {
      live = false;
    };
  }, [tab, projectId, ownerId]);

  const facts = useHeaderFacts(projectId, ownerId, tab);

  if (project === null) return <Navigate to="/projects" replace />;
  if (!project) return <p className="pj-muted">{t("common.loading")}</p>;

  const header: ProjectHeaderInfo = {
    name: project.name,
    caseIdPrefix: project.caseIdPrefix,
    planStatus: facts?.planStatus ?? null,
    meta: facts
      ? [
          t("projects.header.cases", { count: facts.cases }),
          t("projects.header.requirements", { count: facts.requirements }),
        ]
      : [],
  };

  return (
    <section className="pj-detail">
      <ProjectHeaderLayout info={header}>
        {tab === "plan" && <TestPlanPage projectId={projectId} />}
        {tab === "cases" && (
          <TestCasesPage
            projectId={projectId}
            caseIdPrefix={project.caseIdPrefix}
            caseIdDigits={project.caseIdDigits}
            requirements={requirements}
          />
        )}
        {tab === "traceability" && (
          <TraceabilityPage
            projectId={projectId}
            projectName={project.name}
            caseIdPrefix={project.caseIdPrefix}
            caseIdDigits={project.caseIdDigits}
          />
        )}
        {tab === "planner" && (
          <PlannerBoard projectId={projectId} ownerId={ownerId} cases={linkableCases} />
        )}
        {tab === "settings" && (
          <ProjectSettings project={project} onSaved={refresh} />
        )}
      </ProjectHeaderLayout>
    </section>
  );
}

interface HeaderFacts {
  planStatus: string | null;
  cases: number;
  requirements: number;
}

/** What the header says about the project (plan status, counts). Reloaded
 *  when the section changes (a case or requirement may have been added), after
 *  a sync and after the plan is saved; a late answer for an older request is dropped. */
function useHeaderFacts(projectId: string, ownerId: string, tab: ProjectSection) {
  const [facts, setFacts] = useState<HeaderFacts | null>(null);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const [planStatus, cases, requirements] = await Promise.all([
        projectPlanStatus(projectId, ownerId),
        projectCaseCount(projectId, ownerId),
        requirementApi.list(projectId, ownerId),
      ]);
      if (live) setFacts({ planStatus, cases, requirements: requirements.length });
    };
    void load();
    window.addEventListener("pharos:synced", load);
    window.addEventListener(PLAN_SAVED_EVENT, load);
    return () => {
      live = false;
      window.removeEventListener("pharos:synced", load);
      window.removeEventListener(PLAN_SAVED_EVENT, load);
    };
  }, [projectId, ownerId, tab]);
  return facts;
}
