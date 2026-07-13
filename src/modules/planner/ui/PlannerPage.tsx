import { useTranslation } from "react-i18next";
import { EmptySection } from "@shared/ui/EmptySection";

export function PlannerPage() {
  const { t } = useTranslation();
  return (
    <EmptySection
      title={t("page.planner.title")}
      subtitle={t("page.planner.subtitle")}
      phase={5}
    />
  );
}
