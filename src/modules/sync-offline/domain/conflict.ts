// Sync conflicts (Phase 8C, spec §9): a local pending change and a remote one
// that diverged from the same base. Resolution is per entity (decision
// 2026-08-13); the field diff below is only for display, but it is the shape a
// future field-level merge (SYNC-02) would build on.

import type { Assert, Contract, Covers } from "@shared/contracts";

export type ConflictResolution = "local" | "remote";

export interface ConflictSide {
  payload: Record<string, unknown> | null;
  revision: number;
  deleted: boolean;
  hlc: string;
}

export interface SyncConflict {
  id: string;
  entity: string;
  entityId: string;
  baseRevision: number | null;
  local: ConflictSide;
  remote: ConflictSide;
  detectedAt: string;
}

export interface FieldDiff {
  /** Payload key; nested `data` keys are prefixed, e.g. `data.steps`. */
  key: string;
  local: unknown;
  remote: unknown;
  changed: boolean;
}

/** Bookkeeping fields that always differ and say nothing to the user. */
const IGNORED = new Set([
  "id",
  "workspaceId",
  "createdAt",
  "updatedAt",
  "revision",
]);

function flatten(
  payload: Record<string, unknown> | null,
): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (IGNORED.has(k)) continue;
    if (k === "data" && v && typeof v === "object" && !Array.isArray(v)) {
      for (const [dk, dv] of Object.entries(v as Record<string, unknown>))
        out.set(`data.${dk}`, dv);
    } else {
      out.set(k, v);
    }
  }
  return out;
}

const STEP_KEYS = new Set(["data.preconditions", "data.background", "data.steps"]);

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** A step as people read it: its text, and its expected result when it has
 *  one. The id (DAT-02) says nothing to the user. */
function stepLabel(step: unknown): unknown {
  if (!isObject(step) || typeof step.text !== "string") return step;
  return typeof step.expected === "string" && step.expected
    ? `${step.text} → ${step.expected}`
    : step.text;
}

const steps = (v: unknown) => (Array.isArray(v) ? v.map(stepLabel) : v);

/** Outline rows as their values (DAT-02 rows carry an id). */
function table(v: unknown): unknown {
  if (!isObject(v) || !Array.isArray(v.rows)) return v;
  return {
    ...v,
    rows: v.rows.map((r) => (isObject(r) && Array.isArray(r.values) ? r.values : r)),
  };
}

/** The value of a field as the panel shows and compares it: steps and rows
 *  without their ids, so two versions that differ only in ids are the same. */
function forDisplay(key: string, v: unknown): unknown {
  if (STEP_KEYS.has(key)) return steps(v);
  if (key === "data.examples") return table(v);
  if (key === "data.flows" && Array.isArray(v))
    return v.map((f) =>
      isObject(f)
        ? {
            ...f,
            ...(f.preconditions ? { preconditions: steps(f.preconditions) } : {}),
            ...(f.steps ? { steps: steps(f.steps) } : {}),
            ...(f.examples ? { examples: table(f.examples) } : {}),
          }
        : f,
    );
  return v;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Side-by-side field list of both versions, local field order first. Steps
 *  and Outline rows are shown and compared without their ids (DAT-02). */
export function diffConflict(c: SyncConflict): FieldDiff[] {
  const local = flatten(c.local.deleted ? null : c.local.payload);
  const remote = flatten(c.remote.deleted ? null : c.remote.payload);
  const keys = [...new Set([...local.keys(), ...remote.keys()])];
  return keys.map((key) => {
    const l = forDisplay(key, local.get(key));
    const r = forDisplay(key, remote.get(key));
    return { key, local: l, remote: r, changed: !same(l, r) };
  });
}

/** Human label for the entity: its title (plan, case) or name (project). */
export function conflictTitle(c: SyncConflict): string {
  for (const side of [c.local, c.remote]) {
    const p = side.payload ?? {};
    const label = (p.title ?? p.name) as unknown;
    if (typeof label === "string" && label.trim()) return label;
  }
  return c.entityId;
}

// The Rust contract (BASE-05, ADR-0026): `tsc` fails if these stop matching
// the Rust types they are read from or sent to.
export type _RustContract = [Assert<Covers<Contract.Conflict, SyncConflict>>];
