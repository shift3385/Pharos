import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Archive, Check, Download, Hash, Trash2 } from "lucide-react";
import { projectCaseCount } from "@modules/test-cases";
import { projectHasPlan } from "@modules/test-plan";
import { projectCardCount } from "@modules/planner";
import { requirementApi } from "@modules/traceability";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { ErrorSummary, FormField } from "@shared/ui/FormField";
import { useSaveGuard } from "@shared/ui/fieldProps";
import { required } from "@shared/validation";
import { useToast } from "@shared/ui/Toast";
import { useAuth } from "@modules/auth";
import { projectApi } from "../api/projectApi";
import { deleteConfirmWord } from "../model/projectTable";
import type { Project } from "../model/types";
import { useProjectExport } from "./useProjectExport";
import "./ProjectHeader.css";
import "./Projects.css";

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8];

interface LossSummary {
  plans: number;
  cases: number;
  requirements: number;
  cards: number;
}

/** Ajustes del proyecto (ScrAjustesProyecto): General (name and case
 *  numbering), «Exportar proyecto (ZIP)» and «Eliminar proyecto». */
export function ProjectSettings({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const owner = user?.id ?? "";
  const navigate = useNavigate();
  const { exportProject, busy, progressModal } = useProjectExport();
  const [name, setName] = useState(project.name);
  const [prefix, setPrefix] = useState(project.caseIdPrefix);
  const [digits, setDigits] = useState(project.caseIdDigits);
  const [saving, setSaving] = useState(false);
  const nameIssue = required(name);
  const { guard, showSummary, attempted, summaryRef } = useSaveGuard(nameIssue !== null);
  const [loss, setLoss] = useState<LossSummary | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await projectApi.update(project.id, {
        ownerId: project.ownerId,
        name: name.trim(),
        caseIdPrefix: prefix,
        caseIdDigits: digits,
      });
      toast(t("projects.savedToast"));
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  /** Counts what the deletion takes with it, then asks. */
  async function askDelete() {
    const [plan, cases, requirements, cards] = await Promise.all([
      projectHasPlan(project.id, owner),
      projectCaseCount(project.id, owner),
      requirementApi.list(project.id, owner),
      projectCardCount(project.id, owner),
    ]);
    setLoss({ plans: plan ? 1 : 0, cases, requirements: requirements.length, cards });
    setConfirming(true);
  }

  async function remove() {
    setConfirming(false);
    await projectApi.remove(project.id, owner);
    toast(t("projects.settings.deletedToast", { name: project.name }));
    navigate("/projects", { replace: true });
  }

  const sample = (n: number) => `${prefix}${String(n).padStart(digits, "0")}`;
  const word = deleteConfirmWord(project);

  return (
    <div className="pj-settings">
      <section className="pj-card-box" aria-labelledby="pj-general-title">
        <div className="pj-card-box__head">
          <h2 id="pj-general-title" className="pj-section-title">
            {t("projects.settings.general")}
          </h2>
          <p className="pj-card-box__desc">{t("projects.settings.generalDesc")}</p>
        </div>
        <FormField
          id="pj-name"
          label={t("projects.name")}
          issue={attempted ? nameIssue : null}
          required
        >
          {(p) => (
            <input
              {...p}
              className="pj-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </FormField>
        <div className="pj-settings__row">
          <FormField id="pj-prefix" label={t("projects.caseIdPrefix")}>
            {(p) => (
              <input
                {...p}
                className="pj-input t-id"
                value={prefix}
                placeholder="ATS_"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setPrefix(e.target.value)}
              />
            )}
          </FormField>
          <FormField id="pj-digits" label={t("projects.caseIdDigits")}>
            {(p) => (
              <select
                {...p}
                className="pj-input"
                value={digits}
                onChange={(e) => setDigits(Number(e.target.value))}
              >
                {DIGITS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>
        <p className="pj-settings__preview">
          <Hash size={15} aria-hidden="true" />
          <span>{t("projects.prefixHint")}</span>
          <code className="t-id" data-strong="">
            {sample(1)}
          </code>
          <code className="t-id">{sample(2)}</code>
          <code className="t-id" data-faint="">
            {sample(3)}…
          </code>
        </p>
        {showSummary && nameIssue && (
          <ErrorSummary
            ref={summaryRef}
            items={[{ label: t("projects.name"), issue: nameIssue, fieldId: "pj-name" }]}
          />
        )}
        <div className="pj-settings__save">
          <button
            type="button"
            className="pj-primary"
            onClick={() => guard(() => void save())}
            disabled={saving}
          >
            <Check size={16} aria-hidden="true" />
            {saving ? t("projects.saving") : t("projects.save")}
          </button>
        </div>
      </section>

      <section className="pj-card-box pj-card-box--row" aria-labelledby="pj-export-title">
        <span className="pj-card-box__icon" aria-hidden="true">
          <Archive size={18} />
        </span>
        <div className="pj-card-box__text">
          <h2 id="pj-export-title" className="pj-section-title">
            {t("projects.exportProject")}
          </h2>
          <p className="pj-card-box__desc">{t("projects.settings.exportDesc")}</p>
        </div>
        <button
          type="button"
          className="pj-action"
          disabled={busy}
          onClick={() => void exportProject(project)}
        >
          <Download size={16} aria-hidden="true" />
          <span className="pj-action__label">{t("projects.settings.exportZip")}</span>
        </button>
      </section>

      <section
        className="pj-card-box pj-card-box--row pj-card-box--danger"
        aria-labelledby="pj-delete-title"
      >
        <span className="pj-card-box__icon" aria-hidden="true">
          <Trash2 size={18} />
        </span>
        <div className="pj-card-box__text">
          <h2 id="pj-delete-title" className="pj-section-title">
            {t("projects.deleteTitle")}
          </h2>
          <p className="pj-card-box__desc">
            {t("projects.deleteWarning", { name: project.name })}
          </p>
        </div>
        <button type="button" className="pj-danger" onClick={() => void askDelete()}>
          <Trash2 size={16} aria-hidden="true" />
          <span className="pj-action__label">{t("projects.deleteTitle")}</span>
        </button>
      </section>

      {confirming && loss && (
        <ConfirmDialog
          variant="destructive"
          title={t("projects.deleteTitle")}
          message={t("projects.deleteWarning", { name: project.name })}
          confirmLabel={t("projects.deleteConfirm")}
          confirmText={word}
          onConfirm={() => void remove()}
          onCancel={() => setConfirming(false)}
        >
          <ul className="pj-loss" aria-label={t("projects.settings.lossLabel")}>
            <li>{t("projects.settings.lossPlans", { count: loss.plans })}</li>
            <li>{t("projects.settings.lossCases", { count: loss.cases })}</li>
            <li>{t("projects.settings.lossRequirements", { count: loss.requirements })}</li>
            <li>{t("projects.settings.lossCards", { count: loss.cards })}</li>
          </ul>
        </ConfirmDialog>
      )}
      {progressModal}
    </div>
  );
}
