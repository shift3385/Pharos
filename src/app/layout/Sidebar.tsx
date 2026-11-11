import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";
import { ArrowRight, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { ADMIN, MAIN_NAV, PROJECT_NAV, PROJECTS, isCurrent, type NavItem } from "@app/navConfig";
import { projectPath } from "@modules/projects";
import { SyncIndicator } from "@modules/sync-offline";
import { Logo } from "@shared/ui/Logo";
import { MenuItem } from "@shared/ui/Menu";
import { ProjectMenu } from "@shared/ui/ProjectPicker";
import { usePopover } from "@shared/ui/usePopover";
import { AboutDialog } from "./AboutDialog";
import { UserMenu } from "./UserMenu";
import type { ActiveProject, SidebarPhase } from "./useShellState";

type Mode = "full" | "rail";

/** One navigation link. In the strip the full label stays for screen readers
 *  and as the tooltip, and a short label shows under the icon. */
function SideLink({
  to,
  icon: Icon,
  label,
  short,
  current,
  testId,
}: {
  to: string;
  icon: NavItem["icon"];
  label: string;
  short: string;
  current: boolean;
  testId: string;
}) {
  return (
    <Link
      to={to}
      className="sidebar__link"
      aria-current={current ? "page" : undefined}
      data-testid={testId}
      title={label}
    >
      <Icon className="sidebar__icon" size={18} aria-hidden="true" />
      <span className="sidebar__label">{label}</span>
      <span className="sidebar__short" aria-hidden="true">
        {short}
      </span>
    </Link>
  );
}

/** Project switcher of the «Proyecto activo» group (SPEC §6): the shared
 *  `ProjectMenu`, with «Ver todos» at the foot. */
function ProjectSwitcher({ active }: { active: ActiveProject }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const menu = usePopover("menu");
  const name = active.project?.name ?? "…";
  return (
    <>
      <button
        type="button"
        className="sidebar__project"
        {...menu.triggerProps}
        title={name}
        data-testid="project-switcher"
      >
        <span className="sr-only">{t("shell.switchProjectMenu")}: </span>
        <span className="sidebar__project-badge t-id">{active.project?.caseIdPrefix ?? ""}</span>
        <span className="sidebar__project-name">{name}</span>
        <ChevronsUpDown size={14} aria-hidden="true" />
      </button>
      <ProjectMenu
        open={menu.open}
        onClose={menu.close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={t("shell.switchProjectMenu")}
        projects={active.projects}
        selectedId={active.projectId}
        onSelect={(id) => navigate(projectPath(id, active.section))}
        footer={
          <MenuItem icon={ArrowRight} onSelect={() => navigate("/projects")}>
            {t("shell.seeAllProjects")}
          </MenuItem>
        }
      />
    </>
  );
}

/**
 * Navy navigation (SPEC §2/§7). `full` is the 248 px sidebar (≥ 1280 px);
 * `rail` is the 84 px icon strip (600–1279 px, or the sidebar collapsed on
 * desktop). The «Proyecto activo» group only appears inside a project.
 */
export function Sidebar({
  mode,
  collapsible,
  onToggle,
  active,
  phase = "idle",
}: {
  mode: Mode;
  /** Desktop only: show the collapse / expand tab on the right edge. */
  collapsible: boolean;
  onToggle: () => void;
  active: ActiveProject | null;
  /** Collapse/expand animation step (texts fade around the width change). */
  phase?: SidebarPhase;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const rail = mode === "rail";
  const toggleLabel = rail ? t("shell.expandMenu") : t("shell.collapseMenu");
  const ToggleIcon = rail ? ChevronRight : ChevronLeft;
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutLabel = t("about.open");
  const link = (item: NavItem) => (
    <SideLink
      key={item.id}
      to={item.path}
      icon={item.icon}
      label={t(`nav.${item.id}`)}
      short={t(`nav.short.${item.id}`)}
      // Inside a project only its section is current: «Proyectos» stays
      // plain while the «Proyecto activo» group is shown (SPEC §7).
      current={isCurrent(item, pathname) && !(active && item.id === PROJECTS.id)}
      testId={`nav-${item.id}`}
    />
  );

  // The frame holds the sidebar and its edge tab: the sidebar scrolls and
  // clips, the tab sits over its right border (UX-26).
  return (
    <div className="sidebar-frame" data-mode={mode}>
      <aside className="sidebar" data-mode={mode} data-phase={phase}>
        {/* The logo and the name open «Acerca de Pharos» (UX-26): a button that
            does not look like one, reachable with Tab, Enter and Space. */}
        <button
          type="button"
          className="sidebar__brand"
          onClick={() => setAboutOpen(true)}
          aria-label={aboutLabel}
          title={aboutLabel}
          aria-haspopup="dialog"
          data-testid="about-open"
        >
          <Logo size={rail ? 38 : 35} surface="navy" decorative />
          {!rail && (
            <span className="sidebar__brand-name" aria-hidden="true">
              {t("app.name")}
            </span>
          )}
        </button>

        <nav className="sidebar__nav" aria-label={t("a11y.mainNav")}>
          <div className="sidebar__group">{MAIN_NAV.map(link)}</div>

          {active && (
            <div className="sidebar__group" role="group" aria-labelledby="sidebar-project-label">
              <span id="sidebar-project-label" className="sidebar__group-label t-group-label">
                {t("shell.activeProject")}
              </span>
              {!rail && <ProjectSwitcher active={active} />}
              {PROJECT_NAV.map(({ section, icon }) => (
                <SideLink
                  key={section}
                  to={projectPath(active.projectId, section)}
                  icon={icon}
                  label={t(`projects.tab.${section}`)}
                  short={t(`nav.short.project.${section}`)}
                  current={active.section === section}
                  testId={`nav-project-${section}`}
                />
              ))}
            </div>
          )}

          <div className="sidebar__group sidebar__group--config">
            {!rail && (
              <span className="sidebar__group-label t-group-label">{t("shell.configuration")}</span>
            )}
            {link(ADMIN)}
          </div>
        </nav>

        <div className="sidebar__foot">
          {/* Sync status above the user (SPEC §7 prototype); a sync button in the strip. */}
          <SyncIndicator variant={rail ? "compact" : "full"} />
          <UserMenu variant={rail ? "rail" : "sidebar"} />
        </div>
      </aside>
      {/* Collapse / expand: a tab on the right edge, half-way down (UX-26).
          Only where the sidebar can collapse (desktop, ≥ 1280 px). */}
      {collapsible && (
        <button
          type="button"
          className="sidebar-tab"
          onClick={onToggle}
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-expanded={!rail}
          data-testid="sidebar-collapse"
        >
          <ToggleIcon size={14} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
