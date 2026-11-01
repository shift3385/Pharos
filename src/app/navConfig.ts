import {
  CirclePlay,
  CircleUser,
  FileText,
  Folder,
  GitFork,
  LayoutDashboard,
  ListChecks,
  Settings2,
  SlidersHorizontal,
  SquareKanban,
  type LucideIcon,
} from "lucide-react";
import type { ProjectSection } from "@modules/projects";

/**
 * Navigation model of the app shell (SPEC §7). Labels come from i18n:
 * `nav.<id>` (full) and `nav.short.<id>` (icon strip and bottom bar).
 */
export interface NavItem {
  /** i18n key suffix and test id suffix (`nav-<id>`). */
  id: string;
  path: string;
  icon: LucideIcon;
  /** Other routes that keep this entry marked as current. */
  also?: string[];
}

export const HOME: NavItem = { id: "dashboard", path: "/", icon: LayoutDashboard };
export const PROJECTS: NavItem = { id: "projects", path: "/projects", icon: Folder };
/** Templates and the AI engine are tabs of Administration (SPEC §7,
 *  ADR-0031); `/templates` and `/ai` redirect to `/admin?tab=…`. */
export const ADMIN: NavItem = { id: "admin", path: "/admin", icon: Settings2 };
export const PROFILE: NavItem = { id: "profile", path: "/profile", icon: CircleUser };

/** Sidebar: Inicio and Proyectos on top, Administración under «Configuración». */
export const MAIN_NAV: NavItem[] = [HOME, PROJECTS];
/** Mobile bottom bar (SPEC §2): Inicio, Proyectos, Admin, Perfil. */
export const BOTTOM_NAV: NavItem[] = [HOME, PROJECTS, ADMIN, PROFILE];

/** The «Proyecto activo» group, shown only inside a project. */
export const PROJECT_NAV: { section: ProjectSection; icon: LucideIcon }[] = [
  { section: "plan", icon: FileText },
  { section: "cases", icon: ListChecks },
  { section: "planner", icon: SquareKanban },
  { section: "traceability", icon: GitFork },
  { section: "runs", icon: CirclePlay },
  { section: "settings", icon: SlidersHorizontal },
];

/** Whether `pathname` belongs to a navigation entry. */
export function isCurrent(item: NavItem, pathname: string): boolean {
  const owns = (path: string) =>
    path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
  return owns(item.path) || (item.also ?? []).some(owns);
}
