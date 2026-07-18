import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { testPlanApi } from "../api/testPlanApi";
import type { RevisionSummary } from "../model/types";

export function RevisionHistory({ planId }: { planId: string }) {
  const { t } = useTranslation();
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void testPlanApi.revisions(planId).then((r) => {
      if (!cancelled) setRevisions(r);
    });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  if (revisions.length === 0) {
    return <p className="tp__muted">{t("testPlan.noRevisions")}</p>;
  }

  return (
    <ul className="tp-revs">
      {revisions.map((r) => (
        <li key={r.id} className="tp-revs__item">
          <span className="tp-revs__rev">
            {t("testPlan.revShort")} {r.revision}
          </span>
          <span className="tp-revs__title">{r.title}</span>
          <span className="tp-revs__date">{r.createdAt}</span>
        </li>
      ))}
    </ul>
  );
}
