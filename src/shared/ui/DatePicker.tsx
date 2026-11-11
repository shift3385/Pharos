import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { fromDisplay, isIsoDay, isoOf, parseIso, toDisplay } from "@shared/time/isoDay";
import { BottomSheet } from "./Menu";
import { Popover } from "./Popover";
import { monthTitle, monthWeeks, moveDay, weekdayFormats } from "./monthGrid";
import { useBreakpoint } from "./useBreakpoint";
import "./popover.css";
import "./datePicker.css";

interface View {
  year: number;
  /** 0-based. */
  month: number;
}

const viewOf = (iso: string): View => {
  const d = parseIso(iso) ?? new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
};

/**
 * Pharos' date field (UX-36), in place of the native `<input type="date">`,
 * which Windows (WebView2) draws with the system's calendar. One text field
 * where the date is typed dd/mm/aaaa (an ISO day is read too) and a calendar
 * button that opens the month calendar of «Cronograma» — today ringed in
 * orange, the chosen day filled — in a popover, or a bottom sheet on mobile.
 *
 * - The value stays ISO `yyyy-mm-dd` (`""` when empty). A typed date is
 *   applied as soon as it is a real day; on leaving the field, anything else
 *   goes back to the current value (an empty field clears it when
 *   `clearable`).
 * - It takes `FormField`'s props (`id`, `aria-describedby`, `aria-invalid`,
 *   `aria-required`) on the text field, so its `<label>` names it.
 * - The calendar is a WAI-ARIA date picker dialog: arrows move a day or a
 *   week, PageUp/PageDown a month, Home/End the week's ends, Enter or Space
 *   pick, Esc closes and gives the focus back to the button. Tab stays
 *   inside. Its foot has «Borrar» (when `clearable`) and «Hoy».
 * - `min`: days before it are disabled, and an empty field opens on its
 *   month (the end of a range opens where the range starts).
 */
export function DatePicker({
  id: fixedId,
  value,
  onChange,
  min,
  max,
  clearable = true,
  disabled,
  className = "",
  label,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
  "data-testid": testId,
}: {
  id?: string;
  /** ISO `yyyy-mm-dd`, or `""`. */
  value: string;
  onChange: (value: string) => void;
  /** First day that can be picked (ISO). */
  min?: string;
  /** Last day that can be picked (ISO). */
  max?: string;
  /** The field may be left empty («Borrar»). */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  /** Name of the calendar (its sheet's title); defaults to the field's label. */
  label?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
  "data-testid"?: string;
}) {
  const { t } = useTranslation();
  const autoId = useId();
  const id = fixedId ?? `date-${autoId}`;
  const dialogId = `${id}-cal`;
  const mobile = useBreakpoint() === "mobile";
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const lo = min && isIsoDay(min) ? min : undefined;
  const hi = max && isIsoDay(max) ? max : undefined;
  const shown = draft ?? toDisplay(value);

  const type = (text: string) => {
    setDraft(text);
    const iso = fromDisplay(text);
    if (iso && iso !== value) onChange(iso);
    else if (text.trim() === "" && clearable && value !== "") onChange("");
  };

  const close = () => setOpen(false);
  const pick = (iso: string) => {
    setDraft(null);
    close();
    buttonRef.current?.focus();
    if (iso !== value) onChange(iso);
  };

  // The calendar is named like the field: its label or aria-label.
  const fieldLabel = open ? inputRef.current?.labels?.[0]?.textContent?.replace(/\s*\*$/, "").trim() : undefined;
  const title = label ?? ariaLabel ?? fieldLabel ?? t("datePicker.dialog");

  const calendar = open && (
    <DateCalendar
      dialogId={dialogId}
      value={isIsoDay(value) ? value : ""}
      min={lo}
      max={hi}
      clearable={clearable}
      sheet={mobile}
      onPick={pick}
      onClear={() => {
        setDraft(null);
        close();
        buttonRef.current?.focus();
        if (value !== "") onChange("");
      }}
    />
  );

  const valid = isIsoDay(value);
  return (
    <div className={`pdate ${className}`.trim()} data-disabled={disabled || undefined}>
      <input
        ref={inputRef}
        id={id}
        className="pdate__input"
        value={shown}
        placeholder={t("datePicker.placeholder")}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedby}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
        data-testid={testId}
        data-value={value}
        onChange={(e) => type(e.target.value)}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setDraft(null);
          else if (e.key === "ArrowDown" && e.altKey) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      />
      <button
        ref={buttonRef}
        type="button"
        className="pdate__btn"
        aria-label={valid ? t("datePicker.change", { date: toDisplay(value) }) : t("datePicker.open")}
        title={t("datePicker.open")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        data-pop=""
        data-testid={testId ? `${testId}-calendar` : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <CalendarDays size={18} aria-hidden="true" />
      </button>
      {mobile ? (
        open && (
          <BottomSheet title={title} onClose={close}>
            {calendar}
          </BottomSheet>
        )
      ) : (
        <Popover
          open={open}
          onClose={close}
          anchorRef={buttonRef}
          placement="bottom-end"
          role="dialog"
          label={title}
          className="pdate__pop"
          panelRef={panelRef}
          initialFocus={() => panelRef.current?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')}
          onKeyDown={(e) => {
            // A modal date picker (APG): Tab and Shift+Tab stay inside.
            if (e.key !== "Tab") return;
            const items = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [role="gridcell"][tabindex="0"]'),
            );
            if (items.length === 0) return;
            const i = items.indexOf(document.activeElement as HTMLElement);
            const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i >= items.length - 1 ? 0 : i + 1;
            e.preventDefault();
            e.stopPropagation();
            items[next].focus();
          }}
        >
          {calendar}
        </Popover>
      )}
    </div>
  );
}

/** The month calendar inside the popover or the sheet. */
function DateCalendar({
  dialogId,
  value,
  min,
  max,
  clearable,
  sheet,
  onPick,
  onClear,
}: {
  dialogId: string;
  value: string;
  min?: string;
  max?: string;
  clearable: boolean;
  sheet: boolean;
  onPick: (iso: string) => void;
  onClear: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const titleId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const today = isoOf(new Date());
  const out = (day: string) => (!!min && day < min) || (!!max && day > max);
  // The chosen day; empty, the range's start (the end of a range opens where
  // it starts); else today, or the last allowed day if today is past it.
  const start = value || min || (max && today > max ? max : today);
  const [view, setView] = useState<View>(() => viewOf(start));
  const [focusDay, setFocusDay] = useState(start);
  const keyMoved = useRef(false);

  const fmt = useMemo(
    () => ({
      day: new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      weekdays: weekdayFormats(lang),
    }),
    [lang],
  );

  // In the sheet (a Dialog), the focus starts on the focused day too.
  useLayoutEffect(() => {
    if (sheet) gridRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The focused day follows the keyboard (only after a key).
  useEffect(() => {
    if (!keyMoved.current) return;
    keyMoved.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)?.focus();
  }, [focusDay, view]);

  const first = isoOf(new Date(view.year, view.month, 1));
  const last = isoOf(new Date(view.year, view.month + 1, 0));
  const tabDay = focusDay >= first && focusDay <= last ? focusDay : first;
  const title = monthTitle(lang, view.year, view.month);

  const shift = (n: number) => {
    const d = new Date(view.year, view.month + n, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  };

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>, day: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!out(day)) onPick(day);
      return;
    }
    const next = moveDay(day, e.key);
    if (!next) return;
    e.preventDefault();
    keyMoved.current = true;
    setFocusDay(next);
    if (next < first || next > last) setView(viewOf(next));
  }

  const weeks = monthWeeks(view.year, view.month);
  const todayOut = out(today);
  return (
    <div id={dialogId} className="pdate-cal" data-sheet={sheet || undefined}>
      <div className="pdate-cal__head">
        <button
          type="button"
          className="pdate-cal__nav"
          aria-label={t("datePicker.prevMonth")}
          title={t("datePicker.prevMonth")}
          onClick={() => shift(-1)}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <h2 id={titleId} className="pdate-cal__title" aria-live="polite">
          {title}
        </h2>
        <button
          type="button"
          className="pdate-cal__nav"
          aria-label={t("datePicker.nextMonth")}
          title={t("datePicker.nextMonth")}
          onClick={() => shift(1)}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div role="grid" aria-labelledby={titleId} className="pdate-cal__grid" ref={gridRef}>
        <div role="row" className="pdate-cal__week">
          {fmt.weekdays.map((d) => (
            <span key={d.key} role="columnheader" className="pdate-cal__wd">
              <abbr title={d.long}>{d.short}</abbr>
            </span>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div role="row" key={wi} className="pdate-cal__week">
            {week.map((dn, col) => {
              if (dn === null) return <span key={col} role="gridcell" className="pdate-cal__day" data-empty="" />;
              const date = new Date(view.year, view.month, dn);
              const day = isoOf(date);
              const chosen = day === value;
              const off = out(day);
              const parts = [fmt.day.format(date)];
              if (day === today) parts.push(t("datePicker.todayMark"));
              return (
                <div
                  key={col}
                  role="gridcell"
                  data-day={day}
                  tabIndex={day === tabDay ? 0 : -1}
                  aria-selected={chosen}
                  aria-disabled={off || undefined}
                  aria-label={parts.join(" · ")}
                  className="pdate-cal__day"
                  onClick={() => !off && onPick(day)}
                  onKeyDown={(e) => onKeyDown(e, day)}
                  onFocus={() => setFocusDay(day)}
                >
                  <span
                    aria-hidden="true"
                    className="pdate-cal__num"
                    data-filled={chosen || undefined}
                    data-today={(day === today && !chosen) || undefined}
                  >
                    {dn}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="pdate-cal__foot">
        {clearable && (
          <button type="button" className="pdate-cal__action" onClick={onClear}>
            {t("datePicker.clear")}
          </button>
        )}
        <button
          type="button"
          className="pdate-cal__action pdate-cal__action--today"
          disabled={todayOut}
          title={todayOut ? t("datePicker.todayOut") : undefined}
          onClick={() => onPick(today)}
        >
          {t("datePicker.today")}
        </button>
      </div>
    </div>
  );
}
