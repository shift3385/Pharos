import type { Pool } from "pg";
import { membership } from "./members";
import { can } from "./roles";

// Who may approve a test case (CAS-02, ADR-0042 §8). The interface is
// track K's: K defines `ApproverCheck` and `setApproverCheck`, with
// `otherThanAuthor` as its default until workspaces exist. This is the rule
// the user approved (2026-11-17), which W registers with `setApproverCheck`
// once K's module is in `main`. The types repeat K's shape so both can land
// in either order.

export interface ApprovalRequest {
  workspaceId: string;
  projectId: string;
  caseId: string;
  authorId: string;
  approverId: string;
}

export type ApprovalVerdict =
  | { ok: true; selfApproval: boolean }
  | { ok: false; reason: "author" | "role" | "notMember" };

export interface ApproverCheck {
  canApprove(req: ApprovalRequest): Promise<ApprovalVerdict>;
}

/** The workspace rule:
 *  1. not an active member: `notMember`;
 *  2. a personal workspace has one member, who may approve their own cases
 *     (`selfApproval`), or nobody ever could (K's default there);
 *  3. a role without `case.approve` (only Test Manager and Test Analyst
 *     have it): `role`;
 *  4. the author: `author`;
 *  5. anyone else: approved. */
export function workspaceApproverCheck(pool: Pool): ApproverCheck {
  return {
    async canApprove(req) {
      const m = await membership(pool, req.approverId, req.workspaceId);
      if (!m) return { ok: false, reason: "notMember" };
      if (m.kind === "personal") return { ok: true, selfApproval: req.approverId === req.authorId };
      if (!can(m.role, "case.approve")) return { ok: false, reason: "role" };
      if (req.approverId === req.authorId) return { ok: false, reason: "author" };
      return { ok: true, selfApproval: false };
    },
  };
}
