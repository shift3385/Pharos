// Schemas of the structured AI answers (IA-05, IA-10; ADR-0023). Every answer is
// one JSON object validated here before anything reaches the user's data: an
// answer that does not match is rejected whole, never half-applied. Unknown
// keys are dropped; types, enums and lengths must match. Each list may come
// back empty with a `reason` — that is how the model declines.

import { z } from "zod";

/** One line of text: whitespace runs (newlines included) become one space, so
 *  each item stays one Gherkin step or one list row. */
const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform((s) => s.replace(/\s+/g, " "));
const reason = z.string().trim().max(1000).optional();

/** A leading Gherkin keyword the model added despite the prompt ("Given the
 *  user…", "Dado que…", "Y el usuario…"): the editor adds the keyword itself. */
const LEADING_KEYWORD = /^(given|when|then|and|but|dad[oa]s?(?:\s+que)?|cuando|entonces|y|pero)\s+/i;
export const withoutKeyword = (s: string) => s.replace(LEADING_KEYWORD, "") || s;
const step = line(500).transform(withoutKeyword);

export const CASE_PRIORITIES = ["low", "medium", "high", "critical"] as const;

/** Spanish names a model may write despite the prompt ("Alta", "crítica"). */
const PRIORITY_ALIASES: Record<string, (typeof CASE_PRIORITIES)[number]> = {
  baja: "low",
  bajo: "low",
  media: "medium",
  medio: "medium",
  alta: "high",
  alto: "high",
  critica: "critical",
  critico: "critical",
};

/** The stored priority value: case and accents ignored, Spanish mapped to English. */
const priority = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const k = v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return PRIORITY_ALIASES[k] ?? k;
}, z.enum(CASE_PRIORITIES));

/** One test scenario proposed from a requirement: Given (preconditions), When
 *  (steps) and Then (expected results), the same mapping as the case editor. */
export const generatedCaseSchema = z.object({
  title: line(200),
  description: z.string().trim().max(2000).default(""),
  priority,
  given: z.array(step).max(15).default([]),
  when: z.array(step).min(1).max(20),
  then: z.array(step).min(1).max(15),
});

export const generatedCasesSchema = z.object({
  cases: z.array(generatedCaseSchema).max(10).default([]),
  reason,
});

export const riskSuggestionsSchema = z.object({
  risks: z
    .array(z.object({ risk: line(300), mitigation: line(500) }))
    .max(10)
    .default([]),
  reason,
});

export const responsibilitySuggestionsSchema = z.object({
  responsibilities: z
    .array(z.object({ role: line(200), responsibility: line(500) }))
    .max(30)
    .default([]),
  reason,
});

/** Items for one of a plan's text lists (PLN-06): which list and the text. */
export const planListSuggestionsSchema = z.object({
  items: z
    .array(z.object({ list: z.string().trim().min(1).max(40), text: line(300) }))
    .max(16)
    .default([]),
  reason,
});

export const closureSuggestionsSchema = z.object({
  criteria: z
    .array(z.object({ criterion: line(300), metric: line(120) }))
    .max(10)
    .default([]),
  reason,
});

/** The number of a listed item, as the prompt shows it (1 is the first). */
const itemNumber = z.coerce.number().int().min(1);

/** One change to a list of the case (IA-16). `item` points at the numbered list
 *  sent to the model; whether it exists is checked in `usableProposals`. */
export const listReviewSchema = z.object({
  proposals: z
    .array(
      z.discriminatedUnion("action", [
        z.object({
          action: z.literal("add"),
          text: line(500),
          reason: line(200),
          // Where a step goes: the number it follows, 0 to go first.
          after: z.coerce.number().int().min(0).nullish(),
        }),
        z.object({ action: z.literal("rewrite"), item: itemNumber, text: line(500), reason: line(200) }),
        z.object({ action: z.literal("remove"), item: itemNumber, reason: line(200) }),
      ]),
    )
    .max(30)
    .default([]),
  reason,
});

// --- Requirements from a project (IA-17, ADR-0036) ------------------------------

/** Free text cut to `max` instead of failing the whole answer: a reason or a
 *  quote a few characters too long is still usable. */
const clipped = (max: number) =>
  z
    .string()
    .trim()
    .transform((s) => (s.length > max ? `${s.slice(0, max - 1)}…` : s));

export const REQUIREMENT_PRIORITIES = ["low", "medium", "high"] as const;

/** A requirement has three priorities: «critical» and its Spanish names map to
 *  the nearest. Anything else reads as not given. */
const requirementPriority = z.preprocess((v) => {
  if (typeof v !== "string") return undefined;
  const k = v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const mapped = PRIORITY_ALIASES[k] ?? k;
  return mapped === "critical" ? "high" : mapped;
}, z.enum(REQUIREMENT_PRIORITIES).optional().catch(undefined));

const basis = z.enum(["stated", "inferred"]).catch("inferred");
const kind = z.enum(["functional", "non-functional", "constraint"]).optional().catch(undefined);
const lineNumber = z.coerce.number().int().min(1).optional().catch(undefined);

/** One requirement a batch of project files shows (`req-extract@1`). Its
 *  `sources` are checked against what was sent in `usableCandidates`. */
export const requirementCandidateSchema = z.object({
  title: line(200),
  description: z.string().trim().min(1).max(2000),
  priority: requirementPriority,
  kind,
  basis,
  acceptance: z.array(line(300)).max(10).default([]),
  sources: z
    .array(z.object({ path: z.string().trim().min(1).max(500), startLine: lineNumber, endLine: lineNumber }))
    .min(1)
    .max(5),
  evidence: clipped(200).optional(),
});

export const requirementCandidatesSchema = z.object({
  candidates: z.array(requirementCandidateSchema).max(40).default([]),
  reason,
});

/** A candidate as the synthesis prompt numbers it: "C3", "c3" or 3. */
const candidateRef = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(/^c/i, ""));
  if (!Number.isInteger(n) || n < 1) {
    ctx.addIssue({ code: "custom", message: "not a candidate number" });
    return z.NEVER;
  }
  return n;
});
const requirementKey = z.string().trim().min(1).max(100);
/** An optional key: empty or null reads as not given. */
const optionalKey = z.preprocess(
  (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
  z.string().max(100).optional(),
);

/** The answer of `req-synthesis@1`: what to do with the candidates and the
 *  existing requirements. Keys and candidate numbers are checked against what
 *  was sent in `usableRequirementProposals` (traceability). */
export const requirementSynthesisSchema = z.object({
  proposals: z
    .array(
      z.discriminatedUnion("action", [
        z.object({
          action: z.literal("add"),
          from: z.array(candidateRef).min(1).max(20),
          title: line(200),
          description: z.string().trim().min(1).max(4000),
          priority: requirementPriority,
          reason: clipped(200),
          similarTo: optionalKey,
        }),
        z.object({
          action: z.literal("improve"),
          key: requirementKey,
          from: z.array(candidateRef).max(20).default([]),
          title: line(200).optional(),
          description: z.string().trim().min(1).max(4000).optional(),
          priority: requirementPriority,
          reason: clipped(200),
        }),
        z.object({
          action: z.literal("merge"),
          keys: z.array(requirementKey).min(2).max(10),
          keep: requirementKey,
          title: line(200).optional(),
          description: z.string().trim().min(1).max(4000).optional(),
          reason: clipped(200),
        }),
        z.object({
          action: z.literal("remove"),
          key: requirementKey,
          coveredBy: optionalKey,
          reason: clipped(200),
        }),
      ]),
    )
    .max(100)
    .default([]),
  reason,
});

export type RawRequirementCandidate = z.infer<typeof requirementCandidateSchema>;
export type RawRequirementProposal = z.infer<typeof requirementSynthesisSchema>["proposals"][number];

export type GeneratedCase = z.infer<typeof generatedCaseSchema>;
export type RiskSuggestion = z.infer<typeof riskSuggestionsSchema>["risks"][number];
export type ResponsibilitySuggestion = z.infer<typeof responsibilitySuggestionsSchema>["responsibilities"][number];
export type ClosureSuggestion = z.infer<typeof closureSuggestionsSchema>["criteria"][number];
export type PlanListSuggestion = z.infer<typeof planListSuggestionsSchema>["items"][number];
export type RawListProposal = z.infer<typeof listReviewSchema>["proposals"][number];

// --- Requirements from designs (IA-18, ADR-0037) ------------------------------

/** A region of an image, 0..1 of its size. A region outside the image is
 *  dropped, not the requirement: it only helps to find the place. */
const region = z
  .object({
    x: z.coerce.number().min(0).max(1),
    y: z.coerce.number().min(0).max(1),
    w: z.coerce.number().gt(0).max(1),
    h: z.coerce.number().gt(0).max(1),
  })
  .refine((r) => r.x + r.w <= 1.001 && r.y + r.h <= 1.001);

export const designExtractionSchema = z.object({
  screens: z
    .array(z.object({ item: itemNumber, name: line(200), purpose: line(300).optional() }))
    .max(40)
    .default([]),
  candidates: z
    .array(
      z.object({
        title: line(200),
        description: z.string().trim().min(1).max(2000),
        priority: requirementPriority,
        kind: z.enum(["functional", "non-functional", "constraint"]).optional().catch(undefined),
        basis: z.enum(["stated", "inferred"]).catch("inferred"),
        acceptance: z.array(line(300)).max(10).default([]),
        assumptions: z.array(line(300)).max(5).default([]),
        questions: z.array(line(300)).max(5).default([]),
        evidence: z
          .array(
            z.object({
              item: itemNumber,
              page: z.coerce.number().int().min(1).optional().catch(undefined),
              region: region.optional().catch(undefined),
              quote: z.string().trim().max(200).optional(),
            }),
          )
          .min(1)
          .max(5),
      }),
    )
    .max(40)
    .default([]),
  reason,
});

export type DesignExtraction = z.infer<typeof designExtractionSchema>;
