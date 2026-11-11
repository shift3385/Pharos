import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { projectPath } from "@modules/projects";
import { Skeleton } from "@shared/ui/Skeleton";
import { skeletonWidth } from "@shared/ui/skeletonWidth";
import type { HomeProject } from "./model/homeData";
import { byProject, execRow, type HomeMetrics } from "./model/metrics";
import type { MetricsState } from "./model/loadHomeMetrics";
import { MetricsNotice } from "./MetricsNotice";

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

/** «Ejecución por proyecto» (SPEC §8, RED-W6): for each project, the latest
 *  final result of each case/target as one stacked bar (pass, fail, blocked;
 *  the rest is «No ejecutado»), executed of total and the share executed.
 *  The state of play, not of the period: a project closes on all of it. */
export function ExecutionByProject({
  projects,
  state,
  onRetry,
  loading = false,
}: {
  projects: HomeProject[];
  state: MetricsState;
  onRetry: () => void;
  /** The projects are not known yet: placeholders, not «no projects». */
  loading?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const percent = new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: "percent",
  });
  const metrics: HomeMetrics | null = state.data;
  const pm = byProject(metrics);
  const ready = state.status === "ready";
  const anyRun =
    !!metrics && metrics.projects.some((p) => p.counts.executed > 0);

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
            { tone: "other", label: t("dashboard.exec.other") },
            { tone: "none", label: t("dashboard.exec.notRun") },
          ]}
        />
      </div>

      {loading ? (
        <div className="home-exec__list" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="home-exec__row">
              <span className="home-exec__line">
                <Skeleton width={skeletonWidth(i)} />
              </span>
              <Skeleton shape="block" width="100%" height={10} />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <p className="home-empty">{t("dashboard.exec.empty")}</p>
      ) : (
        <>
          <ul
            className="home-exec__list"
            data-testid="home-exec"
            aria-busy={state.status === "loading" || undefined}
          >
            {projects.map((p) => {
              const row = execRow(pm.get(p.id));
              // Null until the metrics load, or for a project newer than
              // them: unknown, never «0 %».
              const c = ready ? row.counts : null;
              const width = (n: number) => `${(n / (c?.total || 1)) * 100}%`;
              return (
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
                    {c && c.total > 0 ? (
                      <>
                        <span className="home-exec__count">
                          {c.executed} / {c.total}
                        </span>
                        <span className="home-exec__pct">
                          {percent.format(row.executedShare ?? 0)}
                        </span>
                      </>
                    ) : (
                      // No cases (nothing to run), or not known yet.
                      <span
                        className="home-exec__pct"
                        title={c ? t("dashboard.exec.noCases") : undefined}
                      >
                        {state.status === "loading" ? <Skeleton width={36} /> : "—"}
                      </span>
                    )}
                  </span>
                  <span
                    className="home-exec__bar"
                    role="img"
                    aria-label={
                      c
                        ? t("dashboard.exec.rowLabel", {
                            name: p.name,
                            executed: c.executed,
                            total: c.total,
                            passed: c.passed,
                            failed: c.failed + c.retest,
                            blocked: c.blocked,
                          })
                        : t("dashboard.exec.rowUnknown", { name: p.name })
                    }
                  >
                    {/* Re-test is a failed case waiting for its re-run: drawn
                        right after the failed ones, in the same colour. */}
                    {c && c.passed > 0 && (
                      <span data-tone="pass" style={{ width: width(c.passed) }} />
                    )}
                    {c && c.failed > 0 && (
                      <span data-tone="fail" style={{ width: width(c.failed) }} />
                    )}
                    {c && c.retest > 0 && (
                      <span data-tone="retest" style={{ width: width(c.retest) }} />
                    )}
                    {c && c.blocked > 0 && (
                      <span
                        data-tone="blocked"
                        style={{ width: width(c.blocked) }}
                      />
                    )}
                    {c && c.skipped + c.other > 0 && (
                      <span
                        data-tone="other"
                        style={{ width: width(c.skipped + c.other) }}
                      />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <MetricsNotice state={state} onRetry={onRetry} />
          {state.status === "ready" && !anyRun && (
            <p className="home-note">{t("dashboard.exec.noRuns")}</p>
          )}
        </>
      )}
    </section>
  );
}
