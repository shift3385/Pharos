// FIX-51: every literal key the app passes to `t()` exists in both locales.
// FIX-49 used «traceability.matrix.weightedCalcPassed» without adding it, and
// the matrix showed the raw key: no test compared the keys in the code with
// the locale files. Keys built at run time (`t(\`x.${y}\`)`) are not checked
// here; their own tests cover their catalogs.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import es from "./locales/es.json";
import en from "./locales/en.json";

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = "", out = new Set<string>()): Set<string> {
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.add(key);
    else flatten(v, key, out);
  }
  return out;
}

const SUFFIXES = ["", "_zero", "_one", "_two", "_few", "_many", "_other"];
const has = (keys: Set<string>, key: string) =>
  SUFFIXES.some((s) => keys.has(key + s)) ||
  // A key may name a whole object (returnObjects) or a context variant.
  [...keys].some((k) => k.startsWith(`${key}.`) || k.startsWith(`${key}_`));

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

// `t("a.b")`, `i18n.t("a.b")`, `t('a.b')`, `t(\`a.b\`)` without `${`, and
// `i18nKey="a.b"`. A key has at least one dot and only key characters.
const CALL = /(?<![\w.])(?:i18n\.)?t\(\s*(["'`])([A-Za-z][\w-]*(?:\.[\w-]+)+)\1/g;
const TRANS = /i18nKey=(["'])([A-Za-z][\w-]*(?:\.[\w-]+)+)\1/g;

describe("i18n keys used in the app (FIX-51)", () => {
  const esKeys = flatten(es as Tree);
  const enKeys = flatten(en as Tree);
  const root = join(__dirname, "..", "..");
  const used: { key: string; at: string }[] = [];
  for (const file of sources(root)) {
    const text = readFileSync(file, "utf8");
    for (const re of [CALL, TRANS]) {
      for (const m of text.matchAll(re)) {
        const line = text.slice(0, m.index).split("\n").length;
        used.push({ key: m[2], at: `${relative(root, file)}:${line}` });
      }
    }
  }

  it("finds the calls it checks", () => {
    expect(used.length).toBeGreaterThan(1000);
    expect(used.some((u) => u.key === "traceability.matrix.weightedCalcPassed")).toBe(true);
  });

  it("every literal key is in es.json", () => {
    expect(used.filter((u) => !has(esKeys, u.key)).map((u) => `${u.key} (${u.at})`)).toEqual([]);
  });

  it("every literal key is in en.json", () => {
    expect(used.filter((u) => !has(enKeys, u.key)).map((u) => `${u.key} (${u.at})`)).toEqual([]);
  });
});
