// Encryption of the AI keys kept for the web (IA-12, ADR-0034).
//
// - AES-256-GCM with a random 96-bit nonce per write and the 128-bit tag kept
//   at the end of the ciphertext.
// - The key-encryption key (KEK) is `AI_VAULT_KEY`, outside the database: a
//   copy of the database alone reads nothing.
// - The associated data binds each ciphertext to its user and provider, so a
//   row copied onto another account (or relabelled as another provider) fails
//   to decrypt instead of handing that account someone else's key.
// - `kekId` names the KEK without revealing it, so rows encrypted under an
//   older KEK are reported as «upload it again» and never decrypted.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface Sealed {
  nonce: Buffer;
  /** Ciphertext followed by the GCM tag. */
  ciphertext: Buffer;
  kekId: string;
}

export interface Vault {
  readonly kekId: string;
  seal(plaintext: string, userId: string, provider: string): Sealed;
  /** Null when the row was sealed under another KEK or does not authenticate. */
  open(sealed: Sealed, userId: string, provider: string): string | null;
}

function aad(userId: string, provider: string): Buffer {
  return Buffer.from(`pharos-ai-vault:v1:${userId}:${provider}`, "utf8");
}

/** The vault for a base64 KEK of 32 bytes (validated by env.ts). */
export function createVault(kekBase64: string): Vault {
  const kek = Buffer.from(kekBase64, "base64");
  if (kek.length !== 32) throw new Error("AI_VAULT_KEY must be 32 bytes");
  const kekId = createHash("sha256").update("pharos-ai-vault-kek-id").update(kek).digest("hex").slice(0, 16);
  return {
    kekId,
    seal(plaintext, userId, provider) {
      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv(ALGORITHM, kek, nonce, { authTagLength: TAG_BYTES });
      cipher.setAAD(aad(userId, provider));
      const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return { nonce, ciphertext: Buffer.concat([body, cipher.getAuthTag()]), kekId };
    },
    open(sealed, userId, provider) {
      if (sealed.kekId !== kekId || sealed.nonce.length !== NONCE_BYTES) return null;
      if (sealed.ciphertext.length <= TAG_BYTES) return null;
      try {
        const decipher = createDecipheriv(ALGORITHM, kek, sealed.nonce, { authTagLength: TAG_BYTES });
        decipher.setAAD(aad(userId, provider));
        decipher.setAuthTag(sealed.ciphertext.subarray(sealed.ciphertext.length - TAG_BYTES));
        const body = sealed.ciphertext.subarray(0, sealed.ciphertext.length - TAG_BYTES);
        return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
      } catch {
        return null;
      }
    },
  };
}
