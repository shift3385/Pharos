import { describe, it, expect } from "vitest";
import { parseStamp } from "./stamp";

describe("parseStamp", () => {
  it("reads a stored timestamp without a zone as UTC", () => {
    expect(parseStamp("2026-10-30 18:02:00").toISOString()).toBe("2026-10-30T18:02:00.000Z");
    expect(parseStamp("2026-10-30T18:02:00").toISOString()).toBe("2026-10-30T18:02:00.000Z");
  });

  it("keeps a timestamp that has its own zone", () => {
    expect(parseStamp("2026-10-30T18:02:00.000Z").toISOString()).toBe("2026-10-30T18:02:00.000Z");
    expect(parseStamp("2026-10-30T13:02:00-05:00").toISOString()).toBe("2026-10-30T18:02:00.000Z");
  });
});
