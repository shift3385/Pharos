import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@modules/auth";
import { logClientError } from "@shared/diagnostics";
import { LoadError } from "@shared/ui/LoadError";
import { testPlanApi } from "../api/testPlanApi";
import { TestPlanWizard } from "./TestPlanWizard";

/** A project owns exactly one test plan (spec §5.1). This page loads that plan
 *  for the given project (or starts a new one) and hands off to the wizard. */
export function TestPlanPage({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [planId, setPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  async function refresh() {
    setLoading(true);
    setLoadFailed(false);
    try {
      const plan = await testPlanApi.byProject(projectId, userId);
      setPlanId(plan?.id ?? null);
    } catch (e) {
      logClientError(e, "test plan");
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId]);

  if (loading) return <p className="tp__muted">{t("common.loading")}</p>;
  // Never the wizard here: without knowing the plan it would create a second one.
  if (loadFailed) return <LoadError message={t("testPlan.loadFailed")} onRetry={() => void refresh()} />;

  // planId null → the wizard creates the plan for this project; otherwise edits.
  // A created plan keeps the wizard mounted (same step) and gives it its id;
  // without a plan back, the page reloads it.
  return (
    <TestPlanWizard
      planId={planId}
      projectId={projectId}
      onSaved={(plan) => (plan ? setPlanId(plan.id) : void refresh())}
    />
  );
}
