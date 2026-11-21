// The fixtures of one tour run (MAN-03): a copy of e2e/tours/fixtures with
// every date moved from the story's reference day to the run day, so the
// reports Liomar imports (JUnit, TRX, SARIF, axe, Allure) and the plan .xlsx
// he loads fall inside the cycle whatever day the tours run. The committed
// files stay as they are (made for REFERENCE_DAY, checked by
// `npm run manual:fixtures`); the plan and case .xlsx are made again by the
// fixture generator for the run day.
import { spawnSync } from "node:child_process";
import { cpSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import JSZip from "jszip";

const DAY_MS = 86_400_000;
const TEXT = new Set([".xml", ".trx", ".json", ".sarif", ".txt"]);

/** ISO timestamps and days in `text`, moved `days` days. */
export function shiftIsoDates(text, days) {
  if (!days) return text;
  return text.replace(/\b(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?/g, (all, ymd, time) => {
    const d = new Date(`${ymd}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return all;
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10) + (time ?? "");
  });
}

/** Allure's epoch milliseconds («start», «stop»), moved `days` days. */
export function shiftEpochs(text, days) {
  if (!days) return text;
  return text.replace(/("(?:start|stop|time)"\s*:\s*)(\d{13})/g, (_, key, ms) => `${key}${Number(ms) + days * DAY_MS}`);
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

/**
 * Copies `source` (e2e/tours/fixtures) to `out` with its dates moved by
 * `days`, and makes the plan and case .xlsx again for `runDay`. Returns `out`.
 */
export async function prepareRunFixtures({ repoDir, source, out, days, runDay }) {
  rmSync(out, { recursive: true, force: true });
  cpSync(source, out, { recursive: true });
  if (!days) return out;
  for (const file of files(out)) {
    const ext = extname(file).toLowerCase();
    if (TEXT.has(ext)) writeFileSync(file, shiftIsoDates(readFileSync(file, "utf8"), days));
    else if (ext === ".zip") {
      const zip = await JSZip.loadAsync(readFileSync(file));
      for (const entry of Object.values(zip.files)) {
        if (entry.dir || !/\.(json|xml|txt)$/i.test(entry.name)) continue;
        zip.file(entry.name, shiftEpochs(shiftIsoDates(await entry.async("string"), days), days));
      }
      writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }));
    }
  }
  const made = spawnSync(
    "npx",
    ["vitest", "run", "--config", "scripts/manual/fixtures/vitest.config.ts"],
    {
      cwd: repoDir,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, PHAROS_TOURS_DAY: runDay, PHAROS_FIXTURES_OUT: join(out, "pharos") },
    },
  );
  if (made.status !== 0) throw new Error("the plan and case .xlsx for the run day could not be made");
  return out;
}
