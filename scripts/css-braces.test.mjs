// Every stylesheet closes what it opens. The build concatenates all of them
// into one file, so a single missing `}` nests every later rule inside an
// unrelated selector and the app shell loses its styles in the desktop and
// web builds (found by the manual tours, MAN-03), while `npm run dev`, which
// injects each file apart, hides it.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/** Depth left open at the end (0 = balanced), or -1 on a stray `}`. */
export function openBraces(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
  let depth = 0;
  for (const c of text) {
    if (c === "{") depth++;
    else if (c === "}" && --depth < 0) return -1;
  }
  return depth;
}

test("openBraces finds a rule left open and a stray brace", () => {
  assert.equal(openBraces(".a { b: c; }"), 0);
  assert.equal(openBraces(".a { b: c;\n/* } */\n.d { e: f; }"), 1);
  assert.equal(openBraces('.a::after { content: "}"; }'), 0);
  assert.equal(openBraces(".a { } }"), -1);
});

test("every stylesheet in src/ is balanced", () => {
  const files = execFileSync("git", ["ls-files", "src/*.css", "src/**/*.css"], { cwd: repoDir, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  assert.ok(files.length > 10, "found the stylesheets");
  const broken = files.filter((f) => openBraces(readFileSync(join(repoDir, f), "utf8")) !== 0);
  assert.deepEqual(broken, [], "unbalanced braces: a rule is left open (or closed twice)");
});
