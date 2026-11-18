// Administration tabs (SPEC §8, ADR-0031). One screen at `/admin?tab=<id>`;
// the old `/templates` and `/ai` routes redirect here.

export type AdminTab =
  | "ai"
  | "templates"
  | "general"
  | "users"
  | "sync"
  | "security"
  | "evidence"
  | "audit"
  | "diagnostics";

export type AdminTabGroup = "resources" | "application" | "account" | "support";

/** Tabs in display order, grouped Recursos · Aplicación · Cuenta y datos · Soporte. */
export const ADMIN_TAB_GROUPS: { group: AdminTabGroup; tabs: AdminTab[] }[] = [
  { group: "resources", tabs: ["ai", "templates"] },
  { group: "application", tabs: ["general", "users"] },
  { group: "account", tabs: ["sync", "security", "evidence", "audit"] },
  { group: "support", tabs: ["diagnostics"] },
];

export const ADMIN_TABS: AdminTab[] = ADMIN_TAB_GROUPS.flatMap((g) => g.tabs);

/** Motor de IA is the default (SPEC §8). */
export const DEFAULT_ADMIN_TAB: AdminTab = "ai";

/** Tabs only a server administrator sees (SEC-11, ADR-0045): «Usuarios». */
export const ADMIN_ONLY_TABS: readonly AdminTab[] = ["users"];

/** The groups as this user sees them: without the administrator's tabs
 *  unless `isAdmin`. The server checks the role on every request; this only
 *  hides what would answer 403. */
export function adminTabGroups(isAdmin: boolean): typeof ADMIN_TAB_GROUPS {
  return ADMIN_TAB_GROUPS.map((g) => ({
    ...g,
    tabs: g.tabs.filter((t) => isAdmin || !ADMIN_ONLY_TABS.includes(t)),
  })).filter((g) => g.tabs.length > 0);
}

/** The tab a `?tab=` value names; missing, unknown or not this user's
 *  (an administrator's tab without the role) → the default. */
export function adminTabFrom(value: string | null | undefined, isAdmin = true): AdminTab {
  const tab = value as AdminTab;
  if (!ADMIN_TABS.includes(tab)) return DEFAULT_ADMIN_TAB;
  return isAdmin || !ADMIN_ONLY_TABS.includes(tab) ? tab : DEFAULT_ADMIN_TAB;
}

export function adminPath(tab: AdminTab): string {
  return `/admin?tab=${tab}`;
}

/** Ids that tie each tab to the panel (`aria-controls` / `aria-labelledby`);
 *  the tab id is also its test id. */
export const ADMIN_PANEL_ID = "admin-panel";
export const adminTabId = (tab: AdminTab) => `admin-tab-${tab}`;
