// The workspace the person works in (SYNC-07, ADR-0042). It filters the
// projects and says the account's role there, so the screens can disable what
// the role does not allow. The list is reloaded after every sync
// (`pharos:workspaces`, `pharos:synced`) and when it changes here.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@modules/auth";
import { listWorkspaces, type Workspace } from "../api/workspacesApi";
import { can as roleCan } from "../model/roles";
import { WorkspaceContext, type WorkspaceContextValue } from "./workspaceContext";

const storageKey = (userId: string) => `pharos.workspace.${userId}`;

function remembered(userId: string): string | null {
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

function remember(userId: string, id: string) {
  try {
    localStorage.setItem(storageKey(userId), id);
  } catch {
    // A convenience only.
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) {
      setWorkspaces(null);
      return;
    }
    try {
      setWorkspaces(await listWorkspaces());
    } catch {
      // Offline or the server is away: keep what is shown.
    }
  }, [userId]);

  useEffect(() => {
    setCurrentId(userId ? remembered(userId) : null);
    void reload();
  }, [userId, reload]);

  useEffect(() => {
    const onChange = () => void reload();
    window.addEventListener("pharos:workspaces", onChange);
    window.addEventListener("pharos:synced", onChange);
    return () => {
      window.removeEventListener("pharos:workspaces", onChange);
      window.removeEventListener("pharos:synced", onChange);
    };
  }, [reload]);

  const setCurrent = useCallback(
    (id: string) => {
      setCurrentId(id);
      if (userId) remember(userId, id);
      window.dispatchEvent(new CustomEvent("pharos:workspace-changed", { detail: { id } }));
    },
    [userId],
  );

  const value = useMemo<WorkspaceContextValue>(() => {
    const list = workspaces ?? [];
    const current =
      list.find((w) => w.id === currentId) ?? list.find((w) => w.kind === "personal") ?? list[0] ?? null;
    const role = current?.role ?? null;
    return {
      available: list.length > 0,
      workspaces: list,
      current,
      setCurrent,
      role,
      can: (cap) => roleCan(role, cap),
      reload,
    };
  }, [workspaces, currentId, setCurrent, reload]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
