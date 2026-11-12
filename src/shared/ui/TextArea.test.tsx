// UX-33: every multi-line field starts at its size's lines, grows with its
// text (CSS `field-sizing`, or JS where the browser lacks it), stops at its cap
// and never hyphenates.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { TextArea } from "./TextArea";
import { TEXTAREA_MIN_LINES, type TextAreaSize } from "./textAreaSize";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "textArea.css"), "utf8");

/** The declarations of the first rule whose selector is exactly `selector`. */
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
};

function Controlled({ size, initial = "" }: { size: TextAreaSize; initial?: string }) {
  const [v, setV] = useState(initial);
  return <TextArea aria-label="campo" size={size} value={v} onChange={(e) => setV(e.target.value)} />;
}

/** jsdom does no layout: the text's height is whatever the test says. */
function fakeScrollHeight(el: HTMLElement, height: () => number) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: height });
}

function setFieldSizing(supported: boolean) {
  vi.stubGlobal("CSS", {
    escape: globalThis.CSS?.escape ?? ((s: string) => s),
    supports: (prop: string, value?: string) => prop === "field-sizing" && value === "content" && supported,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("TextArea", () => {
  it.each([
    ["document", 8],
    ["description", 5],
    ["short", 3],
    ["step", 2],
    ["paste", 2],
    ["cell", 1],
  ] as const)("a %s field starts at %i lines", (size, lines) => {
    render(<TextArea aria-label="campo" size={size} value="" onChange={() => {}} />);
    const ta = screen.getByRole("textbox", { name: "campo" });
    expect(ta).toHaveAttribute("rows", String(lines));
    expect(ta).toHaveClass("ui-textarea", `ui-textarea--${size}`);
    expect(TEXTAREA_MIN_LINES[size]).toBe(lines);
    expect(rule(`.ui-textarea--${size}`)).toMatch(new RegExp(`--ta-min-lines:\\s*${lines};`));
  });

  it("keeps the caller's class and forwards its ref", () => {
    const ref = { current: null as HTMLTextAreaElement | null };
    render(<TextArea ref={ref} className="db-recovery__input" aria-label="clave" size="paste" defaultValue="" />);
    const ta = screen.getByRole("textbox", { name: "clave" });
    expect(ta).toHaveClass("ui-textarea", "db-recovery__input");
    expect(ref.current).toBe(ta);
  });

  it("caps each size, half the window for documents", () => {
    expect(rule(".ui-textarea--document")).toMatch(/--ta-max:\s*50vh;/);
    expect(rule(".ui-textarea--description")).toMatch(/--ta-max-lines:\s*15;/);
    expect(rule(".ui-textarea--short")).toMatch(/--ta-max-lines:\s*10;/);
    expect(rule(".ui-textarea--step")).toMatch(/--ta-max-lines:\s*6;/);
    expect(rule(".ui-textarea--paste")).toMatch(/--ta-max-lines:\s*4;/);
  });

  it("grows by itself in CSS, without a resize grip or hyphens", () => {
    const base = rule(".ui-textarea.ui-textarea");
    expect(base).toMatch(/field-sizing:\s*content;/);
    expect(base).toMatch(/resize:\s*none;/);
    expect(base).toMatch(/max-block-size:/);
    expect(base).toMatch(/overflow-y:\s*auto;/);
    expect(base).toMatch(/hyphens:\s*manual;/);
  });

  it("on a phone starts one line shorter and stops at half the visible height", () => {
    const mobile = rule('[data-viewport="mobile"] .ui-textarea.ui-textarea');
    expect(mobile).toMatch(/--ta-less:\s*1;/);
    expect(mobile).toMatch(/50dvh/);
  });

  it("leaves the height to CSS when the browser has field-sizing", () => {
    setFieldSizing(true);
    render(<Controlled size="short" />);
    const ta = screen.getByRole("textbox", { name: "campo" });
    fakeScrollHeight(ta, () => 400);
    fireEvent.change(ta, { target: { value: "mucho texto" } });
    expect(ta.style.height).toBe("");
  });

  it("without field-sizing, measures the text in JS as it changes", () => {
    setFieldSizing(false);
    render(<Controlled size="short" />);
    const ta = screen.getByRole("textbox", { name: "campo" });
    // The text's height plus the 1 px border, top and bottom.
    ta.style.border = "1px solid";
    let content = 60;
    fakeScrollHeight(ta, () => content);
    content = 120;
    fireEvent.change(ta, { target: { value: "línea 1\nlínea 2\nlínea 3\nlínea 4" } });
    expect(ta.style.height).toBe("122px");
    expect(ta.style.overflowY).toBe("hidden");

    content = 150;
    fireEvent(window, new Event("resize"));
    expect(ta.style.height).toBe("152px");
  });

  it("without field-sizing, stops at its cap and scrolls inside", () => {
    setFieldSizing(false);
    render(<Controlled size="step" />);
    const ta = screen.getByRole("textbox", { name: "campo" });
    ta.style.maxHeight = "100px";
    fakeScrollHeight(ta, () => 300);
    fireEvent.change(ta, { target: { value: "x".repeat(2000) } });
    expect(ta.style.height).toBe("100px");
    expect(ta.style.overflowY).toBe("auto");
  });
});

describe("no hyphenated words in fields", () => {
  const src = join(here, "..", "..");
  const cssFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith(".css") ? [p] : [];
    });

  it("no rule hyphenates an input or a textarea", () => {
    for (const file of cssFiles(src)) {
      const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const [, selector, body] of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (/hyphens:\s*auto/.test(body) && /\b(input|textarea|ui-textarea)\b/.test(selector)) {
          throw new Error(`${file}: ${selector.trim()} hyphenates a field`);
        }
      }
    }
  });

  it("fields opt out of the screen's hyphenation", () => {
    const typography = readFileSync(join(src, "shared", "theme", "typography.css"), "utf8");
    expect(typography).toMatch(/\.screen-root input,\s*\.screen-root textarea\s*\{\s*hyphens:\s*manual;/);
  });
});
