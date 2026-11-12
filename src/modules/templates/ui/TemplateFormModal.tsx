import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@shared/ui/Dialog";
import { Select } from "@shared/ui/Select";
import { discardOptions, useConfirm } from "@shared/ui/useConfirm";
import { ErrorSummary, FormField } from "@shared/ui/FormField";
import { useSaveGuard } from "@shared/ui/fieldProps";
import { required } from "@shared/validation";
import "@shared/ui/ConfirmDialog.css";
import "./Templates.css";
import type { TemplateKind, TemplateLanguage, TemplateSummary } from "../model/types";
import { TextArea } from "@shared/ui/TextArea";

export interface TemplateFormValues {
  name: string;
  kind: TemplateKind;
  language: TemplateLanguage;
  version: string;
  description: string;
  usagePrompt: string;
}

/** Create (on import) or edit template metadata. On create, kind/language are
 *  chosen; on edit they are fixed (the stored .xlsx is not replaced here). */
export function TemplateFormModal({
  mode,
  initial,
  fileName,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  initial?: TemplateSummary;
  fileName?: string;
  onSubmit: (values: TemplateFormValues) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [start] = useState<TemplateFormValues>(() => ({
    name: initial?.name ?? fileName?.replace(/\.xlsx$/i, "") ?? "",
    kind: initial?.kind ?? "plan",
    language: initial?.language ?? "es",
    version: initial?.version ?? "1.0",
    description: initial?.description ?? "",
    usagePrompt: initial?.usagePrompt ?? "",
  }));
  const [values, setValues] = useState<TemplateFormValues>(start);
  // Typed data is never thrown away without asking (draft rule, ADR-0027).
  const dirty = JSON.stringify(values) !== JSON.stringify(start);
  // A Pharos confirmation, not the browser's (NC-017).
  const { confirm, dialog: discardDialog } = useConfirm();
  const confirmDiscard = async () => !dirty || (await confirm(discardOptions(t)));
  const set = <K extends keyof TemplateFormValues>(k: K, v: TemplateFormValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));
  const id = useId();
  const nameIssue = required(values.name);
  const { guard, showSummary, attempted, summaryRef } = useSaveGuard(nameIssue !== null);

  return (
    <Dialog
      className="cd tpl-form"
      labelledBy={`${id}-title`}
      onClose={onCancel}
      confirmClose={confirmDiscard}
    >
      <h3 id={`${id}-title`} className="cd__title">
        {t(mode === "create" ? "templates.form.createTitle" : "templates.form.editTitle")}
      </h3>

      {showSummary && nameIssue && (
        <ErrorSummary
          ref={summaryRef}
          items={[{ label: t("templates.form.name"), issue: nameIssue, fieldId: `${id}-name` }]}
        />
      )}

      <FormField
        id={`${id}-name`}
        className="tpl-form__field"
        label={t("templates.form.name")}
        issue={attempted ? nameIssue : null}
        required
      >
        {(p) => (
          <input {...p} value={values.name} autoFocus onChange={(e) => set("name", e.target.value)} />
        )}
      </FormField>

      {mode === "create" && (
        <div className="tpl-form__row">
          <label className="tpl-form__field">
            <span>{t("templates.form.kind")}</span>
            <Select<TemplateKind>
              value={values.kind}
              onChange={(v) => set("kind", v)}
              options={[
                { value: "plan", label: t("templates.kind.plan") },
                { value: "case", label: t("templates.kind.case") },
              ]}
            />
          </label>
          <label className="tpl-form__field">
            <span>{t("templates.form.language")}</span>
            <Select<TemplateLanguage>
              value={values.language}
              onChange={(v) => set("language", v)}
              options={[
                { value: "es", label: "ES" },
                { value: "en", label: "EN" },
              ]}
            />
          </label>
          <label className="tpl-form__field tpl-form__field--sm">
            <span>{t("templates.form.version")}</span>
            <input value={values.version} onChange={(e) => set("version", e.target.value)} />
          </label>
        </div>
      )}

      {mode === "edit" && (
        <label className="tpl-form__field tpl-form__field--sm">
          <span>{t("templates.form.version")}</span>
          <input value={values.version} onChange={(e) => set("version", e.target.value)} />
        </label>
      )}

      <label className="tpl-form__field">
        <span>{t("templates.form.description")}</span>
        <TextArea
          size="description"
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </label>

      <label className="tpl-form__field">
        <span>{t("templates.form.usagePrompt")}</span>
        <TextArea
          size="description"
          value={values.usagePrompt}
          placeholder={t("templates.form.usagePromptHint")}
          onChange={(e) => set("usagePrompt", e.target.value)}
        />
      </label>

      <div className="cd__actions">
        <button type="button" className="cd__cancel" onClick={() => void confirmDiscard().then((ok) => ok && onCancel())}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="cd__confirm"
          onClick={() => guard(() => onSubmit({ ...values, name: values.name.trim() }))}
        >
          {t("templates.form.save")}
        </button>
      </div>
      {discardDialog}
    </Dialog>
  );
}
