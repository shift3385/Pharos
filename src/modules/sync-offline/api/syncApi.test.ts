import { describe, expect, it } from "vitest";
import { syncStatus } from "./syncApi";

describe("syncStatus", () => {
  it("is offline whenever there is no connection, regardless of pending", () => {
    expect(syncStatus(false, 0)).toBe("offline");
    expect(syncStatus(false, 5)).toBe("offline");
  });
  it("is pending when online with unsynced changes", () => {
    expect(syncStatus(true, 3)).toBe("pending");
  });
  it("is synced when online with nothing pending", () => {
    expect(syncStatus(true, 0)).toBe("synced");
  });
});
