// Migration numbering gate (BASE-12, docs/VERSIONING.md §6). Reads the local
// (src-tauri/migrations) and server (server/migrations) directories and fails if:
//   - a .sql file is not named NNNN_snake_case.sql;
//   - two migrations share a number;
//   - a number below the highest one is missing and is neither reserved by a
//     track nor retired in scripts/migration-registry.json;
//   - a retired number has a file;
//   - (local) the files and the MIGRATIONS list in src-tauri/src/db.rs differ,
//     are listed out of order, or an entry's name differs from the file it
//     includes: an unregistered file would never run.
// It warns (without failing) about reserved numbers that already have a file,
// so that the reservation is removed from the registry.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NAME = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** Entries of db.rs MIGRATIONS, in declaration order: the name recorded in
 *  schema_migrations and the file it includes. */
export function parseRegistered(source) {
  return [
    ...source.matchAll(
      /\(\s*"([^"]+)"\s*,\s*include_str!\(\s*"\.\.\/migrations\/([^"]+)"\s*\)\s*,?\s*\)/g,
    ),
  ].map((m) => ({ name: m[1], file: m[2] }));
}

/** Reserved numbers that already have a file: the reservation is obsolete. */
export function staleReservations({ files, reserved = {} }) {
  return files
    .map((f) => NAME.exec(f)?.[1])
    .filter((num) => num && num in reserved);
}

/** Returns the list of problems found in one migrations directory. */
export function checkMigrations({
  label,
  files,
  registered = null,
  reserved = {},
  retired = {},
}) {
  const errors = [];
  const byNumber = new Map();
  for (const file of files.filter((f) => /\.sql$/i.test(f)).sort()) {
    const m = NAME.exec(file);
    if (!m) {
      errors.push(`${label}: "${file}" must be named NNNN_snake_case.sql`);
      continue;
    }
    const list = byNumber.get(m[1]) ?? [];
    list.push(file);
    byNumber.set(m[1], list);
  }
  for (const [num, list] of byNumber) {
    if (list.length > 1)
      errors.push(`${label}: number ${num} is used by ${list.join(", ")}`);
    if (num in retired)
      errors.push(
        `${label}: number ${num} is retired but has ${list.join(", ")}`,
      );
  }
  const max = Math.max(0, ...[...byNumber.keys()].map(Number));
  for (let n = 1; n <= max; n += 1) {
    const num = String(n).padStart(4, "0");
    if (!byNumber.has(num) && !(num in reserved) && !(num in retired)) {
      errors.push(
        `${label}: number ${num} is missing (gap); reserve or retire it in scripts/migration-registry.json`,
      );
    }
  }
  if (registered) {
    for (const { name, file } of registered) {
      if (name !== file)
        errors.push(
          `${label}: db.rs registers "${name}" with include_str!("${file}"); the name must match the file`,
        );
    }
    const included = registered.map((r) => r.file);
    const valid = [...byNumber.values()].flat().sort();
    for (const f of valid) {
      if (!included.includes(f))
        errors.push(
          `${label}: ${f} is not registered in db.rs MIGRATIONS (it would never run)`,
        );
    }
    for (const f of included) {
      if (!valid.includes(f))
        errors.push(
          `${label}: db.rs registers ${f}, which is not in the migrations directory`,
        );
    }
    const ordered = [...included].sort();
    if (included.join() !== ordered.join())
      errors.push(`${label}: db.rs MIGRATIONS is not in ascending order`);
  }
  return errors;
}

function main() {
  const registry = JSON.parse(
    readFileSync(join(root, "scripts", "migration-registry.json"), "utf8"),
  );
  const errors = [];
  for (const [label, cfg] of Object.entries(registry).filter(
    ([k]) => !k.startsWith("$"),
  )) {
    const files = readdirSync(join(root, cfg.dir));
    const registered = cfg.registeredIn
      ? parseRegistered(readFileSync(join(root, cfg.registeredIn), "utf8"))
      : null;
    errors.push(
      ...checkMigrations({
        label,
        files,
        registered,
        reserved: cfg.reserved,
        retired: cfg.retired,
      }),
    );
    console.log(
      `${label}: ${files.filter((f) => f.endsWith(".sql")).length} migration(s) in ${cfg.dir}`,
    );
    for (const num of staleReservations({ files, reserved: cfg.reserved })) {
      console.warn(
        `  ! ${label}: number ${num} is reserved but already has a file; remove the reservation`,
      );
    }
  }
  if (errors.length) {
    console.error("\nMigration check FAILED:");
    errors.forEach((e) => console.error(`  - ${e}`));
    return 1;
  }
  console.log("Migration check passed: unique numbers, no unexplained gaps.");
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exit(main());
}
