import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  baseDoc,
  dataTable,
  pdfBytes,
  savePdf,
  field,
  itemList,
  lines,
  section,
} from "@shared/export/pdfDoc";
import { tableSections } from "@shared/export/extraTables";
import { MILESTONES_TABLE } from "./planExtras";
import type { ExportablePlan } from "./planXlsx";
import { METRICS_TABLE, strategyTables } from "./planStrategy";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** Builds the pdfmake document for a test plan (pure — no I/O, testable). */
export function planDocDefinition(p: ExportablePlan, t: Translate): TDocumentDefinitions {
  const none = t("common.noData");
  // The milestones go under the schedule, where the wizard sets them (step
  // 14, PLN-05); the other extra tables (cycles) after the conclusion.
  const isMilestones = (x: { id?: string }) => x.id === MILESTONES_TABLE;
  const milestones = (p.extraTables ?? []).filter(isMilestones);
  const otherExtras = (p.extraTables ?? []).filter((x) => !isMilestones(x));
  // The 29119-3 sections of 0.4.0 (PLN-06), each where the wizard asks.
  const s = p.strategy;
  const list = (title: string, items: string[] | undefined) =>
    items && items.length ? section(title, itemList(items)) : [];
  const metricsTable = strategyTables(s, t).filter((x) => x.id === METRICS_TABLE);
  const linked = !!s?.criteria.some((c) => c.linked || !c.blocking);
  const content: Content[] = [
    { text: p.filenameBase || t("testPlan.defaultTitle"), style: "docTitle", margin: [0, 0, 0, 4] },
    {
      columns: [
        { text: `${t("testPlan.version")}: ${p.version || "—"}`, style: "meta" },
        { text: `${t("testPlan.date")}: ${p.planDate || "—"}`, style: "meta", alignment: "center" },
        { text: `${t("testPlan.status")}: ${p.status || "—"}`, style: "meta", alignment: "right" },
      ],
    },
    {
      columns: [
        { text: `${t("testPlan.author")}: ${p.author || "—"}`, style: "meta" },
        ...(p.documentId
          ? [{ text: `${t("testPlan.documentId")}: ${p.documentId}`, style: "meta", alignment: "right" as const }]
          : []),
      ],
      margin: [0, 2, 0, 0],
    },
    ...(p.approvedBy
      ? [{ text: `${t("testPlan.approval.by")}: ${p.approvedBy}`, style: "meta", margin: [0, 2, 0, 0] } as Content]
      : []),
    // The revision history right after the header (PLN-02), when asked.
    ...tableSections(p.history ? [p.history] : [], none),

    ...section(t("testPlan.summary"), field(p.summary)),
    ...section(t("testPlan.purpose"), field(p.purpose)),
    ...section(t("testPlan.scopeIn"), itemList(p.scopeIn)),
    ...section(t("testPlan.scopeOut"), itemList(p.scopeOut)),
    ...list(t("testPlan.assumptions"), s?.assumptions),
    ...list(t("testPlan.constraints"), s?.constraints),
    // Levels and types before the methodology, like the wizard (UX-31); the
    // types one line per group of the step.
    ...section(t("testPlan.testLevels"), itemList(p.testLevels)),
    ...section(
      t("testPlan.testTypes"),
      p.testTypeLines?.length ? lines(p.testTypeLines) : itemList(p.testTypes),
    ),
    ...list(t("testPlan.step.techniques"), s?.techniques),
    // One entry per line (PLN-05); older callers only have the composed line.
    ...section(
      t("testPlan.methodology"),
      p.methodologyLines ? lines(p.methodologyLines) : field(p.methodology),
    ),
    ...section(t("testPlan.step.deliverables"), itemList(p.deliverables)),
    ...section(t("testPlan.environmentConfig"), field(p.environmentConfig)),
    ...section(t("testPlan.environmentRequirements"), field(p.environmentRequirements)),
    ...section(t("testPlan.tools"), itemList(p.tools)),
    ...section(t("testPlan.automationStrategy"), field(p.automationStrategy)),
    ...section(t("testPlan.testDataManagement"), field(p.testDataManagement)),
    ...section(t("testPlan.defectManagement"), field(p.defectManagement)),

    ...section(
      t("testPlan.step.roles"),
      dataTable(
        [t("testPlan.roleCol"), t("testPlan.responsibilityCol")],
        p.roles.map((r) => [r.role, r.responsibility]),
        none,
        ["32%", "68%"],
      ),
    ),
    ...(s && (s.independence || s.independenceNote.trim())
      ? section(
          t("testPlan.independence"),
          lines([s.independence, s.independenceNote.trim()].filter(Boolean)),
        )
      : []),
    ...(s?.training.length
      ? section(
          t("testPlan.training"),
          dataTable(
            [t("testPlan.trainingNeedCol"), t("testPlan.trainingWhenCol")],
            s.training.map((r) => [r.need, r.when]),
            none,
            ["65%", "35%"],
          ),
        )
      : []),
    ...(s?.estimationLines.length ? section(t("testPlan.step.estimation"), lines(s.estimationLines)) : []),
    ...section(
      t("testPlan.step.schedule"),
      dataTable(
        [t("testPlan.sprintName"), t("testPlan.rangeCol")],
        p.sprints.map((s) => [s.name, s.range]),
        none,
        ["50%", "50%"],
      ),
    ),
    ...tableSections(milestones, none),
    ...section(
      t("testPlan.step.risks"),
      dataTable(
        [t("testPlan.riskCol"), t("testPlan.mitigationCol")],
        p.risks.map((r) => [r.risk, r.mitigation]),
        none,
        ["50%", "50%"],
      ),
    ),
    ...section(t("testPlan.communicationPlan"), field(p.communicationPlan)),
    ...list(t("testPlan.entryCriteria"), s?.entryCriteria),
    ...list(t("testPlan.suspensionCriteria"), s?.suspensionCriteria),
    ...list(t("testPlan.resumptionCriteria"), s?.resumptionCriteria),
    ...tableSections(metricsTable, none),
    ...section(
      t("testPlan.step.closure"),
      linked && s
        ? dataTable(
            [t("testPlan.criterionCol"), t("testPlan.metricCol"), t("testPlan.linkedCol"), t("testPlan.typeCol")],
            s.criteria.map((c) => [
              c.criterion,
              c.metric,
              c.linked || "—",
              t(c.blocking ? "testPlan.closureLink.blocking" : "testPlan.closureLink.advisory"),
            ]),
            none,
            ["38%", "18%", "28%", "16%"],
          )
        : dataTable(
            [t("testPlan.criterionCol"), t("testPlan.metricCol")],
            p.closureCriteria.map((c) => [c.criterion, c.metric]),
            none,
            ["60%", "40%"],
          ),
    ),
    ...section(t("testPlan.conclusion"), field(p.conclusion)),
    // Cycles (EXP-03), after the template's sections.
    ...tableSections(otherExtras, none),
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
