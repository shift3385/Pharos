// What a run item executes and what an attempt may point at (EJE-02, EJE-06):
// the server twin of the desktop's `runs/manual.rs::targets_of`, `row_of`,
// `runs.rs::RevisionShape`, `narrow` and `check_no_overlap`. Pure functions
// over a case revision's `data`; both sides check
// `src-tauri/tests/fixtures/execution-target-vectors.json`.

type Payload = Record<string, unknown>;

const isObj = (v: unknown): v is Payload => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const idOf = (v: unknown): string | null => (isObj(v) && typeof v.id === "string" ? v.id : null);
const ids = (v: unknown) => new Set(arr(v).map(idOf).filter((x): x is string => x !== null));

/** One thing a run item executes (`manual::ExecutionTarget`). */
export interface ExecutionTarget {
  key: string;
  flowId: string | null;
  flowName: string | null;
  exampleRowId: string | null;
  exampleRow: number | null;
  values: Record<string, unknown> | unknown[] | null;
  testKey: string;
}

/** `manual:<case>/<flow|->/<row|->` (`ids::manual_test_key`). */
export const manualTestKey = (caseId: string, flowId: string | null, rowId: string | null) =>
  `manual:${caseId}/${flowId || "-"}/${rowId || "-"}`;

/** `<flowId|->/<rowId|->`: the key of a target's draft and attempts. */
export const targetKey = (flowId: string | null, rowId: string | null) => `${flowId ?? "-"}/${rowId ?? "-"}`;

/** The object holding a flow's steps and Examples: `data` for the main flow. */
function container(data: Payload, flowId: string | null): Payload | null {
  if (flowId === null) return data;
  const f = arr(data.flows).find((x) => idOf(x) === flowId);
  return isObj(f) ? f : null;
}

const rowsOf = (c: Payload): unknown[] => arr(isObj(c.examples) ? c.examples.rows : undefined);

/** A row's values by header, or the plain list when the headers do not match. */
function rowValues(c: Payload, row: unknown): Record<string, unknown> | unknown[] {
  const values = isObj(row) ? arr(row.values) : [];
  const headers = arr(isObj(c.examples) ? c.examples.headers : undefined).filter((h): h is string => typeof h === "string");
  if (headers.length && headers.length === values.length) {
    const out: Record<string, unknown> = {};
    headers.forEach((h, i) => (out[h] = values[i]));
    return out;
  }
  return values;
}

/** The 0-based index and values of an Outline row of a flow (`manual::row_of`). */
export function rowOf(data: Payload, flowId: string | null, rowId: string) {
  const c = container(data, flowId);
  if (!c) return null;
  const rows = rowsOf(c);
  const i = rows.findIndex((r) => idOf(r) === rowId);
  return i < 0 ? null : { index: i, values: rowValues(c, rows[i]) };
}

const hasSteps = (c: Payload) => ["preconditions", "steps"].some((k) => arr(c[k]).length > 0);

/** What a run item executes, one attempt each (`manual::targets_of`). */
export function targetsOf(caseId: string, data: Payload, itemFlow: string | null, itemRow: string | null): ExecutionTarget[] {
  const flows = arr(data.flows);
  const chosen: [string | null, string | null, Payload][] = [];
  if (itemFlow !== null) {
    const c = container(data, itemFlow);
    if (c) chosen.push([itemFlow, typeof c.name === "string" ? c.name : null, c]);
  } else {
    if (flows.length === 0 || hasSteps(data) || itemRow !== null) chosen.push([null, null, data]);
    if (itemRow === null)
      for (const f of flows) {
        const id = idOf(f);
        if (id !== null && isObj(f)) chosen.push([id, typeof f.name === "string" ? f.name : null, f]);
      }
  }
  const out: ExecutionTarget[] = [];
  for (const [flowId, flowName, c] of chosen) {
    const rows = rowsOf(c);
    const target = (row: [number, unknown] | null): ExecutionTarget => {
      const rowId = row ? idOf(row[1]) : null;
      return {
        key: targetKey(flowId, rowId),
        flowId,
        flowName,
        exampleRowId: rowId,
        exampleRow: row ? row[0] : null,
        values: row ? rowValues(c, row[1]) : null,
        testKey: manualTestKey(caseId, flowId, rowId),
      };
    };
    if (itemRow !== null) {
      const i = rows.findIndex((r) => idOf(r) === itemRow);
      if (i >= 0) out.push(target([i, rows[i]]));
    } else if (rows.length === 0) out.push(target(null));
    else rows.forEach((r, i) => out.push(target([i, r])));
  }
  return out;
}

/** The step and Outline-row ids of one flow of a revision. */
export interface FlowShape {
  steps: Set<string>;
  rows: Set<string>;
}

/** `runs::RevisionShape::flow`: the main flow (null) or a flow of the case;
 *  null when the case has no such flow. */
export function flowShape(data: Payload, flowId: string | null): FlowShape | null {
  const background = ids(data.background);
  const shape = (c: Payload): FlowShape => {
    const steps = new Set(background);
    for (const k of ["preconditions", "steps"]) for (const s of ids(c[k])) steps.add(s);
    return { steps, rows: ids(isObj(c.examples) ? c.examples.rows : undefined) };
  };
  if (flowId === null) return shape(data);
  const f = arr(data.flows).find((x) => idOf(x) === flowId);
  return isObj(f) ? shape(f) : null;
}

/** The item an attempt narrows: its flow and row, and the row's index and
 *  values from the frozen revision. */
export interface Narrowed {
  flowId: string | null;
  exampleRowId: string | null;
  exampleRow: number | null;
  exampleValues: Record<string, unknown> | unknown[] | null;
}

/** Narrows an item to the target an attempt executes (`runs::narrow`):
 *  the given flow and row must be the item's own or fall inside it. Returns
 *  the narrowed item or the desktop's refusal text. */
export function narrow(
  data: Payload,
  item: { flowId: string | null; exampleRowId: string | null; exampleRow: number | null },
  flowId: string | null,
  rowId: string | null,
): Narrowed | { error: string } {
  const out: Narrowed = { ...item, exampleValues: null };
  if (item.flowId !== null && flowId !== null && item.flowId !== flowId) return { error: "target-outside-item: another flow" };
  if (item.exampleRowId !== null && rowId !== null && item.exampleRowId !== rowId)
    return { error: "target-outside-item: another row" };
  if (item.flowId === null && flowId !== null) {
    if (item.exampleRowId !== null) return { error: "target-outside-item: the item is one row" };
    out.flowId = flowId;
  }
  if (item.exampleRowId === null && rowId !== null) {
    const found = rowOf(data, out.flowId, rowId);
    if (!found) return { error: `example row not in that flow of the case revision: ${rowId}` };
    out.exampleRowId = rowId;
    out.exampleRow = found.index;
    out.exampleValues = found.values;
  }
  return out;
}

/** Whether two items of one case share a target (`runs::check_no_overlap`). */
export function overlaps(a: ExecutionTarget[], b: ExecutionTarget[]): boolean {
  const keys = new Set(a.map((t) => t.key));
  return b.some((t) => keys.has(t.key));
}
