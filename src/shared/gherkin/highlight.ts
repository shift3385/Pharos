// Gherkin syntax highlighting (FIX-44). Prism's grammar knows the step
// keywords of every Gherkin language and matches them after any run of
// spaces, so in «Then Se abre…» it also bolds «Se» (a Romanian keyword):
// Prism tokenises the rest of the line, « Se abre…», as a fresh piece that
// starts with a space. Pharos writes its steps with the English keywords only
// (stepText.ts), so the step keyword is one of those, and only the first word
// of the line.

import Prism from "prismjs";
import "prismjs/components/prism-gherkin";
import { GHERKIN_KEYWORDS } from "./stepText";

const STEP_KEYWORD = new RegExp(`(^[ \\t]*)(?:${GHERKIN_KEYWORDS.join("|")}|\\*)(?=[ \\t])`, "m");

/** Prism's Gherkin grammar with the step keyword limited to Given, When,
 *  Then, And, But and `*`. */
const grammar: Prism.Grammar = {
  ...Prism.languages.gherkin,
  atrule: { pattern: STEP_KEYWORD, lookbehind: true },
};

/** The highlighted HTML of a Gherkin text. */
export function highlightGherkin(code: string): string {
  return Prism.highlight(code, grammar, "gherkin");
}
