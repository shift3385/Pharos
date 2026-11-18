// The text of an API token (INT-02, ADR-0052 §3):
//
//     phr_prj_<32 base62>_<6 base62>    a project token (CI)
//     phr_pat_<32 base62>_<6 base62>    a personal access token
//
// The 32 characters are ~190 random bits. The last 6 are the CRC-32 of
// everything before them, so a token copied wrong is told apart without a
// database lookup, and secret scanners can recognise the shape. Only the
// SHA-256 of the whole text is stored.
import { createHash, randomInt } from "node:crypto";
import { crc32 } from "node:zlib";

export type TokenKind = "project" | "personal";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BODY_CHARS = 32;
const CHECK_CHARS = 6;
const PREFIX: Record<TokenKind, string> = { project: "phr_prj_", personal: "phr_pat_" };
const SHAPE = /^phr_(prj|pat)_([0-9A-Za-z]{32})_([0-9A-Za-z]{6})$/;
/** How many characters of the token the lists show (`phr_prj_Ab3k`). */
const DISPLAY_CHARS = PREFIX.project.length + 4;

function base62(n: number, width: number): string {
  let out = "";
  let v = n;
  for (let i = 0; i < width; i++) {
    out = ALPHABET[v % 62] + out;
    v = Math.floor(v / 62);
  }
  return out;
}

const checksum = (head: string) => base62(crc32(head), CHECK_CHARS);

export interface NewToken {
  /** The whole token: shown once, never stored. */
  raw: string;
  hash: string;
  displayPrefix: string;
}

export function newToken(kind: TokenKind): NewToken {
  let body = "";
  for (let i = 0; i < BODY_CHARS; i++) body += ALPHABET[randomInt(62)];
  const head = `${PREFIX[kind]}${body}`;
  const raw = `${head}_${checksum(head)}`;
  return { raw, hash: hashToken(raw), displayPrefix: raw.slice(0, DISPLAY_CHARS) };
}

/** The kind of a well-formed token whose checksum matches, or null. */
export function parseToken(raw: string): TokenKind | null {
  const m = SHAPE.exec(raw);
  if (!m) return null;
  const head = raw.slice(0, raw.length - CHECK_CHARS - 1);
  if (checksum(head) !== m[3]) return null;
  return m[1] === "prj" ? "project" : "personal";
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
