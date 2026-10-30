import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { testPlanApi } from "../api/testPlanApi";
import type { RevisionSummary } from "../model/types";

/** A plan's revisions, newest first; `limit` shows only the latest ones (the
 *  side panel), `onRestore` adds «Restaurar» to each (the dialog). */
export function RevisionHistory({
  planId,
  onRestore,
  limit,
}: {
  planId: string;
  onRestore?: (revisionId: string) => void;
  limit?: number;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void testPlanApi.revisions(planId, userId).then((r) => {
      if (!cancelled) setRevisions(r);
    });
    return () => {
      cancelled = true;
    };
  }, [planId, userId]);

  if (revisions.length === 0) {
    return <p className="tp__muted">{t("testPlan.noRevisions")}</p>;
  }

  const date = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso
      : new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" }).format(d);
  };
  const shown = [...revisions].sort((a, b) => b.revision - a.revision).slice(0, limit);

  return (
    <ul className="tp-revs">
      {shown.map((r) => (
        <li key={r.id} className="tp-revs__item">
          <span className="tp-revs__rev t-id">
            {t("testPlan.revShort")} {r.revision}
          </span>
          <span className="tp-revs__title u-truncate" title={r.title}>
            {r.title}
          </span>
          <span className="tp-revs__date">{date(r.createdAt)}</span>
          {onRestore && (
            <button type="button" className="tp-revs__restore" onClick={() => onRestore(r.id)}>
              {t("testPlan.restore")}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
