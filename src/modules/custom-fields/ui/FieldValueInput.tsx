import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ControlProps } from "@shared/ui/fieldProps";
import type { CustomField } from "../model/types";
import { MAX_LENGTH } from "../model/validate";

/** The control of one custom field value, by type. `undefined` from
 *  `onChange` clears the value. A select or multi-select offers the live
 *  options, plus an archived one the value already holds (it stays valid
 *  there, ADR-0018). Multi-select renders its own group (`FieldValueGroup`). */
export function FieldValueInput({
  field,
  value,
  onChange,
  control,
}: {
  field: CustomField;
  value: unknown;
  onChange: (value: unknown) => void;
  control: ControlProps;
}) {
  const { t } = useTranslation();
  const text = typeof value === "string" ? value : "";
  switch (field.fieldType) {
    case "long_text":
      return (
        <textarea
          {...control}
          rows={3}
          maxLength={MAX_LENGTH.long_text}
          value={text}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );
    case "number":
    case "integer":
      return (
        <input
          {...control}
          type="number"
          inputMode={field.fieldType === "integer" ? "numeric" : "decimal"}
          step={field.fieldType === "integer" ? 1 : "any"}
          value={typeof value === "number" ? String(value) : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
        />
      );
    case "date":
      return (
        <input
          {...control}
          type="date"
          value={text}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );
    case "boolean":
      return (
        <select
          {...control}
          value={value === true ? "yes" : value === false ? "no" : ""}
          onChange={(e) =>
            onChange(
              e.target.value === "" ? undefined : e.target.value === "yes",
            )
          }
        >
          <option value="">{t("customFields.section.choose")}</option>
          <option value="yes">{t("customFields.section.yes")}</option>
          <option value="no">{t("customFields.section.no")}</option>
        </select>
      );
    case "select":
      return (
        <select
          {...control}
          value={text}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">{t("customFields.section.choose")}</option>
          {field.options
            .filter((o) => !o.archived || o.id === value)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
        </select>
      );
    case "url":
      return (
        <input
          {...control}
          type="url"
          inputMode="url"
          maxLength={MAX_LENGTH.url}
          value={text}
          placeholder="https://"
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );
    default:
      return (
        <input
          {...control}
          maxLength={
            field.fieldType === "user" ? MAX_LENGTH.user : MAX_LENGTH.text
          }
          value={text}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );
  }
}

/** A multi-select as a group of checkboxes, named by its legend. */
export function FieldValueGroup({
  field,
  value,
  onChange,
  describedBy,
  invalid,
  legend,
}: {
  field: CustomField;
  value: unknown;
  onChange: (value: unknown) => void;
  describedBy?: string;
  invalid?: boolean;
  legend: ReactNode;
}) {
  const chosen = Array.isArray(value) ? (value as string[]) : [];
  const toggle = (id: string) => {
    const next = chosen.includes(id)
      ? chosen.filter((x) => x !== id)
      : [...chosen, id];
    onChange(next.length ? next : undefined);
  };
  return (
    <fieldset
      className="cf-group"
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
    >
      <legend className="tp-field__label">{legend}</legend>
      <div className="cf-group__options">
        {field.options
          .filter((o) => !o.archived || chosen.includes(o.id))
          .map((o) => (
            <label key={o.id} className="cf-check">
              <input
                type="checkbox"
                checked={chosen.includes(o.id)}
                onChange={() => toggle(o.id)}
              />
              <span>{o.label}</span>
            </label>
          ))}
      </div>
    </fieldset>
  );
}
