// The Cargo workspace (src-tauri/Cargo.toml) keeps `tauri dev` working: it
// runs a plain `cargo run --no-default-features`, and with two binaries among
// the default members (the desktop `pharos` and `pharos-cli`, INT-01) Cargo
// refuses to guess. `default-run` names the app; Tauri reads it too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = readFileSync(
  new URL("../src-tauri/Cargo.toml", import.meta.url),
  "utf8",
);

/** The lines of one TOML table (`[package]`), up to the next table. */
function table(name) {
  const start = manifest.indexOf(`[${name}]`);
  assert.ok(start >= 0, `[${name}] in src-tauri/Cargo.toml`);
  const rest = manifest.slice(start + name.length + 2);
  const end = rest.search(/^\[/m);
  return end < 0 ? rest : rest.slice(0, end);
}

test("the desktop app is the default binary of the workspace", () => {
  const pkg = table("package");
  assert.match(pkg, /^name = "pharos"$/m);
  assert.match(pkg, /^default-run = "pharos"$/m);
});

test("the CLI stays a default member, so cargo test and clippy cover it", () => {
  assert.match(table("workspace"), /default-members = \[[^\]]*"cli"/);
});
