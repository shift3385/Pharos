import { describe, expect, it } from "vitest";
import type { DesignExtraction } from "@modules/ai";
import { promptItems, toCandidates } from "./candidates";
import type { MaterialItem } from "./material";

const base = { note: "", tool: null, tokens: 1, included: true } as const;
const material: MaterialItem[] = [
  { ...base, id: "a", kind: "image", name: "login.png", sha256: "s1", note: "alta", attachment: { mediaType: "image/webp", data: "A" } },
  { ...base, id: "b", kind: "image", name: "off.png", sha256: "s2", included: false, attachment: { mediaType: "image/webp", data: "B" } },
  { ...base, id: "c", kind: "text", name: "Login.dc.html", sha256: "s3", tool: "claude-design", frame: "Login", text: "[button] Entrar" },
  { ...base, id: "d", kind: "pdf", name: "flujo.pdf", sha256: "s4", attachment: { mediaType: "application/pdf", data: "P" } },
];

const candidate = (evidence: DesignExtraction["candidates"][number]["evidence"]) => ({
  title: "Entrar con correo",
  description: "El sistema debe…",
  basis: "stated" as const,
  acceptance: ["Dado…"],
  assumptions: [],
  questions: ["¿Bloqueo tras N intentos?"],
  evidence,
});

describe("promptItems", () => {
  it("numbers only the included items, in order", () => {
    const { prompt, sent } = promptItems(material);
    expect(sent.map((i) => i.id)).toEqual(["a", "c", "d"]);
    expect(prompt.map((i) => [i.number, i.name, i.note])).toEqual([
      [1, "login.png", "alta"],
      [2, "Login.dc.html", ""],
      [3, "flujo.pdf", ""],
    ]);
  });
});

describe("toCandidates", () => {
  const { sent } = promptItems(material);

  it("writes the sources from the material, not from the model", () => {
    const [c] = toCandidates(
      {
        screens: [],
        candidates: [
          candidate([
            { item: 1, region: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }, quote: "Entrar" },
            { item: 2 },
            { item: 3, page: 2, region: { x: 0, y: 0, w: 1, h: 1 } },
          ]),
        ],
      },
      sent,
    );
    expect(c.sources).toEqual([
      { kind: "image", name: "login.png", index: 1, sha256: "s1", note: "alta", region: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 } },
      { kind: "design", name: "Login.dc.html", tool: "claude-design", frame: "Login" },
      { kind: "image", name: "flujo.pdf", index: 3, sha256: "s4", page: 2 },
    ]);
    expect(c).toMatchObject({ basis: "stated", evidence: "Entrar", questions: ["¿Bloqueo tras N intentos?"] });
  });

  it("drops evidence to items not sent, and candidates left with none", () => {
    const out = toCandidates(
      { screens: [], candidates: [candidate([{ item: 9 }]), candidate([{ item: 9 }, { item: 1 }])] },
      sent,
    );
    expect(out).toHaveLength(1);
    expect(out[0].sources).toHaveLength(1);
  });
});
