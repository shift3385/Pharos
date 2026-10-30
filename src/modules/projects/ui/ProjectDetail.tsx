import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router";
import { useAuth } from "@modules/auth";
import { useToast } from "@shared/ui/Toast";
import { ErrorSummary, FormField } from "@shared/ui/FormField";
import { useSaveGuard } from "@shared/ui/fieldProps";
import { numberInRange } from "@shared/validation";
import { TestPlanPage } from "@modules/test-plan";
import { TestCasesPage, projectTraceableCases, type RequirementOption } from "@modules/test-cases";
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
import "./Projects.css";

/** Route `/projects/:projectId/:section` (ADR-0029). A missing or unknown
 *  section opens the plan. */
export function ProjectDetailPage() {
  const { projectId, section } = useParams();
  if (!projectId) return <Navigate to="/projects" replace />;
  if (!isProjectSection(section)) return <Navigate to={projectPath(projectId)} replace />;
  return <ProjectDetail projectId={projectId} tab={section} />;
}

/** A project's workspace: its test plan, its test cases and its settings, all
 *  scoped to this project (spec §5.1 — the project is the container). The open
 *  section comes from the URL. */
export function ProjectDetail({ projectId, tab }: { projectId: string; tab: ProjectSection }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const [project, setProject] = useState<Project | null>(null);
  // Cross-module options, loaded by this composing module so test-cases and
  // planner never depend on traceability (or on each other).
  const [requirements, setRequirements] = useState<RequirementOption[]>([]);
  const [linkableCases, setLinkableCases] = useState<LinkableCase[]>([]);

  async function refresh() {
    setProject(await projectApi.get(projectId, ownerId));
  }
  useEffect(() => {
    recordProjectAccess(ownerId, projectId);
  }, [ownerId, projectId]);
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, ownerId]);

  useEffect(() => {
    if (tab === "cases") {
      void requirementApi.list(projectId, ownerId).then((list) =>
        setRequirements(list.map((r) => ({ requirementKey: r.requirementKey, title: r.title }))),
      );
    } else if (tab === "planner") {
      void projectTraceableCases(projectId, ownerId).then((list) =>
        setLinkableCases(list.map((c) => ({ id: c.id, scenarioId: c.scenarioId, title: c.title }))),
      );
    }
  }, [tab, projectId, ownerId]);

  if (!project) return <p className="tp__muted">{t("common.loading")}</p>;

  return (
    <section className="pj-detail">
      <header className="tc-editor__top">
        <Link to="/projects" className="tp-editor__back">
          ← {t("projects.back")}
        </Link>
        <h1>{project.name}</h1>
        <span className="tc-editor__id">
          {project.caseIdPrefix}
          {"1".padStart(project.caseIdDigits, "0")}
        </span>
      </header>

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
    </section>
  );
}

function ProjectSettings({
  project,
  onSaved,
}: {
  project: Project;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(project.name);
  const [prefix, setPrefix] = useState(project.caseIdPrefix);
  // Kept as typed, so "" or 9 shows an error instead of being silently
  // replaced; the digits shape every case ID, so a bad value blocks saving.
  const [digitsText, setDigitsText] = useState(String(project.caseIdDigits));
  const digitsIssue = numberInRange(digitsText, { min: 1, max: 8, integer: true });
  const digits = digitsIssue ? project.caseIdDigits : Number(digitsText);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { guard, showSummary, summaryRef } = useSaveGuard(digitsIssue !== null);

  async function save() {
    setSaving(true);
    try {
      await projectApi.update(project.id, {
        ownerId: project.ownerId,
        name: name.trim() || project.name,
        caseIdPrefix: prefix,
        caseIdDigits: digits,
      });
      toast(t("projects.savedToast"));
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const preview = `${prefix || "ATS_"}${"1".padStart(digits, "0")}`;

  return (
    <div className="tc-form" style={{ maxWidth: 520 }}>
      <label className="tp-field">
        <span>{t("projects.name")}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="tp-field">
        <span>{t("projects.caseIdPrefix")}</span>
        <input
          value={prefix}
          placeholder="ATS_"
          onChange={(e) => setPrefix(e.target.value)}
        />
        <span className="tp-field__hint">
          {t("projects.prefixHint")} <code>{preview}</code>
        </span>
      </label>
      <FormField id="pj-digits" label={t("projects.caseIdDigits")} issue={digitsIssue} required>
        {(p) => (
          <input
            {...p}
            type="number"
            min={1}
            max={8}
            value={digitsText}
            onChange={(e) => setDigitsText(e.target.value)}
          />
        )}
      </FormField>
      {showSummary && digitsIssue && (
        <ErrorSummary
          ref={summaryRef}
          items={[{ label: t("projects.caseIdDigits"), issue: digitsIssue, fieldId: "pj-digits" }]}
        />
      )}
      <button
        type="button"
        className="tp-editor__save"
        onClick={() => guard(() => void save())}
        disabled={saving}
      >
        {saving ? t("projects.saving") : t("projects.save")}
      </button>
    </div>
  );
}
