import {
  customFieldApi,
  effectiveCaseType,
  type CustomField,
} from "@modules/custom-fields";
import type { TestCase, TestCaseSummary } from "../model/types";
import { flowsToGherkin, isProvisionalKey, parseFeatureFlows, toGherkin } from "../ui/gherkin";
import { testCaseApi } from "../api/testCaseApi";
import { buildCaseXlsx, type ExportableCase } from "./caseXlsx";
import { buildCasePdf, casePdfName } from "./casePdf";
import { customSheetLabels, customSheetRows } from "./customSheet";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** Maps a stored case to the export shape (mirrors the editor's derivations):
 *  advanced cases reconstruct flows/background from the feature when needed. */
export function caseToExportable(
  c: TestCase,
  t: Translate,
  fields: CustomField[] = [],
): ExportableCase {
  const d = c.data ?? {};
  const level = d.gherkinLevel ?? "basic";
  const fromFeature = d.featureSource
    ? parseFeatureFlows(d.featureSource)
    : { background: [], flows: [] };
  const background = d.background ?? fromFeature.background;
  const flows = d.flows ?? fromFeature.flows;
  const gherkin =
    level === "advanced"
      ? flowsToGherkin(c.title, background, flows, {
          scenarioId: c.scenarioId,
          requirementKeys: d.requirementKeys,
          featureTags: d.featureTags,
        })
      : toGherkin(c.title, d, c.scenarioId);
  return {
    scenarioId: c.scenarioId,
    title: c.title,
    version: c.version,
    priority: t(`testCase.priorityLabel.${c.priority}`),
    status: t(`testCase.statusLabel.${c.status}`),
    author: c.author,
    data: d,
    gherkin,
    level,
    background,
    flows,
    altFlowLabel: t("testCase.flow.altUpper"),
    examplesLabel: t("testCase.examples.title"),
    customRows: customSheetRows(
      {
        caseType: c.caseType,
        automationStatus: c.automationStatus,
        custom: d.custom,
      },
      fields,
      t,
    ),
    customSheet: customSheetLabels(t),
  };
}

/** File name of a case's .feature: its ID, made safe for any file system. */
export function featureFileName(scenarioId: string): string {
  return `${scenarioId.replace(/[^\p{L}\p{N}_.-]+/gu, "_") || "scenario"}.feature`;
}

/** Every case of a project as a .feature file with its ID and requirement
 *  tags (TRZ-03), for the batch export (spec §5.3 "en lote por proyecto").
 *  `provisional` marks a case whose key is still provisional (DAT-01): its
 *  file has no ID tag yet. `ids` limits it to those cases (the selection).
 *  A checklist has no Gherkin (FLD-01): it is left out, and counted in
 *  `onSkipChecklist`. */
export async function projectFeatureFiles(
  projectId: string,
  userId: string,
  t: Translate,
  ids?: ReadonlySet<string>,
  onSkipChecklist?: () => void,
): Promise<{ name: string; content: string; provisional: boolean }[]> {
  const out: { name: string; content: string; provisional: boolean }[] = [];
  for (const s of await testCaseApi.list(projectId, userId)) {
    if (ids && !ids.has(s.id)) continue;
    if (effectiveCaseType(s.caseType) === "checklist") {
      onSkipChecklist?.();
      continue;
    }
    const full = await testCaseApi.get(s.id, userId);
    if (!full) continue;
    out.push({
      name: featureFileName(full.scenarioId),
      content: caseToExportable(full, t).gherkin,
      provisional: isProvisionalKey(full.scenarioId),
    });
  }
  return out;
}

/** Number of cases in a project (cheap metadata query for progress totals). */
export async function projectCaseCount(projectId: string, userId: string): Promise<number> {
  return (await testCaseApi.list(projectId, userId)).length;
}

/** Cases of a project that are not obsolete, for the Home queue (RED-V1). */
export async function projectLiveCases(
  projectId: string,
  userId: string,
): Promise<TestCaseSummary[]> {
  return (await testCaseApi.list(projectId, userId)).filter((c) => c.status !== "obsolete");
}

/** Approved cases out of the cases that are not obsolete (Home progress, UX-08). */
export async function projectCaseProgress(
  projectId: string,
  userId: string,
): Promise<{ approved: number; total: number }> {
  const live = await projectLiveCases(projectId, userId);
  return { approved: live.filter((c) => c.status === "approved").length, total: live.length };
}

/** Files exported per case in the batch ZIP: its .xlsx and its .pdf (EXP-02). */
export const FILES_PER_CASE = 2;

/** Builds the .xlsx and .pdf of every case of a project (for the batch ZIP,
 *  spec §5.4). `onEach` fires with each file name as it is built (progress).
 *  A PDF that cannot be rendered is left out and passed to `onSkip`, so one
 *  bad document never blocks the ZIP. */
export async function projectCaseFiles(
  projectId: string,
  userId: string,
  t: Translate,
  lang: string,
  onEach?: (name: string) => void,
  onSkip?: (name: string) => void,
): Promise<{ name: string; buffer: ArrayBuffer | Uint8Array }[]> {
  const summaries = await testCaseApi.list(projectId, userId);
  // A failure fails the export: without the definitions the sheet would
  // show option ids instead of their labels.
  const fields = await customFieldApi.list(projectId, userId);
  const out: { name: string; buffer: ArrayBuffer | Uint8Array }[] = [];
  for (const s of summaries) {
    const full = await testCaseApi.get(s.id, userId);
    if (!full) continue;
    const exportable = caseToExportable(full, t, fields);
    const { filename, buffer } = await buildCaseXlsx(exportable, lang);
    out.push({ name: filename, buffer });
    onEach?.(filename);
    const pdfName = casePdfName(exportable);
    try {
      out.push({ name: pdfName, buffer: await buildCasePdf(exportable, t) });
    } catch {
      onSkip?.(pdfName);
    }
    onEach?.(pdfName);
  }
  return out;
}
