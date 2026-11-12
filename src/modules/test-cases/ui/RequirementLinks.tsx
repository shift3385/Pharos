import { useTranslation } from "react-i18next";
import { Select } from "@shared/ui/Select";
import type { RequirementOption } from "../model/types";

/** Requirements a case verifies (TRZ-02): chips of linked keys plus a picker of
 *  the project's other requirements. A linked key that no longer exists (the
 *  requirement was deleted) stays visible and flagged, never silently dropped. */
export function RequirementLinks({
  value,
  options,
  onChange,
}: {
  value: string[];
  options: RequirementOption[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const byKey = new Map(options.map((o) => [o.requirementKey, o]));
  const available = options.filter((o) => !value.includes(o.requirementKey));

  return (
    <div className="tp-field">
      <span>{t("testCase.requirements.label")}</span>
      {value.length > 0 && (
        <ul className="tc-reqs">
          {value.map((key) => {
            const option = byKey.get(key);
            return (
              <li
                key={key}
                className={`tc-reqs__chip${option ? "" : " tc-reqs__chip--unknown"}`}
                title={option ? option.title : t("testCase.requirements.unknown")}
              >
                <span className="tc-reqs__key">{key}</span>
                <span className="tc-reqs__title">
                  {option ? option.title : t("testCase.requirements.unknown")}
                </span>
                <button
                  type="button"
                  className="tc-reqs__remove"
                  aria-label={t("testCase.requirements.remove", { key })}
                  onClick={() => onChange(value.filter((k) => k !== key))}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {options.length === 0 ? (
        <span className="tp-field__hint">{t("testCase.requirements.none")}</span>
      ) : (
        available.length > 0 && (
          <Select
            value=""
            aria-label={t("testCase.requirements.add")}
            placeholder={t("testCase.requirements.add")}
            onChange={(key) => key && onChange([...value, key])}
            data-testid="requirement-add"
            options={available.map((o) => ({ value: o.requirementKey, label: `${o.requirementKey} — ${o.title}` }))}
          />
        )
      )}
    </div>
  );
}
