// Pure helpers of the manual generator (MAN-01), apart from build-manual.mjs
// so scripts/manual.test.mjs can test them without building anything.

/** docs/manual/fuentes/<id>.md: «## Para qué sirve», «## Atajos de teclado»,
 *  «## Si algo no sale», «## En el móvil» (manual v2, MAN-03), «## Consejos»,
 *  «## Véase también» and per-step notes as «### Paso <id>». */
const SECTIONS = [
  ["para qué", "purpose"],
  ["atajos", "keys"],
  ["si algo", "trouble"],
  ["en el móvil", "mobile"],
  ["consejos", "tips"],
  ["véase", "seeAlso"],
];

/** The headings the manual prints for the sections after the steps, in order. */
export const AFTER_STEPS = [
  ["keys", "Atajos de teclado"],
  ["trouble", "Si algo no sale"],
  ["mobile", "En el móvil"],
];

/** The appendix «Atajos de teclado» (MAN-03): every chapter's «Atajos de
 *  teclado» table, in manual order, under the chapter's number and title.
 *  Generated, never written by hand, so it cannot drift from the chapters.
 *  `entries`: [{ number, title, keys }]; chapters without keys are left out. */
export function keyboardAppendix(entries) {
  return entries
    .filter((e) => e.keys && e.keys.trim())
    .map((e) => `### ${e.number}. ${e.title}\n\n${e.keys.trim()}\n`)
    .join("\n");
}

export function parseSource(text) {
  const out = { purpose: "", extra: [], keys: "", trouble: "", mobile: "", tips: "", seeAlso: "", notes: {} };
  let key = null;
  let buf = [];
  const flush = () => {
    if (!key) return;
    const body = buf.join("\n").trim();
    if (key.startsWith("paso:")) out.notes[key.slice(5)] = body;
    else if (key.startsWith("extra:")) {
      if (body) out.extra.push({ heading: key.slice(6), body });
    } else out[key] = body;
  };
  for (const line of text.split(/\r?\n/)) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    const h3 = /^###\s+Paso\s+(\S+)\s*$/.exec(line);
    if (h3) {
      flush();
      key = `paso:${h3[1]}`;
      buf = [];
    } else if (h2 && !line.startsWith("###")) {
      flush();
      const name = h2[1].toLowerCase();
      // A section the manual does not name (e.g. «Cómo se vincula un test»)
      // prints after the steps, with its own heading (NC-045, MAN-03).
      key = SECTIONS.find(([prefix]) => name.startsWith(prefix))?.[1] ?? `extra:${h2[1]}`;
      buf = [];
    } else if (key) buf.push(line);
  }
  flush();
  return out;
}

/** Page count of a Chromium PDF: the largest /Count of its page tree. */
export function pdfPageCount(buf) {
  const text = buf.toString("latin1");
  const counts = [...text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)].map((m) =>
    Number(m[1] ?? m[2]),
  );
  if (counts.length > 0) return Math.max(...counts);
  return (text.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
}

/**
 * Named destinations of a Chromium (Skia) PDF as a Map from the anchor id
 * (an HTML `id` some link points to) to its 0-based page. Skia writes them
 * in the catalog's `/Dests` dictionary as `/name [page 0 R /XYZ …]`, in
 * plain (not stream-compressed) objects. The manual's contents use it to print
 * the page of every chapter and step (MAN-02).
 */
export function pdfNamedDests(buf) {
  const text = buf.toString("latin1");
  const objects = new Map();
  for (const m of text.matchAll(/(\d+) 0 obj\b([\s\S]*?)(?:\bstream\r?\n|\bendobj)/g)) objects.set(Number(m[1]), m[2]);
  const ref = (s, key) => {
    const m = new RegExp(`/${key}\\s+(\\d+) 0 R`).exec(s ?? "");
    return m ? Number(m[1]) : null;
  };
  const out = new Map();
  const root = [...text.matchAll(/\/Root\s+(\d+) 0 R/g)].pop();
  if (!root) return out;
  const catalog = objects.get(Number(root[1]));
  // Pages in order: walk the page tree (Skia nests /Pages nodes in big books).
  const pages = [];
  const walk = (n, depth) => {
    const o = objects.get(n);
    if (!o || depth > 64) return;
    if (/\/Type\s*\/Page\b(?!s)/.test(o)) {
      pages.push(n);
      return;
    }
    const kids = /\/Kids\s*\[([^\]]*)\]/.exec(o);
    if (kids) for (const k of kids[1].matchAll(/(\d+) 0 R/g)) walk(Number(k[1]), depth + 1);
  };
  walk(ref(catalog, "Pages"), 0);
  const index = new Map(pages.map((n, i) => [n, i]));
  const dests = objects.get(ref(catalog, "Dests")) ?? "";
  const decode = (name) => name.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  for (const m of dests.matchAll(/\/([^\s/[\]<>()]+)\s*\[\s*(\d+) 0 R/g)) {
    if (index.has(Number(m[2]))) out.set(decode(m[1]), index.get(Number(m[2])));
  }
  return out;
}
