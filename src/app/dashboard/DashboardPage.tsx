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
 *  (Resumen, Ejecución, Pruebas). Real data where it exists today (projects,
 *  cases, plans, defects); run results arrive with RED-W6. */
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
  // Fixed for the life of the page, so the chart does not move under the user.
  const [today] = useState(() => new Date());

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
          ) : (
            <Trans
              i18nKey="dashboard.summary"
              values={{
                pending: t("dashboard.pendingTests", { count: kpis.pending }),
                projects: t("dashboard.openProjects", { count: kpis.projects }),
              }}
              components={{ b: <b /> }}
            />
          )}
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
      <KpiCards kpis={kpis} projects={list} />
    </>
  );

  const exec = <ExecutionByProject projects={list} />;
  const exit = (
    <ExitCriteriaCard
      projects={list}
      selected={exitProject}
      onSelect={setExitId}
      today={today}
    />
  );
  const daily = <DailyExecutionsChart period={period} today={today} />;
  const upcoming = (
    <UpcomingTests
      projects={list}
      filters={
        <Tabs
          label={t("dashboard.upcoming.filters")}
          variant="underline"
          idPrefix="home-up-"
          value="notRun"
          onChange={() => {}}
          className="home-upcoming__filters"
          items={[
            {
              id: "notRun",
              label: t("dashboard.upcoming.notRun"),
              badge: { count: kpis.pending, tone: "muted" },
            },
            {
              id: "blocked",
              label: t("dashboard.upcoming.blocked"),
              disabled: true,
              title: t("dashboard.upcoming.soonTitle"),
            },
            {
              id: "retest",
              label: t("dashboard.upcoming.retest"),
              disabled: true,
              title: t("dashboard.upcoming.soonTitle"),
            },
          ]}
        />
      }
    />
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
              { id: "summary", label: t("dashboard.tabs.summary") },
              { id: "execution", label: t("dashboard.tabs.execution") },
              {
                id: "tests",
                label: t("dashboard.tabs.tests"),
                badge: kpis.pending
                  ? {
                      count: kpis.pending,
                      tone: "navy",
                      title: t("dashboard.tabs.pendingBubble", {
                        count: kpis.pending,
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
              {exec}
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
        <div className="home-row__wide">{exec}</div>
        <div className="home-row__narrow">{exit}</div>
      </div>
      <div className="home-row">
        <div className="home-row__half">{daily}</div>
        <div className="home-row__half">{upcoming}</div>
      </div>
    </section>
  );
}
