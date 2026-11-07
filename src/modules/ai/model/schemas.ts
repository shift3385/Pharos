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

export type GeneratedCase = z.infer<typeof generatedCaseSchema>;
export type RiskSuggestion = z.infer<typeof riskSuggestionsSchema>["risks"][number];
export type ResponsibilitySuggestion = z.infer<typeof responsibilitySuggestionsSchema>["responsibilities"][number];
export type ClosureSuggestion = z.infer<typeof closureSuggestionsSchema>["criteria"][number];
export type RawListProposal = z.infer<typeof listReviewSchema>["proposals"][number];
