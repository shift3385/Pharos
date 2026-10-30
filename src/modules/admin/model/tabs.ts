// Administration tabs (SPEC §8, ADR-0031). One screen at `/admin?tab=<id>`;
// the old `/templates` and `/ai` routes redirect here.

export type AdminTab = "ai" | "templates" | "general" | "sync" | "security" | "diagnostics";

export type AdminTabGroup = "resources" | "application" | "account" | "support";

/** Tabs in display order, grouped Recursos · Aplicación · Cuenta y datos · Soporte. */
export const ADMIN_TAB_GROUPS: { group: AdminTabGroup; tabs: AdminTab[] }[] = [
  { group: "resources", tabs: ["ai", "templates"] },
  { group: "application", tabs: ["general"] },
  { group: "account", tabs: ["sync", "security"] },
  { group: "support", tabs: ["diagnostics"] },
];

export const ADMIN_TABS: AdminTab[] = ADMIN_TAB_GROUPS.flatMap((g) => g.tabs);

/** Motor de IA is the default (SPEC §8). */
export const DEFAULT_ADMIN_TAB: AdminTab = "ai";

/** The tab a `?tab=` value names; missing or unknown → the default. */
export function adminTabFrom(value: string | null | undefined): AdminTab {
  return ADMIN_TABS.includes(value as AdminTab) ? (value as AdminTab) : DEFAULT_ADMIN_TAB;
}

export function adminPath(tab: AdminTab): string {
  return `/admin?tab=${tab}`;
}

/** Ids that tie each tab to the panel (`aria-controls` / `aria-labelledby`);
 *  the tab id is also its test id. */
export const ADMIN_PANEL_ID = "admin-panel";
export const adminTabId = (tab: AdminTab) => `admin-tab-${tab}`;
