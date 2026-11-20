// One name for a person everywhere the app names one (FIX-41): the display
// name the account chose (the sidebar, «Miembros», notifications and the
// audit show it; the server sends it to the other members), else the first
// and last name, else the email.

export interface NamedPerson {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export function personName(p: NamedPerson | null | undefined): string {
  if (!p) return "";
  const display = p.displayName?.trim();
  if (display) return display;
  const full = [p.firstName, p.lastName]
    .map((s) => s?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  return full || p.email?.trim() || "";
}
