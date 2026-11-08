import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { readMaterial, summarize, withinLimits, type MaterialFile, type MaterialItem } from "./material";
import { MAX_ATTACHMENTS, fitWithin, imageTokens, pdfPageCount } from "./limits";

const reduce = vi.fn(async (blob: Blob) => ({
  mediaType: "image/webp" as const,
  data: `W${blob.size}`,
  width: 1568,
  height: 980,
}));
const file = (path: string, body: string, type = "", nested = false): MaterialFile => ({
  path,
  blob: new Blob([body], { type }),
  nested,
});
const pdf = (pages: number) =>
  `%PDF-1.4 1 0 obj <</Type /Pages /Count ${pages}>> ${Array.from({ length: pages }, () => "<</Type /Page>>").join(" ")}`;

describe("limits", () => {
  it("fits the long edge and never enlarges", () => {
    expect(fitWithin(3136, 1960)).toEqual({ width: 1568, height: 980 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1000, 4000, 1568)).toEqual({ width: 392, height: 1568 });
    expect(imageTokens(1568, 980)).toBe(56 * 35);
  });

  it("counts the pages of a PDF, not its page tree", () => {
    expect(pdfPageCount(new TextEncoder().encode(pdf(3)))).toBe(3);
  });
});

describe("readMaterial", () => {
  it("reduces images, keeps PDF as is and reads Excalidraw texts", async () => {
    const { items, issues } = await readMaterial(
      [
        file("login.png", "png-bytes", "image/png"),
        file("flujo.pdf", pdf(2), "application/pdf"),
        file("boceto.excalidraw", JSON.stringify({ type: "excalidraw", elements: [{ type: "text", text: "Guardar" }] })),
        file("notas.txt", "x"),
      ],
      { reduce },
    );
    expect(items.map((i) => [i.kind, i.name, i.tool])).toEqual([
      ["image", "login.png", null],
      ["pdf", "flujo.pdf", null],
      ["text", "boceto.excalidraw", "excalidraw"],
    ]);
    expect(items[0].attachment).toMatchObject({ mediaType: "image/webp", name: "login.png" });
    expect(items[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(items[1]).toMatchObject({ pages: 2, attachment: { mediaType: "application/pdf" } });
    expect(items[2].text).toBe("Guardar");
    expect(issues).toEqual([{ name: "notas.txt", reason: "unsupported" }]);
  });

  it("reads a Claude Design export once per file: docs, screens and the thumbnail", async () => {
    const zip = new JSZip();
    const screen = "<html><body><h1>Inicio</h1><button>Crear proyecto</button></body></html>";
    zip.file("README.md", "# Rediseño\nEspecificación");
    zip.file("Dashboard.dc.html", screen);
    zip.file("prototipos/Dashboard.dc.html", screen); // the same bytes twice
    zip.file("ds/styles.css", "body{}");
    zip.file("support.js", "x");
    zip.file("assets/login-faro.jpg", "jpg");
    zip.file(".thumbnail", "RIFFxxxxWEBP");
    const blob = await zip.generateAsync({ type: "blob" });
    const { items, issues } = await readMaterial([{ path: "proyecto.zip", blob }], { reduce });
    expect(issues).toEqual([]);
    expect(items.map((i) => [i.kind, i.name, i.tool, i.included, i.frame])).toEqual([
      ["image", "proyecto.zip/assets/login-faro.jpg", "claude-design", false, undefined],
      ["image", "proyecto.zip/.thumbnail", "claude-design", true, undefined],
      ["text", "proyecto.zip/README.md", "claude-design", true, undefined],
      ["text", "proyecto.zip/Dashboard.dc.html", "claude-design", true, "Dashboard"],
    ]);
    expect(items[3].text).toBe("# Inicio\n[button] Crear proyecto");
  });

  it("reports files it cannot use and keeps the rest", async () => {
    const big = { path: "huge.png", blob: { size: 50 * 1024 * 1024, type: "image/png" } as Blob };
    const { items, issues } = await readMaterial(
      [big, file("long.pdf", pdf(30), "application/pdf"), file("bad.excalidraw", "{"), file("ok.png", "a", "image/png")],
      { reduce },
    );
    expect(items.map((i) => i.name)).toEqual(["ok.png"]);
    expect(issues).toEqual([
      { name: "huge.png", reason: "too-large" },
      { name: "long.pdf", reason: "too-many-pages" },
      { name: "bad.excalidraw", reason: "unreadable" },
    ]);
  });
});

describe("withinLimits and summarize", () => {
  const image = (n: number): MaterialItem => ({
    id: `m${n}`,
    kind: "image",
    name: `${n}.png`,
    tool: null,
    note: "",
    included: true,
    sha256: String(n),
    tokens: 100,
    attachment: { mediaType: "image/webp", data: "AAAA" },
  });

  it("turns off attachments beyond the limit, in order", () => {
    const items = withinLimits(Array.from({ length: MAX_ATTACHMENTS + 2 }, (_, i) => image(i + 1)));
    expect(items.filter((i) => i.included)).toHaveLength(MAX_ATTACHMENTS);
    expect(items.at(-1)?.included).toBe(false);
    const s = summarize(items);
    expect(s).toMatchObject({ attachments: MAX_ATTACHMENTS, tokens: MAX_ATTACHMENTS * 100, over: [], empty: false });
  });

  it("flags a selection over the limits and an empty one", () => {
    const all = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, i) => image(i + 1));
    expect(summarize(all).over).toEqual(["attachments"]);
    expect(summarize(all.map((i) => ({ ...i, included: false }))).empty).toBe(true);
  });
});
