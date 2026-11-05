import { forwardRef, useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Issue } from "@shared/validation";
import { controlProps, issueKey, type ControlProps } from "./fieldProps";
import { InfoTip } from "./InfoTip";
import { StatusIcon } from "./StatusIcon";
import "./fields.css";

/** The message under a field. The severity is spelled out for screen readers
 *  and marked with an icon, so it never depends on colour alone (1.4.1). */
export function FieldMessage({ id, issue }: { id: string; issue: Issue }) {
  const { t } = useTranslation();
  return (
    <span id={id} className={`field-msg field-msg--${issue.severity}`}>
      <StatusIcon kind={issue.severity} size={13} className="field-msg__icon" />
      <span className="sr-only">{t(`validation.severity.${issue.severity}`)}: </span>
      {t(issueKey(issue), issue.params)}
    </span>
  );
}

/** A labelled field with an optional hint, info tip and validation message.
 *  The control is a render prop so any input, select or textarea can be used:
 *
 *    <FormField label={t("x")} issue={issue}>{(p) => <input {...p} />}</FormField>
 *
 *  Order (UX-10): label (+ [?]) → control → hint → message, so controls in a
 *  `.tp-field-row` line up whether or not a neighbour has a hint. `hint` is for
 *  short, essential text; long, secondary help goes in `info` (an InfoTip).
 *  Both are linked to the control with `aria-describedby`. */
export function FormField({
  id: fixedId,
  label,
  hint,
  info,
  issue,
  required,
  className = "tp-field",
  children,
}: {
  /** A stable id for the control (e.g. to focus it from an ErrorSummary). */
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  /** Long, secondary help behind a [?] next to the label. */
  info?: ReactNode;
  issue?: Issue | null;
  required?: boolean;
  className?: string;
  children: (control: ControlProps) => ReactNode;
}) {
  const autoId = useId();
  const id = fixedId ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const infoId = info ? `${id}-info` : undefined;
  const control = controlProps(id, issue, [hintId, infoId].filter(Boolean).join(" ") || undefined);
  return (
    <div className={className} data-severity={issue?.severity}>
      <span className="tp-field__head">
        <label htmlFor={id} className="tp-field__label">
          {label}
          {required && (
            <span className="tp-field__req" aria-hidden="true">
              {" *"}
            </span>
          )}
        </label>
        {info && infoId && (
          <InfoTip id={infoId} label={typeof label === "string" ? label : ""}>
            {info}
          </InfoTip>
        )}
      </span>
      {children(required ? { ...control, "aria-required": true } : control)}
      {hint && (
        <span id={hintId} className="tp-field__hint">
          {hint}
        </span>
      )}
      {issue && <FieldMessage id={`${id}-msg`} issue={issue} />}
    </div>
  );
}

export interface SummaryItem {
  /** The field's visible label. */
  label: string;
  issue: Issue;
  /** Id of the control, to move focus to it from the summary. */
  fieldId?: string;
}

/** Announced list of what blocks saving (3.3.1, 3.3.3). It is shown after a
 *  save attempt and takes the focus, so keyboard and screen-reader users land
 *  on the explanation instead of on a silently disabled button. */
export const ErrorSummary = forwardRef<HTMLDivElement, { items: SummaryItem[] }>(
  function ErrorSummary({ items }, ref) {
    const { t } = useTranslation();
    return (
      <div ref={ref} className="field-summary" role="alert" tabIndex={-1}>
        <p className="field-summary__title">
          <StatusIcon kind="error" size={16} className="field-msg__icon" />
          {t("validation.summary", { count: items.length })}
        </p>
        <ul>
          {items.map((item, i) => (
            <li key={i}>
              {item.fieldId ? (
                <button
                  type="button"
                  className="field-summary__link"
                  onClick={() => document.getElementById(item.fieldId!)?.focus()}
                >
                  {item.label}
                </button>
              ) : (
                <strong>{item.label}</strong>
              )}
              {": "}
              {t(issueKey(item.issue), item.issue.params)}
            </li>
          ))}
        </ul>
      </div>
    );
  },
);
