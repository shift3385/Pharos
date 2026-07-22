import { useState } from "react";
import { useTranslation } from "react-i18next";

/** Delete control that asks for confirmation when the target has content. */
export function DeleteButton({
  onDelete,
  needsConfirm,
}: {
  onDelete: () => void;
  needsConfirm: boolean;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  if (!needsConfirm) {
    return (
      <button
        type="button"
        className="tp-list-field__del"
        aria-label={t("common.delete")}
        onClick={onDelete}
      >
        ✕
      </button>
    );
  }

  if (confirming) {
    return (
      <span className="tp-confirm">
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
      aria-label={t("common.delete")}
      onClick={() => setConfirming(true)}
    >
      ✕
    </button>
  );
}

/** Editable list of free-text items (add / edit / remove). */
export function ListField({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="tp-list-field">
      {items.map((value, i) => (
        <div className="tp-list-field__row" key={i}>
          <input
            value={value}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <DeleteButton
            needsConfirm={value.trim() !== ""}
            onDelete={() => onChange(items.filter((_, j) => j !== i))}
          />
        </div>
      ))}
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

/** Editable list of two-column rows (e.g. role / responsibility). */
export function PairListField<T>({
  items,
  keys,
  labels,
  onChange,
}: {
  items: T[];
  keys: [keyof T, keyof T];
  labels: [string, string];
  onChange: (next: T[]) => void;
}) {
  const { t } = useTranslation();
  const [ka, kb] = keys;
  return (
    <div className="tp-pair-field">
      {items.map((item, i) => {
        const hasContent =
          String(item[ka] ?? "").trim() !== "" ||
          String(item[kb] ?? "").trim() !== "";
        return (
          <div className="tp-pair-field__row" key={i}>
            <input
              value={String(item[ka] ?? "")}
              placeholder={labels[0]}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...item, [ka]: e.target.value } as T;
                onChange(next);
              }}
            />
            <input
              value={String(item[kb] ?? "")}
              placeholder={labels[1]}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...item, [kb]: e.target.value } as T;
                onChange(next);
              }}
            />
            <DeleteButton
              needsConfirm={hasContent}
              onDelete={() => onChange(items.filter((_, j) => j !== i))}
            />
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

/** Multi-select group of checkboxes, optionally allowing custom entries. */
export function CheckboxGroup({
  options,
  selected,
  onChange,
  labelFor,
  allowCustom,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  labelFor: (key: string) => string;
  allowCustom?: boolean;
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

  return (
    <div className="tp-checks">
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
      {allowCustom && (
        <div className="tp-checks__custom">
          <input
            value={draft}
            placeholder={t("testPlan.otherPlaceholder")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const v = draft.trim();
                if (v && !selected.includes(v)) onChange([...selected, v]);
                setDraft("");
              }
            }}
          />
          <button
            type="button"
            className="tp-list-field__add"
            onClick={() => {
              const v = draft.trim();
              if (v && !selected.includes(v)) onChange([...selected, v]);
              setDraft("");
            }}
          >
            + {t("testPlan.other")}
          </button>
        </div>
      )}
    </div>
  );
}
