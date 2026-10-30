import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useAuth } from "@modules/auth";
import {
  matchesQuery,
  progressPercent,
  projectOverview,
  projectPath,
  type ProjectOverview,
} from "@modules/projects";
import "./DashboardPage.css";

/** Home (spec §5, UX-08): start a new test project or continue one, with a
 *  search over the user's projects, their last access on this device, plan
 *  status and progress. */
export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const ownerId = user?.id ?? "";
  const [projects, setProjects] = useState<ProjectOverview[] | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      void projectOverview(ownerId).then((rows) => {
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

  const visible = useMemo(
    () => (projects ?? []).filter((p) => matchesQuery(p.name, query)),
    [projects, query],
  );

  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));

  const open = (id: string) => navigate(projectPath(id));

  return (
    <section className="home">
      <header className="home__header">
        <h1 className="home__title">
          {user?.firstName ? t("dashboard.greeting", { name: user.firstName }) : t("dashboard.title")}
        </h1>
        <p className="home__subtitle">{t("dashboard.subtitle")}</p>
      </header>

      <div className="home__actions">
        <button
          type="button"
          className="home__action home__action--primary"
          onClick={() => navigate("/projects?new=1")}
        >
          <span className="home__action-title">{t("dashboard.newProject")}</span>
          <span className="home__action-desc">{t("dashboard.newProjectDesc")}</span>
        </button>
        <button
          type="button"
          className="home__action"
          onClick={() => searchRef.current?.focus()}
          disabled={!projects?.length}
        >
          <span className="home__action-title">{t("dashboard.continue")}</span>
          <span className="home__action-desc">{t("dashboard.continueDesc")}</span>
        </button>
      </div>

      <section className="home__projects" aria-labelledby="home-projects-title">
        <div className="home__projects-head">
          <h2 id="home-projects-title" className="home__section-title">
            {t("dashboard.projectsTitle")}
          </h2>
          <label className="home__search">
            <span className="home__sr">{t("dashboard.searchLabel")}</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder={t("dashboard.searchPlaceholder")}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="home-search"
            />
          </label>
        </div>

        {projects === null ? (
          <p className="home__muted">{t("common.loading")}</p>
        ) : projects.length === 0 ? (
          <p className="home__muted">{t("dashboard.empty")}</p>
        ) : visible.length === 0 ? (
          <p className="home__muted" role="status">
            {t("dashboard.noMatch", { query: query.trim() })}
          </p>
        ) : (
          <ul className="home__list" data-testid="home-projects">
            {visible.map((p) => {
              const percent = progressPercent(p);
              return (
                <li key={p.id}>
                  <button type="button" className="home__item" onClick={() => open(p.id)}>
                    <span className="home__item-main">
                      <span className="home__item-name">{p.name}</span>
                      <span className="home__item-meta">
                        {p.lastAccess
                          ? t("dashboard.lastAccess", { date: date(p.lastAccess) })
                          : t("dashboard.neverOpened", { date: date(p.updatedAt) })}
                      </span>
                    </span>
                    <span className="home__chip">
                      {p.planStatus
                        ? t(`testPlan.statusLabel.${p.planStatus}`)
                        : t("dashboard.noPlan")}
                    </span>
                    <span className="home__progress">
                      <span
                        className="home__bar"
                        role="progressbar"
                        aria-label={t("dashboard.progressLabel", { name: p.name })}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                        aria-valuetext={t("dashboard.progress", {
                          approved: p.approved,
                          total: p.total,
                        })}
                      >
                        <span className="home__bar-fill" style={{ width: `${percent}%` }} />
                      </span>
                      <span className="home__progress-text">
                        {p.total
                          ? t("dashboard.progress", { approved: p.approved, total: p.total })
                          : t("dashboard.noCases")}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
