import { describe, expect, it } from "vitest";
import { columnOf, dropTargets, isOpenDefect, needsResolution, transitionAllowed } from "./lifecycle";
import { DEFECT_STATUSES } from "./types";
import raw from "../../../../src-tauri/tests/fixtures/defect-vectors.json";

// The same table as the desktop's `lifecycle.rs` and the server's
// `defects.ts` (DEF-01, ADR-0016).

const vectors = raw as { transitions: Record<string, string[]> };

describe("defect lifecycle", () => {
  it("allows exactly the transitions of the shared vectors", () => {
    for (const from of DEFECT_STATUSES)
      for (const to of DEFECT_STATUSES)
        expect(transitionAllowed(from, to), `${from} → ${to}`).toBe(
          from === to || vectors.transitions[from].includes(to),
        );
  });

  it("asks for a resolution only on closed and rejected; deferred is still open", () => {
    expect(DEFECT_STATUSES.filter(needsResolution)).toEqual(["closed", "rejected"]);
    expect(DEFECT_STATUSES.filter((s) => !isOpenDefect(s))).toEqual(["closed", "rejected"]);
  });

  it("maps a board drop to the statuses it may mean", () => {
    expect(columnOf("deferred")).toBe("other");
    expect(dropTargets("new", "other")).toEqual(["rejected", "deferred"]);
    expect(dropTargets("in_progress", "other")).toEqual([]);
    expect(dropTargets("retest", "closed")).toEqual(["closed"]);
    expect(dropTargets("new", "fixed")).toEqual([]);
    expect(dropTargets("deferred", "open")).toEqual(["open"]);
  });
});
