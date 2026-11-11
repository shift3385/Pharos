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

type TranslateCount = (key: string, opts?: Record<string, unknown>) => string;

/** The methodology of the PDF, one entry per line (PLN-05):
 *  «Ágil» · «Duración de sprint: 2 semanas» · «Reuniones del equipo: Diaria»
 *  · «Revisión: 1 vez por sprint» · …. A ceremony whose name already says how
 *  often it is held (the daily, every day) goes on the «Reuniones del equipo»
 *  line by name; every other ceremony gets a line with its frequency. The
 *  .xlsx keeps `methodologyText`, the line its import reads back. */
export function methodologyLines(
  d: Pick<
    TestPlanData,
    | "methodologyType"
    | "sprintWeeks"
    | "ceremonies"
    | "ceremonyFrequency"
    | "phases"
  >,
  t: TranslateCount,
): string[] {
  if ((d.methodologyType ?? "agile") !== "agile") {
    const phases = (d.phases ?? []).filter((p) => p.trim()).join(", ");
    return [
      t("testPlan.traditional"),
      ...(phases ? [`${t("testPlan.phases")}: ${phases}`] : []),
    ];
  }
  const out = [t("testPlan.agile")];
  if (d.sprintWeeks) {
    out.push(
      t("testPlan.methodologyLines.sprintLength", { count: d.sprintWeeks }),
    );
  }
  const implied: string[] = [];
  const withFrequency: string[] = [];
  for (const c of d.ceremonies ?? []) {
    const label = CEREMONIES.includes(c) ? t(`testPlan.ceremonyLabel.${c}`) : c;
    const freq = frequencyOf(c, d.ceremonyFrequency);
    if (c === "daily" && freq === "daily") implied.push(label);
    else
      withFrequency.push(
        `${label}: ${t(`testPlan.methodologyLines.frequency.${freq}`)}`,
      );
  }
  if (implied.length > 0)
    out.push(`${t("testPlan.ceremonies")}: ${implied.join(", ")}`);
  return [...out, ...withFrequency];
}
