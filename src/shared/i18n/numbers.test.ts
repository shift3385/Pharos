// FIX-46: numbers with a unit in the reader's language («0,2 KB»), through
// one formatter, as percentages go through `percent.ts`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatBytes, formatNumber } from "./numbers";

describe("formatNumber and formatBytes", () => {
  it("use a comma in Spanish and a point in English", () => {
    expect(formatNumber(0.25, { lang: "es", digits: 2 })).toBe("0,25");
    expect(formatNumber(0.25, { lang: "en", digits: 2 })).toBe("0.25");
    expect(formatNumber(3)).not.toMatch(/[.,]/);
    expect([formatNumber(null), formatBytes(undefined)]).toEqual(["—", "—"]);
  });

  it("pick the unit that fits, base 1024", () => {
    expect(formatBytes(205, { lang: "es" })).toBe("205 B");
    expect(formatBytes(230, { lang: "es" })).toBe("230 B");
    expect(formatBytes(614, { lang: "es" })).toBe("614 B");
    expect(formatBytes(1536, { lang: "es" })).toBe("1,5 KB");
    expect(formatBytes(1536, { lang: "en" })).toBe("1.5 KB");
    expect(formatBytes(64_000, { lang: "es" })).toBe("62,5 KB");
    expect(formatBytes(3 * 1048576, { lang: "es" })).toBe("3 MB");
  });

  it("is the only way the app writes a size with decimals", { timeout: 30_000 }, () => {
    // `(a.size / 1024).toFixed(1)} KB` reads «0.2 KB» in Spanish.
    const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const text = readFileSync(path, "utf8");
          if (/toFixed\([^)]*\)[^\n;]{0,4}\s?(B|KB|MB|GB)\b/.test(text)) offenders.push(relative(src, path));
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
