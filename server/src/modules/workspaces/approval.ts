import type { Pool } from "pg";
import type { ApprovalRequest, ApprovalVerdict, ApproverCheck } from "../domain/case-review";
import { membership, type Membership } from "./members";
import { can } from "./roles";

// Who may approve a test case (CAS-02, ADR-0042 §8). The interface is track
// K's (`case-review.ts`); `app.ts` installs this rule with
// `setApproverCheck`, the one the user approved on 2026-11-17.

/** An extra rule over the role check: a workspace policy (PLN-08,
 *  «Aprobación independiente», will add one). It sees the request and the
 *  approver's membership and returns a refusal, or null to let the role
 *  check's verdict stand. */
export type ApprovalPolicy = (req: ApprovalRequest, approver: Membership) => Promise<ApprovalVerdict | null>;

/** The workspace rule:
 *  1. not an active member: `notMember`;
 *  2. a personal workspace has one member, who may approve their own cases
 *     (`selfApproval`), or nobody ever could (K's default there);
 *  3. a role without `case.approve` (only Test Manager and Test Analyst
 *     have it): `role`;
 *  4. the author: `author`;
 *  5. then each `policies` entry in order, the first refusal wins;
 *  6. anyone else: approved. */
export function workspaceApproverCheck(pool: Pool, opts: { policies?: ApprovalPolicy[] } = {}): ApproverCheck {
  return {
    async canApprove(req) {
      const m = await membership(pool, req.approverId, req.workspaceId);
      if (!m) return { ok: false, reason: "notMember" };
      if (m.kind === "personal") return { ok: true, selfApproval: req.approverId === req.authorId };
      if (!can(m.role, "case.approve")) return { ok: false, reason: "role" };
      if (req.approverId === req.authorId) return { ok: false, reason: "author" };
      for (const policy of opts.policies ?? []) {
        const verdict = await policy(req, m);
        if (verdict && !verdict.ok) return verdict;
      }
      return { ok: true, selfApproval: false };
    },
  };
}

export type { ApprovalRequest, ApprovalVerdict, ApproverCheck };
