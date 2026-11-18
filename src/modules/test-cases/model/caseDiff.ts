// Field-by-field changes between two states of a case (CAS-02): what the
// reviewer sees since the last approved or sent state, and what a baseline
// comparison shows for one case. Steps and flows are matched by their stable
// ids (DAT-02), so moving a step reads as «moved», not as delete and add.

/** A text field of `data`, with its i18n key under `testCase.diff.field`. */
const TEXT_FIELDS = [
  "description",
  "mappedUseCase",
  "expectedResult",
  "testData",
  "dataRequirements",
  "environmentRequirements",
  "notes",
  "traceability",
  "featureSource",
] as const;
/** Lists of steps with ids. */
const STEP_LISTS = ["background", "preconditions", "steps"] as const;
/** Lists of plain texts. */
const TEXT_LISTS = ["postconditions", "acceptanceCriteria", "requirementKeys"] as const;

export type DiffField =
  | "title"
  | (typeof TEXT_FIELDS)[number]
  | (typeof STEP_LISTS)[number]
  | (typeof TEXT_LISTS)[number]
  | "examples"
  | "flows";

export interface FieldChange {
  field: DiffField;
  kind: "added" | "removed" | "changed" | "moved";
  /** 1-based position of a step or a list entry, for «Paso 3». */
  position?: number;
  /** A flow's name, for «Flujo alternativo: …». */
  name?: string;
  before?: string;
  after?: string;
}

type Data = Record<string, unknown>;
const asData = (v: unknown): Data => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Data) : {});
const text = (v: unknown): string => (typeof v === "string" ? v : "");

interface StepLike {
  id: string;
  text: string;
  expected: string;
}

function stepsOf(v: unknown): StepLike[] {
  if (!Array.isArray(v)) return [];
  return v.map((s, i) =>
    typeof s === "string"
      ? { id: `#${i}`, text: s, expected: "" }
      : { id: text(asData(s).id) || `#${i}`, text: text(asData(s).text), expected: text(asData(s).expected) },
  );
}

const stepText = (s: StepLike) => (s.expected ? `${s.text} → ${s.expected}` : s.text);

function diffSteps(field: DiffField, a: StepLike[], b: StepLike[], out: FieldChange[], name?: string) {
  const before = new Map(a.map((s, i) => [s.id, { s, i }]));
  const after = new Map(b.map((s, i) => [s.id, { s, i }]));
  // The order of the steps both sides keep, to tell a real move from the
  // shift an insertion or a removal causes.
  const keptA = a.filter((s) => after.has(s.id)).map((s) => s.id);
  const keptB = b.filter((s) => before.has(s.id)).map((s) => s.id);
  b.forEach((s, i) => {
    const old = before.get(s.id);
    if (!old) {
      out.push({ field, kind: "added", position: i + 1, after: stepText(s), name });
      return;
    }
    if (stepText(old.s) !== stepText(s)) {
      out.push({ field, kind: "changed", position: i + 1, before: stepText(old.s), after: stepText(s), name });
    } else if (keptA.indexOf(s.id) !== keptB.indexOf(s.id)) {
      out.push({ field, kind: "moved", position: i + 1, after: stepText(s), name });
    }
  });
  a.forEach((s, i) => {
    if (!after.has(s.id)) out.push({ field, kind: "removed", position: i + 1, before: stepText(s), name });
  });
}

function diffTextList(field: DiffField, a: unknown, b: unknown, out: FieldChange[]) {
  const before = (Array.isArray(a) ? a : []).map(text).filter((s) => s.trim());
  const after = (Array.isArray(b) ? b : []).map(text).filter((s) => s.trim());
  after.forEach((s, i) => {
    if (!before.includes(s)) out.push({ field, kind: "added", position: i + 1, after: s });
  });
  before.forEach((s, i) => {
    if (!after.includes(s)) out.push({ field, kind: "removed", position: i + 1, before: s });
  });
}

const examplesText = (v: unknown): string => {
  const e = asData(v);
  const headers = Array.isArray(e.headers) ? e.headers.map(text) : [];
  const rows = Array.isArray(e.rows) ? e.rows.map((r) => (Array.isArray(asData(r).values) ? (asData(r).values as unknown[]).map(text) : [])) : [];
  if (!headers.length && !rows.length) return "";
  return [headers, ...rows].map((r) => `| ${r.join(" | ")} |`).join("\n");
};

interface FlowLike {
  id: string;
  name: string;
  data: Data;
}

function flowsOf(v: unknown): FlowLike[] {
  if (!Array.isArray(v)) return [];
  return v.map((f, i) => ({ id: text(asData(f).id) || `#${i}`, name: text(asData(f).name), data: asData(f) }));
}

/** The changes from `a` to `b` (title and `data`). Fields outside the
 *  content (priority, custom fields, review records) are left out. */
export function diffCase(a: { title: string; data: unknown }, b: { title: string; data: unknown }): FieldChange[] {
  const out: FieldChange[] = [];
  if (a.title.trim() !== b.title.trim()) out.push({ field: "title", kind: "changed", before: a.title, after: b.title });
  const da = asData(a.data);
  const db = asData(b.data);
  for (const f of TEXT_FIELDS) {
    const before = text(da[f]).trim();
    const after = text(db[f]).trim();
    if (before === after) continue;
    out.push({
      field: f,
      kind: !before ? "added" : !after ? "removed" : "changed",
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
    });
  }
  for (const f of STEP_LISTS) diffSteps(f, stepsOf(da[f]), stepsOf(db[f]), out);
  for (const f of TEXT_LISTS) diffTextList(f, da[f], db[f], out);
  const ea = examplesText(da.examples);
  const eb = examplesText(db.examples);
  if (ea !== eb) out.push({ field: "examples", kind: !ea ? "added" : !eb ? "removed" : "changed", before: ea || undefined, after: eb || undefined });
  const fa = flowsOf(da.flows);
  const fb = flowsOf(db.flows);
  const byId = new Map(fa.map((f) => [f.id, f]));
  for (const f of fb) {
    const old = byId.get(f.id);
    if (!old) {
      out.push({ field: "flows", kind: "added", name: f.name, after: f.name });
      continue;
    }
    if (old.name !== f.name) out.push({ field: "flows", kind: "changed", name: f.name, before: old.name, after: f.name });
    diffSteps("steps", stepsOf(old.data.steps), stepsOf(f.data.steps), out, f.name);
    diffSteps("preconditions", stepsOf(old.data.preconditions), stepsOf(f.data.preconditions), out, f.name);
    const ra = text(old.data.expectedResult).trim();
    const rb = text(f.data.expectedResult).trim();
    if (ra !== rb) out.push({ field: "expectedResult", kind: "changed", name: f.name, before: ra, after: rb });
  }
  const live = new Set(fb.map((f) => f.id));
  for (const f of fa) if (!live.has(f.id)) out.push({ field: "flows", kind: "removed", name: f.name, before: f.name });
  return out;
}

// ------------------------------------------------------------ word diff

export interface DiffPart {
  op: "same" | "del" | "ins";
  text: string;
}

/** Above this many words per side, a change shows as a whole removal and a
 *  whole insertion (the table would cost more than it says). */
const MAX_WORDS = 400;

/** Word-level diff of two texts, for <del>/<ins> marks. Spaces stay with
 *  the word before them, so joining the parts gives each text back. */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.match(/\S+\s*|\s+/g) ?? [];
  const b = after.match(/\S+\s*|\s+/g) ?? [];
  if (a.length > MAX_WORDS || b.length > MAX_WORDS) {
    return [
      ...(before ? [{ op: "del" as const, text: before }] : []),
      ...(after ? [{ op: "ins" as const, text: after }] : []),
    ];
  }
  // LCS table on the trimmed words.
  const key = (w: string) => w.trim();
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = key(a[i]) === key(b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const parts: DiffPart[] = [];
  const push = (op: DiffPart["op"], t: string) => {
    const last = parts[parts.length - 1];
    if (last && last.op === op) last.text += t;
    else parts.push({ op, text: t });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (key(a[i]) === key(b[j])) {
      push("same", b[j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) push("del", a[i++]);
    else push("ins", b[j++]);
  }
  while (i < n) push("del", a[i++]);
  while (j < m) push("ins", b[j++]);
  return parts;
}
