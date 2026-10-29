import JSZip from "jszip";
import { FILES_PER_PLAN, projectHasPlan, projectPlanFiles } from "@modules/test-plan";
import { FILES_PER_CASE, projectCaseCount, projectCaseFiles } from "@modules/test-cases";
import { saveFile } from "@shared/export/saveFile";
import { projectApi } from "../api/projectApi";
import type { ProjectSummary } from "../model/types";

type Translate = (key: string) => string;

/** Progress events emitted while an export runs, for a progress modal. */
export type ExportProgress =
  | { phase: "building"; done: number; total: number; label: string }
  | { phase: "zipping"; percent: number };

type OnProgress = (p: ExportProgress) => void;

/** What an export produced: files inside the ZIP, where the ZIP was saved,
 *  and the PDFs that could not be rendered and were left out. */
export interface ZipExport {
  files: number;
  path: string;
  skipped: string[];
}

/** Keeps a name safe as a zip path segment. */
function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "item";
}

/** Mutable counter shared across a run so building progress is continuous. */
interface Counter {
  done: number;
  total: number;
}

/** Files a project contributes to the ZIP (plan and cases, .xlsx + .pdf each). */
async function projectFileCount(projectId: string, ownerId: string): Promise<number> {
  const plan = (await projectHasPlan(projectId, ownerId)) ? FILES_PER_PLAN : 0;
  return plan + (await projectCaseCount(projectId, ownerId)) * FILES_PER_CASE;
}

/** Adds a project's plan and case files (.xlsx and .pdf, spec §5.4) into
 *  `folder/` of the zip, emitting a "building" event as each file is produced.
 *  Returns files added. */
async function addProject(
  zip: JSZip,
  project: ProjectSummary,
  ownerId: string,
  folder: string,
  t: Translate,
  lang: string,
  counter: Counter,
  skipped: string[],
  onProgress?: OnProgress,
): Promise<number> {
  const skip = (name: string) => skipped.push(`${folder}/${name}`);
  const advance = (label: string) => {
    counter.done += 1;
    onProgress?.({ phase: "building", done: counter.done, total: counter.total, label });
  };
  // The callbacks fire as each file is built (drives the progress bar); buffers
  // are added to the zip afterwards (an instant, non-async step).
  const files = [
    ...(await projectPlanFiles(project.id, ownerId, t, lang, advance, skip)),
    ...(await projectCaseFiles(project.id, ownerId, t, lang, advance, skip)),
  ];
  for (const f of files) zip.file(`${folder}/${sanitize(f.name)}`, f.buffer);
  return files.length;
}

async function finalizeZip(
  zip: JSZip,
  filename: string,
  onProgress?: OnProgress,
): Promise<string> {
  const blob = await zip.generateAsync({ type: "blob" }, (meta) => {
    onProgress?.({ phase: "zipping", percent: Math.round(meta.percent) });
  });
  return saveFile(filename, blob, "application/zip");
}

/** Exports a single project as `<name>.zip` with its plan and case files
 *  (.xlsx and .pdf) inside a folder named after the project. */
export async function exportProjectZip(
  project: ProjectSummary,
  ownerId: string,
  t: Translate,
  lang: string,
  onProgress?: OnProgress,
): Promise<ZipExport> {
  const counter: Counter = { done: 0, total: await projectFileCount(project.id, ownerId) };
  const zip = new JSZip();
  const skipped: string[] = [];
  const files = await addProject(
    zip,
    project,
    ownerId,
    sanitize(project.name),
    t,
    lang,
    counter,
    skipped,
    onProgress,
  );
  const path = await finalizeZip(zip, `${sanitize(project.name)}.zip`, onProgress);
  return { files, path, skipped };
}

/** Exports every project of the owner as a single ZIP: one folder per project
 *  holding its plan and case files (.xlsx and .pdf), in the given language
 *  (spec §5.4). */
export async function exportAllProjects(
  ownerId: string,
  t: Translate,
  lang: string,
  onProgress?: OnProgress,
): Promise<ZipExport> {
  const projects = await projectApi.list(ownerId);

  // Pre-pass: count the artifacts so the progress bar has a total.
  let total = 0;
  for (const p of projects) total += await projectFileCount(p.id, ownerId);

  const counter: Counter = { done: 0, total };
  const zip = new JSZip();
  let files = 0;
  const skipped: string[] = [];
  const usedFolders = new Set<string>();

  for (const p of projects) {
    let folder = sanitize(p.name);
    for (let n = 2; usedFolders.has(folder); n += 1) folder = `${sanitize(p.name)} (${n})`;
    usedFolders.add(folder);
    files += await addProject(zip, p, ownerId, folder, t, lang, counter, skipped, onProgress);
  }

  const path = await finalizeZip(zip, "pharos-export.zip", onProgress);
  return { files, path, skipped };
}
