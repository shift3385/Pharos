import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { ReportError, parseAllureResults } from "@pharos/formats";
import { allureFilesOfZip, isZipFile } from "./allureZip";

const DIR = resolve(process.cwd(), "packages/formats/src/fixtures/allure/playwright");

async function zipOfSample(): Promise<Blob> {
  const zip = new JSZip();
  for (const name of readdirSync(DIR)) zip.file(`allure-results/${name}`, readFileSync(join(DIR, name)));
  zip.folder("allure-results/empty");
  return new Blob([await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" })]);
}

describe("a zipped allure-results folder (ING-07)", () => {
  it("reads as the folder does", async () => {
    const blob = await zipOfSample();
    expect(await isZipFile(blob)).toBe(true);
    expect(await isZipFile(new Blob(["<testsuites/>"]))).toBe(false);
    const fromZip = parseAllureResults(await allureFilesOfZip(blob));
    const fromFolder = parseAllureResults(
      readdirSync(DIR).map((name) => ({ name, text: readFileSync(join(DIR, name), "utf8") })),
    );
    expect(fromZip.format).toBe("allure");
    expect(fromZip.doc).toEqual(fromFolder.doc);
    expect([...fromZip.inline.keys()]).toEqual([...fromFolder.inline.keys()]);
  });

  it("refuses a file that is not a zip", async () => {
    const notZip = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])]);
    await expect(allureFilesOfZip(notZip)).rejects.toBeInstanceOf(ReportError);
  });
});
