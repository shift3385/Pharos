import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// WCAG 2.1 AA guard for the Faro Nocturno tokens (UX-05): every text/background
// pair the UI uses must reach 4.5:1, and focus indicators and state borders
// 3:1 (1.4.11). It reads tokens.css itself, so a token edit that breaks AA in
// either theme fails here instead of in an audit.

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "tokens.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) vars[m[1]] = m[2];
  return vars;
}

const light = block(":root");
const themes = { light, dark: { ...light, ...block('[data-theme="dark"]') } };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ["color-bg-page", "color-surface-1", "color-surface-2"];
const TEXT = [
  "color-text-primary",
  "color-text-secondary",
  "color-text-muted",
  "color-navy-500",
  "color-success-text",
  "color-error-text",
  "color-warning-text",
  "color-info-text",
];

/** [foreground, background, minimum ratio] pairs that are not text-on-surface. */
const EXTRA: [string, string, number][] = [
  ["color-accent-contrast", "color-accent", 4.5], // primary action
  ["color-on-navy", "color-navy-900", 4.5], // sidebar
  ["color-on-navy-muted", "color-navy-900", 4.5],
  ["color-navy-500", "color-navy-100", 4.5], // soft badges
  ["color-surface-1", "color-error-text", 4.5], // danger buttons
  ["color-focus-on-navy", "color-navy-900", 3],
  ["color-success", "color-surface-1", 3], // state borders
  ["color-error", "color-surface-1", 3],
  ["color-warning", "color-surface-1", 3],
];

describe.each(Object.entries(themes))("Faro Nocturno %s contrast", (_name, t) => {
  it.each(TEXT.flatMap((fg) => SURFACES.map((bg) => [fg, bg] as const)))(
    "%s on %s reaches 4.5:1",
    (fg, bg) => {
      expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(SURFACES)("focus ring on %s reaches 3:1", (bg) => {
    expect(contrast(t["color-focus"], t[bg])).toBeGreaterThanOrEqual(3);
  });

  it.each(EXTRA)("%s on %s reaches %d:1", (fg, bg, min) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
});
