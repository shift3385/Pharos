import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { projectPath } from "@modules/projects";
import type { HomeProject } from "./model/homeData";

/** Legend of the run states (ACTUALIZACION §3: wraps with `gap 6px 14px`,
 *  items never break, swatches never shrink). */
export function RunLegend({
  items,
}: {
  items: { tone: string; label: string; line?: boolean }[];
}) {
  return (
    <ul className="home-legend">
      {items.map((i) => (
        <li key={i.label}>
          <span
            className={`home-legend__swatch${i.line ? " home-legend__swatch--line" : ""}`}
            data-tone={i.tone}
            aria-hidden="true"
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** «Ejecución por proyecto» (SPEC §8). The layout of the run states is final;
 *  the data comes with RED-W6. Until then every case is honestly «No
 *  ejecutado»: 0 of N run, the whole bar grey. */
export function ExecutionByProject({ projects }: { projects: HomeProject[] }) {
  const { t, i18n } = useTranslation();
  const percent = new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: "percent",
  }).format(0);
  return (
    <section className="home-card home-exec" aria-labelledby="home-exec-title">
      <div className="home-card__head">
        <div className="home-card__titles">
          <h2 id="home-exec-title" className="home-card__title">
            {t("dashboard.exec.title")}
          </h2>
          <p className="home-card__sub">{t("dashboard.exec.subtitle")}</p>
        </div>
        <RunLegend
          items={[
            { tone: "pass", label: t("dashboard.exec.pass") },
            { tone: "fail", label: t("dashboard.exec.fail") },
            { tone: "blocked", label: t("dashboard.exec.blocked") },
            { tone: "none", label: t("dashboard.exec.notRun") },
          ]}
        />
      </div>

      {projects.length === 0 ? (
        <p className="home-empty">{t("dashboard.exec.empty")}</p>
      ) : (
        <>
          <ul className="home-exec__list" data-testid="home-exec">
            {projects.map((p) => (
              <li key={p.id} className="home-exec__row">
                <span className="home-exec__line">
                  <span className="home-exec__key t-id">{p.key}</span>
                  <Link
                    className="home-exec__name u-truncate"
                    to={projectPath(p.id)}
                    title={p.name}
                  >
                    {p.name}
                  </Link>
                  {p.cases.length ? (
                    <>
                      <span className="home-exec__count">
                        0 / {p.cases.length}
                      </span>
                      <span className="home-exec__pct">{percent}</span>
                    </>
                  ) : (
                    // No cases: nothing to run, no ratio to show.
                    <span
                      className="home-exec__pct"
                      title={t("dashboard.exec.noCases")}
                    >
                      —
                    </span>
                  )}
                </span>
                <span
                  className="home-exec__bar"
                  role="img"
                  aria-label={t("dashboard.exec.rowLabel", {
                    name: p.name,
                    executed: 0,
                    total: p.cases.length,
                  })}
                />
              </li>
            ))}
          </ul>
          <p className="home-note">{t("dashboard.exec.noRuns")}</p>
        </>
      )}
    </section>
  );
}
