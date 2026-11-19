import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ChevronsUpDown, KeyRound, Plus, Users } from "lucide-react";
import { Menu, MenuItem, MenuSeparator } from "@shared/ui/Menu";
import { usePopover } from "@shared/ui/usePopover";
import { useSyncStatus } from "@modules/sync-offline";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";
import { useWorkspace } from "./workspaceContext";
import "./workspaces.css";

/** The workspace selector at the top of the sidebar (SYNC-07, boceto 1). The
 *  current workspace filters the projects; its role is always beside the
 *  name, so nobody wonders why a button is disabled. Hidden while the server
 *  has no workspaces (the app as before). */
export function WorkspaceSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const menu = usePopover("menu");
  const { available, workspaces, current, setCurrent, reload } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const sync = useSyncStatus();
  // A workspace just created: chosen as soon as the list has it. On the
  // desktop the list is the local mirror, which a sync refreshes (FIX-33).
  const [created, setCreated] = useState<string | null>(null);
  useEffect(() => {
    if (created && workspaces.some((w) => w.id === created)) {
      setCurrent(created);
      setCreated(null);
    }
  }, [created, workspaces, setCurrent]);
  if (!available || !current) return null;
  const roleLabel = t(`workspaces.roles.${current.role}`);
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
        {workspaces.map((w) => (
          <MenuItem
            key={w.id}
            selected={w.id === current.id}
            description={t(`workspaces.roles.${w.role}`)}
            onSelect={() => setCurrent(w.id)}
            testId={`workspace-${w.id}`}
          >
            {w.name}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem icon={Plus} onSelect={() => setCreating(true)} testId="workspace-create">
          {t("workspaces.switcher.create")}
        </MenuItem>
        <MenuItem icon={KeyRound} onSelect={() => void navigate("/workspaces/join")} testId="workspace-join">
          {t("workspaces.switcher.join")}
        </MenuItem>
        <MenuItem icon={Users} onSelect={() => void navigate(`/workspaces/members?id=${current.id}`)} testId="workspace-members">
          {t("workspaces.switcher.members")}
        </MenuItem>
      </Menu>
      {creating && (
        <CreateWorkspaceDialog
          onCancel={() => setCreating(false)}
          onCreated={(w) => {
            setCreating(false);
            setCreated(w.id);
            sync?.runSync();
            void reload();
          }}
        />
      )}
    </>
  );
}
