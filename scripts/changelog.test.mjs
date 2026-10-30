import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeFragments, parseFragment } from "./changelog.mjs";

const CHANGELOG = `# Changelog

Intro.

## [Sin publicar]

### Añadido

- Existing addition.

### Corregido

- Existing fix.

## [0.1.0] - 2026-10-29

### Añadido

- Old entry.
`;

const frag = (name, section, body) => parseFragment(name, `---\nsection: ${section}\n---\n${body}\n`);

test("a fragment needs front matter, a known section and a body", () => {
  assert.throws(() => parseFragment("a.md", "- no front matter\n"), /a\.md: missing/);
  assert.throws(() => parseFragment("b.md", "---\nsection: Otro\n---\n- x\n"), /b\.md: section must be/);
  assert.throws(() => parseFragment("c.md", "---\nsection: Añadido\n---\n\n"), /c\.md: the entry is empty/);
  assert.deepEqual(parseFragment("d.md", "---\r\nsection: Corregido\r\n---\r\n- y\r\n"), {
    name: "d.md",
    section: "Corregido",
    body: "- y",
  });
});

test("fragments are appended to their section, in file-name order", () => {
  const out = mergeFragments(CHANGELOG, [frag("b.md", "Añadido", "- B."), frag("a.md", "Añadido", "- A.")]);
  assert.match(out, /### Añadido\n\n- Existing addition\.\n- A\.\n- B\.\n\n### Corregido/);
});

test("a missing section is created in Keep a Changelog order", () => {
  const out = mergeFragments(CHANGELOG, [frag("s.md", "Seguridad", "- S."), frag("c.md", "Cambiado", "- C.")]);
  const unreleased = out.slice(out.indexOf("## [Sin publicar]"), out.indexOf("## [0.1.0]"));
  assert.deepEqual(
    [...unreleased.matchAll(/^### (.+)$/gm)].map((m) => m[1]),
    ["Añadido", "Cambiado", "Corregido", "Seguridad"],
  );
  assert.match(unreleased, /### Cambiado\n\n- C\.\n/);
});

test("released versions and the rest of the file are untouched", () => {
  const out = mergeFragments(CHANGELOG, [frag("a.md", "Añadido", "- A.")]);
  assert.ok(out.startsWith("# Changelog\n\nIntro.\n\n## [Sin publicar]\n\n### Añadido"));
  assert.ok(out.endsWith("## [0.1.0] - 2026-10-29\n\n### Añadido\n\n- Old entry.\n"));
});

test("no fragments leaves the changelog as it was", () => {
  assert.equal(mergeFragments(CHANGELOG, []), CHANGELOG);
});

test("CRLF changelogs keep CRLF", () => {
  const crlf = CHANGELOG.replace(/\n/g, "\r\n");
  const out = mergeFragments(crlf, [frag("a.md", "Corregido", "- A.")]);
  assert.ok(!/[^\r]\n/.test(out));
  assert.match(out, /- Existing fix\.\r\n- A\.\r\n/);
});

test("an empty [Sin publicar] gets its first section", () => {
  const empty = "# Changelog\n\n## [Sin publicar]\n\n## [0.1.0] - 2026-10-29\n\n- Old.\n";
  const out = mergeFragments(empty, [frag("a.md", "Añadido", "- A.")]);
  assert.equal(out, "# Changelog\n\n## [Sin publicar]\n\n### Añadido\n\n- A.\n\n## [0.1.0] - 2026-10-29\n\n- Old.\n");
});
