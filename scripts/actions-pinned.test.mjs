// Supply chain (ADR-0021, ADR-0054 §5): every `uses:` in this repository's
// workflows, its own actions and the GitHub Actions templates it hands to
// users is pinned to a full commit SHA (40 hex characters), a local path, or
// a Docker image by digest. A tag or a branch can be moved under us.
//
// The templates in docs/integraciones/ name Pharos' own action with the
// placeholder `@<SHA-de-40-caracteres>`, which «Conectar CI» fills in; any
// other placeholder or a tag fails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const PLACEHOLDER = "<SHA-de-40-caracteres>";

function yamlFiles(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out = out.concat(yamlFiles(path));
    else if (/\.ya?ml$/.test(name)) out.push(path);
  }
  return out;
}

/** The `uses:` references of a YAML text that are not pinned. */
export function unpinned(text, { allowPlaceholder = false } = {}) {
  const bad = [];
  for (const [n, line] of text.split(/\r?\n/).entries()) {
    const m = /^\s*(?:-\s+)?uses:\s*["']?([^"'\s#]+)/.exec(line);
    if (!m) continue;
    const ref = m[1];
    if (ref.startsWith("./")) continue;
    if (ref.startsWith("docker://")) {
      if (!/@sha256:[0-9a-f]{64}$/.test(ref)) bad.push(`${n + 1}: ${ref}`);
      continue;
    }
    const at = ref.lastIndexOf("@");
    const version = at < 0 ? "" : ref.slice(at + 1);
    if (/^[0-9a-f]{40}$/.test(version)) continue;
    if (allowPlaceholder && version === PLACEHOLDER) continue;
    bad.push(`${n + 1}: ${ref}`);
  }
  return bad;
}

test("the rule tells pins from tags", () => {
  assert.deepEqual(unpinned("    - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1"), []);
  assert.deepEqual(unpinned("      uses: ./.github/actions/pharos-report"), []);
  assert.equal(unpinned("    - uses: actions/checkout@v4").length, 1);
  assert.equal(unpinned("    - uses: actions/checkout@main").length, 1);
  assert.equal(unpinned("    - uses: actions/checkout").length, 1);
  assert.equal(unpinned("    - uses: docker://alpine:3").length, 1);
  assert.equal(unpinned(`    - uses: a/b/c@${PLACEHOLDER}`).length, 1);
  assert.deepEqual(unpinned(`    - uses: a/b/c@${PLACEHOLDER}`, { allowPlaceholder: true }), []);
});

test("every workflow and action of the repository is pinned by SHA", () => {
  const files = yamlFiles(join(root, ".github"));
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.deepEqual(unpinned(readFileSync(file, "utf8")), [], relative(root, file));
  }
});

test("the GitHub Actions templates for users are pinned by SHA (INT-04)", () => {
  const files = yamlFiles(join(root, "docs", "integraciones"));
  assert.ok(files.length >= 2, "templates are there");
  for (const file of files) {
    assert.deepEqual(unpinned(readFileSync(file, "utf8"), { allowPlaceholder: true }), [], relative(root, file));
  }
});
