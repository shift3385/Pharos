import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { duplicateRow, duplicateRows } from "@shared/validation";
import { FieldMessage } from "./FormField";
import { controlProps, type ControlProps } from "./fieldProps";
import "./fields.css";

/** Remove-row control (UX-10): a trash icon named «Quitar: <fila>», which asks
 *  for confirmation when the row has content. «✕» is kept for close/dismiss.
 *  Asking moves the focus to «Cancelar», and cancelling returns it to the icon
 *  (UX-15). A list keys this button by row and length, so a confirmation never
 *  stays open on a row that took another one's place. */
export function DeleteButton({
  onDelete,
  needsConfirm,
  itemLabel,
}: {
  onDelete: () => void;
  needsConfirm: boolean;
  /** What is removed (e.g. "Scope · row 2"), so each button has a unique name. */
  itemLabel?: string;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const name = itemLabel
    ? `${t("common.remove")}: ${itemLabel}`
    : t("common.remove");

  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [confirming]);

  if (!needsConfirm) {
    return (
      <button
        type="button"
        className="tp-list-field__del"
        aria-label={name}
        title={name}
        onClick={onDelete}
      >
        <Trash2 size={16} aria-hidden="true" />
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
          ref={cancelRef}
          type="button"
          className="tp-confirm__no"
          onClick={() => {
            returnFocus.current = true;
            setConfirming(false);
          }}
        >
          {t("common.cancel")}
        </button>
      </span>
    );
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      className="tp-list-field__del"
      aria-label={name}
      title={name}
      onClick={() => setConfirming(true)}
    >
      <Trash2 size={16} aria-hidden="true" />
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
  actions,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  label: string;
  /** Goes on the line of «+ Añadir», after it (the AI button of a list). */
  actions?: ReactNode;
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
                key={`${i}-${items.length}`}
                itemLabel={rowLabel}
                needsConfirm={value.trim() !== ""}
                onDelete={() => onChange(items.filter((_, j) => j !== i))}
              />
            </div>
            {issue && <FieldMessage id={`${id}-msg`} issue={issue} />}
          </div>
        );
      })}
      <div className="tp-list-field__actions">
        <button
          type="button"
          className="tp-list-field__add"
          onClick={() => onChange([...items, ""])}
        >
          + {t("testPlan.addItem")}
        </button>
        {actions}
      </div>
    </div>
  );
}

/** Editable list of two-column rows (e.g. role / responsibility). `label`
 *  names the group; each field has a real label (its column plus the row, for
 *  assistive tech) and grows with its text, so a long text is read whole
 *  (UX-15). Wide enough, one header names both columns; narrower, each pair
 *  stacks with visible labels (fields.css, by the field's own width). A row
 *  repeating an earlier one gets a warning. */
export function PairListField<T>({
  items,
  keys,
  labels,
  onChange,
  label,
  wideFirst,
}: {
  items: T[];
  keys: [keyof T, keyof T];
  labels: [string, string];
  onChange: (next: T[]) => void;
  label: string;
  /** The second column holds short values (e.g. a metric): 2:1 instead of 1:1. */
  wideFirst?: boolean;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  // Row to focus once the list changes. Only a person's own action sets it, so
  // rows added by the AI never move the focus.
  const pendingFocus = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [ka, kb] = keys;
  const cell = (item: T, k: keyof T) => String(item[k] ?? "").trim();
  const dupes = duplicateRows(items, (item) =>
    cell(item, ka) || cell(item, kb)
      ? `${cell(item, ka)} | ${cell(item, kb)}`
      : "",
  );

  useEffect(() => {
    if (pendingFocus.current === null) return;
    const row = Math.min(pendingFocus.current, items.length - 1);
    pendingFocus.current = null;
    if (row < 0) addRef.current?.focus();
    else rootRef.current?.querySelector<HTMLTextAreaElement>(`#${CSS.escape(`${baseId}-${row}`)}`)?.focus();
  }, [items.length, baseId]);

  const field = (item: T, i: number, k: keyof T, column: string, control: ControlProps) => (
    <div className="tp-pair-field__cell">
      <label className="tp-pair-field__label" htmlFor={control.id}>
        {column}
        <span className="sr-only"> · {t("a11y.row", { n: i + 1 })}</span>
      </label>
      <textarea
        {...control}
        rows={1}
        value={String(item[k] ?? "")}
        onChange={(e) => {
          const next = [...items];
          next[i] = { ...item, [k]: e.target.value } as T;
          onChange(next);
        }}
      />
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={`tp-pair-field${wideFirst ? " tp-pair-field--wide-first" : ""}`}
      role="group"
      aria-label={label}
    >
      {items.length > 0 && (
        <>
          <div className="tp-pair-field__head" aria-hidden="true">
            <span>{labels[0]}</span>
            <span>{labels[1]}</span>
          </div>
          <ol className="tp-pair-field__list">
            {items.map((item, i) => {
              const hasContent = cell(item, ka) !== "" || cell(item, kb) !== "";
              const id = `${baseId}-${i}`;
              const issue = duplicateRow(dupes, i);
              const row = t("a11y.row", { n: i + 1 });
              return (
                <li className="tp-list-field__item" key={i}>
                  <div className="tp-pair-field__row">
                    {field(item, i, ka, labels[0], controlProps(id, issue))}
                    {field(
                      item,
                      i,
                      kb,
                      labels[1],
                      controlProps(`${id}-b`, null, issue ? `${id}-msg` : undefined),
                    )}
                    <DeleteButton
                      key={`${i}-${items.length}`}
                      itemLabel={`${label} · ${row}`}
                      needsConfirm={hasContent}
                      onDelete={() => {
                        pendingFocus.current = i;
                        setAnnouncement(t("a11y.rowRemoved", { row }));
                        onChange(items.filter((_, j) => j !== i));
                      }}
                    />
                  </div>
                  {issue && <FieldMessage id={`${id}-msg`} issue={issue} />}
                </li>
              );
            })}
          </ol>
        </>
      )}
      <button
        ref={addRef}
        type="button"
        className="tp-list-field__add"
        onClick={() => {
          pendingFocus.current = items.length;
          onChange([...items, { [ka]: "", [kb]: "" } as T]);
        }}
      >
        + {t("testPlan.addRow")}
      </button>
      <span className="sr-only" role="status">
        {announcement}
      </span>
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
  describedBy,
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
  /** Id of a hint that describes the group (e.g. what is still missing). */
  describedBy?: string;
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
      <div className="tp-pills-groups" role="group" aria-label={label} aria-describedby={describedBy}>
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
    <div className="tp-checks" role="group" aria-label={label} aria-describedby={describedBy}>
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
