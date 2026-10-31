import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react";
import { Dialog } from "@shared/ui/Dialog";
import { ErrorSummary, FormField } from "@shared/ui/FormField";
import { useSaveGuard } from "@shared/ui/fieldProps";
import { SegmentedControl } from "@shared/ui/SegmentedControl";
import { Switch } from "@shared/ui/Switch";
import { hasBlocking, type Issue } from "@shared/validation";
import {
  FIELD_TYPES,
  type CaseType,
  type CustomField,
  type CustomFieldInput,
  type FieldOption,
  type FieldType,
} from "../model/types";
import { keyFromLabel, validateValue, validKey } from "../model/validate";
import { FieldValueGroup, FieldValueInput } from "./FieldValueInput";
import "@shared/ui/ConfirmDialog.css";
import "./CustomFields.css";

type Applies = "all" | CaseType;

interface Draft {
  label: string;
  fieldKey: string;
  /** The key was typed, not proposed from the label. */
  keyTouched: boolean;
  fieldType: FieldType;
  description: string;
  required: boolean;
  options: FieldOption[];
  defaultValue: unknown;
  applies: Applies;
}

const withOptions = (t: FieldType) => t === "select" || t === "multi_select";

/** Create or edit a definition. The key and the type are set once (they are
 *  read-only when editing); an option is archived rather than removed once
 *  it is saved, since cases may hold it. */
export function CustomFieldDialog({
  field,
  takenKeys,
  projectId,
  userId,
  onSave,
  onCancel,
}: {
  field: CustomField | null;
  /** Keys the project already has (archived ones too). */
  takenKeys: string[];
  projectId: string;
  userId: string;
  onSave: (input: CustomFieldInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const isNew = field === null;
  const [start] = useState<Draft>(() => ({
    label: field?.label ?? "",
    fieldKey: field?.fieldKey ?? "",
    keyTouched: !isNew,
    fieldType: field?.fieldType ?? "text",
    description: field?.description ?? "",
    required: field?.required ?? false,
    options: field?.options ?? [],
    defaultValue: field?.defaultValue ?? undefined,
    applies:
      field?.appliesToCaseTypes?.length === 1
        ? field.appliesToCaseTypes[0]
        : "all",
  }));
  const [draft, setDraft] = useState<Draft>(start);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(start);
  const confirmDiscard = () =>
    !dirty || window.confirm(t("common.discardConfirm"));
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const savedOption = (o: FieldOption) =>
    field?.options.some((x) => x.id === o.id) ?? false;

  const err = (code: string): Issue => ({
    code: `customFields.error.${code}`,
    severity: "error",
  });
  const key = draft.fieldKey.trim();
  const labelIssue =
    draft.label.trim() === "" || draft.label.trim().length > 100
      ? err("label")
      : null;
  const keyIssue = !isNew
    ? null
    : !validKey(key)
      ? err("key")
      : takenKeys.includes(key)
        ? err("duplicate_key")
        : null;
  const liveOptions = draft.options.filter((o) => o.label.trim() || o.id);
  const optionsIssue = !withOptions(draft.fieldType)
    ? null
    : liveOptions.length === 0
      ? err("options")
      : liveOptions.some((o) => !o.label.trim())
        ? err("option_label")
        : new Set(liveOptions.map((o) => o.label.trim().toLowerCase())).size <
            liveOptions.length
          ? err("option_duplicate")
          : null;
  const rule = {
    fieldKey: key,
    fieldType: draft.fieldType,
    options: draft.options,
    appliesToCaseTypes: null,
    archived: false,
  };
  const defaultCode =
    draft.defaultValue === undefined
      ? null
      : validateValue(rule, draft.defaultValue, field?.defaultValue);
  const defaultIssue = defaultCode ? err(defaultCode) : null;
  const { guard, showSummary, summaryRef } = useSaveGuard(
    hasBlocking([labelIssue, keyIssue, optionsIssue, defaultIssue]),
  );

  async function submit() {
    setSaving(true);
    try {
      await onSave({
        projectId,
        entity: "test_case",
        fieldKey: key,
        label: draft.label.trim(),
        description: draft.description.trim(),
        fieldType: draft.fieldType,
        options: withOptions(draft.fieldType)
          ? liveOptions.map((o) => ({ ...o, label: o.label.trim() }))
          : [],
        required: draft.required,
        defaultValue: draft.defaultValue ?? null,
        appliesToCaseTypes: draft.applies === "all" ? null : [draft.applies],
        userId,
      });
    } finally {
      setSaving(false);
    }
  }

  const ids = {
    label: `${id}-label`,
    key: `${id}-key`,
    type: `${id}-type`,
    options: `${id}-options`,
    default: `${id}-default`,
  };
  const summary = [
    labelIssue && {
      label: t("customFields.dialog.label"),
      issue: labelIssue,
      fieldId: ids.label,
    },
    keyIssue && {
      label: t("customFields.dialog.key"),
      issue: keyIssue,
      fieldId: ids.key,
    },
    optionsIssue && {
      label: t("customFields.dialog.options"),
      issue: optionsIssue,
      fieldId: ids.options,
    },
    defaultIssue && {
      label: t("customFields.dialog.default"),
      issue: defaultIssue,
      fieldId: ids.default,
    },
  ].filter((x): x is { label: string; issue: Issue; fieldId: string } => !!x);

  // The default value is edited with the same control the cases use.
  const preview: CustomField = {
    ...(field ?? {
      id: "",
      projectId,
      entity: "test_case",
      position: 0,
      archivedAt: null,
      createdAt: "",
      updatedAt: "",
      revision: 0,
    }),
    fieldKey: key,
    label: draft.label,
    description: draft.description,
    fieldType: draft.fieldType,
    options: draft.options.filter((o) => o.label.trim()),
    required: draft.required,
    defaultValue: draft.defaultValue,
    appliesToCaseTypes: null,
  };

  return (
    <Dialog
      className="cd cf-dialog"
      labelledBy={`${id}-title`}
      onClose={onCancel}
      confirmClose={confirmDiscard}
      dismissable={!saving}
    >
      <h3 id={`${id}-title`} className="cd__title">
        {isNew
          ? t("customFields.dialog.newTitle")
          : t("customFields.dialog.editTitle")}
      </h3>
      {showSummary && summary.length > 0 && (
        <ErrorSummary ref={summaryRef} items={summary} />
      )}

      <div className="cf-dialog__body">
        <FormField
          id={ids.label}
          label={t("customFields.dialog.label")}
          issue={labelIssue && draft.label ? labelIssue : null}
          required
        >
          {(p) => (
            <input
              {...p}
              value={draft.label}
              maxLength={100}
              onChange={(e) => {
                const label = e.target.value;
                set(
                  draft.keyTouched
                    ? { label }
                    : { label, fieldKey: keyFromLabel(label) },
                );
              }}
            />
          )}
        </FormField>

        <div className="cf-dialog__row">
          <FormField
            id={ids.key}
            label={t("customFields.dialog.key")}
            hint={
              isNew
                ? t("customFields.dialog.keyHint")
                : t("customFields.dialog.keyLocked")
            }
            issue={key ? keyIssue : null}
            required={isNew}
          >
            {(p) => (
              <input
                {...p}
                className="cf-mono"
                value={draft.fieldKey}
                readOnly={!isNew}
                maxLength={40}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) =>
                  set({ fieldKey: e.target.value, keyTouched: true })
                }
              />
            )}
          </FormField>
          <FormField
            id={ids.type}
            label={t("customFields.dialog.type")}
            hint={isNew ? undefined : t("customFields.dialog.typeLocked")}
          >
            {(p) => (
              <select
                {...p}
                value={draft.fieldType}
                disabled={!isNew}
                onChange={(e) =>
                  set({
                    fieldType: e.target.value as FieldType,
                    defaultValue: undefined,
                  })
                }
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {t(`customFields.type.${ft}`)}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>

        <FormField label={t("customFields.dialog.description")}>
          {(p) => (
            <textarea
              {...p}
              rows={2}
              maxLength={500}
              value={draft.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          )}
        </FormField>

        {withOptions(draft.fieldType) && (
          <fieldset
            className="tp-field cf-options"
            aria-describedby={optionsIssue ? `${ids.options}-msg` : undefined}
          >
            <legend className="tp-field__label" id={ids.options} tabIndex={-1}>
              {t("customFields.dialog.options")}
            </legend>
            <ol className="cf-options__list">
              {draft.options.map((o, i) => {
                const name = t("customFields.dialog.optionN", { n: i + 1 });
                const saved = savedOption(o);
                const update = (patch: Partial<FieldOption>) =>
                  set({
                    options: draft.options.map((x, j) =>
                      j === i ? { ...x, ...patch } : x,
                    ),
                  });
                return (
                  <li
                    key={o.id || `new-${i}`}
                    className="cf-options__row"
                    data-archived={o.archived || undefined}
                  >
                    <input
                      aria-label={name}
                      value={o.label}
                      maxLength={100}
                      onChange={(e) => update({ label: e.target.value })}
                      aria-describedby={
                        o.archived ? `${id}-opt-arch` : undefined
                      }
                    />
                    {saved ? (
                      <button
                        type="button"
                        className="cf-icon-btn"
                        aria-label={
                          o.archived
                            ? t("customFields.dialog.restoreOption", {
                                n: i + 1,
                              })
                            : t("customFields.dialog.archiveOption", {
                                n: i + 1,
                              })
                        }
                        aria-pressed={o.archived}
                        onClick={() => update({ archived: !o.archived })}
                      >
                        {o.archived ? (
                          <ArchiveRestore size={16} aria-hidden="true" />
                        ) : (
                          <Archive size={16} aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="cf-icon-btn"
                        aria-label={t("customFields.dialog.removeOption", {
                          n: i + 1,
                        })}
                        onClick={() =>
                          set({
                            options: draft.options.filter((_, j) => j !== i),
                          })
                        }
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
            {draft.options.some((o) => o.archived) && (
              <p id={`${id}-opt-arch`} className="tp-field__hint">
                {t("customFields.dialog.optionArchived")}
              </p>
            )}
            <button
              type="button"
              className="tp-list-field__add"
              onClick={() =>
                set({
                  options: [
                    ...draft.options,
                    { id: "", label: "", archived: false },
                  ],
                })
              }
            >
              <Plus size={14} aria-hidden="true" />{" "}
              {t("customFields.dialog.addOption")}
            </button>
            {optionsIssue && showSummary && (
              <span
                id={`${ids.options}-msg`}
                className="field-msg field-msg--error"
              >
                <span aria-hidden="true">✕ </span>
                {t(optionsIssue.code)}
              </span>
            )}
          </fieldset>
        )}

        {draft.fieldType === "multi_select" ? (
          <div className="tp-field">
            <FieldValueGroup
              field={preview}
              value={draft.defaultValue}
              onChange={(v) => set({ defaultValue: v })}
              legend={
                <span id={ids.default} tabIndex={-1}>
                  {t("customFields.dialog.default")}
                </span>
              }
            />
            <span className="tp-field__hint">
              {t("customFields.dialog.defaultHint")}
            </span>
          </div>
        ) : (
          <FormField
            id={ids.default}
            label={t("customFields.dialog.default")}
            hint={t("customFields.dialog.defaultHint")}
            issue={defaultIssue}
          >
            {(p) => (
              <FieldValueInput
                field={preview}
                value={draft.defaultValue}
                onChange={(v) => set({ defaultValue: v })}
                control={p}
              />
            )}
          </FormField>
        )}

        <div className="tp-field">
          <span className="tp-field__label" aria-hidden="true">
            {t("customFields.appliesTo")}
          </span>
          <SegmentedControl<Applies>
            label={t("customFields.appliesTo")}
            size="sm"
            value={draft.applies}
            onChange={(applies) => set({ applies })}
            options={[
              { value: "all", label: t("customFields.appliesAll") },
              { value: "standard", label: t("customFields.appliesStandard") },
              { value: "checklist", label: t("customFields.appliesChecklist") },
            ]}
          />
        </div>

        <div className="cf-dialog__switch">
          <Switch
            label={t("customFields.dialog.required")}
            checked={draft.required}
            onChange={(required) => set({ required })}
            describedBy={`${id}-req-hint`}
          />
          <span id={`${id}-req-hint`} className="tp-field__hint">
            {t("customFields.dialog.requiredHint")}
          </span>
        </div>
      </div>

      <div className="cd__actions">
        <button
          type="button"
          className="cd__cancel"
          onClick={() => confirmDiscard() && onCancel()}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          disabled={saving}
          onClick={() => guard(() => void submit())}
        >
          {saving
            ? t("customFields.dialog.saving")
            : isNew
              ? t("customFields.dialog.create")
              : t("customFields.dialog.save")}
        </button>
      </div>
    </Dialog>
  );
}
