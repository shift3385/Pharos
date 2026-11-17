import { describe, expect, it, vi } from "vitest";
import { allowedActions, approvalOf, contentChanged, isReturned, reviewOf } from "./review";
import { diffCase, wordDiff } from "./caseDiff";
import { compareBaselines, type CaseBaseline, type CaseBaselineItem } from "./baseline";
import { otherThanAuthor } from "../review/approver";
import { CASE_REVIEW_EVENT, emitCaseReview, onCaseReview, type CaseReviewEvent } from "./events";

describe("review records (CAS-02)", () => {
  it("reads only well-formed records", () => {
    expect(reviewOf({ state: "pending", sentBy: "u" })?.state).toBe("pending");
    expect(reviewOf({ state: "other" })).toBeNull();
    expect(reviewOf(null)).toBeNull();
    expect(approvalOf({ by: "u", at: "2026-11-17T10:00:00Z" })?.selfApproved).toBe(false);
    expect(approvalOf({ by: "u" })).toBeNull();
  });

  it("a returned draft shows as returned; the actions follow the status", () => {
    expect(isReturned("draft", reviewOf({ state: "returned" }))).toBe(true);
    expect(isReturned("reviewed", reviewOf({ state: "returned" }))).toBe(false);
    expect(allowedActions("draft")).toEqual(["send", "obsolete"]);
    expect(allowedActions("reviewed")).toEqual(["approve", "return", "obsolete"]);
    expect(allowedActions("approved")).toEqual(["obsolete"]);
    expect(allowedActions("obsolete")).toEqual(["reactivate"]);
  });

  it("only the title and the content count as a change", () => {
    const prev = { title: "Pay", data: { steps: [{ id: "a", text: "x" }], custom: { f: 1 } } };
    expect(
      contentChanged(prev, {
        title: "Pay ",
        data: { steps: [{ id: "a", text: "x" }], custom: { f: 2 }, notes: "", approval: { by: "u" } },
      }),
    ).toBe(false);
    expect(contentChanged(prev, { title: "Pay", data: { steps: [{ id: "a", text: "y" }] } })).toBe(true);
  });
});

describe("who may approve (ApproverCheck)", () => {
  const req = { workspaceId: "w", projectId: "p", caseId: "c", authorId: "ana" };

  it("someone other than the author approves", async () => {
    const check = otherThanAuthor(async () => 3);
    expect(await check.canApprove({ ...req, approverId: "luis" })).toEqual({ ok: true, selfApproval: false });
    expect(await check.canApprove({ ...req, approverId: "ana" })).toEqual({ ok: false, reason: "author" });
  });

  it("alone in the workspace, the author approves and it is a self-approval", async () => {
    const check = otherThanAuthor(async () => 1);
    expect(await check.canApprove({ ...req, approverId: "ana" })).toEqual({ ok: true, selfApproval: true });
  });
});

describe("review events (contract with notifications)", () => {
  it("delivers the payload to listeners until they unsubscribe", () => {
    const listener = vi.fn();
    const off = onCaseReview(listener);
    const event: CaseReviewEvent = {
      kind: "sent",
      caseId: "c",
      scenarioId: "ATS-014",
      title: "Pay",
      projectId: "p",
      authorId: "ana",
      actorId: "ana",
      actorName: "Ana",
      at: "2026-11-17T10:00:00Z",
      version: "1.0",
      revision: 2,
    };
    emitCaseReview(event);
    off();
    emitCaseReview(event);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event);
    expect(CASE_REVIEW_EVENT).toBe("pharos:case-review");
  });
});

describe("case diff", () => {
  it("matches steps by id: changed, added, removed and moved", () => {
    const a = {
      title: "Pay",
      data: {
        steps: [
          { id: "s1", text: "open" },
          { id: "s2", text: "pay" },
          { id: "s3", text: "check" },
        ],
      },
    };
    const b = {
      title: "Pay",
      data: {
        steps: [
          { id: "s3", text: "check" },
          { id: "s1", text: "open the cart" },
          { id: "s4", text: "log out" },
        ],
      },
    };
    const kinds = diffCase(a, b).map((c) => `${c.kind}:${c.position}`);
    expect(kinds).toContain("changed:2");
    expect(kinds).toContain("added:3");
    expect(kinds).toContain("removed:2");
    expect(kinds).toContain("moved:1");
  });

  it("a step inserted in the middle does not mark the rest as moved", () => {
    const a = { title: "T", data: { steps: [{ id: "a", text: "1" }, { id: "b", text: "2" }] } };
    const b = { title: "T", data: { steps: [{ id: "a", text: "1" }, { id: "n", text: "new" }, { id: "b", text: "2" }] } };
    expect(diffCase(a, b).map((c) => c.kind)).toEqual(["added"]);
  });

  it("text fields, lists and the title", () => {
    const changes = diffCase(
      { title: "A", data: { expectedResult: "Error", requirementKeys: ["REQ-1"] } },
      { title: "B", data: { expectedResult: "Shows an error", requirementKeys: ["REQ-1", "REQ-2"], notes: "n" } },
    );
    expect(changes.map((c) => `${c.field}:${c.kind}`)).toEqual([
      "title:changed",
      "expectedResult:changed",
      "notes:added",
      "requirementKeys:added",
    ]);
  });

  it("word diff gives both texts back", () => {
    const parts = wordDiff("the payment fails", "the payment is rejected");
    expect(parts.filter((p) => p.op !== "ins").map((p) => p.text).join("")).toBe("the payment fails");
    expect(parts.filter((p) => p.op !== "del").map((p) => p.text).join("")).toBe("the payment is rejected");
  });
});

describe("baseline comparison", () => {
  const item = (caseId: string, over: Partial<CaseBaselineItem> = {}): CaseBaselineItem => ({
    caseId,
    revisionId: `${caseId}-r`,
    revision: 1,
    scenarioId: caseId.toUpperCase(),
    title: caseId,
    status: "approved",
    version: "1.0",
    priority: "medium",
    data: { steps: [{ id: "s", text: "go" }] },
    ...over,
  });
  const base = (items: CaseBaselineItem[]): CaseBaseline => ({
    id: "b",
    projectId: "p",
    name: "B",
    description: "",
    scopeLabel: "",
    approvedOnly: true,
    createdBy: "u",
    createdAt: "",
    itemCount: items.length,
    items,
  });

  it("tells added, removed, content, status and unchanged apart", () => {
    const from = base([item("a"), item("b"), item("c"), item("d")]);
    const to = base([
      item("a"),
      item("c", { revision: 3, data: { steps: [{ id: "s", text: "go now" }] } }),
      item("d", { revision: 2, status: "obsolete" }),
      item("e"),
    ]);
    const { rows, counts } = compareBaselines(from, to);
    expect(counts).toEqual({ added: 1, removed: 1, content: 1, status: 1, same: 1 });
    const c = rows.find((r) => r.caseId === "c")!;
    expect(c.changes).toEqual(["content"]);
    expect(c.fields[0]).toMatchObject({ field: "steps", kind: "changed" });
  });
});
