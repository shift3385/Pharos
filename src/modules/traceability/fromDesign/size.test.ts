import { describe, expect, it } from "vitest";
import { formatSize } from "./size";

describe("formatSize (FIX-44)", () => {
  it("writes the decimal as the language does and picks KB under 1 MB", () => {
    expect(formatSize(1536, "es")).toBe("1,5 KB");
    expect(formatSize(1536, "en")).toBe("1.5 KB");
    expect(formatSize(100 * 1024, "es")).toBe("100 KB");
    expect(formatSize(2.25 * 1024 * 1024, "es")).toBe("2,3 MB");
    expect(formatSize(512, "es")).toBe("512 B");
  });

  it("never shows «0.0 MB» for a small image", () => {
    expect(formatSize(60_000, "es")).not.toMatch(/^0[.,]0/);
  });
});
