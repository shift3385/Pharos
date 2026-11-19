// An `allure-results` folder as a `.zip` (ING-07): its files for
// `parseAllureResults`, bounded like a report (at most `MAX_ENTRIES` files
// and the evidence limit once unpacked).

import JSZip from "jszip";
import { type AllureFile, MAX_REPORT_BYTES, ReportError, isAllureTextFile } from "@pharos/formats";

const MAX_ENTRIES = 10_000;

/** The bytes of a blob (FileReader where `arrayBuffer` is missing). */
function bytesOf(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("unreadable"));
    reader.readAsArrayBuffer(blob);
  });
}

/** True when a file starts like a zip (a local file header). */
export async function isZipFile(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await bytesOf(file.slice(0, 4)));
  return head.length === 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

/** The files of a zipped `allure-results` folder (folders left out). */
export async function allureFilesOfZip(file: Blob): Promise<AllureFile[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await bytesOf(file));
  } catch {
    throw new ReportError("invalid-zip");
  }
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  if (entries.length > MAX_ENTRIES) throw new ReportError("too-large", `at most ${MAX_ENTRIES} files`);
  const out: AllureFile[] = [];
  let total = 0;
  for (const e of entries) {
    if (isAllureTextFile(e.name)) {
      const text = await e.async("string");
      total += text.length;
      out.push({ name: e.name, text });
    } else {
      const base64 = await e.async("base64");
      total += Math.floor((base64.length * 3) / 4);
      out.push({ name: e.name, base64 });
    }
    if (total > MAX_REPORT_BYTES) throw new ReportError("too-large", `${MAX_REPORT_BYTES} bytes`);
  }
  return out;
}
