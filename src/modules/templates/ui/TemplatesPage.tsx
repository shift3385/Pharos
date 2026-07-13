import { useTranslation } from "react-i18next";
import { EmptySection } from "@shared/ui/EmptySection";

export function TemplatesPage() {
  const { t } = useTranslation();
  return (
    <EmptySection
      title={t("page.templates.title")}
      subtitle={t("page.templates.subtitle")}
      phase={6}
    />
  );
}
