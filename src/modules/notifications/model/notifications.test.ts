// RED-W2: the panel's day groups, the badge, each kind's direct action, and
// K's review events turned into notifications (agreed contract).
import { describe, expect, it } from "vitest";
import { badgeText, groupByDay, targetOf, unreadCount } from "./group";
import { notificationOfReview, reviewEventOf, type CaseReviewEvent } from "./caseReview";
import type { AppNotification } from "./types";

const n = (id: string, createdAt: string, patch: Partial<AppNotification> = {}): AppNotification => ({
  id,
  origin: "server",
  kind: "defect.assigned",
  actorId: "ana",
  actorName: "Ana",
  workspaceId: null,
  projectId: "p1",
  subject: { entity: "defect", id: "d1", key: "BM-DEF-031", title: "Saldo" },
  data: {},
  createdAt,
  readAt: null,
  ...patch,
});

describe("groupByDay", () => {
  it("puts today, yesterday and older days apart, newest first", () => {
    const now = new Date(2026, 10, 17, 12, 0);
    const at = (d: number, h: number) => new Date(2026, 10, d, h, 0).toISOString();
    const groups = groupByDay([n("a", at(15, 9)), n("b", at(17, 8)), n("c", at(16, 20)), n("d", at(17, 11))], now);
    expect(groups.map((g) => g.id)).toEqual(["today", "yesterday", "2026-11-15"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["d", "b"]);
  });
});

describe("badge", () => {
  it("counts unread up to 9, then 9+", () => {
    expect(badgeText(0)).toBe("");
    expect(badgeText(4)).toBe("4");
    expect(badgeText(12)).toBe("9+");
    expect(unreadCount([n("a", "2026-01-01T00:00:00Z"), n("b", "2026-01-01T00:00:00Z", { readAt: "x" })])).toBe(1);
  });
});

describe("targetOf", () => {
  it("sends each kind to its place", () => {
    expect(targetOf(n("a", "x"))).toMatchObject({ kind: "path", path: "/projects/p1/defects?defect=d1" });
    expect(targetOf(n("a", "x", { kind: "case.review_requested", subject: { entity: "test_case", id: "c 1", title: "t" } })))
      .toMatchObject({ path: "/projects/p1/cases?case=c%201", label: "notifications.action.review" });
    expect(targetOf(n("a", "x", { kind: "cycle.closed" }))).toMatchObject({ path: "/projects/p1/cycles?cycle=d1" });
    expect(targetOf(n("a", "x", { kind: "sync.conflict", projectId: null }))).toEqual({
      kind: "conflicts",
      label: "notifications.action.resolve",
    });
  });

  it("takes an app path from data, never another site", () => {
    expect(targetOf(n("a", "x", { data: { path: "/admin?tab=workspaces" } }))).toMatchObject({ path: "/admin?tab=workspaces" });
    expect(targetOf(n("a", "x", { data: { path: "//evil.example" } }))).toMatchObject({ path: "/projects/p1/defects?defect=d1" });
    expect(targetOf(n("a", "x", { projectId: null }))).toBeNull();
  });
});

describe("case review events (K)", () => {
  const event = (patch: Partial<CaseReviewEvent> = {}): CaseReviewEvent => ({
    kind: "sent",
    caseId: "c1",
    scenarioId: "BM-CP-0142",
    title: "Token caducado",
    projectId: "p1",
    authorId: "carlos",
    actorId: "carlos",
    actorName: "Carlos",
    at: "2026-11-17T10:00:00Z",
    version: "1.0",
    revision: 7,
    workspaceId: "ws-1",
    ...patch,
  });

  it("a case sent to review goes to the workspace, keyed by revision", () => {
    expect(notificationOfReview(event())).toMatchObject({
      kind: "case.review_requested",
      to: { workspace: true },
      projectId: "p1",
      workspaceId: "ws-1",
      subject: { entity: "test_case", id: "c1", key: "BM-CP-0142", title: "Token caducado" },
      dedupeKey: "c1:7:case.review_requested",
    });
  });

  it("approved and returned go to the author, not when the author acts or self-approves", () => {
    expect(notificationOfReview(event({ kind: "approved", actorId: "marta" }))).toMatchObject({
      kind: "case.approved",
      to: { userIds: ["carlos"] },
    });
    expect(notificationOfReview(event({ kind: "returned", actorId: "marta", comment: "Falta el paso 3" }))).toMatchObject({
      kind: "case.changes_requested",
      data: { comment: "Falta el paso 3" },
    });
    expect(notificationOfReview(event({ kind: "approved" }))).toBeNull();
    expect(notificationOfReview(event({ kind: "approved", actorId: "marta", selfApproval: true }))).toBeNull();
  });

  it("sent, returned and sent again are two different events", () => {
    const first = notificationOfReview(event({ revision: 7 }));
    const again = notificationOfReview(event({ revision: 9 }));
    expect(first?.dedupeKey).not.toBe(again?.dedupeKey);
  });

  it("reads the event from window, ignoring anything else", () => {
    expect(reviewEventOf(new CustomEvent("pharos:case-review", { detail: event() }))?.caseId).toBe("c1");
    expect(reviewEventOf(new CustomEvent("pharos:case-review", { detail: { caseId: 1 } }))).toBeNull();
  });
});

describe("W's kinds", () => {
  it("member.joined opens where W says; member.removed has no action", () => {
    expect(targetOf(n("a", "x", { kind: "member.joined", data: { path: "/workspaces/ws-1" } }))).toMatchObject({
      path: "/workspaces/ws-1",
      label: "notifications.action.members",
    });
    expect(targetOf(n("a", "x", { kind: "member.removed", projectId: null }))).toBeNull();
  });
});
