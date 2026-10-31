import { useTranslation } from "react-i18next";
import { FieldMessage, FormField } from "@shared/ui/FormField";
import type { CaseType, CustomField, CustomValues } from "../model/types";
import { fieldsFor, isFilled } from "../model/validate";
import { customFieldIssues, fieldControlId } from "../model/issues";
import { formatValue } from "../model/format";
import { FieldValueGroup, FieldValueInput } from "./FieldValueInput";
import "./CustomFields.css";

/** «Campos personalizados» of the case editor: one control per live field
 *  that applies to the case type, in the project's order, then the values
 *  the editor cannot edit (archived fields, keys without a definition here)
 *  read-only. Nothing is ever dropped: `onChange` gets the whole map. */
export function CustomFieldsSection({
  fields,
  caseType,
  values,
  previous,
  attempted,
  onChange,
}: {
  fields: CustomField[];
  caseType: CaseType;
  values: CustomValues;
  /** The stored values (an archived option stays valid where it was). */
  previous?: CustomValues;
  /** A save was attempted: show `required` errors too. */
  attempted: boolean;
  onChange: (values: CustomValues) => void;
}) {
  const { t } = useTranslation();
  const shown = fieldsFor(fields, caseType);
  const issues = new Map(
    customFieldIssues(fields, caseType, values, previous).map((x) => [
      x.field.fieldKey,
      x.issue,
    ]),
  );
  const shownKeys = new Set(shown.map((f) => f.fieldKey));
  const others = Object.entries(values).filter(
    ([k, v]) => !shownKeys.has(k) && isFilled(v),
  );
  if (shown.length === 0 && others.length === 0) return null;

  const set = (key: string, v: unknown) => {
    const next = { ...values };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(next);
  };
  const words = {
    yes: t("customFields.section.yes"),
    no: t("customFields.section.no"),
  };

  return (
    <section className="cf-section" aria-labelledby="cf-section-title">
      <p id="cf-section-title" className="tp-field__grouplabel">
        {t("customFields.section.title")}
      </p>
      <div className="cf-section__grid">
        {shown.map((f) => {
          const raw = issues.get(f.fieldKey) ?? null;
          // `required` only after a save attempt, like the title.
          const issue =
            raw && (raw.code !== "customRequired" || attempted) ? raw : null;
          const id = fieldControlId(f.fieldKey);
          const hint = f.description || undefined;
          if (f.fieldType === "multi_select") {
            const msgId = `${id}-msg`;
            const hintId = hint ? `${id}-hint` : undefined;
            return (
              <div
                key={f.id}
                className="tp-field cf-section__wide"
                data-severity={issue?.severity}
              >
                <FieldValueGroup
                  field={f}
                  value={values[f.fieldKey]}
                  onChange={(v) => set(f.fieldKey, v)}
                  describedBy={
                    [hintId, issue ? msgId : undefined]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  invalid={issue?.severity === "error"}
                  legend={
                    <span id={id} tabIndex={-1}>
                      {f.label}
                      {f.required && (
                        <span className="tp-field__req" aria-hidden="true">
                          {" *"}
                        </span>
                      )}
                    </span>
                  }
                />
                {hint && (
                  <span id={hintId} className="tp-field__hint">
                    {hint}
                  </span>
                )}
                {issue && <FieldMessage id={msgId} issue={issue} />}
              </div>
            );
          }
          return (
            <FormField
              key={f.id}
              id={id}
              label={f.label}
              hint={hint}
              issue={issue}
              required={f.required}
              className={`tp-field${f.fieldType === "long_text" ? " cf-section__wide" : ""}`}
            >
              {(p) => (
                <FieldValueInput
                  field={f}
                  value={values[f.fieldKey]}
                  onChange={(v) => set(f.fieldKey, v)}
                  control={p}
                />
              )}
            </FormField>
          );
        })}
      </div>
      {others.length > 0 && (
        <details className="cf-others">
          <summary>
            {t("customFields.section.other")} ({others.length})
          </summary>
          <p className="tp-field__hint">
            {t("customFields.section.otherHint")}
          </p>
          <dl className="cf-others__list">
            {others.map(([key, v]) => {
              const def = fields.find((f) => f.fieldKey === key);
              return (
                <div key={key} className="cf-others__row">
                  <dt>
                    {def?.label ?? key}
                    <span className="cf-others__key">
                      {def
                        ? key
                        : `${key} · ${t("customFields.section.unknown")}`}
                    </span>
                  </dt>
                  <dd>{formatValue(def, v, words)}</dd>
                </div>
              );
            })}
          </dl>
        </details>
      )}
    </section>
  );
}
