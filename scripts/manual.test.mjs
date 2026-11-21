import { spawn } from "node:child_process";
// Tests of the user-manual tooling (MAN-01): the PNG codec, the Markdown
// subset, the prose-source parser, the AI-key lookup, the secret scan and the
// coverage check.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { arrayLiteral, check, countDialogs, coversIn, hasViewSwitch, prerequisiteErrors, routePaths, secretScan, stepsIn } from "./check-manual.mjs";
import { findAiKey } from "./manual/ai-key.mjs";
import { inline, leftoverTable, markdownToHtml, tableCells } from "./manual/markdown.mjs";
import { printWithEdge, settled, sweepProfiles } from "./manual/edge-print.mjs";
import { cutoutSvg, focusCuts, focusLayout, focusPiece, FOCUS_COLOR, FOCUS_STROKE, frameGeometry, GAP, groupInset, MIN_SEPARATION, outlineZones, sameFocusPixels } from "./manual/focus.mjs";
import { acquireLock, lockMessage, pidAlive, releaseLock, UNREADABLE_GRACE_MS } from "./manual/run-lock.mjs";
import { changedShare, decodePng, drawFocus, encodePng, quantize } from "./manual/png.mjs";
import { needlesFor, scanForSecret } from "./manual/secret-scan.mjs";
import { keyboardAppendix, parseSource, pdfNamedDests, pdfPageCount } from "./manual/sources.mjs";
import { foreignNames } from "./manual/persona.mjs";

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
  assert.deepEqual(src, { purpose: "A.", extra: [], keys: "", trouble: "", mobile: "", tips: "- B", seeAlso: "C", notes: { nuevo: "Nota." }, before: {} });
});

test("parseSource keeps a lead-in for the step it comes before", () => {
  const src = parseSource("## Para qué sirve\n\nA.\n\n### Antes del paso cierre\n\n**Más adelante.** Texto.\n\n### Paso cierre\n\nNota.");
  assert.deepEqual(src.before, { cierre: "**Más adelante.** Texto." });
  assert.deepEqual(src.notes, { cierre: "Nota." });
  assert.equal(src.purpose, "A.");
});

test("parseSource reads the manual v2 sections: keyboard, problems and mobile (MAN-03)", () => {
  const src = parseSource(
    "## Para qué sirve\n\nA.\n\n## Atajos de teclado\n\n| Tecla |\n\n## Si algo no sale\n\nE.\n\n## En el móvil\n\nM.\n\n## Otra cosa\n\nignorada",
  );
  assert.equal(src.keys, "| Tecla |");
  assert.equal(src.trouble, "E.");
  assert.equal(src.mobile, "M.");
  assert.equal(src.tips, "");
  // A section the manual does not name is kept, not dropped (NC-045).
  assert.deepEqual(src.extra, [{ heading: "Otra cosa", body: "ignorada" }]);
});

test("GFM tables become HTML tables, also right after a paragraph (MAN-03, NC-044)", () => {
  const md = "Intro\n| Tecla | Qué hace |\n| --- | --- |\n| Ctrl+K (⌘K en Mac) | Abre la búsqueda |\n| `a|b` | **Esc** |\n\nFin";
  const html = markdownToHtml(md);
  assert.match(html, /<p>Intro<\/p>\n<table class="md-table"><thead><tr><th>Tecla<\/th><th>Qué hace<\/th><\/tr><\/thead>/);
  assert.match(html, /<td>Ctrl\+K \(⌘K en Mac\)<\/td><td>Abre la búsqueda<\/td>/);
  assert.match(html, /<td><code>a\|b<\/code><\/td><td><strong>Esc<\/strong><\/td>/);
  assert.match(html, /<p>Fin<\/p>$/);
  assert.equal(leftoverTable(html), null);
  assert.deepEqual(tableCells("| x | `y|z` |"), ["x", "`y|z`"]);
  assert.ok(leftoverTable("<p>| Tecla | | --- | --- |</p>"), "the guard spots a table left as text");
});

test("a nested list stays nested, with continuation lines (NC-046)", () => {
  const html = markdownToHtml("- Uno:\n  - a\n  - b que\n    sigue\n- Dos\n\n1. Paso\n   con más\n   - detalle");
  assert.match(html, /<ul><li>Uno:<ul><li>a<\/li><li>b que sigue<\/li><\/ul><\/li><li>Dos<\/li><\/ul>/);
  assert.match(html, /<ol><li>Paso con más<ul><li>detalle<\/li><\/ul><\/li><\/ol>/);
});

test("every table of every chapter source renders as a table (NC-044)", () => {
  const dir = join(repoDir, "docs", "manual", "fuentes");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md"))) {
    const html = markdownToHtml(readFileSync(join(dir, f), "utf8"));
    assert.equal(leftoverTable(html), null, `${f}: a table stayed as text`);
  }
});

test("the keyboard appendix gathers each chapter's table, in order, skipping chapters without one (MAN-03)", () => {
  const table = ["| Tecla | Dónde | Qué hace |", "| --- | --- | --- |", "| Esc | Diálogo | Lo cierra |"].join("\n");
  const md = keyboardAppendix([
    { number: 2, title: "La aplicación de un vistazo", keys: table },
    { number: 3, title: "Inicio", keys: "" },
    { number: 11, title: "Ejecución manual", keys: `${table}\n` },
  ]);
  assert.match(md, /^### 2\. La aplicación de un vistazo\n\n\| Tecla/);
  assert.ok(md.indexOf("### 2.") < md.indexOf("### 11."));
  assert.doesNotMatch(md, /Inicio/);
  assert.equal(leftoverTable(markdownToHtml(md)), null, "the tables render as tables");
});

test("every chapter source has its «Atajos de teclado» table, so the appendix covers the whole manual (MAN-03)", () => {
  const dir = join(repoDir, "docs", "manual", "fuentes");
  const without = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => !parseSource(readFileSync(join(dir, f), "utf8")).keys.includes("| Tecla"));
  assert.deepEqual(without, [], "chapters without a keyboard table");
});

test("foreignNames: other people and accounts are hits, ordinary words are not (NC-052)", () => {
  assert.deepEqual(foreignNames("Lucía Romero y Ana Pérez; Smoke · smoke@pharos.dev"), [
    "Lucía",
    "Romero",
    "Ana",
    "Pérez",
    "Smoke",
    "smoke@pharos.dev",
  ]);
  assert.deepEqual(foreignNames("Analista de QA · una semana · Liomar QA · liomar.qa@pharos.test · Mañana"), []);
  assert.deepEqual(foreignNames("ana minúscula, Perezoso, Romeros"), []);
});

test("foreignNames: exactly three accounts are allowed, Jorge and «Administrador» included (NC-052 amended)", () => {
  assert.deepEqual(
    foreignNames("Jorge L. Meneses Yero · jorge.meneses@pharos.test · Administrador · admin@pharos.test · Liomar QA · liomar.qa@pharos.test"),
    [],
  );
  // Synthetic accounts are not people; another person's address is.
  assert.deepEqual(foreignNames("qa.web@pharos.test · nadie@pharos.test"), []);
  assert.deepEqual(foreignNames("lucia.romero@pharos.test · ana@pharos.test"), ["lucia.romero@pharos.test", "ana@pharos.test"]);
});

test("the chapter sources and the tour captions name only the manual's person (NC-052)", () => {
  const files = [
    ...readdirSync(join(repoDir, "docs", "manual", "fuentes")).map((f) => join(repoDir, "docs", "manual", "fuentes", f)),
    ...readdirSync(join(repoDir, "e2e", "tours"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => join(repoDir, "e2e", "tours", f)),
  ];
  for (const file of files) {
    const names = foreignNames(readFileSync(file, "utf8"));
    assert.deepEqual(names, [], `${file} names another person or account`);
  }
});

test("the NC log keeps its title and a well-formed table of 8 columns, in order (MAN-03)", () => {
  const lines = readFileSync(join(repoDir, "docs", "manual", "NC-log.md"), "utf8").split(/\r?\n/);
  assert.match(lines[0], /^# Registro de no conformidades/);
  const rows = lines.filter((l) => l.startsWith("| NC-"));
  assert.ok(rows.length > 0);
  rows.forEach((row, i) => {
    assert.equal(tableCells(row).length, 8, `${row.slice(0, 12)}: 8 cells`);
    assert.ok(row.startsWith(`| NC-${String(i + 1).padStart(3, "0")} |`), `row ${i + 1} is NC-${i + 1}`);
  });
  assert.equal(leftoverTable(markdownToHtml(lines.join("\n"))), null, "the log renders as a table");
});

test("the interface never shows an internal roadmap ID (NC-047)", () => {
  for (const lang of ["es", "en"]) {
    const text = readFileSync(join(repoDir, "src", "shared", "i18n", "locales", `${lang}.json`), "utf8");
    const hits = [...text.matchAll(/"[^"]*\b(?:SYNC|INT|EJE|IA|DAT|RED|UX|FIX|MAN|ING|PLN|DEF|CYC|EVI|PDF)-\d+[a-z]?\b[^"]*"/g)].map((m) => m[0]);
    assert.deepEqual(hits, [], `${lang}.json: roadmap IDs in user-facing text`);
  }
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

test("drawFocus around several boxes draws one outline round their union (MAN-02)", () => {
  const img = image(200, 120, () => [255, 255, 255, 255]);
  // A trigger and the menu it opened, overlapping.
  drawFocus(img, [{ x: 20, y: 20, w: 40, h: 30 }, { x: 40, y: 40, w: 120, h: 60 }], { color: FOCUS_COLOR, stroke: 4, pad: 0, radius: 10 });
  const amber = (x, y) => FOCUS_COLOR.every((v, c) => img.data[(y * 200 + x) * 4 + c] === v);
  assert.ok(amber(40, 21), "the trigger's top edge");
  assert.ok(amber(100, 41), "the menu's top edge, right of the trigger");
  assert.ok(!amber(50, 41), "no line inside the union, where the two overlap");
  assert.ok(!amber(45, 48), "no line inside the union");
});

/** Signed distance from a pixel centre to a rounded rectangle (< 0 inside). */
function roundRectDistance(x, y, rect, r) {
  const qx = Math.abs(x + 0.5 - (rect.x + rect.w / 2)) - (rect.w / 2 - r);
  const qy = Math.abs(y + 0.5 - (rect.y + rect.h / 2)) - (rect.h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Paints a 1 px border of colour `c` round `rect` (corner radius `r`). */
function paintBorder(img, rect, r, c, fill = null) {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const d = roundRectDistance(x, y, rect, r);
      const i = (y * img.width + x) * 4;
      if (d < 0 && d >= -1) img.data.set([...c, 255], i);
      else if (d < -1 && fill) img.data.set([...fill, 255], i);
    }
  }
}

const GREY = [200, 205, 212];
const WHITE = [255, 255, 255];
const isGrey = (img, x, y) => GREY.every((v, c) => img.data[(y * img.width + x) * 4 + c] === v);

test("an element with its own border is cut at that border: the frame lies over it, no second line (MAN-02)", () => {
  const img = image(600, 300, () => [255, 255, 255, 255]);
  const field = { x: 150, y: 120, w: 300, h: 44 };
  paintBorder(img, field, 8, GREY);
  const [piece] = focusCuts(600, 300, field, null, img);
  assert.equal(piece.edge, true);
  assert.deepEqual([piece.x, piece.y, piece.w, piece.h], [field.x, field.y, field.w, field.h], "cut exactly at the element's box");
  // At any magnification the frame covers every border pixel the clip shows.
  for (const unit of [3, 4.5, 9]) {
    const { sw, r } = frameGeometry(piece, unit);
    let bare = 0;
    for (let y = field.y - 2; y < field.y + field.h + 2; y++) {
      for (let x = field.x - 2; x < field.x + field.w + 2; x++) {
        if (!isGrey(img, x, y)) continue;
        const d = roundRectDistance(x, y, piece, r);
        if (d < -sw + 0.5) bare++;
      }
    }
    assert.equal(bare, 0, `at ${unit} px/mm no grey border shows inside the frame`);
  }
});

test("a menu over other content: cut at its own box, nothing behind; its trigger a separate cut-out (MAN-02)", () => {
  // Text everywhere behind (rows of dark dots), a white menu with a border on top.
  const img = image(600, 400, (x, y) => (y % 14 < 4 && x % 3 === 0 ? [30, 30, 30, 255] : [255, 255, 255, 255]));
  const menu = { x: 200, y: 100, w: 220, h: 120 };
  paintBorder(img, menu, 10, GREY, WHITE);
  const trigger = { x: 210, y: 226, w: 90, h: 30 };
  paintBorder(img, trigger, 6, GREY, WHITE);
  const cuts = focusCuts(600, 400, { x: 200, y: 100, w: 220, h: 156 }, [menu, trigger], img);
  const m = cuts.find((c) => c.w === menu.w);
  assert.deepEqual([m.x, m.y, m.w, m.h], [menu.x, menu.y, menu.w, menu.h], "the menu's own box");
  const t = cuts.find((c) => c !== m);
  assert.equal(t.edge, true);
  assert.deepEqual([t.x, t.y, t.w, t.h], [trigger.x, trigger.y, trigger.w, trigger.h], "the button's own box too");
  // 6 px apart: never one stepped shape, nor two frames side by side; two
  // cut-outs moved apart in the «Detalle».
  assert.notEqual(t.unit, m.unit);
  assert.ok(t.y + t.dy - (m.y + m.dy + m.h) >= MIN_SEPARATION, "clearly two boxes");
  // A card half under the popover that explains it: one shape, the card's
  // hidden part left out, the frame on both borders.
  const card = { x: 240, y: 60, w: 140, h: 80 };
  paintBorder(img, card, 8, GREY, WHITE);
  paintBorder(img, menu, 10, GREY, WHITE);
  const pair = focusCuts(600, 400, { x: 200, y: 60, w: 220, h: 160 }, [card, menu], img);
  assert.equal(new Set(pair.map((p) => p.unit)).size, 1, "one shape");
  assert.ok(pair.every((p) => p.edge && p.dx === 0 && p.dy === 0));
  // A button inside a field (the password's eye) adds no frame of its own.
  const eye = { x: menu.x + menu.w - 40, y: menu.y + 2, w: 36, h: 36 };
  assert.equal(focusCuts(600, 400, menu, [menu, eye], img).length, 1);
  // The outline (GAP outside the pieces) never enters the cut-out.
  const drawn = image(600, 400, () => [255, 255, 255, 255]);
  drawFocus(drawn, outlineZones(cuts), { color: FOCUS_COLOR, stroke: FOCUS_STROKE, pad: 0, radius: 10 });
  let amber = 0;
  for (let y = 80; y < 280; y++) {
    for (let x = 180; x < 440; x++) {
      // The clip, at its own corner radius, and the pixel smoothing reads past it.
      const inside = cuts.some((c) => roundRectDistance(x, y, c, frameGeometry(c, 4.5).r) < 1);
      if (inside && FOCUS_COLOR.every((v, k) => drawn.data[(y * 600 + x) * 4 + k] === v)) amber++;
    }
  }
  assert.equal(amber, 0);
});

test("an element without a border gets air, and no edge slices a line of text (MAN-02)", () => {
  // Lines of text 10 px tall every 22 px, all across.
  const ink = (y) => y % 22 >= 6 && y % 22 < 16;
  const img = image(800, 600, (x, y) => (ink(y) && x % 4 !== 0 ? [20, 20, 20, 255] : [255, 255, 255, 255]));
  const block = { x: 200, y: 160, w: 300, h: 80 };
  const [piece] = focusCuts(800, 600, block, null, img);
  assert.equal(piece.edge, false);
  assert.ok(piece.x < block.x && piece.y < block.y && piece.x + piece.w > block.x + block.w, "air around it");
  for (const y of [piece.y, piece.y + piece.h - 1]) assert.ok(!ink(y), `the edge at y=${y} runs between lines`);
  for (let y = piece.y - GAP; y < piece.y; y++) assert.ok(!ink(y), "the outline above runs between lines");
  // Lines closer than the outline is wide (5 px apart): the cut-out's edge
  // still falls between two of them.
  const tight = (y) => y % 15 >= 5;
  const dense = image(800, 600, (x, y) => (tight(y) && x % 4 !== 0 ? [20, 20, 20, 255] : [255, 255, 255, 255]));
  const [close] = focusCuts(800, 600, { x: 200, y: 155, w: 300, h: 40 }, null, dense);
  for (const y of [close.y, close.y + close.h - 1]) assert.ok(!tight(y), `the edge at y=${y} runs between close lines`);
  // A lone small control gets context; near the capture's edge, still its size.
  const icon = focusPiece(1440, 900, { x: 700, y: 400, w: 34, h: 34 });
  assert.ok(icon.w >= 138 && icon.h >= 60);
  const corner = focusPiece(1440, 900, { x: 1370, y: 13, w: 38, h: 38 });
  assert.equal(corner.x + corner.w, 1440);
  assert.ok(Math.abs(corner.w - icon.w) <= 4);
  assert.deepEqual(focusCuts(1440, 900, null), []);
});

test("focusLayout: a cut-out beside small pieces, below wide strips, none for big areas (MAN-02)", () => {
  const beside = focusLayout(1440, 900, focusCuts(1440, 900, { x: 480, y: 820, w: 100, h: 30 }));
  assert.equal(beside.mode, "beside");
  assert.ok(beside.crop.y + beside.crop.h <= 900, "the crop stays inside the capture");
  assert.ok(beside.mag >= 1.4 && beside.mag <= 3, "enlarged, never blown up");
  assert.ok(beside.topMm > 0, "level with its zone, low in the capture");
  assert.equal(focusLayout(1440, 900, focusCuts(1440, 900, { x: 300, y: 10, w: 640, h: 40 })).mode, "below");
  assert.equal(focusLayout(1440, 900, focusCuts(1440, 900, { x: 100, y: 100, w: 900, h: 600 })), null, "a whole panel needs none");
  assert.equal(focusLayout(1440, 900, []), null);
  const svg = cutoutSvg("file:///a.png", 1440, 900, beside, { id: "cut-x", label: "Detalle: x" });
  const c = beside.crop;
  assert.ok(svg.includes(`viewBox="${c.x} ${c.y} ${c.w} ${c.h}"`), "cropped in capture pixels");
  assert.match(svg, /<clipPath id="cut-x"><rect [^>]*rx="[\d.]+"\/><\/clipPath>/);
  assert.equal((svg.match(/<image /g) ?? []).length, 1);
  // A committed capture whose outline moved is not «unchanged».
  const a = image(600, 300, () => [255, 255, 255, 255]);
  const b = image(600, 300, () => [255, 255, 255, 255]);
  drawFocus(a, { x: 100, y: 50, w: 300, h: 80 }, { color: FOCUS_COLOR, pad: 0 });
  drawFocus(b, { x: 100, y: 52, w: 300, h: 80 }, { color: FOCUS_COLOR, pad: 0 });
  assert.equal(sameFocusPixels(a, b), false);
  assert.equal(sameFocusPixels(a, a), true);
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
  // Each question asked with useConfirm is a dialog to tour (NC-017); a local
  // function named confirm is not.
  assert.equal(countDialogs("if (!(await confirm({ title }))) return; async function confirm() {}"), 1);
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

test("--secret-scan finds the key as the tour runner does, and never passes without one (FIX-41)", async () => {
  await tempDir(async (dir) => {
    const none = await secretScan(dir, {});
    assert.equal(none.ok, false);
    assert.match(none.message, /checked nothing/);

    const key = "sk-from-dotenv-0123456789";
    writeFileSync(join(dir, ".env"), `ANTHROPIC_API_KEY=${key}\n`);
    mkdirSync(join(dir, "docs", "manual"), { recursive: true });
    writeFileSync(join(dir, "docs", "manual", "clean.md"), "nothing here\n");
    const clean = await secretScan(dir, { PHAROS_TOURS_AI_KEY: "" });
    assert.equal(clean.ok, true);

    writeFileSync(join(dir, "docs", "manual", "leak.md"), `key: ${key}\n`);
    const leak = await secretScan(dir, {});
    assert.equal(leak.ok, false);
    assert.match(leak.message, /leak\.md/);
    assert.ok(!leak.message.includes(key), "the key is never printed");
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
    const startOf = () => null;
    assert.deepEqual(acquireLock(file, { pid: 111, isAlive, startOf }), { ok: true });
    const refused = acquireLock(file, { pid: 222, isAlive, startOf });
    assert.equal(refused.ok, false);
    assert.equal(refused.holder.pid, 111);
    assert.match(lockMessage(refused.holder, file), /otra ejecución de recorridos en curso \(PID 111/);
    assert.ok(lockMessage(refused.holder, file).includes(file), "says which file to delete");
    releaseLock(file, 222);
    assert.equal(acquireLock(file, { pid: 222, isAlive, startOf }).ok, false, "another run's lock is never released");
    alive.delete(111);
    assert.deepEqual(acquireLock(file, { pid: 222, isAlive, startOf }), { ok: true }, "a dead holder's lock is stale");
    releaseLock(file, 222);
    writeFileSync(file, "not json");
    const refusedYoung = acquireLock(file, { pid: 333, isAlive, startOf });
    assert.deepEqual(refusedYoung, { ok: false, holder: null }, "an unreadable young lock is a run still writing it");
    const later = new Date(Date.now() + UNREADABLE_GRACE_MS + 1_000);
    assert.deepEqual(acquireLock(file, { pid: 333, isAlive, startOf, now: later }), { ok: true }, "an unreadable old lock is replaced");
    releaseLock(file, 333);
    // A live PID that started after the lock was written is a reused PID.
    alive.add(444);
    writeFileSync(file, JSON.stringify({ pid: 444, startedAt: "2026-01-01T00:00:00.000Z" }));
    assert.equal(acquireLock(file, { pid: 555, isAlive, startOf: () => Date.parse("2026-01-01T00:00:00.500Z") }).ok, false, "same process: held");
    assert.deepEqual(acquireLock(file, { pid: 555, isAlive, startOf: () => Date.parse("2026-02-01T00:00:00.000Z") }), { ok: true }, "reused PID: stale");
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

test("printWithEdge waits for a PDF Edge writes after returning (MAN-04)", () =>
  tempDir((dir) => {
    const pdf = join(dir, "late.pdf");
    assert.ok(!settled(pdf, 0), "nothing yet");
    // Another process writes it a moment later, as Edge 157 does.
    spawn(process.execPath, ["-e", `setTimeout(() => require("fs").writeFileSync(${JSON.stringify(pdf)}, "%PDF-1.7"), 300)`], { stdio: "ignore" });
    assert.ok(settled(pdf, 10_000));
  }));

test("selectTours runs only the preparation and the asked chapters, in run order, and refuses a bad filter (MAN-03)", async () => {
  const { CHAPTERS, selectTours } = await import("../e2e/tours/manifest.ts");
  assert.equal(selectTours(null).files.length, CHAPTERS.filter((c) => c.file).length);
  assert.deepEqual(selectTours(null).asked, []);
  // No chapter is added any more, not even chapter 1: each prepares its data.
  assert.deepEqual(selectTours("^13").files, ["00-preparacion.tour.ts", "13-trazabilidad.tour.ts"]);
  assert.deepEqual(selectTours("^1[23]").asked, ["12-defectos.tour.ts", "13-trazabilidad.tour.ts"], "run order, not number order");
  assert.deepEqual(selectTours("^01").files, ["00-preparacion.tour.ts", "01-acceso.tour.ts"]);
  assert.throws(() => selectTours("["), /not a valid regular expression/);
  assert.throws(() => selectTours("^99"), /matches no tour file/);
  assert.throws(() => selectTours("^00"), /matches no tour file/, "the preparation alone is not a run");
});

test("prerequisites: built on earlier ones, made on screen before every chapter that uses them (MAN-03)", async () => {
  const { CHAPTERS, PREREQUISITES, prerequisiteClosure } = await import("../e2e/tours/manifest.ts");
  assert.deepEqual(prerequisiteErrors(CHAPTERS, PREREQUISITES, prerequisiteClosure), []);
  // The closure brings what a prerequisite is built on, in preparation order.
  assert.deepEqual(
    prerequisiteClosure(["casos-base"]).map((p) => p.id),
    ["cuenta-liomar", "proyectos", "prefijos", "ajustes", "requisitos", "casos-base"],
  );
  assert.throws(() => prerequisiteClosure(["nada"]), /unknown prerequisite/);
  // A chapter that uses data made by a later chapter is refused.
  const chapters = [
    { id: "a", uses: ["p"] },
    { id: "b", uses: [] },
  ];
  const prereqs = [{ id: "p", madeBy: "b", after: [] }];
  assert.match(prerequisiteErrors(chapters, prereqs, prerequisiteClosure).join(), /made on screen by b, which must run before it/);
  assert.match(prerequisiteErrors([{ id: "a", uses: ["x"] }], prereqs, prerequisiteClosure).join(), /unknown prerequisite x/);
});

test("groupInset: a wide control keeps a column-wide cut-out under its half-width capture (MAN-02)", () => {
  // At full width this strip needs no cut-out of its own; in a column it does.
  const inset = groupInset(1440, 900, focusCuts(1440, 900, { x: 56, y: 411, w: 460, h: 52 }), 85);
  assert.equal(inset.mode, "below");
  assert.ok(inset.insetMm > 80 && inset.insetMm <= 85, "about the column's width");
  assert.ok(inset.mag >= 2.5, "readable: at least 2.5× the capture");
  assert.ok(inset.crop.x >= 0 && inset.crop.x + inset.crop.w <= 1440);
  assert.equal(groupInset(1440, 900, [], 85), null);
});
