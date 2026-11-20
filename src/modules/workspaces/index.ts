// Workspaces with roles (SYNC-07, ADR-0042): the selector, the members and
// invitations screens, sharing a project, and the role the screens read.
export const WORKSPACES_MODULE = "workspaces" as const;
export { WorkspaceProvider } from "./ui/WorkspaceProvider";
export { useWorkspace, useWorkspaceRole } from "./ui/workspaceContext";
export { WorkspaceSwitcher } from "./ui/WorkspaceSwitcher";
export { useWorkspaceMenu } from "./ui/useWorkspaceMenu";
export { WorkspaceNotices } from "./ui/WorkspaceNotices";
export { WorkspaceMembersPage } from "./ui/WorkspaceMembersPage";
export { JoinWorkspacePage } from "./ui/JoinWorkspacePage";
export { ShareProjectDialog } from "./ui/ShareProjectDialog";
export { can, type Capability, type WorkspaceRole } from "./model/roles";
export { projectWorkspaces, type Workspace } from "./api/workspacesApi";
// Who may approve (CAS-02, PLN-08): the shell installs it in test-cases.
export { approvalVerdict, workspaceApprover } from "./model/approval";
