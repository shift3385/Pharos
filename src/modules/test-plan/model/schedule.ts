// Schedule of a plan (step 14, RED-W5): ids of sprints and milestones, ISO /
// dd/mm/aaaa dates, and the rules the Cronograma checks. Pure functions.
//
// Ids. Sprints are `{id, name, start, end}` and milestones `{id, name, date}`,
// dates ISO `YYYY-MM-DD`. Plans saved before 0.2.0 have no ids. Rust and the
// server keep a plan's `data` as an opaque blob and never read these lists, so
// the ids are given on read, here, by the one function both clients (desktop
// and web) go through (`normalizeSchedule`, called by `formState`). An
// element without a unique id gets one derived from what identifies its slot,
// `crockford32(fmix64(fnv1a64("<planId>:<list>:<index>")))` (8 characters, retrying
// with `:<n>` appended while taken), so every device reads an unsaved legacy
// plan with the same ids; the first save persists them. A new row gets a
// random id instead (`newScheduleId`): a derived one could be the id a deleted
// row had in that slot, and an id is never reused within a plan (the DAT-02
// rule, ADR-0011). Nothing is lost: unknown fields stay, a bare string is a
// row with that name (anything else, its JSON), and a date that is not ISO stays as
// written (the row shows it as invalid; the calendar does not draw it).

import type { ScheduleMilestone, ScheduleSprint } from "./types";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = (1n << 64n) - 1n;

/** 8 Crockford base32 characters from the top 40 bits of `acc` (64 bits). */
function crockford40(acc: bigint): string {
  const top = acc >> 24n;
  let id = "";
  for (let i = 7; i >= 0; i--) id += ALPHABET[Number((top >> BigInt(i * 5)) & 31n)];
  return id;
}

/** FNV-1a, 64 bits, over the UTF-8 bytes of `input`. */
export function fnv1a64(input: string): bigint {
  let h = FNV_OFFSET;
  for (const b of new TextEncoder().encode(input)) {
    h ^= BigInt(b);
    h = (h * FNV_PRIME) & MASK64;
  }
  return h;
}

/** MurmurHash3's 64-bit finalizer: FNV alone barely moves the top bits when
 *  only the last character differs (slot 0, 1, 2…). */
export function fmix64(h: bigint): bigint {
  h ^= h >> 33n;
  h = (h * 0xff51afd7ed558ccdn) & MASK64;
  h ^= h >> 33n;
  h = (h * 0xc4ceb9fe1a85ec53n) & MASK64;
  return h ^ (h >> 33n);
}

/** The derived id of slot `index` of `list`, not yet in `used` (then added). */
export function deriveScheduleId(
  planId: string,
  list: "sprints" | "milestones",
  index: number,
  used: Set<string>,
): string {
  const base = `${planId}:${list}:${index}`;
  for (let n = 0; ; n++) {
    const id = crockford40(fmix64(fnv1a64(n === 0 ? base : `${base}:${n}`)));
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
}

/** A fresh random id, unique against `used` when given (then added to it). */
export function newScheduleId(used?: Set<string>): string {
  for (;;) {
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    let acc = 0n;
    for (const b of bytes) acc = (acc << 8n) | BigInt(b);
    const id = crockford40(acc << 24n);
    if (!used || !used.has(id)) {
      used?.add(id);
      return id;
    }
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string =>
  typeof v === "string" ? v : v === undefined || v === null ? "" : JSON.stringify(v);

function normalizeList<T extends { id: string }>(
  planId: string | null,
  list: "sprints" | "milestones",
  raw: unknown,
  shape: (o: Record<string, unknown>) => Omit<T, "id">,
  emptyFrom: (text: string) => Omit<T, "id">,
  used: Set<string>,
): T[] {
  if (!Array.isArray(raw)) return [];
  const items = raw.map((el) => (isObject(el) ? { ...el, ...shape(el) } : emptyFrom(str(el))));
  // First pass keeps every unique id, so a later repeat never steals it.
  const keep = items.map((el) => {
    const id = (el as Record<string, unknown>).id;
    if (typeof id !== "string" || !id || used.has(id)) return null;
    used.add(id);
    return id;
  });
  return items.map(
    (el, i) =>
      ({
        ...el,
        id: keep[i] ?? (planId ? deriveScheduleId(planId, list, i, used) : newScheduleId(used)),
      }) as T,
  );
}

/** Sprints and milestones of stored plan data with an id each (see the file
 *  comment). `planId` null (an import, a new plan) gives random ids. Ids are
 *  unique across both lists. */
export function normalizeSchedule(
  planId: string | null,
  data: { sprints?: unknown; milestones?: unknown },
): { sprints: ScheduleSprint[]; milestones: ScheduleMilestone[] } {
  const used = new Set<string>();
  const sprints = normalizeList<ScheduleSprint>(
    planId,
    "sprints",
    data.sprints,
    (o) => ({ name: str(o.name), start: str(o.start), end: str(o.end) }),
    (text) => ({ name: text, start: "", end: "" }),
    used,
  );
  const milestones = normalizeList<ScheduleMilestone>(
    planId,
    "milestones",
    data.milestones,
    (o) => ({ name: str(o.name), date: str(o.date) }),
    (text) => ({ name: text, date: "" }),
    used,
  );
  return { sprints, milestones };
}

// ---- Dates ----------------------------------------------------------------

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` of a local date. */
export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The local date of an ISO day, or null when `s` is not a real ISO day. */
export function parseIso(s: string): Date | null {
  const m = ISO.exec(s);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
}

export const isIsoDay = (s: string): boolean => parseIso(s) !== null;

/** `dd/mm/aaaa` of an ISO day; anything else is returned as written. */
export function toDisplay(iso: string): string {
  const m = ISO.exec(iso);
  return m && isIsoDay(iso) ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** The ISO day of `d/m/yyyy` or `dd/mm/aaaa` (also with `-` or `.`), or null. */
export function fromDisplay(s: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(s);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return d.getMonth() === +m[2] - 1 && d.getDate() === +m[1] ? isoOf(d) : null;
}

/** `iso` plus `n` days. */
export function addDays(iso: string, n: number): string {
  const d = parseIso(iso) ?? new Date();
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

/** Days from `a` to `b` (same day = 0). */
export function daysBetween(a: string, b: string): number {
  const da = parseIso(a);
  const db = parseIso(b);
  if (!da || !db) return 0;
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) -
    Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 864e5);
}

/** A sprint the calendar can draw: both dates ISO and in order. */
export function isDrawable(s: ScheduleSprint): boolean {
  return isIsoDay(s.start) && isIsoDay(s.end) && s.start <= s.end;
}

// ---- Rules ----------------------------------------------------------------

/** For each sprint id, the name of a drawable sprint it overlaps (if any). */
export function overlaps(sprints: readonly ScheduleSprint[]): Map<string, string> {
  const out = new Map<string, string>();
  const ok = sprints.filter(isDrawable);
  for (const a of ok)
    for (const b of ok)
      if (a !== b && a.start <= b.end && b.start <= a.end && !out.has(a.id)) out.set(a.id, b.name);
  return out;
}

/** Inclusive length of a sprint in days (0 when it can't be drawn). */
export function sprintDays(s: ScheduleSprint): number {
  return isDrawable(s) ? daysBetween(s.start, s.end) + 1 : 0;
}

/** «Sprint N+1», N the highest number in the names (else the count). */
export function nextSprintName(sprints: readonly ScheduleSprint[], word: string): string {
  let max = 0;
  for (const s of sprints) {
    const m = /(\d+)/.exec(s.name);
    if (m && new RegExp(`^\\s*${word}\\s+\\d+`, "i").test(s.name)) max = Math.max(max, +m[1]);
  }
  return `${word} ${max ? max + 1 : sprints.length + 1}`;
}

/** Range of «Siguiente sprint»: the day after the latest sprint end (today
 *  when there is none), lasting `days`. */
export function nextSprintRange(
  sprints: readonly ScheduleSprint[],
  days: number,
  today: string,
): { start: string; end: string } {
  const ends = sprints.filter(isDrawable).map((s) => s.end);
  const start = ends.length ? addDays(ends.reduce((m, e) => (e > m ? e : m)), 1) : today;
  return { start, end: addDays(start, Math.max(1, days) - 1) };
}
