// «Asignado a» (DEF-01, ADR-0048 `defect.assigned`, FIX-41): a member of the
// workspace, stored as the account id, so the notification reaches them.
// A name typed before there were members stays as it was (no account, no
// notification) until someone picks a member.

export interface AssignableMember {
  userId: string;
  name: string;
  disabled?: boolean;
}

export interface AssigneeOption {
  value: string;
  label: string;
}

/** «Sin asignar», the active members by name, and the stored value when it
 *  is not one of them (free text from before, or someone no longer there). */
export function assigneeOptions(members: AssignableMember[], value: string, unassigned: string): AssigneeOption[] {
  const active = members
    .filter((m) => !m.disabled && m.name)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => ({ value: m.userId, label: m.name }));
  const stored = value.trim();
  const kept = stored && !active.some((o) => o.value === stored) ? [{ value: stored, label: stored }] : [];
  return [{ value: "", label: unassigned }, ...active, ...kept];
}
