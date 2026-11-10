// FIX-18: a touchpad or touch swipe past the end of a scroller must not drag
// the whole app off its layout. jsdom has no scrolling, so this pins the rule.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "base.css"), "utf8");

describe("base.css", () => {
  it("turns off the elastic bounce on the document", () => {
    expect(css).toMatch(/html,\s*body\s*\{\s*overscroll-behavior:\s*none;\s*\}/);
  });

  it("keeps the document scrollable for screens outside the app shell", () => {
    expect(css).not.toMatch(/(html|body)[^{}]*\{[^}]*overflow(-x|-y)?:\s*(hidden|clip)/);
  });

  // FIX-21: Edge/WebView2 drew its own eye next to Pharos's show/hide button.
  it("hides Edge's native password eye and clear button", () => {
    expect(css).toMatch(/input::-ms-reveal,\s*input::-ms-clear\s*\{\s*display:\s*none;\s*\}/);
  });

  it("leaves the browser's autofill button alone", () => {
    expect(css).not.toMatch(/credentials-auto-fill-button/);
  });

  // UX-30: every dropdown chevron turns with its trigger's aria-expanded.
  describe("dropdown chevrons", () => {
    /** The declarations of the first rule whose selector is exactly `selector`. */
    const rule = (selector: string) => {
      const at = css.indexOf(`${selector} {`);
      return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
    };

    it("point up while the trigger says it is expanded, down otherwise", () => {
      expect(rule('button[aria-expanded="true"] .lucide-chevron-down')).toMatch(/transform:\s*rotate\(180deg\)/);
      expect(css).not.toMatch(/aria-expanded="false"\][^{]*\{[^}]*rotate/);
    });

    it("turn in a short ease-out, and at once with reduced motion", () => {
      expect(rule("button[aria-expanded] .lucide-chevron-down")).toMatch(/transition:\s*transform 150ms ease-out/);
      const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
      expect(reduced).toMatch(/button\[aria-expanded\] \.lucide-chevron-down\s*\{\s*transition:\s*none/);
    });
  });
});
