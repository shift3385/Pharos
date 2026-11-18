import { approvalOf } from "../model/review";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** «Ana Gil · 17 nov 2026 · versión 1.0 (autoaprobación)»: who approved an
 *  approved case, for its PDF (CAS-02). Undefined when it is not approved or
 *  has no record (approved before 0.5). */
export function approvalLine(status: string, approval: unknown, t: Translate, lang: string): string | undefined {
  const a = status === "approved" ? approvalOf(approval) : null;
  if (!a) return undefined;
  const when = new Date(a.at);
  const date = Number.isNaN(when.getTime()) ? a.at : new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(when);
  const self = a.selfApproved ? ` (${t("testCase.review.banner.selfApproved")})` : "";
  return `${a.byName || a.by} · ${date} · ${t("testCase.version")} ${a.version}${self}`;
}
