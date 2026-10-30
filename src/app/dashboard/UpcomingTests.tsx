import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { projectPath } from "@modules/projects";
import { caseLink } from "@modules/test-cases";
import { PriorityFlag, type FlagTone } from "@shared/ui/PriorityFlag";
import { tabPanelProps } from "@shared/ui/tabPanel";
import { upcomingTests, type HomeProject } from "./model/homeData";

const PRIORITY_TONE: Record<string, FlagTone> = {
  critical: "error",
  high: "warning",
  medium: "info",
  low: "muted",
};

/** «Próximas pruebas» (SPEC §8): the pending cases by priority (real: no case
 *  has been run yet); a row opens the case in its project's Casos.
 *  «Bloqueadas» and «Re-test» need run results (RED-W6). */
export function UpcomingTests({
  projects,
  filters,
}: {
  projects: HomeProject[];
  /** The «No ejecutadas · Bloqueadas · Re-test» strip (shared `Tabs`). */
  filters?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const rows = upcomingTests(projects);
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
      {filters}
      {/* The panel of the «No ejecutadas» tab of `filters`. */}
      <div
        {...tabPanelProps("notRun", "home-up-")}
        className="home-upcoming__panel"
      >
        {rows.length === 0 ? (
          <p className="home-empty home-card__pad">
            {t("dashboard.upcoming.empty")}
          </p>
        ) : (
          <ul className="home-queue" data-testid="home-upcoming">
            {rows.map((r) => {
              const tone = PRIORITY_TONE[r.priority];
              return (
                <li key={r.id}>
                  <Link
                    to={caseLink(r.projectId, r.id)}
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
