import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { BottomSheet, MenuItem, MenuLabel } from "./Menu";
import { Popover, type PopoverPlacement } from "./Popover";
import { useBreakpoint } from "./useBreakpoint";
import "./popover.css";
import "./select.css";

/** One choice of a `Select`. A disabled one keeps its `reason`, shown as its
 *  title and read after its name, so nobody wonders why it can't be picked. */
export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  icon?: LucideIcon;
  /** A second, quieter line that explains the option. */
  description?: string;
  disabled?: boolean;
  /** Why it is disabled (SPEC §4). */
  reason?: string;
}

/** Options under a title (e.g. «Activos» / «Archivados»). */
export interface SelectGroup<V extends string = string> {
  label: string;
  options: SelectOption<V>[];
}

export type SelectItems<V extends string = string> = (SelectOption<V> | SelectGroup<V>)[];

const isGroup = <V extends string>(x: SelectOption<V> | SelectGroup<V>): x is SelectGroup<V> =>
  "options" in x;

/** The options in reading order, without their groups. */
const flatOptions = <V extends string>(items: SelectItems<V>): SelectOption<V>[] =>
  items.flatMap((x) => (isGroup(x) ? x.options : [x]));

/** Case- and accent-insensitive text, for the type-ahead. */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Next enabled option from `from` in `step` direction (looping when `wrap`). */
function nextEnabled<V extends string>(list: SelectOption<V>[], from: number, step: 1 | -1, wrap = false) {
  for (let n = 1; n <= list.length; n++) {
    let i = from + step * n;
    if (wrap) i = (i + list.length) % list.length;
    if (i < 0 || i >= list.length) return -1;
    if (!list[i].disabled) return i;
  }
  return -1;
}

/**
 * Pharos' own select (UX-30): a select-only combobox (WAI-ARIA APG) that opens
 * a `listbox` with the look of the app's menus — the chosen option with a ✓,
 * corners, shadow, type and dark mode — and the bottom sheet on mobile, like
 * the Home's period menu. Replaces the native `<select>`, which Windows
 * (WebView2) draws with the system's grey list.
 *
 * - The focus stays on the button; `aria-activedescendant` names the option
 *   under the cursor. ↓/↑/Intro/Espacio open it; inside, ↑/↓ move, Inicio/Fin
 *   jump, typing jumps to the option that starts with the letters, Intro or
 *   Espacio pick, Tab picks and moves on, Esc closes (the focus is still on
 *   the button).
 * - It takes `FormField`'s props (`id`, `aria-describedby`, `aria-invalid`,
 *   `aria-required`), and a `<label htmlFor>` names it. Without a label, pass
 *   `aria-label`.
 * - Options can carry an icon, a description, a title per group and a
 *   disabled state with its reason.
 */
export function Select<V extends string = string>({
  id: fixedId,
  value,
  onChange,
  options: items,
  placeholder,
  disabled,
  title,
  sheetTitle: fixedSheetTitle,
  className = "",
  placement = "bottom-start",
  name,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
  "data-testid": testId,
  renderValue,
}: {
  id?: string;
  value: V;
  onChange: (value: V) => void;
  options: SelectItems<V>;
  /** Shown when the value is not one of the options (e.g. «Elige…»). */
  placeholder?: string;
  disabled?: boolean;
  /** Tooltip of the closed field. */
  title?: string;
  /** Title of the mobile sheet; defaults to the label or `aria-label`. */
  sheetTitle?: string;
  className?: string;
  placement?: PopoverPlacement;
  /** For a form that reads its fields by name: a hidden input carries the value. */
  name?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
  "data-testid"?: string;
  /** Custom content of the closed button (default: the option's icon + label). */
  renderValue?: (option: SelectOption<V> | undefined) => ReactNode;
}) {
  const autoId = useId();
  const id = fixedId ?? `select-${autoId}`;
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;
  const mobile = useBreakpoint() === "mobile";
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = useRef({ text: "", at: 0 });

  const list = flatOptions(items);
  const selectedIndex = list.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? list[selectedIndex] : undefined;

  const openAt = (i: number) => {
    if (disabled) return;
    setActive(i >= 0 ? i : nextEnabled(list, -1, 1));
    setOpen(true);
  };
  const close = () => setOpen(false);
  const pick = (i: number) => {
    const option = list[i];
    if (!option || option.disabled) return;
    close();
    anchorRef.current?.focus();
    if (option.value !== value) onChange(option.value);
  };

  // The option under the cursor stays in view while the list scrolls.
  useEffect(() => {
    if (!open || mobile || active < 0) return;
    const el = document.getElementById(optionId(active));
    el?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, mobile]);

  /** The next option whose label starts with what was typed (letters typed
   *  within half a second build one prefix; one letter repeated cycles). */
  const typeAhead = (key: string, from: number) => {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at < 500 ? t.text + key : key;
    t.at = now;
    const prefix = fold(t.text);
    const same = prefix.length > 1 && [...prefix].every((c) => c === prefix[0]);
    const needle = same ? prefix[0] : prefix;
    const start = same || prefix.length === 1 ? from + 1 : Math.max(from, 0);
    for (let n = 0; n < list.length; n++) {
      const i = (start + n) % list.length;
      if (!list[i].disabled && fold(list[i].label).startsWith(needle)) return i;
    }
    return -1;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || mobile) return;
    const { key } = e;
    if (!open) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        e.preventDefault();
        if (key === "ArrowUp" && !e.altKey && selectedIndex < 0) openAt(nextEnabled(list, list.length, -1));
        else openAt(selectedIndex >= 0 ? selectedIndex : -1);
      } else if (key === "Home" || key === "End") {
        e.preventDefault();
        openAt(key === "Home" ? nextEnabled(list, -1, 1) : nextEnabled(list, list.length, -1));
      } else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const i = typeAhead(key, selectedIndex);
        if (i >= 0) openAt(i);
      }
      return;
    }
    const move = (i: number) => {
      e.preventDefault();
      if (i >= 0) setActive(i);
    };
    // A space typed right after letters belongs to the prefix («Sin fecha»).
    const typing = typed.current.text !== "" && Date.now() - typed.current.at < 500;
    // Any other key ends the typed prefix.
    if (key.length !== 1) typed.current.text = "";
    if (key === "ArrowDown") move(e.altKey ? active : nextEnabled(list, active, 1));
    else if (key === "ArrowUp" && e.altKey) {
      e.preventDefault();
      pick(active);
    } else if (key === "ArrowUp") move(nextEnabled(list, active, -1));
    else if (key === "Home") move(nextEnabled(list, -1, 1));
    else if (key === "End") move(nextEnabled(list, list.length, -1));
    else if (key === "Enter" || (key === " " && !typing)) {
      e.preventDefault();
      pick(active);
    } else if (key === "Tab") {
      // Tab keeps the option under the cursor and moves on (APG).
      const option = list[active];
      close();
      if (option && !option.disabled && option.value !== value) onChange(option.value);
    } else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      move(typeAhead(key, active));
    }
  };

  // The sheet is titled like the field: its label (`for` or wrapping; only
  // the label's own text when it wraps a hint too) or its aria-label.
  const label = open ? anchorRef.current?.labels?.[0] : undefined;
  const labelText = label
    ? (label.htmlFor ? label : (label.querySelector("span") ?? label)).textContent?.replace(/\s*\*$/, "").trim()
    : undefined;
  const sheetTitle = fixedSheetTitle ?? ariaLabel ?? labelText ?? "";

  const text = renderValue ? (
    renderValue(selected)
  ) : (
    <>
      {selected?.icon && <selected.icon className="pselect__icon" size={16} aria-hidden="true" />}
      <span className="pselect__text" data-placeholder={!selected || undefined}>
        {selected?.label ?? placeholder ?? " "}
      </span>
    </>
  );

  let index = -1;
  const option = (o: SelectOption<V>) => {
    const i = ++index;
    const isSelected = i === selectedIndex;
    const descId = `${optionId(i)}-desc`;
    const note = o.disabled && o.reason ? o.reason : o.description;
    return (
      <div
        key={`${i}-${o.value}`}
        id={optionId(i)}
        role="option"
        aria-selected={isSelected}
        aria-disabled={o.disabled || undefined}
        aria-describedby={note ? descId : undefined}
        data-value={o.value}
        data-active={i === active || undefined}
        data-selected={isSelected || undefined}
        title={o.disabled ? o.reason : undefined}
        className={`menu__item pselect__option${note ? " menu__item--desc" : ""}`}
        onMouseMove={() => !o.disabled && i !== active && setActive(i)}
        onClick={() => pick(i)}
      >
        {o.icon && <o.icon className="menu__icon" size={16} aria-hidden="true" />}
        {note ? (
          <span className="menu__text menu__text--stack">
            <span className="menu__title">{o.label}</span>
            <span id={descId} className="menu__desc" aria-hidden="true">
              {note}
            </span>
          </span>
        ) : (
          <span className="menu__text">{o.label}</span>
        )}
        {isSelected && <Check className="menu__check" size={16} aria-hidden="true" />}
      </div>
    );
  };

  let sheetIndex = -1;
  const sheetOption = (o: SelectOption<V>) => {
    const i = ++sheetIndex;
    const note = o.disabled && o.reason ? o.reason : o.description;
    return (
      <MenuItem
        key={`${i}-${o.value}`}
        icon={o.icon}
        selected={i === selectedIndex}
        disabled={o.disabled}
        title={o.disabled ? o.reason : undefined}
        description={note}
        testId={testId ? `${testId}-option-${o.value}` : undefined}
        onSelect={() => pick(i)}
      >
        {o.label}
      </MenuItem>
    );
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup={mobile ? "dialog" : "listbox"}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && !mobile && active >= 0 ? optionId(active) : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
        data-testid={testId}
        data-value={value}
        data-pop=""
        disabled={disabled}
        title={title}
        className={`pselect ${className}`.trim()}
        onClick={() => (open ? close() : openAt(selectedIndex))}
        // Like the menus, it closes on a choice, Tab, Escape, a click or a
        // scroll outside and when another popover opens (Popover), not on a
        // bare blur.
        onKeyDown={onKeyDown}
      >
        {text}
        <ChevronDown className="pselect__chev" size={16} aria-hidden="true" />
      </button>
      {name && <input type="hidden" name={name} value={value} />}
      {mobile ? (
        open && (
          <BottomSheet id={listId} title={sheetTitle} onClose={close}>
            {items.map((x, gi) =>
              isGroup(x) ? (
                <Fragment key={`g${gi}`}>
                  <MenuLabel>{x.label}</MenuLabel>
                  {x.options.map(sheetOption)}
                </Fragment>
              ) : (
                sheetOption(x)
              ),
            )}
          </BottomSheet>
        )
      ) : (
        <Popover
          open={open}
          onClose={close}
          anchorRef={anchorRef}
          placement={placement}
          className="menu pselect__pop"
          matchAnchorWidth
          // The focus stays on the combobox (aria-activedescendant).
          initialFocus={() => anchorRef.current}
        >
          <div
            id={listId}
            role="listbox"
            aria-labelledby={ariaLabelledby ?? (ariaLabel ? undefined : id)}
            aria-label={ariaLabel}
            className="menu__list"
            // A click on an option must not take the focus off the button.
            onMouseDown={(e) => e.preventDefault()}
          >
            {items.map((x, gi) =>
              isGroup(x) ? (
                <div key={`g${gi}`} role="group" aria-labelledby={`${id}-g${gi}`}>
                  <div id={`${id}-g${gi}`} className="menu__label" role="presentation">
                    {x.label}
                  </div>
                  {x.options.map(option)}
                </div>
              ) : (
                option(x)
              ),
            )}
          </div>
        </Popover>
      )}
    </>
  );
}
