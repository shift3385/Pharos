// The accounts of the manual (NC-052, amended 2026-11-19; MAN-03). Exactly
// three:
//   - Liomar Rodríguez («Liomar QA»), the QA lead of Pharos, test account
//     liomar.qa@pharos.test: every chapter is his. He is not the server
//     administrator.
//   - his teammate Jorge L. Meneses Yero, jorge.meneses@pharos.test, only in
//     the team features (members, invitations, approval by another person,
//     the server's user list). He acts from his own computer (the tour API)
//     and never signs in to the app the tours drive.
//   - «Administrador», admin@pharos.test: the server administrator, not a
//     person. It is the first account of the tour server (run-tours.mjs
//     registers it before chapter 1) and the app signs in with it only for
//     the server-administration steps of chapter 15.
// No other person, account or e-mail may appear: the tours check the text of
// each screen they capture and the manual build checks the captions, the
// chapter sources and the generated HTML.

/** The tour account (the e-mail is a test one, never a real person's). */
export const PERSONA = {
  alias: "Liomar QA",
  first: "Liomar",
  last: "Rodríguez",
  email: "liomar.qa@pharos.test",
};

/** The teammate of the team chapters (NC-052 amendment). His alias is his
 *  full name, as the owner chose it. */
export const TEAMMATE = {
  alias: "Jorge L. Meneses Yero",
  first: "Jorge L.",
  last: "Meneses Yero",
  email: "jorge.meneses@pharos.test",
};

/** The server administrator (not a person: no other name). */
export const ADMIN = {
  alias: "Administrador",
  first: "Administrador",
  last: "del servidor",
  email: "admin@pharos.test",
};

/** The only accounts of the manual. */
export const PEOPLE = [PERSONA, TEAMMATE, ADMIN];

/**
 * Names and accounts that must never show: the old seed account («Smoke»,
 * smoke@pharos.dev), the earlier example people (Lucía Romero, Ana Pérez),
 * any address on pharos.dev, and any address on pharos.test that is not one
 * of the three accounts and names one of those people
 * («lucia.romero@pharos.test»). Synthetic accounts («qa.web@pharos.test»,
 * «nadie@pharos.test») are not people. Whole words only, so «Analista»,
 * «semana» or «smoke test» in English prose are not hits («smoke» alone is:
 * the seed alias). Case-sensitive for the people, so «ana» inside a word
 * never counts.
 */
const PATTERNS = [
  /(?<![\p{L}\p{N}])(?:Lucía|Lucia|Romero|Ana|Pérez|Perez)(?![\p{L}\p{N}])/gu,
  // Not before «@»: the address is the next pattern's hit.
  /(?<![\p{L}\p{N}])smoke(?![\p{L}\p{N}@])/giu,
  /[\w.+-]+@pharos\.dev\b/giu,
];

const ALLOWED_ADDRESSES = new Set(PEOPLE.map((p) => p.email.toLowerCase()));
/** An address on the test domain, and the earlier example people in its
 *  local part (lower case, without accents). */
const TEST_ADDRESS = /(?<![\w.+-])([\w.+-]+)@pharos\.test\b/giu;
const PERSON_IN_ADDRESS = /(?:^|[._+-])(?:lucia|romero|ana|perez)(?:$|[._+-])/;

/** The forbidden names in `text`, in order of appearance (empty: clean). */
export function foreignNames(text) {
  const hits = [];
  const s = String(text ?? "");
  for (const re of PATTERNS) {
    for (const m of s.matchAll(re)) hits.push({ at: m.index ?? 0, name: m[0] });
  }
  for (const m of s.matchAll(TEST_ADDRESS)) {
    const local = m[1].normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    if (!ALLOWED_ADDRESSES.has(m[0].toLowerCase()) && PERSON_IN_ADDRESS.test(local)) hits.push({ at: m.index ?? 0, name: m[0] });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.name);
}
