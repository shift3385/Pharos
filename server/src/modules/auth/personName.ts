// The name of a person in a record or an act (docs/GLOSARIO.md, spec §3;
// FIX-43), as SQL over the `users` table: the official first and last name,
// else the alias (`display_name`), else the email. The client's
// `src/modules/auth/model/personName.ts` states the same rule.

/** The SQL expression of the name of the user row `alias` (`u`, or none). */
export function personNameSql(alias = ""): string {
  const c = (col: string) => (alias ? `${alias}.${col}` : col);
  return `coalesce(nullif(btrim(concat_ws(' ', nullif(btrim(${c("first_name")}), ''), nullif(btrim(${c("last_name")}), ''))), ''), nullif(btrim(${c("display_name")}), ''), ${c("email")})`;
}
