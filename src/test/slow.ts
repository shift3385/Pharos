// BASE-21: the timeout of a test file whose tests are slow by nature: whole
// pages rendered in jsdom and checked with axe, real `.xlsx` round trips
// through ExcelJS. Under load (CI's runners, or the full suite on a busy
// machine) they took 5–6 s and hit Vitest's 5 s default, while alone they
// pass in about one. Import it once at the top of such a file:
//
//   import "@test/slow";
//
// Everywhere else the 5 s default stays, so a quick test that starts to hang
// still fails fast. A test that waits on purpose (retries, backoff) uses fake
// timers instead of a longer timeout.
import { vi } from "vitest";

export const SLOW_TEST_TIMEOUT = 20_000;

vi.setConfig({ testTimeout: SLOW_TEST_TIMEOUT });
