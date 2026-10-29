import { describe, expect, it } from "vitest";
import { decide, isNewer } from "../src/modules/sync/sync.merge";
import { deltaSchema } from "../src/modules/sync/sync.schemas";

// Pure merge rule — no database needed.
const H = (wall: number, counter: number, device: string) =>
  `${String(wall).padStart(15, "0")}-${String(counter).padStart(5, "0")}-${device}`;

const delta = (over: Record<string, unknown>) =>
  deltaSchema.parse({ entity: "test_case", entityId: "c1", op: "upsert", payload: {}, ...over });

describe("sync merge rule", () => {
  it("writes when the server has nothing yet", () => {
    expect(decide(null, delta({ revision: 1, hlc: H(1, 0, "a") }))).toBe("write");
  });

  it("fast-forwards when the server still holds the delta's base", () => {
    const current = { revision: 3, hlc: H(100, 0, "web") };
    expect(decide(current, delta({ revision: 4, hlc: H(200, 0, "desk"), baseRevision: 3, baseHlc: H(100, 0, "web") }))).toBe("write");
  });

  it("is a conflict when the server moved past the base", () => {
    // Base 3 on both sides; the web already pushed its own revision 4.
    const current = { revision: 4, hlc: H(150, 0, "web") };
    expect(decide(current, delta({ revision: 4, hlc: H(200, 0, "desk"), baseRevision: 3, baseHlc: "" }))).toBe("conflict");
    // Same revision number but a different HLC is still a different version.
    expect(decide({ revision: 3, hlc: H(150, 0, "web") }, delta({ revision: 4, hlc: H(200, 0, "desk"), baseRevision: 3, baseHlc: H(100, 0, "web") }))).toBe("conflict");
  });

  it("treats a retried push (same HLC) as already applied", () => {
    const current = { revision: 4, hlc: H(200, 0, "desk") };
    expect(decide(current, delta({ revision: 4, hlc: H(200, 0, "desk"), baseRevision: 3 }))).toBe("noop");
  });

  it("without a base, resolves by HLC — deterministic whatever the wall clocks say", () => {
    // Device "b" has a slow clock but saw a's change (higher counter on the same wall ms).
    const fromA = { revision: 2, hlc: H(5_000, 0, "a") };
    const fromB = delta({ revision: 2, hlc: H(5_000, 1, "b") });
    expect(decide(fromA, fromB)).toBe("write");
    // Exact tie on wall + counter: the device id decides, the same on every server run.
    expect(isNewer({ revision: 1, hlc: H(5_000, 0, "b") }, { revision: 1, hlc: H(5_000, 0, "a") })).toBe(true);
    expect(isNewer({ revision: 1, hlc: H(5_000, 0, "a") }, { revision: 1, hlc: H(5_000, 0, "b") })).toBe(false);
  });

  it("keeps the Phase 8B rule between legacy changes without HLC", () => {
    expect(decide({ revision: 2, hlc: "" }, delta({ revision: 1 }))).toBe("conflict");
    expect(decide({ revision: 2, hlc: "" }, delta({ revision: 2 }))).toBe("write");
    // A change with an HLC beats a legacy stored version.
    expect(decide({ revision: 9, hlc: "" }, delta({ revision: 1, hlc: H(1, 0, "a") }))).toBe("write");
  });

  it("deleting what is already deleted (project cascade) is not a conflict", () => {
    const cascaded = { revision: 2, hlc: H(300, 0, "desk"), deleted: true };
    const stale = { op: "delete", revision: 2, hlc: H(200, 0, "desk"), baseRevision: 1, baseHlc: H(100, 0, "desk") };
    expect(decide(cascaded, delta(stale))).toBe("noop");
    // An edit of a deleted entity is still a conflict for the user.
    expect(decide(cascaded, delta({ ...stale, op: "upsert" }))).toBe("conflict");
  });
});
