// Webhook events (INT-03, ADR-0052 §4): what a document write means for the
// outside world. Pure: the entity and its version before and after in, the
// events out. Derived on the server, where every writer passes (the web, the
// API and the desktop's `/sync/push`), so a run closed in the desktop app
// notifies too, once it syncs.
import type { DocumentWrite } from "../sync/sync.repository";

export const WEBHOOK_EVENTS = [
  "run.created",
  "run.results_uploaded",
  "run.completed",
  "cycle.closed",
  "defect.created",
  "defect.status_changed",
  "review.decided",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
/** The test event «Enviar prueba» sends; no write causes it. */
export const PING = "ping";

/** Entities whose writes may mean an event. */
export const EVENT_ENTITIES: ReadonlySet<string> = new Set(["run", "run_shard", "test_cycle", "defect", "test_case", "test_plan"]);

export interface DerivedEvent {
  type: WebhookEvent;
  projectId: string | null;
  data: Record<string, unknown>;
}

type Json = Record<string, unknown>;
const str = (p: Json | null | undefined, k: string) => (p && typeof p[k] === "string" ? (p[k] as string) : null);
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

/** The review state a case or plan records (`data.review.state` or its own
 *  `review.state`; CAS-02, PLN-08). */
const reviewState = (p: Json | null) => str(obj(obj(p?.data).review), "state") ?? str(obj(p?.review), "state");

const runRef = (p: Json, id: string) => ({ id, key: str(p, "runKey"), title: str(p, "title") });

export function deriveEvents(w: DocumentWrite): DerivedEvent[] {
  const after = w.after;
  const before = w.before && !w.before.deleted ? w.before.payload : null;
  const projectId = str(after, "projectId");
  if (w.deleted) return [];
  const out: DerivedEvent[] = [];
  const push = (type: WebhookEvent, data: Json) => out.push({ type, projectId, data });
  switch (w.entity) {
    case "run": {
      const status = str(after, "status");
      if (!before) push("run.created", { run: { ...runRef(after, w.entityId), trigger: str(after, "trigger") } });
      if (status && status !== "in_progress" && (before ? str(before, "status") === "in_progress" : true)) {
        push("run.completed", { run: { ...runRef(after, w.entityId), status } });
      }
      break;
    }
    case "run_shard":
      // A new shard: counts are added when the delivery is first sent, once
      // its results (same push or a later batch) are stored.
      push("run.results_uploaded", {
        run: { id: str(after, "runId") },
        shard: { id: w.entityId, format: str(after, "sourceFormat") },
      });
      break;
    case "test_cycle":
      if (str(after, "status") === "closed" && str(before, "status") !== "closed") {
        push("cycle.closed", { cycle: { id: w.entityId, key: str(after, "cycleKey"), title: str(after, "title") } });
      }
      break;
    case "defect": {
      const defect = { id: w.entityId, key: str(after, "defectKey") ?? str(after, "cardKey"), title: str(after, "title") };
      if (!before) push("defect.created", { defect: { ...defect, status: str(after, "status"), severity: str(after, "severity") } });
      else if (str(before, "status") !== str(after, "status")) {
        push("defect.status_changed", { defect, from: str(before, "status"), to: str(after, "status") });
      }
      break;
    }
    case "test_case":
    case "test_plan": {
      const subject = w.entity === "test_case" ? "case" : "plan";
      const ref = { id: w.entityId, key: str(after, "scenarioId") ?? str(after, "planKey"), title: str(after, "title") ?? str(after, "name") };
      if (!before) break;
      if (str(after, "status") === "approved" && str(before, "status") !== "approved") {
        push("review.decided", { subject, [subject]: ref, decision: "approved" });
      } else if (reviewState(after) === "changesRequested" && reviewState(before) !== "changesRequested") {
        push("review.decided", { subject, [subject]: ref, decision: "changes_requested" });
      }
      break;
    }
  }
  return out;
}
