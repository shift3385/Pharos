import { useState } from "react";
import { useTranslation } from "react-i18next";
import "@shared/ui/ConfirmDialog.css";
import "./Templates.css";
import type { TemplateKind, TemplateLanguage, TemplateSummary } from "../model/types";

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
  const [values, setValues] = useState<TemplateFormValues>({
    name: initial?.name ?? fileName?.replace(/\.xlsx$/i, "") ?? "",
    kind: initial?.kind ?? "plan",
    language: initial?.language ?? "es",
    version: initial?.version ?? "1.0",
    description: initial?.description ?? "",
    usagePrompt: initial?.usagePrompt ?? "",
  });
  const set = <K extends keyof TemplateFormValues>(k: K, v: TemplateFormValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="cd-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="cd tpl-form" onClick={(e) => e.stopPropagation()}>
        <h3 className="cd__title">
          {t(mode === "create" ? "templates.form.createTitle" : "templates.form.editTitle")}
        </h3>

        <label className="tpl-form__field">
          <span>{t("templates.form.name")}</span>
          <input value={values.name} autoFocus onChange={(e) => set("name", e.target.value)} />
        </label>

        {mode === "create" && (
          <div className="tpl-form__row">
            <label className="tpl-form__field">
              <span>{t("templates.form.kind")}</span>
              <select value={values.kind} onChange={(e) => set("kind", e.target.value as TemplateKind)}>
                <option value="plan">{t("templates.kind.plan")}</option>
                <option value="case">{t("templates.kind.case")}</option>
              </select>
            </label>
            <label className="tpl-form__field">
              <span>{t("templates.form.language")}</span>
              <select
                value={values.language}
                onChange={(e) => set("language", e.target.value as TemplateLanguage)}
              >
                <option value="es">ES</option>
                <option value="en">EN</option>
              </select>
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
          <textarea
            rows={2}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>

        <label className="tpl-form__field">
          <span>{t("templates.form.usagePrompt")}</span>
          <textarea
            rows={3}
            value={values.usagePrompt}
            placeholder={t("templates.form.usagePromptHint")}
            onChange={(e) => set("usagePrompt", e.target.value)}
          />
        </label>

        <div className="cd__actions">
          <button type="button" className="cd__cancel" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="cd__confirm"
            disabled={!values.name.trim()}
            onClick={() => onSubmit({ ...values, name: values.name.trim() })}
          >
            {t("templates.form.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
