// A key («RUN-001», «PH-005», «DEF-002») is one word: a line never breaks
// at its hyphen (FIX-43: «RUN-» / «001» in the status report). The text is
// cut into pieces, the keys marked, so the screen wraps them in a no-wrap
// span and the PDF in a `noWrap` inline.

// A key of one or more prefixes («PH-005», «TP-PH-0600») or a version with
// its pre-release («0.6.0-beta.1»), without a sentence's closing full stop
// (FIX-46).
const KEY = /[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z][A-Za-z0-9]*)*-\d+|\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?/g;

export interface TextPiece {
  text: string;
  key: boolean;
}

/** The text in pieces, with the keys marked; one unmarked piece without keys. */
export function keyPieces(text: string): TextPiece[] {
  const out: TextPiece[] = [];
  let at = 0;
  for (const m of text.matchAll(KEY)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ text: text.slice(at, i), key: false });
    out.push({ text: m[0], key: true });
    at = i + m[0].length;
  }
  if (at < text.length || out.length === 0) out.push({ text: text.slice(at), key: false });
  return out;
}

/** A pdfmake text: the string itself without keys, else inlines whose keys
 *  never wrap. */
export function pdfWholeKeys(text: string): string | { text: string; noWrap?: boolean }[] {
  const pieces = keyPieces(text);
  if (!pieces.some((p) => p.key)) return text;
  return pieces.map((p) => (p.key ? { text: p.text, noWrap: true } : { text: p.text }));
}
