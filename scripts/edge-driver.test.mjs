import assert from "node:assert/strict";
import { test } from "node:test";
import { isMicrosoftSigned } from "../e2e/scripts/edge-driver.mjs";

// The E2E driver is a downloaded executable: only a valid Microsoft
// Authenticode signature lets it run (ADR-0021).
test("accepts only a valid signature from Microsoft", () => {
  const microsoft =
    "CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US";
  assert.equal(isMicrosoftSigned("Valid", microsoft), true);
  assert.equal(isMicrosoftSigned("HashMismatch", microsoft), false);
  assert.equal(isMicrosoftSigned("NotSigned", ""), false);
  assert.equal(isMicrosoftSigned("UnknownError", microsoft), false);
  assert.equal(isMicrosoftSigned("Valid", "CN=Evil Corp, O=Microsoft Corporation"), false);
  assert.equal(isMicrosoftSigned("Valid", "CN=Microsoft Corporation Fake, O=X"), false);
  assert.equal(isMicrosoftSigned("Valid", undefined), false);
});
