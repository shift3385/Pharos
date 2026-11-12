import type { ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowUpRight,
  Bug,
  CircleCheck,
  FolderOpen,
  ListTodo,
  type LucideIcon,
} from "lucide-react";
import { projectPath } from "@modules/projects";
import { Skeleton } from "@shared/ui/Skeleton";
import { isoDay, shortDate, type HomeKpis, type HomeProject, type Period } from "./model/homeData";
import { previousRange, rateDelta } from "./model/compare";
import { DeltaChip } from "./DeltaChip";
import type { ExecutionKpis } from "./model/metrics";
import type { MetricsState } from "./model/loadHomeMetrics";

/** The four indicators of the Home, in their default order. */
export const KPI_IDS = [
  "kpiProjects",
  "kpiPending",
  "kpiRate",
  "kpiDefects",
] as const;
export type KpiId = (typeof KPI_IDS)[number];

export interface KpiProps {
  kpis: HomeKpis;
  exec: ExecutionKpis;
  status: MetricsState["status"];
  period: Period;
  projects: HomeProject[];
  /** The projects are not known yet, so neither is their count (not «0»). */
  projectsLoading?: boolean;
  /** On the board (UX-27) an indicator has 4 rows: the unlinked tests go in
   *  a short badge at its top instead of a line under it. */
  compact?: boolean;
  /** «Comparar con el periodo anterior» (RED-W4): the pass rate shows its
   *  difference with the previous period, on the number's row. */
  compare?: boolean;
  /** Today, for the previous period's dates (RED-W4). */
  today?: Date;
}

/** Indicators of the Home (SPEC §8 «Inicio · indicadores») in a row, all
 *  links: `ids` and their order (each one is also a gadget of the board,
 *  UX-27). */
export function KpiCards({
  ids = KPI_IDS,
  ...props
}: KpiProps & { ids?: readonly KpiId[] }) {
  return (
    <div className="home-kpis">
      {ids.map((id) => (
        <KpiCard key={id} id={id} {...props} />
      ))}
    </div>
  );
}

/** One indicator. Pending tests and open/critical defects are the state of
 *  play; «Tasa de éxito» is of the chosen period (RED-W6, GLOSARIO). */
export function KpiCard({
  id,
  kpis,
  exec,
  status,
  period,
  projects,
  projectsLoading = false,
  compact = false,
  compare = false,
  today = new Date(),
}: KpiProps & { id: KpiId }) {
  const { t, i18n } = useTranslation();
  // With a single project the cards go straight into it.
  const only = projects.length === 1 ? projects[0] : null;
  const ready = status === "ready";
  // Unknown until the metrics load: a placeholder while loading, «—» after an
  // error. The note still says it to assistive technology, inside the link.
  const valueShape = <Skeleton width={48} height={24} />;
  const noteShape = (
    <>
      <span className="sr-only">{t("dashboard.metrics.loading")}</span>
      <Skeleton width="70%" className="home-kpi__note-sk" />
    </>
  );
  const unknown = status === "loading" ? valueShape : "—";
  const unknownNote =
    status === "loading" ? noteShape : t("dashboard.kpi.rateError");
  const periodText = t(`dashboard.period.lower.${period}`);
  const rate = ready ? exec.rate : null;
  const hasRate = rate?.passRate != null;
  const rateValue = hasRate
    ? new Intl.NumberFormat(i18n.resolvedLanguage, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(rate.passRate! * 100)
    : unknown;

  if (id === "kpiProjects")
    return (
      <Kpi
        to="/projects"
        icon={FolderOpen}
        label={t("dashboard.kpi.projects")}
        title={t("dashboard.kpi.projectsTitle")}
        value={projectsLoading ? valueShape : kpis.projects}
        note={
          projectsLoading
            ? noteShape
            : kpis.closingThisMonth
              ? t("dashboard.kpi.closing", { count: kpis.closingThisMonth })
              : t("dashboard.kpi.noneClosing")
        }
        testId="kpi-projects"
      />
    );
  if (id === "kpiPending")
    return (
      <Kpi
        to={only ? projectPath(only.id, "cases") : "/projects"}
        icon={ListTodo}
        label={t("dashboard.kpi.pending")}
        title={t("dashboard.kpi.pendingTitle")}
        value={ready ? exec.pending : unknown}
        unit={
          ready
            ? t("dashboard.kpi.pendingOf", { total: exec.total })
            : undefined
        }
        note={
          !ready
            ? unknownNote
            : exec.blocked
              ? t("dashboard.kpi.blocked", { count: exec.blocked })
              : t("dashboard.kpi.noneBlocked")
        }
        noteTone={ready && exec.blocked ? "warning" : undefined}
        testId="kpi-pending"
      />
    );
  // RED-W4: the pass rate against the previous period of the same length.
  const previous = ready ? exec.previousRate : null;
  const rateCompare =
    compare && ready && hasRate ? (
      <DeltaChip
        delta={rateDelta(rate?.passRate, previous?.passRate)}
        kind="rate"
        compact={compact}
        said={previousRateText(previous?.passRate ?? null)}
        testId="kpi-rate-delta"
      />
    ) : undefined;
  function previousRateText(prev: number | null) {
    const { from, to } = previousRange(period, today);
    const dates = t("dashboard.compare.range", {
      from: shortDate(isoDay(from), i18n.resolvedLanguage),
      to: shortDate(isoDay(to), i18n.resolvedLanguage),
    });
    if (prev === null) return t("dashboard.compare.rateNone", { dates });
    const pct = new Intl.NumberFormat(i18n.resolvedLanguage, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(prev * 100);
    const d = rateDelta(rate?.passRate, prev)!;
    return t(`dashboard.compare.rate_${d.direction}`, {
      points: new Intl.NumberFormat(i18n.resolvedLanguage, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(Math.abs(d.value)),
      previous: pct,
      dates,
    });
  }

  if (id === "kpiRate")
    return (
      <div className="home-kpi-stack">
        <Kpi
          to={only ? projectPath(only.id, "runs") : "/projects"}
          icon={CircleCheck}
          label={t("dashboard.kpi.rate")}
          title={t("dashboard.kpi.rateTitle", { period: periodText })}
          value={rateValue}
          unit={hasRate ? "%" : undefined}
          delta={rateCompare}
          note={
            !ready
              ? unknownNote
              : rate?.executed
                ? t("dashboard.kpi.rateOf", {
                    count: rate.executed,
                    period: periodText,
                  })
                : t("dashboard.kpi.rateEmpty", { period: periodText })
          }
          testId="kpi-rate"
        />
        {/* NC-029: the rate counts cases; unlinked tests go apart, under the
          card (a link of its own: the card is already one). */}
        {ready && (rate?.unlinked ?? 0) > 0 && (
          <Link
            to={only ? projectPath(only.id, "runs") : "/projects"}
            className={`home-kpi__extra${compact ? " home-kpi__extra--badge" : ""}`}
            title={t("dashboard.kpi.unlinkedTitle")}
            aria-label={compact ? t("dashboard.kpi.unlinked", { count: rate!.unlinked }) : undefined}
            data-testid="kpi-rate-unlinked"
          >
            {compact
              ? t("dashboard.kpi.unlinkedShort", { count: rate!.unlinked })
              : t("dashboard.kpi.unlinked", { count: rate!.unlinked })}
          </Link>
        )}
      </div>
    );
  return (
    <Kpi
      to={only ? projectPath(only.id, "defects") : "/projects"}
      icon={Bug}
      label={t("dashboard.kpi.defects")}
      title={t("dashboard.kpi.defectsTitle")}
      value={ready ? exec.openDefects : unknown}
      note={
        !ready
          ? unknownNote
          : exec.criticalDefects
            ? t("dashboard.kpi.critical", { count: exec.criticalDefects })
            : t("dashboard.kpi.noCritical")
      }
      noteTone={ready && exec.criticalDefects ? "error" : undefined}
      testId="kpi-defects"
    />
  );
}

function Kpi({
  to,
  icon: Icon,
  label,
  title,
  value,
  unit,
  note,
  noteTone,
  testId,
  delta,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  title: string;
  value: ReactNode;
  unit?: string;
  /** The difference with the previous period (RED-W4), after the value. */
  delta?: ReactNode;
  note: ReactNode;
  noteTone?: "error" | "warning";
  testId: string;
}) {
  return (
    <Link to={to} className="home-kpi" title={title} data-testid={testId}>
      <span className="home-kpi__head">
        <span className="home-kpi__icon" aria-hidden="true">
          <Icon size={13} />
        </span>
        <span className="home-kpi__label">{label}</span>
        <ArrowUpRight size={14} className="home-kpi__go" aria-hidden="true" />
      </span>
      <span className="home-kpi__value">
        <span className="home-kpi__num">{value}</span>
        {unit && <span className="home-kpi__unit">{unit}</span>}
        {delta}
      </span>
      <span className="home-kpi__note" data-tone={noteTone}>
        {note}
      </span>
    </Link>
  );
}
