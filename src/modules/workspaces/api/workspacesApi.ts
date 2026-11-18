// The workspaces API (SYNC-07, ADR-0042 §2). Managing workspaces, members
// and invitations always talks to the server, on the desktop and on the web.
// The desktop also keeps a mirror of the list (`workspaces_list`, refreshed by
// every sync) so it can show the workspaces and roles offline.

import { getSession } from "@modules/auth";
import { serverApi } from "@modules/sync-offline";
import { invoke, isTauri } from "@shared/platform";
import type { WorkspaceRole } from "../model/roles";

export interface Member {
  userId: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  role: WorkspaceRole;
  addedAt: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  kind: "personal" | "shared";
  /** The signed-in account's role there. */
  role: WorkspaceRole;
  independentApproval?: boolean;
  members: Member[];
}

export interface Invitation {
  id: string;
  role: WorkspaceRole;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "accepted" | "revoked" | "expired";
}

export type ExpiryDays = 1 | 7 | 30;

/** True for a server answer that it has no workspaces (older than 0.5). */
const noWorkspaces = (e: unknown) => !!e && typeof e === "object" && "status" in e && (e as { status: number }).status === 404;

/** The server's error code of a failed request, if any. */
export const errorCode = (e: unknown): string | undefined =>
  e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : undefined;

/** The account's workspaces. On the desktop, from the mirror (offline too);
 *  on the web, from the server. Null: the server has no workspaces. */
export async function listWorkspaces(): Promise<Workspace[] | null> {
  if (isTauri()) {
    const session = await getSession();
    if (!session) return null;
    const list = await invoke<Workspace[]>("workspaces_list", { userId: session.userId });
    return list.length > 0 ? list : null;
  }
  try {
    return (await serverApi.get<{ workspaces: Workspace[] }>("/workspaces")).workspaces;
  } catch (e) {
    if (noWorkspaces(e)) return null;
    throw e;
  }
}

/** The workspace of each project of the account (desktop: the local rows;
 *  web: the projects' payloads, read by the caller). */
export async function projectWorkspaces(): Promise<Record<string, string>> {
  if (!isTauri()) return {};
  const session = await getSession();
  if (!session) return {};
  return invoke<Record<string, string>>("project_workspaces", { userId: session.userId });
}

export const workspacesApi = {
  create: (name: string) => serverApi.post<Workspace>("/workspaces", { name }),
  rename: (id: string, name: string) => serverApi.patch<Workspace>(`/workspaces/${id}`, { name }),
  members: async (id: string): Promise<Member[]> => {
    const list = (await serverApi.get<{ workspaces: Workspace[] }>("/workspaces")).workspaces;
    return list.find((w) => w.id === id)?.members ?? [];
  },
  invitations: async (id: string) =>
    (await serverApi.get<{ invitations: Invitation[] }>(`/workspaces/${id}/invitations`)).invitations,
  invite: (id: string, input: { role: WorkspaceRole; note?: string; expiresInDays: ExpiryDays }) =>
    serverApi.post<Invitation & { code: string }>(`/workspaces/${id}/invitations`, input),
  revokeInvitation: (id: string, invitationId: string) =>
    serverApi.remove(`/workspaces/${id}/invitations/${invitationId}`, invitationId),
  preview: (code: string) =>
    serverApi.post<{ workspaceName: string; role: WorkspaceRole; invitedBy: string }>("/invitations/preview", { code }),
  accept: (code: string) => serverApi.post<Workspace>("/invitations/accept", { code }),
  setRole: (id: string, userId: string, role: WorkspaceRole) =>
    serverApi.patch<{ members: Member[] }>(`/workspaces/${id}/members/${userId}`, { role }),
  removeMember: (id: string, userId: string) => serverApi.remove(`/workspaces/${id}/members/${userId}`, userId),
  /** «Aprobación independiente» on or off (PLN-08): a Test Manager of a
   *  shared workspace; the server audits it. */
  setIndependentApproval: (id: string, enabled: boolean) =>
    serverApi.patch<Workspace>(`/workspaces/${id}/policy`, { independentApproval: enabled }),
  moveProject: (destination: string, projectId: string) =>
    serverApi.post<{ moved: number; from: string; to: string }>(`/workspaces/${destination}/move-project`, {
      projectId,
    }),
  /** Desktop: deletes this device's copy of a workspace the account lost. */
  dropCopy: async (workspaceId: string): Promise<number> => {
    const session = await getSession();
    if (!session || !isTauri()) return 0;
    return invoke<number>("workspace_drop", { userId: session.userId, workspaceId });
  },
};
