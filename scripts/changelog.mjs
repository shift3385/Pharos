// CHANGELOG fragments (docs/VERSIONING.md §7, ADR-0032): each change writes its
// user-facing entries to its own file in `changes/` instead of editing
// `CHANGELOG.md`, so parallel PRs stop conflicting on the same lines. A release
// collects the fragments into the `[Sin publicar]` section.
//
//   node scripts/changelog.mjs check     exit non-zero on an invalid fragment
//   node scripts/changelog.mjs preview   print [Sin publicar] with the fragments
//   node scripts/changelog.mjs collect   write them into CHANGELOG.md, delete them
//
// A fragment is Markdown with one front-matter field:
//
//   ---
//   section: Añadido
//   ---
//   - **Lo que nota quien usa la app.**
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Keep a Changelog sections, in the order they appear in a version. */
export const SECTIONS = ["Añadido", "Cambiado", "Corregido", "Seguridad", "Cambios incompatibles"];

const UNRELEASED = "## [Sin publicar]";

/** Parses one fragment; throws with the file name on any problem. */
export function parseFragment(name, text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`${name}: missing the "---" front matter`);
  const fields = Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "")
      .map((line) => {
        const at = line.indexOf(":");
        if (at < 0) throw new Error(`${name}: front-matter line without ":" (${line})`);
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }),
  );
  const section = fields.section;
  if (!SECTIONS.includes(section)) {
    throw new Error(`${name}: section must be one of ${SECTIONS.join(", ")} (got "${section ?? ""}")`);
  }
  const body = match[2].replace(/\r\n/g, "\n").trim();
  if (body === "") throw new Error(`${name}: the entry is empty`);
  return { name, section, body };
}

/** Inserts the fragments into the [Sin publicar] section of `changelog`. */
export function mergeFragments(changelog, fragments) {
  const eol = changelog.includes("\r\n") ? "\r\n" : "\n";
  const text = changelog.replace(/\r\n/g, "\n");
  const start = text.indexOf(`${UNRELEASED}\n`);
  if (start < 0) throw new Error(`CHANGELOG.md has no "${UNRELEASED}" section`);
  const bodyStart = start + UNRELEASED.length + 1;
  const next = text.indexOf("\n## ", bodyStart);
  const end = next < 0 ? text.length : next + 1;

  // Split the unreleased body into its preamble and its "### " subsections.
  const parts = text.slice(bodyStart, end).split(/^(?=### )/m);
  const preamble = parts[0].startsWith("### ") ? "" : parts.shift();
  const bySection = new Map();
  for (const part of parts) {
    const title = part.slice(4, part.indexOf("\n")).trim();
    bySection.set(title, part.replace(/\s+$/, ""));
  }
  for (const fragment of [...fragments].sort((a, b) => a.name.localeCompare(b.name))) {
    const current = bySection.get(fragment.section) ?? `### ${fragment.section}\n`;
    bySection.set(fragment.section, `${current}\n${fragment.body}`);
  }
  const ordered = [
    ...SECTIONS.filter((s) => bySection.has(s)),
    ...[...bySection.keys()].filter((s) => !SECTIONS.includes(s)),
  ].map((s) => {
    const block = bySection.get(s);
    // A new section needs a blank line between its heading and the first entry.
    return block.replace(/^(### .*\n)(?!\n)/, "$1\n");
  });
  const body = `${preamble.trim() === "" ? "\n" : `\n${preamble.trim()}\n\n`}${ordered.join("\n\n")}\n\n`;
  return (text.slice(0, bodyStart) + body + text.slice(end)).replace(/\n/g, eol);
}

/** Reads every fragment in `dir` (README.md excluded). */
export function readFragments(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => parseFragment(name, readFileSync(join(dir, name), "utf8")));
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const dir = join(root, "changes");
  const file = join(root, "CHANGELOG.md");
  const command = process.argv[2];
  try {
    const fragments = readFragments(dir);
    if (command === "check") {
      console.log(`changes/: ${fragments.length} fragment(s) OK`);
    } else if (command === "preview" || command === "collect") {
      const merged = mergeFragments(readFileSync(file, "utf8"), fragments);
      if (command === "preview") {
        const start = merged.indexOf(UNRELEASED);
        const next = merged.indexOf("\n## ", start + 1);
        console.log(merged.slice(start, next < 0 ? undefined : next).trimEnd());
      } else {
        writeFileSync(file, merged);
        for (const f of fragments) rmSync(join(dir, f.name));
        console.log(`CHANGELOG.md: ${fragments.length} fragment(s) collected`);
      }
    } else {
      console.error("usage: node scripts/changelog.mjs check|preview|collect");
      process.exit(2);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
