import { describe, expect, it } from "vitest";
import { instantOf } from "./types";

describe("instantOf", () => {
  it("reads every stored time as the desktop does, a zone-less one as UTC", () => {
    const utc = "2026-10-27T03:52:07.000Z";
    expect(instantOf("2026-10-27T03:52:07Z")?.toISOString()).toBe(utc);
    expect(instantOf("2026-10-27 03:52:07")?.toISOString()).toBe(utc);
    expect(instantOf("2026-10-27T03:52:07")?.toISOString()).toBe(utc);
    expect(instantOf("2026-10-27T05:52:07+02:00")?.toISOString()).toBe(utc);
    expect(instantOf("not a time")).toBeUndefined();
  });
});
