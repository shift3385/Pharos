import { vi } from "vitest";

/** Makes `matchMedia` answer as if the window were `width` px wide, for the
 *  breakpoint queries of `useBreakpoint` (min-width / max-width only; other
 *  queries such as prefers-color-scheme do not match). Call it before
 *  rendering; `vi.unstubAllGlobals()` (setupTests) restores it. */
export function setViewportWidth(width: number) {
  const matches = (query: string) => {
    const limits = [...query.matchAll(/\((min|max)-width:\s*([\d.]+)px\)/g)];
    return (
      limits.length > 0 &&
      limits.every(([, kind, px]) => (kind === "min" ? width >= Number(px) : width <= Number(px)))
    );
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}
