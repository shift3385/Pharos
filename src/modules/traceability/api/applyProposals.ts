// Applies the requirement proposals a person accepted (IA-17, ADR-0036;
// shared with IA-18). Only what was ticked, one by one: a failure does not
// stop the rest, and a retry never repeats what was saved.

import type {
  Requirement,
  RequirementData,
  RequirementProvenance,
  RequirementSource,
} from "../model/types";
import {
  blockedByLinks,
  describedWithAcceptance,
} from "../proposals/proposals";
import type { ApplyResult, RequirementProposal } from "../proposals/types";
import { requirementApi } from "./requirementApi";

export interface ApplyProposalsInput {
  projectId: string;
  userId: string;
  accepted: readonly RequirementProposal[];
  existing: readonly Requirement[];
  /** Cases linking each requirement key: those are never deleted here. */
  linkedCases: Readonly<Record<string, number>>;
  provenance: RequirementProvenance;
  /** «Criterios de aceptación:», in the app language. */
  acceptanceHeading: string;
}

type Api = Pick<typeof requirementApi, "create" | "update" | "remove" | "get">;

const sourceKey = (s: RequirementSource) => JSON.stringify(s);

/** `data` with the AI mark (IA-01: pending review again) and the new sources
 *  added to those it had. */
function markedData(
  current: RequirementData | undefined,
  provenance: RequirementProvenance,
  sources: readonly RequirementSource[] = [],
): RequirementData {
  const known = new Set((current?.sources ?? []).map(sourceKey));
  const merged = [
    ...(current?.sources ?? []),
    ...sources.filter((s) => !known.has(sourceKey(s))),
  ];
  return {
    ...(current ?? {}),
    aiProvenance: { ...(current?.aiProvenance ?? {}), requirement: provenance },
    ...(merged.length ? { sources: merged } : {}),
  };
}

export async function applyRequirementProposals(
  input: ApplyProposalsInput,
  api: Api = requirementApi,
): Promise<ApplyResult> {
  const { projectId, userId, provenance } = input;
  const byKey = new Map(input.existing.map((r) => [r.requirementKey, r]));
  const result: ApplyResult = {
    created: 0,
    updated: 0,
    removed: 0,
    skipped: [],
    failed: [],
  };

  /** The stored requirement, if it is still as the proposal saw it. */
  async function unchanged(
    key: string,
  ): Promise<Requirement | "missing" | "changed"> {
    const seen = byKey.get(key);
    if (!seen) return "missing";
    const now = await api.get(seen.id, userId);
    if (!now) return "missing";
    return now.revision === seen.revision ? now : "changed";
  }

  for (const p of input.accepted) {
    try {
      if (blockedByLinks(p, input.linkedCases).length) {
        result.skipped.push({ id: p.id, why: "linked" });
        continue;
      }
      if (p.action === "add") {
        const saved = await api.create({
          projectId,
          userId,
          title: p.title,
          description: describedWithAcceptance(
            p.description,
            p.acceptance,
            input.acceptanceHeading,
          ),
          priority: p.priority,
          data: markedData(undefined, provenance, p.sources),
        });
        if (!saved) throw new Error("not saved");
        result.created++;
        continue;
      }
      if (p.action === "improve") {
        const current = await unchanged(p.key);
        if (typeof current === "string") {
          result.skipped.push({ id: p.id, why: current });
          continue;
        }
        const description = p.description
          ? describedWithAcceptance(
              p.description,
              p.acceptance,
              input.acceptanceHeading,
            )
          : current.description;
        const saved = await api.update(current.id, {
          projectId,
          userId,
          title: p.title ?? current.title,
          description,
          priority: p.priority ?? current.priority,
          data: markedData(current.data, provenance, p.sources),
        });
        if (!saved) throw new Error("not saved");
        result.updated++;
        continue;
      }
      if (p.action === "merge") {
        const states = await Promise.all(p.keys.map(unchanged));
        const stale = states.find(
          (s): s is "missing" | "changed" => typeof s === "string",
        );
        if (stale) {
          result.skipped.push({ id: p.id, why: stale });
          continue;
        }
        const reqs = states as Requirement[];
        const keep = reqs.find((r) => r.requirementKey === p.keep)!;
        const saved = await api.update(keep.id, {
          projectId,
          userId,
          title: p.title ?? keep.title,
          description: p.description ?? keep.description,
          priority: keep.priority,
          data: markedData(keep.data, provenance),
        });
        if (!saved) throw new Error("not saved");
        result.updated++;
        for (const r of reqs.filter((r) => r.requirementKey !== p.keep)) {
          await api.remove(r.id, userId);
          result.removed++;
        }
        continue;
      }
      const current = await unchanged(p.key);
      if (typeof current === "string") {
        result.skipped.push({ id: p.id, why: current });
        continue;
      }
      await api.remove(current.id, userId);
      result.removed++;
    } catch {
      result.failed.push(p.id);
    }
  }
  return result;
}
