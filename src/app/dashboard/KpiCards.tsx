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
import type { HomeKpis, HomeProject } from "./model/homeData";

/** The four indicators of the Home (SPEC §8 «Inicio · indicadores»). They are
 *  links; «Tasa de éxito» has nowhere to go until runs exist (RED-W6), so it
 *  is a plain card marked disabled with the reason in its title. */
export function KpiCards({
  kpis,
  projects,
}: {
  kpis: HomeKpis;
  projects: HomeProject[];
}) {
  const { t } = useTranslation();
  // With a single project the cards go straight into it.
  const only = projects.length === 1 ? projects[0] : null;

  return (
    <div className="home-kpis">
      <Kpi
        to="/projects"
        icon={FolderOpen}
        label={t("dashboard.kpi.projects")}
        title={t("dashboard.kpi.projectsTitle")}
        value={kpis.projects}
        note={
          kpis.closingThisMonth
            ? t("dashboard.kpi.closing", { count: kpis.closingThisMonth })
            : t("dashboard.kpi.noneClosing")
        }
        testId="kpi-projects"
      />
      <Kpi
        to={only ? projectPath(only.id, "cases") : "/projects"}
        icon={ListTodo}
        label={t("dashboard.kpi.pending")}
        title={t("dashboard.kpi.pendingTitle")}
        value={kpis.pending}
        unit={t("dashboard.kpi.pendingOf", { total: kpis.total })}
        note={t("dashboard.kpi.noRuns")}
        testId="kpi-pending"
      />
      <Kpi
        icon={CircleCheck}
        label={t("dashboard.kpi.rate")}
        title={t("dashboard.kpi.rateTitle")}
        value="—"
        note={t("dashboard.kpi.rateEmpty")}
        testId="kpi-rate"
      />
      <Kpi
        to={only ? projectPath(only.id, "planner") : "/projects"}
        icon={Bug}
        label={t("dashboard.kpi.defects")}
        title={t("dashboard.kpi.defectsTitle")}
        value={kpis.openDefects}
        note={
          kpis.criticalDefects
            ? t("dashboard.kpi.critical", { count: kpis.criticalDefects })
            : t("dashboard.kpi.noCritical")
        }
        noteTone={kpis.criticalDefects ? "error" : undefined}
        testId="kpi-defects"
      />
    </div>
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
}: {
  /** Without a destination the card is shown disabled. */
  to?: string;
  icon: LucideIcon;
  label: string;
  title: string;
  value: ReactNode;
  unit?: string;
  note: string;
  noteTone?: "error";
  testId: string;
}) {
  const body = (
    <>
      <span className="home-kpi__head">
        <span className="home-kpi__icon" aria-hidden="true">
          <Icon size={13} />
        </span>
        <span className="home-kpi__label">{label}</span>
        {to && (
          <ArrowUpRight size={14} className="home-kpi__go" aria-hidden="true" />
        )}
      </span>
      <span className="home-kpi__value">
        <span className="home-kpi__num">{value}</span>
        {unit && <span className="home-kpi__unit">{unit}</span>}
      </span>
      <span className="home-kpi__note" data-tone={noteTone}>
        {note}
      </span>
    </>
  );
  return to ? (
    <Link to={to} className="home-kpi" title={title} data-testid={testId}>
      {body}
    </Link>
  ) : (
    <div
      className="home-kpi"
      aria-disabled="true"
      title={title}
      data-testid={testId}
    >
      {body}
    </div>
  );
}
