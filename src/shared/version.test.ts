import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { APP_VERSION } from "./version";

describe("APP_VERSION (UX-07)", () => {
  it("is the single version from the root package.json", () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  });
});
