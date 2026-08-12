import planEs from "../assets/plan-template-es.xlsx?url";
import planEn from "../assets/plan-template-en.xlsx?url";
import caseEs from "../assets/case-template-es.xlsx?url";
import caseEn from "../assets/case-template-en.xlsx?url";
import type { TemplateKind, TemplateLanguage, TemplateSeedItem } from "./types";

/** Base64-encodes an ArrayBuffer in chunks (avoids call-stack limits). */
export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

interface Def {
  id: string;
  kind: TemplateKind;
  language: TemplateLanguage;
  name: string;
  url: string;
}

const DEFS: Def[] = [
  { id: "builtin-plan-es", kind: "plan", language: "es", name: "PHAROS · Plan de Pruebas (ES)", url: planEs },
  { id: "builtin-plan-en", kind: "plan", language: "en", name: "PHAROS · Test Plan (EN)", url: planEn },
  { id: "builtin-case-es", kind: "case", language: "es", name: "PHAROS · Caso de Prueba (ES)", url: caseEs },
  { id: "builtin-case-en", kind: "case", language: "en", name: "PHAROS · Test Case (EN)", url: caseEn },
];

/** Reads the bundled PHAROS templates and returns them as seed items. */
export async function builtinSeeds(): Promise<TemplateSeedItem[]> {
  return Promise.all(
    DEFS.map(async (d) => {
      const buffer = await fetch(d.url).then((r) => r.arrayBuffer());
      return {
        id: d.id,
        kind: d.kind,
        language: d.language,
        name: d.name,
        description: "",
        usagePrompt: "",
        version: "1.0",
        dataBase64: toBase64(buffer),
      };
    }),
  );
}
