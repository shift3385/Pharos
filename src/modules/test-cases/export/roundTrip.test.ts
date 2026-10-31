// Round-trip of a case with stable steps (DAT-02): editor data → .xlsx (the
// template a user fills and re-imports) → import gives back every step, row and
// flow text, now as steps with ids of their own (an import is a new case).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TestCase, TestCaseData } from "../model/types";
import { reconcileFlows, reconcileTable, stepsOf, texts } from "../model/steps";
import { parseCaseXlsx } from "../import/caseImport";
import { caseToExportable } from "./batch";
import { buildCaseXlsx } from "./caseXlsx";

const ROOT = resolve(__dirname, "../../../..");
const t = (key: string) => key;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(readFileSync(join(ROOT, url.replace(/^\//, "")))),
  );
});

const asCase = (scenarioId: string, data: TestCaseData): TestCase => ({
  id: "c",
  workspaceId: "ws",
  projectId: "p",
  scenarioId,
  title: "Round trip",
  version: "1.0",
  status: "draft",
  priority: "medium",
  caseType: null,
  automationStatus: null,
  author: "QA",
  data,
  createdAt: "",
  updatedAt: "",
  revision: 1,
});

async function roundTrip(c: TestCase) {
  const { buffer } = await buildCaseXlsx(caseToExportable(c, t), "es");
  const { input } = await parseCaseXlsx(buffer, `${c.scenarioId}.xlsx`, "QA");
  return input.data;
}

const allIds = (d: TestCaseData) => [
  ...(d.preconditions ?? []).map((s) => s.id),
  ...(d.steps ?? []).map((s) => s.id),
  ...(d.background ?? []).map((s) => s.id),
  ...(d.examples?.rows ?? []).map((r) => r.id),
  ...(d.flows ?? []).flatMap((f) => [
    ...f.steps.map((s) => s.id),
    ...(f.examples?.rows ?? []).map((r) => r.id),
  ]),
];

describe("editor ↔ .xlsx ↔ import", () => {
  it("basic: preconditions and steps come back as steps with ids", async () => {
    const data: TestCaseData = {
      gherkinLevel: "basic",
      preconditions: stepsOf(["Usuario registrado", "Carrito con ñandú"]),
      steps: stepsOf(["Abrir el carrito", "Pagar"]),
      expectedResult: "Pedido creado",
    };
    const back = await roundTrip(asCase("ATS_010", data));
    expect(texts(back.preconditions)).toEqual(texts(data.preconditions));
    expect(texts(back.steps)).toEqual(texts(data.steps));
    expect(back.expectedResult).toBe("Pedido creado");
    const ids = allIds(back);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("outline: the Examples rows come back with their values", async () => {
    const data: TestCaseData = {
      gherkinLevel: "outline",
      steps: stepsOf(["entro como <user>"]),
      expectedResult: "veo <r>",
      examples: reconcileTable(undefined, {
        headers: ["user", "r"],
        rows: [
          ["ana", "ok"],
          ["bob", "no"],
        ],
      }),
    };
    const back = await roundTrip(asCase("ATS_011", data));
    expect(back.gherkinLevel).toBe("outline");
    expect(back.examples?.headers).toEqual(["user", "r"]);
    expect(back.examples?.rows.map((r) => r.values)).toEqual([
      ["ana", "ok"],
      ["bob", "no"],
    ]);
  });

  it("advanced: background and every flow come back", async () => {
    const data: TestCaseData = {
      gherkinLevel: "advanced",
      background: stepsOf(["la tienda está abierta"]),
      flows: reconcileFlows(undefined, [
        {
          name: "Pago",
          preconditions: ["un carrito"],
          steps: ["pago", "confirmo"],
          expectedResult: "pagado",
        },
        {
          name: "Rechazo",
          steps: ["pago con <card>"],
          expectedResult: "rechazado",
          examples: { headers: ["card"], rows: [["caducada"]] },
        },
      ]),
    };
    const back = await roundTrip(asCase("ATS_012", data));
    expect(texts(back.background)).toEqual(["la tienda está abierta"]);
    expect(
      back.flows?.map((f) => [f.name, texts(f.preconditions), texts(f.steps)]),
    ).toEqual([
      ["Pago", ["un carrito"], ["pago", "confirmo"]],
      ["Rechazo", [], ["pago con <card>"]],
    ]);
    expect(back.flows?.[1].examples?.rows.map((r) => r.values)).toEqual([
      ["caducada"],
    ]);
    const ids = allIds(back);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
