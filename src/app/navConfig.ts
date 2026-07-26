/**
 * Navigation model for the app shell. Each entry maps to a domain module
 * section. `phase` is the implementation phase where the section gets real
 * content (spec §16); it drives the "coming in phase N" badge on empty pages.
 */
export interface NavItem {
  /** i18n key under `nav.*` and test id suffix. */
  id: string;
  path: string;
  /** Decorative glyph shown in the sidebar. */
  icon: string;
  phase?: number;
}

// The test plan and test cases live inside a project (spec §5.1), so they are no
// longer top-level sidebar entries — you reach them by opening a project.
export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", path: "/", icon: "⌂" },
  { id: "projects", path: "/projects", icon: "◫", phase: 3 },
  { id: "templates", path: "/templates", icon: "❏", phase: 6 },
  { id: "ai", path: "/ai", icon: "✦", phase: 7 },
  { id: "admin", path: "/admin", icon: "⚙", phase: 9 },
  { id: "profile", path: "/profile", icon: "◉" },
];
