import JSZip from "jszip";
import { planWorkbookByProject } from "@modules/test-plan";
import { projectCaseWorkbooks } from "@modules/test-cases";
import { projectApi } from "../api/projectApi";

type Translate = (key: string) => string;

/** Keeps a name safe as a zip path segment. */
function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "item";
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

    const plan = await planWorkbookByProject(p.id, t, lang);
    if (plan) {
      zip.file(`${folder}/${sanitize(plan.name)}`, plan.buffer);
      files += 1;
    }
    for (const c of await projectCaseWorkbooks(p.id, t, lang)) {
      zip.file(`${folder}/${sanitize(c.name)}`, c.buffer);
      files += 1;
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pharos-export.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return files;
}
