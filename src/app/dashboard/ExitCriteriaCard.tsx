import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarClock, ChevronDown, Search } from "lucide-react";
import { projectPath } from "@modules/projects";
import { MenuItem, MenuLabel, ResponsiveMenu } from "@shared/ui/Menu";
import { usePopover } from "@shared/ui/usePopover";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { StatusPill } from "@shared/ui/StatusPill";
import {
  exitCriteriaChoices,
  shortDate,
  type HomeProject,
} from "./model/homeData";
import {
  byProject,
  execRow,
  exitStatus,
  type ExitCriterion as CriterionEvaluation,
  type ExitStatus,
  type ProjectMetrics,
} from "./model/metrics";
import type { MetricsState } from "./model/loadHomeMetrics";
import { MetricsNotice } from "./MetricsNotice";
import { FitMore } from "./FitMore";
import { useFitRows } from "./model/fitRows";
import { InfoTip } from "@shared/ui/InfoTip";
import { Skeleton } from "@shared/ui/Skeleton";
import { skeletonWidth } from "@shared/ui/skeletonWidth";

const RING_R = 42;
const RING_C = 2 * Math.PI * RING_R;

/** «Criterios de salida» (SPEC §8, RED-W6): the chosen project's plan
 *  criteria as the shared derivation evaluates them (Cumple / No cumple, or
 *  «Sin datos» when a criterion is not machine-readable), the ring with the
 *  share of cases executed, and the closing date. The picker searches,
 *  filters by Todos / En riesgo / Cumplen and sorts by closing date (SPEC §6
 *  long lists). */
export function ExitCriteriaCard({
  projects,
  selected,
  onSelect,
  today,
  state,
  onRetry,
  loading = false,
}: {
  /** The projects are not known yet: placeholders, not «no projects». */
  loading?: boolean;
  projects: HomeProject[];
  selected: HomeProject | null;
  onSelect: (id: string) => void;
  today: Date;
  state: MetricsState;
  onRetry: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const pm = byProject(state.data);
  const ready = state.status === "ready";
  const percent = new Intl.NumberFormat(lang, { style: "percent" });

  const m = selected ? pm.get(selected.id) : undefined;
  const row = execRow(m);
  const share = ready ? row.executedShare : null;
  const executed = ready ? (row.counts?.executed ?? 0) : 0;
  const status = exitStatus(m);
  const evaluable = (m?.exitCriteria ?? []).filter((c) => c.met !== null);
  const metCount = evaluable.filter((c) => c.met).length;
  // With metrics, the derivation's criteria (its text, its raw plan index, or
  // the A3 defaults when the plan has none); before, the plan's text alone.
  const rows: {
    criterion: string;
    metric: string;
    evaluation?: CriterionEvaluation;
  }[] =
    ready && m
      ? m.exitCriteria.map((e) => ({ ...e, evaluation: e }))
      : (selected?.criteria ?? []);
  const defaults =
    ready &&
    !!m &&
    rows.length > 0 &&
    m.exitCriteria.every((e) => e.index === null);
  // On the board only the criteria that fit, then «+N más» (UX-28).
  const fitRows = useFitRows(rows.length);

  let headline = t("dashboard.exit.headline");
  let sub = t("dashboard.exit.sub");
  if (ready && executed > 0) {
    if (status === "risk") {
      headline = t("dashboard.exit.riskHeadline");
      sub = t("dashboard.exit.riskSub", {
        met: metCount,
        count: evaluable.length,
      });
    } else if (status === "met") {
      headline = t("dashboard.exit.metHeadline");
      sub = t("dashboard.exit.metSub");
    } else {
      headline = t("dashboard.exit.executedHeadline", {
        percent: percent.format(share ?? 0),
      });
      sub = t("dashboard.exit.unknownSub");
    }
  } else if (ready && evaluable.length) {
    // Nothing run yet, but the criteria are already evaluated (0 % executed
    // fails «≥ 95 %», 0 critical defects meets «0»): say how many hold.
    sub = t("dashboard.exit.riskSub", {
      met: metCount,
      count: evaluable.length,
    });
  }

  return (
    <section
      className="home-card home-exit"
      aria-labelledby="home-exit-title"
      aria-describedby="home-exit-help"
    >
      <div className="home-card__head home-card__head--nowrap">
        <div className="home-card__titles">
          <div className="home-card__titleline">
            <h2 id="home-exit-title" className="home-card__title">
              {t("dashboard.exit.title")}
            </h2>
            {/* The subtitle is help behind «?» (UX-28). */}
            <InfoTip id="home-exit-help" label={t("dashboard.exit.title")}>
              {t("dashboard.exit.subtitle")}
            </InfoTip>
          </div>
        </div>
        {selected && (
          <ExitProjectPicker
            projects={projects}
            selected={selected}
            onSelect={onSelect}
            today={today}
            metrics={ready ? pm : null}
          />
        )}
      </div>

      {loading ? (
        <div aria-hidden="true">
          <div className="home-exit__summary">
            <Skeleton shape="circle" width={112} height={112} />
            <div className="home-exit__text home-exit__text--sk">
              <Skeleton width="80%" height={14} />
              <Skeleton width="60%" />
              <Skeleton width="50%" />
            </div>
          </div>
          <ul className="home-exit__criteria">
            {[0, 1, 2, 3].map((i) => (
              <li key={i}>
                <Skeleton width={skeletonWidth(i)} />
              </li>
            ))}
          </ul>
        </div>
      ) : !selected ? (
        <p className="home-empty">{t("dashboard.exit.empty")}</p>
      ) : (
        <>
          <div className="home-exit__summary">
            <div
              className="home-ring"
              role="img"
              aria-label={
                share !== null
                  ? t("dashboard.exit.ringValue", {
                      percent: percent.format(share),
                    })
                  : state.status === "loading"
                    ? t("dashboard.exit.ringLoading")
                    : t("dashboard.exit.ringLabel")
              }
              data-status={ready && executed > 0 ? status : undefined}
              data-testid="exit-ring"
            >
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r={RING_R} />
                {share !== null && share > 0 && (
                  <circle
                    className="home-ring__arc"
                    cx="50"
                    cy="50"
                    r={RING_R}
                    strokeDasharray={`${share * RING_C} ${RING_C}`}
                  />
                )}
              </svg>
              <span className="home-ring__text" aria-hidden="true">
                <span
                  className="home-ring__value"
                  data-filled={share !== null || undefined}
                >
                  {share !== null ? (
                    percent.format(share)
                  ) : state.status === "loading" ? (
                    <Skeleton
                      width={44}
                      height={22}
                      className="home-ring__sk"
                    />
                  ) : (
                    "—"
                  )}
                </span>
                <span className="home-ring__label">
                  {t("dashboard.exit.executed")}
                </span>
              </span>
            </div>
            <div className="home-exit__text">
              {ready ? (
                <>
                  <span className="home-exit__headline">{headline}</span>
                  <span>{sub}</span>
                </>
              ) : state.status === "loading" ? (
                <>
                  <Skeleton width="80%" height={14} />
                  <Skeleton width="60%" />
                </>
              ) : (
                <MetricsNotice state={state} onRetry={onRetry} />
              )}
              <span className="home-exit__date">
                <CalendarClock size={14} aria-hidden="true" />
                {selected.closeDate
                  ? t("dashboard.exit.close", {
                      date: shortDate(selected.closeDate, lang),
                    })
                  : t("dashboard.exit.noDate")}
              </span>
            </div>
          </div>

          {(rows.length === 0 || defaults) && (
            <p className="home-empty home-empty--left">
              {selected.hasPlan
                ? t("dashboard.exit.noCriteria")
                : t("dashboard.exit.noPlan")}{" "}
              {defaults && t("dashboard.exit.defaults")}{" "}
              <Link to={projectPath(selected.id, "plan")} className="home-link">
                {t("dashboard.exit.openPlan")}
              </Link>
            </p>
          )}
          {rows.length > 0 && (
            <div className="home-fit" ref={fitRows.boxRef}>
              <ul
                ref={fitRows.listRef}
                className="home-exit__criteria"
                data-testid="home-criteria"
              >
                {rows.slice(0, fitRows.shown).map((c, i) => (
                  <li key={i}>
                    <span className="home-exit__criterion">{c.criterion}</span>
                    {c.metric && (
                      <span className="home-exit__metric t-id">{c.metric}</span>
                    )}
                    {/* No verdict until the metrics load (not even «Sin datos»). */}
                    {ready && <CriterionResult evaluation={c.evaluation} />}
                  </li>
                ))}
              </ul>
              <FitMore
                count={fitRows.more}
                to={projectPath(selected.id, "plan")}
                label={t("dashboard.more", {
                  count: fitRows.more,
                  action: t("dashboard.exit.openPlan"),
                })}
                testId="home-criteria-more"
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** A criterion's value and pill; «Sin datos» says why in its title. */
function CriterionResult({
  evaluation: e,
}: {
  evaluation: CriterionEvaluation | undefined;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const value =
    e?.value == null
      ? null
      : e.kind === "criticalDefects"
        ? new Intl.NumberFormat(lang).format(e.value)
        : new Intl.NumberFormat(lang, {
            style: "percent",
            maximumFractionDigits: 1,
          }).format(e.value / 100);
  return (
    <>
      {value !== null && <span className="home-exit__value">{value}</span>}
      {e?.met === true ? (
        <StatusPill tone="success">{t("dashboard.exit.met")}</StatusPill>
      ) : e?.met === false ? (
        <StatusPill tone="error">{t("dashboard.exit.notMet")}</StatusPill>
      ) : (
        <span
          className="home-exit__pill"
          title={e ? t("dashboard.exit.notEvaluable") : undefined}
        >
          <StatusPill tone="neutral">{t("dashboard.exit.noData")}</StatusPill>
        </span>
      )}
    </>
  );
}

type ExitFilter = "all" | Exclude<ExitStatus, "unknown">;
const FILTERS: ExitFilter[] = ["all", "risk", "met"];

function ExitProjectPicker({
  projects,
  selected,
  onSelect,
  today,
  metrics,
}: {
  projects: HomeProject[];
  selected: HomeProject;
  onSelect: (id: string) => void;
  today: Date;
  /** Null until the metrics load: «En riesgo» and «Cumplen» wait for them. */
  metrics: Map<string, ProjectMetrics> | null;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const menu = usePopover(useBreakpoint() === "mobile" ? "dialog" : "menu");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ExitFilter>("all");
  const active = metrics ? filter : "all";
  const statusOf = (p: HomeProject) => exitStatus(metrics?.get(p.id));
  const count = (f: ExitFilter) =>
    f === "all"
      ? projects.length
      : projects.filter((p) => statusOf(p) === f).length;
  const choices = exitCriteriaChoices(projects, query, today).filter(
    (p) => active === "all" || statusOf(p) === active,
  );
  const close = () => {
    menu.close();
    setQuery("");
  };

  return (
    <>
      <button
        type="button"
        className="home-picker"
        {...menu.triggerProps}
        title={t("dashboard.exit.choose")}
        data-testid="exit-picker"
      >
        <span className="sr-only">{t("dashboard.exit.choose")}: </span>
        {selected.key && (
          <span className="home-picker__key t-id">{selected.key}</span>
        )}
        <span className="home-picker__name u-truncate">{selected.name}</span>
        <ChevronDown
          size={12}
          className="home-picker__chev"
          aria-hidden="true"
        />
      </button>
      <ResponsiveMenu
        open={menu.open}
        onClose={close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={t("dashboard.exit.menuLabel")}
        title={t("dashboard.exit.choose")}
        placement="bottom-end"
        className="home-picker-menu"
        focusHeader
        header={
          <div className="home-picker__head">
            <label className="home-search">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">{t("dashboard.exit.searchLabel")}</span>
              <input
                type="search"
                value={query}
                placeholder={t("dashboard.exit.search", {
                  count: projects.length,
                })}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="exit-search"
              />
            </label>
            <div
              className="home-chips"
              role="group"
              aria-label={t("dashboard.exit.filters")}
            >
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`home-chip${active === f ? " home-chip--current" : ""}`}
                  aria-pressed={active === f}
                  disabled={f !== "all" && !metrics}
                  title={
                    f !== "all" && !metrics
                      ? t("dashboard.exit.filterWaiting")
                      : t(`dashboard.exit.filterTitle.${f}`)
                  }
                  onClick={() => setFilter(f)}
                  data-testid={`exit-filter-${f}`}
                >
                  {t(`dashboard.exit.${f === "met" ? "ok" : f}`)}
                  {(f === "all" || metrics) && (
                    <span className="home-chip__count">{count(f)}</span>
                  )}
                </button>
              ))}
            </div>
            {/* In the header: a menu may only hold menu items. */}
            <p
              className="home-picker__none"
              role="status"
              data-testid="exit-picker-status"
            >
              {choices.length > 0
                ? ""
                : query.trim()
                  ? t("dashboard.exit.noMatch", { query: query.trim() })
                  : t(`dashboard.exit.noneIn.${active}`)}
            </p>
          </div>
        }
      >
        <MenuLabel>{t("dashboard.exit.byClose")}</MenuLabel>
        <div className="home-picker__list">
          {choices.map((p) => (
            <MenuItem
              key={p.id}
              selected={p.id === selected.id}
              testId={`exit-choice-${p.id}`}
              onSelect={() => {
                onSelect(p.id);
                setQuery("");
              }}
            >
              <span className="home-choice">
                <span className="home-choice__key t-id">{p.key}</span>
                <span className="home-choice__main">
                  <span className="home-choice__name u-truncate">{p.name}</span>
                  <span className="home-choice__close">
                    {p.closeDate
                      ? t("dashboard.exit.closes", {
                          date: shortDate(p.closeDate, i18n.resolvedLanguage),
                        })
                      : t("dashboard.exit.noDate")}
                  </span>
                </span>
              </span>
            </MenuItem>
          ))}
        </div>
        <MenuItem icon={ArrowRight} onSelect={() => navigate("/projects")}>
          {t("dashboard.exit.viewAll", { count: projects.length })}
        </MenuItem>
      </ResponsiveMenu>
    </>
  );
}
