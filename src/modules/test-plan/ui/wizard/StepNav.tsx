import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ListOrdered } from "lucide-react";
import { BottomSheet, MenuItem } from "@shared/ui/Menu";
import { STEP_IDS } from "./steps";

interface NavProps {
  current: number;
  completion: boolean[];
  onGo: (index: number) => void;
}

function useStepText() {
  const { t } = useTranslation();
  return {
    t,
    title: (i: number) => t(`testPlan.step.${STEP_IDS[i]}`),
    /** «Paso 5 de 19 · 4 completados» */
    summary: (current: number, done: number) =>
      `${t("testPlan.nav.stepOf", { n: current + 1, total: STEP_IDS.length })} · ${t("testPlan.nav.completed", { count: done })}`,
  };
}

const percent = (done: number) => Math.round((done / STEP_IDS.length) * 100);

/** A step's state for assistive tech, after its name. */
function stateText(t: (k: string) => string, done: boolean, current: boolean) {
  return [current && t("testPlan.nav.current"), done && t("testPlan.nav.done")].filter(Boolean).join(", ");
}

/**
 * Step navigation of the plan (SPEC §8, ACTUALIZACION §5), by the app
 * container's width: from 1360 px the vertical list (`StepRail`), from 600 px
 * the horizontal strip (`StepStrip`), below that `StepCompact`.
 */
export function StepRail({ current, completion, onGo }: NavProps) {
  const { t, title } = useStepText();
  const done = completion.filter(Boolean).length;
  return (
    <nav className="tpw-rail" aria-label={t("testPlan.nav.label")}>
      <div className="tpw-rail__head">
        <span className="tpw-rail__title">{t("testPlan.nav.wizard")}</span>
        <span className="tpw-rail__meta">
          <span>{t("testPlan.nav.progress", { done, total: STEP_IDS.length })}</span>
          <span className="tpw-num">{percent(done)} %</span>
        </span>
        <Progress done={done} />
      </div>
      <ol className="tpw-rail__list">
        {STEP_IDS.map((id, i) => {
          const isCurrent = i === current;
          return (
            <li key={id}>
              <button
                type="button"
                className="tpw-rail__step"
                data-current={isCurrent || undefined}
                data-done={completion[i] || undefined}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => onGo(i)}
              >
                <StepDot n={i + 1} done={completion[i]} current={isCurrent} />
                <span className="tpw-rail__name">{title(i)}</span>
                <span className="sr-only">{stateText(t, completion[i], false)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StepStrip({ current, completion, onGo }: NavProps) {
  const { t, title, summary } = useStepText();
  const done = completion.filter(Boolean).length;
  const stripRef = useRef<HTMLOListElement>(null);
  // The current step stays centred in the strip (without scrolling the page).
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const cur = strip?.querySelector<HTMLElement>("[data-current]");
    if (!strip || !cur) return;
    strip.scrollLeft = cur.offsetLeft - strip.offsetLeft - (strip.clientWidth - cur.offsetWidth) / 2;
  }, [current]);
  return (
    <nav className="tpw-strip" aria-label={t("testPlan.nav.label")}>
      <div className="tpw-strip__head">
        <span className="tpw-strip__meta">{summary(current, done)}</span>
        <span className="tpw-strip__title">{title(current)}</span>
        <span className="tpw-num tpw-strip__pct">{percent(done)} %</span>
      </div>
      <Progress done={done} />
      <ol ref={stripRef} className="tpw-strip__list">
        {STEP_IDS.map((id, i) => {
          const isCurrent = i === current;
          return (
            <li key={id}>
              <button
                type="button"
                className="tpw-strip__step"
                data-current={isCurrent || undefined}
                data-done={completion[i] || undefined}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`${i + 1}. ${title(i)}${completion[i] ? `, ${t("testPlan.nav.done")}` : ""}`}
                title={title(i)}
                onClick={() => onGo(i)}
              >
                <StepDot n={i + 1} done={completion[i]} current={isCurrent} />
                {isCurrent && <span className="tpw-strip__name">{title(i)}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StepCompact({ current, completion, onGo }: NavProps) {
  const { t, title, summary } = useStepText();
  const [open, setOpen] = useState(false);
  const done = completion.filter(Boolean).length;
  return (
    <div className="tpw-compact">
      <div className="tpw-compact__text">
        <span className="tpw-strip__meta">{summary(current, done)}</span>
        <Progress done={done} />
      </div>
      <button
        type="button"
        className="pj-action"
        data-natural=""
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <ListOrdered size={16} aria-hidden="true" />
        {t("testPlan.nav.showSteps")}
      </button>
      {open && (
        <BottomSheet title={t("testPlan.nav.label")} onClose={() => setOpen(false)}>
          {STEP_IDS.map((id, i) => (
            <MenuItem key={id} selected={i === current} onSelect={() => onGo(i)}>
              <span className="tpw-sheet-step">
                <StepDot n={i + 1} done={completion[i]} current={i === current} />
                <span className="u-truncate">{title(i)}</span>
                {completion[i] && <span className="sr-only">, {t("testPlan.nav.done")}</span>}
              </span>
            </MenuItem>
          ))}
        </BottomSheet>
      )}
    </div>
  );
}

function StepDot({ n, done, current }: { n: number; done: boolean; current: boolean }) {
  return (
    <span className="tpw-dot" data-done={done || undefined} data-current={current || undefined} aria-hidden="true">
      {done && !current ? <Check size={13} strokeWidth={3} /> : n}
    </span>
  );
}

function Progress({ done }: { done: number }) {
  const { t } = useTranslation();
  return (
    <span
      className="tpw-progress"
      role="progressbar"
      aria-label={t("testPlan.nav.progress", { done, total: STEP_IDS.length })}
      aria-valuemin={0}
      aria-valuemax={STEP_IDS.length}
      aria-valuenow={done}
    >
      <span className="tpw-progress__bar" style={{ width: `${percent(done)}%` }} />
    </span>
  );
}
