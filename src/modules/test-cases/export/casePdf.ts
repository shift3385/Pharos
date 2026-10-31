import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  baseDoc,
  dataTable,
  pdfBytes,
  savePdf,
  field,
  itemList,
  sectionHeader,
} from "@shared/export/pdfDoc";
import type { ExampleTable, Flow } from "../model/types";
import {
  tableText,
  texts,
  type TextFlow,
  type TextTable,
} from "../model/steps";
import type { ExportableCase } from "./caseXlsx";
import { traceabilityText } from "../model/trace";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

// Steps print as their texts (DAT-02): the document is what it was.
const clean = (a?: readonly unknown[]) =>
  texts(a)
    .map((s) => s.trim())
    .filter(Boolean);

/** Renders an Examples data table as its own labelled block (empty → nothing). */
function examplesBlock(
  table: ExampleTable | TextTable | undefined,
  label: string,
  none: string,
): Content[] {
  if (!table || !table.headers.some((h) => h.trim())) return [];
  const ex = tableText(table);
  return [
    { text: label, style: "value", bold: true, margin: [0, 4, 0, 2] },
    dataTable(ex.headers, ex.rows, none),
  ];
}

/** Body sections shared by every level (preconditions → notes). */
function standardBody(
  c: ExportableCase,
  t: Translate,
  none: string,
  over?: {
    preconditions?: readonly unknown[];
    steps?: readonly unknown[];
    expected?: string;
    examples?: ExampleTable | TextTable;
  },
): Content[] {
  const d = c.data ?? {};
  const preconditions = texts(over?.preconditions ?? d.preconditions);
  const steps = texts(over?.steps ?? d.steps);
  const expected = over?.expected ?? d.expectedResult ?? "";
  const examples = over?.examples ?? d.examples;
  return [
    sectionHeader(t("testCase.preconditions")),
    itemList(preconditions),
    sectionHeader(t("testCase.steps")),
    itemList(steps, true),
    sectionHeader(t("testCase.expectedResult")),
    field(expected),
    sectionHeader(t("testCase.testData")),
    field(d.testData ?? ""),
    ...examplesBlock(examples, t("testCase.examples.title"), none),
    sectionHeader(t("testCase.postconditions")),
    itemList(d.postconditions ?? []),
    sectionHeader(t("testCase.acceptanceCriteria")),
    itemList(d.acceptanceCriteria ?? []),
    sectionHeader(t("testCase.notes")),
    field(d.notes ?? ""),
  ];
}

/** One block per alternative flow (name + its precond/steps/expected/examples). */
function altFlowBlocks(
  flows: readonly (Flow | TextFlow)[],
  c: ExportableCase,
  t: Translate,
  none: string,
): Content[] {
  const out: Content[] = [];
  for (const flow of flows) {
    out.push(sectionHeader(`${c.altFlowLabel ?? "ALTERNATIVE FLOW"}: ${flow.name}`));
    if (clean(flow.preconditions).length) {
      out.push({
        text: t("testCase.preconditions"),
        style: "value",
        bold: true,
        margin: [0, 2, 0, 2],
      });
      out.push(itemList(texts(flow.preconditions)));
    }
    if (clean(flow.steps).length) {
      out.push({
        text: t("testCase.steps"),
        style: "value",
        bold: true,
        margin: [0, 2, 0, 2],
      });
      out.push(itemList(texts(flow.steps), true));
    }
    if (flow.expectedResult?.trim()) {
      out.push({ text: t("testCase.expectedResult"), style: "value", bold: true, margin: [0, 2, 0, 2] });
      out.push(field(flow.expectedResult));
    }
    out.push(...examplesBlock(flow.examples, c.examplesLabel ?? "EXAMPLES", none));
  }
  return out;
}

/** Builds the pdfmake document for a test case (pure — no I/O, testable). */
export function caseDocDefinition(c: ExportableCase, t: Translate): TDocumentDefinitions {
  const none = t("common.noData");
  const d = c.data ?? {};
  const meta = (label: string, value?: string) =>
    ({ text: [{ text: `${label}: `, bold: true }, value?.trim() ? value : "—"], style: "meta" }) as Content;

  const content: Content[] = [
    { text: c.title || t("testCase.defaultTitle"), style: "docTitle", margin: [0, 0, 0, 4] },
    {
      columns: [
        meta(t("testCase.scenarioId"), c.scenarioId),
        meta(t("testCase.version"), c.version),
        meta(t("testCase.priority"), c.priority),
      ],
    },
    {
      columns: [meta(t("testCase.status"), c.status), meta(t("testCase.author"), c.author), meta(t("testCase.caseDate"), d.caseDate)],
      margin: [0, 2, 0, 0],
    },
    meta(t("testCase.mappedUseCase"), d.mappedUseCase),
    meta(t("testCase.traceability"), traceabilityText(d)),
    sectionHeader(t("testCase.description")),
    field(d.description ?? ""),
  ];

  if (c.level === "advanced" && c.flows && c.flows.length > 0) {
    const [main, ...alt] = c.flows;
    content.push(
      ...standardBody(c, t, none, {
        preconditions: [...clean(c.background), ...clean(main.preconditions)],
        steps: main.steps,
        expected: main.expectedResult,
        examples: main.examples,
      }),
      ...altFlowBlocks(alt, c, t, none),
    );
  } else {
    content.push(...standardBody(c, t, none));
  }

  // Case type, automation and custom fields (FLD-01), when the case has any.
  if (c.customRows?.length) {
    content.push(
      sectionHeader(c.customSheet?.name ?? t("testCase.exportSheet")),
      dataTable(
        [c.customSheet?.headers[0] ?? "", c.customSheet?.headers[2] ?? ""],
        c.customRows.map((r) => [r.label, r.value]),
        none,
      ),
    );
  }

  if (c.gherkin?.trim()) {
    content.push(sectionHeader(t("testCase.tab.gherkin")), {
      text: c.gherkin,
      style: "mono",
      preserveLeadingSpaces: true,
    });
  }

  return baseDoc(t("testCase.pdfKind"), content);
}

/** File name of a case PDF. */
export const casePdfName = (c: ExportableCase) => `${c.scenarioId || "case"}.pdf`;

/** Builds the case PDF bytes (for the project ZIP, EXP-02). */
export async function buildCasePdf(c: ExportableCase, t: Translate): Promise<Uint8Array> {
  return pdfBytes(caseDocDefinition(c, t));
}

/** Builds the case PDF and saves it. Returns where (see saveFile). */
export async function exportCasePdf(c: ExportableCase, t: Translate): Promise<string> {
  return savePdf(caseDocDefinition(c, t), casePdfName(c));
}
