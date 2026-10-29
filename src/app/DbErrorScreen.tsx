import { useTranslation } from "react-i18next";
import { Logo } from "@shared/ui/Logo";
import { NEWER_DB_ERROR } from "./dbStatus";
import "./AppSplash.css";

/** Full-screen, blocking explanation shown instead of the app when the local
 *  database could not be opened (SEC-06). The file is never modified here. */
export function DbErrorScreen({ error }: { error: string }) {
  const { t } = useTranslation();
  const newer = error.startsWith(NEWER_DB_ERROR);
  return (
    <div className="app-splash" role="alert" data-testid="db-error">
      <Logo size={48} />
      <h1 className="app-splash__title">
        {t(newer ? "dbError.newerTitle" : "dbError.title")}
      </h1>
      <p className="app-splash__text">
        {t(newer ? "dbError.newerBody" : "dbError.body")}
      </p>
      <code className="app-splash__detail">{error}</code>
    </div>
  );
}
