// From the material to the prompt, and from the model's answer to the
// candidates of the common synthesis (IA-18 → IA-17). The model cites items by
// number; the sources are written here from the material, never by the model,
// so a source always names a file the person gave. Pure — testable.

import type { DesignExtraction, DesignPromptItem } from "@modules/ai";
import type { CandidateRequirement, RequirementSource } from "./contract";
import type { MaterialItem } from "./material";

/** The included items, numbered from 1 in the order they are sent. */
export function promptItems(items: MaterialItem[]): { prompt: DesignPromptItem[]; sent: MaterialItem[] } {
  const sent = items.filter((i) => i.included);
  return {
    sent,
    prompt: sent.map((i, n) => ({
      number: n + 1,
      kind: i.kind,
      name: i.name,
      note: i.note,
      tool: i.tool,
      ...(i.frame ? { frame: i.frame } : {}),
      ...(i.text ? { text: i.text } : {}),
      ...(i.attachment ? { attachment: i.attachment } : {}),
    })),
  };
}

type Evidence = DesignExtraction["candidates"][number]["evidence"][number];

function sourceOf(item: MaterialItem, number: number, e: Evidence): RequirementSource {
  if (item.kind === "text") {
    return {
      kind: "design",
      name: item.name,
      tool: item.tool ?? "other",
      ...(item.frame ? { frame: item.frame } : {}),
    };
  }
  return {
    kind: "image",
    name: item.name,
    index: number,
    sha256: item.sha256,
    ...(item.note.trim() ? { note: item.note.trim() } : {}),
    ...(item.kind === "pdf" && e.page ? { page: e.page } : {}),
    ...(item.kind === "image" && e.region ? { region: e.region } : {}),
  };
}

/** The model's candidates with their sources. Evidence that points at an item
 *  that was not sent is dropped; a candidate left without evidence is dropped:
 *  nothing reaches the person without a place in the material to check it. */
export function toCandidates(extraction: DesignExtraction, sent: MaterialItem[]): CandidateRequirement[] {
  const out: CandidateRequirement[] = [];
  for (const c of extraction.candidates) {
    const evidence = c.evidence.filter((e) => e.item >= 1 && e.item <= sent.length);
    if (!evidence.length) continue;
    const sources = evidence.map((e) => sourceOf(sent[e.item - 1], e.item, e));
    const quote = evidence.map((e) => e.quote?.trim()).find(Boolean);
    out.push({
      title: c.title,
      description: c.description,
      ...(c.priority ? { priority: c.priority } : {}),
      ...(c.kind ? { kind: c.kind } : {}),
      basis: c.basis,
      acceptance: c.acceptance,
      assumptions: c.assumptions,
      questions: c.questions,
      ...(quote ? { evidence: quote.slice(0, 200) } : {}),
      sources,
    });
  }
  return out;
}
