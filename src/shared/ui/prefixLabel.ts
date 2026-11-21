/** A project's prefix as a label, without the separator its keys use:
 *  «PH-» → «PH», «BM_» → «BM» (FIX-46), as the dashboard rows show it. */
export function prefixLabel(prefix: string | null | undefined): string {
  return (prefix ?? "").replace(/[-_.\s]+$/, "");
}
