import { hash, verify } from "@node-rs/argon2";

// @node-rs/argon2 defaults to the Argon2id variant (spec §4).
const ARGON2_OPTIONS = {
  memoryCost: 19_456, // 19 MiB (OWASP-recommended minimum)
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export function verifyPassword(
  hashed: string,
  plain: string,
): Promise<boolean> {
  return verify(hashed, plain);
}
