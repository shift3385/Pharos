import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { testPlanApi } from "../api/testPlanApi";
import { TestPlanWizard } from "./TestPlanWizard";

/** A project owns exactly one test plan (spec §5.1). This page loads that plan
 *  for the given project (or starts a new one) and hands off to the wizard. */
export function TestPlanPage({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [planId, setPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const plan = await testPlanApi.byProject(projectId);
    setPlanId(plan?.id ?? null);
    setLoading(false);
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (loading) return <p className="tp__muted">{t("common.loading")}</p>;

  // planId null → the wizard creates the plan for this project; otherwise edits.
  return <TestPlanWizard planId={planId} projectId={projectId} onClose={refresh} />;
}
