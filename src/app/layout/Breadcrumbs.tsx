import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { ChevronRight } from "lucide-react";
import { projectPath } from "@modules/projects";
import type { ActiveProject } from "./useShellState";

interface Crumb {
  label: string;
  to?: string;
}

/** Where the user is (SPEC §7): «Pharos › Inicio», «Proyectos › <proyecto> ›
 *  Planificador», «Administración › Plantillas»… The last crumb is the
 *  current page; long names end in «…» with the full name in `title`. */
export function Breadcrumbs({ active }: { active: ActiveProject | null }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const crumbs = trail(pathname, active, t);
  return (
    <nav className="crumbs" aria-label={t("shell.breadcrumbs")}>
      <ol className="crumbs__list">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={`${i}-${c.label}`}>
              {i > 0 && (
                <li className="crumbs__sep" aria-hidden="true">
                  <ChevronRight size={14} />
                </li>
              )}
              <li className="crumbs__item" data-current={last || undefined}>
                {c.to && !last ? (
                  <Link to={c.to} title={c.label}>
                    {c.label}
                  </Link>
                ) : (
                  <span title={c.label} aria-current={last ? "page" : undefined}>
                    {c.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

function trail(
  pathname: string,
  active: ActiveProject | null,
  t: (key: string) => string,
): Crumb[] {
  const app = { label: t("app.name") };
  const admin = { label: t("nav.admin"), to: "/admin" };
  if (active) {
    return [
      { label: t("nav.projects"), to: "/projects" },
      { label: active.project?.name ?? "…", to: projectPath(active.projectId) },
      { label: t(`projects.tab.${active.section}`) },
    ];
  }
  if (pathname.startsWith("/projects")) return [app, { label: t("nav.projects") }];
  if (pathname.startsWith("/templates")) return [admin, { label: t("nav.templates") }];
  if (pathname.startsWith("/ai")) return [admin, { label: t("nav.ai") }];
  if (pathname.startsWith("/admin")) return [app, { label: t("nav.admin") }];
  if (pathname.startsWith("/profile")) return [app, { label: t("nav.profile") }];
  return [app, { label: t("nav.dashboard") }];
}
