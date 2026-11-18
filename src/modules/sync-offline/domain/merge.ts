// Field-level three-way merge of a sync conflict (SYNC-02, ADR-0051). The
// rules live in `@shared/contracts/merge-fields.json`; the desktop runs the
// same algorithm in Rust (`src-tauri/src/sync_merge.rs`) and both pass
// `@shared/contracts/fixtures/sync/merge-vectors.json`. Keep them in step.
//
// `merge(entity, base, local, remote)` takes three payloads of a live entity
// (a delete against an edit stays a conflict of the whole entity, decided by
// the caller) and returns:
//   - merged: nothing collides; `merged` is the result and `origins` says,
//     per top-level field, which side it came from;
//   - conflict: some fields collide; `conflicts` lists them by key, and the
//     same call with `choices` ({ key: "local" | "remote" }) resolves them;
//   - entity: a guard tripped (an approval against new content): the whole
//     entity is chosen, as before SYNC-02.
//
// Conflict keys: a field (`title`, `data.summary`), a group (`group:risk`), an
// element of a list by id (`data.steps#S1`, a key of it `data.steps#S1.text`)
// and a list's order (`data.steps@order`).

import rules from "@shared/contracts/merge-fields.json";

export type Side = "local" | "remote";
export type Origin = Side | "both";
export type Payload = Record<string, unknown>;

export type FieldType = "scalar" | "text" | "set" | "idList" | "object" | "map";

interface FieldSpec {
  type: FieldType;
  fields?: Record<string, FieldSpec>;
}

interface EntityRules {
  fields: Record<string, FieldSpec>;
  groups: { name: string; fields: string[] }[];
  guards: { name: string; fields: string[]; when?: string }[];
}

export interface FieldConflict {
  key: string;
  type: FieldType;
  base: unknown;
  local: unknown;
  remote: unknown;
}

export type MergeOutcome =
  | { kind: "merged"; merged: Payload; origins: Record<string, Origin> }
  | {
      kind: "conflict";
      /** With the remote value where a conflict is still open. */
      merged: Payload;
      origins: Record<string, Origin>;
      conflicts: FieldConflict[];
    }
  | { kind: "entity"; guard: string };

const RULES = rules as unknown as {
  bookkeeping: { remote: string[]; max: string[] };
  entities: Record<string, EntityRules>;
};
const NO_RULES: EntityRules = { fields: {}, groups: [], guards: [] };
const SCALAR: FieldSpec = { type: "scalar" };

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** JSON with sorted keys, `undefined` read as `null`: equality of values. */
export function canonical(v: unknown): string {
  if (v === undefined || v === null) return "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (isObject(v))
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

const eq = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** The value at a top-level path (`title`, `data.steps`). */
function at(p: Payload, path: string): unknown {
  if (!path.startsWith("data.")) return p[path];
  const data = p.data;
  return isObject(data) ? data[path.slice(5)] : undefined;
}

interface Ctx {
  choices: Record<string, Side>;
  conflicts: FieldConflict[];
}

function scalar(
  ctx: Ctx,
  key: string,
  type: FieldType,
  b: unknown,
  l: unknown,
  r: unknown,
): unknown {
  if (eq(l, r) || eq(r, b)) return l;
  if (eq(l, b)) return r;
  const choice = ctx.choices[key];
  if (choice) return choice === "local" ? l : r;
  ctx.conflicts.push({ key, type, base: b, local: l, remote: r });
  return r;
}

const asList = (v: unknown): unknown[] | null =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : null;

/** A list without order: what each side added, minus what either removed. */
function set(
  ctx: Ctx,
  key: string,
  b: unknown,
  l: unknown,
  r: unknown,
): unknown {
  const [bl, ll, rl] = [asList(b), asList(l), asList(r)];
  if (!bl || !ll || !rl) return scalar(ctx, key, "set", b, l, r);
  if (eq(l, r) || eq(r, b)) return l;
  if (eq(l, b)) return r;
  const keys = (xs: unknown[]) => new Set(xs.map(canonical));
  const [bk, lk, rk] = [keys(bl), keys(ll), keys(rl)];
  const out = ll.filter((x) => {
    const k = canonical(x);
    return !(bk.has(k) && !rk.has(k));
  });
  const seen = keys(out);
  for (const x of rl) {
    const k = canonical(x);
    if (!bk.has(k) && !lk.has(k) && !seen.has(k)) {
      out.push(x);
      seen.add(k);
    }
  }
  return out;
}

/** The ids of a list of objects with unique string ids, or null. */
function idsOf(list: unknown[]): string[] | null {
  const ids: string[] = [];
  for (const x of list) {
    if (!isObject(x) || typeof x.id !== "string" || ids.includes(x.id))
      return null;
    ids.push(x.id);
  }
  return ids;
}

/** `ids` in the order `order` has them. */
const relative = (order: string[], ids: Set<string>) =>
  order.filter((id) => ids.has(id));

function idList(
  ctx: Ctx,
  key: string,
  spec: FieldSpec,
  b: unknown,
  l: unknown,
  r: unknown,
): unknown {
  const [bl, ll, rl] = [asList(b), asList(l), asList(r)];
  const [bo, lo, ro] = [bl && idsOf(bl), ll && idsOf(ll), rl && idsOf(rl)];
  if (!bl || !ll || !rl || !bo || !lo || !ro)
    return scalar(ctx, key, "idList", b, l, r);
  if (eq(l, r) || eq(r, b)) return l;
  if (eq(l, b)) return r;
  const byId = (xs: unknown[]) =>
    new Map(xs.map((x) => [(x as { id: string }).id, x]));
  const [bm, lm, rm] = [byId(bl), byId(ll), byId(rl)];
  const kept = new Map<string, unknown>();
  for (const id of [...new Set([...bo, ...lo, ...ro])]) {
    const ek = `${key}#${id}`;
    const [be, le, re] = [bm.get(id), lm.get(id), rm.get(id)];
    if (be !== undefined) {
      if (le === undefined && re === undefined) continue;
      if (le === undefined || re === undefined) {
        // Removed on one side: gone, unless the other side changed it.
        const other = le ?? re;
        if (eq(other, be)) continue;
        const side = le === undefined ? "remote" : "local";
        const choice = ctx.choices[ek];
        if (choice === undefined) {
          ctx.conflicts.push({
            key: ek,
            type: "idList",
            base: be,
            local: le ?? null,
            remote: re ?? null,
          });
          if (re !== undefined) kept.set(id, re);
        } else if (choice === side) kept.set(id, other);
        continue;
      }
      kept.set(id, object(ctx, ek, spec.fields ?? {}, be, le, re));
      continue;
    }
    // Added: on one side, or on both (the same id means the same element).
    if (le !== undefined && re !== undefined && !eq(le, re)) {
      kept.set(id, scalar(ctx, ek, "idList", undefined, le, re));
    } else kept.set(id, le ?? re);
  }
  const ids = new Set(kept.keys());
  const [bk, lk, rk] = [
    relative(bo, ids),
    relative(lo, ids),
    relative(ro, ids),
  ];
  // Reordered: the ids a side shares with the base are not in the base's order.
  const moved = (side: string[]) => {
    const common = new Set(side.filter((id) => bm.has(id)));
    return !eq(relative(side, common), relative(bk, common));
  };
  let source = lk;
  let other = rk;
  if (moved(rk) && !moved(lk)) [source, other] = [rk, lk];
  else if (moved(lk) && moved(rk)) {
    const common = new Set(lk.filter((id) => rk.includes(id)));
    if (!eq(relative(lk, common), relative(rk, common))) {
      const ok = `${key}@order`;
      const choice = ctx.choices[ok];
      if (choice === "remote") [source, other] = [rk, lk];
      else if (!choice) {
        ctx.conflicts.push({
          key: ok,
          type: "idList",
          base: bo,
          local: lo,
          remote: ro,
        });
        [source, other] = [rk, lk];
      }
    }
  }
  const order = [...source];
  for (const [i, id] of other.entries()) {
    if (order.includes(id)) continue;
    // After the nearest element before it on its own side that is placed.
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const p = order.indexOf(other[j]);
      if (p >= 0) {
        at = p + 1;
        break;
      }
    }
    order.splice(at, 0, id);
  }
  return order.map((id) => kept.get(id));
}

/** Key by key; a key without a spec is a scalar. */
function object(
  ctx: Ctx,
  key: string,
  fields: Record<string, FieldSpec>,
  b: unknown,
  l: unknown,
  r: unknown,
  map = false,
): unknown {
  const ok = (v: unknown) => v === undefined || v === null || isObject(v);
  if (!ok(b) || !ok(l) || !ok(r))
    return scalar(ctx, key, map ? "map" : "object", b, l, r);
  if (eq(l, r) || eq(r, b)) return l;
  if (eq(l, b)) return r;
  const [bo, lo, ro] = [b, l, r].map((v) => (isObject(v) ? v : {})) as Record<
    string,
    unknown
  >[];
  const out: Record<string, unknown> = {};
  const keys = [
    ...new Set([...Object.keys(lo), ...Object.keys(ro), ...Object.keys(bo)]),
  ];
  for (const k of keys) {
    const sub = `${key}.${k}`;
    const spec: FieldSpec = map
      ? Array.isArray(lo[k]) || Array.isArray(ro[k]) || Array.isArray(bo[k])
        ? { type: "set" }
        : SCALAR
      : (fields[k] ?? SCALAR);
    const v = value(ctx, sub, spec, bo[k], lo[k], ro[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function value(
  ctx: Ctx,
  key: string,
  spec: FieldSpec,
  b: unknown,
  l: unknown,
  r: unknown,
): unknown {
  switch (spec.type) {
    case "set":
      return set(ctx, key, b, l, r);
    case "idList":
      return idList(ctx, key, spec, b, l, r);
    case "object":
      return object(ctx, key, spec.fields ?? {}, b, l, r);
    case "map":
      return object(ctx, key, {}, b, l, r, true);
    default:
      return scalar(ctx, key, spec.type, b, l, r);
  }
}

/** Every top-level path of a payload: its keys, `data` one level down. */
function paths(...ps: Payload[]): string[] {
  const out = new Set<string>();
  for (const p of ps) {
    for (const [k, v] of Object.entries(p)) {
      if (k === "data" && isObject(v))
        for (const dk of Object.keys(v)) out.add(`data.${dk}`);
      else out.add(k);
    }
  }
  return [...out];
}

const BOOKKEEPING = new Set([
  ...RULES.bookkeeping.remote,
  ...RULES.bookkeeping.max,
]);

/** The guard that trips, if any (see merge-fields.json). */
function trippedGuard(
  e: EntityRules,
  b: Payload,
  l: Payload,
  r: Payload,
): string | null {
  for (const g of e.guards) {
    const guarded = new Set(g.fields);
    const rest = paths(b, l, r).filter(
      (p) => !guarded.has(p) && !BOOKKEEPING.has(p),
    );
    const changed = (side: Payload, set: string[]) =>
      set.some((p) => !eq(at(side, p), at(b, p)));
    const gL = changed(l, g.fields);
    const gR = changed(r, g.fields);
    const oL = changed(l, rest);
    const oR = changed(r, rest);
    if (g.when !== undefined) {
      const setTo = (side: Payload) =>
        g.fields.some(
          (p) => at(side, p) === g.when && !eq(at(side, p), at(b, p)),
        );
      if ((setTo(l) && oR) || (setTo(r) && oL)) return g.name;
    } else if ((gL && !oL && oR) || (gR && !oR && oL)) return g.name;
  }
  return null;
}

export function merge(
  entity: string,
  base: Payload,
  local: Payload,
  remote: Payload,
  choices: Record<string, Side> = {},
): MergeOutcome {
  const e = RULES.entities[entity] ?? NO_RULES;
  const guard = trippedGuard(e, base, local, remote);
  if (guard) return { kind: "entity", guard };
  const ctx: Ctx = { choices, conflicts: [] };
  const origins: Record<string, Origin> = {};
  const out: Payload = {};
  const data: Record<string, unknown> = {};
  const put = (path: string, v: unknown) => {
    if (v === undefined) return;
    if (path.startsWith("data.")) data[path.slice(5)] = v;
    else out[path] = v;
  };
  const note = (path: string, b: unknown, l: unknown, r: unknown) => {
    const cl = !eq(l, b);
    const cr = !eq(r, b);
    if (cl && cr) origins[path] = "both";
    else if (cl) origins[path] = "local";
    else if (cr) origins[path] = "remote";
  };
  const grouped = new Map<string, string>();
  for (const g of e.groups) for (const f of g.fields) grouped.set(f, g.name);

  for (const g of e.groups) {
    const pick = (p: Payload) =>
      Object.fromEntries(g.fields.map((f) => [f, at(p, f) ?? null]));
    const [b, l, r] = [pick(base), pick(local), pick(remote)];
    const key = `group:${g.name}`;
    const v = scalar(ctx, key, "scalar", b, l, r) as Record<string, unknown>;
    note(key, b, l, r);
    for (const f of g.fields) {
      if ([base, local, remote].some((p) => at(p, f) !== undefined))
        put(f, v[f]);
    }
  }
  for (const path of paths(local, remote, base)) {
    if (grouped.has(path)) continue;
    const [b, l, r] = [at(base, path), at(local, path), at(remote, path)];
    if (RULES.bookkeeping.remote.includes(path)) {
      put(path, r ?? l);
      continue;
    }
    if (RULES.bookkeeping.max.includes(path)) {
      put(
        path,
        [l, r]
          .filter((x): x is string => typeof x === "string")
          .sort()
          .pop() ??
          r ??
          l,
      );
      continue;
    }
    put(path, value(ctx, path, e.fields[path] ?? SCALAR, b, l, r));
    note(path, b, l, r);
  }
  if ("data" in local || "data" in remote) out.data = data;
  return ctx.conflicts.length === 0
    ? { kind: "merged", merged: out, origins }
    : { kind: "conflict", merged: out, origins, conflicts: ctx.conflicts };
}

/** The top-level field a conflict key belongs to (`data.steps#S1.text` →
 *  `data.steps`), for grouping it in the panel. */
export function fieldOf(key: string): string {
  if (key.startsWith("group:")) return key;
  const cut = key.search(/[#@]/);
  const head = cut < 0 ? key : key.slice(0, cut);
  const parts = head.split(".");
  return parts[0] === "data" ? parts.slice(0, 2).join(".") : parts[0];
}
