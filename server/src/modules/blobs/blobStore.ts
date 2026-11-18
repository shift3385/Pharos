import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Readable } from "node:stream";

// Where attachment and template contents live (SYNC-04b, ADR-0042 §7). The
// interface lets S3/MinIO replace the disk later (decision 7 of 2026-11-17);
// today the bytes are files under BLOB_DIR, one per sha256, written once.

export interface BlobStore {
  /** Stores `bytes` under their sha256 if absent; returns the storage key. */
  put(sha256: string, bytes: Buffer): Promise<string>;
  /** A stream of the content, or null when the store does not have it. */
  open(storageKey: string): Promise<{ stream: Readable; size: number } | null>;
}

export const sha256Hex = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

export const isSha256 = (v: string): boolean => /^[0-9a-f]{64}$/.test(v);

/** Files under `dir`: `<2 hex>/<sha256>`. Written to a temporary name and
 *  renamed, so a reader never sees half a file; the same content again is a
 *  no-op. */
export function diskBlobStore(dir: string): BlobStore {
  const root = resolve(dir);
  const keyOf = (sha: string) => `${sha.slice(0, 2)}/${sha}`;
  return {
    async put(sha256, bytes) {
      if (!isSha256(sha256)) throw new Error("blob: bad sha256");
      const key = keyOf(sha256);
      const path = join(root, key);
      try {
        await stat(path);
        return key;
      } catch {
        // Absent: write it.
      }
      await mkdir(join(root, sha256.slice(0, 2)), { recursive: true });
      const tmp = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(tmp, bytes, { flag: "wx" });
        await rename(tmp, path);
      } finally {
        await rm(tmp, { force: true });
      }
      return key;
    },
    async open(storageKey) {
      const path = join(root, storageKey);
      if (!path.startsWith(root)) return null;
      try {
        const { size } = await stat(path);
        return { stream: createReadStream(path), size };
      } catch {
        return null;
      }
    },
  };
}
