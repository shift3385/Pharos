// Gherkin step text (NC-039, UX-23). The keywords stay in English (Given,
// When, Then, And, But: the user's decision, 2026-11-09) and the text after a
// keyword continues the sentence, so it starts in lower case: «Given el
// usuario abre…», not «Given El usuario…». Only a word that is clearly not a
// name is lowered: an article, a pronoun, a common verb form or an infinitive
// (abrir, pulsar, escribir). Acronyms, keys and names (API, PH-001, Pharos)
// are left as they are.

export const GHERKIN_KEYWORDS = [
  "Given",
  "When",
  "Then",
  "And",
  "But",
] as const;
export type GherkinKeyword = (typeof GHERKIN_KEYWORDS)[number];

const STARTERS = new Set(
  [
    // Spanish
    "el",
    "la",
    "los",
    "las",
    "un",
    "una",
    "unos",
    "unas",
    "al",
    "del",
    "lo",
    "le",
    "les",
    "se",
    "su",
    "sus",
    "este",
    "esta",
    "estos",
    "estas",
    "ese",
    "esa",
    "esos",
    "esas",
    "hay",
    "existe",
    "existen",
    "aparece",
    "aparecen",
    "muestra",
    "muestran",
    "está",
    "están",
    "es",
    "son",
    "no",
    "ningún",
    "ninguna",
    "todos",
    "todas",
    "cada",
    "otro",
    "otra",
    "dicho",
    "dicha",
    "ambos",
    "ambas",
    "tras",
    "después",
    "antes",
    "cuando",
    "si",
    "usuario",
    "usuaria",
    "sistema",
    "campo",
    "botón",
    "pantalla",
    "mensaje",
    "aplicación",
    "página",
    // English
    "the",
    "a",
    "an",
    "it",
    "its",
    "there",
    "this",
    "that",
    "these",
    "those",
    "user",
    "system",
    "no",
    "each",
  ].map((w) => w.toLowerCase()),
);

/** Whether `word` (its letters) is safe to write in lower case. */
function lowerable(word: string): boolean {
  if (!/^[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+$/.test(word)) return false;
  const w = word.toLowerCase();
  return STARTERS.has(w) || /(ar|er|ir)(se|lo|la|le)?$/.test(w);
}

/** Words after which the first word is a verb, not a name: «Pulsa el
 *  botón», «Introduce la contraseña», «Pulsa «Ingresar»». A name is followed
 *  by its verb instead: «Pharos muestra…», «María abre…». */
const AFTER_VERB = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "al",
  "del",
  "en",
  "a",
  "de",
  "con",
  "su",
  "sus",
  "que",
  "se",
  "lo",
  "le",
  "otra",
  "otro",
  "the",
  "on",
  "to",
  "in",
  "an",
]);

/** The text of a step, starting in lower case when its first word allows it. */
export function stepText(text: string): string {
  const t = text.trim();
  const m = t.match(/^([A-ZÁÉÍÓÚÑÜ][\p{L}]*)(.*)$/su);
  if (!m) return t;
  const next = m[2].trim();
  const verbFirst =
    /^[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+$/.test(m[1]) &&
    (/^[«"'“]/.test(next) ||
      AFTER_VERB.has((next.split(/\s+/)[0] ?? "").toLowerCase()));
  if (!verbFirst && !lowerable(m[1])) return t;
  return m[1].charAt(0).toLowerCase() + m[1].slice(1) + m[2];
}

export interface StepLine {
  keyword: GherkinKeyword;
  text: string;
}

const KW = new Map(GHERKIN_KEYWORDS.map((k) => [k.toLowerCase(), k]));

/** An acceptance criterion written as one sentence («Given a, when b, then
 *  c») as one line per keyword, or null when it is not in that form. «When»
 *  and «Then» split after a comma, a semicolon or a space; «And» and «But»
 *  only after a comma or a semicolon, so «usuario and contraseña» stays whole. */
export function criterionLines(criterion: string): StepLine[] | null {
  const text = criterion.trim();
  const head = text.match(/^(given|when|then)\s+/i);
  if (!head) return null;
  const parts: StepLine[] = [];
  const splitter = /(?:[,;]\s*(given|when|then|and|but)|\s(when|then))\s+/gi;
  let keyword = KW.get(head[1].toLowerCase())!;
  let start = head[0].length;
  for (const m of text.matchAll(splitter)) {
    parts.push({ keyword, text: stepText(text.slice(start, m.index).trim()) });
    keyword = KW.get((m[1] ?? m[2]).toLowerCase())!;
    start = m.index! + m[0].length;
  }
  parts.push({
    keyword,
    text: stepText(
      text
        .slice(start)
        .trim()
        .replace(/[.;]$/, (p) => (p === "." ? p : "")),
    ),
  });
  return parts.filter((p) => p.text);
}

/** A criterion as plain text, one keyword per line (the requirement's
 *  description); unchanged when it is not Gherkin. */
export function criterionText(criterion: string, indent = "  "): string {
  const lines = criterionLines(criterion);
  if (!lines) return criterion.trim();
  return lines
    .map((l, i) => `${i ? indent : ""}${l.keyword} ${l.text}`)
    .join("\n");
}
