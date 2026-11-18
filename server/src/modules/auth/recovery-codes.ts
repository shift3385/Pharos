import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

// Account recovery codes (SEC-08, ADR-0045). Ten single-use codes, shown once
// and stored only as Argon2id hashes. Each is 10 symbols of Crockford base32
// (50 random bits), written `XXXXX-XXXXX`, with no I, L, O or U to misread.

export const RECOVERY_CODE_COUNT = 10;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 10;

// A code carries 50 random bits, far more than any password, so a lighter
// Argon2id than the password's keeps sign-up and a recovery attempt fast
// (up to ten verifications) while a stolen hash still cannot be searched.
const CODE_ARGON2 = { memoryCost: 4_096, timeCost: 1, parallelism: 1 } as const;

/** A new set of codes, formatted for the user (`XXXXX-XXXXX`). */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    // 256 is a multiple of 32: `byte & 31` picks every symbol equally often.
    const symbols = [...randomBytes(LENGTH)]
      .map((b) => ALPHABET[b & 31])
      .join("");
    return `${symbols.slice(0, 5)}-${symbols.slice(5)}`;
  });
}

/** The canonical form of what the user typed (case, spaces and dashes do not
 *  matter; O reads as 0 and I or L as 1), or null when it cannot be a code. */
export function normalizeRecoveryCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (code.length !== LENGTH) return null;
  return [...code].every((ch) => ALPHABET.includes(ch)) ? code : null;
}

/** The hash stored for a code (formatted or not). */
export function hashRecoveryCode(code: string): Promise<string> {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) throw new Error("not a recovery code");
  return hash(normalized, CODE_ARGON2);
}

/** Whether a normalized code matches a stored hash. */
export function verifyRecoveryCode(
  stored: string,
  normalized: string,
): Promise<boolean> {
  return verify(stored, normalized);
}
