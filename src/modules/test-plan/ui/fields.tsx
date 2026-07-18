import { useTranslation } from "react-i18next";

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
          <button
            type="button"
            className="tp-list-field__del"
            aria-label={t("testPlan.removeItem")}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            ✕
          </button>
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
      {items.map((item, i) => (
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
          <button
            type="button"
            className="tp-list-field__del"
            aria-label={t("testPlan.removeItem")}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
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

/** Multi-select group of checkboxes from a fixed option catalog. */
export function CheckboxGroup({
  options,
  selected,
  onChange,
  labelFor,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  labelFor: (key: string) => string;
}) {
  return (
    <div className="tp-checks">
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <label className="tp-checks__item" key={opt}>
            <input
              type="checkbox"
              checked={on}
              onChange={() =>
                onChange(
                  on ? selected.filter((s) => s !== opt) : [...selected, opt],
                )
              }
            />
            <span>{labelFor(opt)}</span>
          </label>
        );
      })}
    </div>
  );
}
