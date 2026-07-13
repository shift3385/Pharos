import { useTranslation } from "react-i18next";
import { EmptySection } from "@shared/ui/EmptySection";

export function TestPlanPage() {
  const { t } = useTranslation();
  return (
    <EmptySection
      title={t("page.testPlan.title")}
      subtitle={t("page.testPlan.subtitle")}
      phase={3}
    />
  );
}
