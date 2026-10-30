import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { ChevronLeft, Search } from "lucide-react";
import { useAuth } from "@modules/auth";
import { projectPath } from "@modules/projects";
import { PROJECT_NAV, BOTTOM_NAV, isCurrent } from "@app/navConfig";
import { Logo } from "@shared/ui/Logo";
import { Breadcrumbs } from "./Breadcrumbs";
import { UserMenu } from "./UserMenu";
import {
  MobileSearchBar,
  NotificationsTrigger,
  SearchTrigger,
  ThemeQuickToggle,
} from "./TopbarControls";
import type { ActiveProject } from "./useShellState";

function OfflineBadge() {
  const { t } = useTranslation();
  const { offline } = useAuth();
  if (!offline) return null;
  return (
    <span className="topbar__offline" role="status">
      <span className="topbar__offline-dot" aria-hidden="true" />
      {t("auth.offline")}
    </span>
  );
}

/** Top bar for tablet and desktop (SPEC §7), 64 px: breadcrumbs, then the
 *  offline badge, search (Ctrl K), notifications and the light/dark quick
 *  switch. The sync status lives in the sidebar foot. */
export function Topbar({ active }: { active: ActiveProject | null }) {
  return (
    <header className="topbar">
      <Breadcrumbs active={active} />
      <span className="topbar__spacer" />
      <div className="topbar__actions">
        <OfflineBadge />
        <SearchTrigger />
        <NotificationsTrigger />
        <ThemeQuickToggle />
      </div>
    </header>
  );
}

/** Mobile top bar (SPEC §7), navy, 56 px: the logo and name, or inside a
 *  project a back arrow with the section and the project name. The magnifier
 *  turns it into the search field; the avatar opens the user menu sheet. */
export function MobileTopbar({ active }: { active: ActiveProject | null }) {
  const { t } = useTranslation();
  const [searching, setSearching] = useState(false);
  const closeSearch = useCallback(() => setSearching(false), []);
  if (searching) {
    return (
      <header className="mtopbar mtopbar--search">
        <MobileSearchBar onClose={closeSearch} />
      </header>
    );
  }
  return (
    <header className="mtopbar">
      {active ? (
        <>
          <Link
            to="/projects"
            className="topbar__icon-btn topbar__icon-btn--navy"
            aria-label={t("shell.back")}
            title={t("shell.back")}
          >
            <ChevronLeft size={22} aria-hidden="true" />
          </Link>
          <span className="mtopbar__titles">
            <span className="mtopbar__title">{t(`projects.tab.${active.section}`)}</span>
            <span className="mtopbar__subtitle" title={active.project?.name}>
              {active.project?.name ?? "…"}
            </span>
          </span>
        </>
      ) : (
        <span className="mtopbar__brand">
          <Logo size={30} surface="navy" decorative />
          <span className="mtopbar__name">{t("app.name")}</span>
        </span>
      )}
      <button
        type="button"
        className="topbar__icon-btn topbar__icon-btn--navy"
        aria-label={t("shell.searchLabel")}
        title={t("shell.searchLabel")}
        data-testid="search-trigger"
        onClick={() => setSearching(true)}
      >
        <Search size={20} aria-hidden="true" />
      </button>
      <NotificationsTrigger onNavy />
      <UserMenu variant="mobile" />
    </header>
  );
}

/** Mobile: a project's sections as scrollable pills under the top bar. */
export function ProjectPills({ active }: { active: ActiveProject }) {
  const { t } = useTranslation();
  return (
    <nav className="project-pills" aria-label={t("shell.projectSections")}>
      {PROJECT_NAV.map(({ section }) => (
        <Link
          key={section}
          to={projectPath(active.projectId, section)}
          className="project-pills__pill"
          aria-current={active.section === section ? "page" : undefined}
          data-testid={`nav-project-${section}`}
        >
          {t(`nav.short.project.${section}`)}
        </Link>
      ))}
    </nav>
  );
}

/** Mobile bottom bar (SPEC §2/§5): Inicio, Proyectos, Admin, Perfil; tabs of
 *  at least 50 px. */
export function BottomNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <nav className="bottom-nav" aria-label={t("a11y.mainNav")}>
      {BOTTOM_NAV.map((item) => {
        const current = isCurrent(item, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            to={item.path}
            className="bottom-nav__tab"
            aria-current={current ? "page" : undefined}
            data-testid={`nav-${item.id}`}
          >
            <span className="bottom-nav__icon">
              <Icon size={20} aria-hidden="true" />
            </span>
            {t(`nav.short.${item.id}`)}
          </Link>
        );
      })}
    </nav>
  );
}
