import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useParams } from "react-router";
import { useAuth } from "@modules/auth";
import {
  PLAN_SAVED_EVENT,
  TestPlanPage,
  projectPlanClosure,
  projectPlanStatus,
} from "@modules/test-plan";
import {
  TestCasesPage,
  projectCaseCount,
  projectTraceableCases,
  type RequirementOption,
} from "@modules/test-cases";
import { PlannerBoard } from "@modules/planner";
import { DefectsPage, type LinkableItem } from "@modules/defects";
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
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  // undefined while loading; null when it does not exist (deleted, maybe on
  // another device and just synced): then the list is shown instead.
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const latest = useRef(0);
  // Cross-module options, loaded by this composing module so test-cases and
  // defects never depend on traceability (or on each other).
  const [linkableCases, setLinkableCases] = useState<LinkableItem[]>([]);
  const [linkableRequirements, setLinkableRequirements] = useState<LinkableItem[]>([]);

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
    if (tab === "defects") {
      void projectTraceableCases(projectId, ownerId).then((list) => {
        if (live) setLinkableCases(list.map((c) => ({ id: c.id, key: c.scenarioId, title: c.title })));
      });
      void requirementApi.list(projectId, ownerId).then((list) => {
        if (live) setLinkableRequirements(list.map((r) => ({ id: r.id, key: r.requirementKey, title: r.title })));
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
    // Unknown until loaded: the header shows no plan pill meanwhile.
    planStatus: facts ? facts.planStatus : undefined,
    meta: facts
      ? [
          t("projects.header.cases", { count: facts.cases }),
          t("projects.header.requirements", { count: facts.requirements.length }),
          facts.closeDate &&
            t("projects.header.closesOn", { date: shortDate(facts.closeDate, i18n.resolvedLanguage) }),
        ].filter((m): m is string => Boolean(m))
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
            requirements={facts?.requirements ?? []}
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
        {tab === "defects" && (
          <DefectsPage
            projectId={projectId}
            userId={ownerId}
            cases={linkableCases}
            requirements={linkableRequirements}
          />
        )}
        {tab === "planner" && <PlannerBoard projectId={projectId} ownerId={ownerId} />}
        {tab === "settings" && (
          <ProjectSettings project={project} onSaved={refresh} />
        )}
      </ProjectHeaderLayout>
    </section>
  );
}

interface HeaderFacts {
  planStatus: string | null;
  /** End of the test cycle from the plan schedule (YYYY-MM-DD). */
  closeDate: string | null;
  cases: number;
  /** Also the options of the cases section (loaded once, here). */
  requirements: RequirementOption[];
}

/** What the header says about the project (plan status, counts). Reloaded
 *  when the section changes (a case or requirement may have been added),
 *  after a sync and after the plan is saved. Only the newest answer is kept;
 *  a failed load keeps the last facts (the header stays as it was). */
function useHeaderFacts(projectId: string, ownerId: string, tab: ProjectSection) {
  const [facts, setFacts] = useState<HeaderFacts | null>(null);
  const latest = useRef(0);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const request = ++latest.current;
      try {
        const [planStatus, closure, cases, requirements] = await Promise.all([
          projectPlanStatus(projectId, ownerId),
          projectPlanClosure(projectId, ownerId),
          projectCaseCount(projectId, ownerId),
          requirementApi.list(projectId, ownerId),
        ]);
        if (!live || request !== latest.current) return;
        setFacts({
          planStatus,
          closeDate: closure?.closeDate ?? null,
          cases,
          requirements: requirements.map((r) => ({ requirementKey: r.requirementKey, title: r.title })),
        });
      } catch {
        // Offline or a failed query: keep what the header shows.
      }
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

/** «7 nov» from a plan date (YYYY-MM-DD, read as a local day). */
function shortDate(day: string, lang = "es"): string {
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(d).replace(".", "");
}
