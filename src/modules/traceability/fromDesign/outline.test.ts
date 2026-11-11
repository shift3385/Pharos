import { describe, expect, it } from "vitest";
import { capText, excalidrawTexts, htmlOutline, markdownText } from "./outline";

// A screen shaped like a Claude Design `*.dc.html`: bindings, custom tags and a
// script that must never run.
const SCREEN = `<!DOCTYPE html><html><head><title>Login</title><script>window.ran = true</script></head><body>
<x-dc><helmet><script src="./ds-base.js"></script></helmet>
<div data-theme="{{ theme }}"><sc-if value="{{ notMobile }}"><div>
<dc-import name="LogoMark" size="{{ 40 }}"></dc-import><span>Pharos</span>
<h1>Iniciar sesión</h1><span>¿No tienes cuenta? <a href="#">Regístrate</a></span>
<label>Correo</label><input type="email" placeholder="tu@empresa.com">
<input type="password" aria-label="Contraseña"><input type="hidden" name="csrf" value="x">
<select name="lang"><option>Español</option><option>English</option></select>
<button>Entrar</button><button>Entrar</button><a href="#">{{ forgot }}</a>
<svg><text>ignored</text></svg>
</div></sc-if></div></x-dc></body></html>`;

describe("htmlOutline", () => {
  it("lists what a person sees and can do, without running or binding anything", () => {
    const out = htmlOutline(SCREEN);
    expect(out.split("\n")).toEqual([
      "# Login",
      "[component] LogoMark",
      "Pharos",
      "# Iniciar sesión",
      "¿No tienes cuenta?",
      "[link] Regístrate",
      "[label] Correo",
      "[field:email] tu@empresa.com",
      "[field:password] Contraseña",
      "[field:select] lang (Español, English)",
      "[button] Entrar",
    ]);
    expect((window as { ran?: boolean }).ran).toBeUndefined();
  });
});

describe("excalidrawTexts", () => {
  const scene = (elements: unknown[]) => JSON.stringify({ type: "excalidraw", version: 2, elements });

  it("reads texts top to bottom, grouped by frame, without deleted ones", () => {
    const out = excalidrawTexts(
      scene([
        { id: "f1", type: "frame", name: "Alta" },
        { type: "text", text: "Guardar", y: 50, x: 0, frameId: "f1" },
        { type: "text", originalText: "Nombre\n*", text: "Nombre *", y: 10, x: 0, frameId: "f1" },
        { type: "text", text: "Nota suelta", y: 0, x: 0 },
        { type: "text", text: "borrado", isDeleted: true },
        { type: "rectangle" },
      ]),
    );
    expect(out.split("\n")).toEqual(["## Alta", "Nombre *", "Guardar", "Nota suelta"]);
  });

  it("rejects a file that is not an Excalidraw scene", () => {
    expect(() => excalidrawTexts(JSON.stringify({ type: "other", elements: [] }))).toThrow("not-excalidraw");
    expect(() => excalidrawTexts("not json")).toThrow();
  });
});

describe("text helpers", () => {
  it("caps long text and tidies Markdown", () => {
    expect(capText("abcdef", 3)).toEqual({ text: "abc…", truncated: true });
    expect(capText("abc", 3)).toEqual({ text: "abc", truncated: false });
    expect(markdownText("# A\r\n\r\n\r\n\r\nB\n")).toBe("# A\n\nB");
  });
});
