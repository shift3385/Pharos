// API tokens (INT-02, ADR-0052): project tokens of a workspace (CI) and
// personal access tokens (the CLI). Always against the server, on the
// desktop and on the web; the desktop keeps no copy. The token itself comes
// back once, from `create` and `rotate`.

import { serverApi } from "@modules/sync-offline";

export const API_SCOPES = [
  "projects:read",
  "runs:read",
  "runs:write",
  "cases:read",
  "cycles:read",
  "defects:read",
  "requirements:read",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** What a CI job needs to report results: the default of a project token. */
export const CI_SCOPES: ApiScope[] = ["projects:read", "runs:read", "runs:write"];

/** Lifetimes the dialogs offer; the server takes at most a year. */
export const EXPIRY_DAYS = [30, 90, 180, 365] as const;
export type ExpiryDays = (typeof EXPIRY_DAYS)[number];
export const DEFAULT_EXPIRY_DAYS: ExpiryDays = 90;

export type TokenStatus = "active" | "inactive" | "expired" | "revoked";

export interface ApiToken {
  id: string;
  kind: "project" | "personal";
  name: string;
  displayPrefix: string;
  workspaceId: string | null;
  workspaceName: string | null;
  projectId: string | null;
  projectName: string | null;
  scopes: ApiScope[];
  owner: { id: string; name: string };
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  lastUsedIp?: string | null;
  status: TokenStatus;
  inactiveReason: "owner_left" | "owner_disabled" | null;
  expiringSoon: boolean;
  revokedAt: string | null;
  revokeReason: "manual" | "admin" | "rotated" | null;
}

export interface IssuedToken {
  token: string;
  view: ApiToken;
}

export interface WorkspaceProject {
  id: string;
  name: string;
}

/** The instant `days` from now, as the server takes it. */
export const expiryIn = (days: number, now = Date.now()) => new Date(now + days * 86_400_000).toISOString();

const del = (path: string, id: string) => serverApi.remove(path, id);

export const tokensApi = {
  workspace: (workspaceId: string) =>
    serverApi.get<{ tokens: ApiToken[]; projects: WorkspaceProject[] }>(`/workspaces/${workspaceId}/tokens`),
  createProject: (
    workspaceId: string,
    input: { name: string; projectId: string; scopes: ApiScope[]; expiresAt: string },
  ) => serverApi.post<IssuedToken>(`/workspaces/${workspaceId}/tokens`, input),
  revokeProject: (workspaceId: string, id: string) => del(`/workspaces/${workspaceId}/tokens/${id}`, id),
  rotateProject: (workspaceId: string, id: string, overlapHours: 0 | 24) =>
    serverApi.post<IssuedToken>(`/workspaces/${workspaceId}/tokens/${id}/rotate`, { overlapHours }),
  reassignProject: (workspaceId: string, id: string) =>
    serverApi.post<ApiToken>(`/workspaces/${workspaceId}/tokens/${id}/reassign`, {}),

  mine: async () => (await serverApi.get<{ tokens: ApiToken[] }>("/me/tokens")).tokens,
  createPersonal: (input: { name: string; workspaceId: string | null; scopes: ApiScope[]; expiresAt: string }) =>
    serverApi.post<IssuedToken>("/me/tokens", input),
  revokeMine: (id: string) => del(`/me/tokens/${id}`, id),

  ofUser: async (userId: string) => (await serverApi.get<{ tokens: ApiToken[] }>(`/admin/users/${userId}/tokens`)).tokens,
  revokeAllOf: (userId: string) => serverApi.post<{ revoked: number }>(`/admin/users/${userId}/tokens/revoke`, {}),
};

/** The server's error code of a failed request, if any. */
export const errorCode = (e: unknown): string | undefined =>
  e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : undefined;
