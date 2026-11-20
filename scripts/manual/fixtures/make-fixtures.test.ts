// The case study's import fixtures (MAN-03), made by Pharos itself from
// e2e/tours/data/pharos.ts: the plan .xlsx by the plan exporter, each base
// case .xlsx by the case exporter (the same code «Exportar .xlsx» runs in the
// app), and the requirement CSVs in the format «Importar requisitos (.csv)»
// reads. Never hand-made.
//
//   npm run manual:fixtures          checks that the committed files are what
//                                    the exporters make from data/pharos.ts
//   PHAROS_WRITE_FIXTURES=1 npm run manual:fixtures      rewrites them
//
// Run under Vitest (scripts/manual/fixtures/vitest.config.ts) because the
// exporters are app code (aliases, `?url` templates, i18n).
// The generator runs the exporters themselves, which are module internals.
/* eslint-disable no-restricted-imports */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import i18n from "@shared/i18n";
import type { CustomField } from "@modules/custom-fields/model/types";
import { buildCaseXlsx } from "@modules/test-cases/export/caseXlsx";
import { caseToExportable } from "@modules/test-cases/export/batch";
import { parseCaseXlsx } from "@modules/test-cases/import/caseImport";
import { reconcileFlows, reconcileTable, stepsOf } from "@modules/test-cases/model/steps";
import type { TestCase, TestCaseData } from "@modules/test-cases/model/types";
import { milestonesTable } from "@modules/test-plan/export/planExtras";
import { buildPlanXlsx } from "@modules/test-plan/export/planXlsx";
import { parsePlanXlsx } from "@modules/test-plan/import/planImport";
import { linkedText, newMetricId } from "@modules/test-plan/model/metrics";
import { frequenciesFor } from "@modules/test-plan/model/methodology";
import { defaults, toExportable, type FormState } from "@modules/test-plan/ui/wizard/formState";
import { AI_MATERIAL, BASE_CASES, CUSTOM_FIELDS, PLAN, PROJECT_A, REQUIREMENTS } from "../../../e2e/tours/data/pharos";
import { PERSONA } from "../persona.mjs";

const ROOT = resolve(__dirname, "../../..");
const OUT = join(ROOT, "e2e", "tours", "fixtures", "pharos");
const WRITE = process.env.PHAROS_WRITE_FIXTURES === "1";
const AUTHOR = `${PERSONA.first} ${PERSONA.last}`;
const t = i18n.getFixedT("es");

/** The exporters fetch their bundled template: here it comes from disk. */
function serveTemplates() {
  vi.stubGlobal("fetch", async (url: string) => new Response(new Uint8Array(readFileSync(join(ROOT, String(url).replace(/^\//, "").split("?")[0])))));
}

/** Writes a fixture (--write) or checks the committed one against it. */
async function settle(name: string, fresh: Uint8Array | string, same: (committed: Buffer) => Promise<void> | void) {
  const file = join(OUT, name);
  if (WRITE) {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, fresh);
    return;
  }
  expect(existsSync(file), `${name} is missing: run PHAROS_WRITE_FIXTURES=1 npm run manual:fixtures`).toBe(true);
  await same(readFileSync(file));
}

/** Content without the ids an import gives anew (a criterion's metric link
 *  is kept as «linked»: the metric ids are new on each import). */
const content = (v: unknown) =>
  JSON.parse(JSON.stringify(v, (k, x) => (k === "id" ? undefined : k === "metricId" && x ? "linked" : x)));

// ---- Requirements --------------------------------------------------------------

/** A cell as Excel writes it: quoted when it holds the separator or a quote. */
const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
const csv = (rows: typeof REQUIREMENTS) =>
  ["ID;Título;Descripción;Prioridad", ...rows.map((r) => [r.key, r.title, r.description, r.priority].map(cell).join(";"))].join("\n") + "\n";

/** «API de sincronización» before the AI chapter proposes more. */
const API_REQUIREMENTS: typeof REQUIREMENTS = [
  { key: "API-REQ-001", title: "Enviar los cambios del equipo con /sync/push", description: "El escritorio envía sus cambios en lotes; cada uno lleva su revisión y su marca HLC.", priority: "Alta" },
  { key: "API-REQ-002", title: "Traer los cambios del servidor con /sync/pull", description: "El escritorio pide lo que cambió desde su último cursor, página a página.", priority: "Alta" },
  { key: "API-REQ-003", title: "Detectar un conflicto campo a campo", description: "Si dos equipos cambian el mismo campo sin sincronizar, el servidor devuelve un conflicto en lugar de pisar uno de los cambios.", priority: "Media" },
];

describe("case-study fixtures (e2e/tours/fixtures/pharos)", () => {
  it("requirement CSVs", async () => {
    const files: [string, string][] = [
      ["requisito-acceso.csv", csv(REQUIREMENTS.filter((r) => r.key === "REQ-001"))],
      ["requisitos-pharos.csv", csv(REQUIREMENTS.filter((r) => r.key !== "REQ-001"))],
      [AI_MATERIAL.requirementsCsv, csv(API_REQUIREMENTS)],
    ];
    for (const [name, text] of files) await settle(name, text, (c) => expect(c.toString("utf8")).toBe(text));
  });

  it("the plan, exported by the plan exporter", async () => {
    serveTemplates();
    const base = defaults(t, PROJECT_A.name, { prefix: `${PROJECT_A.prefix}-`, lang: "es" });
    const own = { id: newMetricId(base.metrics), kind: null, name: PLAN.ownMetric.name, op: ">=" as const, target: PLAN.ownMetric.target, unit: "score" as const };
    const metrics = [...base.metrics, own];
    const form: FormState = {
      ...base,
      title: PLAN.title,
      version: PLAN.version,
      planDate: PLAN.planDate,
      documentId: `TP-${PROJECT_A.prefix}-0600`,
      summary: PLAN.summary,
      scopeIn: PLAN.scopeIn,
      scopeOut: PLAN.scopeOut,
      assumptions: PLAN.assumptions,
      constraints: PLAN.constraints,
      testLevels: PLAN.testLevels,
      testTypes: PLAN.testTypes,
      techniques: PLAN.techniques,
      methodologyType: PLAN.methodology.type,
      sprintWeeks: PLAN.methodology.sprintWeeks,
      ceremonies: PLAN.methodology.ceremonies,
      ceremonyFrequency: frequenciesFor(PLAN.methodology.ceremonies, PLAN.methodology.frequency),
      deliverables: PLAN.deliverables,
      environmentConfig: PLAN.environmentConfig,
      environmentRequirements: PLAN.environmentRequirements,
      tools: PLAN.tools,
      automationStrategy: PLAN.automationStrategy,
      testDataManagement: PLAN.testDataManagement,
      defectManagement: PLAN.defectManagement,
      roles: PLAN.roles.map(([role, responsibility]) => ({ role, responsibility })),
      independence: PLAN.independence,
      independenceNote: PLAN.independenceNote,
      training: PLAN.training.map(([need, when]) => ({ need, when })),
      estimation: PLAN.estimation,
      sprints: PLAN.sprints.map((s, i) => ({ id: `s${i + 1}`, ...s })),
      milestones: PLAN.milestones.map((m, i) => ({ id: `m${i + 1}`, ...m })),
      risks: PLAN.risks.map(([risk, mitigation]) => ({ risk, mitigation })),
      communicationPlan: PLAN.communicationPlan,
      entryCriteria: PLAN.entryCriteria,
      suspensionCriteria: PLAN.suspensionCriteria,
      resumptionCriteria: PLAN.resumptionCriteria,
      metrics,
      closureCriteria: [
        ...base.closureCriteria,
        // The own metric is an exit criterion, advisory (chapter 5).
        { ...linkedText(own, t, "es"), metricId: own.id, blocking: false },
        ...PLAN.closure.map(([criterion, metric]) => ({ criterion, metric, blocking: true })),
      ],
      purpose: PLAN.purpose,
      conclusion: PLAN.conclusion,
    };
    // With `t`: the strategy, metrics and criteria sheets are found by their
    // translated names on import («Estrategia 29119-3»…), not by their keys.
    // As a Pharos export: with the «Hitos» sheet (EXP-03), which the import
    // reads back (FIX-40).
    const exportable = { ...toExportable(form, AUTHOR, t, "es"), extraTables: [milestonesTable(form.milestones, t)] };
    const { buffer } = await buildPlanXlsx(exportable, "es", t);
    const fresh = new Uint8Array(buffer as ArrayBuffer);
    const parsed = async (b: ArrayBuffer | Uint8Array) => content((await parsePlanXlsx(b instanceof Uint8Array ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : b, PLAN.file, AUTHOR)).input);
    const mine = await parsed(fresh);
    expect(mine.title).toBe(PLAN.title);
    // The strategy sheet was read back (assumptions, techniques, estimation…).
    expect(mine.data.assumptions).toEqual(PLAN.assumptions);
    expect(mine.data.techniques).toEqual(PLAN.techniques);
    await settle(PLAN.file, fresh, async (c) => expect(await parsed(new Uint8Array(c))).toEqual(mine));
  });

  it("the four base cases, exported by the case exporter", async () => {
    serveTemplates();
    const at = "2026-11-16T09:00:00.000Z";
    const field = (f: (typeof CUSTOM_FIELDS)[keyof typeof CUSTOM_FIELDS], position: number): CustomField => ({
      id: f.fieldKey,
      projectId: "p",
      entity: f.entity,
      fieldKey: f.fieldKey,
      label: f.label,
      description: "",
      fieldType: f.fieldType,
      options: f.options.map((label) => ({ id: label.slice(0, 8).toUpperCase().padEnd(8, "0"), label, archived: false })),
      required: false,
      defaultValue: null,
      appliesToCaseTypes: null,
      position,
      archivedAt: null,
      createdAt: at,
      updatedAt: at,
      revision: 1,
    });
    const fields = [field(CUSTOM_FIELDS.browser, 0), field(CUSTOM_FIELDS.criticalRegression, 1)];
    for (const c of BASE_CASES) {
      const custom: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(c.custom)) {
        const def = fields.find((f) => f.fieldKey === key);
        custom[key] = def?.fieldType === "select" ? def.options.find((o) => o.label === value)?.id : value;
      }
      let data: TestCaseData;
      if (c.level === "advanced") {
        data = {
          gherkinLevel: "advanced",
          flows: reconcileFlows(undefined, [
            { name: t("testCase.flow.mainName"), steps: [...c.mainFlow], expectedResult: "" },
            { name: c.altFlow.name, steps: [...c.altFlow.steps], expectedResult: "" },
          ]),
        };
      } else if (c.level === "outline") {
        data = {
          gherkinLevel: "outline",
          steps: stepsOf([...c.steps]),
          expectedResult: c.expectedResult,
          examples: reconcileTable(undefined, { headers: ["correo", "contraseña"], rows: c.examples.map((r) => [...r]) }),
        };
      } else if ("checklist" in c) {
        data = { gherkinLevel: "basic", steps: stepsOf([...c.checklist]), traceability: c.otherReferences };
      } else {
        data = { gherkinLevel: "basic", steps: stepsOf([...c.steps]), expectedResult: c.expectedResult };
      }
      data = { ...data, requirementKeys: [...c.requirementKeys], custom };
      const tc: TestCase = {
        id: c.key,
        workspaceId: "ws",
        projectId: "p",
        scenarioId: c.key,
        title: c.title,
        version: "1.0",
        status: "draft",
        priority: c.priority,
        caseType: "caseType" in c ? c.caseType : null,
        automationStatus: null,
        author: AUTHOR,
        data,
        createdBy: "liomar",
        createdAt: at,
        updatedAt: at,
        revision: 1,
      };
      const { buffer } = await buildCaseXlsx(caseToExportable(tc, t, fields), "es");
      const fresh = new Uint8Array(buffer as ArrayBuffer);
      const parsed = async (b: Uint8Array) =>
        content((await parseCaseXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, c.file, AUTHOR)).input);
      const mine = await parsed(fresh);
      expect(mine.title).toBe(c.title);
      await settle(join("casos", c.file), fresh, async (committed) => expect(await parsed(new Uint8Array(committed))).toEqual(mine));
    }
  });
});
