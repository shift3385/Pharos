// Prerequisites of the chapters (MAN-03, manual data-flow design): before a
// chapter runs, `ensure(meta.uses)` makes sure the data it reads and is not
// about holds, and brings in what is missing. One loader per prerequisite
// (PREREQUISITES in manifest.ts), idempotent:
//
//   check()  reads the server as Liomar (after a sync, so what the app made
//            on screen counts); nothing to do when the contract holds.
//   load()   brings it in: the app's own importer driven silently when one
//            exists (CSV, plan and case .xlsx, results report), else the
//            server's web API as Liomar («Pharos Web», decision D-3) or the
//            account API; then a sync, so the app shows it.
//
// In a full run the chapter that makes each prerequisite on screen runs
// earlier, so every check passes and nothing is loaded: the manual keeps one
// continuous story. In a partial run (`npm run manual -- --spec 13`) the
// loaders replace the chapters that are not run. Loaders are never steps:
// they take no captures, never reach steps.jsonl or the manual, and log to
// e2e/results/tours/prepare.jsonl. Nothing is written to a database
// directly.
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { $, $$, browser, expect } from "@wdio/globals";
import { PERSONA, TEAMMATE } from "../../scripts/manual/persona.mjs";
import { syncNow, userMenuTrigger } from "../support";
import {
  AI_MATERIAL,
  BASE_CASES,
  CONFIGURATIONS,
  CUSTOM_FIELDS,
  CYCLE,
  DEFECTS,
  LIBRARY,
  LIVE_REQUIREMENTS,
  MANUAL_RUN,
  PLAN,
  PROJECT_A,
  PROJECT_B,
  REQUIREMENT_RISK,
  RESULTS,
  SCANS,
  TEAM,
} from "./data/pharos";
import { button, chooseFile, chooseOption, clickButton, es, field, openProject, openSection, recordToasts, repoDir, tf, waitForSettled, waitForText, waitForToast, xpathString } from "./helpers";
import { LIOMAR_PASSWORD, ensureWorkspace, inviteCode, jorge, jorgeAcceptsInvitation, jorgeMembership, liomar, setMemberRole, shareProject } from "./people";
import { PREREQUISITES, prerequisiteClosure, type ChapterId, type Prereq } from "./manifest";

const toursDir = dirname(fileURLToPath(import.meta.url));
/** The fixtures of the case study (all about testing Pharos). */
export const pharosFixtures = join(toursDir, "fixtures", "pharos");
const logFile = join(toursDir, "..", "results", "tours", "prepare.jsonl");
const D = '[role="dialog"]';

interface Loader {
  check: () => Promise<boolean>;
  load: () => Promise<void>;
}

type Doc = Record<string, unknown> & { id: string; revision?: number };

const projectA = () => liomar.project(PROJECT_A.name);
const projectB = () => liomar.project(PROJECT_B.name);

async function caseIds(): Promise<Map<string, Doc>> {
  const p = await projectA();
  return new Map((await liomar.cases(p.id)).map((c) => [String(c.scenarioId), c]));
}

// ---- UI loaders (the app's importers) ------------------------------------------

/** «Importar requisitos (.csv)» in the open project's «Requisitos». */
async function importRequirementsCsv(file: string, rows: number) {
  await openSection("requirements");
  await chooseFile('input[type="file"][accept=".csv,text/csv"]', file);
  await expect($(D)).toBeDisplayed();
  await clickButton(tf("traceability.import.confirm", { count: rows }), D);
  await waitForToast(es.traceability.import.doneToast.split(":")[0]);
  await $(D).waitForExist({ reverse: true, timeout: 15_000 });
}

/** The data rows of a CSV fixture (header excluded). */
async function csvRows(file: string): Promise<number> {
  const { readFileSync } = await import("node:fs");
  return readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim()).length - 1;
}

/** One case through «Importar .xlsx» → «Aplicar» → its requirements → «Guardar». */
async function importCase(file: string, requirementKeys: readonly string[]) {
  await openSection("cases");
  await chooseFile('input[type="file"][accept=".xlsx"]', file);
  const apply = $(`button=${es.importReport.apply}`);
  await apply.waitForEnabled({ timeout: 30_000 });
  await apply.click();
  await expect($("#tc-title")).toBeDisplayed();
  for (const key of requirementKeys) {
    await chooseOption($('[data-testid="requirement-add"]'), { value: key });
    await expect($(`[aria-label="${tf("testCase.requirements.remove", { key })}"]`)).toBeDisplayed();
  }
  // The .xlsx carries the links only as text («Otras referencias»): once
  // linked, the text goes, as in a case made by hand (chapter 8).
  if (requirementKeys.length > 0) {
    const refs = await field(es.testCase.otherReferences);
    await refs.click();
    await browser.keys(["Control", "a"]);
    await browser.keys("Backspace");
  }
  await clickButton(es.testCase.save, ".tc-nav");
  await waitForToast(es.testCase.savedToast);
  await waitForSettled();
  await clickButton(es.testCase.nav.allCases);
}

/** «Importar informe» of a report or scan into «Pharos» (no cycle), with its
 *  title; returns the run key the summary names. */
async function importReport(file: string, title: string): Promise<string> {
  const R = es.runs;
  await openProject(PROJECT_A.name);
  await openSection("runs");
  await clickButton(R.import.open);
  await expect($(D)).toBeDisplayed();
  await $(D).$('input[type="file"]:not([webkitdirectory])').setValue(file);
  await browser.waitUntil(async () => $(D).$(`button=${R.import.confirm}`).isEnabled(), { timeout: 30_000, timeoutMsg: `${file} was not ready to import` });
  await (await field(R.field.title, D)).setValue(title);
  await clickButton(R.import.confirm, D);
  await $(".rn-done").waitForDisplayed({ timeout: 60_000 });
  const key = /[A-Z][A-Z0-9]*-\d+/.exec(await $(".rn-done").getText())?.[0] ?? "";
  await clickButton(es.common.close, D);
  return key;
}

/** The axe audit of Pharos's «Nuevo requisito» dialog (chapter 10). */
export const AXE_REPORT = join(repoDir, "packages", "formats", "src", "fixtures", "axe", "pharos-dialog.json");

// ---- The loaders ------------------------------------------------------------------

const LOADERS: Record<Prereq, Loader> = {
  "cuenta-liomar": {
    check: async () => (await userMenuTrigger().isExisting()) && (await liomar.tryLogin()),
    load: async () => {
      await liomar.ensureAccount();
      if (await userMenuTrigger().isExisting()) return;
      // The sign-in form, as Liomar does it every morning (chapter 1 shows it).
      await $("#email").waitForDisplayed({ timeout: 30_000 });
      await $("#email").setValue(PERSONA.email);
      await $("#password").setValue(LIOMAR_PASSWORD);
      await button(es.auth.login).click();
      await expect(userMenuTrigger()).toBeDisplayed({ wait: 30_000 });
    },
  },

  proyectos: {
    check: async () => {
      const names = (await liomar.projects()).map((p) => p.name);
      return names.includes(PROJECT_A.name) && names.includes(PROJECT_B.name);
    },
    load: async () => {
      const names = (await liomar.projects()).map((p) => p.name);
      // With the prefix the app suggests on creating them (chapter 4: «PHA-»
      // and «API-»), so chapter 14 finds what it finds in a full run.
      const suggested = (p: typeof PROJECT_A | typeof PROJECT_B) => `${"suggestedPrefix" in p ? p.suggestedPrefix : p.prefix}-`;
      for (const p of [PROJECT_A, PROJECT_B]) {
        if (!names.includes(p.name)) await liomar.post("/api/projects", { name: p.name, caseIdPrefix: suggested(p), caseIdDigits: 3 });
      }
    },
  },

  prefijos: {
    check: async () => (await projectA()).caseIdPrefix === `${PROJECT_A.prefix}-` && (await projectB()).caseIdPrefix === `${PROJECT_B.prefix}-`,
    load: async () => {
      for (const p of [PROJECT_A, PROJECT_B]) {
        const doc = await liomar.project(p.name);
        if (doc.caseIdPrefix === `${p.prefix}-`) continue;
        await liomar.put(`/api/projects/${doc.id}`, { input: { name: p.name, caseIdPrefix: `${p.prefix}-`, caseIdDigits: 3 }, revision: doc.revision });
      }
    },
  },

  ajustes: {
    check: async () => {
      const p = await projectA();
      const live = async (entity: string) => (await liomar.customFields(p.id, entity)).filter((f) => !f.archived).map((f) => f.label);
      const caseFields = await live("test_case");
      const defectFields = await live("defect");
      const configs = (await liomar.configurations(p.id)).filter((c) => !c.archived).map((c) => c.name);
      return (
        caseFields.includes(CUSTOM_FIELDS.browser.label) &&
        caseFields.includes(CUSTOM_FIELDS.criticalRegression.label) &&
        defectFields.includes(CUSTOM_FIELDS.os.label) &&
        CONFIGURATIONS.every((c) => configs.includes(c.name))
      );
    },
    load: async () => {
      const p = await projectA();
      for (const f of Object.values(CUSTOM_FIELDS)) {
        const existing = (await liomar.customFields(p.id, f.entity)).map((x) => x.label);
        if (existing.includes(f.label)) continue;
        await liomar.post("/api/custom-fields", {
          projectId: p.id,
          entity: f.entity,
          fieldKey: f.fieldKey,
          label: f.label,
          fieldType: f.fieldType,
          options: f.options.map((label) => ({ label })),
        });
      }
      const configs = (await liomar.configurations(p.id)).map((c) => c.name);
      for (const c of CONFIGURATIONS) {
        if (!configs.includes(c.name)) await liomar.post("/api/configurations", { projectId: p.id, ...c });
      }
    },
  },

  plan: {
    check: async () => (await liomar.plan((await projectA()).id)) !== null,
    load: async () => {
      await openProject(PROJECT_A.name);
      await openSection("plan");
      await chooseFile('input[type="file"][accept=".xlsx"]', join(pharosFixtures, PLAN.file));
      const apply = $(`button=${es.importReport.apply}`);
      await apply.waitForEnabled({ timeout: 30_000 });
      await apply.click();
      await waitForToast(es.testPlan.import.applied);
      await button(es.testPlan.save).click();
      await waitForToast(es.testPlan.savedToast);
    },
  },

  requisitos: {
    check: async () => {
      const reqs = await liomar.requirements((await projectA()).id);
      const keys = new Set(reqs.map((r) => r.requirementKey));
      const risky = reqs.find((r) => r.requirementKey === REQUIREMENT_RISK.key);
      return LIVE_REQUIREMENTS.every((r) => keys.has(r.key)) && risky?.riskLikelihood != null;
    },
    load: async () => {
      await openProject(PROJECT_A.name);
      const access = join(pharosFixtures, "requisito-acceso.csv");
      const rest = join(pharosFixtures, "requisitos-pharos.csv");
      await importRequirementsCsv(access, await csvRows(access));
      await importRequirementsCsv(rest, await csvRows(rest));
      // Chapter 7 deletes the one that is out of the release and assesses a
      // risk: no importer does either, so the web API does, once the server
      // has the imported ones.
      await sync();
      const p = await projectA();
      for (const r of await liomar.requirements(p.id)) {
        const gone = LIVE_REQUIREMENTS.every((x) => x.key !== r.requirementKey);
        if (gone) await liomar.del(`/api/requirements/${r.id}?revision=${r.revision}`);
        // The risk chapter 7 assesses (the CSV has no risk column).
        if (r.requirementKey === REQUIREMENT_RISK.key) {
          await liomar.put(`/api/requirements/${r.id}`, {
            input: {
              projectId: p.id,
              title: r.title,
              description: r.description,
              priority: r.priority,
              riskLikelihood: REQUIREMENT_RISK.likelihood,
              riskImpact: REQUIREMENT_RISK.impact,
            },
            revision: r.revision,
          });
        }
      }
    },
  },

  "casos-base": {
    check: async () => {
      const ids = await caseIds();
      return BASE_CASES.every((c) => ids.has(c.key));
    },
    load: async () => {
      const ids = await caseIds();
      await openProject(PROJECT_A.name);
      for (const c of BASE_CASES) {
        if (!ids.has(c.key)) await importCase(join(pharosFixtures, "casos", c.file), c.requirementKeys);
      }
    },
  },

  "caso-dataset": {
    check: async () => (await liomar.cases((await projectA()).id)).some((c) => c.title === LIBRARY.case.title),
    load: async () => {
      // The library of chapter 8 through its own screens, without captures:
      // the shared step (v1, then v2), the dataset from its CSV, the case.
      const L = es.library;
      const C = es.testCase;
      await openProject(PROJECT_A.name);
      await openSection("library");
      await clickButton(L.newStep);
      await (await field(L.field.name, ".lb-editor")).setValue(LIBRARY.step.name);
      await (await field(L.field.description, ".lb-editor")).setValue(LIBRARY.step.description);
      for (const [i, text] of LIBRARY.step.steps.entries()) {
        const input = $(`input[aria-label="${tf("library.step.n", { n: i + 1 })}"]`);
        if (!(await input.isExisting())) await clickButton(`+ ${L.step.add}`, ".lb-editor");
        await input.setValue(text);
      }
      const last = $(`input[aria-label="${L.step.expected} · ${tf("library.step.n", { n: LIBRARY.step.steps.length })}"]`);
      await last.setValue(LIBRARY.step.lastExpected);
      await clickButton(L.editor.save, ".lb-editor__actions");
      await waitForToast(tf("library.toast.created", { name: LIBRARY.step.name }));
      await last.addValue(LIBRARY.step.lastExpectedAdded);
      await clickButton(L.editor.save, ".lb-editor__actions");
      await $(".lb-version=v2").waitForDisplayed({ timeout: 15_000 });
      await clickButton(L.editor.back, ".lb-editor__bar");
      await $(`button[role="tab"]*=${L.tab.datasets}`).click();
      await clickButton(L.newDataset);
      await (await field(L.field.name, ".lb-editor")).setValue(LIBRARY.dataset.name);
      await chooseFile('.lb-editor input[type="file"]', join(toursDir, "fixtures", LIBRARY.dataset.file));
      await waitForToast(tf("library.dataset.imported", { rows: LIBRARY.dataset.rows, columns: LIBRARY.dataset.columns }));
      await clickButton(L.editor.save, ".lb-editor__actions");
      await waitForToast(tf("library.toast.created", { name: LIBRARY.dataset.name }));
      await openSection("cases");
      await clickButton(C.new);
      await $(`.//button[contains(@class,"tc-level-card")][.//*[normalize-space(.)=${xpathString(C.level.outline.name)}]]`).click();
      await $("#tc-title").setValue(LIBRARY.case.title);
      const group = $(`[role="group"][aria-label="${C.steps}"]`);
      const first = group.$(`[aria-label="${tf("testCase.stepN", { n: 1 })}"]`);
      if (!(await first.isExisting())) await group.$(`.//button[contains(normalize-space(.),${xpathString(C.addStep)})]`).click();
      await first.setValue(LIBRARY.case.firstStep);
      await (await field(C.expectedResult)).setValue(LIBRARY.case.expectedResult);
      await clickButton(L.insert.open);
      await $(D).$(`.//li[.//b[normalize-space(.)=${xpathString(LIBRARY.step.name)}]]//button`).click();
      await clickButton(L.insert.confirm, D);
      await $('[data-testid="shared-step-block"]').waitForDisplayed();
      await clickButton(L.bind.open);
      await $(D).$(`.//li[.//b[normalize-space(.)=${xpathString(LIBRARY.dataset.name)}]]//button`).click();
      await $(".lb-bound").waitForDisplayed();
      for (const key of LIBRARY.case.requirementKeys) {
        await chooseOption($('[data-testid="requirement-add"]'), { value: key });
        await expect($(`[aria-label="${tf("testCase.requirements.remove", { key })}"]`)).toBeDisplayed();
      }
      await clickButton(C.save, ".tc-nav");
      await waitForToast(C.savedToast);
      await waitForSettled();
      await clickButton(C.nav.allCases);
    },
  },

  ciclo: {
    check: async () => (await liomar.cycles((await projectA()).id)).some((c) => c.title === CYCLE.title),
    load: async () => {
      const p = await projectA();
      const configs = (await liomar.configurations(p.id)).filter((c) => CONFIGURATIONS.some((x) => x.name === c.name)).map((c) => c.id);
      const plan = await liomar.plan(p.id);
      const cycle = await liomar.post<Doc>("/api/cycles", {
        projectId: p.id,
        title: CYCLE.title,
        build: CYCLE.build,
        environment: CYCLE.environment,
        sprint: CYCLE.sprint,
        configurationIds: configs,
        ...(plan ? { testPlanId: plan.id } : {}),
      });
      const ids = await caseIds();
      await liomar.post(`/api/cycles/${cycle.id}/items`, {
        items: CYCLE.caseKeys.map((k) => ({ testCaseId: ids.get(k)?.id, assignee: CYCLE.assignee })),
      });
      await liomar.post(`/api/cycles/${cycle.id}/execute`, { configurationIds: configs, build: CYCLE.build, environment: CYCLE.environment });
    },
  },

  resultados: {
    check: async () => (await liomar.runs((await projectA()).id)).some((r) => r.title === RESULTS.title),
    load: async () => {
      const R = es.runs;
      await openProject(PROJECT_A.name);
      await openSection("runs");
      await clickButton(R.import.open);
      await expect($(D)).toBeDisplayed();
      const report = join(toursDir, "fixtures", "informe-adjuntos");
      await $(D).$('input[type="file"]:not([webkitdirectory])').setValue(join(report, "junit.xml"));
      await waitForText(R.format.junit);
      await $(D).$('input[type="file"][webkitdirectory]').setValue(join(report, "capturas"));
      await (await field(R.field.title, D)).setValue(RESULTS.title);
      await (await field(R.field.build, D)).setValue(RESULTS.build);
      await (await field(R.field.environment, D)).setValue(RESULTS.environment);
      // The cycle «Regresión 0.6.0»: the first open cycle after «Sin ciclo».
      await chooseOption($(D).$('[data-testid="import-cycle"]'), { index: 1 });
      await waitForText(tf("runs.import.attachments_one", { count: 1 }));
      await clickButton(R.import.confirm, D);
      await $(".rn-done").waitForDisplayed({ timeout: 60_000 });
      await clickButton(es.common.close, D);
    },
  },

  hallazgos: {
    check: async () => {
      const titles = (await liomar.runs((await projectA()).id)).map((r) => r.title);
      return [SCANS.sarif.title, SCANS.axe.title, SCANS.k6.title].every((t) => titles.includes(t));
    },
    load: async () => {
      const titles = (await liomar.runs((await projectA()).id)).map((r) => r.title);
      const informes = join(pharosFixtures, "informes");
      if (!titles.includes(SCANS.sarif.title)) {
        const key = await importReport(join(informes, SCANS.sarif.file), SCANS.sarif.title);
        // Chapter 10 triages one finding as a false positive.
        await $(`[data-testid="run-row-${key}"]`).click();
        await $(`[role="tab"]*=${es.findings.tabs.findings}`).click();
        await $('[data-testid="findings-panel"]').waitForDisplayed();
        for (const g of await $$('[data-testid="finding-rule"]')) {
          if ((await g.getAttribute("open")) === null) await g.$("summary").click();
        }
        await $(`.fd-rule*=${SCANS.sarif.triagedRule}`).$('[data-testid="finding-triage"]').click();
        await $(D).$('[data-testid="triage-false_positive"] input').click();
        await $(D).$('[data-testid="triage-reason"]').setValue(SCANS.sarif.triageReason);
        await $(D).$('[data-testid="triage-save"]').click();
        await $(D).waitForDisplayed({ reverse: true });
      }
      if (!titles.includes(SCANS.axe.title)) await importReport(AXE_REPORT, SCANS.axe.title);
      if (!titles.includes(SCANS.k6.title)) await importReport(join(informes, SCANS.k6.file), SCANS.k6.title);
    },
  },

  "ejecucion-manual": {
    check: async () => (await liomar.runs((await projectA()).id)).some((r) => r.title === MANUAL_RUN.title && r.status === "completed"),
    load: async () => {
      const p = await projectA();
      const ids = await caseIds();
      const run = await liomar.post<Doc>("/api/runs", {
        input: { projectId: p.id, title: MANUAL_RUN.title, build: MANUAL_RUN.build, environment: MANUAL_RUN.environment },
        items: [MANUAL_RUN.failed.caseKey, MANUAL_RUN.passed.caseKey, MANUAL_RUN.dataset.caseKey].map((k) => ({ testCaseId: ids.get(k)?.id })),
      });
      const overview = await liomar.get<{ items: { item: Doc; caseKey: string }[] }>(`/api/runs/${run.id}/overview`);
      const now = new Date().toISOString();
      for (const { item, caseKey } of overview.items) {
        // One attempt per target: an Outline case runs once per example row,
        // a case with a dataset once per dataset row (the last one fails).
        const detail = await liomar.get<{ targets: { flowId: string | null; exampleRowId: string | null }[] }>(`/api/run-items/${item.id}`);
        for (const [n, target] of detail.targets.entries()) {
          const failed =
            caseKey === MANUAL_RUN.failed.caseKey || (caseKey === MANUAL_RUN.dataset.caseKey && n + 1 === MANUAL_RUN.dataset.failedRow);
          await liomar.post("/api/results", {
            input: {
              runItemId: item.id,
              attemptId: randomUUID(),
              flowId: target.flowId,
              exampleRowId: target.exampleRowId,
              status: failed ? "failed" : "passed",
              startedAt: now,
              finishedAt: now,
              ...(failed ? { errorMessage: MANUAL_RUN.failed.actual } : {}),
            },
          });
        }
      }
      const fresh = await liomar.get<Doc>(`/api/runs/${run.id}`);
      await liomar.post(`/api/runs/${run.id}/close`, { status: "completed", revision: fresh.revision });
    },
  },

  defectos: {
    check: async () => {
      const titles = (await liomar.defects((await projectA()).id)).map((d) => d.title);
      return titles.includes(DEFECTS.prefix.title) && titles.includes(DEFECTS.login.title);
    },
    load: async () => {
      const p = await projectA();
      const ids = await caseIds();
      const req = (await liomar.requirements(p.id)).find((r) => r.requirementKey === DEFECTS.prefix.requirementKey);
      const existing = (await liomar.defects(p.id)).map((d) => d.title);
      const { prefix, login } = DEFECTS;
      if (!existing.includes(prefix.title)) {
        await liomar.post("/api/defects", {
          projectId: p.id,
          title: prefix.title,
          severity: prefix.severity,
          priority: prefix.priority,
          stepsToReproduce: prefix.steps,
          expected: prefix.expected,
          actual: prefix.actual,
          foundInBuild: CYCLE.build,
          foundInEnvironment: CYCLE.environment,
          data: { custom: { [CUSTOM_FIELDS.os.fieldKey]: prefix.os } },
          links: [
            { targetKind: "test_case", targetId: ids.get(prefix.caseKey)?.id },
            ...(req ? [{ targetKind: "requirement", targetId: req.id }] : []),
          ],
        });
      }
      if (!existing.includes(login.title)) {
        await liomar.post("/api/defects", {
          projectId: p.id,
          title: login.title,
          severity: login.severity,
          priority: login.priority,
          foundInBuild: CYCLE.build,
          foundInEnvironment: CYCLE.environment,
          links: [{ targetKind: "test_case", targetId: ids.get(login.caseKey)?.id }],
        });
      }
    },
  },

  "requisitos-api": {
    check: async () => {
      const file = join(pharosFixtures, AI_MATERIAL.requirementsCsv);
      return (await liomar.requirements((await projectB()).id)).length >= (await csvRows(file));
    },
    load: async () => {
      const file = join(pharosFixtures, AI_MATERIAL.requirementsCsv);
      await openProject(PROJECT_B.name);
      await importRequirementsCsv(file, await csvRows(file));
    },
  },

  "cuenta-jorge": {
    check: () => jorge.tryLogin(),
    load: async () => {
      await jorge.ensureAccount();
    },
  },

  "equipo-qa": {
    check: async () => {
      const ws = (await liomar.workspaces()).find((w) => w.name === TEAM.workspace && w.kind === "shared");
      if (!ws) return false;
      const p = await liomar.get<Doc>(`/api/projects/${(await projectA()).id}`);
      return p.workspaceId === ws.id;
    },
    load: async () => {
      await ensureWorkspace(TEAM.workspace);
      await shareProject(TEAM.sharedProject, TEAM.workspace);
    },
  },

  "jorge-en-equipo": {
    check: async () => (await jorgeMembership(TEAM.workspace))?.role === TEAM.jorgeFinalRole,
    load: async () => {
      if (!(await jorgeMembership(TEAM.workspace))) await jorgeAcceptsInvitation(await inviteCode(TEAM.jorgeRole, TEAM.workspace));
      await setMemberRole(TEAMMATE, TEAM.jorgeFinalRole, TEAM.workspace);
    },
  },
};

// ---- ensure ------------------------------------------------------------------------

function log(entry: Record<string, unknown>) {
  mkdirSync(dirname(logFile), { recursive: true });
  appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

/** «Sincronizar ahora», waiting for the toast of this sync (not one still on
 *  screen from an earlier one). Nothing to do while signed out. */
async function sync() {
  if (!(await userMenuTrigger().isExisting())) return;
  await recordToasts();
  await browser.execute(() => {
    for (const t of (window as unknown as { __tourToasts?: { used: boolean }[] }).__tourToasts ?? []) t.used = true;
  });
  await syncNow();
  await waitForToast(es.sync.doneToast.split("{{")[0], 30_000);
}

/** The contract after a load: an import may need one more sync to reach the
 *  server (its evidence, a second push), so it is read a few times. */
async function holdsAfterLoad(loader: Loader): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    if (await loader.check()) return true;
    await browser.pause(1_000);
    await sync();
  }
  return loader.check();
}

/**
 * Makes every prerequisite in `uses` (and what they are built on) hold, in
 * preparation order. Throws «prerequisite X could not be prepared: …» on the
 * first one that cannot be loaded or still does not hold after loading.
 */
export async function ensure(uses: Prereq[], chapter: ChapterId | "manual" = "manual") {
  if (uses.length === 0) return;
  const list = prerequisiteClosure(uses);
  let synced = false;
  for (const p of list) {
    const loader = LOADERS[p.id];
    const started = Date.now();
    try {
      // What the app made on screen counts only once the server has it.
      if (p.id !== "cuenta-liomar" && !synced) {
        await sync();
        synced = true;
      }
      if (await loader.check()) {
        log({ chapter, prerequisite: p.id, outcome: "present", ms: Date.now() - started });
        continue;
      }
      await loader.load();
      // API-made data reaches the app, and importer-made data the server.
      if (p.id !== "cuenta-liomar") await sync();
      if (!(await holdsAfterLoad(loader))) throw new Error(`its contract still does not hold after loading (${p.contract})`);
      log({ chapter, prerequisite: p.id, outcome: "loaded", ms: Date.now() - started });
      console.log(`› ${chapter}: loaded prerequisite «${p.id}» in ${((Date.now() - started) / 1000).toFixed(1)} s (${p.loader})`);
    } catch (err) {
      const message = (err as Error).message.split("\n")[0];
      log({ chapter, prerequisite: p.id, outcome: "failed", ms: Date.now() - started, error: message });
      throw new Error(`prerequisite «${p.id}» could not be prepared: ${message}`);
    }
  }
}

/**
 * After a subject chapter: whether the prerequisites it makes on screen hold
 * as their loaders would make them (drift between a chapter and its loader).
 * Never throws; a mismatch is logged and warned about.
 */
export async function verifyMade(chapter: ChapterId) {
  const made = PREREQUISITES.filter((p) => p.madeBy === chapter);
  if (made.length === 0) return;
  try {
    await sync();
    for (const p of made) {
      const holds = await LOADERS[p.id].check();
      log({ chapter, prerequisite: p.id, outcome: holds ? "made-on-screen" : "drift" });
      if (!holds) console.warn(`! ${chapter}: the chapter does not leave «${p.id}» as its loader makes it (${p.contract}); align it with e2e/tours/data/pharos.ts`);
    }
  } catch (err) {
    console.warn(`! ${chapter}: could not verify what the chapter made (${(err as Error).message.split("\n")[0]})`);
  }
}

/** Jorge's alias, for captions and assertions of the team chapters. */
export const JORGE = TEAMMATE;
