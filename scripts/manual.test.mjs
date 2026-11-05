// Tests of the user-manual tooling (MAN-01): the PNG codec, the Markdown
// subset, the prose-source parser, the AI-key lookup, the secret scan and the
// coverage check.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { arrayLiteral, check, countDialogs, coversIn, hasViewSwitch, routePaths, stepsIn } from "./check-manual.mjs";
import { findAiKey } from "./manual/ai-key.mjs";
import { inline, markdownToHtml } from "./manual/markdown.mjs";
import { printWithEdge, sweepProfiles } from "./manual/edge-print.mjs";
import { focusLayout, FOCUS_COLOR, insetStyle } from "./manual/focus.mjs";
import { acquireLock, lockMessage, pidAlive, releaseLock } from "./manual/run-lock.mjs";
import { changedShare, decodePng, drawFocus, encodePng, quantize } from "./manual/png.mjs";
import { needlesFor, scanForSecret } from "./manual/secret-scan.mjs";
import { parseSource, pdfNamedDests, pdfPageCount } from "./manual/sources.mjs";

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

test("pdfNamedDests maps each anchor to its page through a nested page tree (MAN-02)", () => {
  const pdf = [
    "1 0 obj\n<</Type /Catalog\n/Pages 2 0 R\n/Dests 9 0 R>>\nendobj",
    "2 0 obj\n<</Type /Pages\n/Count 3\n/Kids [3 0 R 4 0 R]>>\nendobj",
    "3 0 obj\n<</Type /Page\n/Annots [8 0 R]>>\nendobj",
    "4 0 obj\n<</Type /Pages\n/Count 2\n/Kids [5 0 R 6 0 R]>>\nendobj",
    "5 0 obj\n<</Type /Page>>\nendobj",
    "6 0 obj\n<</Type /Page>>\nendobj",
    "8 0 obj\n<</Type /Annot\n/Subtype /Link\n/Dest /cap-acceso>>\nendobj",
    "9 0 obj\n<</cap-acceso [5 0 R /XYZ 6 776 0]\n/paso-acceso-entrar [6 0 R /XYZ 6 400 0]\n/caf#C3#A9 [3 0 R /XYZ 0 0 0]>>\nendobj",
    "trailer\n<</Root 1 0 R>>",
  ].join("\n");
  const dests = pdfNamedDests(Buffer.from(pdf, "latin1"));
  assert.equal(dests.get("cap-acceso"), 1);
  assert.equal(dests.get("paso-acceso-entrar"), 2);
  assert.equal(dests.get("cafÃ©"), 0, "#xx escapes decoded byte by byte");
  assert.equal(pdfNamedDests(Buffer.from("no pdf")).size, 0);
});

test("drawFocus outlines a box in one exact colour that the palette keeps (MAN-02)", () => {
  const img = image(120, 80, (x, y) => [(x * 2) & 255, (y * 3) & 255, (x + y) & 255, 255]);
  drawFocus(img, { x: 40, y: 30, w: 30, h: 20 }, { color: FOCUS_COLOR, stroke: 3, pad: 4, radius: 6 });
  const at = (x, y) => [...img.data.subarray((y * 120 + x) * 4, (y * 120 + x) * 4 + 3)];
  assert.deepEqual(at(50, 26), FOCUS_COLOR, "top edge, pad px above the box");
  assert.deepEqual(at(36, 40), FOCUS_COLOR, "left edge");
  assert.notDeepEqual(at(55, 40), FOCUS_COLOR, "the control itself is untouched");
  assert.notDeepEqual(at(36, 26), FOCUS_COLOR, "rounded corner left out");
  // A gradient of 9 600 colours: without `reserve` the amber would blend.
  const back = decodePng(encodePng(img, { reserve: [FOCUS_COLOR] }));
  assert.deepEqual([...back.data.subarray((26 * 120 + 50) * 4, (26 * 120 + 50) * 4 + 3)], FOCUS_COLOR);
  const again = drawFocus(image(120, 80, () => [0, 0, 0, 255]), { x: 40, y: 30, w: 30, h: 20 });
  assert.ok(encodePng(again).equals(encodePng(drawFocus(image(120, 80, () => [0, 0, 0, 255]), { x: 40, y: 30, w: 30, h: 20 }))));
});

test("focusLayout: an inset beside small controls, below wide strips, none for big areas (MAN-02)", () => {
  const beside = focusLayout(1440, 900, { x: 480, y: 820, w: 100, h: 30 });
  assert.equal(beside.mode, "beside");
  assert.ok(beside.crop.y + beside.crop.h <= 900, "the crop stays inside the capture");
  assert.ok(beside.mag >= 1.4);
  assert.equal(focusLayout(1440, 900, { x: 300, y: 10, w: 640, h: 40 }).mode, "below");
  assert.equal(focusLayout(1440, 900, { x: 100, y: 100, w: 900, h: 600 }), null, "a whole panel needs no inset");
  assert.equal(focusLayout(1440, 900, null), null);
  const style = insetStyle(1440, 900, beside);
  assert.match(style, /background-size:\d+\.\d{3}% auto/);
  assert.match(style, /^width:\d+mm;height:[\d.]+mm;/);
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

test("the tour run lock: one live holder, stale locks replaced, release only by its owner (MAN-02)", () =>
  tempDir((dir) => {
    const file = join(dir, "tours.lock");
    const alive = new Set([111]);
    const isAlive = (pid) => alive.has(pid);
    assert.deepEqual(acquireLock(file, { pid: 111, isAlive }), { ok: true });
    const refused = acquireLock(file, { pid: 222, isAlive });
    assert.equal(refused.ok, false);
    assert.equal(refused.holder.pid, 111);
    assert.match(lockMessage(refused.holder), /otra ejecución de recorridos en curso \(PID 111/);
    releaseLock(file, 222);
    assert.equal(acquireLock(file, { pid: 222, isAlive }).ok, false, "another run's lock is never released");
    alive.delete(111);
    assert.deepEqual(acquireLock(file, { pid: 222, isAlive }), { ok: true }, "a dead holder's lock is stale");
    releaseLock(file, 222);
    writeFileSync(file, "not json");
    assert.deepEqual(acquireLock(file, { pid: 333, isAlive }), { ok: true }, "an unreadable lock is replaced");
    assert.equal(pidAlive(process.pid), true);
    assert.equal(pidAlive(0), false);
  }));

test("printWithEdge: a fresh profile per attempt, one retry on EPERM, none otherwise (MAN-02)", () =>
  tempDir((dir) => {
    const pdf = join(dir, "out.pdf");
    const profilesDir = join(dir, "profiles");
    // A profile left by an earlier build never blocks the next print.
    mkdirSync(join(profilesDir, "edge-stale"), { recursive: true });
    const seen = [];
    let calls = 0;
    const flaky = (args) => {
      seen.push(args.find((a) => a.startsWith("--user-data-dir=")));
      if (++calls === 1) throw Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });
      writeFileSync(pdf, "%PDF-1.7");
    };
    const { attempt } = printWithEdge({ htmlUrl: "file:///x.html", pdfFile: pdf, profilesDir, exec: flaky });
    assert.equal(attempt, 2);
    assert.notEqual(seen[0], seen[1], "each attempt gets its own profile");
    assert.ok(seen.every((p) => !p.endsWith("edge-stale")));
    assert.equal(readdirSync(profilesDir).filter((n) => n !== "edge-stale").length, 0, "profiles are removed");
    assert.equal(sweepProfiles(profilesDir), 1);
    let other = 0;
    assert.throws(
      () => printWithEdge({ htmlUrl: "file:///x.html", pdfFile: pdf, profilesDir, exec: () => { other++; throw new Error("timeout"); } }),
      /timeout/,
    );
    assert.equal(other, 1, "no retry for other errors");
    assert.throws(() => printWithEdge({ htmlUrl: "file:///x.html", pdfFile: pdf, profilesDir, exec: () => {} }), /did not print/, "a stale PDF never passes");
  }));
