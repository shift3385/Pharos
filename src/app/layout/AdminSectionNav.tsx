import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";

const SECTIONS = [
  { id: "ai", path: "/ai" },
  { id: "templates", path: "/templates" },
  { id: "admin", path: "/admin" },
] as const;

/**
 * TEMPORARY (RED-F1 → replaced in RED-V4). Templates and the AI engine moved
 * out of the sidebar into Administration (SPEC §7), but their screens are
 * only restyled into Administration's grouped tabs in V4. Until then these
 * links above the three pages keep them reachable.
 */
export function AdminSectionNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <nav className="admin-sections" aria-label={t("shell.adminSections")}>
      {SECTIONS.map((s) => (
        <Link
          key={s.id}
          to={s.path}
          className="admin-sections__link"
          aria-current={pathname.startsWith(s.path) ? "page" : undefined}
          data-testid={`admin-section-${s.id}`}
        >
          {t(`shell.adminSection.${s.id}`)}
        </Link>
      ))}
    </nav>
  );
}
