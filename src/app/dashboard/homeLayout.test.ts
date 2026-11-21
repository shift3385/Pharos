// FIX-49: layout rules of Inicio that jsdom cannot measure, read from the
// stylesheet.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/dashboard/DashboardPage.css", "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
};

describe("Inicio layout (FIX-49)", () => {
  it("the phone's period selector sits on a surface, not on the photo", () => {
    expect(rule("\n.home-period-row")).toMatch(
      /background:\s*var\(--color-surface-1\)/,
    );
  });

  it("«Tasa de éxito» with its note lights up as one card, never a shadowed card inside another", () => {
    expect(
      rule(
        "  .home-kpi-stack > a.home-kpi:has(~ .home-kpi__extra:not(.home-kpi__extra--badge)):hover",
      ),
    ).toMatch(/box-shadow:\s*none/);
    expect(css).toMatch(/@media \(hover: hover\) \{\s*a\.home-kpi:hover/);
  });
});
