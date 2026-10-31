import { createHash, randomBytes } from "node:crypto";

/** Stable step and row ids of a test case and the identity of a case revision
 *  (DAT-02, ADR-0011). The same code as the desktop's `src-tauri/src/steps.rs`;
 *  both are checked against `src-tauri/tests/fixtures/stable-steps-vectors.json`.
 *  The rules are written there, in the module doc: shapes, the lossless
 *  conversion of older data, and the derived ids. */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** UUIDv5 namespace of case revision ids (ADR-0011 rule 3). Never changes. */
export const NS_TEST_CASE_REVISION = "6f1c2b7e-4d3a-5e8f-9b10-c2d4e6f8a0b2";

const STEP_LISTS = ["preconditions", "background", "steps"] as const;
const FLOW_STEP_LISTS = ["preconditions", "steps"] as const;

const isObject = (v: unknown): v is JsonObject =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** 8 Crockford base32 characters from the first 40 bits of `sha256(input)`. */
function shortHash(input: string): string {
  const digest = createHash("sha256").update(input, "utf8").digest();
  let acc = 0n;
  for (let i = 0; i < 5; i++) acc = (acc << 8n) | BigInt(digest[i]);
  let out = "";
  for (let i = 7; i >= 0; i--)
    out += ALPHABET[Number((acc >> BigInt(i * 5)) & 31n)];
  return out;
}

/** The derived id of slot `index` of `list`, not yet in `used` (then added). */
export function deriveId(
  caseId: string,
  list: string,
  index: number,
  used: Set<string>,
): string {
  const base = `${caseId}:${list}:${index}`;
  for (let n = 0; ; n++) {
    const id = shortHash(n === 0 ? base : `${base}:${n}`);
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
}

/** A random id not in `used` (then added): a save never derives one, since a
 *  derived id could be the one a deleted step had in that slot. */
export function randomId(used: Set<string>): string {
  for (;;) {
    const b = randomBytes(5);
    let acc = 0n;
    for (const x of b) acc = (acc << 8n) | BigInt(x);
    let id = "";
    for (let i = 7; i >= 0; i--)
      id += ALPHABET[Number((acc >> BigInt(i * 5)) & 31n)];
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
}

type IdGen = (list: string, index: number, used: Set<string>) => string;

/** RFC 8785 (JCS): keys sorted by UTF-16 code units, numbers and strings as
 *  `JSON.stringify` writes them. */
export function jcs(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  if (isObject(value)) {
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

type Kind = "step" | "row";

const validId = (v: unknown): string | null =>
  isObject(v) && typeof v.id === "string" && v.id !== "" ? v.id : null;

const wellFormed = (kind: Kind, el: unknown): el is JsonObject =>
  isObject(el) &&
  (kind === "step" ? typeof el.text === "string" : Array.isArray(el.values));

function visit(
  data: JsonObject,
  f: (list: string, kind: Kind, arr: Json[]) => void,
) {
  for (const key of STEP_LISTS) {
    const arr = data[key];
    if (Array.isArray(arr)) f(key, "step", arr);
  }
  const ex = data.examples;
  if (isObject(ex) && Array.isArray(ex.rows)) f("examples", "row", ex.rows);
  const flows = data.flows;
  if (!Array.isArray(flows)) return;
  for (const flow of flows) {
    if (!isObject(flow) || typeof flow.id !== "string") continue;
    for (const key of FLOW_STEP_LISTS) {
      const arr = flow[key];
      if (Array.isArray(arr)) f(`flows/${flow.id}/${key}`, "step", arr);
    }
    const fex = flow.examples;
    if (isObject(fex) && Array.isArray(fex.rows))
      f(`flows/${flow.id}/examples`, "row", fex.rows);
  }
}

function flowIds(data: JsonObject, gen: IdGen) {
  const flows = data.flows;
  if (!Array.isArray(flows)) return;
  const used = new Set<string>();
  const needs: number[] = [];
  flows.forEach((flow, i) => {
    if (!isObject(flow)) return;
    const id = validId(flow);
    if (id !== null && !used.has(id)) used.add(id);
    else needs.push(i);
  });
  for (const i of needs) (flows[i] as JsonObject).id = gen("flows", i, used);
}

function convert(kind: Kind, el: Json, id: string): Json {
  if (wellFormed(kind, el)) return { ...el, id };
  if (kind === "step")
    return { id, text: typeof el === "string" ? el : jcs(el) };
  if (Array.isArray(el)) return { id, values: el };
  return { id, values: [typeof el === "string" ? el : jcs(el)] };
}

/** Returns `data` in the stable-steps shape with derived ids (a copy; the
 *  input is untouched) and whether anything changed: documents of older
 *  clients. Idempotent. A non-object is returned as is. */
export function normalizeCaseData<T>(
  caseId: string,
  data: T,
): { data: T; changed: boolean } {
  return normalizeWith(data, (list, index, used) =>
    deriveId(caseId, list, index, used),
  );
}

/** The same for a save: a missing or repeated id gets a random one. */
export function normalizeNewCaseData<T>(data: T): T {
  return normalizeWith(data, (_list, _index, used) => randomId(used)).data;
}

function normalizeWith<T>(data: T, gen: IdGen): { data: T; changed: boolean } {
  if (!isObject(data)) return { data, changed: false };
  const before = jcs(data);
  const out = structuredClone(data) as JsonObject;
  flowIds(out, gen);
  const used = new Set<string>();
  const keep: boolean[] = [];
  visit(out, (_list, kind, arr) => {
    for (const el of arr) {
      const id = validId(el);
      const ok = wellFormed(kind, el) && id !== null && !used.has(id);
      if (ok) used.add(id);
      keep.push(ok);
    }
  });
  let next = 0;
  visit(out, (list, kind, arr) => {
    arr.forEach((el, i) => {
      if (!keep[next++]) arr[i] = convert(kind, el, gen(list, i, used));
    });
  });
  return { data: out as T, changed: jcs(out) !== before };
}

/** True when `data` has any step or row list not yet in the stable shape. */
export function needsNormalizing(caseId: string, data: unknown): boolean {
  return normalizeCaseData(caseId, data).changed;
}

/** The shape a client without `stable-steps` (0.1.x, 0.2.0-alpha.1) knows:
 *  steps as their text, rows as their values, no `expected`. It is only sent
 *  to clients that can no longer push (VERSIONING §6.5), so nothing is lost. */
export function flattenCaseData<T>(data: T): T {
  if (!isObject(data)) return data;
  const out = structuredClone(data) as JsonObject;
  const steps = (arr: Json) =>
    Array.isArray(arr)
      ? arr.map((s) => (isObject(s) && typeof s.text === "string" ? s.text : s))
      : arr;
  const rows = (ex: Json) => {
    if (isObject(ex) && Array.isArray(ex.rows))
      ex.rows = ex.rows.map((r) =>
        isObject(r) && Array.isArray(r.values) ? r.values : r,
      );
  };
  for (const key of STEP_LISTS) if (key in out) out[key] = steps(out[key]);
  rows(out.examples);
  if (Array.isArray(out.flows))
    for (const flow of out.flows) {
      if (!isObject(flow)) continue;
      for (const key of FLOW_STEP_LISTS)
        if (key in flow) flow[key] = steps(flow[key]);
      rows(flow.examples);
    }
  return out as T;
}

export interface RevisionFields {
  scenarioId: string;
  title: string;
  version: string;
  status: string;
  priority: string;
  caseType?: string | null;
  automationStatus?: string | null;
  data: unknown;
}

/** The content a revision hash covers (ADR-0011 rule 2). */
export function revisionContent(f: RevisionFields): JsonObject {
  return {
    scenarioId: f.scenarioId,
    title: f.title,
    version: f.version,
    status: f.status,
    priority: f.priority,
    caseType: f.caseType ?? null,
    automationStatus: f.automationStatus ?? null,
    data: f.data as Json,
  };
}

export const contentSha256 = (content: unknown): string =>
  createHash("sha256").update(jcs(content), "utf8").digest("hex");

/** RFC 4122 UUIDv5 of `name` in `namespace`. */
export function uuidV5(namespace: string, name: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const h = createHash("sha1")
    .update(ns)
    .update(name, "utf8")
    .digest()
    .subarray(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** `UUIDv5(NS_TEST_CASE_REVISION, "<caseId>:<revision>:<sha>")` (rule 3). */
export const revisionId = (
  caseId: string,
  revision: number,
  sha: string,
): string => uuidV5(NS_TEST_CASE_REVISION, `${caseId}:${revision}:${sha}`);
