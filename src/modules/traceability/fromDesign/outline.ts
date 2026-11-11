// Text read from design files that are not images (IA-18, ADR-0037): the
// outline of an HTML screen (a Claude Design `*.dc.html` or any HTML), the
// texts of an Excalidraw sketch and a Markdown document. Nothing is executed:
// HTML is parsed with DOMParser, which never runs its scripts. Pure — testable.

import { MAX_TEXT_PER_ITEM } from "./limits";

/** Template bindings of Claude Design (`{{ theme }}`), meaningless to the model. */
const BINDING = /\{\{[^}]*\}\}/g;

const clean = (text: string) => text.replace(BINDING, " ").replace(/\s+/g, " ").trim();

export function capText(text: string, max = MAX_TEXT_PER_ITEM): { text: string; truncated: boolean } {
  return text.length > max ? { text: `${text.slice(0, max)}…`, truncated: true } : { text, truncated: false };
}

const SKIP = new Set(["script", "style", "noscript", "template", "helmet", "svg", "head", "meta", "link"]);

/** What a person sees and can do on a screen, one line each: headings, fields,
 *  buttons, links, components and text. Repeated lines are dropped. */
export function htmlOutline(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const lines: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const line = raw.trim();
    // A control with no name ("[link]") says nothing.
    if (!line || /^\[[a-z:]+\]$/.test(line) || seen.has(line)) return;
    seen.add(line);
    lines.push(line);
  };
  const title = clean(doc.title);
  if (title) push(`# ${title}`);

  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag)) return;
    const label = (attr: string) => clean(el.getAttribute(attr) ?? "");
    const heading = /^h([1-6])$/.exec(tag);
    if (heading) {
      push(`${"#".repeat(Number(heading[1]))} ${clean(el.textContent ?? "")}`);
      return;
    }
    if (tag === "button" || el.getAttribute("role") === "button") {
      push(`[button] ${clean(el.textContent ?? "") || label("aria-label") || label("title")}`);
      return;
    }
    if (tag === "a") {
      push(`[link] ${clean(el.textContent ?? "") || label("aria-label")}`);
      return;
    }
    if (tag === "input" || tag === "textarea" || tag === "select") {
      const type = tag === "input" ? label("type") || "text" : tag;
      if (type === "hidden") return;
      const name = label("aria-label") || label("placeholder") || label("name") || label("value");
      const options =
        tag === "select"
          ? ` (${[...el.querySelectorAll("option")].map((o) => clean(o.textContent ?? "")).filter(Boolean).join(", ")})`
          : "";
      push(`[field:${type}] ${name}${options}`.trim());
      return;
    }
    if (tag === "label") {
      push(`[label] ${clean(el.textContent ?? "")}`);
      return;
    }
    if (tag === "dc-import") {
      push(`[component] ${label("name")}`);
    }
    if (tag === "img") {
      const alt = label("alt");
      if (alt) push(`[image] ${alt}`);
    }
    // Text written directly in this element (its children are walked apart).
    const own = clean(
      [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent ?? "")
        .join(" "),
    );
    if (own && /\p{L}|\p{N}/u.test(own)) push(own);
    for (const child of el.children) walk(child);
  };
  if (doc.body) walk(doc.body);
  return lines.join("\n");
}

interface ExcalidrawElement {
  type?: string;
  text?: string;
  originalText?: string;
  name?: string | null;
  isDeleted?: boolean;
  frameId?: string | null;
  id?: string;
  y?: number;
  x?: number;
}

/** The texts of an Excalidraw sketch (`.excalidraw`, JSON), grouped by frame
 *  and read top to bottom. Throws when the file is not an Excalidraw scene. */
export function excalidrawTexts(json: string): string {
  const scene = JSON.parse(json) as { type?: string; elements?: ExcalidrawElement[] };
  if (scene?.type !== "excalidraw" || !Array.isArray(scene.elements)) throw new Error("not-excalidraw");
  const live = scene.elements.filter((e) => !e.isDeleted);
  const frames = new Map(live.filter((e) => e.type === "frame" || e.type === "magicframe").map((f) => [f.id, f]));
  const groups = new Map<string, ExcalidrawElement[]>();
  for (const e of live.filter((el) => el.type === "text")) {
    const key = e.frameId && frames.has(e.frameId) ? e.frameId : "";
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const byPosition = (a: ExcalidrawElement, b: ExcalidrawElement) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0);
  const out: string[] = [];
  for (const [key, texts] of groups) {
    if (key) out.push(`## ${clean(frames.get(key)?.name ?? "") || "Frame"}`);
    for (const t of [...texts].sort(byPosition)) {
      const text = (t.originalText ?? t.text ?? "").replace(/\s+/g, " ").trim();
      if (text) out.push(text);
    }
  }
  return out.join("\n");
}

/** A Markdown document as the model reads it: as is, without blank-line runs. */
export function markdownText(md: string): string {
  return md.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
