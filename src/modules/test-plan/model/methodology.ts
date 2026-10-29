// Methodology of a plan (spec §5.1 step 8): agile (sprint length + ceremonies,
// each with its frequency, PLN-01) or traditional (phases). The composed line is
// what the .xlsx and .pdf exports print; the wizard and the batch export share it.
import {
  CEREMONIES,
  CEREMONY_FREQUENCIES,
  DEFAULT_CEREMONY_FREQUENCY,
} from "./catalogs";
import type { TestPlanData } from "./types";

type Translate = (key: string) => string;

/** The frequency of `ceremony`: the stored one, else the industry default. */
export function frequencyOf(
  ceremony: string,
  stored?: Record<string, string>,
): string {
  const value = stored?.[ceremony];
  if (value && CEREMONY_FREQUENCIES.includes(value)) return value;
  return DEFAULT_CEREMONY_FREQUENCY[ceremony] ?? "perSprint";
}

/** The frequencies to store: one per selected ceremony (defaults filled in). */
export function frequenciesFor(
  ceremonies: string[],
  stored?: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(ceremonies.map((c) => [c, frequencyOf(c, stored)]));
}

/** The methodology line of the exports, e.g. "Agile · Sprint length (weeks): 2 ·
 *  Agile events: Daily (every day), Review (once per sprint)". */
export function methodologyText(
  d: Pick<
    TestPlanData,
    | "methodologyType"
    | "sprintWeeks"
    | "ceremonies"
    | "ceremonyFrequency"
    | "phases"
  >,
  t: Translate,
): string {
  if ((d.methodologyType ?? "agile") !== "agile") {
    const phases = (d.phases ?? []).filter((p) => p.trim()).join(", ");
    return `${t("testPlan.traditional")} · ${t("testPlan.phases")}: ${phases}`;
  }
  const ceremonies = (d.ceremonies ?? []).map((c) => {
    const label = CEREMONIES.includes(c) ? t(`testPlan.ceremonyLabel.${c}`) : c;
    const freq = t(
      `testPlan.frequencyLabel.${frequencyOf(c, d.ceremonyFrequency)}`,
    );
    return `${label} (${freq})`;
  });
  return (
    `${t("testPlan.agile")} · ${t("testPlan.sprintWeeks")}: ${d.sprintWeeks ?? ""} · ` +
    `${t("testPlan.ceremonies")}: ${ceremonies.join(", ")}`
  );
}
