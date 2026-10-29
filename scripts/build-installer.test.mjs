import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bundlesFor } from "./build-installer.mjs";

test("pre-releases build NSIS only (WiX rejects alpha/beta/rc)", () => {
  for (const v of ["0.1.0-alpha.1", "0.2.0-beta.3", "1.0.0-rc.1"]) {
    assert.deepEqual(bundlesFor(v), ["nsis"]);
  }
});

test("stable versions build NSIS and MSI", () => {
  assert.deepEqual(bundlesFor("0.1.0"), ["nsis", "msi"]);
  assert.deepEqual(bundlesFor("1.4.2"), ["nsis", "msi"]);
});

test("invalid or MSI-incompatible versions fail early", () => {
  assert.throws(() => bundlesFor("0.1"), /not a SemVer/);
  assert.throws(() => bundlesFor("256.0.0"), /MSI version limits/);
});

test("tauri.conf.json never lists msi by default", () => {
  const conf = JSON.parse(
    readFileSync(
      new URL("../src-tauri/tauri.conf.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(conf.bundle.targets, ["nsis"]);
});
