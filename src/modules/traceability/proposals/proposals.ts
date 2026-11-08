// The answer of the common synthesis (`req-synthesis@1`), checked against
// what was sent: the model is asked for all of this, but cannot be trusted to
// (as `usableProposals` in IA-16). Pure — testable.

import type { RawRequirementProposal } from "@modules/ai";
import type {
  Requirement,
  RequirementPriority,
  RequirementSource,
} from "../model/types";
import type {
  CandidateRequirement,
  ProposalSupport,
  RequirementProposal,
} from "./types";

const norm = (text: string) =>
  text
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Words that say little about what a requirement is about. */
const STOP = new Set(
  (
    "el la los las un una unos unas de del al a en y o u que se su sus por para con sin es " +
    "debe deben sistema the a an of to in and or that shall must should system be is for with " +
    "on by as its it"
  ).split(" "),
);

const words = (text: string) =>
  new Set(
    norm(text)
      .split(" ")
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );

/** Jaccard similarity of the meaningful words of two texts, 0..1. */
export function similarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / (x.size + y.size - shared);
}

/** Above this, a new requirement is flagged as alike to an existing one. */
export const SIMILAR_TITLE = 0.6;

/** The existing requirement most alike to `title`, if alike enough. */
export function mostSimilar(
  title: string,
  existing: readonly Requirement[],
): string | undefined {
  let best: { key: string; score: number } | undefined;
  for (const r of existing) {
    const score = similarity(title, r.title);
    if (score >= SIMILAR_TITLE && (!best || score > best.score))
      best = { key: r.requirementKey, score };
  }
  return best?.key;
}

const sourceId = (s: RequirementSource) =>
  s.kind === "file"
    ? `file:${s.path}:${s.startLine ?? ""}:${s.endLine ?? ""}`
    : s.kind === "image"
      ? `image:${s.index}:${s.page ?? ""}:${s.name}`
      : `design:${s.tool ?? ""}:${s.nodeId ?? s.frame ?? s.name}`;

const unique = <T>(items: T[], key: (item: T) => string) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

const RANK: Record<RequirementPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/** What the candidates of a proposal bring: their sources, basis (stated if
 *  any of them is), acceptance criteria, assumptions and questions. */
export function supportOf(
  from: readonly CandidateRequirement[],
): ProposalSupport {
  const all = <K extends "acceptance" | "assumptions" | "questions">(
    k: K,
    max: number,
  ) => {
    const items = unique(
      from.flatMap((c) => c[k] ?? []),
      (s) => norm(s),
    ).slice(0, max);
    return items.length ? items : undefined;
  };
  const support: ProposalSupport = {
    sources: unique(
      from.flatMap((c) => c.sources),
      sourceId,
    ).slice(0, 20),
  };
  if (from.length)
    support.basis = from.some((c) => c.basis === "stated")
      ? "stated"
      : "inferred";
  const acceptance = all("acceptance", 10);
  const assumptions = all("assumptions", 5);
  const questions = all("questions", 5);
  if (acceptance) support.acceptance = acceptance;
  if (assumptions) support.assumptions = assumptions;
  if (questions) support.questions = questions;
  return support;
}

/** The highest priority among the candidates (medium when none says). */
const priorityOf = (
  given: RequirementPriority | undefined,
  from: readonly CandidateRequirement[],
) =>
  given ??
  from.reduce<RequirementPriority | undefined>(
    (best, c) =>
      c.priority && (!best || RANK[c.priority] > RANK[best])
        ? c.priority
        : best,
    undefined,
  ) ??
  "medium";

/** The proposals that can be shown and applied:
 *  - candidate numbers and keys must exist in what was sent;
 *  - at most one proposal touches each existing requirement;
 *  - a new one whose title the list (or an earlier proposal) already has goes;
 *  - an improvement that changes nothing goes;
 *  - a merge needs two existing keys and keeps one of them;
 *  - `similarTo` and `coveredBy` point at existing keys, or are dropped.
 *  New ones without `similarTo` get one if a title is alike enough. */
export function usableRequirementProposals(
  raw: readonly RawRequirementProposal[],
  candidates: readonly CandidateRequirement[],
  existing: readonly Requirement[],
): RequirementProposal[] {
  const byKey = new Map(existing.map((r) => [r.requirementKey, r]));
  const titles = new Set(existing.map((r) => norm(r.title)));
  const claimed = new Set<string>();
  const known = (key: string | undefined) =>
    key && byKey.has(key) ? key : undefined;
  const fromOf = (refs: number[]) =>
    unique(refs, String)
      .map((n) => candidates[n - 1])
      .filter((c): c is CandidateRequirement => c !== undefined);

  const out: RequirementProposal[] = [];
  raw.forEach((p, id) => {
    switch (p.action) {
      case "add": {
        const from = fromOf(p.from);
        const title = p.title.trim();
        if (!from.length || titles.has(norm(title))) return;
        titles.add(norm(title));
        const similarTo = known(p.similarTo) ?? mostSimilar(title, existing);
        out.push({
          id,
          action: "add",
          title,
          description: p.description,
          priority: priorityOf(p.priority, from),
          reason: p.reason,
          ...(similarTo ? { similarTo } : {}),
          ...supportOf(from),
        });
        return;
      }
      case "improve": {
        const current = byKey.get(p.key);
        if (!current || claimed.has(p.key)) return;
        const title =
          p.title && p.title !== current.title ? p.title : undefined;
        const description =
          p.description && p.description !== current.description
            ? p.description
            : undefined;
        const priority =
          p.priority && p.priority !== current.priority
            ? p.priority
            : undefined;
        if (!title && !description && !priority) return;
        if (
          title &&
          norm(title) !== norm(current.title) &&
          titles.has(norm(title))
        )
          return;
        claimed.add(p.key);
        out.push({
          id,
          action: "improve",
          key: p.key,
          revision: current.revision,
          ...(title ? { title } : {}),
          ...(description ? { description } : {}),
          ...(priority ? { priority } : {}),
          reason: p.reason,
          ...supportOf(fromOf(p.from)),
        });
        return;
      }
      case "merge": {
        const keys = unique(p.keys, String).filter(
          (k) => byKey.has(k) && !claimed.has(k),
        );
        if (keys.length < 2 || !keys.includes(p.keep)) return;
        keys.forEach((k) => claimed.add(k));
        out.push({
          id,
          action: "merge",
          keys,
          keep: p.keep,
          ...(p.title ? { title: p.title } : {}),
          ...(p.description ? { description: p.description } : {}),
          reason: p.reason,
        });
        return;
      }
      case "remove": {
        if (!byKey.has(p.key) || claimed.has(p.key)) return;
        claimed.add(p.key);
        const coveredBy =
          p.coveredBy !== p.key ? known(p.coveredBy) : undefined;
        out.push({
          id,
          action: "remove",
          key: p.key,
          ...(coveredBy ? { coveredBy } : {}),
          reason: p.reason,
        });
        return;
      }
    }
  });
  return out;
}

/** The keys a proposal would delete: the merged-away ones, or the removed one. */
export function deletedKeys(p: RequirementProposal): string[] {
  if (p.action === "merge") return p.keys.filter((k) => k !== p.keep);
  if (p.action === "remove") return [p.key];
  return [];
}

/** Why a proposal cannot be applied from the review: it deletes requirements
 *  that test cases still link (their links would point at nothing). */
export function blockedByLinks(
  p: RequirementProposal,
  linkedCases: Readonly<Record<string, number>>,
): string[] {
  return deletedKeys(p).filter((k) => (linkedCases[k] ?? 0) > 0);
}

/** The description that is stored: the proposal's own, then its acceptance
 *  criteria under a heading (the requirement has no field of its own for them). */
export function describedWithAcceptance(
  description: string,
  acceptance: readonly string[] | undefined,
  heading: string,
) {
  if (!acceptance?.length) return description;
  return `${description.trim()}\n\n${heading}\n${acceptance.map((a) => `- ${a}`).join("\n")}`;
}
