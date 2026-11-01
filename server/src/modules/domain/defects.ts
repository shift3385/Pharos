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
import { isImported, projectLinks, type ResultLink } from "./resultLink";
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

/** What the defects of a project link to, read once (no query per link). */
export interface LinkContext {
  links: RemoteDoc[];
  byId: Map<string, RemoteDoc>;
  /** The derived link of an imported result (`resultLink.ts`); null when no
   *  link of the project reaches an imported result. */
  derive: ((result: Payload) => ResultLink) | null;
}

/** The documents a project's defects may point at, and what derives the
 *  link of its imported results, in one read per entity. The link data is
 *  read only when a link reaches an imported result, and reuses these lists
 *  (cases with their tombstones, as the resolver needs). */
export async function linkContext(tx: DomainTx, projectId: string): Promise<LinkContext> {
  const [links, allCases, requirements, results, runs] = await Promise.all([
    tx.list("defect_link", projectId),
    tx.list("test_case", projectId, { withDeleted: true }),
    tx.list("requirement", projectId),
    tx.list("result", projectId),
    tx.list("run", projectId),
  ]);
  const cases = allCases.filter((d) => !d.deleted);
  const byId = new Map<string, RemoteDoc>();
  for (const d of [...cases, ...requirements, ...results, ...runs]) byId.set(`${d.entity}:${d.entityId}`, d);
  const needed = links.some((l) => {
    const found = str(l.payload, "targetKind") === "result" && byId.get(`result:${str(l.payload, "targetId")}`);
    return !!found && isImported(found.payload);
  });
  const derive = needed ? await projectLinks(tx, projectId, { test_case: allCases, run: runs }) : null;
  return { links, byId, derive };
}

/** The case a result is the execution of: **the one place the web reads it**
 *  (as `defects::result_link` on the desktop). A manual result carries it;
 *  an imported one (with a shard) gets it from the link resolver (step 9). */
export function resultCase(ctx: LinkContext, result: RemoteDoc | undefined): string | null {
  if (!result) return null;
  if (isImported(result.payload)) return ctx.derive?.(result.payload).caseId ?? null;
  return str(result.payload, "testCaseId") || null;
}

/** A defect as the module's screens read it: its payload with its live links
 *  and the cases it reaches (direct links and the case of a linked result). */
export function withLinks(ctx: LinkContext, doc: RemoteDoc): Payload {
  const own = ctx.links.filter((l) => str(l.payload, "defectId") === doc.entityId);
  const caseIds: string[] = [];
  const out = [];
  for (const l of own) {
    const kind = str(l.payload, "targetKind");
    const target = str(l.payload, "targetId");
    const found = ctx.byId.get(`${kind}:${target}`);
    let label: string | null = null;
    let caseId: string | null = null;
    if (kind === "test_case") {
      label = found ? str(found.payload, "scenarioId") || null : null;
      caseId = target;
    } else if (kind === "requirement") {
      label = found ? str(found.payload, "requirementKey") || null : null;
    } else if (kind === "result" && found) {
      caseId = resultCase(ctx, found);
      const run = ctx.byId.get(`run:${str(found.payload, "runId")}`);
      label = `${run ? str(run.payload, "runKey") : ""} · ${str(found.payload, "caseKey") || str(found.payload, "testKey")} #${String(found.payload.attempt ?? 0)}`;
    }
    if (caseId && !caseIds.includes(caseId)) caseIds.push(caseId);
    out.push({ id: l.entityId, targetKind: kind, targetId: target, label });
  }
  return { ...doc.payload, links: out, caseIds };
}

export const newDefectId = () => randomUUID();

export type { DefectTransition };
