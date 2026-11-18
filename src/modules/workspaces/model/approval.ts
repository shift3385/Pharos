// Who may approve a case or a plan, as the screens ask it (CAS-02, PLN-08,
// ADR-0049): the rule of the cores (`approval.ts` on the server,
// `WorkspaceApprover` on the desktop) over the workspaces this account sees.
// The screens use it to enable «Aprobar» or say why not; the core decides.
// The shapes repeat the test-cases module's `ApproverCheck` (it is installed
// there with `setApproverCheck`) so this module does not import it.

import { can } from "./roles";

export interface ApprovalAsk {
  subject?: "case" | "plan";
  workspaceId: string;
  projectId: string;
  caseId: string;
  authorId: string;
  approverId: string;
}

export type ApprovalAnswer = { ok: true; selfApproval: boolean } | { ok: false; reason: "author" | "role" | "notMember" };

/** The workspaces as `useWorkspace` lists them (the account's role in each). */
export interface ApprovalWorkspace {
  id: string;
  kind: "personal" | "shared";
  role: Parameters<typeof can>[0];
  /** «Aprobación independiente»; a server older than PLN-08 leaves it out. */
  independentApproval?: boolean;
}

/** The verdict for the signed-in account (`approverId`) in its workspaces.
 *  - A workspace this device does not list (the desktop's own, or no
 *    workspaces on this server): allowed, a self-approval if it is the
 *    author's; the core has the last word.
 *  - Personal: allowed (alone there).
 *  - Shared, policy on: the approval role of the subject, never the author.
 *  - Shared, policy off: whoever may edit it, the author included. */
export function approvalVerdict(workspaces: readonly ApprovalWorkspace[], req: ApprovalAsk): ApprovalAnswer {
  const selfApproval = req.approverId === req.authorId;
  const w = workspaces.find((x) => x.id === req.workspaceId);
  if (!w || w.kind === "personal") return { ok: true, selfApproval };
  const plan = req.subject === "plan";
  if (!w.independentApproval) {
    return can(w.role, plan ? "plan.edit" : "case.edit") ? { ok: true, selfApproval } : { ok: false, reason: "role" };
  }
  if (!can(w.role, plan ? "plan.approve" : "case.approve")) return { ok: false, reason: "role" };
  if (selfApproval) return { ok: false, reason: "author" };
  return { ok: true, selfApproval: false };
}

/** An approver check over a list of workspaces (`canApprove` of K's
 *  interface), for `setApproverCheck`. */
export const workspaceApprover = (workspaces: readonly ApprovalWorkspace[]) => ({
  canApprove: async (req: ApprovalAsk): Promise<ApprovalAnswer> => approvalVerdict(workspaces, req),
});
