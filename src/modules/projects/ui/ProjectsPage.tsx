import { useTranslation } from "react-i18next";
import { EmptySection } from "@shared/ui/EmptySection";

export function ProjectsPage() {
  const { t } = useTranslation();
  return (
    <EmptySection
      title={t("page.projects.title")}
      subtitle={t("page.projects.subtitle")}
      phase={3}
    />
  );
}
