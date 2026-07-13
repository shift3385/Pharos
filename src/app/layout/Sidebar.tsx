import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NAV_ITEMS } from "@app/navConfig";
import { Logo } from "@shared/ui/Logo";

/** Primary navigation rail (navy 900). Collapses to icons on narrow widths. */
export function Sidebar() {
  const { t } = useTranslation();
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Logo />
        <span className="sidebar__brand-text">
          <span className="sidebar__brand-name">{t("app.name")}</span>
          <span className="sidebar__brand-tagline">{t("app.tagline")}</span>
        </span>
      </div>
      <nav className="sidebar__nav" aria-label={t("app.name")}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            end={item.path === "/"}
            className="sidebar__link"
            data-testid={`nav-${item.id}`}
            title={t(`nav.${item.id}`)}
          >
            <span className="sidebar__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="sidebar__label">{t(`nav.${item.id}`)}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
