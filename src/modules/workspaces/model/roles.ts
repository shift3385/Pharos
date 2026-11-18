// Workspace roles and what each may do (SYNC-07, ADR-0042 §1). The matrix is
// the one the server and the desktop core use
// (`src/shared/contracts/workspace-roles.json`); the UI reads it to disable
// what the role does not allow and to say why. The server is the authority.

import matrix from "@shared/contracts/workspace-roles.json";

export type WorkspaceRole =
  | "test_manager"
  | "test_analyst"
  | "automation_engineer"
  | "product_owner"
  | "viewer";

export type Capability = keyof typeof matrix.capabilities;

export const WORKSPACE_ROLES = matrix.roles as WorkspaceRole[];

/** True if `role` has the capability. No role (no workspaces on this server,
 *  or the device's own workspace) means the account owns its data. */
export function can(role: WorkspaceRole | null | undefined, cap: Capability): boolean {
  if (!role) return true;
  return (matrix.capabilities[cap] as readonly string[]).includes(role);
}

/** Roles in the order the screens list them. */
export const ROLE_ORDER: readonly WorkspaceRole[] = WORKSPACE_ROLES;
