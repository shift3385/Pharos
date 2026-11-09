// The one person of the manual (NC-052, MAN-03): every capture and every text
// shows Liomar Rodríguez («Liomar QA»), the QA lead of Pharos, with the test
// account liomar.qa@pharos.test. No other person, account or e-mail may
// appear: the tours check the text of each screen they capture and the manual
// build checks the captions, the chapter sources and the generated HTML.

/** The tour account (the e-mail is a test one, never a real person's). */
export const PERSONA = {
  alias: "Liomar QA",
  first: "Liomar",
  last: "Rodríguez",
  email: "liomar.qa@pharos.test",
};

/**
 * Names and accounts that must never show: the old seed account («Smoke»,
 * smoke@pharos.dev), the earlier example people (Lucía Romero, Ana Pérez) and
 * any address on pharos.dev. Whole words only, so «Analista», «semana» or
 * «smoke test» in English prose are not hits («smoke» alone is: the seed
 * alias). Case-sensitive for the people, so «ana» inside a word never counts.
 */
const PATTERNS = [
  /(?<![\p{L}\p{N}])(?:Lucía|Lucia|Romero|Ana|Pérez|Perez)(?![\p{L}\p{N}])/gu,
  // Not before «@»: the address is the next pattern's hit.
  /(?<![\p{L}\p{N}])smoke(?![\p{L}\p{N}@])/giu,
  /[\w.+-]+@pharos\.dev\b/giu,
];

/** The forbidden names in `text`, in order of appearance (empty: clean). */
export function foreignNames(text) {
  const hits = [];
  for (const re of PATTERNS) {
    for (const m of String(text ?? "").matchAll(re)) hits.push({ at: m.index ?? 0, name: m[0] });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.name);
}
