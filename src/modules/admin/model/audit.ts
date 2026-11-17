// Administración › Auditoría (AUD-01, ADR-0015 «Enmienda AUD-01»): the shapes
// the desktop (`audit_read.rs`) and the server (`audit.read.ts`) return, the
// filters as they live in the URL, and the pure rules the tab, the detail and
// the export share (who an actor is, which device an event came from, the
// field diff of an event).

export interface AuditRow {
  id: string;
  at: string;
  actor: string;
  onBehalfOf: string | null;
  action: string;
  entity: string;
  entityId: string;
  entityKey: string | null;
  projectId: string | null;
  projectName: string | null;
  deviceId: string;
  /** `{ field: [before, after] }` as JSON text; null once redacted. */
  changes: string | null;
  summary: string | null;
  chainWorkspaceId: string;
  chainOwner: string;
  chainSeq: number;
  prevHash: string | null;
  hash: string;
  redactedAt: string | null;
}

export interface AuditPage {
  total: number;
  events: AuditRow[];
}

export interface AuditFacets {
  actors: string[];
  entities: string[];
  actions: string[];
  projects: { id: string; name: string | null }[];
  thisDevice: string;
}

export type ChainBreakKind = "gap" | "link" | "hash" | "changes";

export interface AuditChain {
  deviceId: string;
  chainWorkspaceId: string;
  chainOwner: string;
  count: number;
  lastAt: string | null;
  broken: {
    kind: ChainBreakKind;
    seq: number;
    expected: number | null;
    eventId: string | null;
    entityId: string | null;
  } | null;
}

export interface AuditVerify {
  chains: AuditChain[];
  thisDevice: string;
}

/** What both back ends accept. Every list is "any of". */
export interface AuditQuery {
  from?: string;
  to?: string;
  actors?: string[];
  entities?: string[];
  actions?: string[];
  projectIds?: string[];
  entityId?: string;
  search?: string;
  offset: number;
  limit: number;
}

export const AUDIT_PAGE_SIZE = 50;
/** Largest page the back ends serve; the export pages through with it. */
export const AUDIT_MAX_LIMIT = 500;
/** The export stops here; the user is told when it does. */
export const AUDIT_EXPORT_CAP = 50_000;

// ---- Filters in the URL ----------------------------------------------------

export type AuditPeriod = "today" | "7d" | "30d" | "all" | "custom";
export const AUDIT_PERIODS: AuditPeriod[] = ["today", "7d", "30d", "all", "custom"];
/** Last 30 days (user decision, 2026-11-12). */
export const DEFAULT_PERIOD: AuditPeriod = "30d";

export interface AuditFilters {
  period: AuditPeriod;
  /** Custom period, ISO days (`yyyy-mm-dd`), both inclusive. */
  from: string;
  to: string;
  actors: string[];
  entities: string[];
  actions: string[];
  projects: string[];
  search: string;
  /** One element's history. */
  entityId: string;
  /** 1-based. */
  page: number;
}

const KEYS = {
  period: "period",
  from: "from",
  to: "to",
  actors: "actor",
  entities: "entity",
  actions: "action",
  projects: "project",
  search: "q",
  entityId: "element",
  page: "page",
} as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function filtersFromParams(params: URLSearchParams): AuditFilters {
  const period = params.get(KEYS.period) as AuditPeriod | null;
  const day = (k: string) => {
    const v = params.get(k) ?? "";
    return DAY.test(v) ? v : "";
  };
  const page = Number(params.get(KEYS.page));
  return {
    period: period && AUDIT_PERIODS.includes(period) ? period : DEFAULT_PERIOD,
    from: day(KEYS.from),
    to: day(KEYS.to),
    actors: params.getAll(KEYS.actors),
    entities: params.getAll(KEYS.entities),
    actions: params.getAll(KEYS.actions),
    projects: params.getAll(KEYS.projects),
    search: params.get(KEYS.search) ?? "",
    entityId: params.get(KEYS.entityId) ?? "",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** The URL of the tab with these filters; defaults are left out. */
export function filtersToParams(f: AuditFilters): URLSearchParams {
  const p = new URLSearchParams({ tab: "audit" });
  if (f.period !== DEFAULT_PERIOD) p.set(KEYS.period, f.period);
  if (f.period === "custom") {
    if (f.from) p.set(KEYS.from, f.from);
    if (f.to) p.set(KEYS.to, f.to);
  }
  f.actors.forEach((v) => p.append(KEYS.actors, v));
  f.entities.forEach((v) => p.append(KEYS.entities, v));
  f.actions.forEach((v) => p.append(KEYS.actions, v));
  f.projects.forEach((v) => p.append(KEYS.projects, v));
  if (f.search.trim()) p.set(KEYS.search, f.search);
  if (f.entityId) p.set(KEYS.entityId, f.entityId);
  if (f.page > 1) p.set(KEYS.page, String(f.page));
  return p;
}

/** How many filters (beyond the period) narrow the list. */
export function activeFilterCount(f: AuditFilters): number {
  return (
    f.actors.length + f.entities.length + f.actions.length + f.projects.length + (f.search.trim() ? 1 : 0) + (f.entityId ? 1 : 0)
  );
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function localDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** The `[from, to)` bounds of a period in UTC ISO, from the viewer's days. */
export function periodBounds(f: Pick<AuditFilters, "period" | "from" | "to">, now: Date): { from?: string; to?: string } {
  const today = startOfDay(now);
  switch (f.period) {
    case "today":
      return { from: today.toISOString() };
    case "7d":
      return { from: addDays(today, -6).toISOString() };
    case "30d":
      return { from: addDays(today, -29).toISOString() };
    case "all":
      return {};
    case "custom":
      return {
        from: f.from ? localDay(f.from).toISOString() : undefined,
        to: f.to ? addDays(localDay(f.to), 1).toISOString() : undefined,
      };
  }
}

export function toQuery(f: AuditFilters, now: Date, limit = AUDIT_PAGE_SIZE): AuditQuery {
  return {
    ...periodBounds(f, now),
    actors: f.actors,
    entities: f.entities,
    actions: f.actions,
    projectIds: f.projects,
    entityId: f.entityId || undefined,
    search: f.search.trim() || undefined,
    offset: (f.page - 1) * limit,
    limit,
  };
}

// ---- Actors and devices ----------------------------------------------------

export type ActorKind = "user" | "agent" | "system" | "ci" | "other";

/** `user:<uuid>`, `agent:<client_id>`, `system:<component>`, `ci:<token_id>`. */
export function parseActor(actor: string): { kind: ActorKind; id: string } {
  const at = actor.indexOf(":");
  const prefix = at < 0 ? "" : actor.slice(0, at);
  const id = at < 0 ? actor : actor.slice(at + 1);
  if (prefix === "user" || prefix === "agent" || prefix === "system" || prefix === "ci") return { kind: prefix, id };
  return { kind: "other", id: actor };
}

/** The first characters of an id: enough to tell two apart. */
export const shortId = (id: string) => id.replace(/-/g, "").slice(0, 6);

export type DeviceKind = "this" | "web" | "other";

export function deviceKind(deviceId: string, thisDevice: string): DeviceKind {
  if (deviceId === "web") return "web";
  return deviceId === thisDevice ? "this" : "other";
}

// ---- Changes ---------------------------------------------------------------

export interface DiffRow {
  field: string;
  before: unknown;
  after: unknown;
}

function parseObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The field diff of an event, in field order; [] when there is none. */
export function diffRows(changes: string | null): DiffRow[] {
  const obj = parseObject(changes);
  if (!obj) return [];
  return Object.entries(obj).map(([field, pair]) =>
    Array.isArray(pair) && pair.length === 2
      ? { field, before: pair[0], after: pair[1] }
      : { field, before: undefined, after: pair },
  );
}

/** The counts of an import, a cascade or an execution, as [key, value]. */
export function summaryEntries(summary: string | null): [string, unknown][] {
  const obj = parseObject(summary);
  return obj ? Object.entries(obj) : [];
}

/** Whether a value is "nothing" (shown as «vacío»). */
export function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/** A value as text lines: a list is one line per item (steps, tags), an item
 *  with a `text` is that text, other objects are JSON. */
export function valueLines(v: unknown): string[] {
  if (isEmptyValue(v)) return [];
  if (Array.isArray(v)) return v.flatMap((item) => valueLines(item).join(" · ") || []);
  if (typeof v === "string") return v.split(/\r?\n/);
  if (typeof v === "number" || typeof v === "boolean") return [String(v)];
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["text", "action", "name", "title", "label"]) {
      if (typeof o[k] === "string") {
        const extra = typeof o.expected === "string" && o.expected ? ` → ${o.expected}` : "";
        return [`${o[k] as string}${extra}`];
      }
    }
    return [JSON.stringify(v)];
  }
  return [String(v)];
}

export interface LineDiff {
  text: string;
  /** In only one side: removed from «antes» or added in «después». */
  changed: boolean;
}

/** Both sides of a value as lines, each marked when the other side lacks it. */
export function lineDiff(before: unknown, after: unknown): { before: LineDiff[]; after: LineDiff[] } {
  const b = valueLines(before);
  const a = valueLines(after);
  const inA = new Set(a);
  const inB = new Set(b);
  return {
    before: b.map((text) => ({ text, changed: !inA.has(text) })),
    after: a.map((text) => ({ text, changed: !inB.has(text) })),
  };
}

/** One line for the list's «Cambios» column. */
export function changedFields(row: AuditRow): string[] {
  return diffRows(row.changes).map((d) => d.field);
}

/** The event a chain break points at, or null. */
export function brokenEventIds(v: AuditVerify | null): Set<string> {
  return new Set((v?.chains ?? []).flatMap((c) => (c.broken?.eventId ? [c.broken.eventId] : [])));
}

/** The readable name of an event's element: its key (ATS_014, REQ-003…);
 *  else the title or name its changes carry (after, or before for a
 *  delete); else, for a project, the project's name. Null when none is known
 *  (the screen then shows the element type). */
export function elementName(row: AuditRow): string | null {
  if (row.entityKey) return row.entityKey;
  const diff = diffRows(row.changes);
  for (const field of ["title", "name", "label", "data.title", "data.name"]) {
    const d = diff.find((x) => x.field === field);
    const v = d && (typeof d.after === "string" && d.after ? d.after : d.before);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (row.entity === "project" && row.projectName) return row.projectName;
  return null;
}

/** A field's key for its label: `data.<key>` (the first level of a JSON
 *  column, `journal::diff`) is labelled like `<key>`. */
export const fieldKey = (field: string) => (field.startsWith("data.") ? field.slice(5) : field);
