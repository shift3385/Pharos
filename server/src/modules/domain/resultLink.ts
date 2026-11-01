// The derived link of an imported result (ADR-0013 «Vínculo derivado», step 9):
// the server twin of the desktop's `runs/link.rs::Resolver`. An imported
// result (with a `shardId`) stores only what its report said; the case,
// revision, run item, flow, Outline row, configuration and cycle item are
// derived when read, from synced data, so every reader on every side gets the
// same link. Both implementations check `src-tauri/tests/fixtures/link-vectors.json`.
// What the server does not need is left out: step ids (only the desktop's
// run screen shows them) and key conflicts (they exist only on a device).
// A manual result (no shard) keeps the link it was written with.

import type { RemoteDoc } from "../sync/sync.repository";
import type { DomainTx } from "./domain.store";

type Payload = Record<string, unknown>;

const str = (p: Payload, k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
const strOrNull = (p: Payload, k: string) => (typeof p[k] === "string" && p[k] !== "" ? (p[k] as string) : null);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const normalizeLabel = (label: string) => label.trim().toLowerCase();

/** The project data the link reads: every list as the server stores it. */
export interface LinkData {
  caseIdPrefix: string;
  /** Live cases; a case missing here but known by its revisions is deleted. */
  cases: { id: string; scenarioId: string }[];
  revisions: {
    id: string;
    testCaseId: string;
    revision: number;
    createdAt: string;
    scenarioId: string;
    data: Payload;
  }[];
  /** In write order: the last one of a test key wins; a null case retires it. */
  mappings: { testKey: string; testCaseId: string | null }[];
  runs: { id: string; startedAt: string | null; cycleId: string | null }[];
  runItems: {
    id: string;
    runId: string;
    testCaseId: string;
    revisionId: string;
    flowId: string | null;
    exampleRowId: string | null;
  }[];
  configurations: {
    id: string;
    name: string;
    matchLabels: string[];
    archived: boolean;
  }[];
  /** In their order (position) within each cycle. */
  cycleItems: {
    id: string;
    cycleId: string;
    testCaseId: string;
    flowId: string | null;
    exampleRowId: string | null;
  }[];
}

/** What a report said about one test, as far as linking goes. */
export interface ResultFacts {
  runId: string;
  testKey: string;
  tags: string[];
  caseKey: string | null;
  name: string;
  suite: string[];
  exampleRow: number | null;
  configurationLabel: string | null;
}

export interface ResultLink {
  caseId: string | null;
  caseKey: string | null;
  revisionId: string | null;
  caseRevision: number | null;
  runItemId: string | null;
  flowId: string | null;
  exampleRowId: string | null;
  configurationId: string | null;
  cycleItemId: string | null;
  /** Why there is no case: `no-tag` | `two-case-tags` | `unknown-case`. */
  reason: string | null;
  caseDeleted: boolean;
}

/** Milliseconds of a stored time, as the desktop's `instant_ms`: RFC 3339
 *  (a time without a zone is UTC) or SQLite's `YYYY-MM-DD HH:MM:SS`. */
export function instantMs(s: string | null | undefined): number | null {
  if (!s) return null;
  let t = s.trim().replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(t)) return null;
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(t)) t += "Z";
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? null : ms;
}

/** The facts of a stored imported result (tags, name and suite live in its
 *  `attributes`, as the desktop writes them). */
export function factsOf(payload: Payload): ResultFacts {
  const attributes = (payload.attributes as Payload | undefined) ?? {};
  return {
    runId: str(payload, "runId"),
    testKey: str(payload, "testKey"),
    tags: strings(attributes.tags),
    caseKey: strOrNull(payload, "caseKey"),
    name: str(attributes, "name"),
    suite: strings(attributes.suite),
    exampleRow: typeof payload.exampleRow === "number" ? payload.exampleRow : null,
    configurationLabel: strOrNull(payload, "configurationLabel"),
  };
}

/** The project's link data from its documents (live ones, as `tx.list`). */
export function linkDataOf(
  caseIdPrefix: string,
  docs: Record<
    "test_case" | "test_case_revision" | "unlinked_mapping" | "run" | "run_item" | "configuration" | "test_cycle_item",
    RemoteDoc[]
  >,
): LinkData {
  const bySeq = (a: RemoteDoc, b: RemoteDoc) => a.seq - b.seq;
  const pos = (d: RemoteDoc) => (typeof d.payload.position === "number" ? d.payload.position : 0);
  return {
    caseIdPrefix,
    cases: docs.test_case.map((d) => ({
      id: d.entityId,
      scenarioId: str(d.payload, "scenarioId"),
    })),
    revisions: docs.test_case_revision.map((d) => ({
      id: d.entityId,
      testCaseId: str(d.payload, "testCaseId"),
      revision: typeof d.payload.revision === "number" ? d.payload.revision : 0,
      createdAt: str(d.payload, "createdAt"),
      scenarioId: str(d.payload, "scenarioId"),
      data: (d.payload.data as Payload | undefined) ?? {},
    })),
    mappings: [...docs.unlinked_mapping].sort(bySeq).map((d) => ({
      testKey: str(d.payload, "testKey"),
      testCaseId: strOrNull(d.payload, "testCaseId"),
    })),
    runs: docs.run.map((d) => ({
      id: d.entityId,
      startedAt: strOrNull(d.payload, "startedAt"),
      cycleId: strOrNull(d.payload, "cycleId"),
    })),
    runItems: [...docs.run_item]
      .sort((a, b) => pos(a) - pos(b) || bySeq(a, b))
      .map((d) => ({
        id: d.entityId,
        runId: str(d.payload, "runId"),
        testCaseId: str(d.payload, "testCaseId"),
        revisionId: str(d.payload, "testCaseRevisionId"),
        flowId: strOrNull(d.payload, "flowId"),
        exampleRowId: strOrNull(d.payload, "exampleRowId"),
      })),
    configurations: docs.configuration.map((d) => ({
      id: d.entityId,
      name: str(d.payload, "name"),
      matchLabels: strings(d.payload.matchLabels),
      archived: typeof d.payload.archivedAt === "string",
    })),
    cycleItems: [...docs.test_cycle_item]
      .sort((a, b) => pos(a) - pos(b) || (a.entityId < b.entityId ? -1 : 1))
      .map((d) => ({
        id: d.entityId,
        cycleId: str(d.payload, "cycleId"),
        testCaseId: str(d.payload, "testCaseId"),
        flowId: strOrNull(d.payload, "flowId"),
        exampleRowId: strOrNull(d.payload, "exampleRowId"),
      })),
  };
}

const EXAMPLE_TITLE = /^Example #\d+$/;
const CUCUMBER_ROW = / - #\d+\.\d+(:.*)?$/;

/** The scenario a test belongs to (as `link.rs::scenario_name`). */
export function scenarioName(name: string, suite: string[]): string {
  if (EXAMPLE_TITLE.test(name) && suite.length) return suite[suite.length - 1];
  return name.replace(CUCUMBER_ROW, "");
}

/** A resolver over one project's data: indexes built once, so a project of
 *  20 000 results resolves without a scan per result. */
export function linkResolver(data: LinkData): (f: ResultFacts) => ResultLink {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = new RegExp(`^${escape(data.caseIdPrefix)}[0-9]{1,9}$`);
  const live = new Set(data.cases.map((c) => c.id));
  const add = (m: Map<string, string[]>, k: string, id: string) => {
    if (!k) return;
    const l = m.get(k) ?? [];
    if (!l.includes(id)) l.push(id);
    m.set(k, l);
  };
  const current = new Map<string, string[]>();
  const historical = new Map<string, string[]>();
  for (const c of data.cases) add(current, c.scenarioId, c.id);
  const revisions = new Map<string, { id: string; revision: number; created: number | null; data: Payload }[]>();
  for (const r of data.revisions) {
    add(historical, r.scenarioId, r.testCaseId);
    const l = revisions.get(r.testCaseId) ?? [];
    l.push({
      id: r.id,
      revision: r.revision,
      created: instantMs(r.createdAt),
      data: r.data,
    });
    revisions.set(r.testCaseId, l);
  }
  const cmp = (a: [number, number, string], b: [number, number, string]) =>
    a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0);
  for (const l of revisions.values()) l.sort((a, b) => cmp([a.revision, 0, a.id], [b.revision, 0, b.id]));
  const mappings = new Map<string, string>();
  for (const m of data.mappings) {
    if (m.testCaseId) mappings.set(m.testKey, m.testCaseId);
    else mappings.delete(m.testKey);
  }
  const runs = new Map(data.runs.map((r) => [r.id, r]));
  const items = new Map<string, { id: string; revisionId: string }[]>();
  for (const i of data.runItems) {
    const k = JSON.stringify([i.runId, i.testCaseId, i.flowId, i.exampleRowId]);
    items.set(k, [...(items.get(k) ?? []), { id: i.id, revisionId: i.revisionId }]);
  }
  const configurations = new Map<string, string | null>();
  const configuration = (label: string | null): string | null => {
    const wanted = label ? normalizeLabel(label) : "";
    if (!wanted) return null;
    if (configurations.has(wanted)) return configurations.get(wanted) ?? null;
    const usable = data.configurations.filter((c) => !c.archived);
    const min = (ids: string[]) => (ids.length ? [...ids].sort()[0] : null);
    const found =
      min(usable.filter((c) => c.matchLabels.some((l) => normalizeLabel(l) === wanted)).map((c) => c.id)) ??
      min(usable.filter((c) => normalizeLabel(c.name) === wanted).map((c) => c.id));
    configurations.set(wanted, found);
    return found;
  };

  /** Revision current at `at` (as `revision_at`). */
  const revisionAt = (caseId: string, at: number | null) => {
    const l = revisions.get(caseId);
    if (!l?.length) return null;
    let best: (typeof l)[number] | null = null;
    if (at !== null) {
      for (const r of l) {
        if (r.created === null || r.created > at) continue;
        if (!best || cmp([r.revision, r.created, r.id], [best.revision, best.created ?? 0, best.id]) > 0) best = r;
      }
    }
    return best ?? l[0];
  };

  const casesOf = (f: ResultFacts) => {
    const found = new Set<string>();
    const unknown = new Set<string>();
    const named = [...f.tags.map((t) => t.trim().replace(/^@+/, "")), ...(f.caseKey ? [f.caseKey.trim()] : [])];
    for (const k of named.filter(Boolean)) {
      const cases = current.get(k) ?? historical.get(k);
      if (cases) cases.forEach((c) => found.add(c));
      else if (prefix.test(k)) unknown.add(k);
    }
    return { found: [...found].sort(), unknown: [...unknown].sort() };
  };

  return (f) => {
    const link: ResultLink = {
      caseId: null,
      caseKey: null,
      revisionId: null,
      caseRevision: null,
      runItemId: null,
      flowId: null,
      exampleRowId: null,
      configurationId: configuration(f.configurationLabel),
      cycleItemId: null,
      reason: null,
      caseDeleted: false,
    };
    const mapped = mappings.get(f.testKey);
    let caseId: string;
    if (mapped && (live.has(mapped) || revisions.has(mapped))) caseId = mapped;
    else {
      const { found, unknown } = casesOf(f);
      if (found.length === 0 && unknown.length === 0) return { ...link, reason: "no-tag" };
      if (found.length === 0 && unknown.length === 1) return { ...link, reason: "unknown-case", caseKey: unknown[0] };
      if (found.length !== 1 || unknown.length) return { ...link, reason: "two-case-tags" };
      caseId = found[0];
    }
    link.caseId = caseId;
    link.caseDeleted = !live.has(caseId);
    const run = runs.get(f.runId);
    const chosen = revisionAt(caseId, instantMs(run?.startedAt));
    if (!chosen) return link;
    let revisionId = chosen.id;
    let caseRevision: number | null = chosen.revision;
    let revData = chosen.data;
    const scenario = scenarioName(f.name, f.suite).trim();
    const flows = Array.isArray(revData.flows) ? (revData.flows as Payload[]) : [];
    const flow = flows.find((x) => typeof x.name === "string" && x.name.trim() === scenario);
    const flowId = flow ? str(flow, "id") || null : null;
    const scope = flowId ? flow : revData;
    const rows = ((scope?.examples as Payload | undefined)?.rows as Payload[] | undefined) ?? [];
    const rowId =
      f.exampleRow !== null && f.exampleRow >= 0 && f.exampleRow < rows.length
        ? str(rows[f.exampleRow], "id") || null
        : null;
    const item = items.get(JSON.stringify([f.runId, caseId, flowId, rowId]));
    if (item && item.length === 1) {
      if (item[0].revisionId !== revisionId) {
        const frozen = revisions.get(caseId)?.find((r) => r.id === item[0].revisionId);
        caseRevision = frozen ? frozen.revision : null;
        revData = frozen?.data ?? revData;
        revisionId = item[0].revisionId;
      }
      link.runItemId = item[0].id;
    }
    if (run?.cycleId) {
      const own = data.cycleItems.filter((i) => i.cycleId === run.cycleId && i.testCaseId === caseId);
      for (const [fl, r] of [
        [flowId, rowId],
        [flowId, null],
        [null, null],
      ] as const) {
        const hit = own.find((i) => i.flowId === fl && i.exampleRowId === r);
        if (hit) {
          link.cycleItemId = hit.id;
          break;
        }
      }
    }
    return { ...link, revisionId, caseRevision, flowId, exampleRowId: rowId };
  };
}

/** Whether a result document is imported (its link is derived, not stored). */
export const isImported = (payload: Payload) => typeof payload.shardId === "string" && payload.shardId !== "";

/** The shards superseded by a shard of the same run and file read by a newer
 *  normalizer (as `link.rs::CURRENT_SHARD`): their results are not read. */
export function supersededShards(shards: RemoteDoc[]): Set<string> {
  const newest = new Map<string, number>();
  const key = (p: Payload) => JSON.stringify([str(p, "runId"), str(p, "sourceFileSha256")]);
  const version = (p: Payload) => (typeof p.normalizerVersion === "number" ? p.normalizerVersion : 0);
  for (const s of shards) newest.set(key(s.payload), Math.max(newest.get(key(s.payload)) ?? 0, version(s.payload)));
  return new Set(shards.filter((s) => version(s.payload) < (newest.get(key(s.payload)) ?? 0)).map((s) => s.entityId));
}

/** The link of a project's imported results, read once: one list per entity. */
export async function projectLinks(tx: DomainTx, projectId: string): Promise<(result: Payload) => ResultLink> {
  const entities = [
    "test_case",
    "test_case_revision",
    "unlinked_mapping",
    "run",
    "run_item",
    "configuration",
    "test_cycle_item",
  ] as const;
  const [project, ...lists] = await Promise.all([
    tx.get("project", projectId),
    ...entities.map((e) => tx.list(e, projectId)),
  ]);
  const docs = Object.fromEntries(entities.map((e, i) => [e, lists[i]])) as Parameters<typeof linkDataOf>[1];
  const resolve = linkResolver(linkDataOf((project && str(project.payload, "caseIdPrefix")) || "ATS_", docs));
  return (result) => resolve(factsOf(result));
}
