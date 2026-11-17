// «Historial de revisiones» of the exported test plan (PLN-02): one row per
// person and day, oldest first, built from what each save left behind.
//
// Sources (oldest to newest):
//  - the revision copies of the desktop (`test_plan_revisions`): each one is
//    the state a save overwrote, written with the time of that save and who
//    made it, so revision N and the next copy (or the plan itself) are the
//    before and after of one save. They cover the saves made before 0.2.0;
//  - the audit events of the plan (ADR-0015), from its first one on: who, when
//    and `{ field: [before, after] }`, with the version and the status. The
//    web's edits reach the desktop as events, and the web has only these.
// A save that changed nothing but the version is not a revision.
import { parseStamp } from "@shared/time/stamp";
import type { ExportTable } from "@shared/export/extraTables";
import { STEP_IDS, type StepId } from "../ui/wizard/steps";
import { testPlanApi } from "../api/testPlanApi";
import type {
  PlanHistoryRevision,
  PlanHistorySource,
  TestPlan,
  TestPlanData,
} from "../model/types";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** One save of the plan, as far as the sources tell. */
export interface PlanSave {
  at: Date;
  /** Account id of who saved ('' when unknown). */
  actor: string;
  /** The save created the plan. */
  created: boolean;
  /** Wizard steps whose content it changed. */
  sections: StepId[];
  /** It moved the plan to «Aprobado». */
  approved: boolean;
  /** It changed something no step names (an unknown field). */
  other: boolean;
  /** Version and status after the save; null when unknown. */
  version: string | null;
  status: string | null;
  /** Version and status before it, when the event says (to fill the save
   *  before, which the revision copies leave without them). */
  versionBefore?: string | null;
  statusBefore?: string | null;
}

/** One row of the history: the last save of one person on one day. */
export interface HistoryRow {
  /** Time of that last save. */
  at: Date;
  /** `YYYY-MM-DD` in the time zone of whoever exports. */
  day: string;
  actor: string;
  version: string | null;
  status: string | null;
  created: boolean;
  /** Steps that person changed that day, in wizard order. */
  sections: StepId[];
  approved: boolean;
  other: boolean;
}

/** Step of each field of a plan (`data.<key>` for the content). */
const FIELD_STEP: Record<string, StepId> = {
  title: "identification",
  planDate: "identification",
  author: "identification",
  "data.summary": "summary",
  "data.scopeIn": "scope",
  "data.scopeOut": "scope",
  "data.testTypes": "levelsTypes",
  "data.methodologyType": "methodology",
  "data.sprintWeeks": "methodology",
  "data.ceremonies": "methodology",
  "data.ceremonyFrequency": "methodology",
  "data.phases": "methodology",
  "data.testLevels": "levelsTypes",
  "data.deliverables": "deliverables",
  "data.environmentConfig": "environment",
  "data.environmentRequirements": "environment",
  "data.tools": "tools",
  "data.automationStrategy": "tools",
  "data.testDataManagement": "testData",
  "data.defectManagement": "defects",
  "data.roles": "roles",
  "data.sprints": "schedule",
  "data.milestones": "schedule",
  "data.risks": "risks",
  "data.communicationPlan": "communication",
  "data.closureCriteria": "closure",
  "data.purpose": "purpose",
  "data.conclusion": "conclusion",
  "data.documentId": "identification",
  "data.assumptions": "assumptions",
  "data.constraints": "assumptions",
  "data.techniques": "techniques",
  "data.independence": "roles",
  "data.independenceNote": "roles",
  "data.training": "roles",
  "data.estimation": "estimation",
  "data.entryCriteria": "entry",
  "data.suspensionCriteria": "entry",
  "data.resumptionCriteria": "entry",
  "data.metrics": "metrics",
};

/** Fields that are never a revision of their own: the version goes up on
 *  every save (also one without changes), the rest is bookkeeping or the
 *  review marks of AI drafts. */
const IGNORED = new Set([
  "version",
  "status",
  "id",
  "workspaceId",
  "projectId",
  "createdAt",
  "updatedAt",
  "revision",
  "deleted",
  "data.aiProvenance",
  // Who approved: the status change already says it (PLN-07).
  "data.approval",
]);

const APPROVED = "approved";

/** What a set of changed fields says about a save. */
function describe(
  fields: Iterable<string>,
  statusChange: [unknown, unknown] | undefined,
): Pick<PlanSave, "sections" | "approved" | "other"> {
  const sections = new Set<StepId>();
  let other = false;
  for (const field of fields) {
    if (IGNORED.has(field)) continue;
    const step = FIELD_STEP[field];
    if (step) sections.add(step);
    else other = true;
  }
  let approved = false;
  if (statusChange && statusChange[0] !== statusChange[1]) {
    if (statusChange[1] === APPROVED) approved = true;
    // Another status is set in «Identificación del plan».
    else sections.add("identification");
  }
  return { sections: STEP_IDS.filter((s) => sections.has(s)), approved, other };
}

/** JSON with sorted keys, so two copies of the same content compare equal. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}

/** Fields that differ between two copies of a plan's title and content. */
function copyDiff(
  before: { title: string; data: Record<string, unknown> },
  after: { title: string; data: Record<string, unknown> },
): string[] {
  const fields: string[] = [];
  if (before.title !== after.title) fields.push("title");
  const keys = new Set([
    ...Object.keys(before.data ?? {}),
    ...Object.keys(after.data ?? {}),
  ]);
  for (const key of keys) {
    if (
      canonical(before.data?.[key] ?? null) !==
      canonical(after.data?.[key] ?? null)
    ) {
      fields.push(`data.${key}`);
    }
  }
  return fields;
}

const accountOf = (actor: string) =>
  actor.startsWith("user:") ? actor.slice(5) : "";
const text = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const valid = (d: Date) => !Number.isNaN(d.getTime());

/** The plan's saves, oldest first: the revision copies until the first audit
 *  event (they overlap from there: a save writes both), then the events of a
 *  person (`user:`). `current` is the plan as it is now, the «after» of the
 *  newest copy. */
export function planSaves(
  source: PlanHistorySource,
  current: { title: string; data: TestPlanData | Record<string, unknown> },
): PlanSave[] {
  const events = source.events
    .filter(
      (e) =>
        (e.action === "create" || e.action === "update") && accountOf(e.actor),
    )
    .map((e) => ({ ...e, date: parseStamp(e.at) }))
    .filter((e) => valid(e.date))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  // A copy is written in the same transaction as its event, with a time
  // truncated to the second (SQLite `datetime('now')`).
  const firstEvent = events.length
    ? Math.floor(events[0].date.getTime() / 1000) * 1000
    : Infinity;
  const saves: PlanSave[] = [];

  if (!events.some((e) => e.action === "create")) {
    const at = parseStamp(source.createdAt);
    if (valid(at) && at.getTime() < firstEvent) {
      saves.push({
        at,
        actor: source.createdBy,
        created: true,
        sections: [],
        approved: false,
        other: false,
        version: null,
        status: null,
      });
    }
  }

  const copies = [...source.revisions].sort((a, b) => a.revision - b.revision);
  const now = {
    title: current.title,
    data: current.data as Record<string, unknown>,
  };
  copies.forEach((copy: PlanHistoryRevision, i) => {
    const at = parseStamp(copy.createdAt);
    if (!valid(at) || at.getTime() >= firstEvent) return;
    const after = copies[i + 1] ?? now;
    saves.push({
      at,
      actor: copy.createdBy,
      created: false,
      ...describe(copyDiff(copy, after), undefined),
      version: null,
      status: null,
    });
  });

  for (const e of events) {
    const changes = e.changes ?? {};
    const version = changes.version;
    const status = changes.status;
    const created = e.action === "create";
    // A creation lists every field it filled: the row says «Creación del
    // plan» instead. A redacted event (no changes) still was a save.
    const what = created
      ? { sections: [], approved: status?.[1] === APPROVED, other: false }
      : e.changes === null
        ? { sections: [], approved: false, other: true }
        : describe(Object.keys(changes), status);
    saves.push({
      at: e.date,
      actor: accountOf(e.actor),
      created,
      ...what,
      version: text(version?.[1]),
      status: text(status?.[1]),
      versionBefore: created ? null : text(version?.[0]),
      statusBefore: created ? null : text(status?.[0]),
    });
  }
  saves.sort((a, b) => a.at.getTime() - b.at.getTime());

  // The version and status of a save the sources leave without them: the
  // «before» of the next event, else what the last save left.
  for (let i = saves.length - 2; i >= 0; i -= 1) {
    const next = saves[i + 1];
    saves[i].version ??= next.versionBefore ?? null;
    saves[i].status ??= next.statusBefore ?? null;
  }
  for (let i = 1; i < saves.length; i += 1) {
    saves[i].version ??= saves[i - 1].version;
    saves[i].status ??= saves[i - 1].status;
  }
  return saves;
}

/** Whether a save changed the plan (a save without changes only bumps the
 *  version). */
export const isRevision = (s: PlanSave) =>
  s.created || s.approved || s.other || s.sections.length > 0;

/** `YYYY-MM-DD` and `HH:mm` of an instant in a time zone (the exporter's
 *  own when none is given). */
export function localStamp(
  at: Date,
  timeZone?: string,
): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

/** One row per person and day: that person's last save of the day, with
 *  every step they changed that day. Rows go by the time of that last save,
 *  oldest first (the newest revision is the bottom row). Saves without
 *  changes do not count. */
export function groupHistory(
  saves: readonly PlanSave[],
  timeZone?: string,
): HistoryRow[] {
  const groups = new Map<string, HistoryRow>();
  for (const save of saves) {
    if (!isRevision(save)) continue;
    const { day } = localStamp(save.at, timeZone);
    const key = `${day}\u0000${save.actor}`;
    const row = groups.get(key);
    if (!row) {
      groups.set(key, {
        at: save.at,
        day,
        actor: save.actor,
        version: save.version,
        status: save.status,
        created: save.created,
        sections: [...save.sections],
        approved: save.approved,
        other: save.other,
      });
      continue;
    }
    const sections = new Set([...row.sections, ...save.sections]);
    if (save.at.getTime() >= row.at.getTime()) {
      row.at = save.at;
      row.version = save.version;
      row.status = save.status;
    }
    row.created ||= save.created;
    row.approved ||= save.approved;
    row.other ||= save.other;
    row.sections = STEP_IDS.filter((s) => sections.has(s));
  }
  return [...groups.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** «Creación del plan, Alcance, Riesgos · Aprobado». */
export function changesText(row: HistoryRow, t: Translate): string {
  const parts = [
    ...(row.created ? [t("testPlan.history.created")] : []),
    ...row.sections.map((s) => t(`testPlan.step.${s}`)),
  ];
  if (parts.length === 0 && row.other)
    parts.push(t("testPlan.history.otherChanges"));
  const list = parts.join(", ");
  if (!row.approved) return list;
  const approved = t("testPlan.history.approved");
  return list ? `${list} · ${approved}` : approved;
}

/** Who each row names: the official name (first and last name of the
 *  profile, never the alias) of a known account, else the plan's author,
 *  else a neutral text. */
export interface HistoryPeople {
  /** Account id → official name. */
  names: Record<string, string>;
  /** The plan's `author`, for an account whose name is not known here. */
  fallback?: string;
}

/** The «Historial de revisiones» table of the export (EXP-03 shape: a sheet of
 *  its own in the .xlsx, a section in the PDF). */
export function historyTable(
  rows: readonly HistoryRow[],
  people: HistoryPeople,
  t: Translate,
  timeZone?: string,
): ExportTable {
  const name = (actor: string) =>
    people.names[actor]?.trim() ||
    people.fallback?.trim() ||
    t("testPlan.history.unknownAuthor");
  const headers = [
    t("testPlan.version"),
    t("testPlan.date"),
    t("testPlan.history.reviewedBy"),
    t("testPlan.status"),
    t("testPlan.history.changes"),
  ];
  const body = rows.map((r) => {
    const { day, time } = localStamp(r.at, timeZone);
    return [
      r.version ?? "—",
      `${day} ${time}`,
      name(r.actor),
      r.status ? t(`testPlan.statusLabel.${r.status}`) : "—",
      changesText(r, t),
    ];
  });
  return {
    name: t("testPlan.history.title"),
    headers,
    widths: [10, 18, 28, 14, 60],
    rows: body,
    pdf: { headers, rows: body, widths: ["9%", "17%", "22%", "12%", "40%"] },
  };
}

/** Reads a saved plan's history and builds its table (null when the plan is
 *  not there). A failure to read it fails the export, like its cycles: a
 *  document that silently left the history out would mislead. */
export async function loadHistoryTable(
  plan: Pick<TestPlan, "id" | "title" | "data" | "author">,
  userId: string,
  names: Record<string, string>,
  t: Translate,
  timeZone?: string,
): Promise<ExportTable | null> {
  const source = await testPlanApi.history(plan.id, userId);
  if (!source) return null;
  const rows = groupHistory(planSaves(source, plan), timeZone);
  return historyTable(rows, { names, fallback: plan.author }, t, timeZone);
}
