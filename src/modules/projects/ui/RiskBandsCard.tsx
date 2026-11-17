import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, RotateCcw } from "lucide-react";
import { FormField } from "@shared/ui/FormField";
import { useToast } from "@shared/ui/Toast";
import type { Issue } from "@shared/validation";
import {
  DEFAULT_RISK_BANDS,
  RISK_LEVEL_MAX,
  projectRiskBands,
  riskBandOf,
  riskBandsError,
  sameBands,
  cellsPerBand,
  RISK_LEVELS as LEVELS,
  type RiskBands,
} from "@shared/risk/bands";
import { projectApi } from "../api/projectApi";
import "@shared/ui/buttons.css";
import type { Project } from "../model/types";

const toNumber = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));

/** «Bandas de riesgo» (TRZ-04, ADR-0043): up to which risk level
 *  (likelihood × impact, 1–25) a requirement is low and up to which it is
 *  medium. The 5×5 grid repaints as one types; saving changes no data, only
 *  how the matrix, its order, the report and the coverage by band read. */
export function RiskBandsCard({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const id = useId();
  const saved = projectRiskBands(project);
  const [low, setLow] = useState(String(saved.low));
  const [medium, setMedium] = useState(String(saved.medium));
  const [saving, setSaving] = useState(false);

  const error = riskBandsError(toNumber(low), toNumber(medium));
  const draft: RiskBands | null = error ? null : { low: toNumber(low), medium: toNumber(medium) };
  const shown = draft ?? saved;
  const issue = (field: "low" | "medium"): Issue | null => {
    if (!error) return null;
    const mine =
      field === "low" ? error === "lowRange" || error === "order" : error === "mediumRange" || error === "order";
    const other = error === "integer" && !Number.isInteger(toNumber(field === "low" ? low : medium));
    return mine || other
      ? { code: `projects.settings.riskBands.error.${error}`, severity: "error", params: { max: RISK_LEVEL_MAX - 1 } }
      : null;
  };
  const counts = cellsPerBand(shown);

  async function save(next: RiskBands) {
    setSaving(true);
    try {
      await projectApi.update(project.id, {
        ownerId: project.ownerId,
        name: project.name,
        caseIdPrefix: project.caseIdPrefix,
        caseIdDigits: project.caseIdDigits,
        riskBandLow: next.low,
        riskBandMedium: next.medium,
      });
      toast(t("projects.settings.riskBands.saved"));
      onSaved();
    } catch {
      toast(t("projects.settings.riskBands.failed"), "error");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setLow(String(DEFAULT_RISK_BANDS.low));
    setMedium(String(DEFAULT_RISK_BANDS.medium));
  }

  const dirty = !draft || !sameBands(draft, saved);

  return (
    <section className="pj-card-box" aria-labelledby={`${id}-title`} data-testid="risk-bands">
      <div className="pj-card-box__head">
        <h2 id={`${id}-title`} className="pj-section-title">
          {t("projects.settings.riskBands.title")}
        </h2>
        <p className="pj-card-box__desc">{t("projects.settings.riskBands.desc")}</p>
      </div>
      <div className="pj-bands">
        <FormField
          id={`${id}-low`}
          label={
            <>
              <span className="pj-bands__dot" data-band="low" aria-hidden="true" />
              {t("projects.settings.riskBands.lowUpTo")}
            </>
          }
          issue={issue("low")}
        >
          {(p) => (
            <input
              {...p}
              className="pj-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={RISK_LEVEL_MAX - 2}
              step={1}
              value={low}
              data-testid="risk-band-low"
              onChange={(e) => setLow(e.target.value)}
            />
          )}
        </FormField>
        <FormField
          id={`${id}-medium`}
          label={
            <>
              <span className="pj-bands__dot" data-band="medium" aria-hidden="true" />
              {t("projects.settings.riskBands.mediumUpTo")}
            </>
          }
          issue={issue("medium")}
        >
          {(p) => (
            <input
              {...p}
              className="pj-input"
              type="number"
              inputMode="numeric"
              min={2}
              max={RISK_LEVEL_MAX - 1}
              step={1}
              value={medium}
              data-testid="risk-band-medium"
              onChange={(e) => setMedium(e.target.value)}
            />
          )}
        </FormField>
        <div className="tp-field">
          <span className="tp-field__head">
            <span className="tp-field__label">
              <span className="pj-bands__dot" data-band="high" aria-hidden="true" />
              {t("projects.settings.riskBands.high")}
            </span>
          </span>
          <span className="pj-bands__rest" data-testid="risk-band-high">
            {t("projects.settings.riskBands.highRange", { from: shown.medium + 1, to: RISK_LEVEL_MAX })}
          </span>
        </div>
      </div>
      <figure className="pj-heat">
        <div className="pj-heat__grid" aria-hidden="true">
          {[...LEVELS].reverse().map((impact) => (
            <div key={impact} className="pj-heat__row">
              <span className="pj-heat__axis">{impact === 5 ? `${t("projects.settings.riskBands.impactShort")} ${impact}` : impact}</span>
              {LEVELS.map((likelihood) => {
                const level = likelihood * impact;
                return (
                  <span key={likelihood} className="pj-heat__cell" data-band={riskBandOf(level, shown)}>
                    {level}
                  </span>
                );
              })}
            </div>
          ))}
          <div className="pj-heat__row">
            <span className="pj-heat__axis" />
            {LEVELS.map((l) => (
              <span key={l} className="pj-heat__axis">
                {l === 1 ? `${t("projects.settings.riskBands.likelihoodShort")} ${l}` : l}
              </span>
            ))}
          </div>
        </div>
        <figcaption className="pj-heat__caption" data-testid="risk-band-cells">
          {t("projects.settings.riskBands.cells", { ...counts })}
        </figcaption>
      </figure>
      <div className="pj-bands__actions">
        <button
          type="button"
          className="ui-btn"
          disabled={saving || (!!draft && sameBands(draft, DEFAULT_RISK_BANDS))}
          onClick={reset}
        >
          <RotateCcw size={16} aria-hidden="true" />
          {t("projects.settings.riskBands.reset", { ...DEFAULT_RISK_BANDS })}
        </button>
        <button
          type="button"
          className="pj-primary"
          disabled={saving || !draft || !dirty}
          onClick={() => draft && void save(draft)}
          data-testid="risk-bands-save"
        >
          <Check size={16} aria-hidden="true" />
          {saving ? t("projects.saving") : t("projects.settings.riskBands.save")}
        </button>
      </div>
    </section>
  );
}
