// Shared steps for the desktop E2E specs. UI copy comes from the Spanish
// locale (the default UI language), so a text change in es.json does not break
// the selectors.
import { readFileSync } from "node:fs";
import { $, browser, expect } from "@wdio/globals";

export const es = JSON.parse(
  readFileSync(
    new URL("../src/shared/i18n/locales/es.json", import.meta.url),
    "utf8",
  ),
);
export const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

// The account created by `cd server && npm run seed:test-user` (README).
export const email = process.env.TEST_USER_EMAIL ?? "smoke@pharos.dev";
const password = process.env.TEST_USER_PASSWORD ?? "supersecret1";

export const button = (text: string) => $(`button=${text}`);
export const versionBadge = () => $('[data-testid="app-version"]');
export const projectRow = (name: string) => $(`li.tp__item*=${name}`);

export async function signIn() {
  await $("#email").setValue(email);
  await $("#password").setValue(password);
  await button(es.auth.login).click();
  await expect(versionBadge()).toBeDisplayed();
}

export async function openProjects() {
  await $('[data-testid="nav-projects"]').click();
  await expect($("h1")).toHaveText(es.projects.title);
}

/** Creates a project; the app then opens it, titled with its name. */
export async function createProject(name: string) {
  await openProjects();
  await button(es.projects.new).click();
  await $(`input[placeholder="${es.projects.namePlaceholder}"]`).setValue(name);
  await button(es.projects.create).click();
  await expect($("h1")).toHaveText(name);
}

/**
 * "Sincronizar ahora", waiting for the toast it ends with. Fails with the
 * toast's text when the sync reports an error.
 */
export async function syncNow() {
  const done = es.sync.doneToast.split("{{")[0];
  const failed = es.sync.failed;
  await button(es.sync.now).click();
  let outcome = "";
  await browser.waitUntil(
    async () => {
      const text = await $("body").getText();
      outcome = text.includes(done)
        ? "done"
        : text.includes(failed)
          ? text
          : "";
      return outcome !== "";
    },
    { timeout: 20_000, timeoutMsg: "the sync toast never appeared" },
  );
  if (outcome !== "done") {
    const line = outcome.split("\n").find((l) => l.includes(failed));
    throw new Error(`sync failed: ${line}`);
  }
}

/**
 * Leaves the local server account as it was: deletes the project, pushes the
 * deletion (autosync only runs at sign-in) and signs out, which also clears
 * the run's keychain entry. Signing out happens even if a step before fails,
 * so the next spec starts signed out.
 */
export async function cleanUp(projectName: string) {
  try {
    await openProjects();
    if (await projectRow(projectName).isExisting()) {
      await projectRow(projectName)
        .$(`button[aria-label="${es.common.delete}"]`)
        .click();
      await button(es.projects.deleteConfirm).click();
      await expect(projectRow(projectName)).not.toBeExisting();
      await syncNow();
    }
  } finally {
    if (await button(es.auth.logout).isExisting()) {
      await button(es.auth.logout).click();
      await expect(button(es.auth.login)).toBeDisplayed();
    }
  }
}
