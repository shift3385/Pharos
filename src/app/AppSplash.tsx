import { useTranslation } from "react-i18next";
import { Logo } from "@shared/ui/Logo";
import "./AppSplash.css";

/** Full-screen loading state shown while the session is being restored. */
export function AppSplash() {
  const { t } = useTranslation();
  return (
    <div className="app-splash">
      <span className="app-splash__brand">
        <Logo size={48} decorative />
        Pharos
      </span>
      <p className="app-splash__text" role="status">{t("common.loading")}</p>
    </div>
  );
}
