import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { setViewportWidth } from "@test/viewport";
import { useBreakpoint } from "./useBreakpoint";

describe("useBreakpoint (SPEC §2)", () => {
  it.each([
    [320, "mobile"],
    [599, "mobile"],
    [600, "tablet"],
    [1279, "tablet"],
    [1280, "desktop"],
    [1440, "desktop"],
  ])("%i px is %s", (width, expected) => {
    setViewportWidth(width);
    expect(renderHook(() => useBreakpoint()).result.current).toBe(expected);
  });

  it("is the desktop without matchMedia", () => {
    expect(renderHook(() => useBreakpoint()).result.current).toBe("desktop");
  });
});
