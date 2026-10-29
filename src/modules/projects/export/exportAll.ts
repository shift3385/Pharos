import JSZip from "jszip";
import { planWorkbookByProject, projectHasPlan } from "@modules/test-plan";
import { projectCaseWorkbooks, projectCaseCount } from "@modules/test-cases";
import { projectApi } from "../api/projectApi";
import type { ProjectSummary } from "../model/types";

type Translate = (key: string) => string;

/** Progress events emitted while an export runs, for a progress modal. */
export type ExportProgress =
  | { phase: "building"; done: number; total: number; label: string }
  | { phase: "zipping"; percent: number };

type OnProgress = (p: ExportProgress) => void;

/** Keeps a name safe as a zip path segment. */
function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "item";
}

/** Mutable counter shared across a run so building progress is continuous. */
interface Counter {
  done: number;
  total: number;
}

/** Adds a project's plan + case .xlsx files into `folder/` of the zip, emitting
 *  a "building" event as each file is produced. Returns files added. */
async function addProject(
  zip: JSZip,
  project: ProjectSummary,
  ownerId: string,
  folder: string,
  t: Translate,
  lang: string,
  counter: Counter,
  onProgress?: OnProgress,
): Promise<number> {
  let files = 0;
  const advance = (label: string) => {
    counter.done += 1;
    onProgress?.({ phase: "building", done: counter.done, total: counter.total, label });
  };

  const plan = await planWorkbookByProject(project.id, ownerId, t, lang);
  if (plan) {
    zip.file(`${folder}/${sanitize(plan.name)}`, plan.buffer);
    files += 1;
    advance(plan.name);
  }
  // The callback fires as each case workbook is built (drives the progress bar);
  // buffers are added to the zip afterwards (an instant, non-async step).
  const workbooks = await projectCaseWorkbooks(project.id, ownerId, t, lang, (name) =>
    advance(name),
  );
  for (const c of workbooks) {
    zip.file(`${folder}/${sanitize(c.name)}`, c.buffer);
    files += 1;
  }
  return files;
}

async function finalizeZip(zip: JSZip, filename: string, onProgress?: OnProgress) {
  const blob = await zip.generateAsync({ type: "blob" }, (meta) => {
    onProgress?.({ phase: "zipping", percent: Math.round(meta.percent) });
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Exports a single project as `<name>.zip` with its plan and case .xlsx files
 *  inside a folder named after the project. Returns the file count. */
export async function exportProjectZip(
  project: ProjectSummary,
  ownerId: string,
  t: Translate,
  lang: string,
  onProgress?: OnProgress,
): Promise<number> {
  const total =
    ((await projectHasPlan(project.id, ownerId)) ? 1 : 0) +
    (await projectCaseCount(project.id, ownerId));
  const counter: Counter = { done: 0, total };
  const zip = new JSZip();
  const files = await addProject(
    zip,
    project,
    ownerId,
    sanitize(project.name),
    t,
    lang,
    counter,
    onProgress,
  );
  await finalizeZip(zip, `${sanitize(project.name)}.zip`, onProgress);
  return files;
}

/** Exports every project of the owner as a single ZIP: one folder per project
 *  holding its plan and case .xlsx files, in the given language (spec §5.4). */
export async function exportAllProjects(
  ownerId: string,
  t: Translate,
  lang: string,
  onProgress?: OnProgress,
): Promise<number> {
  const projects = await projectApi.list(ownerId);

  // Pre-pass: count the artifacts so the progress bar has a total.
  let total = 0;
  for (const p of projects) {
    total += (await projectHasPlan(p.id, ownerId)) ? 1 : 0;
    total += await projectCaseCount(p.id, ownerId);
  }

  const counter: Counter = { done: 0, total };
  const zip = new JSZip();
  let files = 0;
  const usedFolders = new Set<string>();

  for (const p of projects) {
    let folder = sanitize(p.name);
    for (let n = 2; usedFolders.has(folder); n += 1) folder = `${sanitize(p.name)} (${n})`;
    usedFolders.add(folder);
    files += await addProject(zip, p, ownerId, folder, t, lang, counter, onProgress);
  }

  await finalizeZip(zip, "pharos-export.zip", onProgress);
  return files;
}
