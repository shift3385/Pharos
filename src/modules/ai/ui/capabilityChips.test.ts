import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The capability chips of Motor de IA are StatusPills: tone text on a 14 % tint
// of the tone. On surface-2 that fell below 4.5:1 in the light theme (axe
// `color-contrast` on the desktop E2E, PR #26), so their panel sits on
// surface-1. jsdom's axe has contrast off, so this checks the ratio itself.

const here = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(here, "../../../shared/theme/tokens.css"), "utf8");
const aiCss = readFileSync(join(here, "Ai.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = tokens.indexOf(`${selector} {`);
  const body = tokens.slice(start, tokens.indexOf("\n}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) vars[m[1]] = m[2];
  return vars;
}

const light = block(":root");
const themes = { light, dark: { ...light, ...block('[data-theme="dark"]') } };

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `color-mix(tone 14%, transparent)` painted over `base`. */
function tint(tone: string, base: string, amount = 0.14): string {
  const t = channels(tone);
  const b = channels(base);
  return `#${t.map((c, i) => Math.round(c * amount + b[i] * (1 - amount)).toString(16).padStart(2, "0")).join("")}`;
}

/** The two chip tones: ✓ success (pills.css) and ✗/locked neutral, which
 *  Ai.css gives primary text. */
const CHIPS = [
  { tone: "color-success", text: "color-success-text" },
  { tone: "color-text-muted", text: "color-text-primary" },
];

const panelBackground = aiCss.match(/\.ai-params \{[^}]*?background: var\(--([\w-]+)\)/)?.[1];

describe("Motor de IA capability chips (WCAG 1.4.3)", () => {
  it("their panel sits on surface-1", () => {
    expect(panelBackground).toBe("color-surface-1");
  });

  for (const [name, vars] of Object.entries(themes)) {
    it(`reach 4.5:1 on their panel (${name})`, () => {
      const base = vars[panelBackground ?? ""];
      for (const { tone, text } of CHIPS)
        expect(contrast(vars[text], tint(vars[tone], base))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("would fail on surface-2 in the light theme (the E2E finding)", () => {
    const { tone, text } = CHIPS[0];
    expect(contrast(light[text], tint(light[tone], light["color-surface-2"]))).toBeLessThan(4.5);
  });
});
