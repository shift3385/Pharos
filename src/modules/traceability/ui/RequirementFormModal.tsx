import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@shared/ui/Dialog";
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
  const id = useId();
  const [start] = useState<RequirementDraft>(() => ({
    requirementKey: requirement?.requirementKey ?? "",
    title: requirement?.title ?? "",
    description: requirement?.description ?? "",
    priority: requirement?.priority ?? "medium",
  }));
  const [draft, setDraft] = useState<RequirementDraft>(start);
  // Typed data is never thrown away without asking (draft rule, ADR-0027).
  const dirty = JSON.stringify(draft) !== JSON.stringify(start);
  const confirmDiscard = () => !dirty || window.confirm(t("common.discardConfirm"));
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
          <textarea
            {...p}
            rows={3}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        )}
      </FormField>

      <FormField label={t("traceability.requirement.priority")}>
        {(p) => (
          <select
            {...p}
            value={draft.priority}
            onChange={(e) => setDraft({ ...draft, priority: e.target.value as RequirementPriority })}
          >
            {REQUIREMENT_PRIORITIES.map((pr) => (
              <option key={pr} value={pr}>
                {t(`traceability.priorityLabel.${pr}`)}
              </option>
            ))}
          </select>
        )}
      </FormField>

      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={() => confirmDiscard() && onCancel()}>
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
    </Dialog>
  );
}
