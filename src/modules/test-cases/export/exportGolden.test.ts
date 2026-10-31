// Golden exports (DAT-02): stable step ids must not change what users get. The
// files under __golden__/ were written by the export code of 0.2.0-alpha.1 + E1
// (text steps), before steps had ids. Every case here is exported twice, as it
// was stored then (text steps) and as it is stored now ({id, text} steps, Outline
// rows with ids), and both must give exactly those files:
//  - the .feature text, byte for byte;
//  - the .xlsx, part by part (every sheet, style and string), except the
//    workbook's own creation/modification timestamps (docProps/core.xml).
// Regenerate them (PHAROS_UPDATE_GOLDEN=1) only for a deliberate export change,
// which VERSIONING §6.6 allows only in a MINOR with a CHANGELOG note.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import JSZip from "jszip";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestCase } from "../model/types";
import { caseToExportable } from "./batch";
import { buildCaseXlsx } from "./caseXlsx";

const ROOT = resolve(__dirname, "../../../..");
const GOLDEN = join(__dirname, "__golden__");
const UPDATE = process.env.PHAROS_UPDATE_GOLDEN === "1";

const t = (key: string) => `«${key}»`;

function legacyCase(
  id: string,
  title: string,
  data: Record<string, unknown>,
): TestCase {
  return {
    id,
    workspaceId: "ws",
    projectId: "p1",
    scenarioId: id,
    title,
    version: "1.2",
    status: "approved",
    priority: "high",
    author: "QA Ñandú",
    data: data as TestCase["data"],
    createdAt: "2026-10-01 10:00:00",
    updatedAt: "2026-10-02 10:00:00",
    revision: 3,
  };
}

/** The cases, as 0.2.0-alpha.1 stored them (text steps, plain rows). */
const LEGACY: TestCase[] = [
  legacyCase("ATS_001", "Pagar con tarjeta", {
    gherkinLevel: "basic",
    mappedUseCase: "UC-7",
    caseDate: "2026-10-01",
    description: "Pago con tarjeta guardada",
    preconditions: ["Usuario registrado", "  ", "Carrito con 2 artículos"],
    steps: ["Abrir el carrito", "", "Pagar", "Confirmar <importe>"],
    expectedResult: "Pedido creado\nCorreo enviado",
    postconditions: ["Stock actualizado"],
    acceptanceCriteria: ["AC-1"],
    testData: "Tarjeta 4111…",
    notes: "Nota",
    requirementKeys: ["REQ-001", "REQ-002"],
    featureTags: ["checkout"],
    scenarioTags: ["smoke", "ui"],
  }),
  legacyCase("ATS_002", "Login por rol", {
    gherkinLevel: "outline",
    preconditions: ["el usuario <user> existe"],
    steps: ["inicio sesión como <user>", "abro <page>"],
    expectedResult: "veo <result>",
    examples: {
      headers: ["user", "page", "result"],
      rows: [
        ["ana", "home", "ok"],
        ["", "", ""],
        ["bob", "admin", "denegado"],
        ["ana", "home", "ok"],
      ],
    },
    testData: "",
  }),
  legacyCase("ATS_003", "Checkout completo", {
    gherkinLevel: "advanced",
    background: ["la tienda está abierta", "precios en EUR"],
    flows: [
      {
        id: "f-main",
        name: "Pago correcto",
        preconditions: ["un carrito"],
        steps: ["pago", "confirmo"],
        expectedResult: "pagado",
        tags: ["smoke"],
      },
      {
        id: "f-alt",
        name: "Tarjeta rechazada",
        preconditions: [],
        steps: ["pago con <card>"],
        expectedResult: "rechazado",
        examples: { headers: ["card"], rows: [["caducada"], ["robada"]] },
      },
    ],
    requirementKeys: ["REQ-009"],
  }),
  legacyCase("ATS_004", "Feature a mano", {
    gherkinLevel: "advanced",
    featureSource:
      "@REQ-1\nFeature: A mano\n\n  Background:\n    Given algo\n\n  @ATS_004\n  Scenario: Uno\n    When hago\n    Then pasa\n\n  Scenario Outline: Dos\n    When uso <x>\n    Then <y>\n\n    Examples:\n      | x | y |\n      | 1 | 2 |\n",
  }),
  legacyCase("ATS_005", "Avanzado sin flujos", {
    gherkinLevel: "advanced",
    preconditions: ["p1"],
    steps: ["s1"],
    expectedResult: "r1",
  }),
];

let n = 0;
const id = () => `G${String(++n).padStart(7, "0")}`;
const steps = (list: unknown) =>
  Array.isArray(list)
    ? list.map((text) => ({ id: id(), text, expected: "not exported" }))
    : list;
const table = (ex: unknown) =>
  ex && typeof ex === "object"
    ? {
        ...(ex as object),
        rows: ((ex as { rows: string[][] }).rows ?? []).map((values) => ({
          id: id(),
          values,
        })),
      }
    : ex;

/** The same cases as 0.2.0 stores them: every step and row has an id. */
function stable(c: TestCase): TestCase {
  const d = c.data as Record<string, unknown>;
  const flows = d.flows as Record<string, unknown>[] | undefined;
  return {
    ...c,
    data: {
      ...d,
      ...(d.preconditions ? { preconditions: steps(d.preconditions) } : {}),
      ...(d.steps ? { steps: steps(d.steps) } : {}),
      ...(d.background ? { background: steps(d.background) } : {}),
      ...(d.examples ? { examples: table(d.examples) } : {}),
      ...(flows
        ? {
            flows: flows.map((f) => ({
              ...f,
              preconditions: steps(f.preconditions),
              steps: steps(f.steps),
              ...(f.examples ? { examples: table(f.examples) } : {}),
            })),
          }
        : {}),
    } as TestCase["data"],
  };
}

/** Every part of an .xlsx but its timestamps, as text. */
async function xlsxParts(buffer: ArrayBuffer): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(buffer);
  const out: Record<string, string> = {};
  for (const name of Object.keys(zip.files).sort()) {
    if (zip.files[name].dir || name === "docProps/core.xml") continue;
    out[name] = await zip.files[name].async("string");
  }
  return out;
}

beforeAll(() => {
  if (UPDATE && !existsSync(GOLDEN)) mkdirSync(GOLDEN);
});
beforeEach(() => {
  // The template is a bundled asset (`?url`): read it from the repository.
  vi.stubGlobal("fetch", async (url: string) => {
    const bytes = readFileSync(
      join(ROOT, url.replace(/^\//, "").replace(/\?.*$/, "")),
    );
    return new Response(bytes);
  });
});

function golden(name: string, actual: string) {
  const file = join(GOLDEN, name);
  if (UPDATE) writeFileSync(file, actual);
  expect(actual, name).toBe(readFileSync(file, "utf8"));
}

describe.each([
  ["as 0.2.0-alpha.1 stored them", (c: TestCase) => c],
  ["with stable step ids", stable],
])("exports are unchanged — cases %s", (_label, shape) => {
  for (const legacy of LEGACY) {
    it(`${legacy.scenarioId}: .feature byte for byte`, () => {
      golden(
        `${legacy.scenarioId}.feature`,
        caseToExportable(shape(legacy), t).gherkin,
      );
    });
    it(`${legacy.scenarioId}: .xlsx part by part (es and en)`, async () => {
      for (const lang of ["es", "en"]) {
        const { buffer } = await buildCaseXlsx(
          caseToExportable(shape(legacy), t),
          lang,
        );
        golden(
          `${legacy.scenarioId}.${lang}.xlsx.json`,
          JSON.stringify(await xlsxParts(buffer), null, 1),
        );
      }
    });
  }
});
