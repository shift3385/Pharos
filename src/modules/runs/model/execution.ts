// Manual step-by-step execution (EJE-02): pure helpers of the executor. The
// draft of one target is the UI's own shape; Rust only stores it
// (`runs/manual.rs`, `execution_drafts`) and never reads inside it.

import type {
  ExecutionTarget,
  ResultInput,
  StepResultInput,
} from "@shared/contracts/contract";

export const STEP_STATUSES = ["passed", "failed", "blocked", "skipped"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

/** A step of the frozen revision as the executor shows it. */
export interface ExecStep {
  id: string;
  text: string;
  expected?: string;
  /** Where it comes from: Background, the flow's preconditions or steps. */
  section: "background" | "preconditions" | "steps";
}

/** What the user marked on one step. */
export interface StepDraft {
  status?: StepStatus;
  /** «Resultado obtenido / notas» → `step_results.actual`. */
  actual?: string;
}

/** The draft of one target (one attempt in progress). */
export interface TargetDraft {
  /** The attempt's id, chosen here: the result gets it, so recording twice
   *  (or retrying) writes one attempt, and a stale draft is refused. */
  attemptId: string;
  steps: Record<string, StepDraft>;
  /** The result status the user chose; unset = derived from the steps. */
  status?: StepStatus;
  notes: string;
  /** When the attempt started (first opened). */
  startedAt: string;
  /** Timer: time counted so far, and since when it runs (unset = paused). */
  elapsedMs: number;
  runningSince?: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function stepList(v: unknown, section: ExecStep["section"]): ExecStep[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((s, i) => {
    if (typeof s === "string") return [{ id: `#${section}-${i}`, text: s, section }];
    if (!isObj(s) || typeof s.text !== "string") return [];
    return [
      {
        id: typeof s.id === "string" ? s.id : `#${section}-${i}`,
        text: s.text,
        expected:
          typeof s.expected === "string" && s.expected.trim()
            ? s.expected
            : undefined,
        section,
      },
    ];
  });
}

/** The steps a target executes, in Gherkin order: the Background, then the
 *  flow's (or the main flow's) preconditions and steps. */
export function stepsOf(revision: Obj, flowId: string | null): ExecStep[] {
  const background = stepList(revision.background, "background");
  const flow =
    flowId === null
      ? revision
      : (Array.isArray(revision.flows)
          ? revision.flows.find((f) => isObj(f) && f.id === flowId)
          : undefined) ?? {};
  const f = isObj(flow) ? flow : {};
  return [
    ...background,
    ...stepList(f.preconditions, "preconditions"),
    ...stepList(f.steps, "steps"),
  ];
}

/** The expected result of the whole flow (or of the case), if any. */
export function expectedOf(revision: Obj, flowId: string | null): string | null {
  const flow =
    flowId === null
      ? revision
      : Array.isArray(revision.flows)
        ? revision.flows.find((f) => isObj(f) && f.id === flowId)
        : undefined;
  const e = isObj(flow) ? flow.expectedResult : undefined;
  return typeof e === "string" && e.trim() ? e : null;
}

/** `<param>` replaced by the Outline row's value (by header). */
export function fill(text: string, values: ExecutionTarget["values"]): string {
  if (!values || Array.isArray(values)) return text;
  return text.replace(/<([^<>]+)>/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole,
  );
}

/** A row label: «user=ana · card=visa», or the plain values. */
export function rowLabel(values: ExecutionTarget["values"]): string {
  if (!values) return "";
  if (Array.isArray(values)) return values.join(" · ");
  return Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join(" · ");
}

export function newDraft(now: Date): TargetDraft {
  return {
    attemptId: crypto.randomUUID(),
    steps: {},
    notes: "",
    startedAt: now.toISOString(),
    elapsedMs: 0,
  };
}

/** A stored draft as the executor's shape; anything else is a new draft.
 *  A timer that was running when the app closed comes back paused, with the
 *  time it had run until the draft was last saved (`savedAt`). */
export function parseDraft(v: unknown, now: Date, savedAt?: string): TargetDraft {
  if (!isObj(v)) return newDraft(now);
  const elapsed = typeof v.elapsedMs === "number" && v.elapsedMs >= 0 ? v.elapsedMs : 0;
  const since = typeof v.runningSince === "string" ? Date.parse(v.runningSince) : NaN;
  const saved = savedAt ? Date.parse(savedAt) : NaN;
  const ran = Number.isNaN(since) || Number.isNaN(saved) ? 0 : Math.max(0, saved - since);
  const steps: Record<string, StepDraft> = {};
  if (isObj(v.steps)) {
    for (const [id, s] of Object.entries(v.steps)) {
      if (!isObj(s)) continue;
      steps[id] = {
        status: STEP_STATUSES.includes(s.status as StepStatus)
          ? (s.status as StepStatus)
          : undefined,
        actual: typeof s.actual === "string" ? s.actual : undefined,
      };
    }
  }
  return {
    attemptId: typeof v.attemptId === "string" && v.attemptId ? v.attemptId : crypto.randomUUID(),
    steps,
    status: STEP_STATUSES.includes(v.status as StepStatus)
      ? (v.status as StepStatus)
      : undefined,
    notes: typeof v.notes === "string" ? v.notes : "",
    startedAt:
      typeof v.startedAt === "string" ? v.startedAt : now.toISOString(),
    elapsedMs: elapsed + ran,
  };
}

/** Time on the timer at `now`. */
export function elapsedAt(d: TargetDraft, now: Date): number {
  if (!d.runningSince) return d.elapsedMs;
  const since = Date.parse(d.runningSince);
  return d.elapsedMs + (Number.isNaN(since) ? 0 : Math.max(0, now.getTime() - since));
}

export function toggleTimer(d: TargetDraft, now: Date): TargetDraft {
  return d.runningSince
    ? { ...d, elapsedMs: elapsedAt(d, now), runningSince: undefined }
    : { ...d, runningSince: now.toISOString() };
}

/** mm:ss, or h:mm:ss from one hour. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** The result status the steps give: any failed → failed; else any blocked
 *  → blocked; else any passed → passed; else skipped. Unmarked steps count
 *  as skipped. */
export function derivedStatus(steps: ExecStep[], d: TargetDraft): StepStatus {
  const s = steps.map((x) => d.steps[x.id]?.status ?? "skipped");
  if (s.includes("failed")) return "failed";
  if (s.includes("blocked")) return "blocked";
  if (s.includes("passed")) return "passed";
  return "skipped";
}

export const resultStatus = (steps: ExecStep[], d: TargetDraft): StepStatus =>
  d.status ?? derivedStatus(steps, d);

/** Steps with no mark yet (they are recorded as skipped). */
export const unmarked = (steps: ExecStep[], d: TargetDraft): number =>
  steps.filter((x) => !d.steps[x.id]?.status).length;

/** The next step without a mark after `from`, wrapping; -1 if none. */
export function nextUnmarked(steps: ExecStep[], d: TargetDraft, from: number): number {
  for (let k = 1; k <= steps.length; k++) {
    const i = (from + k) % steps.length;
    if (!d.steps[steps[i].id]?.status) return i;
  }
  return -1;
}

const MAX_MESSAGE = 500;

/** The attempt to record from a draft (`execution_record`). No
 *  configuration label: a manual result is identified by the run's
 *  `configuration_id`, whose name can be edited. */
export function toResultInput(
  runItemId: string,
  target: ExecutionTarget,
  steps: ExecStep[],
  d: TargetDraft,
  userId: string,
  now: Date,
): ResultInput {
  const status = resultStatus(steps, d);
  const stepInputs: StepResultInput[] = steps.map((s) => {
    const sd = d.steps[s.id];
    const actual = sd?.actual?.trim();
    return {
      stepId: s.id.startsWith("#") ? undefined : s.id,
      text: fill(s.text, target.values),
      status: sd?.status ?? "skipped",
      ...(actual ? { actual } : {}),
    };
  });
  const firstFailure = steps
    .map((s) => d.steps[s.id])
    .find((x) => x?.status === "failed" && x.actual?.trim())?.actual?.trim();
  const message =
    status === "failed" || status === "blocked"
      ? (firstFailure ?? d.notes.trim()) || undefined
      : undefined;
  const notes = d.notes.trim();
  return {
    runItemId,
    flowId: target.flowId ?? undefined,
    exampleRowId: target.exampleRowId ?? undefined,
    attemptId: d.attemptId,
    status,
    durationMs: Math.round(elapsedAt(d, now)) || undefined,
    startedAt: d.startedAt,
    finishedAt: now.toISOString(),
    errorMessage: message ? message.slice(0, MAX_MESSAGE) : undefined,
    attributes: notes ? { notes } : {},
    steps: stepInputs,
    userId,
  };
}

/** Keyboard commands of the executor (shown in «Atajos»). */
export type Command =
  | { kind: "mark"; status: StepStatus }
  | { kind: "move"; by: 1 | -1 }
  | { kind: "notes" }
  | { kind: "timer" }
  | { kind: "save" }
  | { kind: "nextItem" }
  | { kind: "help" };

const LETTERS: Record<string, StepStatus> = {
  p: "passed",
  f: "failed",
  b: "blocked",
  s: "skipped",
};

/** The command of a key press, or null. Letters only act outside fields. */
export function commandOf(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
  inField: boolean,
): Command | null {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === "Enter") return { kind: "save" };
  if (mod && e.shiftKey && e.key.toLowerCase() === "n") return { kind: "nextItem" };
  if (inField || mod || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (LETTERS[k] && !e.shiftKey) return { kind: "mark", status: LETTERS[k] };
  if (k === "j" || e.key === "ArrowDown") return { kind: "move", by: 1 };
  if (k === "k" || e.key === "ArrowUp") return { kind: "move", by: -1 };
  if (k === "n") return { kind: "notes" };
  if (k === "t") return { kind: "timer" };
  if (e.key === "?") return { kind: "help" };
  return null;
}

/** The attempts of one target among an item's results. */
export function attemptsOf<
  R extends { effectiveFlowId: string | null; effectiveExampleRowId: string | null },
>(results: R[], target: ExecutionTarget): R[] {
  return results.filter(
    (r) =>
      (r.effectiveFlowId ?? null) === (target.flowId ?? null) &&
      (r.effectiveExampleRowId ?? null) === (target.exampleRowId ?? null),
  );
}
