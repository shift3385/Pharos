// Coverage check of the guided tours and the user manual (MAN-01).
//
//   npm run check:manual                          (in verify:static, so in the `client` check)
//   node scripts/check-manual.mjs --from-run      (after the tours: what really passed)
//   node scripts/check-manual.mjs --secret-scan   (needs PHAROS_TOURS_AI_KEY in the environment)
//
// Static check — fails when:
//   - the app has something with no item in the inventory (e2e/tours/manifest.ts):
//     a route (every `<Route` of App.tsx must be parsed), a project section, an
//     admin tab, a plan-wizard step, a file that opens dialogs (Dialog,
//     ConfirmDialog, BottomSheet, ARIA dialog, window.confirm/prompt/alert), a
//     file upload, or a screen with tabs or a view switch — so a new screen
//     cannot ship without its manual page;
//   - an inventory item is neither covered by a tour step nor marked
//     `pending` / `skip` with a reason (a step with a literal `skip` reason
//     covers nothing);
//   - a file opens more dialogs than tour steps cover it;
//   - a step covers an unknown id, or an active chapter lacks its tour or its
//     prose (docs/manual/fuentes/<id>.md).
// The AI chapter counts as pending unless PHAROS_TOURS_AI_KEY is set in the
// environment (this check never reads `.env`).
//
// --from-run also fails when an item is covered only by steps that did not
// pass in the last run (e2e/results/tours/steps.jsonl).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scanForSecret } from "./manual/secret-scan.mjs";

const repoDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(repoDir, p), "utf8");

// ---- What the code says exists ----------------------------------------------------

/** Literal members of `export const NAME = [ ... ]` in a source file. */
export function arrayLiteral(source, name) {
  const m = new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`).exec(source);
  if (!m) throw new Error(`could not find ${name}`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/** Paths of the routes that render a page (not the redirects or `*`). Throws
 *  when a `<Route` is written in a shape this reader does not understand, so
 *  a route cannot slip past the check. */
export function routePaths(appSource) {
  const all = [...appSource.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g)];
  const declared = (appSource.match(/<Route\b/g) ?? []).length;
  if (all.length !== declared) {
    throw new Error(`App.tsx declares ${declared} <Route> but ${all.length} could be read: update routePaths()`);
  }
  return all.filter(([, path, el]) => path !== "*" && el !== "Navigate").map(([, path]) => path);
}

/** A dialog the app can open: the Dialog / ConfirmDialog / BottomSheet
 *  primitives, the report-import modal, an ARIA dialog, a question asked with
 *  `useConfirm` (each `await confirm(` is one, NC-017) or a native one. */
export const DIALOG_PATTERN = /<(Dialog|ConfirmDialog|BottomSheet|ImportReportModal)\b|role="(alert)?dialog"|\bawait confirm\(|window\.(confirm|prompt|alert)\(|(?<![.\w])alert\(/g;
/** Tabs (the Tabs primitive or an ARIA tablist). */
export const TABS_PATTERN = /<Tabs\b|role="tablist"/;

export const countDialogs = (text) => (text.match(DIALOG_PATTERN) ?? []).length;

/** A view switch: a SegmentedControl / FilterChips labelled as a view. */
export function hasViewSwitch(text) {
  for (const m of text.matchAll(/<(SegmentedControl|FilterChips)\b/g)) {
    const props = text.slice(m.index, m.index + 600);
    if (/label=\{t\("[^"]*view[^"]*"\)\}/i.test(props)) return true;
  }
  return false;
}

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) yield p;
  }
}

/** Every id the code requires, and how many dialogs each file opens. */
export function requiredIds() {
  const ids = [];
  const dialogCounts = new Map();
  for (const path of routePaths(read("src/app/App.tsx"))) {
    // The project route is covered section by section.
    if (path.includes(":section")) continue;
    ids.push(`route:${path}`);
  }
  for (const s of arrayLiteral(read("src/modules/projects/model/sections.ts"), "PROJECT_SECTIONS")) ids.push(`section:${s}`);
  const tabs = /export type AdminTab\s*=([^;]+);/.exec(read("src/modules/admin/model/tabs.ts"));
  for (const t of [...(tabs?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1])) ids.push(`admin:${t}`);
  for (const s of arrayLiteral(read("src/modules/test-plan/ui/wizard/steps.ts"), "STEP_IDS")) ids.push(`wizard:${s}`);
  for (const file of sourceFiles(join(repoDir, "src"))) {
    const rel = relative(repoDir, file).replaceAll("\\", "/");
    if (rel.startsWith("src/shared/ui/")) continue; // the primitives themselves
    const text = readFileSync(file, "utf8");
    const dialogs = countDialogs(text);
    if (dialogs > 0) {
      ids.push(`dialogs:${rel}`);
      dialogCounts.set(`dialogs:${rel}`, dialogs);
    }
    if (/type="file"/.test(text)) ids.push(`upload:${rel}`);
    if (rel.endsWith(".tsx") && TABS_PATTERN.test(text)) ids.push(`tabs:${rel}`);
    if (rel.endsWith(".tsx") && hasViewSwitch(text)) ids.push(`views:${rel}`);
  }
  return { ids, dialogCounts };
}

// ---- What the tours cover ---------------------------------------------------------

/** `covers` of each step of a tour file: `[{ id, ids, literalSkip }]`. A step
 *  with a literal `skip: "…"` covers nothing (its ids stay uncovered). */
export function stepsIn(source) {
  const steps = [];
  const starts = [...source.matchAll(/\bstep\("([^"]+)"/g)];
  starts.forEach((m, i) => {
    const body = source.slice(m.index, starts[i + 1]?.index ?? source.length);
    const ids = [];
    for (const c of body.matchAll(/covers:\s*\[([^\]]*)\]/g)) for (const x of c[1].matchAll(/"([^"]+)"/g)) ids.push(x[1]);
    steps.push({ id: m[1], ids, literalSkip: /\bskip:\s*["'`]/.test(body) });
  });
  return steps;
}

/** Ids in `covers: [...]` of a tour file (string literals only). */
export const coversIn = (source) => stepsIn(source).flatMap((s) => s.ids);

/** The last run's steps (e2e/results/tours/steps.jsonl), or null. */
function runSteps() {
  const file = join(repoDir, "e2e", "results", "tours", "steps.jsonl");
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

export async function check({ fromRun = false, env = process.env } = {}) {
  const { CHAPTERS, INVENTORY } = await import(pathToFileURL(join(repoDir, "e2e", "tours", "manifest.ts")).href);
  const errors = [];
  const toursDir = join(repoDir, "e2e", "tours");

  const ids = new Map();
  for (const item of INVENTORY) {
    if (ids.has(item.id)) errors.push(`inventory: duplicate id ${item.id}`);
    ids.set(item.id, item);
    if (!CHAPTERS.some((c) => c.id === item.chapter)) errors.push(`inventory: ${item.id} names an unknown chapter ${item.chapter}`);
    if ((item.pending !== undefined && !item.pending.trim()) || (item.skip !== undefined && !item.skip.trim())) {
      errors.push(`inventory: ${item.id} is pending/skip without a reason`);
    }
  }

  const required = requiredIds();
  for (const id of required.ids) {
    if (!ids.has(id)) errors.push(`no inventory item for ${id} (add it to e2e/tours/manifest.ts and tour it)`);
  }

  // Manual order (MAN-03): one chapter per number, and a tour file carries its
  // chapter's number (`--spec 08` finds chapter 8).
  const numbers = new Map();
  for (const c of CHAPTERS) {
    if (numbers.has(c.number)) errors.push(`chapters ${numbers.get(c.number)} and ${c.id} share number ${c.number}`);
    numbers.set(c.number, c.id);
    if (c.file && !c.file.startsWith(`${String(c.number).padStart(2, "0")}-`)) {
      errors.push(`chapter ${c.id} is number ${c.number} but its tour file is ${c.file}`);
    }
  }

  const covered = new Map(); // id → number of steps covering it
  for (const c of CHAPTERS) {
    if (c.status === "pending") {
      if (!c.pending?.trim()) errors.push(`chapter ${c.id} is pending without a reason`);
      continue;
    }
    if (!c.file || !existsSync(join(toursDir, c.file))) {
      errors.push(`chapter ${c.id}: tour file ${c.file} not found`);
      continue;
    }
    if (c.inManual !== false && !existsSync(join(repoDir, "docs", "manual", "fuentes", `${c.id}.md`))) {
      errors.push(`chapter ${c.id}: docs/manual/fuentes/${c.id}.md not found`);
    }
    for (const s of stepsIn(readFileSync(join(toursDir, c.file), "utf8"))) {
      for (const id of s.ids) {
        if (!ids.has(id)) errors.push(`${c.file}: step ${s.id} covers unknown item ${id}`);
        if (!s.literalSkip) covered.set(id, (covered.get(id) ?? 0) + 1);
      }
    }
  }

  // The AI chapter calls a real provider: without PHAROS_TOURS_AI_KEY in the
  // environment its steps are skipped, so its items count as pending.
  const aiPending = !env.PHAROS_TOURS_AI_KEY;
  const pending = [];
  for (const item of INVENTORY) {
    const chapter = CHAPTERS.find((c) => c.id === item.chapter);
    if (aiPending && item.chapter === "ia" && item.id !== "ai:disabled-without-key") {
      pending.push({ ...item, pending: "requiere PHAROS_TOURS_AI_KEY (tours de IA con una clave real)" });
      covered.delete(item.id);
      continue;
    }
    if (covered.has(item.id)) {
      const need = required.dialogCounts.get(item.id) ?? 1;
      if (covered.get(item.id) < need && !item.skip) {
        errors.push(`${item.id} opens ${need} dialogs but only ${covered.get(item.id)} step(s) cover it — tour each dialog`);
      }
      continue;
    }
    if (item.pending || item.skip || chapter?.status === "pending") {
      pending.push(item);
      continue;
    }
    errors.push(`not covered: ${item.id} (${item.label}) — tour it or mark it pending/skip with a reason`);
  }

  if (fromRun) {
    const run = runSteps();
    if (!run) errors.push("--from-run: no e2e/results/tours/steps.jsonl (run npm run manual first)");
    else {
      const passed = new Set(run.filter((s) => s.status === "passed").flatMap((s) => s.covers ?? []));
      for (const id of covered.keys()) {
        if (!passed.has(id)) errors.push(`--from-run: ${id} is covered only by steps that did not pass in the last run`);
      }
    }
  }

  const total = INVENTORY.length;
  const done = INVENTORY.filter((i) => covered.has(i.id)).length;
  return { errors, total, done, pending, chapters: CHAPTERS };
}

// ---- CLI --------------------------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--secret-scan")) {
    const hits = await scanForSecret(process.env.PHAROS_TOURS_AI_KEY ?? "", [join(repoDir, "docs", "manual"), join(repoDir, "e2e", "results")], repoDir);
    if (hits.length > 0) {
      console.error(`✖ check:manual: the AI key appears in ${hits.length} generated file(s):\n  ${hits.join("\n  ")}`);
      process.exit(1);
    }
    console.log("✓ check:manual: the AI key appears in no generated file.");
    process.exit(0);
  }
  const { errors, total, done, pending } = await check({ fromRun: process.argv.includes("--from-run") });
  const pct = total === 0 ? 0 : Math.round((done / total) * 1000) / 10;
  console.log(`Manual coverage: ${done}/${total} inventory items toured (${pct} %), ${pending.length} pending/skip.`);
  for (const p of pending) console.log(`  · ${p.pending ? "pending" : "skip"} ${p.id}: ${p.pending ?? p.skip ?? "(chapter pending)"}`);
  if (errors.length > 0) {
    console.error(`\n✖ check:manual: ${errors.length} problem(s):\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log("✓ check:manual: every screen, tab, dialog and action has a tour step or a reason.");
}
