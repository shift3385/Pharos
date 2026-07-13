import { useTranslation } from "react-i18next";
import { EmptySection } from "@shared/ui/EmptySection";

export function AiPage() {
  const { t } = useTranslation();
  return (
    <EmptySection
      title={t("page.ai.title")}
      subtitle={t("page.ai.subtitle")}
      phase={7}
    />
  );
}
