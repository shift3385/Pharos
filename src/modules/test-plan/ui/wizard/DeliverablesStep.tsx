import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Plus, X } from "lucide-react";
import { DELIVERABLE_GROUPS } from "../../model/catalogs";
import { isCatalogDeliverable } from "../../model/catalogLabels";

/**
 * Step 8 (RED-V2): the ISO/IEC/IEEE 29119-3 deliverables as checkboxes by
 * group, plus «Otro entregable», which joins «Aceptación y otros» marked
 * «Propio» and can be removed. Stores catalog keys and own entries as typed.
 */
export function DeliverablesStep({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const otherId = useId();
  const own = value.filter((v) => !isCatalogDeliverable(v));
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  const add = () => {
    const v = draft.trim();
    if (v && !value.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...value, v]);
    setDraft("");
  };
  const last = DELIVERABLE_GROUPS.length - 1;

  return (
    <div className="tpw-deliv">
      <p className="tpw-hint">{t("testPlan.deliverables.hint")}</p>
      <div className="tpw-deliv__groups">
        {DELIVERABLE_GROUPS.map((g, gi) => (
          <fieldset key={g.id} className="tpw-deliv__group">
            <legend className="tpw-group-title">{t(`testPlan.deliverableGroup.${g.id}`)}</legend>
            {g.keys.map((k) => (
              <label key={k} className="tpw-check">
                <input type="checkbox" checked={value.includes(k)} onChange={() => toggle(k)} />
                <span>{t(`testPlan.deliverableLabel.${k}`)}</span>
              </label>
            ))}
            {gi === last &&
              own.map((v) => (
                <span key={v} className="tpw-check tpw-check--own">
                  <Check size={16} className="tpw-check__icon" aria-hidden="true" />
                  <span className="u-truncate" title={v}>
                    {v}
                  </span>
                  <span className="tpw-own">{t("testPlan.deliverables.own")}</span>
                  <button
                    type="button"
                    className="tpw-icon-btn"
                    aria-label={t("testPlan.deliverables.remove", { name: v })}
                    title={t("testPlan.deliverables.remove", { name: v })}
                    onClick={() => onChange(value.filter((x) => x !== v))}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </span>
              ))}
          </fieldset>
        ))}
      </div>
      <div className="tpw-other">
        <label htmlFor={otherId} className="tpw-other__label">
          {t("testPlan.deliverables.other")}
        </label>
        <div className="tpw-other__row">
          <input
            id={otherId}
            className="tpw-input"
            value={draft}
            placeholder={t("testPlan.deliverables.otherPlaceholder")}
            aria-describedby={`${otherId}-hint`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="header-action" onClick={add}>
            <Plus size={16} aria-hidden="true" />
            {t("testPlan.deliverables.add")}
          </button>
        </div>
        <p id={`${otherId}-hint`} className="tpw-hint">
          {t("testPlan.deliverables.otherHint")}
        </p>
      </div>
    </div>
  );
}
