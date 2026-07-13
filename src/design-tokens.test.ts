import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Guard for the token architecture (spec §12.1): no component or stylesheet may
// hardcode a color value. Only tokens.css declares raw colors; everything else
// consumes them via var(--token). This keeps future themes swappable.

const srcDir = dirname(fileURLToPath(import.meta.url));
const ALLOWLIST = [join("shared", "theme", "tokens.css")];

const COLOR_PATTERNS = [/#[0-9a-fA-F]{3,8}\b/, /\brgba?\(/, /\bhsla?\(/];

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, acc);
    } else if (
      /\.(css|ts|tsx)$/.test(entry) &&
      !/\.(test|spec)\.(ts|tsx)$/.test(entry)
    ) {
      acc.push(full);
    }
  }
  return acc;
}

describe("design token architecture", () => {
  it("no source file hardcodes colors outside tokens.css", () => {
    const offenders: string[] = [];

    for (const file of collectFiles(srcDir)) {
      const rel = relative(srcDir, file);
      if (ALLOWLIST.includes(rel)) continue;

      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          // Token references are legitimate — strip them before scanning.
          const stripped = line.replace(/var\(--[^)]*\)/g, "");
          if (COLOR_PATTERNS.some((re) => re.test(stripped))) {
            offenders.push(`${rel}:${index + 1}: ${line.trim()}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });
});
