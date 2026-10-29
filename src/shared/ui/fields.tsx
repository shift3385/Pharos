import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { duplicateRow, duplicateRows } from "@shared/validation";
import { FieldMessage } from "./FormField";
import { controlProps } from "./fieldProps";
import "./fields.css";

/** Delete control that asks for confirmation when the target has content. */
export function DeleteButton({
  onDelete,
  needsConfirm,
  itemLabel,
}: {
  onDelete: () => void;
  needsConfirm: boolean;
  /** What is deleted (e.g. "Scope · row 2"), so each ✕ has a unique name. */
  itemLabel?: string;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const name = itemLabel
    ? `${t("common.delete")}: ${itemLabel}`
    : t("common.delete");

  if (!needsConfirm) {
    return (
      <button
        type="button"
        className="tp-list-field__del"
        aria-label={name}
        onClick={onDelete}
      >
        ✕
      </button>
    );
  }

  if (confirming) {
    return (
      <span className="tp-confirm" role="group" aria-label={name}>
        <button
          type="button"
          className="tp-confirm__yes"
          onClick={() => {
            setConfirming(false);
            onDelete();
          }}
        >
          {t("common.confirmDelete")}
        </button>
        <button
          type="button"
          className="tp-confirm__no"
          onClick={() => setConfirming(false)}
        >
          {t("common.cancel")}
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="tp-list-field__del"
      aria-label={name}
      onClick={() => setConfirming(true)}
    >
      ✕
    </button>
  );
}

/** Editable list of free-text items (add / edit / remove). `label` names the
 *  group and each row for assistive tech; a repeated item gets a warning. */
export function ListField({
  items,
  onChange,
  placeholder,
  label,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  label: string;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const dupes = duplicateRows(items, (v) => v);
  return (
    <div className="tp-list-field" role="group" aria-label={label}>
      {items.map((value, i) => {
        const id = `${baseId}-${i}`;
        const issue = duplicateRow(dupes, i);
        const rowLabel = `${label} · ${t("a11y.row", { n: i + 1 })}`;
        return (
          <div className="tp-list-field__item" key={i}>
            <div className="tp-list-field__row">
              <input
                {...controlProps(id, issue)}
                aria-label={rowLabel}
                value={value}
                placeholder={placeholder}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = e.target.value;
                  onChange(next);
                }}
              />
              <DeleteButton
                itemLabel={rowLabel}
                needsConfirm={value.trim() !== ""}
                onDelete={() => onChange(items.filter((_, j) => j !== i))}
              />
            </div>
            {issue && <FieldMessage id={`${id}-msg`} issue={issue} />}
          </div>
        );
      })}
      <button
        type="button"
        className="tp-list-field__add"
        onClick={() => onChange([...items, ""])}
      >
        + {t("testPlan.addItem")}
      </button>
    </div>
  );
}

/** Editable list of two-column rows (e.g. role / responsibility). `label`
 *  names the group; each cell is named by its column and row number, and a
 *  row repeating an earlier one gets a warning. */
export function PairListField<T>({
  items,
  keys,
  labels,
  onChange,
  label,
}: {
  items: T[];
  keys: [keyof T, keyof T];
  labels: [string, string];
  onChange: (next: T[]) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const [ka, kb] = keys;
  const cell = (item: T, k: keyof T) => String(item[k] ?? "").trim();
  const dupes = duplicateRows(items, (item) =>
    cell(item, ka) || cell(item, kb)
      ? `${cell(item, ka)} | ${cell(item, kb)}`
      : "",
  );
  return (
    <div className="tp-pair-field" role="group" aria-label={label}>
      {items.map((item, i) => {
        const hasContent = cell(item, ka) !== "" || cell(item, kb) !== "";
        const id = `${baseId}-${i}`;
        const issue = duplicateRow(dupes, i);
        const row = t("a11y.row", { n: i + 1 });
        return (
          <div className="tp-list-field__item" key={i}>
            <div className="tp-pair-field__row">
              <input
                {...controlProps(id, issue)}
                aria-label={`${labels[0]} · ${row}`}
                value={String(item[ka] ?? "")}
                placeholder={labels[0]}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...item, [ka]: e.target.value } as T;
                  onChange(next);
                }}
              />
              <input
                aria-label={`${labels[1]} · ${row}`}
                value={String(item[kb] ?? "")}
                placeholder={labels[1]}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...item, [kb]: e.target.value } as T;
                  onChange(next);
                }}
              />
              <DeleteButton
                itemLabel={`${label} · ${row}`}
                needsConfirm={hasContent}
                onDelete={() => onChange(items.filter((_, j) => j !== i))}
              />
            </div>
            {issue && <FieldMessage id={`${id}-msg`} issue={issue} />}
          </div>
        );
      })}
      <button
        type="button"
        className="tp-list-field__add"
        onClick={() => onChange([...items, { [ka]: "", [kb]: "" } as T])}
      >
        + {t("testPlan.addRow")}
      </button>
    </div>
  );
}

/** Multi-select group, optionally allowing custom entries. `variant="pills"`
 *  renders selectable pill buttons (optionally split into labelled `groups`)
 *  instead of checkboxes; the selection state/logic is identical. */
export function CheckboxGroup({
  options,
  selected,
  onChange,
  labelFor,
  allowCustom,
  variant = "checkbox",
  groups,
  label,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  labelFor: (key: string) => string;
  allowCustom?: boolean;
  variant?: "checkbox" | "pills";
  groups?: { title: string; options: string[] }[];
  /** Names the group for assistive tech. */
  label: string;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const custom = selected.filter((s) => !options.includes(s));

  const toggle = (opt: string) =>
    onChange(
      selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt],
    );

  const addDraft = () => {
    const v = draft.trim();
    if (v && !selected.includes(v)) onChange([...selected, v]);
    setDraft("");
  };

  const customField = allowCustom ? (
    <div className="tp-checks__custom">
      <input
        value={draft}
        aria-label={`${label} · ${t("testPlan.otherPlaceholder")}`}
        placeholder={t("testPlan.otherPlaceholder")}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addDraft();
          }
        }}
      />
      <button type="button" className="tp-list-field__add" onClick={addDraft}>
        + {t("testPlan.other")}
      </button>
    </div>
  ) : null;

  if (variant === "pills") {
    const groupList = groups ?? [{ title: "", options }];
    const pill = (opt: string, label: string) => (
      <button
        key={opt}
        type="button"
        className="tp-pill"
        data-active={selected.includes(opt)}
        aria-pressed={selected.includes(opt)}
        onClick={() => toggle(opt)}
      >
        {label}
      </button>
    );
    return (
      <div className="tp-pills-groups" role="group" aria-label={label}>
        {groupList.map((g, gi) => (
          <div className="tp-pills-group" key={gi}>
            {g.title && <p className="tp-pills-group__title">{g.title}</p>}
            <div className="tp-pills">
              {g.options.map((opt) => pill(opt, labelFor(opt)))}
            </div>
          </div>
        ))}
        {custom.length > 0 && (
          <div className="tp-pills">{custom.map((v) => pill(v, v))}</div>
        )}
        {customField}
      </div>
    );
  }

  return (
    <div className="tp-checks" role="group" aria-label={label}>
      {options.map((opt) => (
        <label className="tp-checks__item" key={opt}>
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => toggle(opt)}
          />
          <span>{labelFor(opt)}</span>
        </label>
      ))}
      {custom.map((value) => (
        <label className="tp-checks__item" key={value}>
          <input type="checkbox" checked onChange={() => toggle(value)} />
          <span>{value}</span>
        </label>
      ))}
      {customField}
    </div>
  );
}
