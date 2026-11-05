// Pure helpers of the manual generator (MAN-01), apart from build-manual.mjs
// so scripts/manual.test.mjs can test them without building anything.

/** docs/manual/fuentes/<id>.md: «## Para qué sirve», «## Consejos»,
 *  «## Véase también» and per-step notes as «### Paso <id>». */
export function parseSource(text) {
  const out = { purpose: "", tips: "", seeAlso: "", notes: {} };
  let key = null;
  let buf = [];
  const flush = () => {
    if (!key) return;
    const body = buf.join("\n").trim();
    if (key.startsWith("paso:")) out.notes[key.slice(5)] = body;
    else out[key] = body;
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
      key = name.startsWith("para qué") ? "purpose" : name.startsWith("consejos") ? "tips" : name.startsWith("véase") ? "seeAlso" : null;
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
