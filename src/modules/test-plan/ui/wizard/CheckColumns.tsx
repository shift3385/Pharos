import { useId, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Check, PencilLine, Plus, X, type LucideIcon } from "lucide-react";

export interface CheckOption {
  key: string;
  label: string;
  /** A grey aside after the label («· componente»). */
  aside?: string;
  /** A one-line explanation: the label's tooltip, read after its name. */
  tip?: string;
}

export interface CheckColumn {
  id: string;
  title: string;
  icon: LucideIcon;
  options: CheckOption[];
  /** Options in two sub-columns (a long group). */
  split?: boolean;
  /** Grid columns the cell takes on a wide form. */
  span?: number;
}

export interface OwnColumn {
  title: string;
  /** The team's own entries, as typed. */
  items: string[];
  onRemove: (item: string) => void;
  /** Adds what was typed (trimmed, not empty). */
  onAdd: (text: string) => void;
  /** Visible label of the field (sr-only) and its placeholder. */
  fieldLabel: string;
  placeholder: string;
  addLabel: string;
  span?: number;
  testId?: string;
}

/**
 * Checkboxes in columns by group for the plan's steps (UX-31, the approved
 * design of «Entregables»): thin lines between rows and columns, no boxes or
 * fills; each group headed by a grey icon and its name in small capitals,
 * without counters. The last cell, «Propios», lists the team's own entries
 * (each with ✕) and ends with the field to add one, so nothing hangs below
 * the grid.
 */
export function CheckColumns({
  columns,
  isChecked,
  onToggle,
  own,
  className = "",
  testId,
}: {
  columns: CheckColumn[];
  isChecked: (key: string) => boolean;
  onToggle: (key: string) => void;
  own: OwnColumn;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={`tpw-cols ${className}`.trim()} data-testid={testId}>
      <div className="tpw-cols__grid">
        {columns.map((c) => (
          <fieldset
            key={c.id}
            className="tpw-cols__cell"
            data-group={c.id}
            style={c.span ? ({ "--span": c.span } as CSSProperties) : undefined}
          >
            <legend className="tpw-cols__head">
              <c.icon size={14} className="tpw-cols__icon" aria-hidden="true" />
              {c.title}
            </legend>
            <div className={c.split ? "tpw-cols__list tpw-cols__list--split" : "tpw-cols__list"}>
              {c.options.map((o) => (
                <CheckRow key={o.key} option={o} checked={isChecked(o.key)} onToggle={() => onToggle(o.key)} />
              ))}
            </div>
          </fieldset>
        ))}
        <OwnCell {...own} />
      </div>
    </div>
  );
}

function CheckRow({ option, checked, onToggle }: { option: CheckOption; checked: boolean; onToggle: () => void }) {
  const tipId = useId();
  return (
    <>
      <label className="tpw-check" title={option.tip}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-describedby={option.tip ? tipId : undefined}
          data-key={option.key}
        />
        <span className="tpw-check__text">
          {option.label}
          {option.aside && (
            <span className="tpw-check__aside">
              <span aria-hidden="true"> · </span>
              <span className="sr-only">, </span>
              {option.aside}
            </span>
          )}
        </span>
      </label>
      {/* The tooltip for assistive technology, outside the label so it
          describes the checkbox without being part of its name. */}
      {option.tip && (
        <span id={tipId} className="sr-only">
          {option.tip}
        </span>
      )}
    </>
  );
}

function OwnCell({ title, items, onRemove, onAdd, fieldLabel, placeholder, addLabel, span, testId }: OwnColumn) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const fieldId = useId();
  const add = () => {
    const v = draft.trim();
    if (v) onAdd(v);
    setDraft("");
  };
  return (
    <fieldset
      className="tpw-cols__cell tpw-cols__cell--own"
      data-group="own"
      data-testid={testId}
      style={span ? ({ "--span": span } as CSSProperties) : undefined}
    >
      <legend className="tpw-cols__head">
        <PencilLine size={14} className="tpw-cols__icon" aria-hidden="true" />
        {title}
      </legend>
      {items.length > 0 && (
        <ul className="tpw-cols__own" aria-label={title}>
          {items.map((v) => (
            <li key={v} className="tpw-check tpw-check--own">
              <Check size={16} className="tpw-check__icon" aria-hidden="true" />
              <span className="tpw-check__text">{v}</span>
              <button
                type="button"
                className="tpw-icon-btn"
                aria-label={`${t("common.remove")}: ${v}`}
                title={`${t("common.remove")}: ${v}`}
                onClick={() => onRemove(v)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="tpw-other__row tpw-cols__add">
        <label htmlFor={fieldId} className="sr-only">
          {fieldLabel}
        </label>
        <input
          id={fieldId}
          className="tpw-input"
          value={draft}
          placeholder={placeholder}
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
          {addLabel}
        </button>
      </div>
    </fieldset>
  );
}
