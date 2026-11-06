// Secret scan of the tour outputs (MAN-01): does the AI key appear in any
// generated file? Used by the tour runner (in process, before anything else
// after the tours) and by `node scripts/check-manual.mjs --secret-scan`.
//
// It looks for the key as plain text, URL-encoded, UTF-16LE, and base64 at
// the three byte alignments a key can take inside a longer base64 stream; and
// it opens the ZIP containers the tours write (diagnostics `.zip`, `.xlsx`)
// to scan their entries too. The PDF is compressed: it is covered through its
// sources (docs/manual/.build/*.html, the Markdown and the images), which the
// scan reads uncompressed.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";

const ZIP_EXT = /\.(zip|xlsx|docx)$/i;

/** The byte patterns that would reveal `secret`. */
export function needlesFor(secret) {
  const out = [Buffer.from(secret), Buffer.from(encodeURIComponent(secret)), Buffer.from(secret, "utf16le")];
  // base64 of the key preceded by 0, 1 or 2 other bytes: the stable middle of
  // each encoding (dropping the characters that depend on the neighbours).
  for (let shift = 0; shift < 3; shift++) {
    const b64 = Buffer.concat([Buffer.alloc(shift), Buffer.from(secret)]).toString("base64");
    const start = shift === 0 ? 0 : Math.ceil((shift * 4) / 3) + 1;
    const end = b64.length - 4;
    if (end - start >= 8) out.push(Buffer.from(b64.slice(start, end)));
  }
  return out;
}

function* filesUnder(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    // Edge's throwaway print profiles (docs/manual/.build): the manual never
    // ships them, the key never reaches them (Edge only prints local HTML, which
    // is scanned) and Edge may still hold their files open, so reading them could
    // fail a good run.
    if (name === "edge-profiles") continue;
    if (statSync(p).isDirectory()) yield* filesUnder(p);
    else yield p;
  }
}

// jszip is already a dependency of the app (exports); resolved from here.
let jszip;
function loadZip() {
  jszip ??= createRequire(import.meta.url)("jszip");
  return jszip;
}

const contains = (buf, needles) => needles.some((n) => buf.includes(n));

/** Files under `dirs` (relative to `repoDir`) that contain the secret, as
 *  "path" or "path!entry" for an entry inside a ZIP. */
export async function scanForSecret(secret, dirs, repoDir) {
  if (!secret || secret.length < 8) return [];
  const needles = needlesFor(secret);
  const hits = [];
  for (const dir of dirs) {
    for (const file of filesUnder(dir)) {
      const buf = readFileSync(file);
      const rel = relative(repoDir, file);
      if (contains(buf, needles)) hits.push(rel);
      if (ZIP_EXT.test(file)) {
        try {
          const zip = await loadZip().loadAsync(buf);
          for (const entry of Object.values(zip.files)) {
            if (entry.dir) continue;
            if (contains(Buffer.from(await entry.async("uint8array")), needles)) hits.push(`${rel}!${entry.name}`);
          }
        } catch {
          // Not a readable ZIP: its raw bytes were scanned above.
        }
      }
    }
  }
  return hits;
}
