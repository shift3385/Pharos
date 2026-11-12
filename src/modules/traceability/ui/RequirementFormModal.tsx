import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProvenanceBadge, isPendingReview } from "@modules/ai";
import { Dialog } from "@shared/ui/Dialog";
import { Select } from "@shared/ui/Select";
import { discardOptions, useConfirm } from "@shared/ui/useConfirm";
import { ErrorSummary, FormField } from "@shared/ui/FormField";
import { useSaveGuard } from "@shared/ui/fieldProps";
import { hasBlocking, required, type Issue } from "@shared/validation";
import {
  REQUIREMENT_PRIORITIES,
  isValidRequirementKey,
  type Requirement,
  type RequirementPriority,
} from "../model/types";
import "@shared/ui/ConfirmDialog.css";
import { RequirementSources } from "./RequirementSources";
import { Info } from "lucide-react";
import { StatusPill, type PillTone } from "@shared/ui/StatusPill";
import { riskOfRecord, type RiskBand } from "../model/matrix";

const RISK_TONE: Record<RiskBand, PillTone> = {
  high: "error",
  medium: "warning",
  low: "success",
  unassessed: "neutral",
};
import "./Traceability.css";
import { TextArea } from "@shared/ui/TextArea";

export interface RequirementDraft {
  requirementKey: string;
  title: string;
  description: string;
  priority: RequirementPriority;
  /** Risk factors 1..5, null = not assessed (RUN-00, TRZ-04). */
  riskLikelihood: number | null;
  riskImpact: number | null;
  /** The person marked the AI content reviewed (IA-01, IA-17). */
  markReviewed?: boolean;
}

const RISK_VALUES = [1, 2, 3, 4, 5];

/** Create/edit a requirement. The key can only be set on create (empty →
 *  auto-numbered); afterwards it is read-only because it is a stable ID. */
export function RequirementFormModal({
  requirement,
  existingKeys,
  onSave,
  onCancel,
}: {
  requirement: Requirement | null;
  existingKeys: string[];
  onSave: (draft: RequirementDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const provenance = requirement?.data?.aiProvenance?.requirement;
  const sources = requirement?.data?.sources ?? [];
  const [start] = useState<RequirementDraft>(() => ({
    requirementKey: requirement?.requirementKey ?? "",
    title: requirement?.title ?? "",
    description: requirement?.description ?? "",
    priority: requirement?.priority ?? "medium",
    riskLikelihood: requirement?.riskLikelihood ?? null,
    riskImpact: requirement?.riskImpact ?? null,
  }));
  const [draft, setDraft] = useState<RequirementDraft>(start);
  const risk = riskOfRecord(draft);
  // Typed data is never thrown away without asking (draft rule, ADR-0027).
  const dirty = JSON.stringify(draft) !== JSON.stringify(start);
  // A Pharos confirmation, not the browser's (NC-017).
  const { confirm, dialog: discardDialog } = useConfirm();
  const confirmDiscard = async () => !dirty || (await confirm(discardOptions(t)));
  const [saving, setSaving] = useState(false);
  const isNew = requirement === null;

  // The key is a stable ID, so a bad or repeated key blocks saving (draft rule).
  const key = draft.requirementKey.trim();
  const keyIssue: Issue | null =
    isNew && key
      ? !isValidRequirementKey(key)
        ? { code: "traceability.requirement.keyInvalid", severity: "error" }
        : existingKeys.includes(key)
          ? { code: "traceability.requirement.keyDuplicate", severity: "error" }
          : null
      : null;
  const titleIssue = required(draft.title);
  const { guard, showSummary, attempted, summaryRef } = useSaveGuard(hasBlocking([keyIssue, titleIssue]));

  async function submit() {
    setSaving(true);
    try {
      await onSave({ ...draft, requirementKey: key, title: draft.title.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      className="cd tr-modal"
      labelledBy={`${id}-title`}
      onClose={onCancel}
      confirmClose={confirmDiscard}
      dismissable={!saving}
    >
      <h3 id={`${id}-title`} className="cd__title">
        {isNew ? t("traceability.requirement.newTitle") : t("traceability.requirement.editTitle")}
      </h3>

      {isPendingReview(provenance) && !draft.markReviewed && (
        <ProvenanceBadge provenance={provenance} onReview={() => setDraft({ ...draft, markReviewed: true })} />
      )}

      {showSummary && (
        <ErrorSummary
          ref={summaryRef}
          items={[
            ...(keyIssue
              ? [{ label: t("traceability.requirement.key"), issue: keyIssue, fieldId: `${id}-key` }]
              : []),
            ...(titleIssue
              ? [{ label: t("traceability.requirement.title"), issue: titleIssue, fieldId: `${id}-name` }]
              : []),
          ]}
        />
      )}

      <FormField
        id={`${id}-key`}
        label={t("traceability.requirement.key")}
        hint={isNew ? t("traceability.requirement.keyHint") : t("traceability.requirement.keyLocked")}
        issue={keyIssue}
      >
        {(p) => (
          <input
            {...p}
            className="tr-mono"
            value={draft.requirementKey}
            placeholder={t("traceability.requirement.keyAuto")}
            readOnly={!isNew}
            onChange={(e) => setDraft({ ...draft, requirementKey: e.target.value })}
          />
        )}
      </FormField>

      <FormField
        id={`${id}-name`}
        label={t("traceability.requirement.title")}
        issue={attempted ? titleIssue : null}
        required
      >
        {(p) => (
          <input {...p} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        )}
      </FormField>

      <FormField label={t("traceability.requirement.description")}>
        {(p) => (
          <TextArea
            size="description"
            {...p}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        )}
      </FormField>

      <FormField label={t("traceability.requirement.priority")}>
        {(p) => (
          <Select<RequirementPriority>
            {...p}
            value={draft.priority}
            onChange={(priority) => setDraft({ ...draft, priority })}
            options={REQUIREMENT_PRIORITIES.map((pr) => ({ value: pr, label: t(`traceability.priorityLabel.${pr}`) }))}
          />
        )}
      </FormField>

      {sources.length > 0 && (
        <details className="tz-prop__extra" data-testid="requirement-sources">
          <summary>{t("traceability.proposals.source", { count: sources.length })}</summary>
          <RequirementSources requirementId={requirement?.id} sources={sources} />
        </details>
      )}

      <fieldset className="tr-risk">
        <legend className="tp-field__label tr-risk__legend">
          {t("traceability.risk.label")}
          {/* UX-23: the result in sight, so nobody has to multiply. */}
          <StatusPill tone={RISK_TONE[risk.riskBand]} className="tz-risk">
            {risk.riskLevel === null
              ? t("traceability.risk.band.unassessed")
              : t("traceability.risk.badge", {
                  level: risk.riskLevel,
                  band: t(`traceability.risk.band.${risk.riskBand}`),
                })}
          </StatusPill>
          <span
            className="tr-risk__info"
            tabIndex={0}
            role="img"
            title={t("traceability.risk.bands")}
            aria-label={t("traceability.risk.bands")}
          >
            <Info size={15} aria-hidden="true" />
          </span>
        </legend>
        <p className="tp-field__hint" id={`${id}-risk-hint`}>
          {t("traceability.risk.hint")}
        </p>
        <div className="tr-risk__grid">
          {(["riskLikelihood", "riskImpact"] as const).map((k) => (
            <FormField
              key={k}
              id={`${id}-${k}`}
              label={t(`traceability.risk.${k === "riskLikelihood" ? "likelihood" : "impact"}`)}
            >
              {(p) => (
                <Select
                  {...p}
                  aria-describedby={`${id}-risk-hint`}
                  data-testid={k === "riskLikelihood" ? "requirement-risk-likelihood" : "requirement-risk-impact"}
                  value={draft[k] == null ? "" : String(draft[k])}
                  onChange={(v) => setDraft({ ...draft, [k]: v ? Number(v) : null })}
                  options={[
                    { value: "", label: t("traceability.risk.notAssessed") },
                    ...RISK_VALUES.map((v) => ({ value: String(v), label: t("traceability.risk.level", { value: v }) })),
                  ]}
                />
              )}
            </FormField>
          ))}
        </div>
      </fieldset>

      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={() => void confirmDiscard().then((ok) => ok && onCancel())}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          disabled={saving}
          onClick={() => guard(() => void submit())}
        >
          {saving ? t("traceability.requirement.saving") : t("traceability.requirement.save")}
        </button>
      </div>
      {discardDialog}
    </Dialog>
  );
}
