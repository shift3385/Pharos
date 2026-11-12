import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Ban,
  CircleDashed,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { projectPath } from "@modules/projects";
import { caseLink } from "@modules/test-cases";
import { PriorityFlag, type FlagTone } from "@shared/ui/PriorityFlag";
import { InfoTip } from "@shared/ui/InfoTip";
import { Skeleton } from "@shared/ui/Skeleton";
import { skeletonWidth } from "@shared/ui/skeletonWidth";
import { Select } from "@shared/ui/Select";
import type { HomeProject } from "./model/homeData";
import {
  instantOf,
  queueCounts,
  queueRows,
  type QueueTab,
} from "./model/metrics";
import type { MetricsState } from "./model/loadHomeMetrics";
import { MetricsNotice } from "./MetricsNotice";
import { FitMore } from "./FitMore";
import { useFitRows } from "./model/fitRows";

const PRIORITY_TONE: Record<string, FlagTone> = {
  critical: "error",
  high: "warning",
  medium: "info",
  low: "muted",
};

const TABS: QueueTab[] = ["notRun", "blocked", "retest"];

/** The icon of each list in the selector (UX-32). */
const TAB_ICON: Record<QueueTab, LucideIcon> = {
  notRun: CircleDashed,
  blocked: Ban,
  retest: RefreshCw,
};

/** Rows read from the metrics: more than ever fit, so «+N más» is exact. */
const ROWS_READ = 50;

/** «Próximas pruebas» (SPEC §8, RED-W6): No ejecutadas (no final result
 *  yet), Bloqueadas (latest final blocked) and Re-test (latest final failed
 *  with a linked defect fixed or in re-test), as the shared derivation
 *  classifies them; each list by priority, then project recency, then case
 *  id. A row opens the case in its project's Casos. The list is chosen with
 *  Pharos' `Select` under the title (UX-32: tabs did not fit a narrow
 *  gadget), «Ver todas» is an arrow, and a Re-test row says when it failed. */
export function UpcomingTests({
  projects,
  state,
  onRetry,
}: {
  projects: HomeProject[];
  state: MetricsState;
  onRetry: () => void;
}) {
  const { t, i18n } = useTranslation();
  const day = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    day: "numeric",
    month: "short",
  });
  const [tab, setTab] = useState<QueueTab>("notRun");
  const counts = queueCounts(state.data);
  const rows = state.data
    ? queueRows(projects, state.data, tab, ROWS_READ)
    : [];
  const only = projects.length === 1 ? projects[0] : null;
  const allTo = only ? projectPath(only.id, "cases") : "/projects";
  // On the board only the cases that fit, then «+N más» (UX-28).
  const fitRows = useFitRows(rows.length);
  // The whole list, beyond the rows read.
  const more = Math.max(
    fitRows.more,
    (counts?.[tab] ?? rows.length) - fitRows.shown,
  );

  return (
    <section
      className="home-card home-card--flush home-upcoming"
      aria-labelledby="home-upcoming-title"
      aria-describedby="home-upcoming-help"
    >
      <div className="home-card__head home-card__head--nowrap home-card__pad">
        <div className="home-card__titles">
          <div className="home-card__titleline">
            <h2 id="home-upcoming-title" className="home-card__title">
              {t("dashboard.upcoming.title")}
            </h2>
            {/* The subtitle is help behind «?» (UX-28). */}
            <InfoTip
              id="home-upcoming-help"
              label={t("dashboard.upcoming.title")}
            >
              {t("dashboard.upcoming.subtitle")}
            </InfoTip>
          </div>
        </div>
        <Link
          to={allTo}
          className="home-upcoming__all"
          aria-label={t("dashboard.upcoming.viewAll")}
          title={t("dashboard.upcoming.viewAll")}
          data-testid="home-upcoming-all"
        >
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <div className="home-upcoming__filter home-card__pad">
        <Select
          aria-label={t("dashboard.upcoming.filters")}
          value={tab}
          onChange={setTab}
          options={TABS.map((id) => ({
            value: id,
            label: counts
              ? t("dashboard.upcoming.option", {
                  label: t(`dashboard.upcoming.${id}`),
                  count: counts[id],
                })
              : t(`dashboard.upcoming.${id}`),
            icon: TAB_ICON[id],
          }))}
          renderValue={() => {
            const Icon = TAB_ICON[tab];
            return (
              <>
                <Icon className="pselect__icon" size={16} aria-hidden="true" />
                <span className="pselect__text">
                  {t(`dashboard.upcoming.${tab}`)}
                </span>
                {counts && (
                  <span
                    className="home-upcoming__count"
                    data-testid="home-upcoming-count"
                  >
                    {counts[tab]}
                  </span>
                )}
              </>
            );
          }}
          data-testid="home-upcoming-filter"
        />
      </div>
      <div className="home-upcoming__panel home-fit" ref={fitRows.boxRef}>
        {state.status === "loading" ? (
          <div aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="home-queue__row">
                <span className="home-queue__flag" />
                <span className="home-queue__main">
                  <Skeleton width={skeletonWidth(i)} />
                  <Skeleton width={skeletonWidth(i + 3)} height={10} />
                </span>
              </div>
            ))}
          </div>
        ) : state.status !== "ready" ? (
          <MetricsNotice
            state={state}
            onRetry={onRetry}
            className="home-card__pad"
          />
        ) : rows.length === 0 ? (
          <p className="home-empty home-card__pad">
            {t(`dashboard.upcoming.empty.${tab}`)}
          </p>
        ) : (
          <ul
            ref={fitRows.listRef}
            className="home-queue"
            data-testid="home-upcoming"
            data-tab={tab}
          >
            {rows.slice(0, fitRows.shown).map((r) => {
              const tone = PRIORITY_TONE[r.priority];
              return (
                <li key={`${r.projectId}/${r.caseId}`}>
                  <Link
                    to={caseLink(r.projectId, r.caseId)}
                    className="home-queue__row"
                  >
                    {tone ? (
                      <PriorityFlag
                        tone={tone}
                        label={t(`dashboard.upcoming.priority.${r.priority}`)}
                        className="home-queue__flag"
                      />
                    ) : (
                      <span className="home-queue__flag" aria-hidden="true" />
                    )}
                    <span className="home-queue__main">
                      <span className="home-queue__title u-truncate">
                        {r.title}
                      </span>
                      <span className="home-queue__meta">
                        <span className="t-id">{r.scenarioId}</span>
                        <span aria-hidden="true">·</span>
                        <span className="u-truncate">{r.projectName}</span>
                        {/* When it failed: the latest final result of a re-test. */}
                        {tab === "retest" && instantOf(r.lastAt) !== null && (
                          <span className="home-queue__failed">
                            {t("dashboard.upcoming.failedOn", {
                              date: day.format(instantOf(r.lastAt)!),
                            })}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {state.status === "ready" && (
          <FitMore
            count={more}
            to={allTo}
            label={t("dashboard.more", {
              count: more,
              action: t("dashboard.upcoming.viewAll"),
            })}
            testId="home-upcoming-more"
          />
        )}
      </div>
    </section>
  );
}
