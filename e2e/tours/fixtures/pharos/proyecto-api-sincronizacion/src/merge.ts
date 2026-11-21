// Fusión a tres bandas, campo a campo (extracto para el manual).
export type Doc = Record<string, unknown>;

export interface MergeResult {
  merged: Doc;
  /** Campos que cambiaron los dos lados con valores distintos. */
  conflicts: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Fusiona `local` y `remote`, que partieron de `base`. Gana el lado que
 *  cambió un campo; si cambiaron los dos y no coinciden, es un conflicto. */
export function mergeFields(base: Doc, local: Doc, remote: Doc): MergeResult {
  const merged: Doc = { ...base };
  const conflicts: string[] = [];
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const key of keys) {
    const mine = !same(local[key], base[key]);
    const theirs = !same(remote[key], base[key]);
    if (mine && theirs && !same(local[key], remote[key])) {
      conflicts.push(key);
      merged[key] = base[key];
    } else if (mine) merged[key] = local[key];
    else if (theirs) merged[key] = remote[key];
  }
  return { merged, conflicts };
}
