// Defects on the web (DEF-01, ADR-0016): the rules of the desktop's
// `defects.rs` applied to the server's document store. Payloads have exactly
// the shape the desktop pushes (`defects.rs::read_payload`), so either side
// can edit what the other wrote. Evidence stays on the desktop (SYNC-04b), and
// so does creating a defect from a result with its attachments.

import { randomUUID } from "node:crypto";
import { AppError } from "../auth/errors";
import type { RemoteDoc } from "../sync/sync.repository";
import { linkId, needsResolution, transitionAllowed } from "../sync/defects";
import type { DomainTx } from "./domain.store";
import type { DefectInput, DefectTransition, LinkTargetInput } from "./domain.schemas";

type Payload = Record<string, unknown>;

export const DEFECT_PREFIX = "DEF-";
export const DEFECT_DIGITS = 3;

const str = (p: Payload, key: string) => (typeof p[key] === "string" ? (p[key] as string) : "");
const opt = (v: string | null | undefined) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

const bad = (code: string, message: string) => new AppError(400, code, message);

/** The status and resolution a change may store: the lifecycle, and a
 *  resolution with `closed`/`rejected` only (`lifecycle.rs::check`). */
export function checkStatus(from: string, to: string, resolution: string | null | undefined): string | null {
  if (!transitionAllowed(from, to)) throw bad("defect_transition", `defect-transition: ${from} → ${to}`);
  if (!needsResolution(to)) return null;
  if (!resolution) throw bad("defect_resolution_required", "defect-resolution-required");
  return resolution;
}

/** The editable fields of a defect payload from an input. */
export function editable(input: DefectInput): Payload {
  return {
    title: input.title.trim(),
    description: input.description ?? "",
    stepsToReproduce: input.stepsToReproduce ?? "",
    expected: opt(input.expected),
    actual: opt(input.actual),
    severity: input.severity ?? "major",
    priority: input.priority ?? "medium",
    foundInRunId: opt(input.foundInRunId),
    foundInBuild: opt(input.foundInBuild),
    foundInEnvironment: opt(input.foundInEnvironment),
    fixedInBuild: opt(input.fixedInBuild),
    assignee: opt(input.assignee),
    externalSystem: opt(input.externalSystem),
    externalKey: opt(input.externalKey),
    externalUrl: opt(input.externalUrl),
    data: input.data,
  };
}

/** A target of the project a link may point at (`defects.rs::check_target`). */
export async function checkTarget(tx: DomainTx, projectId: string, t: LinkTargetInput): Promise<void> {
  const entity = { test_case: "test_case", requirement: "requirement", result: "result" }[t.targetKind as string];
  if (!entity) throw bad("defect_link_target", `${t.targetKind} links arrive with 0.4.0/0.5.0`);
  const doc = await tx.get(entity, t.targetId);
  if (!doc || (doc.deleted && entity !== "result") || str(doc.payload, "projectId") !== projectId) {
    throw new AppError(404, "not_found", `${t.targetKind} not found.`);
  }
}

/** Writes or revives a link; false if it was already live. */
export async function putLink(
  tx: DomainTx,
  defect: Payload,
  t: LinkTargetInput,
  at: string,
): Promise<boolean> {
  const id = linkId(str(defect, "id"), t.targetKind, t.targetId);
  const doc = await tx.get("defect_link", id);
  if (doc && !doc.deleted) return false;
  const payload = {
    id,
    workspaceId: str(defect, "workspaceId"),
    projectId: str(defect, "projectId"),
    defectId: str(defect, "id"),
    targetKind: t.targetKind,
    targetId: t.targetId,
    createdAt: doc ? str(doc.payload, "createdAt") || at : at,
    updatedAt: at,
  };
  await tx.put("defect_link", id, payload, doc, false, { audit: "folded" });
  return true;
}

/** Tombstones a live link; false if there was none. */
export async function dropLink(tx: DomainTx, id: string): Promise<boolean> {
  const doc = await tx.get("defect_link", id);
  if (!doc || doc.deleted) return false;
  await tx.put("defect_link", id, doc.payload, doc, true, { audit: "folded" });
  return true;
}

/** A defect as the module's screens read it: its payload with its live links
 *  and the cases it reaches (direct links and the case of a linked result). */
export async function withLinks(tx: DomainTx, doc: RemoteDoc, links: RemoteDoc[]): Promise<Payload> {
  const own = links.filter((l) => str(l.payload, "defectId") === doc.entityId);
  const caseIds: string[] = [];
  const out = [];
  for (const l of own) {
    const kind = str(l.payload, "targetKind");
    const target = str(l.payload, "targetId");
    let label: string | null = null;
    if (kind === "test_case") {
      const c = await tx.get("test_case", target);
      label = c ? str(c.payload, "scenarioId") || null : null;
      if (!caseIds.includes(target)) caseIds.push(target);
    } else if (kind === "requirement") {
      const r = await tx.get("requirement", target);
      label = r ? str(r.payload, "requirementKey") || null : null;
    } else if (kind === "result") {
      const r = await tx.get("result", target);
      const caseId = r ? str(r.payload, "testCaseId") : "";
      if (caseId && !caseIds.includes(caseId)) caseIds.push(caseId);
      if (r) {
        const run = await tx.get("run", str(r.payload, "runId"));
        label = `${run ? str(run.payload, "runKey") : ""} · ${str(r.payload, "caseKey") || str(r.payload, "testKey")} #${String(r.payload.attempt ?? 0)}`;
      }
    }
    out.push({ id: l.entityId, targetKind: kind, targetId: target, label });
  }
  return { ...doc.payload, links: out, caseIds };
}

export const newDefectId = () => randomUUID();

export type { DefectTransition };
