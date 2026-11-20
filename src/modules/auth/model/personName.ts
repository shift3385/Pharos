// The name of a person (docs/GLOSARIO.md, spec §3; FIX-43). Wherever the app
// names someone as part of a record or an act (author, «Elaborado por», who
// reviewed or approved, the audit's actor, exports, a defect's assignee, the
// members, a notification about what someone did) it is the OFFICIAL name:
// first and last name; the alias («nombre visible») only when there is no
// official name, then the email. The alias is what a person sees for
// themself in the shell (user menu) and a second line in «Miembros» and the
// profile (`aliasOf`). This file is the one place the rule lives; the server
// has its SQL twin (`server/src/modules/auth/personName.ts`).

export interface NamedPerson {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

/** First and last name, trimmed; "" when neither is known. */
export function officialName(p: NamedPerson | null | undefined): string {
  if (!p) return "";
  return [p.firstName, p.lastName]
    .map((s) => s?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

/** A person in a record or an act: the official name, else the alias, else
 *  the email. */
export function personName(p: NamedPerson | null | undefined): string {
  if (!p) return "";
  return officialName(p) || p.displayName?.trim() || p.email?.trim() || "";
}

/** The alias as a second line beside the official name: only when it says
 *  something the official name does not. */
export function aliasOf(p: NamedPerson | null | undefined): string | null {
  const alias = p?.displayName?.trim();
  return alias && alias !== personName(p) ? alias : null;
}
