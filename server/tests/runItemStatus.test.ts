import { describe, expect, it } from "vitest";
import { itemStatus } from "../src/modules/domain/runs";

// A run item's status, twin of `runs::manual::item_status` (FIX-49): PH-005
// read «Pasa» on the run screen with row 3 of 3 still a draft.

describe("run item status", () => {
  it("passes only when every target has a result", () => {
    expect(itemStatus(["passed", "passed"], 2)).toBe("passed");
    expect(itemStatus(["passed", "passed"], 3)).toBe("not_run");
    expect(itemStatus(["skipped"], 3)).toBe("not_run");
    expect(itemStatus([], 3)).toBe("not_run");
  });

  it("a failure or a block decides the case before the other rows run", () => {
    expect(itemStatus(["passed", "failed"], 3)).toBe("failed");
    expect(itemStatus(["blocked"], 3)).toBe("blocked");
  });
});
