// Who may approve a case (CAS-02, ADR-0047). The cores decide
// (`case_review.rs`, `server/src/modules/domain/case-review.ts`, with the same
// interface); the screen asks this check to show the «Aprobar» button
// enabled or to say why not. Until the roles of 0.5.0 (TEN-01) the check is
// «someone other than the author»; alone in the workspace the author may
// approve, recorded as a self-approval. The workspaces track installs its
// role check (Test Manager or Test Analyst, not the author) with
// `setApproverCheck`, here and in both cores.

export interface ApprovalRequest {
  workspaceId: string;
  projectId: string;
  caseId: string;
  /** The account that created the case. */
  authorId: string;
  /** The account that would approve it. */
  approverId: string;
}

export type ApprovalVerdict =
  | { ok: true; selfApproval: boolean }
  | { ok: false; reason: "author" | "role" | "notMember" };

export interface ApproverCheck {
  canApprove(req: ApprovalRequest): Promise<ApprovalVerdict>;
}

/** Someone other than the author; alone in the workspace, the author. */
export function otherThanAuthor(memberCount: (workspaceId: string) => Promise<number>): ApproverCheck {
  return {
    async canApprove(req) {
      if (req.approverId !== req.authorId) return { ok: true, selfApproval: false };
      return (await memberCount(req.workspaceId)) <= 1
        ? { ok: true, selfApproval: true }
        : { ok: false, reason: "author" };
    },
  };
}

/** Until workspaces have members (TEN-01), each has one person. */
const singleMember = async () => 1;

let installed: ApproverCheck = otherThanAuthor(singleMember);

/** Installs the approver check (the workspaces track, at startup). */
export function setApproverCheck(check: ApproverCheck): void {
  installed = check;
}

/** The installed check. */
export const approverCheck = (): ApproverCheck => installed;
