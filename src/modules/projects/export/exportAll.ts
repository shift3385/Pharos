import JSZip from "jszip";
import { planWorkbookByProject } from "@modules/test-plan";
import { projectCaseWorkbooks } from "@modules/test-cases";
import { projectApi } from "../api/projectApi";
import type { ProjectSummary } from "../model/types";

type Translate = (key: string) => string;

/** Keeps a name safe as a zip path segment. */
function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "item";
}

/** Adds a project's plan + case .xlsx files into `folder/` of the zip.
 *  Returns how many files were added. */
async function addProject(
  zip: JSZip,
  project: ProjectSummary,
  folder: string,
  t: Translate,
  lang: string,
): Promise<number> {
  let files = 0;
  const plan = await planWorkbookByProject(project.id, t, lang);
  if (plan) {
    zip.file(`${folder}/${sanitize(plan.name)}`, plan.buffer);
    files += 1;
  }
  for (const c of await projectCaseWorkbooks(project.id, t, lang)) {
    zip.file(`${folder}/${sanitize(c.name)}`, c.buffer);
    files += 1;
  }
  return files;
}

function triggerZipDownload(blob: Blob, filename: string) {
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
  t: Translate,
  lang: string,
): Promise<number> {
  const zip = new JSZip();
  const files = await addProject(zip, project, sanitize(project.name), t, lang);
  const blob = await zip.generateAsync({ type: "blob" });
  triggerZipDownload(blob, `${sanitize(project.name)}.zip`);
  return files;
}

/** Exports every project of the owner as a single ZIP: one folder per project
 *  holding its plan and case .xlsx files, in the given language (spec §5.4). */
export async function exportAllProjects(
  ownerId: string,
  t: Translate,
  lang: string,
): Promise<number> {
  const projects = await projectApi.list(ownerId);
  const zip = new JSZip();
  let files = 0;
  const usedFolders = new Set<string>();

  for (const p of projects) {
    let folder = sanitize(p.name);
    for (let n = 2; usedFolders.has(folder); n += 1) folder = `${sanitize(p.name)} (${n})`;
    usedFolders.add(folder);
    files += await addProject(zip, p, folder, t, lang);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  triggerZipDownload(blob, "pharos-export.zip");
  return files;
}
