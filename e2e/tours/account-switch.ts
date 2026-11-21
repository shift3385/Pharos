// Switching the app's session between Liomar and «Administrador» (owner's
// decision D-4, amended): the app stays signed in as Liomar for everything
// except the server-administration block of chapter 15 (Administración ›
// Usuarios), where administering is the subject. The switch itself is never a
// step: it takes no capture unless the writer puts one in a step of its own.
//
//   await signInAs("admin");   // syncs Liomar's changes, signs out, signs in as Administrador
//   …the Usuarios steps…
//   await signInAs("liomar");  // and back; Liomar's data must still be there
//
// Before leaving Liomar's session it syncs, so nothing of his is pending;
// after coming back it checks that his projects are still listed. If the app
// lost or hid Liomar's data across the switch, that is an app bug to report,
// never something to work around here.
import { $, browser, expect } from "@wdio/globals";
import { ADMIN, PERSONA } from "../../scripts/manual/persona.mjs";
import { signOut, syncNow, userMenuTrigger } from "../support";
import { PROJECT_A, PROJECT_B } from "./data/pharos";
import { button, byTestId, es } from "./helpers";
import { ADMIN_PASSWORD, LIOMAR_PASSWORD } from "./people";

const ACCOUNTS = {
  liomar: { email: PERSONA.email, password: LIOMAR_PASSWORD, alias: PERSONA.alias },
  admin: { email: ADMIN.email, password: ADMIN_PASSWORD, alias: ADMIN.alias },
};

/** The e-mail of the account signed in to the app (the user menu's). */
async function signedInEmail(): Promise<string | null> {
  if (!(await userMenuTrigger().isExisting())) return null;
  return browser.execute(() => document.body.innerText.match(/[\w.+-]+@pharos\.test/)?.[0] ?? null);
}

/** Signs the app in as `who`, leaving the current account first (after a
 *  sync, so nothing is left unsent). No-op when it is already `who`. */
export async function signInAs(who: keyof typeof ACCOUNTS) {
  const account = ACCOUNTS[who];
  if ((await signedInEmail()) === account.email) return;
  if (await userMenuTrigger().isExisting()) {
    await syncNow();
    await signOut();
  }
  await $("#email").waitForDisplayed({ timeout: 30_000 });
  await $("#email").setValue(account.email);
  await $("#password").setValue(account.password);
  await button(es.auth.login).click();
  await expect(userMenuTrigger()).toBeDisplayed({ wait: 30_000 });
  await browser.waitUntil(async () => (await signedInEmail()) === account.email, {
    timeout: 15_000,
    timeoutMsg: `the app did not sign in as ${account.alias}`,
  });
  if (who === "liomar") {
    // Liomar's data must have survived the switch (an app bug otherwise).
    await byTestId("nav-projects").click();
    // «Pharos» may live in «Equipo QA» (chapter 20): either project counts.
    await browser.waitUntil(async () => (await $(`a.pj-row__link*=${PROJECT_A.name}`).isExisting()) || (await $(`a.pj-row__link*=${PROJECT_B.name}`).isExisting()), {
      timeout: 30_000,
      timeoutMsg: "Liomar's projects are not listed after switching back: report it as an app bug",
    });
  }
}

/** Runs `body` signed in as «Administrador» and always comes back to Liomar. */
export async function asAdmin<T>(body: () => Promise<T>): Promise<T> {
  await signInAs("admin");
  try {
    return await body();
  } finally {
    await signInAs("liomar");
  }
}
