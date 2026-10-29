// The commitlint configuration (BASE-16) as the hook and the `commits` CI job
// load it: work commits follow Conventional Commits, merge commits are exempt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import load from "@commitlint/load";
import lint from "@commitlint/lint";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function check(message) {
  const config = await load({}, { cwd: root });
  const result = await lint(message, config.rules, {
    defaultIgnores: config.defaultIgnores,
    ignores: config.ignores,
    parserOpts: config.parserPreset?.parserOpts,
  });
  return result.valid;
}

test("work commits must follow Conventional Commits", async () => {
  assert.equal(await check("feat(sync): batched push with retry"), true);
  assert.equal(await check("fix: SYNC-04 requirements reach the web"), true);
  assert.equal(await check("updated some stuff"), false);
  assert.equal(await check(`feat: ${"x".repeat(120)}`), false);
});

test("integration merges are exempt, including long track merges", async () => {
  for (const message of [
    "Merge track C: gate C execution-model ADRs (ADR-0011..0019)",
    "Merge track A2 phase 1: pre-migration backup, owner checks, audit actor, stable keys (SEC-06, BASE-04, FIX-06, FIX-08, DAT-01 decision)",
    "Merge branch 'main' into claude/b1-ci-security-bad5dd",
    "Merge pull request #1 from shift3385/claude/b1-ci-security-bad5dd",
  ]) {
    assert.equal(await check(message), true, message);
  }
});
