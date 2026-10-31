import { useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ScheduleMilestone, ScheduleSprint } from "../../../model/types";
import { addDays, isDrawable, isoOf, parseIso, toDisplay } from "../../../model/schedule";

export interface CalendarView {
  year: number;
  /** 0-based month of the first grid. */
  month: number;
}

interface Props {
  view: CalendarView;
  months: 1 | 2;
  /** Sprints sorted by start (the order gives the alternating fill). */
  sprints: ScheduleSprint[];
  milestones: ScheduleMilestone[];
  overlap: Map<string, string>;
  today: string;
  /** Day the roving tab stop is on. */
  focusDay: string;
  /** First day of a sprint being marked, and the hovered end. */
  anchor: string | null;
  hover: string | null;
  /** Selected or highlighted sprint / milestone id. */
  active: string | null;
  /** Ends of the selected sprint can be dragged (desktop). */
  canDrag: boolean;
  onDay: (day: string) => void;
  onHoverDay: (day: string) => void;
  onFocusDay: (day: string) => void;
  onDragStart: (sprintId: string, edge: "start" | "end") => void;
  onEscape: () => void;
  /** Moves the view so `day` is visible. */
  onReveal: (day: string) => void;
}

/** First day of month `m` of `y` (normalized, so m may be out of 0–11). */
const firstOf = (y: number, m: number) => new Date(y, m, 1);

/** Month grid(s) of step 14 (RED-W5): sprints as bands, milestones as
 *  diamonds, today ringed. A WAI-ARIA grid with one tab stop: arrows move a
 *  day / a week, Home/End to the week's ends, PageUp/PageDown a month,
 *  Enter/Space act like a click, Esc cancels a range being marked. Bands and
 *  diamonds are drawn for sighted users; every day's label says the same. */
export function ScheduleCalendar(props: Props) {
  const { view, months, sprints, milestones, overlap, today, focusDay, anchor, hover, active } = props;
  const { t, i18n } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const keyMoved = useRef(false);
  const lang = i18n.language;

  const fmt = useMemo(
    () => ({
      month: new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }),
      day: new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      wdShort: new Intl.DateTimeFormat(lang, { weekday: "short" }),
      wdLong: new Intl.DateTimeFormat(lang, { weekday: "long" }),
    }),
    [lang],
  );
  // 2024-01-01 was a Monday: the week starts on Monday.
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i));

  const preview =
    anchor && hover ? (anchor <= hover ? [anchor, hover] : [hover, anchor]) : anchor ? [anchor, anchor] : null;
  const drawn = sprints.filter(isDrawable);

  // The focused day follows the keyboard (only after a key, not on renders).
  useEffect(() => {
    if (!keyMoved.current) return;
    keyMoved.current = false;
    rootRef.current?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)?.focus();
  }, [focusDay, view]);

  const firstVisible = isoOf(firstOf(view.year, view.month));
  const lastVisible = isoOf(new Date(view.year, view.month + months, 0));
  const tabDay = focusDay >= firstVisible && focusDay <= lastVisible ? focusDay : firstVisible;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>, day: string) {
    const d = parseIso(day)!;
    const dow = (d.getDay() + 6) % 7;
    let next: string | null = null;
    switch (e.key) {
      case "ArrowLeft":
        next = addDays(day, -1);
        break;
      case "ArrowRight":
        next = addDays(day, 1);
        break;
      case "ArrowUp":
        next = addDays(day, -7);
        break;
      case "ArrowDown":
        next = addDays(day, 7);
        break;
      case "Home":
        next = addDays(day, -dow);
        break;
      case "End":
        next = addDays(day, 6 - dow);
        break;
      case "PageUp":
      case "PageDown": {
        const m = new Date(d.getFullYear(), d.getMonth() + (e.key === "PageUp" ? -1 : 1), 1);
        const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        next = isoOf(new Date(m.getFullYear(), m.getMonth(), Math.min(d.getDate(), last)));
        break;
      }
      case "Enter":
      case " ":
        e.preventDefault();
        props.onDay(day);
        return;
      case "Escape":
        if (anchor) {
          e.preventDefault();
          e.stopPropagation();
          props.onEscape();
        }
        return;
      default:
        return;
    }
    e.preventDefault();
    keyMoved.current = true;
    props.onFocusDay(next);
    if (anchor) props.onHoverDay(next);
    if (next < firstVisible || next > lastVisible) props.onReveal(next);
  }

  function dayLabel(day: string, date: Date, s: ScheduleSprint | undefined, hs: ScheduleMilestone[]) {
    const parts = [fmt.day.format(date)];
    if (day === today) parts.push(t("testPlan.schedule.today"));
    if (s) {
      const edge =
        s.start === day && s.end === day
          ? t("testPlan.schedule.startEnd")
          : s.start === day
            ? t("testPlan.schedule.startDay")
            : s.end === day
              ? t("testPlan.schedule.endDay")
              : "";
      parts.push(
        [
          t("testPlan.schedule.sprintLabel", { name: s.name || t("testPlan.schedule.unnamed"), from: toDisplay(s.start), to: toDisplay(s.end) }),
          edge,
        ]
          .filter(Boolean)
          .join(", "),
      );
      if (overlap.has(s.id)) parts.push(t("testPlan.schedule.overlapShort"));
    }
    for (const h of hs) parts.push(t("testPlan.schedule.milestoneLabel", { name: h.name || t("testPlan.schedule.unnamed") }));
    if (preview && day >= preview[0] && day <= preview[1]) parts.push(t("testPlan.schedule.inPreview"));
    return parts.join(" · ");
  }

  return (
    <div className="tps-cal" ref={rootRef}>
      {Array.from({ length: months }, (_, mi) => {
        const first = firstOf(view.year, view.month + mi);
        const y = first.getFullYear();
        const m = first.getMonth();
        const lead = (first.getDay() + 6) % 7;
        const days = new Date(y, m + 1, 0).getDate();
        const slots: (number | null)[] = [
          ...Array.from({ length: lead }, () => null),
          ...Array.from({ length: days }, (_, i) => i + 1),
        ];
        while (slots.length % 7) slots.push(null);
        const weeks = Array.from({ length: slots.length / 7 }, (_, w) => slots.slice(w * 7, w * 7 + 7));
        const label = fmt.month.format(first);
        return (
          <div key={`${y}-${m}`} className="tps-month">
            <span className="tps-month__label" aria-hidden="true">
              {label}
            </span>
            <div role="grid" aria-label={`${t("testPlan.schedule.calendar")} · ${label}`} className="tps-grid">
              <div role="row" className="tps-week tps-week--head">
                {weekdays.map((d) => (
                  <span key={d.getDay()} role="columnheader" className="tps-wd">
                    <abbr title={fmt.wdLong.format(d)}>{fmt.wdShort.format(d).replace(".", "")}</abbr>
                  </span>
                ))}
              </div>
              {weeks.map((week, wi) => (
                <div role="row" key={wi} className="tps-week">
                  {week.map((dn, col) => {
                    if (dn === null) return <span key={col} role="gridcell" className="tps-day tps-day--empty" />;
                    const date = new Date(y, m, dn);
                    const day = isoOf(date);
                    const idx = drawn.findIndex((q) => q.start <= day && day <= q.end);
                    const s = idx >= 0 ? drawn[idx] : undefined;
                    const hs = milestones.filter((h) => h.date === day);
                    const isActive = !!s && active === s.id;
                    const inPrev = !!preview && preview[0] <= day && day <= preview[1];
                    const edge = !!s && (s.start === day || s.end === day);
                    const startCap = (s && s.start === day) || (inPrev && preview![0] === day) || col === 0 || dn === 1;
                    const endCap = (s && s.end === day) || (inPrev && preview![1] === day) || col === 6 || dn === days;
                    const filled =
                      anchor === day || (isActive && edge) || (inPrev && (preview![0] === day || preview![1] === day));
                    const draggable = props.canDrag && isActive && edge;
                    const band = inPrev
                      ? "preview"
                      : !s
                        ? null
                        : overlap.has(s.id)
                          ? "overlap"
                          : isActive
                            ? "active"
                            : idx % 2
                              ? "alt"
                              : "base";
                    const hActive = hs.some((h) => h.id === active);
                    return (
                      <div
                        key={col}
                        role="gridcell"
                        data-day={day}
                        tabIndex={day === tabDay ? 0 : -1}
                        aria-selected={filled || hActive}
                        aria-label={dayLabel(day, date, s, hs)}
                        className="tps-day"
                        data-drag={draggable || undefined}
                        onClick={() => props.onDay(day)}
                        onKeyDown={(e) => onKeyDown(e, day)}
                        onFocus={() => props.onFocusDay(day)}
                        onPointerEnter={() => props.onHoverDay(day)}
                        onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
                          // A finger scrolls; only a mouse or pen drags.
                          if (!draggable || e.button > 0 || e.pointerType === "touch") return;
                          e.preventDefault();
                          props.onDragStart(s!.id, s!.start === day ? "start" : "end");
                        }}
                      >
                        {band && (
                          <span
                            aria-hidden="true"
                            className="tps-band"
                            data-band={band}
                            data-cap-start={startCap || undefined}
                            data-cap-end={endCap || undefined}
                            data-edge={(band === "overlap" && edge) || undefined}
                          />
                        )}
                        <span
                          aria-hidden="true"
                          className="tps-num"
                          data-filled={filled || undefined}
                          data-today={(day === today && !filled) || undefined}
                          data-strong={edge || filled || undefined}
                        >
                          {dn}
                        </span>
                        {hs.length > 0 && (
                          <span aria-hidden="true" className="tps-diamond" data-active={hActive || undefined} />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
