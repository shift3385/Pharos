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
import type { ExportablePlan } from "./planXlsx";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** Builds the pdfmake document for a test plan (pure — no I/O, testable). */
export function planDocDefinition(p: ExportablePlan, t: Translate): TDocumentDefinitions {
  const none = t("common.noData");
  const content: Content[] = [
    { text: p.filenameBase || t("testPlan.defaultTitle"), style: "docTitle", margin: [0, 0, 0, 4] },
    {
      columns: [
        { text: `${t("testPlan.version")}: ${p.version || "—"}`, style: "meta" },
        { text: `${t("testPlan.date")}: ${p.planDate || "—"}`, style: "meta", alignment: "center" },
        { text: `${t("testPlan.status")}: ${p.status || "—"}`, style: "meta", alignment: "right" },
      ],
    },
    { text: `${t("testPlan.author")}: ${p.author || "—"}`, style: "meta", margin: [0, 2, 0, 0] },

    sectionHeader(t("testPlan.summary")),
    field(p.summary),
    sectionHeader(t("testPlan.purpose")),
    field(p.purpose),
    sectionHeader(t("testPlan.scopeIn")),
    itemList(p.scopeIn),
    sectionHeader(t("testPlan.scopeOut")),
    itemList(p.scopeOut),
    sectionHeader(t("testPlan.step.types")),
    itemList(p.testTypes),
    sectionHeader(t("testPlan.methodology")),
    field(p.methodology),
    sectionHeader(t("testPlan.step.levels")),
    itemList(p.testLevels),
    sectionHeader(t("testPlan.step.deliverables")),
    itemList(p.deliverables),
    sectionHeader(t("testPlan.environmentConfig")),
    field(p.environmentConfig),
    sectionHeader(t("testPlan.environmentRequirements")),
    field(p.environmentRequirements),
    sectionHeader(t("testPlan.tools")),
    itemList(p.tools),
    sectionHeader(t("testPlan.automationStrategy")),
    field(p.automationStrategy),
    sectionHeader(t("testPlan.testDataManagement")),
    field(p.testDataManagement),
    sectionHeader(t("testPlan.defectManagement")),
    field(p.defectManagement),

    sectionHeader(t("testPlan.step.roles")),
    dataTable(
      [t("testPlan.roleCol"), t("testPlan.responsibilityCol")],
      p.roles.map((r) => [r.role, r.responsibility]),
      none,
      ["32%", "68%"],
    ),
    sectionHeader(t("testPlan.step.schedule")),
    dataTable(
      [t("testPlan.sprintName"), t("testPlan.rangeCol")],
      p.sprints.map((s) => [s.name, s.range]),
      none,
      ["50%", "50%"],
    ),
    sectionHeader(t("testPlan.step.risks")),
    dataTable(
      [t("testPlan.riskCol"), t("testPlan.mitigationCol")],
      p.risks.map((r) => [r.risk, r.mitigation]),
      none,
      ["50%", "50%"],
    ),
    sectionHeader(t("testPlan.communicationPlan")),
    field(p.communicationPlan),
    sectionHeader(t("testPlan.step.closure")),
    dataTable(
      [t("testPlan.criterionCol"), t("testPlan.metricCol")],
      p.closureCriteria.map((c) => [c.criterion, c.metric]),
      none,
      ["60%", "40%"],
    ),
    sectionHeader(t("testPlan.conclusion")),
    field(p.conclusion),
  ];
  return baseDoc(t("testPlan.pdfKind"), content);
}

/** File name of a plan PDF. */
export const planPdfName = (p: ExportablePlan) => `${p.filenameBase || "plan"}.pdf`;

/** Builds the plan PDF bytes (for the project ZIP, EXP-02). */
export async function buildPlanPdf(p: ExportablePlan, t: Translate): Promise<Uint8Array> {
  return pdfBytes(planDocDefinition(p, t));
}

/** Builds the plan PDF and saves it. Returns where (see saveFile). */
export async function exportPlanPdf(p: ExportablePlan, t: Translate): Promise<string> {
  return savePdf(planDocDefinition(p, t), planPdfName(p));
}
