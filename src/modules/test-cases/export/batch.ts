import type { TestCase } from "../model/types";
import { flowsToGherkin, parseFeatureFlows, toGherkin } from "../ui/gherkin";
import { testCaseApi } from "../api/testCaseApi";
import { buildCaseXlsx, type ExportableCase } from "./caseXlsx";

type Translate = (key: string) => string;

/** Maps a stored case to the export shape (mirrors the editor's derivations):
 *  advanced cases reconstruct flows/background from the feature when needed. */
export function caseToExportable(c: TestCase, t: Translate): ExportableCase {
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
  };
}

/** File name of a case's .feature: its ID, made safe for any file system. */
export function featureFileName(scenarioId: string): string {
  return `${scenarioId.replace(/[^\p{L}\p{N}_.-]+/gu, "_") || "scenario"}.feature`;
}

/** Every case of a project as a .feature file with its ID and requirement
 *  tags (TRZ-03), for the batch export (spec §5.3 "en lote por proyecto"). */
export async function projectFeatureFiles(
  projectId: string,
  t: Translate,
): Promise<{ name: string; content: string }[]> {
  const out: { name: string; content: string }[] = [];
  for (const s of await testCaseApi.list(projectId)) {
    const full = await testCaseApi.get(s.id);
    if (!full) continue;
    out.push({ name: featureFileName(full.scenarioId), content: caseToExportable(full, t).gherkin });
  }
  return out;
}

/** Number of cases in a project (cheap metadata query for progress totals). */
export async function projectCaseCount(projectId: string): Promise<number> {
  return (await testCaseApi.list(projectId)).length;
}

/** Builds an .xlsx buffer for every case of a project (for the batch ZIP).
 *  `onEach` fires with each file name as its workbook is built (for progress). */
export async function projectCaseWorkbooks(
  projectId: string,
  t: Translate,
  lang: string,
  onEach?: (name: string) => void,
): Promise<{ name: string; buffer: ArrayBuffer }[]> {
  const summaries = await testCaseApi.list(projectId);
  const out: { name: string; buffer: ArrayBuffer }[] = [];
  for (const s of summaries) {
    const full = await testCaseApi.get(s.id);
    if (!full) continue;
    const { filename, buffer } = await buildCaseXlsx(caseToExportable(full, t), lang);
    out.push({ name: filename, buffer });
    onEach?.(filename);
  }
  return out;
}
