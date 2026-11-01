// What a web change changed, by the desktop journal's rules
// (`journal.rs::diff` and `location`), so a web event reads like a desktop one.

type Json = unknown;
type Obj = Record<string, Json>;

/** Payload keys that are bookkeeping, not content: never a diff of their own. */
const BOOKKEEPING = new Set(["revision", "updatedAt", "createdAt"]);

const isObj = (v: Json): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** An own key only: a payload key such as `__proto__` or `constructor` is
 *  data, never something inherited. */
const own = (o: Obj, key: string): Json => (Object.hasOwn(o, key) ? o[key] : undefined);

/** Structural JSON equality: key order does not matter (serde_json `Value`
 *  equality). */
export function jsonEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => jsonEqual(x, b[i]));
  }
  if (!isObj(a) || !isObj(b)) return false;
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => Object.hasOwn(b, k) && jsonEqual(a[k], b[k]));
}

const sortedKeys = (...objs: Obj[]) => [...new Set(objs.flatMap((o) => Object.keys(o)))].sort();

/** `{ field: [before, after] }` between two snapshots; `data` is compared one
 *  level down (`data.<key>`). A create has every field as `[null, after]`, a
 *  delete every field as `[before, null]`. Keys come out sorted, as the
 *  desktop writes them. */
export function diff(before: Obj | null, after: Obj | null): Obj {
  const b = before ?? {};
  const a = after ?? {};
  // Written with defineProperty: a `__proto__` field stays a field.
  const out: Obj = {};
  const put = (key: string, value: [Json, Json]) =>
    Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true });
  for (const key of sortedKeys(b, a)) {
    if (BOOKKEEPING.has(key)) continue;
    const [bv, av] = [own(b, key), own(a, key)];
    if (key === "data" && (bv === undefined || isObj(bv)) && (av === undefined || isObj(av))) {
      const bd = (bv ?? {}) as Obj;
      const ad = (av ?? {}) as Obj;
      for (const dk of sortedKeys(bd, ad)) {
        const [x, y] = [own(bd, dk), own(ad, dk)];
        if (!jsonEqual(x, y)) put(`data.${dk}`, [x ?? null, y ?? null]);
      }
      continue;
    }
    if (!(bv === undefined && av === undefined) && !jsonEqual(bv, av)) put(key, [bv ?? null, av ?? null]);
  }
  return out;
}

const strField = (v: Obj | null, key: string): string | null =>
  v && typeof own(v, key) === "string" && v[key] !== "" ? (v[key] as string) : null;

/** Project and human key of an entity, from either snapshot. */
export function location(entity: string, id: string, before: Obj | null, after: Obj | null) {
  const either = (key: string) => strField(after, key) ?? strField(before, key);
  return {
    projectId: entity === "project" ? id : either("projectId"),
    entityKey:
      either("scenarioId") ??
      either("requirementKey") ??
      either("cardKey") ??
      either("runKey") ??
      either("defectKey"),
  };
}
