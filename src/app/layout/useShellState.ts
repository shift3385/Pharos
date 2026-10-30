import { useCallback, useEffect, useRef, useState } from "react";
import { useMatch } from "react-router";
import { useAuth } from "@modules/auth";
import { isProjectSection, projectApi, type ProjectSection, type ProjectSummary } from "@modules/projects";

export const SIDEBAR_COLLAPSED_KEY = "pharos.sidebar.collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Whether the desktop sidebar is collapsed to the 84 px strip. The choice is
 *  remembered between sessions (SPEC §7). */
export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const set = useCallback((value: boolean) => {
    setCollapsed(value);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? "1" : "0");
    } catch {
      // Storage may be unavailable; the choice then lasts for this session.
    }
  }, []);
  return [collapsed, set];
}

export type SidebarPhase = "idle" | "collapsing" | "expanding";

/** Texts fade out (100 ms) before the 200 ms width change, and fade in after
 *  it (SPEC §9). Without motion (reduced motion, or no `matchMedia` as in
 *  tests) the switch is immediate. */
const FADE_OUT_MS = 100;
const EXPAND_MS = 340;

function animated(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** The collapse/expand toggle with its animation phase. */
export function useSidebarToggle(): {
  collapsed: boolean;
  phase: SidebarPhase;
  toggle: () => void;
} {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [phase, setPhase] = useState<SidebarPhase>("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const toggle = useCallback(() => {
    window.clearTimeout(timer.current);
    if (!animated()) {
      setPhase("idle");
      setCollapsed(!collapsed);
      return;
    }
    if (!collapsed) {
      setPhase("collapsing");
      timer.current = window.setTimeout(() => {
        setCollapsed(true);
        setPhase("idle");
      }, FADE_OUT_MS);
    } else {
      setCollapsed(false);
      setPhase("expanding");
      timer.current = window.setTimeout(() => setPhase("idle"), EXPAND_MS);
    }
  }, [collapsed, setCollapsed]);

  return { collapsed, phase, toggle };
}

export interface ActiveProject {
  projectId: string;
  section: ProjectSection;
  /** The open project, once the list has loaded. */
  project: ProjectSummary | undefined;
  /** The user's projects, for the project switcher. */
  projects: ProjectSummary[];
}

/** The project open in the URL (`/projects/:projectId/:section`, ADR-0029),
 *  or null outside a project. The shell uses it for the «Proyecto activo»
 *  group, the breadcrumbs and the mobile header. */
export function useActiveProject(): ActiveProject | null {
  const match = useMatch("/projects/:projectId/:section");
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const projectId = match?.params.projectId;
  const inProject = projectId !== undefined;
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    if (!inProject) return;
    let live = true;
    const load = () =>
      projectApi
        .list(ownerId)
        .then((list) => live && setProjects(list ?? []))
        .catch(() => live && setProjects([]));
    void load();
    // A rename or a sync elsewhere updates the names shown in the shell.
    window.addEventListener("pharos:synced", load);
    return () => {
      live = false;
      window.removeEventListener("pharos:synced", load);
    };
  }, [inProject, projectId, ownerId]);

  if (!projectId) return null;
  const section = match?.params.section;
  return {
    projectId,
    section: isProjectSection(section) ? section : "plan",
    project: projects.find((p) => p.id === projectId),
    projects,
  };
}
