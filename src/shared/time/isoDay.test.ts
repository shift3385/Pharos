import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { localClock, todayIso } from "./isoDay";

describe("todayIso (FIX-51)", () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  it("is the local calendar day late in the evening west of Greenwich", () => {
    process.env.TZ = "America/Caracas"; // UTC-4, no DST
    // 20 Nov 2026, 20:51 local = 21 Nov 2026, 00:51 UTC.
    const evening = new Date(2026, 10, 20, 20, 51);
    expect(evening.toISOString().slice(0, 10)).toBe("2026-11-21");
    expect(todayIso(evening)).toBe("2026-11-20");
    expect(localClock(evening)).toBe("205100");
  });

  it("is the local calendar day early in the morning east of Greenwich", () => {
    process.env.TZ = "Asia/Tokyo"; // UTC+9
    const morning = new Date(2026, 10, 21, 7, 5, 9);
    expect(morning.toISOString().slice(0, 10)).toBe("2026-11-20");
    expect(todayIso(morning)).toBe("2026-11-21");
    expect(localClock(morning)).toBe("070509");
  });
});

/** Every `.ts`/`.tsx` under `src`, tests excluded. */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe("no UTC day where a local day is meant (FIX-51)", () => {
  it("does not derive a day from toISOString() in app code", () => {
    // A cell ExcelJS read as a date is UTC midnight, so its UTC day is the
    // day typed: those lines carry `utc-day-ok`.
    const root = join(__dirname, "..", "..");
    const hits = sources(root).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, at: `${relative(root, file)}:${i + 1}` }))
        .filter(({ line }) => /toISOString\(\)\.(slice|substring|substr)\(\s*(0|11)\b/.test(line) && !line.includes("utc-day-ok")),
    );
    expect(hits.map((h) => h.at)).toEqual([]);
  });
});
