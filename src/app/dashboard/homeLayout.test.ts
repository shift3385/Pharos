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

  it("the period menu fits «Rango personalizado…» and a whole «Próximamente» chip (FIX-51)", () => {
    // Regression of FIX-49: the chip sat inside the ellipsised text of a
    // 270 px menu («Rango personalizado……», «Próximam»).
    const width = Number(/width:\s*(\d+)px/.exec(rule("\n.home-period.menu"))?.[1]);
    expect(width).toBeGreaterThanOrEqual(300);
    const popover = readFileSync("src/shared/ui/popover.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const soon = popover.slice(popover.indexOf(".menu__soon {"), popover.indexOf("}", popover.indexOf(".menu__soon {")));
    expect(soon).toMatch(/flex:\s*none/);
    expect(soon).toMatch(/white-space:\s*nowrap/);
  });

  it("«Tasa de éxito» with its note lights up as one card, never a shadowed card inside another", () => {
    expect(
      rule(
        "  .home-kpi-stack > a.home-kpi:has(~ .home-kpi__extra:not(.home-kpi__extra--badge)):hover",
      ),
    ).toMatch(/box-shadow:\s*none/);
    expect(css).toMatch(/@media \(hover: hover\) \{\s*a\.home-kpi:hover/);
  });

  it("with «Sombra en las tarjetas» the shadow is the stack's, not the inner card's (FIX-51)", () => {
    expect(
      rule("\n.home-kpi-stack > .home-kpi:has(~ .home-kpi__extra:not(.home-kpi__extra--badge))"),
    ).toMatch(/box-shadow:\s*none/);
    const shadow = readFileSync("src/shared/theme/cardShadow.css", "utf8");
    expect(shadow).toContain(".home-kpi-stack:has(> .home-kpi__extra:not(.home-kpi__extra--badge))");
  });
});
