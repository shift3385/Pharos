import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";
import { ArrowRight, ChevronsUpDown, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { ADMIN, MAIN_NAV, PROJECT_NAV, isCurrent, type NavItem } from "@app/navConfig";
import { projectPath } from "@modules/projects";
import { Logo } from "@shared/ui/Logo";
import { Menu, MenuItem } from "@shared/ui/Menu";
import { usePopover } from "@shared/ui/usePopover";
import { APP_VERSION } from "@shared/version";
import { UserMenu } from "./UserMenu";
import type { ActiveProject } from "./useShellState";

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

/** Project switcher of the «Proyecto activo» group (SPEC §6): a search field
 *  fixed on top, a scrolling list (≈260 px) and «Ver todos» at the foot. */
function ProjectSwitcher({ active }: { active: ActiveProject }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const menu = usePopover("menu");
  const [query, setQuery] = useState("");
  const q = query.trim().toLocaleLowerCase();
  const shown = active.projects.filter(
    (p) => !q || p.name.toLocaleLowerCase().includes(q) || p.caseIdPrefix.toLocaleLowerCase().includes(q),
  );
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
      <Menu
        open={menu.open}
        onClose={() => {
          menu.close();
          setQuery("");
        }}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={t("shell.switchProjectMenu")}
        className="project-menu"
        header={
          <label className="project-menu__search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder={t("shell.searchProjects")}
              aria-label={t("shell.searchProjects")}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        }
      >
        <div className="project-menu__list" role="group" aria-label={t("nav.projects")}>
          {shown.length === 0 && <p className="project-menu__empty">{t("shell.noProjects")}</p>}
          {shown.map((p) => (
            <MenuItem
              key={p.id}
              selected={p.id === active.projectId}
              onSelect={() => navigate(projectPath(p.id, active.section))}
            >
              <span className="project-menu__prefix t-id">{p.caseIdPrefix}</span> {p.name}
            </MenuItem>
          ))}
        </div>
        <MenuItem icon={ArrowRight} onSelect={() => navigate("/projects")}>
          {t("shell.seeAllProjects")}
        </MenuItem>
      </Menu>
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
}: {
  mode: Mode;
  /** Desktop only: show the collapse / expand button. */
  collapsible: boolean;
  onToggle: () => void;
  active: ActiveProject | null;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const rail = mode === "rail";
  const toggleLabel = rail ? t("shell.expandMenu") : t("shell.collapseMenu");
  const ToggleIcon = rail ? PanelLeftOpen : PanelLeftClose;
  const toggle = collapsible && (
    <button
      type="button"
      className="sidebar__toggle"
      onClick={onToggle}
      aria-label={toggleLabel}
      title={toggleLabel}
      aria-expanded={!rail}
      data-testid="sidebar-collapse"
    >
      <ToggleIcon size={16} aria-hidden="true" />
    </button>
  );
  const link = (item: NavItem) => (
    <SideLink
      key={item.id}
      to={item.path}
      icon={item.icon}
      label={t(`nav.${item.id}`)}
      short={t(`nav.short.${item.id}`)}
      current={isCurrent(item, pathname)}
      testId={`nav-${item.id}`}
    />
  );

  return (
    <aside className="sidebar" data-mode={mode}>
      <div className="sidebar__brand">
        {rail && toggle}
        <Logo size={rail ? 38 : 35} surface="navy" />
        {!rail && <span className="sidebar__brand-name">{t("app.name")}</span>}
        {!rail && toggle}
      </div>

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
        <span
          className="sidebar__version"
          data-testid="app-version"
          title={t("app.version", { version: APP_VERSION })}
        >
          v{APP_VERSION}
        </span>
        <UserMenu variant={rail ? "rail" : "sidebar"} />
      </div>
    </aside>
  );
}
