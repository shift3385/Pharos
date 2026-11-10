// Navigation and data helpers shared by the tours (MAN-01). Selectors prefer
// test ids, roles and the Spanish UI copy (es.json), like e2e/support.ts.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { $, $$, browser, expect } from "@wdio/globals";
import { button, es } from "../support";

export const fixturesDir = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures");
export const repoDir = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

/** The tour's projects (fixed names and prefixes: the manual shows them). */
export const PROJECT_A = { name: "Pharos", prefix: "PH" };
export const PROJECT_B = { name: "API de sincronización", prefix: "API" };

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

/** Waits for text that stays on the page (a heading, an inline status). A toast
 *  needs waitForToast: visible text can miss it or match the wrong moment. */
export async function waitForText(text: string, timeout = 15_000) {
  await browser.waitUntil(async () => (await $("body").getText()).includes(text), {
    timeout,
    interval: 200,
    timeoutMsg: `text never appeared: ${text}`,
  });
}

interface RecordedToast {
  text: string;
  at: number;
  used: boolean;
  error: boolean;
}
type ToastLog = { __tourToasts?: RecordedToast[] };

/** How long a toast nobody waited for can still answer a wait. Longer than a
 *  toast lives (Toast.tsx: 3 s, 8 s for warnings and errors). */
const TOAST_MAX_AGE_MS = 10_000;

/** Records every toast the app raises, in the page. Polling visible text is not
 *  reliable for them: a toast leaves after 3 s, and the captures' CSS
 *  (`stabilise`) hides it as soon as a newer one appears. Idempotent; a new page
 *  starts a new log. */
export async function recordToasts() {
  await browser.execute(() => {
    const w = window as unknown as ToastLog;
    if (w.__tourToasts) return;
    const log: RecordedToast[] = (w.__tourToasts = []);
    const add = (el: Element) =>
      log.push({
        text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
        at: Date.now(),
        used: false,
        error: el.classList.contains("toast--error"),
      });
    document.querySelectorAll(".toast").forEach(add);
    new MutationObserver((changes) => {
      for (const change of changes) {
        change.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(".toast")) add(node);
          else node.querySelectorAll(".toast").forEach(add);
        });
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}

/** Waits for a toast containing `text`, even one already gone or hidden. Each
 *  toast answers one wait only, so the toast of an earlier save (still on screen
 *  for 3 s) cannot pass for the one this step's save has yet to raise. An error
 *  toast counts only with `{ error: true }`: a failure whose message happens to
 *  contain the text must not pass for success. */
export async function waitForToast(text: string, timeout = 15_000, { error = false } = {}) {
  await recordToasts();
  try {
    await browser.waitUntil(
      () =>
        browser.execute(
          (wanted: string, maxAge: number, wantError: boolean) => {
            const log = (window as unknown as ToastLog).__tourToasts ?? [];
            const hit = log.find((t) => !t.used && t.error === wantError && t.text.includes(wanted) && Date.now() - t.at < maxAge);
            if (hit) hit.used = true;
            return Boolean(hit);
          },
          text,
          TOAST_MAX_AGE_MS,
          error,
        ),
      { timeout },
    );
  } catch {
    const seen = await browser.execute(() => ((window as unknown as ToastLog).__tourToasts ?? []).map((t) => t.text));
    throw new Error(`toast never appeared: ${text} (toasts so far: ${JSON.stringify(seen.slice(-5))})`);
  }
}

/** After a save: waits until nothing on the page says «Guardando…» or
 *  «Cargando…» and shows no skeleton any more (the save finished and the editor reloaded), so a
 *  capture never shows a half-done state (UX-10 review H1/M1). */
export async function waitForSettled(timeout = 15_000) {
  const busy = [es.common.loading, es.testCase.saving, es.defects.saving].filter(Boolean);
  await browser.waitUntil(
    async () => {
      const text = await $("body").getText();
      return busy.every((b) => !text.includes(b)) && (await $$(".sk").length) === 0;
    },
    { timeout, timeoutMsg: "the page never settled after saving (still saving or loading)" },
  );
}

/** What dnd-kit's live regions say now (one per board or step list). */
const dragAnnouncement = () =>
  browser.execute(() =>
    Array.from(document.querySelectorAll('[id^="DndLiveRegion"]'))
      .map((el) => el.textContent ?? "")
      .join(" "),
  );

/**
 * A keyboard drag: focus the handle, Space, `key` until the live region says
 * `until` (once if omitted), Space. dnd-kit attaches its key listener in a
 * timeout after Space and measures the columns asynchronously, so keys sent
 * straight away are lost on a slow machine, and the second Space drops the
 * item where it started. Each key therefore waits for the announcement it
 * causes, and is sent again if none comes.
 */
export async function keyboardDrag(handle: ReturnType<typeof $>, { key = "ArrowRight", until, moves = 8 }: { key?: string; until?: string; moves?: number } = {}) {
  await handle.click();
  const idle = await dragAnnouncement();
  await browser.keys(" ");
  await browser.waitUntil(async () => (await dragAnnouncement()) !== idle, {
    interval: 100,
    timeoutMsg: "the keyboard drag did not start",
  });
  let last = await dragAnnouncement();
  let announced = false;
  for (let i = 0; i < moves && !announced; i++) {
    await browser.keys(key);
    const changed = await browser
      .waitUntil(async () => (await dragAnnouncement()) !== last, { timeout: 2_000, interval: 100 })
      .catch(() => false);
    if (!changed) continue;
    last = await dragAnnouncement();
    announced = until ? last.includes(until) : true;
  }
  if (!announced) throw new Error(`the keyboard drag never reached ${until ?? "a new place"} (last: ${last})`);
  await browser.keys(" ");
  await browser.waitUntil(async () => (await dragAnnouncement()) !== last, { interval: 100, timeoutMsg: "the keyboard drag did not drop" });
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
        const target = l.htmlFor
          ? document.getElementById(l.htmlFor)
          : l.querySelector('input,select,textarea,[role="combobox"]');
        if (target) return mark(target);
      }
      const aria = root.querySelector(`[aria-label="${text}"]`);
      return aria ? mark(aria) : null;
    },
    label,
    scope,
  );
}

/** Picks an option by its visible text in the Pharos select labelled
 *  `label` (UX-30). */
export async function selectOption(label: string, text: string, scope = "body") {
  await chooseOption(await field(label, scope), { text });
}

/** Opens a Pharos select (UX-30: a `combobox` button with a `listbox`, or
 *  a bottom sheet on a phone) and clicks the option with that value, visible
 *  text or position — what `selectByAttribute` / `selectByVisibleText` /
 *  `selectByIndex` did on a native `<select>`. */
export async function chooseOption(
  select: ReturnType<typeof $> | WebdriverIO.Element,
  by: { value: string } | { text: string } | { index: number },
) {
  const el = await select;
  await el.scrollIntoView({ block: "center" });
  if ((await el.getAttribute("aria-expanded")) !== "true") await el.click();
  const listId = await browser.waitUntil(async () => el.getAttribute("aria-controls"), {
    timeout: 5_000,
    timeoutMsg: "the select did not open",
  });
  const inList = `//*[@id=${xpathString(listId)}]`;
  const opt = "(@role=\"option\" or @data-menu-item)";
  const option =
    "value" in by
      ? $(`${inList}//*[@role="option" or @data-menu-item][@data-value=${xpathString(by.value)} or @data-testid[contains(., ${xpathString(`-option-${by.value}`)})]]`)
      : "text" in by
        ? $(
            `${inList}//*[${opt}][.//span[(contains(@class,"menu__title") or contains(@class,"menu__text")) and not(contains(@class,"menu__text--stack")) and normalize-space(.)=${xpathString(by.text)}]]`,
          )
        : $(`(${inList}//*[${opt}])[${by.index + 1}]`);
  await option.waitForDisplayed({ timeout: 5_000 });
  await option.click();
  // The list closes on a choice.
  await browser.waitUntil(async () => (await el.getAttribute("aria-expanded")) === "false", {
    timeout: 5_000,
    timeoutMsg: "the select did not close after the choice",
  });
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

/** Waits for Pharos's confirmation (the topmost alertdialog; the app never
 *  uses the browser's, NC-017) and presses its confirm button. With `text`,
 *  checks first that the question says it. */
export async function acceptConfirm(text?: string, timeout = 5_000) {
  const ask = $$('[role="alertdialog"]');
  await browser.waitUntil(async () => (await ask.length) > 0, {
    timeout,
    timeoutMsg: "no Pharos confirmation appeared",
  });
  const top = ask[(await ask.length) - 1];
  if (text) await expect(top).toHaveText(expect.stringContaining(text));
  await top.$("button.cd__confirm").click();
  await top.waitForExist({ reverse: true, timeout });
}

/** Answers Pharos's topmost confirmation «no» (its cancel button, NC-017). */
export async function dismissConfirm(text?: string, timeout = 5_000) {
  const ask = $$('[role="alertdialog"]');
  await browser.waitUntil(async () => (await ask.length) > 0, {
    timeout,
    timeoutMsg: "no Pharos confirmation appeared",
  });
  const top = ask[(await ask.length) - 1];
  if (text) await expect(top).toHaveText(expect.stringContaining(text));
  await top.$("button.cd__cancel").click();
  await top.waitForExist({ reverse: true, timeout });
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
