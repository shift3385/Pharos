import type { Pool } from "pg";
import type { ApprovalRequest, ApprovalVerdict, ApproverCheck } from "../domain/case-review";
import { membership, type Membership } from "./members";
import { can } from "./roles";

// Who may approve a test case or a test plan (CAS-02, PLN-08; ADR-0042 §8).
// The interface is track K's (`case-review.ts`); `app.ts` installs this
// check with `setApproverCheck`. The check itself only asks for an active
// membership; what else is required is its `rule`, replaceable, plus any
// extra `policies`. The default rule is the one the user approved on
// 2026-11-17 (a Test Manager or Test Analyst who is not the author); PLN-08
// installs `independentApproval(pool)` instead, under which, when off, the
// author may approve their own work as a self-approval.

/** One rule of the check: a refusal, or null to let the next rule decide.
 *  It sees the request and the approver's membership. */
export type ApprovalPolicy = (req: ApprovalRequest, approver: Membership) => Promise<ApprovalVerdict | null>;

/** The approver needs the capability of what is approved: `case.approve`
 *  for a case, `plan.approve` for a plan (`subject`, «case» when absent). */
export const requiresApproverRole: ApprovalPolicy = async (req, m) =>
  can(m.role, req.subject === "plan" ? "plan.approve" : "case.approve") ? null : { ok: false, reason: "role" };

/** The author never approves their own work. */
export const authorNeverApproves: ApprovalPolicy = async (req) =>
  req.approverId === req.authorId ? { ok: false, reason: "author" } : null;

/** The default rule, approved by the user (2026-11-17): the role of what is
 *  approved first, then never the author. */
export const roleAndNotAuthor: ApprovalPolicy = async (req, m) =>
  (await requiresApproverRole(req, m)) ?? (await authorNeverApproves(req, m));

/** The workspace check:
 *  1. not an active member of the workspace: `notMember`;
 *  2. a personal workspace has one member, who may approve their own work
 *     (otherwise nobody ever could): no policy applies;
 *  3. the `rule` (`roleAndNotAuthor` by default; PLN-08 replaces it),
 *     then each extra `policies` entry in order; the first refusal wins;
 *  4. approved, a self-approval when the approver is the author. */
export function workspaceApproverCheck(
  pool: Pool,
  opts: { rule?: ApprovalPolicy; policies?: readonly ApprovalPolicy[] } = {},
): ApproverCheck {
  const policies = [opts.rule ?? roleAndNotAuthor, ...(opts.policies ?? [])];
  return {
    async canApprove(req) {
      const m = await membership(pool, req.approverId, req.workspaceId);
      if (!m) return { ok: false, reason: "notMember" };
      if (m.kind !== "personal") {
        for (const policy of policies) {
          const verdict = await policy(req, m);
          if (verdict && !verdict.ok) return verdict;
        }
      }
      return { ok: true, selfApproval: req.approverId === req.authorId };
    },
  };
}

export type { ApprovalRequest, ApprovalVerdict, ApproverCheck };
