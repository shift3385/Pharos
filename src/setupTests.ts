// Test setup: extends Vitest's expect with jest-dom matchers and clears the
// DOM/localStorage between tests so theme/i18n state does not leak.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("lang");
});
