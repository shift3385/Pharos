import { useTranslation } from "react-i18next";
import { EmptySection } from "@shared/ui/EmptySection";

export function AdminPage() {
  const { t } = useTranslation();
  return (
    <EmptySection
      title={t("page.admin.title")}
      subtitle={t("page.admin.subtitle")}
      phase={9}
    />
  );
}
