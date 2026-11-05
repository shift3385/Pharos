// Builds the user manual (MAN-01) from the guided tours.
//
//   node scripts/build-manual.mjs --from-run   take e2e/results/tours/ (after `npm run manual`)
//   node scripts/build-manual.mjs              rebuild from docs/manual/pasos.json (no app run)
//   … --no-pdf                                 Markdown only
//   … --allow-failed                           build even if some tour steps failed
//
// Output, all in docs/manual/:
//   README.md, NN-<capitulo>.md   Spanish chapters (generated: edit fuentes/)
//   img/<capitulo>/<paso>.png     screenshots, re-encoded deterministically
//   pasos.json                    the step data, so the manual rebuilds offline
//   Pharos-manual-de-usuario.pdf  printed by headless Microsoft Edge (gitignored)
//
// Small diffs: a new capture replaces the committed one only when more than
// MANUAL_DIFF_THRESHOLD (default 0.5 %) of its pixels changed.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { changedShare, decodePng, encodePng } from "./manual/png.mjs";
import { markdownToHtml, escapeHtml } from "./manual/markdown.mjs";
import { parseSource, pdfPageCount } from "./manual/sources.mjs";

const repoDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const manualDir = join(repoDir, "docs", "manual");
const sourcesDir = join(manualDir, "fuentes");
const imgDir = join(manualDir, "img");
const buildDir = join(manualDir, ".build");
const runDir = join(repoDir, "e2e", "results", "tours");
export const PDF_NAME = "Pharos-manual-de-usuario.pdf";
const REPO_URL = "https://github.com/shift3385/Pharos/blob/main";
const THRESHOLD = Number(process.env.MANUAL_DIFF_THRESHOLD ?? 0.005);

const { CHAPTERS } = await import(pathToFileURL(join(repoDir, "e2e", "tours", "manifest.ts")).href);
const pkg = JSON.parse(readFileSync(join(repoDir, "package.json"), "utf8"));
const MANUAL_CHAPTERS = CHAPTERS.filter((c) => c.inManual !== false);

const args = new Set(process.argv.slice(2));

function fail(message) {
  console.error(`✖ build-manual: ${message}`);
  process.exit(1);
}

// ---- Steps: from a tour run or from pasos.json -------------------------------------

function readRun() {
  const file = join(runDir, "steps.jsonl");
  if (!existsSync(file)) fail("no tour run found (e2e/results/tours/steps.jsonl). Run `npm run manual`.");
  const steps = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const failed = steps.filter((s) => s.status === "failed");
  if (failed.length > 0 && !args.has("--allow-failed")) {
    fail(
      `${failed.length} tour step(s) failed (${failed.map((s) => `${s.chapter}/${s.id}`).join(", ")}); the manual is not built from a broken run.`,
    );
  }
  return steps;
}

/** Copies the run's captures into docs/manual/img, keeping a committed image
 *  byte for byte when it barely changed. */
function importImages(steps) {
  let replaced = 0;
  let kept = 0;
  for (const s of steps) {
    // A step kept from the previous manual (skipped in this run) has no new capture.
    if (!s.image || s.keptFromBefore) continue;
    // Compared as it would be committed (palette PNG), so the quantisation
    // itself never counts as a change.
    const encoded = encodePng(decodePng(readFileSync(join(runDir, "img", s.image))));
    const fresh = decodePng(encoded);
    const target = join(imgDir, s.image);
    if (existsSync(target)) {
      const old = decodePng(readFileSync(target));
      if (changedShare(old, fresh) <= THRESHOLD) {
        kept++;
        continue;
      }
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, encoded);
    replaced++;
  }
  // Images no step uses any more (a renamed or removed step).
  const used = new Set(steps.filter((s) => s.image).map((s) => s.image.replaceAll("\\", "/")));
  let removed = 0;
  if (existsSync(imgDir)) {
    for (const dir of readdirSync(imgDir)) {
      for (const file of readdirSync(join(imgDir, dir))) {
        if (!used.has(`${dir}/${file}`)) {
          rmSync(join(imgDir, dir, file));
          removed++;
        }
      }
      if (readdirSync(join(imgDir, dir)).length === 0) rmSync(join(imgDir, dir), { recursive: true });
    }
  }
  console.log(`› Images: ${replaced} updated, ${kept} unchanged, ${removed} removed`);
}

function loadSteps() {
  const pasosFile = join(manualDir, "pasos.json");
  if (!args.has("--from-run")) {
    if (!existsSync(pasosFile)) fail("docs/manual/pasos.json not found: run `npm run manual` first.");
    return JSON.parse(readFileSync(pasosFile, "utf8"));
  }
  // A step this run skipped (the AI chapter without a key) keeps what the
  // committed manual had for it, capture included, instead of losing it.
  const previous = existsSync(pasosFile) ? JSON.parse(readFileSync(pasosFile, "utf8")).steps : [];
  const before = new Map(previous.map((s) => [`${s.chapter}/${s.id}`, s]));
  const steps = readRun().map((s) => {
    const old = before.get(`${s.chapter}/${s.id}`);
    return s.status === "skipped" && old?.status === "passed" ? { ...old, n: s.n, keptFromBefore: true } : s;
  });
  importImages(steps);
  const order = new Map(CHAPTERS.map((c, i) => [c.id, i]));
  const clean = steps
    .filter((s) => s.status !== "failed")
    .map(({ chapter, n, id, title, caption, covers, image, viewport, status, reason }) => ({
      chapter,
      n,
      id,
      title,
      caption,
      covers,
      image: image ? image.replaceAll("\\", "/") : null,
      viewport,
      status,
      ...(reason ? { reason } : {}),
    }))
    .sort((a, b) => order.get(a.chapter) - order.get(b.chapter) || a.n - b.n);
  // Keep the previous date when nothing else changed, so a rerun of an
  // unchanged app leaves the manual untouched.
  let date = new Date().toISOString().slice(0, 10);
  if (existsSync(pasosFile)) {
    const old = JSON.parse(readFileSync(pasosFile, "utf8"));
    if (JSON.stringify(old.steps) === JSON.stringify(clean) && old.version === pkg.version) date = old.date;
  }
  const data = { version: pkg.version, date, steps: clean };
  writeFileSync(pasosFile, `${JSON.stringify(data, null, 2)}\n`);
  return data;
}

// ---- Prose sources -----------------------------------------------------------------

function source(chapter) {
  const file = join(sourcesDir, `${chapter.id}.md`);
  return existsSync(file) ? parseSource(readFileSync(file, "utf8")) : parseSource("");
}

// ---- Markdown ----------------------------------------------------------------------

const docName = (c) => `${String(c.number).padStart(2, "0")}-${c.id}.md`;
const longDate = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function chapterMarkdown(c, steps) {
  const src = source(c);
  const lines = [
    `<!-- Generado por \`npm run manual\` desde e2e/tours/${c.file ?? "(pendiente)"} y docs/manual/fuentes/${c.id}.md. No lo edites a mano: edita la fuente. -->`,
    "",
    `# ${c.number}. ${c.title}`,
    "",
  ];
  if (c.status === "pending") {
    lines.push(`> **Capítulo pendiente.** ${c.pending}`, "");
  }
  if (src.purpose) lines.push("## Para qué sirve", "", src.purpose, "");
  if (steps.length > 0) {
    lines.push("## Paso a paso", "");
    for (const s of steps) {
      lines.push(`### ${c.number}.${s.n}. ${s.title}`, "", s.caption, "");
      if (s.status === "skipped") lines.push(`> **Pendiente:** ${s.reason ?? "sin captura en esta versión"}.`, "");
      if (s.image) {
        const width = s.viewport?.width && s.viewport.width < 768 ? ' width="280"' : "";
        lines.push(width ? `<img src="img/${s.image}" alt="${escapeHtml(s.title)}"${width}>` : `![${s.title}](img/${s.image})`, "");
      }
      if (src.notes[s.id]) lines.push(src.notes[s.id], "");
    }
  }
  if (src.tips) lines.push("## Consejos", "", src.tips, "");
  if (src.seeAlso) lines.push("## Véase también", "", src.seeAlso, "");
  const i = MANUAL_CHAPTERS.indexOf(c);
  const nav = [
    i > 0 ? `← [${MANUAL_CHAPTERS[i - 1].title}](${docName(MANUAL_CHAPTERS[i - 1])})` : null,
    "[Índice](README.md)",
    i < MANUAL_CHAPTERS.length - 1 ? `[${MANUAL_CHAPTERS[i + 1].title}](${docName(MANUAL_CHAPTERS[i + 1])}) →` : null,
  ].filter(Boolean);
  lines.push("---", "", nav.join(" · "), "");
  return lines.join("\n");
}

function indexMarkdown(data, byChapter) {
  const lines = [
    "<!-- Generado por `npm run manual`. No lo edites a mano: edita docs/manual/fuentes/ o los tours (e2e/tours/). -->",
    "",
    "# Manual de usuario de Pharos",
    "",
    `Versión **${data.version}** · generado el ${longDate(data.date)} a partir de las pruebas guiadas (\`e2e/tours/\`).`,
    "",
    "Este manual explica, pantalla a pantalla, cómo se usa Pharos. Cada paso es también una prueba automática: si la aplicación cambia, `npm run manual` vuelve a recorrerla, rehace las capturas y regenera el manual (Markdown y PDF).",
    "",
    `- **PDF:** \`docs/manual/${PDF_NAME}\` tras \`npm run manual\` o \`npm run manual:build\` (no se versiona); en el CI, el artefacto \`manual\` de \`main\` y, en cada versión, el artefacto del instalador (flujo «Installer»), que lo incluye.`,
    "- **Guía de pruebas de la beta:** [guia-beta.md](../guia-beta.md) · **Glosario:** [GLOSARIO.md](../GLOSARIO.md)",
    "- **Revisión de cada regeneración:** [REVIEW.md](REVIEW.md)",
    "",
    "## Contenido",
    "",
  ];
  for (const c of MANUAL_CHAPTERS) {
    const steps = byChapter.get(c.id) ?? [];
    const pending = c.status === "pending" ? " — *pendiente*" : "";
    lines.push(`${c.number}. [${c.title}](${docName(c)})${pending} (${steps.length} pasos)`);
  }
  lines.push("");
  return lines.join("\n");
}

// ---- HTML + PDF ----------------------------------------------------------------------

const fileUrl = (p) => pathToFileURL(p).href;

function fontFaces() {
  const font = (pkgName, file, family, weight) => {
    const p = join(repoDir, "node_modules", "@fontsource", pkgName, "files", file);
    return existsSync(p)
      ? `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;src:url("${fileUrl(p)}") format("woff2")}`
      : "";
  };
  return [
    font("inter", "inter-latin-400-normal.woff2", "Inter", 400),
    font("inter", "inter-latin-600-normal.woff2", "Inter", 600),
    font("inter", "inter-latin-700-normal.woff2", "Inter", 700),
    font("jetbrains-mono", "jetbrains-mono-latin-400-normal.woff2", "JetBrains Mono", 400),
  ].join("\n");
}

/** The light Faro Nocturno tokens (the :root block of the app's tokens.css). */
function tokens() {
  const css = readFileSync(join(repoDir, "src", "shared", "theme", "tokens.css"), "utf8");
  const m = /:root\s*\{[\s\S]*?\n\}/.exec(css);
  return m ? m[0] : "";
}

const STYLE = `
@page { size: A4; margin: 18mm 16mm 20mm 16mm;
  @bottom-left { content: "Pharos · Manual de usuario"; font: 8.5pt Inter, sans-serif; color: #5f6b7a; }
  @bottom-right { content: counter(page); font: 600 9pt Inter, sans-serif; color: #1f4e79; } }
@page cover { margin: 0; @bottom-left { content: none } @bottom-right { content: none } }
html { font-family: var(--font-sans); color: var(--color-text-primary); font-size: 10.5pt; line-height: 1.5; }
body { margin: 0; }
a { color: var(--color-navy-500); text-decoration: none; }
code { font-family: var(--font-mono); font-size: 0.9em; background: var(--color-surface-2); padding: 0 3px; border-radius: 3px; }
.cover { page: cover; height: 297mm; background: var(--color-navy-900); color: var(--color-on-navy);
  display: flex; flex-direction: column; justify-content: center; padding: 0 24mm; box-sizing: border-box; break-after: page; }
.cover img { width: 30mm; height: 30mm; }
.cover .brand { font-size: 40pt; font-weight: 700; margin: 8mm 0 0; letter-spacing: -0.5pt; }
.cover .kind { font-size: 20pt; color: var(--color-accent); margin: 2mm 0 14mm; font-weight: 600; }
.cover .meta { color: var(--color-on-navy-muted); font-size: 11pt; }
.cover .beam { height: 2mm; width: 40mm; background: var(--color-accent); border-radius: 1mm; margin-bottom: 8mm; }
.toc { break-after: page; }
.toc h1, .chapter h1 { font-size: 22pt; color: var(--color-navy-900); margin: 0 0 6mm; padding-bottom: 3mm; border-bottom: 1.5mm solid var(--color-accent); }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc li { display: flex; align-items: baseline; gap: 2mm; padding: 1.6mm 0; border-bottom: 0.2mm dotted var(--color-border-input); }
.toc li .t { flex: 1; } .toc li .p { font-weight: 600; color: var(--color-navy-500); }
.toc li.sub { padding-left: 8mm; font-size: 9.5pt; color: var(--color-text-secondary); border-bottom: none; padding-top: 0.4mm; padding-bottom: 0.4mm; }
.toc .intro { color: var(--color-text-secondary); margin-bottom: 6mm; }
.chapter { break-before: page; }
.chapter .num { color: var(--color-accent); margin-right: 2mm; }
h2 { font-size: 13.5pt; color: var(--color-navy-700); margin: 6mm 0 2mm; }
.step { break-inside: avoid; margin: 0 0 6mm; }
.step h3 { font-size: 11.5pt; margin: 0 0 1.5mm; color: var(--color-navy-900); }
.step h3 .n { display: inline-block; min-width: 10mm; color: var(--color-navy-500); }
.step p { margin: 0 0 2mm; }
.step img { display: block; width: 100%; border: 0.3mm solid var(--color-border); border-radius: 2mm; box-shadow: 0 1mm 2mm rgba(16,24,40,.08); }
.step img.mobile { width: 62mm; }
.note { background: var(--color-navy-100); border-left: 1.2mm solid var(--color-navy-500); padding: 2mm 3mm; border-radius: 1mm; margin: 2mm 0; }
.pending { background: #fdf3e2; border-left: 1.2mm solid var(--color-accent); padding: 2mm 3mm; border-radius: 1mm; margin: 2mm 0; }
.tips { background: var(--color-surface-2); padding: 1mm 4mm; border-radius: 2mm; }
blockquote { margin: 2mm 0; padding: 2mm 3mm; border-left: 1.2mm solid var(--color-accent); background: #fdf3e2; }
ul, ol { padding-left: 6mm; }
`;

function htmlDocument(body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Pharos — Manual de usuario</title>
<style>${fontFaces()}\n${tokens()}\n${STYLE}</style></head><body>${body}</body></html>`;
}

/** Rewrites a relative Markdown link of a source (from docs/manual/) for the PDF. */
function absoluteLinks(html) {
  return html.replace(/href="(?!https?:|#|mailto:)([^"]+)"/g, (_, href) => {
    const target = relative(repoDir, join(manualDir, href)).replaceAll("\\", "/");
    return `href="${REPO_URL}/${target}"`;
  });
}

function chapterHtml(c, steps) {
  const src = source(c);
  const parts = [`<section class="chapter" id="cap-${c.id}"><h1><span class="num">${c.number}.</span>${escapeHtml(c.title)}</h1>`];
  if (c.status === "pending") parts.push(`<div class="pending"><strong>Capítulo pendiente.</strong> ${escapeHtml(c.pending)}</div>`);
  if (src.purpose) parts.push(`<h2>Para qué sirve</h2>${markdownToHtml(src.purpose)}`);
  if (steps.length > 0) parts.push("<h2>Paso a paso</h2>");
  for (const s of steps) {
    parts.push(`<div class="step"><h3><span class="n">${c.number}.${s.n}</span>${escapeHtml(s.title)}</h3>${markdownToHtml(s.caption)}`);
    if (s.status === "skipped") parts.push(`<div class="pending"><strong>Pendiente:</strong> ${escapeHtml(s.reason ?? "sin captura")}.</div>`);
    if (s.image) {
      const file = join(imgDir, s.image);
      const mobile = s.viewport?.width && s.viewport.width < 768;
      // A capture of one element (a dialog) keeps its proportion to the 1440
      // px window instead of being blown up to the full text width.
      const width = readFileSync(file).readUInt32BE(16);
      const style = !mobile && width < 1440 ? ` style="width:${Math.max(40, Math.round((width / 1440) * 100 * 1.25))}%"` : "";
      parts.push(`<img${mobile ? ' class="mobile"' : ""}${style} src="${fileUrl(file)}" alt="${escapeHtml(s.title)}">`);
    }
    if (src.notes[s.id]) parts.push(`<div class="note">${markdownToHtml(src.notes[s.id])}</div>`);
    parts.push("</div>");
  }
  if (src.tips) parts.push(`<h2>Consejos</h2><div class="tips">${markdownToHtml(src.tips)}</div>`);
  if (src.seeAlso) parts.push(`<h2>Véase también</h2>${markdownToHtml(src.seeAlso)}`);
  parts.push("</section>");
  return absoluteLinks(parts.join("\n"));
}

function coverHtml(data) {
  const logo = join(repoDir, "src-tauri", "icons", "128x128@2x.png");
  return `<section class="cover"><div class="beam"></div><img src="${fileUrl(logo)}" alt="">
<p class="brand">Pharos</p><p class="kind">Manual de usuario</p>
<p class="meta">Versión ${escapeHtml(data.version)}<br>Generado el ${longDate(data.date)} a partir de las pruebas guiadas de la aplicación</p></section>`;
}

function tocHtml(byChapter, pages) {
  const rows = MANUAL_CHAPTERS.map((c) => {
    const steps = byChapter.get(c.id) ?? [];
    const subs = steps
      .map((s) => `<li class="sub"><span class="t">${c.number}.${s.n} ${escapeHtml(s.title)}</span></li>`)
      .join("");
    const page = pages?.get(c.id) ?? "";
    return `<li><span class="t"><a href="#cap-${c.id}">${c.number}. ${escapeHtml(c.title)}</a>${c.status === "pending" ? " <em>(pendiente)</em>" : ""}</span><span class="p">${page}</span></li>${subs}`;
  }).join("\n");
  return `<section class="toc"><h1>Contenido</h1><p class="intro">Cada capítulo corresponde a un área de la aplicación. Los pasos son a la vez pruebas automáticas: el manual se regenera con <code>npm run manual</code> cuando la aplicación cambia.</p><ol>${rows}</ol></section>`;
}

function edgePath() {
  const candidates = [
    process.env.PHAROS_EDGE,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) fail("Microsoft Edge not found (set PHAROS_EDGE to msedge.exe).");
  return found;
}

/** Prints an HTML file to PDF with headless Edge, in a throwaway profile. */
function printPdf(htmlFile, pdfFile) {
  const profile = mkdtempSync(join(tmpdir(), "pharos-manual-edge-"));
  try {
    execFileSync(
      edgePath(),
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        `--user-data-dir=${profile}`,
        "--no-pdf-header-footer",
        "--generate-pdf-document-outline",
        "--allow-file-access-from-files",
        `--print-to-pdf=${pdfFile}`,
        fileUrl(htmlFile),
      ],
      { stdio: "ignore", timeout: 180_000 },
    );
  } finally {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
  if (!existsSync(pdfFile) || statSync(pdfFile).size === 0) fail(`Edge did not print ${pdfFile}.`);
}

function buildPdf(data, byChapter) {
  mkdirSync(buildDir, { recursive: true });
  const chapters = MANUAL_CHAPTERS.map((c) => [c, chapterHtml(c, byChapter.get(c.id) ?? [])]);
  // Pass 1: the pages of the front matter and of each chapter on its own
  // (every chapter starts on a new page, so they add up).
  const pagesOf = (name, body) => {
    const html = join(buildDir, `${name}.html`);
    const pdf = join(buildDir, `${name}.pdf`);
    writeFileSync(html, htmlDocument(body));
    printPdf(html, pdf);
    return pdfPageCount(readFileSync(pdf));
  };
  let page = 1 + pagesOf("front", coverHtml(data) + tocHtml(byChapter, null));
  const pages = new Map();
  for (const [c, html] of chapters) {
    pages.set(c.id, page);
    page += pagesOf(`cap-${c.id}`, html);
  }
  // Pass 2: the whole book, with the page numbers in the contents.
  const html = join(buildDir, "manual.html");
  writeFileSync(html, htmlDocument(coverHtml(data) + tocHtml(byChapter, pages) + chapters.map(([, h]) => h).join("\n")));
  const pdf = join(manualDir, PDF_NAME);
  printPdf(html, pdf);
  const total = pdfPageCount(readFileSync(pdf));
  console.log(`› PDF: docs/manual/${PDF_NAME} (${total} pages, ${Math.round(statSync(pdf).size / 1024)} KB)`);
  for (const f of readdirSync(buildDir)) if (f.endsWith(".pdf")) rmSync(join(buildDir, f));
}

// ---- Main ----------------------------------------------------------------------------

const data = loadSteps();
const byChapter = new Map();
for (const s of data.steps) {
  if (!byChapter.has(s.chapter)) byChapter.set(s.chapter, []);
  byChapter.get(s.chapter).push(s);
}

mkdirSync(manualDir, { recursive: true });
for (const f of readdirSync(manualDir)) {
  if (/^\d\d-.+\.md$/.test(f)) rmSync(join(manualDir, f));
}
for (const c of MANUAL_CHAPTERS) {
  writeFileSync(join(manualDir, docName(c)), chapterMarkdown(c, byChapter.get(c.id) ?? []));
}
writeFileSync(join(manualDir, "README.md"), indexMarkdown(data, byChapter));
console.log(`› Markdown: docs/manual/ (${MANUAL_CHAPTERS.length} chapters, ${data.steps.length} steps)`);

if (!args.has("--no-pdf")) buildPdf(data, byChapter);
