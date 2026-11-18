import { createContext, useContext } from "react";
import type { Workspace } from "../api/workspacesApi";
import { can as roleCan, type Capability, type WorkspaceRole } from "../model/roles";

export interface WorkspaceContextValue {
  /** False until the server has workspaces (or offline before the first
   *  sync with one): the app works as before, with no selector. */
  available: boolean;
  workspaces: Workspace[];
  current: Workspace | null;
  setCurrent: (id: string) => void;
  /** The account's role in the current workspace (null: no workspaces). */
  role: WorkspaceRole | null;
  can: (cap: Capability) => boolean;
  reload: () => Promise<void>;
}

const noop = async () => {};

export const WorkspaceContext = createContext<WorkspaceContextValue>({
  available: false,
  workspaces: [],
  current: null,
  setCurrent: () => {},
  role: null,
  can: () => true,
  reload: noop,
});

/** The current workspace, the account's role there and what it allows. */
export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}

/** The account's role in one workspace (for other modules: CAS-02, SEC-09;
 *  ADR-0042 §8). Without workspaces everything is allowed (the server decides). */
export function useWorkspaceRole(workspaceId?: string | null): {
  role: WorkspaceRole | null;
  can: (cap: Capability) => boolean;
} {
  const { workspaces, current } = useWorkspace();
  const w = workspaceId ? workspaces.find((x) => x.id === workspaceId) : current;
  const role = w?.role ?? null;
  return { role, can: (cap) => roleCan(role, cap) };
}
