// WCAG 2.1 AA on the real desktop binary (UX-05, ADR-0027): axe-core runs in
// the WebView2 page on the main screens, in both themes. Unlike the component
// tests (jsdom), the page here is laid out and styled, so axe's colour
// contrast rule runs too. Report: docs/accesibilidad/auditoria-wcag-0.1.0.md.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { $, browser, expect } from "@wdio/globals";
import {
  TEST_PROJECT_PREFIX,
  button,
  cleanUp,
  createProject,
  ensureSignedOut,
  es,
  signIn,
} from "../support";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const projectName = `${TEST_PROJECT_PREFIX}a11y ${process.env.PHAROS_E2E_PROFILE}`;

type AxeWindow = {
  axe?: {
    run: (
      context: Document,
      options: object,
    ) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }>;
  };
};

/** axe violations of the current page, one readable line per rule. */
async function violations(): Promise<string[]> {
  await browser.execute(axeSource);
  return browser.execute(async () => {
    const result = await (window as unknown as AxeWindow).axe!.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    });
    return result.violations.map(
      (v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
    );
  });
}

async function go(nav: string, heading: string) {
  await $(`[data-testid="nav-${nav}"]`).click();
  await expect($(`h1=${heading}`)).toBeDisplayed();
}

describe("Accessibility on the desktop binary (UX-05)", () => {
  before(async () => {
    await ensureSignedOut();
  });

  it("the sign-in screen has no WCAG A/AA violations", async () => {
    await expect(button(es.auth.login)).toBeDisplayed();
    expect(await violations()).toEqual([]);
  });

  for (const theme of ["light", "dark"] as const) {
    it(`the main screens have no WCAG A/AA violations (${theme} theme)`, async () => {
      if (!(await $('[data-testid="app-version"]').isExisting())) await signIn();
      const toggle = $(`button[aria-label="${es.theme[theme]}"]`);
      await toggle.click();
      await expect($("html")).toHaveAttribute("data-theme", theme);

      expect(await violations()).toEqual([]); // home
      await go("projects", es.projects.title);
      expect(await violations()).toEqual([]);
      await go("templates", es.templates.title);
      expect(await violations()).toEqual([]);
      await go("admin", es.admin.title);
      expect(await violations()).toEqual([]);
      await go("profile", es.profile.title);
      expect(await violations()).toEqual([]);
    });
  }

  it("a project and the plan wizard have no WCAG A/AA violations", async () => {
    await createProject(projectName);
    expect(await violations()).toEqual([]);
    await button(es.testPlan.new).click();
    await expect($(`h2*=${es.testPlan.step.title}`)).toBeDisplayed();
    expect(await violations()).toEqual([]);
  });

  it("the skip link is the first stop and moves to the content", async () => {
    await browser.keys(["Tab"]);
    const skip = $(`a=${es.a11y.skipToContent}`);
    await expect(skip).toBeFocused();
    await browser.keys(["Enter"]);
    await expect($("#main-content")).toBeFocused();
  });

  after(async () => {
    // The wizard leaves an unsaved plan: leave without the "discard?" prompt.
    await browser.execute(() => {
      window.confirm = () => true;
    });
    await $(`[data-testid="nav-projects"]`).click();
    await $('[data-testid="nav-dashboard"]').click();
    await $(`button[aria-label="${es.theme.light}"]`).click().catch(() => {});
    await cleanUp();
  });
});
