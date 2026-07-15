// Test setup: extends Vitest's expect with jest-dom matchers and clears the
// DOM/localStorage between tests so theme/i18n state does not leak.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Default to an offline fetch so no test accidentally hits a real backend.
// Tests that exercise the API mock the authApi module explicitly.
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
  vi.unstubAllGlobals();
});
