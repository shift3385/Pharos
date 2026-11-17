// Test setup: extends Vitest's expect with jest-dom matchers and clears the
// DOM/localStorage between tests so theme/i18n state does not leak.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Default to an offline fetch so no test accidentally hits a real backend.
// Tests that exercise the API mock the authApi module explicitly.
//
// The offline fetch is also the baseline `vi.unstubAllGlobals()` returns to.
// Otherwise a request still on its way when a test ends (several awaits
// between deciding to ask and calling fetch) reaches the real fetch, and a
// Pharos API running locally on :3000 answers it: a 401 there starts a
// session renewal that changes the next test's signed-in user. CI has no
// server on :3000, which is why this only failed locally.
const offlineFetch = () => Promise.reject(new TypeError("network disabled in tests"));
globalThis.fetch = offlineFetch as typeof fetch;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new TypeError("network disabled in tests"))),
  );
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("lang");
  document.documentElement.removeAttribute("data-viewport");
  vi.unstubAllGlobals();
});
