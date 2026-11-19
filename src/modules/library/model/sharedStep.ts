import { placeholdersOf, type LibraryStep, type SharedParam } from "./types";

/** The parameters of a shared step being edited: the ones written in its
 *  steps (`<name>`), in order of first use, then the declared ones no step
 *  uses (`unused`, a warning: ADR-0055 §3). */
export function paramRows(form: {
  steps: LibraryStep[];
  params: SharedParam[];
}) {
  const used = placeholdersOf(
    form.steps.flatMap((s) => [s.text, s.expected ?? ""]),
  );
  const byName = new Map(form.params.map((p) => [p.name, p]));
  const rows = used.map((name) => ({
    ...(byName.get(name) ?? { name }),
    unused: false,
  }));
  for (const p of form.params)
    if (!used.includes(p.name)) rows.push({ ...p, unused: true });
  return rows;
}
