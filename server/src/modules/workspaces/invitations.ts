import { createHash, randomBytes } from "node:crypto";

// Invitation codes (SYNC-07, ADR-0042 §4): 128 random bits in Crockford
// base32, grouped for reading aloud, prefixed with PHX. Only the SHA-256 of
// the normalized code is stored, like the refresh tokens.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A new code: `PHX-` and 26 base32 characters in groups of 4 and 6. */
export function newInvitationCode(): string {
  const bytes = randomBytes(16);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
      value &= (1 << bits) - 1;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return `PHX-${out.match(/.{1,4}/g)!.join("-")}`;
}

/** The code as stored: uppercase, without the prefix, dashes or spaces, and
 *  with the letters people mistype read as Crockford does (O→0, I/L→1). */
export function normalizeCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/^\s*PHX/, "")
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export const hashCode = (code: string): string => createHash("sha256").update(normalizeCode(code)).digest("hex");
