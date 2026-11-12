import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Check, ChevronDown, Eye, Plus, RotateCcw, Settings } from "lucide-react";
import { useAuth } from "@modules/auth";
import { logClientError } from "@shared/diagnostics";
import { LoadError } from "@shared/ui/LoadError";
import { Menu, MenuItem, MenuLabel } from "@shared/ui/Menu";
import { LoadingStatus } from "@shared/ui/Skeleton";
import { Tabs } from "@shared/ui/Tabs";
import { tabPanelProps } from "@shared/ui/tabPanel";
import { useBreakpoint } from "@shared/ui/useBreakpoint";
import { discardOptions, useConfirm } from "@shared/ui/useConfirm";
import { usePopover } from "@shared/ui/usePopover";
import { useUnsavedChangesGuard } from "@shared/ui/useUnsavedChangesGuard";
import { KPI_IDS, KpiCard, KpiCards, type KpiId } from "./KpiCards";
import { PeriodSelector } from "./PeriodSelector";
import { ExecutionByProject } from "./ExecutionByProject";
import { ExitCriteriaCard } from "./ExitCriteriaCard";
import { DailyExecutionsChart } from "./DailyExecutionsChart";
import { TrendCard } from "./TrendCard";
import { UpcomingTests } from "./UpcomingTests";
import { HomeBoard, HomeStack, type GadgetView } from "./HomeBoard";
import { loadHome } from "./model/loadHome";
import { useHomeMetrics, type MetricsState } from "./model/loadHomeMetrics";
import { byProject, executionKpis, exitStatus } from "./model/metrics";
import {
  BOARD_ROWS,
  boardBottom,
  defaultBoard,
  hideGadget,
  placeText,
  readingOrder,
  sameBoard,
  showGadget,
  type Board,
  type GadgetId,
} from "./model/board";
import { useHomeBoard } from "./model/useHomeBoard";
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

const isKpi = (id: GadgetId): id is KpiId => (KPI_IDS as readonly string[]).includes(id);

/** Inicio (SPEC §8, `Dashboard.dc.html`): greeting and period, then the
 *  gadgets: the four indicators, «Ejecución por proyecto», «Criterios de
 *  salida», «Ejecuciones diarias» and «Próximas pruebas». On the desktop they
 *  sit on the account's board (UX-27, `HomeBoard`), which «Personalizar
 *  Inicio» rearranges; on tablet they stack in the board's order; on mobile
 *  they go into three tabs (Resumen, Ejecución, Pruebas). Projects, cases and
 *  plans come from `loadHome`; every execution number from one metrics read
 *  (RED-W6), which loads, fails and retries on its own without hiding the
 *  rest. */
export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const view = useBreakpoint();
  const mobile = view === "mobile";
  const ownerId = user?.id ?? "";
  const [projects, setProjects] = useState<HomeProject[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [period, setPeriod] = useState<Period>(storedPeriod);
  const [exitId, setExitId] = useState<string | null>(null);
  const [tab, setTab] = useState<MobileTab>("summary");
  // The local day of the metrics: it moves at midnight with them.
  const { state: read, retry, today } = useHomeMetrics(ownerId);
  // Cached numbers of projects not known yet would add up to zeros: they wait.
  const metrics: MetricsState =
    projects === null && read.status === "ready" ? { status: "loading", data: null } : read;
  const ready = metrics.status === "ready";

  // The board (UX-27): the saved one, and the draft while customizing.
  const { board: saved, waiting, save } = useHomeBoard(ownerId);
  const [draft, setDraft] = useState<Board | null>(null);
  const editing = draft !== null && view === "desktop";
  const board = editing ? draft : saved;
  const changed = editing && !sameBoard(draft, saved);
  const [said, setSaid] = useState("");
  const { confirm, dialog: confirmDialog } = useConfirm();
  const guard = useUnsavedChangesGuard(changed);
  const headerRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);
  const hiddenMenu = usePopover("menu");

  useEffect(() => {
    let alive = true;
    const load = () =>
      void loadHome(ownerId)
        .then((rows) => {
          if (!alive) return;
          setProjects(rows);
          setLoadFailed(false);
        })
        .catch((e: unknown) => {
          if (!alive) return;
          logClientError(e, "home projects");
          setLoadFailed(true);
        });
    load();
    // Reload when a sync pulls remote changes.
    window.addEventListener("pharos:synced", load);
    return () => {
      alive = false;
      window.removeEventListener("pharos:synced", load);
    };
  }, [ownerId, loadAttempt]);

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

  // ---- Customizing the board ----

  const names: Record<GadgetId, string> = {
    kpiProjects: t("dashboard.kpi.projects"),
    kpiPending: t("dashboard.kpi.pending"),
    kpiRate: t("dashboard.kpi.rate"),
    kpiDefects: t("dashboard.kpi.defects"),
    byProject: t("dashboard.exec.title"),
    exitCriteria: t("dashboard.exit.title"),
    upcoming: t("dashboard.upcoming.title"),
    daily: t("dashboard.daily.title"),
    trend: t("dashboard.trend.title"),
  };

  /** Tells a screen reader what changed (the live region below). A repeated
   *  message gets a trailing space so it is read again. */
  const say = useCallback((text: string) => setSaid((s) => (s === text ? `${text} ` : text)), []);

  const onBoardChange = (next: Board, id: GadgetId) => {
    setDraft(next);
    const item = next.items.find((i) => i.id === id);
    if (item) say(placeText(names[id], item, t));
  };

  const startEditing = () => {
    setDraft(saved);
    say(t("dashboard.board.help"));
  };

  const finish = (keep: boolean) => {
    if (keep && draft && changed) {
      save(draft);
      say(t("dashboard.board.saved"));
    } else if (!keep && changed) say(t("dashboard.board.discarded"));
    setDraft(null);
    hiddenMenu.close();
    // Back to where customizing started.
    requestAnimationFrame(() => gearRef.current?.focus());
  };

  const cancel = async () => {
    if (changed && !(await confirm(discardOptions(t)))) return;
    finish(false);
  };

  const reset = async () => {
    const ok = await confirm({
      title: t("dashboard.board.resetTitle"),
      message: t("dashboard.board.resetMessage"),
      confirmLabel: t("dashboard.board.reset"),
    });
    if (!ok) return;
    setDraft(defaultBoard());
    say(t("dashboard.board.resetDone"));
  };

  const hide = (id: GadgetId) => {
    if (!draft) return;
    setDraft(hideGadget(draft, id));
    say(t("dashboard.board.hidden", { name: names[id] }));
    // The gadget and its button are gone: keep the focus on the board.
    requestAnimationFrame(() => headerRef.current?.querySelector<HTMLElement>("[data-board-hidden]")?.focus());
  };

  const show = (id: GadgetId) => {
    if (!draft) return;
    const next = showGadget(draft, id);
    if (!next) return say(t("dashboard.board.noRoom", { name: names[id] }));
    setDraft(next);
    const item = next.items.find((i) => i.id === id)!;
    say(placeText(names[id], item, t));
  };

  // Esc leaves without saving, asking first if something changed. Menus and
  // dialogs handle their own Esc first.
  const onEditingKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if ((e.target as HTMLElement).closest("[role=dialog], [role=alertdialog], [role=menu]")) return;
    e.preventDefault();
    // The confirmation mounts during this very event: its own Esc listener
    // on `document` must not get this key too and close it at once.
    e.stopPropagation();
    void cancel();
  };

  // What the numbers add up (UX-28): no longer a line of its own, it is the
  // period button's tooltip and description.
  const sumNote =
    kpis.projects > 1
      ? t("dashboard.sumNote", {
          projects: t("dashboard.openProjects", { count: kpis.projects }),
          period: t(`dashboard.period.lower.${period}`),
        }).replace(/<\/?b>/g, "")
      : undefined;

  // One line (UX-28): the greeting and the date on the left, the actions on
  // the right. While customizing, the hint takes the date's place.
  const header = (
    <div className="home-header" ref={headerRef}>
      <div className="home-header__text">
        <h1 className="t-page-title home-header__title">
          {user?.firstName
            ? t("dashboard.greeting", { name: user.firstName })
            : t("dashboard.title")}
        </h1>
        {editing ? (
          <span className="home-header__hint" title={t("dashboard.board.help")}>
            {t("dashboard.board.editingHint")}
            {boardBottom(board.items) > BOARD_ROWS && ` · ${t("dashboard.board.overflow")}`}
          </span>
        ) : (
          <span className="home-header__date">
            {dateLine}
            {projects !== null && list.length === 0 && ` · ${t("dashboard.summaryEmpty")}`}
          </span>
        )}
        {editing && (
          <span id="home-board-help" className="sr-only">
            {t("dashboard.board.help")}
          </span>
        )}
        {/* The one announcement of the Home: its cards only draw placeholders. */}
        <LoadingStatus
          active={projects === null || metrics.status === "loading"}
          label={t("dashboard.loading")}
        />
        {/* How fresh the execution numbers are (RED-W6 review): a refresh in
            flight, or the time of the payload shown after a failed one. */}
        <span className="home-header__fresh" role="status" data-testid="home-fresh">
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
        </span>
      </div>
      <div className="home-header__actions">
        {editing ? (
          <>
            <button
              type="button"
              className="home-btn"
              {...hiddenMenu.triggerProps}
              aria-disabled={draft.hidden.length === 0 || undefined}
              onClick={() => {
                if (draft.hidden.length > 0) hiddenMenu.triggerProps.onClick();
              }}
              data-board-hidden
              data-testid="home-hidden-gadgets"
            >
              <Eye size={16} className="home-btn__icon" aria-hidden="true" />
              <span className="home-btn__text">
                {t("dashboard.board.hiddenCount", { count: draft.hidden.length })}
              </span>
              <ChevronDown size={14} className="home-btn__chev" aria-hidden="true" />
            </button>
            <Menu
              open={hiddenMenu.open}
              onClose={hiddenMenu.close}
              anchorRef={hiddenMenu.anchorRef}
              id={hiddenMenu.id}
              label={t("dashboard.board.hiddenMenu")}
              placement="bottom-end"
            >
              <MenuLabel>{t("dashboard.board.hiddenMenu")}</MenuLabel>
              {draft.hidden.map((h) => (
                <MenuItem
                  key={h.id}
                  icon={Eye}
                  onSelect={() => show(h.id)}
                  testId={`show-${h.id}`}
                >
                  {t("dashboard.board.show", { name: names[h.id] })}
                </MenuItem>
              ))}
            </Menu>
            <button
              type="button"
              className="home-btn"
              onClick={() => void reset()}
              data-testid="home-board-reset"
            >
              <RotateCcw size={16} className="home-btn__icon" aria-hidden="true" />
              {t("dashboard.board.reset")}
            </button>
            <button
              type="button"
              className="home-btn home-btn--primary"
              onClick={() => finish(true)}
              data-testid="home-board-done"
            >
              <Check size={16} aria-hidden="true" />
              {t("dashboard.board.done")}
            </button>
          </>
        ) : (
          <>
            <PeriodSelector value={period} onChange={choosePeriod} description={sumNote} />
            <button
              type="button"
              className="home-btn home-btn--primary"
              onClick={() => navigate("/projects?new=1")}
            >
              <Plus size={16} aria-hidden="true" />
              {t("dashboard.newProject")}
            </button>
          </>
        )}
        {view === "desktop" && (
          <button
            ref={gearRef}
            type="button"
            className="home-gear"
            aria-label={t("dashboard.board.customize")}
            title={t("dashboard.board.customize")}
            aria-pressed={editing}
            onClick={() => (editing ? finish(true) : startEditing())}
            data-testid="home-customize"
          >
            <Settings size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );

  const loadError = loadFailed && (
    <LoadError
      message={t("dashboard.loadFailed")}
      onRetry={() => {
        setLoadFailed(false);
        setLoadAttempt((n) => n + 1);
      }}
    />
  );

  // Never loaded: the widgets would read as an account without projects.
  if (projects === null && loadFailed)
    return (
      <section className="home screen-root">
        {header}
        {loadError}
      </section>
    );

  const kpiProps = {
    kpis,
    exec,
    status: metrics.status,
    period,
    projects: list,
    projectsLoading: projects === null,
  };

  const byProjectCard = (
    <ExecutionByProject
      projects={list}
      state={metrics}
      onRetry={retry}
      loading={projects === null}
    />
  );
  const exit = (
    <ExitCriteriaCard
      projects={list}
      selected={exitProject}
      onSelect={setExitId}
      today={today}
      state={metrics}
      onRetry={retry}
      loading={projects === null}
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
  const trend = <TrendCard projects={list} state={metrics} onRetry={retry} />;

  const content: Record<GadgetId, GadgetView["content"]> = {
    kpiProjects: <KpiCard id="kpiProjects" {...kpiProps} compact={view === "desktop"} />,
    kpiPending: <KpiCard id="kpiPending" {...kpiProps} compact={view === "desktop"} />,
    kpiRate: <KpiCard id="kpiRate" {...kpiProps} compact={view === "desktop"} />,
    kpiDefects: <KpiCard id="kpiDefects" {...kpiProps} compact={view === "desktop"} />,
    byProject: byProjectCard,
    exitCriteria: exit,
    upcoming,
    daily,
    trend,
  };
  const gadgets = Object.fromEntries(
    (Object.keys(content) as GadgetId[]).map((id) => [id, { id, name: names[id], content: content[id] }]),
  ) as Record<GadgetId, GadgetView>;
  // The visible gadgets in reading order (mobile: what each tab shows).
  const visible = new Set(saved.items.map((i) => i.id));
  const visibleKpis = readingOrder(saved.items)
    .map((i) => i.id)
    .filter(isKpi);

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
              {loadError}
              {visibleKpis.length > 0 && <KpiCards ids={visibleKpis} {...kpiProps} />}
              {visible.has("exitCriteria") && exit}
            </>
          )}
          {tab === "execution" && (
            <>
              {visible.has("byProject") && byProjectCard}
              {/* The chart is the widget the period changes, so the selector
                  is here too (user's decision); same state as in Resumen. */}
              <div className="home-period-row">
                <PeriodSelector value={period} onChange={choosePeriod} description={sumNote} />
              </div>
              {visible.has("daily") && daily}
              {visible.has("trend") && trend}
            </>
          )}
          {tab === "tests" && visible.has("upcoming") && upcoming}
        </div>
      </section>
    );
  }

  return (
    <section
      className="home screen-root"
      data-editing={editing || undefined}
      onKeyDown={editing ? onEditingKey : undefined}
    >
      {header}
      {loadError}
      {waiting.length > 0 && !editing && (
        // A gadget new to a customized board waits hidden rather than make
        // Inicio scroll (DOC-06, D6): said once, until the board is saved.
        <p className="home-new-gadget" role="status" data-testid="home-new-gadget">
          {t("dashboard.board.newGadget", { names: waiting.map((id) => names[id]).join(", ") })}
          <button type="button" className="home-link" onClick={startEditing}>
            {t("dashboard.board.makeRoom")}
          </button>
          <button type="button" className="home-link" onClick={() => save(saved)}>
            {t("dashboard.board.dismissNew")}
          </button>
        </p>
      )}
      {view === "desktop" ? (
        <HomeBoard
          board={board}
          gadgets={gadgets}
          editing={editing}
          watchRef={headerRef}
          onChange={onBoardChange}
          onRefuse={(id) => say(t("dashboard.board.refused", { name: names[id] }))}
          onHide={hide}
        />
      ) : (
        <HomeStack board={saved} gadgets={gadgets} />
      )}
      <p className="sr-only" aria-live="polite" data-testid="home-board-live">
        {said}
      </p>
      {confirmDialog}
      {guard.dialog}
    </section>
  );
}
