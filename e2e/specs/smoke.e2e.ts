// Smoke of the real desktop binary (BASE-14): start → sign in with the local
// test account → create a project → restart the app → the project and the
// session are still there.
import { browser, expect } from "@wdio/globals";
import {
  TEST_PROJECT_PREFIX,
  button,
  cleanUp,
  createProject,
  ensureSignedOut,
  es,
  openProjects,
  pkg,
  projectRow,
  signIn,
  userMenuTrigger,
  versionBadge,
} from "../support";

const projectName = `${TEST_PROJECT_PREFIX}smoke ${process.env.PHAROS_E2E_PROFILE}`;

describe("Pharos desktop smoke (BASE-14)", () => {
  before(async () => {
    await ensureSignedOut();
  });

  it("starts on the sign-in screen", async () => {
    await expect(button(es.auth.login)).toBeDisplayed();
  });

  it("signs in with the seeded test account", async () => {
    await signIn();
    // In the DOM in every layout, visible only in the full sidebar.
    expect(await versionBadge().getProperty("textContent")).toBe(`v${pkg.version}`);
  });

  it("creates a project", async () => {
    await createProject(projectName);
  });

  it("keeps the session and the project after a restart", async () => {
    await browser.reloadSession(); // closes Pharos and starts it again
    await expect(userMenuTrigger()).toBeDisplayed(); // signed in from the cached session
    await openProjects();
    await expect(projectRow(projectName)).toBeDisplayed();
  });

  after(async () => {
    await cleanUp();
  });
});
