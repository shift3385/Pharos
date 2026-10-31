import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarRange, ChevronLeft, ChevronRight, Diamond, Plus } from "lucide-react";
import { duplicateRow, duplicateRows } from "@shared/validation";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import type { ScheduleMilestone, ScheduleSprint } from "../../model/types";
import {
  fromDisplay,
  isDrawable,
  isIsoDay,
  isoOf,
  newScheduleId,
  nextSprintName,
  nextSprintRange,
  overlaps,
  parseIso,
  toDisplay,
} from "../../model/schedule";
import { expectedSprintDays, milestoneIssues, sprintIssues } from "./formState";
import { ScheduleCalendar, type CalendarView } from "./schedule/ScheduleCalendar";
import { DateField, DeleteButton, RowMessage } from "./schedule/ScheduleRows";
import type { StepProps } from "./stepProps";

type Mode = "sprint" | "milestone";
type Drag = { id: string; edge: "start" | "end" };

/** Container widths of the prototype: two months from 640 px, and the band
 *  ends drag only on desktop pointers (not on phones). */
const TWO_MONTHS_MIN = 640;
const DRAG_MIN = 560;
/** Sprint length when step 6 gives none (traditional plan): two weeks. */
const DEFAULT_DAYS = 14;

/** A mouse or pen is the primary pointer (without `matchMedia`, assume so). */
const finePointer = () =>
  typeof window.matchMedia !== "function" || window.matchMedia("(pointer: fine)").matches;

const viewOf = (iso: string): CalendarView => {
  const d = parseIso(iso) ?? new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
};
const monthIndex = (v: CalendarView) => v.year * 12 + v.month;
/** Drawable rows first, by date; rows with a missing or invalid date after,
 *  in their order. */
const byDate = <T,>(rows: T[], key: (r: T) => string) =>
  rows
    .map((r, i) => ({ r, i, k: isIsoDay(key(r)) ? key(r) : "￿" }))
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i))
    .map((x) => x.r);

/** Step 14, Cronograma (RED-W5): one calendar where sprints are marked as
 *  ranges and milestones as days, and the rows below with the same data in
 *  dd/mm/aaaa. Calendar and rows edit the same list both ways. */
export function ScheduleStep({ form, setForm }: StepProps) {
  const { t } = useTranslation();
  const uid = useId();
  const mobile = useBreakpoint() === "mobile";
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => window.innerWidth);
  const today = isoOf(new Date());

  const [mode, setMode] = useState<Mode>("sprint");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [hl, setHl] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragged = useRef(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [view, setView] = useState<CalendarView>(() => {
    const first = [
      ...form.sprints.filter(isDrawable).map((s) => s.start),
      ...form.milestones.filter((m) => isIsoDay(m.date)).map((m) => m.date),
    ].sort()[0];
    return viewOf(first ?? today);
  });
  const [focusDay, setFocusDay] = useState(() => isoOf(new Date(view.year, view.month, 1)));

  // The container, not the window, decides one or two months (as the
  // prototype); jsdom has no layout, so the window width is the fallback.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (el.clientWidth) setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e?.contentRect.width ?? 0);
      if (w) setWidth((p) => (Math.abs(p - w) > 4 ? w : p));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const months: 1 | 2 = !mobile && width >= TWO_MONTHS_MIN ? 2 : 1;
  // Dragging needs a precise pointer (mouse, pen): on a touch screen the
  // finger scrolls the page instead, so tablets edit dates in the rows.
  const canDrag = !mobile && width >= DRAG_MIN && finePointer();

  // A drag ends wherever the pointer is released. Only a release on a day is
  // followed by that day's click, which must not count as a new click.
  useEffect(() => {
    if (!drag) return;
    const up = (e: PointerEvent) => {
      dragged.current = e.target instanceof Element && e.target.closest("[data-day]") !== null;
      setDrag(null);
    };
    document.addEventListener("pointerup", up);
    return () => document.removeEventListener("pointerup", up);
  }, [drag]);
  // Esc cancels a range being marked, only while the focus is in this step
  // (not in a dialog or menu opened over it).
  useEffect(() => {
    if (!anchor) return;
    const esc = (e: KeyboardEvent) => {
      const focus = document.activeElement;
      const here = !focus || focus === document.body || rootRef.current?.contains(focus);
      if (e.key === "Escape" && here) {
        setAnchor(null);
        setHover(null);
      }
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [anchor]);

  const updSprints = (fn: (s: ScheduleSprint[]) => ScheduleSprint[]) =>
    setForm((f) => (f ? { ...f, sprints: fn(f.sprints) } : f));
  const updMilestones = (fn: (m: ScheduleMilestone[]) => ScheduleMilestone[]) =>
    setForm((f) => (f ? { ...f, milestones: fn(f.milestones) } : f));
  const patchSprint = (id: string, patch: Partial<ScheduleSprint>) =>
    updSprints((all) => all.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const patchMilestone = (id: string, patch: Partial<ScheduleMilestone>) =>
    updMilestones((all) => all.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const usedIds = () => new Set([...form.sprints, ...form.milestones].map((x) => x.id));

  /** Shows the month(s) holding `day` if they are not on screen. */
  const reveal = (day: string) => {
    const target = viewOf(day);
    const first = monthIndex(view);
    const idx = monthIndex(target);
    if (idx < first) setView(target);
    else if (idx > first + months - 1) setView(viewOf(isoOf(new Date(target.year, target.month - months + 1, 1))));
  };

  const word = t("testPlan.schedule.sprintWord");
  const expected = expectedSprintDays(form);
  const nextDays = expected ?? DEFAULT_DAYS;
  const next = nextSprintRange(form.sprints, nextDays, today);
  const nextName = nextSprintName(form.sprints, word);

  function addSprint(start: string, end: string) {
    const id = newScheduleId(usedIds());
    updSprints((all) => [...all, { id, name: nextSprintName(all, word), start, end }]);
    setSel(id);
    setAnchor(null);
    setHover(null);
  }

  const sorted = byDate(form.sprints, (s) => s.start);
  const drawnSorted = sorted.filter(isDrawable);
  const over = overlaps(form.sprints);

  function onDay(day: string) {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    if (mode === "milestone") {
      const here = form.milestones.find((m) => m.date === day);
      if (here) setSel(sel === here.id ? null : here.id);
      else {
        const id = newScheduleId(usedIds());
        updMilestones((all) => [
          ...all,
          { id, name: t("testPlan.schedule.milestoneN", { n: all.length + 1 }), date: day },
        ]);
        setSel(id);
      }
      return;
    }
    if (!anchor) {
      const s = drawnSorted.find((q) => q.start <= day && day <= q.end);
      if (s) setSel(sel === s.id ? null : s.id);
      else {
        setAnchor(day);
        setHover(day);
        setSel(null);
      }
      return;
    }
    addSprint(anchor < day ? anchor : day, anchor < day ? day : anchor);
  }

  function onHoverDay(day: string) {
    if (anchor) setHover(day);
    if (drag)
      updSprints((all) =>
        all.map((q) =>
          q.id !== drag.id
            ? q
            : drag.edge === "start"
              ? { ...q, start: day <= q.end ? day : q.end }
              : { ...q, end: day >= q.start ? day : q.start },
        ),
      );
  }

  const draft = (key: string, v: string) => setDrafts((d) => ({ ...d, [key]: v }));
  /** Applies what was typed, always: a real day as ISO, an empty field clears
   *  the date, anything else is kept as written. The row's warning (invalid
   *  date, end before start…) then says what is wrong, the plan counts as
   *  changed and the save toast counts the warning; nothing typed is held back
   *  unsaved. `focusId` is where the focus goes (Enter: the same field). */
  function commit(key: string, text: string, apply: (value: string) => void, focusId: string | null) {
    // Nothing typed since the last commit (a blur right after Enter): no-op.
    if (!(key in drafts)) return;
    const t = text.trim();
    const value = t === "" ? "" : (fromDisplay(t) ?? t);
    apply(value);
    setDrafts((d) => {
      const { [key]: _, ...rest } = d;
      return rest;
    });
    keepFocus.current = focusId;
    if (isIsoDay(value)) reveal(value);
  }
  const removeKeys = (id: string) =>
    setDrafts((o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith(`${id}:`))));

  // Rows are sorted by date: a committed date can move its row, and moving a
  // node drops its focus. Put the focus back where the user left it.
  const keepFocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = keepFocus.current;
    if (!id) return;
    keepFocus.current = null;
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.focus();
  });

  const issues = sprintIssues(sorted, expected);
  const names = duplicateRows(sorted, (x) => x.name);
  const mSorted = byDate(form.milestones, (m) => m.date);
  const mIssues = milestoneIssues(mSorted);
  const mNames = duplicateRows(mSorted, (x) => x.name);
  const active = hl ?? sel;

  const hint = anchor
    ? t("testPlan.schedule.hintEnd", { date: toDisplay(anchor) })
    : mode === "milestone"
      ? t("testPlan.schedule.hintMilestone")
      : t(canDrag ? "testPlan.schedule.hintSprintDrag" : "testPlan.schedule.hintSprint");
  const nextDesc = t("testPlan.schedule.nextTitle", {
    name: nextName,
    from: toDisplay(next.start),
    to: toDisplay(next.end),
    count: nextDays,
  });
  const fill = (i: number) => (i % 2 ? "alt" : "base");

  return (
    <div className="tps" ref={rootRef}>
      <div className="tps-card">
        <div className="tps-bar">
          <div role="radiogroup" aria-label={t("testPlan.schedule.addWhat")} className="tps-seg">
            {(["sprint", "milestone"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className="tps-seg__btn"
                onClick={() => {
                  setMode(m);
                  setAnchor(null);
                  setHover(null);
                }}
              >
                {m === "sprint" ? <CalendarRange size={15} aria-hidden="true" /> : <Diamond size={15} aria-hidden="true" />}
                {t(m === "sprint" ? "testPlan.schedule.modeSprint" : "testPlan.schedule.modeMilestone")}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="tps-next"
            title={nextDesc}
            aria-describedby={`${uid}-next`}
            onClick={() => {
              addSprint(next.start, next.end);
              reveal(next.start);
            }}
          >
            <Plus size={15} aria-hidden="true" />
            {t("testPlan.schedule.nextSprint")}
          </button>
          <span id={`${uid}-next`} className="sr-only">
            {nextDesc}
          </span>
          <div className="tps-nav">
            <button
              type="button"
              className="tps-nav__btn"
              aria-label={t("testPlan.schedule.prevMonth")}
              onClick={() => setView((v) => viewOf(isoOf(new Date(v.year, v.month - 1, 1))))}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="tps-nav__btn"
              aria-label={t("testPlan.schedule.nextMonth")}
              onClick={() => setView((v) => viewOf(isoOf(new Date(v.year, v.month + 1, 1))))}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <p className="tps-hint" aria-live="polite">
          {hint}
        </p>
        <ScheduleCalendar
          view={view}
          months={months}
          sprints={drawnSorted}
          milestones={form.milestones}
          overlap={over}
          today={today}
          focusDay={focusDay}
          anchor={anchor}
          hover={hover}
          active={active}
          canDrag={canDrag}
          onDay={onDay}
          onHoverDay={onHoverDay}
          onFocusDay={setFocusDay}
          onDragStart={(id, edge) => {
            dragged.current = false;
            setDrag({ id, edge });
          }}
          onEscape={() => {
            setAnchor(null);
            setHover(null);
          }}
          onReveal={reveal}
        />
        <ul className="tps-legend" aria-label={t("testPlan.schedule.legend")}>
          <li>
            {/* Consecutive sprints alternate the two fills. */}
            <span className="tps-legend__band" data-band="base" aria-hidden="true" />
            <span className="tps-legend__band" data-band="alt" aria-hidden="true" />
            {t("testPlan.schedule.modeSprint")}
          </li>
          <li>
            <span className="tps-legend__diamond" aria-hidden="true" />
            {t("testPlan.schedule.modeMilestone")}
          </li>
          <li>
            <span className="tps-legend__today" aria-hidden="true" />
            {t("testPlan.schedule.todayLegend")}
          </li>
          <li>
            <span className="tps-legend__band" data-band="overlap" aria-hidden="true" />
            {t("testPlan.schedule.overlapLegend")}
          </li>
        </ul>
      </div>

      <section className="tps-list" aria-labelledby={`${uid}-sprints`}>
        <div className="tps-list__head">
          <h3 id={`${uid}-sprints`} className="tps-list__title">
            {t("testPlan.sprints")}
          </h3>
          <span className="tps-list__count">{t("testPlan.schedule.sprintCount", { count: sorted.length })}</span>
        </div>
        {sorted.length === 0 && <p className="tps-empty">{t("testPlan.schedule.noSprints")}</p>}
        {sorted.map((s, i) => {
          const id = `tps-${s.id}`;
          const issue = issues[i];
          const nameIssue = duplicateRow(names, i);
          const row = s.name || `${t("testPlan.sprints")} · ${t("a11y.row", { n: i + 1 })}`;
          const msgIds = [issue && `${id}-msg`, nameIssue && `${id}-name-msg`].filter(Boolean).join(" ") || undefined;
          return (
            <div
              key={s.id}
              role="group"
              aria-label={row}
              className="tps-row"
              data-active={active === s.id || undefined}
              onPointerEnter={() => {
                setHl(s.id);
                if (isDrawable(s)) reveal(s.start);
              }}
              onPointerLeave={() => setHl(null)}
              onFocus={() => {
                if (hl !== s.id) {
                  setHl(s.id);
                  if (isDrawable(s)) reveal(s.start);
                }
              }}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHl(null);
              }}
            >
              <div className="tps-row__line">
                <span
                  className="tps-swatch"
                  data-band={over.has(s.id) ? "overlap" : fill(drawnSorted.indexOf(s))}
                  aria-hidden="true"
                />
                <input
                  {...(nameIssue ? { "aria-describedby": `${id}-name-msg` } : {})}
                  className="tps-name"
                  aria-label={t("testPlan.sprintName")}
                  placeholder={t("testPlan.sprintName")}
                  value={s.name}
                  onChange={(e) => patchSprint(s.id, { name: e.target.value })}
                />
                <div className="tps-range">
                  <DateField
                    id={`${id}-start`}
                    label={`${t("testPlan.schedule.startLabel")} · ${row}`}
                    value={drafts[`${s.id}:start`] ?? toDisplay(s.start)}
                    issue={issue && issue.code !== "testPlan.schedule.duration" ? issue : null}
                    describedBy={msgIds}
                    onDraft={(v) => draft(`${s.id}:start`, v)}
                    onCommit={(v, focusId) =>
                      commit(`${s.id}:start`, v, (start) => patchSprint(s.id, { start }), focusId)
                    }
                  />
                  <span className="tps-range__arrow" aria-hidden="true">
                    →
                  </span>
                  <DateField
                    id={`${id}-end`}
                    label={`${t("testPlan.schedule.endLabel")} · ${row}`}
                    value={drafts[`${s.id}:end`] ?? toDisplay(s.end)}
                    issue={issue && issue.code !== "testPlan.schedule.duration" ? issue : null}
                    describedBy={msgIds}
                    onDraft={(v) => draft(`${s.id}:end`, v)}
                    onCommit={(v, focusId) =>
                      commit(`${s.id}:end`, v, (end) => patchSprint(s.id, { end }), focusId)
                    }
                  />
                </div>
                <DeleteButton
                  label={`${t("testPlan.schedule.removeSprint")}: ${row}`}
                  onClick={() => {
                    updSprints((all) => all.filter((z) => z.id !== s.id));
                    removeKeys(s.id);
                    if (sel === s.id) setSel(null);
                    setHl(null);
                  }}
                />
              </div>
              {issue && <RowMessage id={`${id}-msg`} issue={issue} />}
              {nameIssue && <RowMessage id={`${id}-name-msg`} issue={nameIssue} />}
            </div>
          );
        })}
      </section>

      <section className="tps-list" aria-labelledby={`${uid}-milestones`}>
        <div className="tps-list__head">
          <h3 id={`${uid}-milestones`} className="tps-list__title">
            {t("testPlan.milestones")}
          </h3>
          <span className="tps-list__count">{t("testPlan.schedule.milestoneCount", { count: mSorted.length })}</span>
        </div>
        {mSorted.length === 0 && <p className="tps-empty">{t("testPlan.schedule.noMilestones")}</p>}
        {mSorted.map((m, i) => {
          const id = `tps-${m.id}`;
          const issue = mIssues[i];
          const nameIssue = duplicateRow(mNames, i);
          const row = m.name || `${t("testPlan.milestones")} · ${t("a11y.row", { n: i + 1 })}`;
          return (
            <div
              key={m.id}
              role="group"
              aria-label={row}
              className="tps-row"
              data-active={active === m.id || undefined}
              onPointerEnter={() => {
                setHl(m.id);
                if (isIsoDay(m.date)) reveal(m.date);
              }}
              onPointerLeave={() => setHl(null)}
              onFocus={() => {
                if (hl !== m.id) {
                  setHl(m.id);
                  if (isIsoDay(m.date)) reveal(m.date);
                }
              }}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHl(null);
              }}
            >
              <div className="tps-row__line">
                <span className="tps-swatch tps-swatch--diamond" aria-hidden="true" />
                <input
                  {...(nameIssue ? { "aria-describedby": `${id}-name-msg` } : {})}
                  className="tps-name"
                  aria-label={t("testPlan.milestoneName")}
                  placeholder={t("testPlan.milestoneName")}
                  value={m.name}
                  onChange={(e) => patchMilestone(m.id, { name: e.target.value })}
                />
                <DateField
                  id={`${id}-date`}
                  label={`${t("testPlan.schedule.dateLabel")} · ${row}`}
                  value={drafts[`${m.id}:date`] ?? toDisplay(m.date)}
                  issue={issue}
                  describedBy={issue ? `${id}-msg` : undefined}
                  onDraft={(v) => draft(`${m.id}:date`, v)}
                  onCommit={(v, focusId) =>
                    commit(`${m.id}:date`, v, (date) => patchMilestone(m.id, { date }), focusId)
                  }
                />
                <DeleteButton
                  label={`${t("testPlan.schedule.removeMilestone")}: ${row}`}
                  onClick={() => {
                    updMilestones((all) => all.filter((z) => z.id !== m.id));
                    removeKeys(m.id);
                    if (sel === m.id) setSel(null);
                    setHl(null);
                  }}
                />
              </div>
              {issue && <RowMessage id={`${id}-msg`} issue={issue} />}
              {nameIssue && <RowMessage id={`${id}-name-msg`} issue={nameIssue} />}
            </div>
          );
        })}
      </section>
    </div>
  );
}
