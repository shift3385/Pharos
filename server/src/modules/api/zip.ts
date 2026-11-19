// A small, bounded reader of `.zip` uploads (an `allure-results` folder,
// ING-07), on Node's zlib, so the server needs no zip dependency. It reads
// the central directory, takes stored and deflated entries and refuses
// encryption and ZIP64. A zip bomb stops at the ceilings: at most
// `MAX_ZIP_ENTRIES` entries and `maxBytes` once inflated in all, each entry
// inflated with `maxOutputLength` (never more than what is left).

import { inflateRawSync } from "node:zlib";

export const MAX_ZIP_ENTRIES = 10_000;

/** True when the bytes start like a zip (a local file header). */
export const isZip = (b: Buffer) => b.length >= 4 && b.readUInt32LE(0) === 0x04034b50;

export interface ZipEntry {
  name: string;
  data: Buffer;
}

export class ZipError extends Error {
  constructor(
    readonly reason: "invalid-zip" | "too-large",
    detail?: string,
  ) {
    super(detail ? `${reason}: ${detail}` : reason);
  }
}

/** The files of a zip (folders left out), in central-directory order. */
export function readZip(zip: Buffer, maxBytes: number): ZipEntry[] {
  // End of central directory: the last 22 bytes, or before a comment.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("invalid-zip", "no end of central directory");
  const count = zip.readUInt16LE(eocd + 10);
  const cdSize = zip.readUInt32LE(eocd + 12);
  const cdStart = zip.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdStart === 0xffffffff) throw new ZipError("invalid-zip", "zip64");
  if (count > MAX_ZIP_ENTRIES) throw new ZipError("too-large", `more than ${MAX_ZIP_ENTRIES} entries`);
  if (cdStart + cdSize > eocd) throw new ZipError("invalid-zip", "central directory");

  const out: ZipEntry[] = [];
  let left = maxBytes;
  let p = cdStart;
  for (let n = 0; n < count; n++) {
    if (p + 46 > eocd || zip.readUInt32LE(p) !== 0x02014b50) throw new ZipError("invalid-zip", "entry");
    const flags = zip.readUInt16LE(p + 8);
    const method = zip.readUInt16LE(p + 10);
    const compressed = zip.readUInt32LE(p + 20);
    const size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString(flags & 0x800 ? "utf8" : "latin1", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    if (flags & 0x1) throw new ZipError("invalid-zip", "encrypted");
    if (local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50) throw new ZipError("invalid-zip", "local header");
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    if (start + compressed > zip.length) throw new ZipError("invalid-zip", "truncated");
    const raw = zip.subarray(start, start + compressed);
    if (size > left) throw new ZipError("too-large", `${maxBytes} bytes`);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try {
        data = inflateRawSync(raw, { maxOutputLength: Math.max(1, left) });
      } catch (e) {
        if ((e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE" || e instanceof RangeError)
          throw new ZipError("too-large", `${maxBytes} bytes`);
        throw new ZipError("invalid-zip", "deflate");
      }
    } else throw new ZipError("invalid-zip", `method ${method}`);
    left -= data.length;
    out.push({ name, data });
  }
  return out;
}
