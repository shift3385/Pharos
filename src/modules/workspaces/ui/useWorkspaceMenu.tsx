import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { KeyRound, Plus, Users } from "lucide-react";
import { MenuItem, MenuSeparator } from "@shared/ui/Menu";
import { useSyncStatus } from "@modules/sync-offline";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";
import { useWorkspace } from "./workspaceContext";
import type { Workspace } from "../api/workspacesApi";

/** What the workspace selector offers, for any menu that shows it: the
 *  sidebar's selector and the mobile user sheet (FIX-39, where there is no
 *  sidebar). `items` go inside a menu; `dialog` outside it, so it outlives the
 *  menu that closes when an item is chosen. Null while the server has no
 *  workspaces (the app as before). */
export function useWorkspaceMenu(): {
  current: Workspace;
  roleLabel: string;
  items: ReactNode;
  dialog: ReactNode;
} | null {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
  const items = (
    <>
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
    </>
  );
  const dialog = creating && (
    <CreateWorkspaceDialog
      onCancel={() => setCreating(false)}
      onCreated={(w) => {
        setCreating(false);
        setCreated(w.id);
        sync?.runSync();
        void reload();
      }}
    />
  );
  return { current, roleLabel: t(`workspaces.roles.${current.role}`), items, dialog };
}

