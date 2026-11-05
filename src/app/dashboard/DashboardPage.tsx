import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Layers, Plus } from "lucide-react";
import { useAuth } from "@modules/auth";
import { Tabs } from "@shared/ui/Tabs";
import { tabPanelProps } from "@shared/ui/tabPanel";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { KpiCards } from "./KpiCards";
import { PeriodSelector } from "./PeriodSelector";
import { ExecutionByProject } from "./ExecutionByProject";
import { ExitCriteriaCard } from "./ExitCriteriaCard";
import { DailyExecutionsChart } from "./DailyExecutionsChart";
import { UpcomingTests } from "./UpcomingTests";
import { loadHome } from "./model/loadHome";
import { useHomeMetrics } from "./model/loadHomeMetrics";
import { byProject, executionKpis, exitStatus } from "./model/metrics";
import {
  DEFAULT_PERIOD,
  defaultExitProject,
  homeKpis,
  isPeriod,
  type HomeProject,
  type Period,
} from "./model/homeData";
import "./DashboardPage.css";

const PERIOD_KEY = "pharos.home.period";

type MobileTab = "summary" | "execution" | "tests";

function storedPeriod(): Period {
  try {
    const v = localStorage.getItem(PERIOD_KEY);
    return isPeriod(v) ? v : DEFAULT_PERIOD;
  } catch {
    return DEFAULT_PERIOD;
  }
}

/** Inicio (SPEC §8, `Dashboard.dc.html`): greeting and period, the four
 *  indicators, «Ejecución por proyecto», «Criterios de salida», «Ejecuciones
 *  diarias» and «Próximas pruebas». On mobile the sections go into three tabs
 *  (Resumen, Ejecución, Pruebas). Projects, cases and plans come from
 *  `loadHome`; every execution number from one metrics read (RED-W6), which
 *  loads, fails and retries on its own without hiding the rest. */
export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const mobile = useBreakpoint() === "mobile";
  const ownerId = user?.id ?? "";
  const [projects, setProjects] = useState<HomeProject[] | null>(null);
  const [period, setPeriod] = useState<Period>(storedPeriod);
  const [exitId, setExitId] = useState<string | null>(null);
  const [tab, setTab] = useState<MobileTab>("summary");
  // The local day of the metrics: it moves at midnight with them.
  const { state: metrics, retry, today } = useHomeMetrics(ownerId);
  const ready = metrics.status === "ready";

  useEffect(() => {
    let alive = true;
    const load = () =>
      void loadHome(ownerId).then((rows) => {
        if (alive) setProjects(rows);
      });
    load();
    // Reload when a sync pulls remote changes.
    window.addEventListener("pharos:synced", load);
    return () => {
      alive = false;
      window.removeEventListener("pharos:synced", load);
    };
  }, [ownerId]);

  const choosePeriod = (p: Period) => {
    setPeriod(p);
    try {
      localStorage.setItem(PERIOD_KEY, p);
    } catch {
      // Per-device convenience only.
    }
  };

  const list = useMemo(() => projects ?? [], [projects]);
  const kpis = useMemo(() => homeKpis(list, today), [list, today]);
  const exec = useMemo(
    () => executionKpis(list, metrics.data, period),
    [list, metrics.data, period],
  );
  // Mobile «Resumen» bubble (SPEC «burbujas»): red = problems, i.e. open
  // critical defects plus projects whose exit criteria are at risk.
  const atRisk = useMemo(() => {
    const pm = byProject(metrics.data);
    return list.filter((p) => exitStatus(pm.get(p.id)) === "risk").length;
  }, [list, metrics.data]);
  // Unknown until the metrics load: no bubble rather than a guess.
  const problems = ready ? exec.criticalDefects + atRisk : 0;
  const pendingBubble = ready ? exec.pending : 0;
  const exitProject =
    list.find((p) => p.id === exitId) ?? defaultExitProject(list, today);

  const dateLine = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(today)
    .replace(/^./, (c) => c.toUpperCase());

  const header = (
    <div className="home-header">
      <div className="home-header__text">
        <span className="home-header__date">{dateLine}</span>
        <h1 className="t-page-title home-header__title">
          {user?.firstName
            ? t("dashboard.greeting", { name: user.firstName })
            : t("dashboard.title")}
        </h1>
        <p className="home-header__summary">
          {projects === null ? (
            t("dashboard.loading")
          ) : list.length === 0 ? (
            t("dashboard.summaryEmpty")
          ) : metrics.status !== "ready" ? (
            // Pending tests are unknown until the metrics load.
            <Trans
              i18nKey="dashboard.summaryProjects"
              values={{
                projects: t("dashboard.openProjects", { count: kpis.projects }),
              }}
              components={{ b: <b /> }}
            />
          ) : (
            <Trans
              i18nKey="dashboard.summary"
              values={{
                pending: t("dashboard.pendingTests", { count: exec.pending }),
                projects: t("dashboard.openProjects", { count: kpis.projects }),
              }}
              components={{ b: <b /> }}
            />
          )}
        </p>
        {/* How fresh the execution numbers are (RED-W6 review): a refresh in
            flight, or the time of the payload shown after a failed one. */}
        <p className="home-header__fresh" role="status" data-testid="home-fresh">
          {metrics.status === "ready" && metrics.stale
            ? t("dashboard.metrics.staleAt", {
                time: new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(metrics.at),
              })
            : metrics.status === "ready" && metrics.refreshing
              ? t("dashboard.metrics.refreshing")
              : ""}
        </p>
      </div>
      <div className="home-header__actions">
        <PeriodSelector value={period} onChange={choosePeriod} />
        <button
          type="button"
          className="home-btn home-btn--primary"
          onClick={() => navigate("/projects?new=1")}
        >
          <Plus size={16} aria-hidden="true" />
          {t("dashboard.newProject")}
        </button>
      </div>
    </div>
  );

  const indicators = (
    <>
      {kpis.projects > 1 && (
        <p className="home-sum-note">
          <Layers size={14} aria-hidden="true" />
          <span>
            <Trans
              i18nKey="dashboard.sumNote"
              values={{
                projects: t("dashboard.openProjects", { count: kpis.projects }),
                period: t(`dashboard.period.lower.${period}`),
              }}
              components={{ b: <b /> }}
            />
          </span>
        </p>
      )}
      <KpiCards
        kpis={kpis}
        exec={exec}
        status={metrics.status}
        period={period}
        projects={list}
      />
    </>
  );

  const byProjectCard = (
    <ExecutionByProject projects={list} state={metrics} onRetry={retry} />
  );
  const exit = (
    <ExitCriteriaCard
      projects={list}
      selected={exitProject}
      onSelect={setExitId}
      today={today}
      state={metrics}
      onRetry={retry}
    />
  );
  const daily = (
    <DailyExecutionsChart
      period={period}
      today={today}
      state={metrics}
      onRetry={retry}
    />
  );
  const upcoming = (
    <UpcomingTests projects={list} state={metrics} onRetry={retry} />
  );

  if (mobile) {
    return (
      <section className="home screen-root">
        {/* The greeting is the page title in «Resumen»; the other tabs keep one. */}
        {tab !== "summary" && (
          <h1 className="sr-only">{t("dashboard.title")}</h1>
        )}
        <div className="home-tabs-bar">
          <Tabs
            label={t("dashboard.tabs.label")}
            variant="segmented"
            idPrefix="home-"
            value={tab}
            onChange={(id: string) => setTab(id as MobileTab)}
            items={[
              {
                id: "summary",
                label: t("dashboard.tabs.summary"),
                badge: problems
                  ? {
                      count: problems,
                      tone: "danger",
                      title: t("dashboard.tabs.problemsBubble", {
                        count: problems,
                      }),
                    }
                  : undefined,
              },
              { id: "execution", label: t("dashboard.tabs.execution") },
              {
                id: "tests",
                label: t("dashboard.tabs.tests"),
                badge: pendingBubble
                  ? {
                      count: pendingBubble,
                      tone: "navy",
                      title: t("dashboard.tabs.pendingBubble", {
                        count: pendingBubble,
                      }),
                    }
                  : undefined,
              },
            ]}
          />
        </div>
        <div className="home__panel" {...tabPanelProps(tab, "home-")}>
          {tab === "summary" && (
            <>
              {header}
              {indicators}
              {exit}
            </>
          )}
          {tab === "execution" && (
            <>
              {byProjectCard}
              {/* The chart is the widget the period changes, so the selector
                  is here too (user's decision); same state as in Resumen. */}
              <div className="home-period-row">
                <PeriodSelector value={period} onChange={choosePeriod} />
              </div>
              {daily}
            </>
          )}
          {tab === "tests" && upcoming}
        </div>
      </section>
    );
  }

  return (
    <section className="home screen-root">
      {header}
      {indicators}
      <div className="home-row">
        <div className="home-row__wide">{byProjectCard}</div>
        <div className="home-row__narrow">{exit}</div>
      </div>
      <div className="home-row">
        <div className="home-row__half">{daily}</div>
        <div className="home-row__half">{upcoming}</div>
      </div>
    </section>
  );
}
