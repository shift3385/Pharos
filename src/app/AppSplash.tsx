import { useTranslation } from "react-i18next";
import { Logo } from "@shared/ui/Logo";
import "./AppSplash.css";

/** Full-screen loading state shown while the session is being restored. */
export function AppSplash() {
  const { t } = useTranslation();
  return (
    <div className="app-splash">
      <Logo size={48} />
      <p className="app-splash__text">{t("common.loading")}</p>
    </div>
  );
}
