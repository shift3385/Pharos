// Tour harness (MAN-01). A tour is a chapter of the user manual and a
// functional test at once: every step runs an action, asserts its outcome,
// takes a screenshot and carries a short Spanish caption. The steps are written
// to e2e/results/tours/steps.json, which scripts/build-manual.mjs turns into
// docs/manual/ (Markdown + PDF).
//
//   chapter("casos", () => {
//     step("nuevo", {
//       title: "Crear un caso",
//       caption: "Pulsa «Nuevo caso», escribe el título y guarda.",
//       covers: ["cases.create"],
//       run: async () => { …action…; await expect(…).toBeDisplayed(); },
//     });
//   });
//
// `covers` names the inventory items of e2e/tours/manifest.ts the step
// exercises; `npm run check:manual` reads them statically, so they must be
// string literals.
import { appendFileSync, mkdirSync } from "node:fs";
import { foreignNames } from "../../scripts/manual/persona.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { $, $$, browser } from "@wdio/globals";
import { recordToasts } from "./helpers";
import { CHAPTERS, type ChapterId } from "./manifest";
import { es, setAppWindow } from "../support";

const resultsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "results", "tours");
export const stepsFile = join(resultsDir, "steps.jsonl");

/** Desktop shots at 1440×900 (the manual's size); mobile notes at 390×844. */
export const DESKTOP = { width: 1440, height: 900, view: "desktop" as const };
export const MOBILE = { width: 390, height: 844, view: "mobile" as const };
/** Medium screens (icon strip), 1024×768 (MAN-03). */
export const TABLET = { width: 1024, height: 768, view: "tablet" as const };
export type Viewport = typeof DESKTOP | typeof MOBILE | typeof TABLET;

export type Shot =
  | "page"
  /** Only one element (a dialog, a card): a CSS/WDIO selector. */
  | { element: string }
  | false;

export interface StepSpec {
  title: string;
  caption: string;
  covers?: string[];
  run: () => Promise<void>;
  shot?: Shot;
  /** Why the step is skipped (written to the manual as pending). */
  skip?: string;
  /** Selectors blurred in the capture (a recovery key, an API key field…). */
  mask?: string[];
  /** Keep the newest toast in the capture (it is what the step shows). By
   *  default toasts are hidden: they carry stale messages and local paths. */
  toast?: boolean;
  /** The control the step is about (MAN-02): CSS/WDIO selector(s), their
   *  union box. The manual outlines it in the capture and, in the PDF, adds a
   *  magnified inset when it is small in a big screen. */
  focus?: string | string[];
  /** Consecutive steps with the same key print side by side in the PDF (a
   *  before/after pair). */
  group?: string;
  /** Runs after the capture, as part of the step (its failures count): for a
   *  step that shows the state *before* an action and still asserts it. */
  after?: () => Promise<void>;
}

/** A box in capture pixels. */
export interface FocusBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Always blurred: things that show this machine's paths. */
const ALWAYS_MASKED = ['[data-testid="download-dir"]'];

export interface StepRecord {
  chapter: ChapterId;
  n: number;
  id: string;
  title: string;
  caption: string;
  covers: string[];
  image: string | null;
  viewport: { width: number; height: number };
  status: "passed" | "failed" | "skipped";
  reason?: string;
  focus?: FocusBox;
  /** The step declared a focus that was not displayed at capture time. */
  focusMissing?: boolean;
  /** Other people or accounts the capture showed (NC-052; only in report mode). */
  foreignNames?: string[];
  group?: string;
}

/** The union box of `selectors` in the capture's pixels: relative to the
 *  viewport (page shots) or to `origin` (element shots), times the device
 *  pixel ratio. Null when none is displayed. */
async function focusBox(selectors: string[], origin: string | null): Promise<FocusBox | null> {
  const boxes: FocusBox[] = [];
  for (const sel of selectors) {
    for (const el of await $$(sel)) {
      if (!(await el.isDisplayed())) continue;
      boxes.push(
        await browser.execute((node: HTMLElement) => {
          const r = node.getBoundingClientRect();
          return { x: r.left, y: r.top, w: r.width, h: r.height };
        }, el as unknown as HTMLElement),
      );
    }
  }
  if (boxes.length === 0) return null;
  const { dpr, ox, oy } = await browser.execute((o: string | null) => {
    const r = o ? document.querySelector(o)?.getBoundingClientRect() : null;
    return { dpr: window.devicePixelRatio || 1, ox: r?.left ?? 0, oy: r?.top ?? 0 };
  }, origin);
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return {
    x: Math.round((x0 - ox) * dpr),
    y: Math.round((y0 - oy) * dpr),
    w: Math.round((x1 - x0) * dpr),
    h: Math.round((y1 - y0) * dpr),
  };
}

let current: { id: ChapterId; n: number; failed: string | null } | null = null;
/** The window size the next captures must have (setViewport changes it). */
let target: Viewport = DESKTOP;

/** The text a capture shows: the visible text of the page and the values of
 *  its fields (an alias typed in a form is not in innerText). */
async function screenText(): Promise<string> {
  return browser.execute(() => {
    const values = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))
      .filter((el) => el.type !== "password" && el.type !== "hidden" && el.type !== "file")
      .map((el) => el.value);
    return [document.body.innerText, ...values].join("\n");
  });
}

/** NC-052: every capture shows only the manual's person. `report` lists the
 *  hits without failing (PHAROS_TOURS_NAMES=report, for an audit). */
const NAMES_MODE = process.env.PHAROS_TOURS_NAMES === "report" ? "report" : "strict";

function record(rec: StepRecord) {
  mkdirSync(resultsDir, { recursive: true });
  appendFileSync(stepsFile, `${JSON.stringify(rec)}\n`);
}

/** Calm, deterministic captures: no animations, transitions or caret. */
export async function stabilise() {
  await recordToasts();
  await browser.execute(() => {
    if (document.getElementById("tour-stable")) return;
    const style = document.createElement("style");
    style.id = "tour-stable";
    style.textContent =
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}" +
      // At most the newest toast: older ones would pile up over the content.
      ".toast-stack .toast:not(:last-child){display:none!important}";
    document.head.appendChild(style);
  });
}

/** Blurs `selectors` and, unless `keepToast`, hides the toasts (no
 *  selectors and keepToast: back to normal). */
async function setMask(selectors: string[], keepToast = true) {
  await browser.execute((css: string) => {
    let style = document.getElementById("tour-mask");
    if (!style) {
      style = document.createElement("style");
      style.id = "tour-mask";
      document.head.appendChild(style);
    }
    style.textContent = css;
  }, (selectors.length ? `${selectors.join(",")}{filter:blur(7px)!important;user-select:none!important}` : "") + (keepToast ? "" : ".toast-stack{display:none!important}"));
}

async function settle() {
  // The app may resize its window (e.g. after signing in): put it back.
  const { width } = await browser.execute(() => ({ width: window.innerWidth }));
  if (width !== target.width) await setAppWindow(target.width, target.height, target.view);
  await browser.execute(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
  await browser.execute(
    () =>
      new Promise<void>((done) => {
        void document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => done())));
      }),
  );
}

/** The current window size (for the step record). */
async function viewport() {
  const size = await browser.execute(() => ({ width: window.innerWidth, height: window.innerHeight }));
  return size;
}

const OVERLAY = '[role="dialog"][aria-modal="true"], [role="alertdialog"], [role="menu"]';

/**
 * Leaves nothing open for the next chapter: a dialog or menu left by a chapter
 * (a failed step above all) would block the first click of the next one, and
 * that chapter would fail for no reason of its own. Native dialogs are
 * dismissed, an «unsaved changes» prompt is answered «Descartar cambios», the
 * rest get Escape. After a failed step it also leaves the screen, whose
 * unsaved editor would stop the next navigation. A clean chapter should have
 * nothing to close, so it is reported. Never throws: the session may be gone.
 */
async function closeLeftovers(id: ChapterId, failed: string | null) {
  try {
    const discard = () => $('[role="alertdialog"]').$(`button=${es.dialog.unsaved.discard}`);
    const closeOverlays = async () => {
      let closed = 0;
      for (let i = 0; i < 6; i++) {
        const hasNative = await browser.getAlertText().then(
          () => true,
          () => false,
        );
        if (hasNative) {
          await browser.dismissAlert();
          closed++;
          continue;
        }
        const open = [];
        for (const el of await $$(OVERLAY)) if (await el.isDisplayed()) open.push(el);
        if (open.length === 0) return closed;
        closed++;
        // Chaining $ on a missing alertdialog throws: look for it first.
        if ((await $('[role="alertdialog"]').isExisting()) && (await discard().isExisting())) await discard().click();
        else await browser.keys("Escape");
        await browser.execute(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
      }
      console.warn(`! ${id}: an overlay is still open after the chapter`);
      return closed;
    };
    const closed = await closeOverlays();
    if (closed > 0 && !failed) console.warn(`! ${id}: the chapter left ${closed} dialog(s) or menu(s) open; close them in its last step`);
    if (failed) {
      const home = $('[data-testid="nav-dashboard"]');
      if (await home.isDisplayed().catch(() => false)) {
        await home.click();
        await closeOverlays();
      }
    }
  } catch (err) {
    console.warn(`! ${id}: could not clean up after the chapter (${(err as Error).message.split("\n")[0]})`);
  }
}

/** A chapter of the manual: a mocha `describe` whose steps stop after the
 *  first failure (the next steps would only fail for the same reason). */
export function chapter(id: ChapterId, body: () => void) {
  const meta = CHAPTERS.find((c) => c.id === id);
  if (!meta) throw new Error(`chapter ${id} is not in e2e/tours/manifest.ts`);
  describe(`Tour ${meta.number} · ${meta.title}`, () => {
    before(async () => {
      current = { id, n: 0, failed: null };
      await stabilise();
      await setViewport(DESKTOP);
    });
    body();
    after(async () => {
      await closeLeftovers(id, current?.failed ?? null);
    });
  });
}

export function step(id: string, spec: StepSpec) {
  it(`${id} — ${spec.title}`, async function () {
    if (!current) throw new Error("step() outside chapter()");
    const ch = current;
    ch.n += 1;
    const base: StepRecord = {
      chapter: ch.id,
      n: ch.n,
      id,
      title: spec.title,
      caption: spec.caption,
      covers: spec.covers ?? [],
      image: null,
      viewport: { width: 0, height: 0 },
      status: "skipped",
      ...(spec.group ? { group: spec.group } : {}),
    };
    if (spec.skip || ch.failed) {
      record({ ...base, reason: spec.skip ?? `después del fallo de «${ch.failed}»` });
      this.skip();
    }
    try {
      await stabilise();
      await spec.run();
      const shot = spec.shot ?? "page";
      let image: string | null = null;
      let focus: FocusBox | null = null;
      let focusMissing = false;
      let foreign: string[] = [];
      if (shot !== false) {
        await settle();
        image = `${ch.id}/${String(ch.n).padStart(2, "0")}-${id}.png`;
        const file = join(resultsDir, "img", image);
        mkdirSync(dirname(file), { recursive: true });
        await setMask([...ALWAYS_MASKED, ...(spec.mask ?? [])], spec.toast === true);
        try {
          // Two frames for the mask styles to apply.
          await browser.execute(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
          if (spec.focus) {
            const selectors = Array.isArray(spec.focus) ? spec.focus : [spec.focus];
            focus = await focusBox(selectors, shot === "page" ? null : shot.element);
            // Not fatal: the step still proves its action. The manual build
            // lists these steps so the selector gets fixed.
            if (!focus) {
              focusMissing = true;
              console.warn(`! ${ch.id}/${id}: focus not displayed (${selectors.join(", ")})`);
            }
          }
          if (shot === "page") await browser.saveScreenshot(file);
          else await $(shot.element).saveScreenshot(file);
          foreign = [...new Set(foreignNames(await screenText()))];
        } finally {
          await setMask([]);
        }
        if (foreign.length && NAMES_MODE === "strict") {
          throw new Error(`la captura muestra otra persona o cuenta: ${foreign.join(", ")} (NC-052)`);
        }
      }
      const size = await viewport();
      if (spec.after) await spec.after();
      record({
        ...base,
        image,
        viewport: size,
        status: "passed",
        ...(focus ? { focus } : {}),
        ...(focusMissing ? { focusMissing } : {}),
        ...(foreign.length ? { foreignNames: foreign } : {}),
      });
    } catch (err) {
      ch.failed = id;
      const file = join(resultsDir, "failures", `${ch.id}-${id}.png`);
      mkdirSync(dirname(file), { recursive: true });
      await browser.saveScreenshot(file).catch(() => undefined);
      record({ ...base, status: "failed", reason: (err as Error).message.split("\n")[0] });
      throw err;
    }
  });
}

/** Switches the window for the next steps (and waits for the layout). */
export async function setViewport(v: Viewport) {
  target = v;
  await setAppWindow(v.width, v.height, v.view);
}

// ---- AI ------------------------------------------------------------------------

/** The AI tours run only with a real key the user set in their environment. */
export const AI = {
  key: process.env.PHAROS_TOURS_AI_KEY || "",
  provider: process.env.PHAROS_TOURS_AI_PROVIDER || "gemini",
  model: process.env.PHAROS_TOURS_AI_MODEL || "",
  /** Base URL of an OpenAI-compatible endpoint (provider "custom"). */
  baseUrl: process.env.PHAROS_TOURS_AI_BASE_URL || "",
  maxCalls: Number(process.env.PHAROS_TOURS_AI_MAX_CALLS || 8),
};
export const AI_SKIP = AI.key
  ? undefined
  : "requiere una clave real: define PHAROS_TOURS_AI_KEY (e2e/README.md → Tours → IA)";

/** Cheapest suitable model per provider when PHAROS_TOURS_AI_MODEL is unset. */
export const CHEAP_MODELS: Record<string, string> = {
  gemini: "gemini-2.0-flash-lite",
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-5-5",
  openrouter: "",
};

let aiCalls = 0;
/** Counts a request to the AI provider; past the cap the step fails instead of
 *  spending more. */
export function aiCall() {
  aiCalls += 1;
  if (aiCalls > AI.maxCalls) {
    throw new Error(`AI call cap reached (${AI.maxCalls}); raise PHAROS_TOURS_AI_MAX_CALLS if intended`);
  }
}
