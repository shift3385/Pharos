import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { TestPlanPage } from "@modules/test-plan";
import { TestCasesPage } from "@modules/test-cases";
import { projectApi } from "../api/projectApi";
import type { Project } from "../model/types";
import "./Projects.css";

type Tab = "plan" | "cases" | "settings";
const TABS: Tab[] = ["plan", "cases", "settings"];

/** A project's workspace: its test plan, its test cases and its settings, all
 *  scoped to this project (spec §5.1 — the project is the container). */
export function ProjectDetail({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>("plan");

  async function refresh() {
    setProject(await projectApi.get(projectId, ownerId));
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, ownerId]);

  if (!project) return <p className="tp__muted">{t("common.loading")}</p>;

  return (
    <section className="pj-detail">
      <header className="tc-editor__top">
        <button type="button" className="tp-editor__back" onClick={onClose}>
          ← {t("projects.back")}
        </button>
        <h1>{project.name}</h1>
        <span className="tc-editor__id">
          {project.caseIdPrefix}
          {"1".padStart(project.caseIdDigits, "0")}
        </span>
      </header>

      <nav className="tc-tabs" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="tc-tabs__tab"
            data-active={tab === id}
            onClick={() => setTab(id)}
          >
            {t(`projects.tab.${id}`)}
          </button>
        ))}
      </nav>

      {tab === "plan" && <TestPlanPage projectId={projectId} />}
      {tab === "cases" && (
        <TestCasesPage
          projectId={projectId}
          caseIdPrefix={project.caseIdPrefix}
          caseIdDigits={project.caseIdDigits}
        />
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
  const [digits, setDigits] = useState(project.caseIdDigits);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await projectApi.update(project.id, {
      ownerId: project.ownerId,
      name: name.trim() || project.name,
      caseIdPrefix: prefix,
      caseIdDigits: digits,
    });
    setSaving(false);
    onSaved();
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
      <label className="tp-field">
        <span>{t("projects.caseIdDigits")}</span>
        <input
          type="number"
          min={1}
          max={8}
          value={digits}
          onChange={(e) => setDigits(Math.max(1, Number(e.target.value) || 1))}
        />
      </label>
      <button
        type="button"
        className="tp-editor__save"
        onClick={save}
        disabled={saving}
      >
        {saving ? t("projects.saving") : t("projects.save")}
      </button>
    </div>
  );
}
