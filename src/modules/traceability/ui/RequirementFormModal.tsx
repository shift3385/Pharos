import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  REQUIREMENT_PRIORITIES,
  isValidRequirementKey,
  type Requirement,
  type RequirementPriority,
} from "../model/types";
import "@shared/ui/ConfirmDialog.css";
import "./Traceability.css";

export interface RequirementDraft {
  requirementKey: string;
  title: string;
  description: string;
  priority: RequirementPriority;
}

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
  const [draft, setDraft] = useState<RequirementDraft>({
    requirementKey: requirement?.requirementKey ?? "",
    title: requirement?.title ?? "",
    description: requirement?.description ?? "",
    priority: requirement?.priority ?? "medium",
  });
  const [saving, setSaving] = useState(false);
  const isNew = requirement === null;

  const key = draft.requirementKey.trim();
  const keyError =
    isNew && key
      ? !isValidRequirementKey(key)
        ? t("traceability.requirement.keyInvalid")
        : existingKeys.includes(key)
          ? t("traceability.requirement.keyDuplicate")
          : null
      : null;

  async function submit() {
    setSaving(true);
    try {
      await onSave({ ...draft, requirementKey: key, title: draft.title.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cd-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="cd tr-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="cd__title">
          {isNew ? t("traceability.requirement.newTitle") : t("traceability.requirement.editTitle")}
        </h3>

        <label className="tp-field">
          <span>{t("traceability.requirement.key")}</span>
          <input
            className="tr-mono"
            value={draft.requirementKey}
            placeholder={t("traceability.requirement.keyAuto")}
            readOnly={!isNew}
            aria-invalid={keyError ? true : undefined}
            onChange={(e) => setDraft({ ...draft, requirementKey: e.target.value })}
          />
          <span className={keyError ? "tr-error" : "tp-field__hint"}>
            {keyError ??
              (isNew ? t("traceability.requirement.keyHint") : t("traceability.requirement.keyLocked"))}
          </span>
        </label>

        <label className="tp-field">
          <span>{t("traceability.requirement.title")}</span>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>

        <label className="tp-field">
          <span>{t("traceability.requirement.description")}</span>
          <textarea
            rows={3}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </label>

        <label className="tp-field">
          <span>{t("traceability.requirement.priority")}</span>
          <select
            value={draft.priority}
            onChange={(e) => setDraft({ ...draft, priority: e.target.value as RequirementPriority })}
          >
            {REQUIREMENT_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`traceability.priorityLabel.${p}`)}
              </option>
            ))}
          </select>
        </label>

        <div className="cd__actions">
          <button type="button" className="cd__cancel" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="cd__confirm"
            disabled={saving || !draft.title.trim() || keyError !== null}
            onClick={() => void submit()}
          >
            {saving ? t("traceability.requirement.saving") : t("traceability.requirement.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
