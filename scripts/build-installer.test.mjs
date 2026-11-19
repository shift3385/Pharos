import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import {
  INSTALLER_CONFIG,
  STAGED_CLI,
  bundlesFor,
  cliBinary,
} from "./build-installer.mjs";

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

test("the installer ships the CLI as bin/pharos.exe with the PATH hooks (INT-01 L5)", () => {
  const conf = JSON.parse(
    readFileSync(new URL(`../${INSTALLER_CONFIG}`, import.meta.url), "utf8"),
  );
  assert.deepEqual(conf.bundle.resources, { [STAGED_CLI]: "bin/pharos.exe" });
  const hooks = conf.bundle.windows.nsis.installerHooks;
  const hooksUrl = new URL(`../src-tauri/${hooks}`, import.meta.url);
  assert.ok(existsSync(hooksUrl), hooks);
  const text = readFileSync(hooksUrl, "utf8");
  assert.match(text, /!macro NSIS_HOOK_POSTINSTALL[\s\S]*setup-path add/);
  assert.match(text, /!macro NSIS_HOOK_PREUNINSTALL[\s\S]*setup-path remove/);
  // UTF-8 with BOM: NSIS reads a file without one in the ANSI code page.
  assert.ok(text.startsWith("﻿"), "the hooks keep their BOM");
});

test("tauri.conf.json lists no resources (tauri-build copies them on every cargo build)", () => {
  const conf = JSON.parse(
    readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  );
  assert.equal(conf.bundle.resources, undefined);
});

test("the CLI binary is pharos-cli(.exe) in the release folder", () => {
  assert.match(cliBinary("T", "win32"), /T[\\/]release[\\/]pharos-cli\.exe$/);
  assert.match(cliBinary("T", "linux"), /T[\\/]release[\\/]pharos-cli$/);
});
