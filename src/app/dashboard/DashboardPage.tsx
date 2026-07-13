import { useTranslation } from "react-i18next";
import "./DashboardPage.css";

/** Home landing for the shell. Real widgets arrive in later phases. */
export function DashboardPage() {
  const { t } = useTranslation();
  return (
    <section className="dashboard">
      <span className="dashboard__phase">{t("dashboard.phaseLabel")}</span>
      <h1 className="dashboard__title">{t("dashboard.title")}</h1>
      <p className="dashboard__subtitle">{t("dashboard.subtitle")}</p>
      <p className="dashboard__body">{t("dashboard.body")}</p>
    </section>
  );
}
