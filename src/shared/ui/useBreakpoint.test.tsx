import { describe, it, expect } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import { liveObservers, resizeViewport, setViewportWidth } from "@test/viewport";
import { ViewportProvider } from "./ViewportProvider";
import { useBreakpoint } from "./useBreakpoint";

let renders = 0;
function Probe() {
  renders += 1;
  return <p data-testid="band">{useBreakpoint()}</p>;
}

const band = () => screen.getByTestId("band").textContent;
const root = () => document.querySelector(".viewport-root");

describe("useBreakpoint (SPEC §2, amended: app container width)", () => {
  it.each([
    [320, "mobile"],
    [639, "mobile"],
    [640, "tablet"],
    [1023, "tablet"],
    [1024, "desktop"],
    [1440, "desktop"],
  ])("%i px of container is %s from the first render", (width, expected) => {
    setViewportWidth(width);
    render(
      <ViewportProvider>
        <Probe />
      </ViewportProvider>,
    );
    expect(band()).toBe(expected);
    expect(root()).toHaveAttribute("data-viewport", expected);
  });

  it("follows the container across both edges when it is resized", () => {
    setViewportWidth(1440);
    render(
      <ViewportProvider>
        <Probe />
      </ViewportProvider>,
    );
    resizeViewport(1024);
    expect(band()).toBe("desktop");
    resizeViewport(1023);
    expect(band()).toBe("tablet");
    resizeViewport(640);
    expect(band()).toBe("tablet");
    resizeViewport(639);
    expect(band()).toBe("mobile");
    resizeViewport(1024);
    expect(band()).toBe("desktop");
  });

  it("re-renders only when the band changes", () => {
    setViewportWidth(1440);
    render(
      <ViewportProvider>
        <Probe />
      </ViewportProvider>,
    );
    const before = renders;
    resizeViewport(1300);
    resizeViewport(1100);
    resizeViewport(1024);
    expect(renders).toBe(before);
    resizeViewport(900);
    expect(renders).toBe(before + 1);
  });

  it("disconnects its observer on unmount", () => {
    setViewportWidth(800);
    const { unmount } = render(
      <ViewportProvider>
        <Probe />
      </ViewportProvider>,
    );
    expect(liveObservers()).toBe(1);
    unmount();
    expect(liveObservers()).toBe(0);
  });

  it("falls back to the window width outside a provider", () => {
    setViewportWidth(390);
    expect(renderHook(() => useBreakpoint()).result.current).toBe("mobile");
  });
});
