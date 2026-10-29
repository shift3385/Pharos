import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isExcepted, optionalDepsReader } from "./license-policy.mjs";

const exceptions = {
  lightningcss: {
    license: "MPL-2.0",
    coversPlatformBinaries: true,
  },
  "some-lib": { license: "LGPL-3.0" },
};
const optionalDepsOf = (pkg) =>
  pkg === "lightningcss"
    ? ["lightningcss-linux-x64-gnu", "lightningcss-linux-x64-musl"]
    : [];

test("a package named in the exceptions is accepted with its license only", () => {
  assert.equal(
    isExcepted("lightningcss", "MPL-2.0", exceptions, optionalDepsOf),
    true,
  );
  assert.equal(
    isExcepted("lightningcss", "LGPL-3.0", exceptions, optionalDepsOf),
    false,
  );
  assert.equal(
    isExcepted("some-lib", "LGPL-3.0", exceptions, optionalDepsOf),
    true,
  );
});

test("platform binaries of a covering parent are accepted on every OS (CI is Linux)", () => {
  for (const binary of [
    "lightningcss-linux-x64-gnu",
    "lightningcss-linux-x64-musl",
  ]) {
    assert.equal(
      isExcepted(binary, "MPL-2.0", exceptions, optionalDepsOf),
      true,
    );
  }
});

test("only real optional dependencies of the parent, with the same license, are covered", () => {
  assert.equal(
    isExcepted("lightningcss-evil", "MPL-2.0", exceptions, optionalDepsOf),
    false,
  );
  assert.equal(
    isExcepted(
      "lightningcss-linux-x64-gnu",
      "LGPL-2.1",
      exceptions,
      optionalDepsOf,
    ),
    false,
  );
  const noCover = { lightningcss: { license: "MPL-2.0" } };
  assert.equal(
    isExcepted(
      "lightningcss-linux-x64-gnu",
      "MPL-2.0",
      noCover,
      optionalDepsOf,
    ),
    false,
  );
});

test("optionalDepsReader reads the installed parent's package.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "pharos-licenses-"));
  try {
    mkdirSync(join(dir, "lightningcss"));
    writeFileSync(
      join(dir, "lightningcss", "package.json"),
      JSON.stringify({
        optionalDependencies: { "lightningcss-linux-x64-gnu": "1.0.0" },
      }),
    );
    const read = optionalDepsReader(dir);
    assert.deepEqual(read("lightningcss"), ["lightningcss-linux-x64-gnu"]);
    assert.deepEqual(read("missing"), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
