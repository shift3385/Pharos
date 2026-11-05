// Navigation and data helpers shared by the tours (MAN-01). Selectors prefer
// test ids, roles and the Spanish UI copy (es.json), like e2e/support.ts.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { $, $$, browser, expect } from "@wdio/globals";
import { button, es } from "../support";

export const fixturesDir = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures");
export const repoDir = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

/** The tour's projects (fixed names and prefixes: the manual shows them). */
export const PROJECT_A = { name: "Banca Móvil", prefix: "BM" };
export const PROJECT_B = { name: "Portal Clientes", prefix: "PC" };

/** Clicks the theme toggle until the app is in the light theme. */
export async function switchToLightTheme() {
  for (let i = 0; i < 3; i++) {
    const theme = await browser.execute(() => document.documentElement.dataset.theme);
    if (theme === "light") return;
    await $('[data-testid="theme-toggle"]').click();
  }
  throw new Error("could not switch to the light theme");
}

export const t = (key: string): string => {
  const value = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], es);
  if (typeof value !== "string") throw new Error(`es.json has no string at ${key}`);
  return value;
};
/** es.json text with {{placeholders}} filled. */
export const tf = (key: string, vars: Record<string, string | number>) =>
  t(key).replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));

export const byTestId = (id: string) => $(`[data-testid="${id}"]`);

export async function goHome() {
  await byTestId("nav-dashboard").click();
}

/** Opens a project from «Todos los proyectos». When a chapter runs on its
 *  own (`npm run manual -- --spec 04`), the project chapter 2 makes may not
 *  exist yet: it is created then, so every chapter can run alone. */
export async function openProject(name: string) {
  await byTestId("nav-projects").click();
  await expect($(`h1=${es.projects.title}`)).toBeDisplayed();
  await $(".pj-table, .pj-empty").waitForExist();
  const row = $(`a.pj-row__link*=${name}`);
  if (!(await row.isExisting())) {
    await button(es.projects.new).click();
    await $("#pj-new-name").setValue(name);
    await button(es.projects.create).click();
  } else await row.click();
  await expect($(`h1=${name}`)).toBeDisplayed();
}

/** Opens a section of the open project from the sidebar. */
export async function openSection(section: string) {
  await byTestId(`nav-project-${section}`).click();
  await browser.waitUntil(async () => (await browser.getUrl()).includes(`/${section}`), {
    timeoutMsg: `section ${section} did not open`,
  });
}

export async function openAdminTab(tab: string) {
  await byTestId("nav-admin").click();
  await byTestId(`admin-tab-${tab}`).click();
  await expect(byTestId(`admin-tab-${tab}`)).toHaveAttribute("aria-selected", "true");
}

/** Waits for a toast (or any text) to appear on the page. A success toast
 *  lives 3 s and the tours hide all but the newest one, so a toast that came
 *  and went between two polls (on a slow CI runner) is also found in the log
 *  `stabilise()` keeps (tour.ts): each logged toast satisfies one wait, and
 *  only within 15 s of appearing, so an old one never answers a new wait. */
export async function waitForText(text: string, timeout = 15_000) {
  await browser.waitUntil(
    () =>
      browser.execute((t: string) => {
        type Entry = { text: string; at: number; used: boolean };
        const log = ((window as unknown as { __tourToasts?: Entry[] }).__tourToasts ??= []);
        const fresh = (e: Entry) => !e.used && Date.now() - e.at < 15_000 && e.text.includes(t);
        const visible = document.body.innerText.includes(t);
        const logged = [...log].reverse().find(fresh);
        if (logged) logged.used = true;
        return visible || Boolean(logged);
      }, text),
    { timeout, interval: 200, timeoutMsg: `text never appeared: ${text}` },
  );
}

/** Sets a hidden <input type="file"> (WebDriver uploads the local file). */
export async function chooseFile(selector: string, file: string) {
  const input = await $(selector);
  const hidden = await browser.execute((el: HTMLElement) => {
    const was = { hidden: el.hasAttribute("hidden"), display: el.style.display };
    el.removeAttribute("hidden");
    el.style.display = "block";
    return was;
  }, input as unknown as HTMLElement);
  await input.setValue(file);
  // Hide it again, so the captures show the app as the user sees it.
  await browser.execute(
    (el: HTMLElement, was: { hidden: boolean; display: string }) => {
      if (was.hidden) el.setAttribute("hidden", "");
      el.style.display = was.display;
    },
    input as unknown as HTMLElement,
    hidden,
  );
}

/** The elements matching `selector` once there are at least `n` of them (a
 *  list or a step that just rendered): never a one-shot count that a slow
 *  runner can take too early. */
export async function atLeast(selector: string, n: number, timeout = 15_000) {
  await browser.waitUntil(async () => (await $$(selector)).length >= n, {
    timeout,
    interval: 200,
    timeoutMsg: `fewer than ${n} of ${selector}`,
  });
  return Array.from(await $$(selector));
}

/** The open dialog (the topmost [role=dialog] / [role=alertdialog]). */
export const dialog = () => $('[role="dialog"][aria-modal="true"], [role="alertdialog"]');

/**
 * The form control labelled `label` (exact text, or the start of it), inside
 * `scope` (a selector; default the whole page): `<label for>` or a control
 * nested in the label, else `aria-label`.
 */
export async function field(label: string, scope = "body") {
  // The control may not be rendered yet (an editor or a drawer that just
  // opened, a slow CI runner): look again until it is there and displayed.
  let id: string | null = null;
  await browser
    .waitUntil(
      async () => {
        id = await lookUpField(label, scope);
        return id !== null && (await $(`[data-tour-field="${id}"]`).isDisplayed());
      },
      { timeout: 10_000, interval: 200 },
    )
    .catch(() => undefined);
  // Found but never displayed (a visually hidden native control): as before.
  if (!id) throw new Error(`no control labelled «${label}» in ${scope}`);
  return $(`[data-tour-field="${id}"]`);
}

/** One look for the control labelled `label`; marks it and returns its tag. */
async function lookUpField(label: string, scope: string): Promise<string | null> {
  return browser.execute(
    (text: string, scopeSel: string) => {
      const root = document.querySelector(scopeSel) ?? document.body;
      const norm = (s: string | null) => (s ?? "").replace(/\s+/g, " ").replace(/\*$/, "").trim();
      const mark = (el: Element) => {
        const tag = `tour-field-${Math.random().toString(36).slice(2)}`;
        el.setAttribute("data-tour-field", tag);
        return tag;
      };
      for (const l of Array.from(root.querySelectorAll("label"))) {
        const name = norm(l.textContent);
        if (name !== text && !name.startsWith(text)) continue;
        const target = l.htmlFor ? document.getElementById(l.htmlFor) : l.querySelector("input,select,textarea");
        if (target) return mark(target);
      }
      const aria = root.querySelector(`[aria-label="${text}"]`);
      return aria ? mark(aria) : null;
    },
    label,
    scope,
  );
}

/** Selects an <option> by its visible text in the control labelled `label`. */
export async function selectOption(label: string, text: string, scope = "body") {
  const el = await field(label, scope);
  await el.selectByVisibleText(text);
}

/** A menu item (role menuitem/menuitemradio) whose text contains `text`. */
export const menuItem = (text: string) =>
  $(`//*[starts-with(@role,"menuitem")][contains(normalize-space(.),${xpathString(text)})]`);

/** A string literal for XPath (handles both quote kinds). */
export function xpathString(s: string): string {
  if (!s.includes('"')) return `"${s}"`;
  if (!s.includes("'")) return `'${s}'`;
  return `concat(${s.split('"').map((part) => `"${part}"`).join(`, '"', `)})`;
}

/** Opens a menu from its trigger button and picks an item, re-opening the
 *  menu if a re-render closed it in between (a toast, a list reload). */
export async function pickFromMenu(trigger: string, item: string) {
  await browser.waitUntil(
    async () => {
      if (!(await menuItem(item).isDisplayed().catch(() => false))) await clickButton(trigger);
      return menuItem(item).isDisplayed().catch(() => false);
    },
    { timeout: 15_000, interval: 750, timeoutMsg: `menu «${trigger}» never showed «${item}»` },
  );
  await menuItem(item).click();
}

/** Waits for a native confirm()/alert() and accepts it. */
export async function acceptNativeDialog(timeout = 5_000) {
  await browser.waitUntil(
    async () => {
      try {
        await browser.getAlertText();
        return true;
      } catch {
        return false;
      }
    },
    { timeout, timeoutMsg: "no native dialog appeared" },
  );
  await browser.acceptAlert();
}

export { button, es };

/** XPath (relative to a scope element) of the innermost element whose own
 *  text contains `text`. */
export const hasText = (text: string) => {
  const t = xpathString(text);
  return `.//*[contains(normalize-space(.),${t}) and not(./*[contains(normalize-space(.),${t})])]`;
};

/** Empties a React-controlled input (clearValue fires no input event). */
export async function clearInput(selector: string) {
  await $(selector).click();
  await browser.keys(["Control", "a"]);
  await browser.keys("Backspace");
}

/** Clicks the first *visible, enabled* button whose text is `text` (several
 *  screens repeat a label, e.g. «Guardar» in a header and in a dialog). */
export async function clickButton(text: string, scopeSelector?: string) {
  // `button=text` matches the *visible* text (screen-reader-only spans and
  // icons do not count), like a user reading the button.
  await browser.waitUntil(
    async () => {
      const all = scopeSelector ? await $(scopeSelector).$$(`button=${text}`) : await $$(`button=${text}`);
      for (const b of all) {
        if ((await b.isDisplayed()) && (await b.isEnabled())) {
          await b.click();
          return true;
        }
      }
      return false;
    },
    { timeout: 15_000, timeoutMsg: `no visible, enabled button «${text}»` },
  );
}
