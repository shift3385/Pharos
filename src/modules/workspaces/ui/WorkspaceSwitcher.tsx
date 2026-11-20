import { useTranslation } from "react-i18next";
import { ChevronsUpDown } from "lucide-react";
import { Menu } from "@shared/ui/Menu";
import { usePopover } from "@shared/ui/usePopover";
import { useWorkspaceMenu } from "./useWorkspaceMenu";
import "./workspaces.css";

/** The workspace selector at the top of the sidebar (SYNC-07, boceto 1). The
 *  current workspace filters the projects; its role is always beside the
 *  name, so nobody wonders why a button is disabled. Hidden while the server
 *  has no workspaces (the app as before). */
export function WorkspaceSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const menu = usePopover("menu");
  const ws = useWorkspaceMenu();
  if (!ws) return null;
  const { current, roleLabel } = ws;
  return (
    <>
      <button
        type="button"
        className="ws-switcher"
        data-compact={compact || undefined}
        {...menu.triggerProps}
        title={`${current.name} · ${roleLabel}`}
        data-testid="workspace-switcher"
      >
        <span className="sr-only">{t("workspaces.switcher.menu")}: </span>
        {!compact && <span className="ws-switcher__label t-group-label">{t("workspaces.switcher.label")}</span>}
        <span className="ws-switcher__name">{current.name}</span>
        {!compact && <span className="ws-switcher__role">{roleLabel}</span>}
        <ChevronsUpDown size={14} aria-hidden="true" />
      </button>
      <Menu open={menu.open} onClose={menu.close} anchorRef={menu.anchorRef} id={menu.id} label={t("workspaces.switcher.menu")}>
        {ws.items}
      </Menu>
      {ws.dialog}
    </>
  );
}
