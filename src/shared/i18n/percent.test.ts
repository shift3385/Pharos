// FIX-43: one percentage format, in the reader's language, for the whole app.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { keyPieces, pdfWholeKeys } from "@shared/export/wholeKeys";
import { formatPercent, formatRatio } from "./percent";

describe("formatPercent and formatRatio", () => {
  it("use a comma in Spanish and a point in English, and no «.0»", () => {
    expect(formatRatio(1 / 3, { lang: "es" })).toBe("33,3 %");
    expect(formatRatio(1 / 3, { lang: "en" })).toBe("33.3 %");
    expect(formatPercent(50, { lang: "es" })).toBe("50 %");
    expect(formatPercent(12.345, { lang: "es", digits: 2 })).toBe("12,35 %");
    expect(formatRatio(0.666, { lang: "es", digits: 0 })).toBe("67 %");
    expect(formatPercent(1234.5, { lang: "es" })).toBe("1234,5 %");
    expect([formatRatio(null), formatPercent(undefined), formatPercent(Number.NaN)]).toEqual(["—", "—", "—"]);
  });

  it("is the only way the app writes a percentage with decimals", { timeout: 30_000 }, () => {
    // A hand-made percentage with a fixed decimal point (`x.toFixed(1)} %`)
    // reads «33.3 %» in Spanish: every one goes through `percent.ts`.
    const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const text = readFileSync(path, "utf8");
          if (/toFixed\([^)]*\)\}? ?%|toFixed\([^)]*\)[^\n;]*[`"] ?%/.test(text)) offenders.push(relative(src, path));
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});

describe("keys never break", () => {
  it("marks each key of a text, and leaves a text without keys alone", () => {
    expect(keyPieces("RUN-009, RUN-001")).toEqual([
      { text: "RUN-009", key: true },
      { text: ", ", key: false },
      { text: "RUN-001", key: true },
    ]);
    expect(pdfWholeKeys("Todo el periodo")).toBe("Todo el periodo");
    expect(pdfWholeKeys("PH-001 falla")).toEqual([{ text: "PH-001", noWrap: true }, { text: " falla" }]);
  });

  // FIX-46: «TP-/PH-0600» and «0.6.0-/beta.1» broke in the closure report and
  // the runs list.
  it("keeps keys with several prefixes and versions whole", () => {
    const keys = (s: string) => keyPieces(s).filter((p) => p.key).map((p) => p.text);
    expect(keys("Plan de Pharos 0.6.0 · TP-PH-0600 · v0.7")).toEqual(["0.6.0", "TP-PH-0600"]);
    expect(keys("Importado · pharos-e2e · build 0.6.0-beta.1.")).toEqual(["0.6.0-beta.1"]);
    expect(keys("Quedan fuera: PH-005, PH-012")).toEqual(["PH-005", "PH-012"]);
    expect(keys("La primera clave será PHA-001; el run, RUN-001.")).toEqual(["PHA-001", "RUN-001"]);
    expect(pdfWholeKeys("TP-PH-0600 · v0.7")).toEqual([{ text: "TP-PH-0600", noWrap: true }, { text: " · v0.7" }]);
  });
});
