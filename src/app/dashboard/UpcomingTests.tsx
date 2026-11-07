import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { projectPath } from "@modules/projects";
import { caseLink } from "@modules/test-cases";
import { PriorityFlag, type FlagTone } from "@shared/ui/PriorityFlag";
import { Skeleton } from "@shared/ui/Skeleton";
import { skeletonWidth } from "@shared/ui/skeletonWidth";
import { Tabs } from "@shared/ui/Tabs";
import { tabPanelProps } from "@shared/ui/tabPanel";
import type { HomeProject } from "./model/homeData";
import { queueCounts, queueRows, type QueueTab } from "./model/metrics";
import type { MetricsState } from "./model/loadHomeMetrics";
import { MetricsNotice } from "./MetricsNotice";

const PRIORITY_TONE: Record<string, FlagTone> = {
  critical: "error",
  high: "warning",
  medium: "info",
  low: "muted",
};

const TABS: QueueTab[] = ["notRun", "blocked", "retest"];

/** «Próximas pruebas» (SPEC §8, RED-W6): No ejecutadas (no final result
 *  yet), Bloqueadas (latest final blocked) and Re-test (latest final failed
 *  with a linked defect fixed or in re-test), as the shared derivation
 *  classifies them; each tab by priority, then project recency, then case
 *  id. A row opens the case in its project's Casos. */
export function UpcomingTests({
  projects,
  state,
  onRetry,
}: {
  projects: HomeProject[];
  state: MetricsState;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<QueueTab>("notRun");
  const counts = queueCounts(state.data);
  const rows = state.data ? queueRows(projects, state.data, tab) : [];
  const only = projects.length === 1 ? projects[0] : null;

  return (
    <section
      className="home-card home-card--flush home-upcoming"
      aria-labelledby="home-upcoming-title"
    >
      <div className="home-card__head home-card__head--nowrap home-card__pad">
        <div className="home-card__titles">
          <h2 id="home-upcoming-title" className="home-card__title">
            {t("dashboard.upcoming.title")}
          </h2>
          <p className="home-card__sub">{t("dashboard.upcoming.subtitle")}</p>
        </div>
        <Link
          to={only ? projectPath(only.id, "cases") : "/projects"}
          className="home-link home-link--strong"
        >
          {t("dashboard.upcoming.viewAll")}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <Tabs
        label={t("dashboard.upcoming.filters")}
        variant="underline"
        idPrefix="home-up-"
        value={tab}
        onChange={(id: string) => setTab(id as QueueTab)}
        className="home-upcoming__filters"
        items={TABS.map((id) => ({
          id,
          label: t(`dashboard.upcoming.${id}`),
          badge: counts
            ? {
                count: counts[id],
                tone: id === "notRun" ? "muted" : "danger",
              }
            : undefined,
        }))}
      />
      <div
        {...tabPanelProps(tab, "home-up-")}
        className="home-upcoming__panel"
      >
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
            className="home-queue"
            data-testid="home-upcoming"
            data-tab={tab}
          >
            {rows.map((r) => {
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
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
