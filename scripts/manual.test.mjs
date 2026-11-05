// Tests of the user-manual tooling (MAN-01): the PNG codec, the Markdown
// subset, the prose-source parser, the AI-key lookup, the secret scan and the
// coverage check.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { arrayLiteral, check, countDialogs, coversIn, hasViewSwitch, routePaths, stepsIn } from "./check-manual.mjs";
import { findAiKey } from "./manual/ai-key.mjs";
import { inline, markdownToHtml } from "./manual/markdown.mjs";
import { changedShare, decodePng, encodePng, quantize } from "./manual/png.mjs";
import { needlesFor, scanForSecret } from "./manual/secret-scan.mjs";
import { parseSource, pdfPageCount } from "./manual/sources.mjs";

const repoDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function image(width, height, fill) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(fill(i % width, Math.floor(i / width)), i * 4);
  return { width, height, data };
}

function tempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "manual-test-"));
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

test("opaque images become deterministic 8-bit palette PNGs", () => {
  const img = image(40, 20, (x, y) => [(x * 6) & 255, (y * 12) & 255, 90, 255]);
  const a = encodePng(img);
  assert.ok(a.equals(encodePng(img)), "same pixels, same bytes");
  assert.equal(a[25], 3, "colour type 3 (indexed)");
  const back = decodePng(a);
  assert.equal(back.width, 40);
  // A synthetic gradient of 800 colours is the worst case for 256 entries.
  assert.ok(changedShare(img, back, 24) < 0.02, "palette error stays small");
});

test("an image with few colours keeps them exactly", () => {
  const img = image(8, 8, (x) => (x < 4 ? [10, 20, 30, 255] : [200, 100, 50, 255]));
  const { palette } = quantize(img);
  assert.equal(palette.length, 6);
  assert.ok(decodePng(encodePng(img)).data.equals(img.data));
});

test("transparent images keep RGBA", () => {
  const alpha = encodePng(image(4, 4, () => [1, 2, 3, 128]));
  assert.equal(alpha[25], 6);
  assert.equal(decodePng(alpha).data[3], 128);
});

test("changedShare counts pixels beyond the tolerance and sizes that differ", () => {
  const a = image(10, 10, () => [100, 100, 100, 255]);
  const b = image(10, 10, (x, y) => (x === 0 && y < 5 ? [200, 100, 100, 255] : [103, 100, 100, 255]));
  assert.equal(changedShare(a, b), 0.05);
  assert.equal(changedShare(a, image(5, 5, () => [0, 0, 0, 255])), 1);
});

test("the Markdown subset renders lists, notes, links and code, and escapes HTML", () => {
  const html = markdownToHtml("Un **paso** y `npm run manual`.\n\n- uno\n- [dos](../guia-beta.md)\n\n> Ojo <script>");
  assert.match(html, /<p>Un <strong>paso<\/strong> y <code>npm run manual<\/code>\.<\/p>/);
  assert.match(html, /<ul><li>uno<\/li><li><a href="..\/guia-beta.md">dos<\/a><\/li><\/ul>/);
  assert.match(html, /<blockquote><p>Ojo &lt;script&gt;<\/p><\/blockquote>/);
  assert.equal(inline("«Guardar» *nota*"), "«Guardar» <em>nota</em>");
});

test("parseSource splits a chapter source into its parts", () => {
  const src = parseSource("# T\n\nintro ignorada\n\n## Para qué sirve\n\nA.\n\n## Consejos\n\n- B\n\n## Véase también\n\nC\n\n### Paso nuevo\n\nNota.");
  assert.deepEqual(src, { purpose: "A.", tips: "- B", seeAlso: "C", notes: { nuevo: "Nota." } });
});

test("pdfPageCount reads the page tree", () => {
  assert.equal(pdfPageCount(Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 12 >>")), 12);
  assert.equal(pdfPageCount(Buffer.from("<< /Type /Page >> << /Type /Page >>")), 2);
});

test("routePaths refuses a <Route> it cannot read", () => {
  const app = '<Route path="/" element={<Home />} />\n<Route path="/old" element={<Navigate to="/" />} />\n<Route path="*" element={<X />} />';
  assert.deepEqual(routePaths(app), ["/"]);
  assert.throws(() => routePaths(`${app}\n<Route element={<Layout />}>`), /could be read/);
});

test("the code readers find covers, literal skips, dialogs and view switches", () => {
  assert.deepEqual(arrayLiteral('export const S = ["a", "b"] as const;', "S"), ["a", "b"]);
  const tour = 'step("a", { covers: ["x"], run }); step("b", { skip: "motivo", covers: ["y"], run }); step("c", { skip: AI_SKIP, covers: ["z"] })';
  assert.deepEqual(coversIn(tour), ["x", "y", "z"]);
  assert.deepEqual(stepsIn(tour).map((s) => s.literalSkip), [false, true, false]);
  assert.equal(countDialogs("<Dialog a/> <ConfirmDialog/> window.confirm(x) alert(y) obj.alert(z) <DialogTitle/>"), 4);
  assert.ok(hasViewSwitch('<SegmentedControl\n  value={v}\n  label={t("defects.view.label")}\n/>'));
  assert.ok(!hasViewSwitch('<SegmentedControl label={t("admin.general.theme")} />'));
});

test("the repository passes the manual coverage check", async () => {
  const { errors, total } = await check({ env: {} });
  assert.deepEqual(errors, []);
  assert.ok(total > 190, `inventory has ${total} items`);
});

test("findAiKey: an empty variable counts as unset; the env wins over .env", async () => {
  await tempDir((dir) => {
    writeFileSync(join(dir, ".env"), 'ANTHROPIC_API_KEY="sk-from-env-file-123"\nANTHROPIC_MODEL=claude-haiku-5-5\n');
    const fromFile = findAiKey(dir, { PHAROS_TOURS_AI_KEY: "", PHAROS_TOURS_AI_PROVIDER: "" });
    assert.equal(fromFile?.key, "sk-from-env-file-123");
    assert.equal(fromFile?.provider, "anthropic");
    assert.equal(fromFile?.model, "claude-haiku-5-5");
    const fromEnv = findAiKey(dir, { PHAROS_TOURS_AI_KEY: "k-123456789", PHAROS_TOURS_AI_MODEL: "" });
    assert.equal(fromEnv?.source, "env");
    assert.equal(fromEnv?.model, undefined);
  });
});

test("needlesFor covers base64 at every alignment and UTF-16LE", () => {
  const secret = "sk-test-0123456789abcdef";
  const needles = needlesFor(secret);
  for (const prefix of ["", "a", "ab", "abc"]) {
    const b64 = Buffer.from(`${prefix}key=${secret};`).toString("base64");
    assert.ok(needles.some((n) => Buffer.from(b64).includes(n)), `base64 after ${prefix.length} bytes`);
  }
  assert.ok(needles.some((n) => Buffer.from(secret, "utf16le").includes(n)));
});

test("scanForSecret finds the key as text, base64, UTF-16LE and inside a ZIP", async () => {
  const JSZip = createRequire(join(repoDir, "package.json"))("jszip");
  await tempDir(async (dir) => {
    const secret = "sk-test+abc/123456";
    mkdirSync(join(dir, "a"));
    writeFileSync(join(dir, "a", "clean.txt"), "nothing here");
    writeFileSync(join(dir, "a", "b64.log"), Buffer.from(`x${secret}`).toString("base64"));
    writeFileSync(join(dir, "plain.json"), `{"k":"${secret}"}`);
    writeFileSync(join(dir, "wide.txt"), Buffer.from(secret, "utf16le"));
    const zip = new JSZip();
    zip.file("logs/app.log", `token ${secret}`);
    writeFileSync(join(dir, "diag.zip"), await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
    const hits = (await scanForSecret(secret, [dir], dir)).map((h) => h.replaceAll("\\", "/"));
    assert.deepEqual(hits.sort(), ["a/b64.log", "diag.zip!logs/app.log", "plain.json", "wide.txt"]);
    assert.deepEqual(await scanForSecret("", [dir], dir), []);
  });
});
