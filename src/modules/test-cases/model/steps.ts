// Stable step and row ids in the UI (DAT-02, ADR-0011). The backend (desktop
// `steps.rs`, server `stable-steps.ts`) stores `{ id, text, expected? }` steps
// and `{ id, values }` Outline rows and gives older data its ids; this module
// keeps those ids while the user edits:
//  - a new step or row gets a fresh random id (8 Crockford base32 characters);
//  - text edited in place, reordered, inserted around or deleted next to keeps
//    every other id (`reconcile*`, by aligning the texts);
//  - re-parsing Gherkin keeps the id of each step per scenario, position and
//    text (rule 9): a line whose text changed in the same place keeps its id,
//    an inserted line gets a new one.
// Readers are tolerant: a plain string (data that never went through the
// backend) is read as a step, so nothing ever renders as "[object Object]".

import type {
  ExampleRow,
  ExampleTable,
  Flow,
  Step,
  TestCaseData,
} from "./types";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A fresh id, unique against `used` when given (then added to it). */
export function newStepId(used?: Set<string>): string {
  for (;;) {
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    let acc = 0n;
    for (const b of bytes) acc = (acc << 8n) | BigInt(b);
    let id = "";
    for (let i = 7; i >= 0; i--)
      id += ALPHABET[Number((acc >> BigInt(i * 5)) & 31n)];
    if (!used || !used.has(id)) {
      used?.add(id);
      return id;
    }
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** The text of a step, whatever its shape. */
export function stepText(step: unknown): string {
  if (typeof step === "string") return step;
  if (isObject(step) && typeof step.text === "string") return step.text;
  return step == null ? "" : JSON.stringify(step);
}

/** The texts of a list of steps (tolerant). */
export function texts(steps: readonly unknown[] | undefined): string[] {
  return (steps ?? []).map(stepText);
}

/** An object of a list with a fresh id; an id it had that was not empty
 *  stays as `legacyId` (`steps.rs::set_id`). */
function withFreshId<T>(el: Record<string, unknown>, extra: T): T & { id: string } {
  const legacy = el.id !== undefined && el.id !== null && el.id !== "" && !("legacyId" in el) ? { legacyId: el.id } : {};
  return { ...el, ...legacy, ...extra, id: newStepId() };
}

/** A list of steps in the stable shape: steps keep their ids; anything else
 *  becomes a step with a fresh id. */
export function toSteps(list: unknown): Step[] {
  if (!Array.isArray(list)) return [];
  return list.map((el) =>
    isObject(el) && typeof el.text === "string" && typeof el.id === "string" && el.id
      ? (el as unknown as Step)
      : isObject(el) && typeof el.text === "string"
        ? withFreshId(el, { text: el.text })
        : { id: newStepId(), text: stepText(el) },
  );
}

/** New steps (fresh ids) from texts: a new case, an import, an AI proposal. */
export const stepsOf = (list: readonly string[]): Step[] =>
  list.map((text) => ({ id: newStepId(), text }));

/** The values of an Outline row, whatever its shape. */
export function rowValues(row: unknown): string[] {
  if (Array.isArray(row)) return row.map((c) => String(c ?? ""));
  if (isObject(row) && Array.isArray(row.values))
    return row.values.map((c) => String(c ?? ""));
  return [stepText(row)];
}

/** Outline rows in the stable shape (tolerant, like `toSteps`). */
export function toRows(list: unknown): ExampleRow[] {
  if (!Array.isArray(list)) return [];
  return list.map((row) =>
    isObject(row) && Array.isArray(row.values) && typeof row.id === "string" && row.id
      ? (row as unknown as ExampleRow)
      : isObject(row) && Array.isArray(row.values)
        ? withFreshId(row, { values: rowValues(row) })
        : { id: newStepId(), values: rowValues(row) },
  );
}

/** A table as the parsers and exports see it: rows as plain values. */
export interface TextTable {
  headers: string[];
  rows: string[][];
}

export const tableText = (
  ex: ExampleTable | TextTable | undefined,
): TextTable => ({
  headers: [...(ex?.headers ?? [])],
  rows: (ex?.rows ?? []).map(rowValues),
});

/** Dice similarity of two texts (character bigrams, case-insensitive), 0..1. */
function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = s.toLowerCase();
    const out = new Map<string, number>();
    for (let i = 0; i < t.length - 1; i++)
      out.set(t.slice(i, i + 2), (out.get(t.slice(i, i + 2)) ?? 0) + 1);
    return out;
  };
  const [x, y] = [grams(a), grams(b)];
  let common = 0;
  for (const [g, c] of x) common += Math.min(c, y.get(g) ?? 0);
  const total = Math.max(a.length - 1, 0) + Math.max(b.length - 1, 0);
  return total
    ? (2 * common) / total
    : a.toLowerCase() === b.toLowerCase()
      ? 1
      : 0;
}

/** Below it, two items of an uneven gap are not paired: a line replaced
 *  wholesale gets a new id (rule 9). The same in `steps.rs` and the server. */
export const MIN_SIMILARITY = 0.3;

/** Pairs the items of one gap between two matches: in order when both sides
 *  have as many (edited in place); otherwise the order-preserving pairing with
 *  the most similar texts (at least `MIN_SIMILARITY`), so an inserted line
 *  next to an edited one does not take the edited one's id. Writes into
 *  `out`. The same algorithm as `steps.rs::align` (shared vectors). */
function pairGap(
  prev: readonly string[],
  next: readonly string[],
  [pi, ai]: [number, number],
  [pj, aj]: [number, number],
  out: number[],
) {
  const p = ai - pi;
  const q = aj - pj;
  if (p === 0 || q === 0) return;
  if (p === q) {
    for (let k = 0; k < p; k++) out[pj + k] = pi + k;
    return;
  }
  // best[i][j]: best score pairing the first i old with the first j new.
  // Every allowed pair scores a little above 0, so as many as possible are made.
  const score = (i: number, j: number) => {
    const s = similarity(prev[pi + i - 1], next[pj + j - 1]);
    return s >= MIN_SIMILARITY ? 1e-6 + s : null;
  };
  const best: number[][] = Array.from({ length: p + 1 }, () =>
    new Array<number>(q + 1).fill(0),
  );
  for (let i = 1; i <= p; i++)
    for (let j = 1; j <= q; j++) {
      let v = Math.max(best[i - 1][j], best[i][j - 1]);
      const sc = score(i, j);
      if (sc !== null) v = Math.max(v, best[i - 1][j - 1] + sc);
      best[i][j] = v;
    }
  for (let i = p, j = q; i > 0 && j > 0;) {
    const sc = score(i, j);
    if (sc !== null && best[i][j] === best[i - 1][j - 1] + sc) {
      out[pj + j - 1] = pi + i - 1;
      i--;
      j--;
    } else if (best[i][j] === best[i - 1][j]) i--;
    else j--;
  }
}

/** For each item of `next`, the index of the `prev` item whose id it takes, or
 *  -1 for a new one. Equal keys are matched in order (longest common
 *  subsequence); between two matches, the remaining items pair up (`pairGap`),
 *  so one edited in place keeps its id and an inserted one gets a new id. */
export function align(
  prev: readonly string[],
  next: readonly string[],
): number[] {
  const n = prev.length;
  const m = next.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] =
        prev[i] === next[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const anchors: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (prev[i] === next[j]) {
      anchors.push([i, j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  const out = new Array<number>(m).fill(-1);
  let [pi, pj] = [0, 0];
  for (const [ai, aj] of [...anchors, [n, m] as [number, number]]) {
    pairGap(prev, next, [pi, ai], [pj, aj], out);
    if (ai < n) out[aj] = ai;
    [pi, pj] = [ai + 1, aj + 1];
  }
  return out;
}

/** Steps for `nextTexts` that keep the ids (and `expected`) of `prev` where
 *  `align` matches them; the others get fresh ids. */
export function reconcileSteps(
  prev: readonly Step[] | undefined,
  nextTexts: readonly string[],
): Step[] {
  const before = toSteps(prev ?? []);
  const used = new Set(before.map((s) => s.id));
  return align(texts(before), nextTexts).map((from, j) =>
    from >= 0
      ? { ...before[from], text: nextTexts[j] }
      : { id: newStepId(used), text: nextTexts[j] },
  );
}

/** Texts typed into a list field (`StepListField`): while the list keeps
 *  its length, every step keeps the id of its row, whatever the user typed
 *  (an emptied step is still that step); an insert or a delete aligns the
 *  texts (`reconcileSteps`). */
export function editStepTexts(prev: readonly Step[], nextTexts: readonly string[]): Step[] {
  if (nextTexts.length !== prev.length) return reconcileSteps(prev, nextTexts);
  return prev.map((s, i) => ({ ...s, text: nextTexts[i] }));
}

const rowKey = (values: readonly string[]) => JSON.stringify(values);

/** Rows for `nextValues` that keep the ids of `prev` (like `reconcileSteps`). */
export function reconcileRows(
  prev: readonly unknown[] | undefined,
  nextValues: readonly string[][],
): ExampleRow[] {
  const before = toRows(prev ?? []);
  const used = new Set(before.map((r) => r.id));
  return align(
    before.map((r) => rowKey(r.values)),
    nextValues.map(rowKey),
  ).map((from, j) =>
    from >= 0
      ? { ...before[from], values: nextValues[j] }
      : { id: newStepId(used), values: nextValues[j] },
  );
}

/** A parsed table with the row ids of `prev`. */
export const reconcileTable = (
  prev: ExampleTable | undefined,
  next: TextTable,
): ExampleTable => ({
  headers: next.headers,
  rows: reconcileRows(prev?.rows, next.rows),
});

/** A flow as the Gherkin parser sees it: texts and plain rows. */
export interface TextFlow {
  name: string;
  preconditions?: string[];
  steps: string[];
  expectedResult: string;
  examples?: TextTable;
  tags?: string[];
}

/** The keys of a flow the Gherkin parser gives (`TextFlow`, plus its id). */
const FLOW_PARSED_KEYS = ["id", "name", "preconditions", "steps", "expectedResult", "examples", "tags"] as const;

/** Parsed flows with the ids of `prev`: a flow is the one with the same
 *  scenario name (the first not yet taken); an unmatched flow takes the
 *  unmatched one in the same position (a renamed scenario). Inside, steps and
 *  rows keep their ids as in `reconcileSteps`; keys the parser does not know
 *  stay as they were. */
export function reconcileFlows(
  prev: readonly Flow[] | undefined,
  next: readonly TextFlow[],
): Flow[] {
  const before = [...(prev ?? [])];
  const taken = new Set<number>();
  const match = next.map((f) => {
    const i = before.findIndex((p, k) => !taken.has(k) && p.name === f.name);
    if (i >= 0) taken.add(i);
    return i;
  });
  next.forEach((_, j) => {
    if (match[j] < 0 && j < before.length && !taken.has(j)) {
      match[j] = j;
      taken.add(j);
    }
  });
  const usedFlowIds = new Set(before.map((f) => f.id));
  return next.map((f, j) => {
    const old = match[j] >= 0 ? before[match[j]] : undefined;
    // Only the keys the parser does not know survive from the old flow: what
    // it parses (a removed Examples block, removed tags) is what the Gherkin says.
    const unknown: Record<string, unknown> = { ...old };
    for (const key of FLOW_PARSED_KEYS) delete unknown[key];
    return {
      ...unknown,
      id: old?.id ?? newStepId(usedFlowIds),
      name: f.name,
      preconditions: reconcileSteps(old?.preconditions, f.preconditions ?? []),
      steps: reconcileSteps(old?.steps, f.steps),
      expectedResult: f.expectedResult,
      ...(f.examples
        ? { examples: reconcileTable(old?.examples, f.examples) }
        : {}),
      ...(f.tags ? { tags: f.tags } : {}),
    };
  });
}

/** A case's data in the stable shape, for the editor and the exports
 *  (tolerant: older or hand-made data is read without loss). */
export function withStableSteps(data: TestCaseData): TestCaseData {
  const out: TestCaseData = { ...data };
  if (data.preconditions) out.preconditions = toSteps(data.preconditions);
  if (data.steps) out.steps = toSteps(data.steps);
  if (data.background) out.background = toSteps(data.background);
  if (data.examples)
    out.examples = {
      headers: data.examples.headers ?? [],
      rows: toRows(data.examples.rows),
    };
  if (data.flows)
    out.flows = data.flows.map((f) => ({
      ...f,
      preconditions: f.preconditions
        ? toSteps(f.preconditions)
        : f.preconditions,
      steps: toSteps(f.steps),
      ...(f.examples
        ? {
            examples: {
              headers: f.examples.headers ?? [],
              rows: toRows(f.examples.rows),
            },
          }
        : {}),
    }));
  return out;
}
