import { describe, expect, it } from "vitest";
import { approvalVerdict, type ApprovalWorkspace } from "./approval";

// Who may approve, as the screens ask it (CAS-02, PLN-08, ADR-0049): the
// same answers as the cores (`approval.ts`, `WorkspaceApprover`).

const ask = (workspaceId: string, subject: "case" | "plan", approverId = "ana", authorId = "luis") => ({
  subject,
  workspaceId,
  projectId: "p",
  caseId: "x",
  authorId,
  approverId,
});

const shared = (role: ApprovalWorkspace["role"], independentApproval?: boolean): ApprovalWorkspace => ({
  id: "team",
  kind: "shared",
  role,
  independentApproval,
});

describe("approvalVerdict (PLN-08)", () => {
  it("a personal workspace or one this device does not list: allowed, marked when it is the author", () => {
    const personal: ApprovalWorkspace = { id: "me", kind: "personal", role: "test_manager", independentApproval: false };
    expect(approvalVerdict([personal], ask("me", "plan", "ana", "ana"))).toEqual({ ok: true, selfApproval: true });
    expect(approvalVerdict([], ask("local", "case", "ana", "ana"))).toEqual({ ok: true, selfApproval: true });
    expect(approvalVerdict([], ask("local", "case"))).toEqual({ ok: true, selfApproval: false });
  });

  it("on: the approval role of the subject, never the author", () => {
    expect(approvalVerdict([shared("test_manager", true)], ask("team", "plan"))).toEqual({ ok: true, selfApproval: false });
    expect(approvalVerdict([shared("test_manager", true)], ask("team", "plan", "ana", "ana"))).toEqual({
      ok: false,
      reason: "author",
    });
    expect(approvalVerdict([shared("test_analyst", true)], ask("team", "plan"))).toEqual({ ok: false, reason: "role" });
    expect(approvalVerdict([shared("test_analyst", true)], ask("team", "case"))).toEqual({ ok: true, selfApproval: false });
  });

  it("off (or unknown, from an older server): whoever may edit, the author too", () => {
    expect(approvalVerdict([shared("test_analyst", false)], ask("team", "plan", "ana", "ana"))).toEqual({
      ok: true,
      selfApproval: true,
    });
    expect(approvalVerdict([shared("automation_engineer")], ask("team", "case"))).toEqual({ ok: true, selfApproval: false });
    expect(approvalVerdict([shared("automation_engineer")], ask("team", "plan"))).toEqual({ ok: false, reason: "role" });
    expect(approvalVerdict([shared("viewer", false)], ask("team", "case"))).toEqual({ ok: false, reason: "role" });
  });
});
