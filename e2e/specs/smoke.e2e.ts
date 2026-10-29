// Smoke of the real desktop binary (BASE-14): start → sign in with the local
// test account → create a project → restart the app → the project and the
// session are still there.
import { browser, expect } from "@wdio/globals";
import {
  button,
  cleanUp,
  createProject,
  es,
  openProjects,
  pkg,
  projectRow,
  signIn,
  versionBadge,
} from "../support";

const projectName = `E2E smoke ${process.env.PHAROS_E2E_PROFILE}`;

describe("Pharos desktop smoke (BASE-14)", () => {
  it("starts on the sign-in screen", async () => {
    await expect(button(es.auth.login)).toBeDisplayed();
  });

  it("signs in with the seeded test account", async () => {
    await signIn();
    await expect(versionBadge()).toHaveText(`v${pkg.version}`);
  });

  it("creates a project", async () => {
    await createProject(projectName);
  });

  it("keeps the session and the project after a restart", async () => {
    await browser.reloadSession(); // closes Pharos and starts it again
    await expect(versionBadge()).toBeDisplayed(); // signed in from the cached session
    await openProjects();
    await expect(projectRow(projectName)).toBeDisplayed();
  });

  after(async () => {
    await cleanUp(projectName);
  });
});
