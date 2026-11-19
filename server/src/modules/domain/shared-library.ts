// The project library for the web (CAS-01, ADR-0055): shared steps and
// datasets, their immutable versions and the copy a case keeps of them.
// The twin of the desktop's `src-tauri/src/shared_library.rs` and
// `shared_library/materialize.rs`; both pass
// `src-tauri/tests/fixtures/shared-steps-vectors.json`. Keep them in step.

import {
  contentSha256,
  randomId,
  shortHash,
  uuidV5,
} from "../sync/stable-steps";

type Json = unknown;
export type Obj = Record<string, unknown>;

export const SHARED_STEP = "shared_step";
export const DATASET = "dataset";
export const SHARED_STEP_REVISION = "shared_step_revision";
export const DATASET_REVISION = "dataset_revision";
export const LIBRARY_ENTITIES = [SHARED_STEP, DATASET] as const;
export const LIBRARY_REVISION_ENTITIES = [
  SHARED_STEP_REVISION,
  DATASET_REVISION,
] as const;

export const NS_SHARED_STEP_REVISION = "5c1e7a20-3b9d-4f61-8e2a-d4c6b8f01a3c";
export const NS_DATASET_REVISION = "2d8b4f93-6a1c-5e70-9b3d-e5f70c2a4b6d";

export const LIMITS = {
  name: 200,
  description: 10_000,
  steps: 50,
  params: 20,
  stepText: 4_000,
  columns: 30,
  rows: 500,
  cell: 4_096,
  paramName: 40,
} as const;

export const SHARED_REFS = "sharedRefs";
export const DATASET_REFS = "datasetRefs";
export const CASE_TARGET = "case";

export const isObject = (v: unknown): v is Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const str = (v: unknown, k: string): string | undefined => {
  const x = isObject(v) ? v[k] : undefined;
  return typeof x === "string" ? x : undefined;
};
/** Length as the desktop counts it (UTF-16 units, like JavaScript). */
const len = (s: string) => s.length;

export class LibraryError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export interface SharedVersion {
  itemId: string;
  version: number;
  revisionId: string;
  name: string;
  steps: Obj[];
}

export interface DatasetVersion {
  itemId: string;
  version: number;
  revisionId: string;
  name: string;
  columns: { id: string; name: string }[];
  rows: { id: string; values: Obj }[];
}

/** Where the materializer reads the library: `revisionId` undefined asks for
 *  the current version of a live item. */
export interface Library {
  shared(itemId: string, revisionId?: string): SharedVersion | undefined;
  dataset(itemId: string, revisionId?: string): DatasetVersion | undefined;
}

export interface Outcome {
  missing: string[];
  missingColumns: string[];
  changed: boolean;
}

export const derivedStepId = (
  caseId: string,
  refId: string,
  libraryStepId: string,
) => shortHash(`${caseId}:shared:${refId}:${libraryStepId}`);

export const derivedRowId = (caseId: string, refId: string, rowId: string) =>
  shortHash(`${caseId}:dataset:${refId}:${rowId}`);

/** `[<, >]` spans of each placeholder: `<`, a character that is neither a
 *  space nor `>`, up to the next `>` (as `placeholdersIn`). */
function spans(text: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "<") {
      const c = text[i + 1];
      if (c !== undefined && !/\s/.test(c) && c !== ">") {
        const end = text.indexOf(">", i + 1);
        if (end >= 0) {
          out.push([i, end]);
          i = end + 1;
          continue;
        }
      }
    }
    i++;
  }
  return out;
}

export function placeholders(text: string): string[] {
  const out: string[] = [];
  for (const [a, b] of spans(text)) {
    const name = text.slice(a + 1, b).trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

export function substitute(text: string, args: Obj): string {
  let out = "";
  let last = 0;
  for (const [a, b] of spans(text)) {
    const name = text.slice(a + 1, b).trim();
    const arg =
      typeof args[name] === "string" ? (args[name] as string).trim() : "";
    if (arg) {
      out += text.slice(last, a) + arg;
      last = b + 1;
    }
  }
  return out + text.slice(last);
}

export const follows = (r: Obj) =>
  typeof r.follow === "boolean" ? r.follow : true;
export const refs = (data: Obj, key: string): Obj[] =>
  Array.isArray(data[key])
    ? (data[key] as unknown[]).filter(isObject).map((r) => ({ ...r }))
    : [];
export const idsOf = (v: Obj, key: string): string[] =>
  Array.isArray(v[key])
    ? (v[key] as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
export const listOf = (call: Obj) =>
  call.list === "preconditions" ? "preconditions" : "steps";

export function hasRefs(data: Obj): boolean {
  return [SHARED_REFS, DATASET_REFS].some(
    (k) => Array.isArray(data[k]) && (data[k] as unknown[]).length > 0,
  );
}

/** The library ids the case names: [shared steps, datasets]. */
export function referenced(data: Obj): [string[], string[]] {
  const ids = (key: string, field: string) =>
    refs(data, key)
      .map((r) => str(r, field))
      .filter((x): x is string => !!x);
  return [ids(SHARED_REFS, "sharedStepId"), ids(DATASET_REFS, "datasetId")];
}

export function callCopy(caseId: string, call: Obj, v: SharedVersion): Obj[] {
  const refId = str(call, "id") ?? "";
  const args = isObject(call.args) ? call.args : {};
  return v.steps.map((s) => {
    const step: Obj = {
      id: derivedStepId(caseId, refId, str(s, "id") ?? ""),
      text: substitute(str(s, "text") ?? "", args),
    };
    const e = str(s, "expected");
    if (e) step.expected = substitute(e, args);
    return step;
  });
}

function placeBlock(data: Obj, list: string, oldIds: string[], block: Obj[]) {
  const wanted = new Set([...oldIds, ...block.map((s) => str(s, "id") ?? "")]);
  const current = Array.isArray(data[list]) ? (data[list] as unknown[]) : [];
  let at: number | undefined;
  const kept: unknown[] = [];
  for (const el of current) {
    const id = str(el, "id");
    if (id !== undefined && wanted.has(id)) {
      if (at === undefined) at = kept.length;
    } else kept.push(el);
  }
  const i = Math.min(at ?? kept.length, kept.length);
  kept.splice(i, 0, ...block);
  data[list] = kept;
}

function caseTexts(data: Obj): string[] {
  const out: string[] = [];
  for (const list of ["preconditions", "steps"]) {
    for (const s of Array.isArray(data[list])
      ? (data[list] as unknown[])
      : []) {
      if (typeof s === "string") out.push(s);
      else {
        const t = str(s, "text");
        if (t !== undefined) out.push(t);
      }
      const e = str(s, "expected");
      if (e !== undefined) out.push(e);
    }
  }
  const e = str(data, "expectedResult");
  if (e !== undefined) out.push(e);
  return out;
}

export function caseParams(data: Obj): string[] {
  const out: string[] = [];
  for (const t of caseTexts(data))
    for (const p of placeholders(t)) if (!out.includes(p)) out.push(p);
  return out;
}

export function datasetTable(
  caseId: string,
  binding: Obj,
  params: string[],
  v: DatasetVersion,
): [Obj, string[]] {
  const refId = str(binding, "id") ?? CASE_TARGET;
  const map = isObject(binding.columnMap) ? binding.columnMap : {};
  const byName = (name: string) => v.columns.find((c) => c.name === name)?.id;
  const used = new Set<string>();
  const missing: string[] = [];
  const headers: string[] = [];
  const sources: (string | undefined)[] = [];
  for (const p of params) {
    const mapped =
      typeof map[p] === "string" ? byName(map[p] as string) : undefined;
    const col = mapped ?? byName(p);
    if (col !== undefined) used.add(col);
    else missing.push(p);
    headers.push(p);
    sources.push(col);
  }
  for (const c of v.columns) {
    if (!used.has(c.id) && !headers.includes(c.name)) {
      headers.push(c.name);
      sources.push(c.id);
    }
  }
  const only = Array.isArray(binding.rowIds)
    ? new Set(
        (binding.rowIds as unknown[]).filter(
          (x): x is string => typeof x === "string",
        ),
      )
    : undefined;
  const rows = v.rows
    .filter((r) => !only || only.has(r.id))
    .map((r) => ({
      id: derivedRowId(caseId, refId, r.id),
      values: sources.map((src) =>
        src !== undefined && typeof r.values[src] === "string"
          ? r.values[src]
          : "",
      ),
    }));
  return [{ headers, rows }, missing];
}

function setRefVersion(
  r: Obj,
  version: number,
  revisionId: string,
  name: string,
) {
  r.version = version;
  r.revisionId = revisionId;
  r.name = name;
}

export const canonical = (v: unknown) => JSON.stringify(sortKeys(v));
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isObject(v))
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sortKeys(v[k])]),
    );
  return v;
}

/** Rewrites every call and binding of `data` (in place) from the library. */
export function materialize(caseId: string, data: Obj, lib: Library): Outcome {
  const out: Outcome = { missing: [], missingColumns: [], changed: false };
  if (!hasRefs(data)) return out;
  if (data.gherkinLevel === "advanced")
    throw new LibraryError("shared_library.advanced_unsupported");
  const before = canonical(data);

  const calls = refs(data, SHARED_REFS);
  for (const call of calls) {
    const refId = str(call, "id");
    const item = str(call, "sharedStepId");
    if (!refId || !item) continue;
    const pinned = follows(call) ? undefined : str(call, "revisionId");
    const v = lib.shared(item, pinned);
    if (!v) {
      out.missing.push(refId);
      continue;
    }
    const block = callCopy(caseId, call, v);
    placeBlock(data, listOf(call), idsOf(call, "stepIds"), block);
    setRefVersion(call, v.version, v.revisionId, v.name);
    call.stepIds = block.map((s) => s.id);
    if (!("follow" in call)) call.follow = true;
    call.list = listOf(call);
  }
  if (SHARED_REFS in data) data[SHARED_REFS] = calls;

  const params = caseParams(data);
  const bindings = refs(data, DATASET_REFS);
  for (const b of bindings) {
    const refId = str(b, "id");
    const item = str(b, "datasetId");
    if (!refId || !item || refId !== CASE_TARGET) continue;
    const pinned = follows(b) ? undefined : str(b, "revisionId");
    const v = lib.dataset(item, pinned);
    if (!v) {
      out.missing.push(refId);
      continue;
    }
    const [table, missing] = datasetTable(caseId, b, params, v);
    out.missingColumns.push(...missing);
    data.examples = table;
    setRefVersion(b, v.version, v.revisionId, v.name);
    if (!("follow" in b)) b.follow = true;
  }
  if (DATASET_REFS in data) data[DATASET_REFS] = bindings;
  const outline =
    params.length > 0 ||
    (Array.isArray(data[DATASET_REFS]) &&
      (data[DATASET_REFS] as unknown[]).length > 0);
  if (
    outline &&
    (typeof data.gherkinLevel !== "string" || data.gherkinLevel === "basic")
  ) {
    data.gherkinLevel = "outline";
  }
  out.changed = canonical(data) !== before;
  return out;
}

/** True if a following call or binding of the case is not at `version`. */
export function behind(data: Obj, itemId: string, version: number): boolean {
  return (
    [
      [SHARED_REFS, "sharedStepId"],
      [DATASET_REFS, "datasetId"],
    ] as const
  ).some(([key, field]) =>
    refs(data, key).some(
      (r) =>
        str(r, field) === itemId && follows(r) && (r.version ?? 0) !== version,
    ),
  );
}

// -------------------------------------------------------------- validation

export function validName(name: string): boolean {
  const n = name.trim();
  return (
    n.length > 0 &&
    n === name &&
    len(n) <= LIMITS.paramName &&
    !/[<>\n\r\t]/.test(n)
  );
}

function checkText(field: string, s: string, max: number) {
  if (len(s) > max) throw new LibraryError(`shared_library.too_long:${field}`);
}

function ensureId(el: Obj, used: Set<string>) {
  const id =
    typeof el.id === "string" &&
    el.id.trim() &&
    len(el.id) <= 64 &&
    !used.has(el.id)
      ? el.id
      : undefined;
  if (id) used.add(id);
  el.id = id ?? randomId(used);
}

const paramId = (name: string) => shortHash(`param:${name}`);

export function normalizeShared(definition: Json, body: Json): [Obj[], Obj[]] {
  const raw = Array.isArray(body) ? body : [];
  if (raw.length === 0) throw new LibraryError("shared_library.no_steps");
  if (raw.length > LIMITS.steps)
    throw new LibraryError("shared_library.too_many:steps");
  const used = new Set<string>();
  const found: string[] = [];
  const steps: Obj[] = [];
  for (const s of raw) {
    let m: Obj;
    if (typeof s === "string") m = { text: s };
    else if (isObject(s)) m = { ...s };
    else throw new LibraryError("shared_library.bad_step");
    const text = (str(m, "text") ?? "").trim();
    if (!text) throw new LibraryError("shared_library.empty_step");
    checkText("step", text, LIMITS.stepText);
    const expected = (str(m, "expected") ?? "").trim() || undefined;
    if (expected) checkText("expected", expected, LIMITS.stepText);
    for (const p of [
      ...placeholders(text),
      ...(expected ? placeholders(expected) : []),
    ]) {
      if (!found.includes(p)) found.push(p);
    }
    ensureId(m, used);
    const step: Obj = { id: m.id, text };
    if (expected) step.expected = expected;
    steps.push(step);
  }
  const params: Obj[] = [];
  const names: string[] = [];
  const paramIds = new Set<string>();
  for (const p of Array.isArray(definition) ? definition : []) {
    if (!isObject(p)) throw new LibraryError("shared_library.bad_param");
    const m: Obj = { ...p };
    const name = (str(m, "name") ?? "").trim();
    if (!validName(name))
      throw new LibraryError("shared_library.bad_param_name");
    if (names.includes(name))
      throw new LibraryError("shared_library.duplicate_param");
    if (typeof m.id !== "string" || !m.id.trim()) m.id = paramId(name);
    ensureId(m, paramIds);
    const param: Obj = { id: m.id, name };
    const d = str(m, "default");
    if (d) {
      checkText("default", d, LIMITS.cell);
      param.default = d;
    }
    names.push(name);
    params.push(param);
  }
  for (const name of found) {
    if (names.includes(name)) continue;
    if (!validName(name))
      throw new LibraryError("shared_library.bad_param_name");
    const m: Obj = { id: paramId(name) };
    ensureId(m, paramIds);
    params.push({ id: m.id, name });
    names.push(name);
  }
  if (params.length > LIMITS.params)
    throw new LibraryError("shared_library.too_many:params");
  return [params, steps];
}

export function normalizeDataset(definition: Json, body: Json): [Obj[], Obj[]] {
  const rawCols = Array.isArray(definition) ? definition : [];
  if (rawCols.length === 0) throw new LibraryError("shared_library.no_columns");
  if (rawCols.length > LIMITS.columns)
    throw new LibraryError("shared_library.too_many:columns");
  const ids = new Set<string>();
  const names: string[] = [];
  const cols: Obj[] = [];
  for (const c of rawCols) {
    if (!isObject(c)) throw new LibraryError("shared_library.bad_column");
    const m: Obj = { ...c };
    const name = (str(m, "name") ?? "").trim();
    if (!validName(name))
      throw new LibraryError("shared_library.bad_column_name");
    if (names.includes(name))
      throw new LibraryError("shared_library.duplicate_column");
    ensureId(m, ids);
    names.push(name);
    cols.push({ id: m.id, name });
  }
  const colIds = cols.map((c) => c.id as string);
  const rawRows = Array.isArray(body) ? body : [];
  if (rawRows.length > LIMITS.rows)
    throw new LibraryError("shared_library.too_many:rows");
  const rowIds = new Set<string>();
  const rows: Obj[] = [];
  for (const r of rawRows) {
    if (!isObject(r)) throw new LibraryError("shared_library.bad_row");
    const m: Obj = { ...r };
    ensureId(m, rowIds);
    const given = isObject(m.values) ? m.values : {};
    const values: Obj = {};
    for (const c of colIds) {
      const g = given[c];
      const v =
        typeof g === "string"
          ? g
          : g === null || g === undefined
            ? ""
            : JSON.stringify(g);
      checkText("cell", v, LIMITS.cell);
      values[c] = v;
    }
    rows.push({ id: m.id, values });
  }
  return [cols, rows];
}

export const defKey = (entity: string) =>
  entity === SHARED_STEP || entity === SHARED_STEP_REVISION
    ? "params"
    : "columns";
export const bodyKey = (entity: string) =>
  entity === SHARED_STEP || entity === SHARED_STEP_REVISION ? "steps" : "rows";

export function content(
  entity: string,
  name: string,
  definition: Json,
  body: Json,
): Obj {
  return entity === SHARED_STEP || entity === SHARED_STEP_REVISION
    ? { name, params: definition, steps: body }
    : { name, columns: definition, rows: body };
}

export function libraryRevisionId(
  entity: string,
  itemId: string,
  version: number,
  sha: string,
): string {
  const ns =
    entity === SHARED_STEP || entity === SHARED_STEP_REVISION
      ? NS_SHARED_STEP_REVISION
      : NS_DATASET_REVISION;
  return uuidV5(ns, `${itemId}:${version}:${sha}`);
}

export const shaOf = (
  entity: string,
  name: string,
  definition: Json,
  body: Json,
) => contentSha256(content(entity, name, definition, body));

export const isLibraryRevision = (entity: string) =>
  entity === SHARED_STEP_REVISION || entity === DATASET_REVISION;
