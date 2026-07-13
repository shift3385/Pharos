import { useTranslation } from "react-i18next";
import { EmptySection } from "@shared/ui/EmptySection";

export function TestCasesPage() {
  const { t } = useTranslation();
  return (
    <EmptySection
      title={t("page.testCases.title")}
      subtitle={t("page.testCases.subtitle")}
      phase={4}
    />
  );
}
