import { test } from "node:test";
import assert from "node:assert/strict";
import {
  judgeClippy,
  judgeFmt,
  parseClippy,
  toRepoPath,
} from "./rust-gates.mjs";

const diag = (file, line, code, level = "warning") =>
  JSON.stringify({
    reason: "compiler-message",
    message: {
      level,
      code: code ? { code } : null,
      rendered: `${level}: ${code} at ${file}:${line}`,
      spans: [{ is_primary: true, file_name: file, line_start: line }],
    },
  });

test("toRepoPath normalises crate-relative and verbatim Windows paths", () => {
  assert.equal(toRepoPath("src\\sync.rs"), "src-tauri/src/sync.rs");
  const abs = toRepoPath("src/lib.rs");
  assert.equal(abs, "src-tauri/src/lib.rs");
});

test("fmt: only allowlisted files are tolerated; unknown files fail", () => {
  const allow = [
    { file: "src-tauri/src/sync.rs" },
    { file: "src-tauri/src/db.rs" },
  ];
  const res = judgeFmt(["src-tauri/src/sync.rs", "src-tauri/src/ai.rs"], allow);
  assert.deepEqual(res.failing, ["src-tauri/src/ai.rs"]);
  assert.deepEqual(res.tolerated, ["src-tauri/src/sync.rs"]);
  assert.deepEqual(res.stale, ["src-tauri/src/db.rs"]);
});

test("clippy: parses JSON lines, skips summaries and de-duplicates targets", () => {
  const out = [
    "Compiling pharos",
    diag("src\\sync.rs", 90, "clippy::type_complexity"),
    diag("src\\sync.rs", 90, "clippy::type_complexity"), // lib test target
    JSON.stringify({
      reason: "compiler-message",
      message: { level: "warning", spans: [] },
    }),
    JSON.stringify({ reason: "compiler-artifact" }),
  ].join("\n");
  const d = parseClippy(out);
  assert.equal(d.length, 1);
  assert.equal(d[0].file, "src-tauri/src/sync.rs");
  assert.equal(d[0].lint, "clippy::type_complexity");
});

test("clippy: an allowlisted lint in another file, or another lint, still fails", () => {
  const allow = [
    { file: "src-tauri/src/sync.rs", lint: "clippy::type_complexity" },
  ];
  const d = parseClippy(
    [
      diag("src\\sync.rs", 90, "clippy::type_complexity"),
      diag("src\\ai.rs", 3, "clippy::type_complexity"),
      diag("src\\sync.rs", 12, "unused_variables"),
      diag("src\\hlc.rs", 1, "E0308", "error"),
    ].join("\n"),
  );
  const res = judgeClippy(d, allow);
  assert.equal(res.tolerated.length, 1);
  assert.deepEqual(
    res.failing.map((f) => `${f.file}:${f.lint}`),
    [
      "src-tauri/src/ai.rs:clippy::type_complexity",
      "src-tauri/src/sync.rs:unused_variables",
      "src-tauri/src/hlc.rs:E0308",
    ],
  );
  assert.equal(res.stale.length, 0);
});

test("clippy: an entry that no longer matches is reported as stale", () => {
  const res = judgeClippy(
    [],
    [{ file: "src-tauri/src/sync.rs", lint: "clippy::type_complexity" }],
  );
  assert.equal(res.failing.length, 0);
  assert.equal(res.stale.length, 1);
});
