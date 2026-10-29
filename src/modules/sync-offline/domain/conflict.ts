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

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Side-by-side field list of both versions, local field order first. */
export function diffConflict(c: SyncConflict): FieldDiff[] {
  const local = flatten(c.local.deleted ? null : c.local.payload);
  const remote = flatten(c.remote.deleted ? null : c.remote.payload);
  const keys = [...new Set([...local.keys(), ...remote.keys()])];
  return keys.map((key) => {
    const l = local.get(key);
    const r = remote.get(key);
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
