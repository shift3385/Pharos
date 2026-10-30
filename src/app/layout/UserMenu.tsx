import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ChevronsUpDown, CircleUser, LogOut, Moon, Settings2, Sun } from "lucide-react";
import { useAuth } from "@modules/auth";
import { SyncIndicator } from "@modules/sync-offline";
import { SUPPORTED_LANGUAGES, type Language } from "@shared/i18n";
import { useTheme } from "@shared/theme/useTheme";
import { MenuItem, MenuLabel, MenuSeparator, ResponsiveMenu } from "@shared/ui/Menu";
import { usePopover } from "@shared/ui/usePopover";
import { TruncatedText } from "@shared/ui/TruncatedText";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/**
 * The user menu (SPEC §7/§8): Mi perfil, Administración, Idioma and Cerrar
 * sesión. It opens up from the sidebar foot (`variant="sidebar"`), to the
 * right from the icon strip (`"rail"`) and as a bottom sheet on mobile
 * (`"mobile"`, where it also holds the theme switch and the sync status that
 * the desktop shows in the top bar).
 */
export function UserMenu({ variant }: { variant: "sidebar" | "rail" | "mobile" }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const menu = usePopover("menu");
  if (!user) return null;

  const name = user.displayName;
  const current = (i18n.resolvedLanguage ?? "es") as Language;
  const avatar = (
    <span className="user-menu__avatar" aria-hidden="true">
      {initials(name)}
    </span>
  );

  return (
    <div className={`user-menu user-menu--${variant}`}>
      <button
        type="button"
        className="user-menu__trigger"
        {...menu.triggerProps}
        aria-label={t("shell.userMenu", { name })}
        title={t("shell.userMenu", { name })}
        data-testid="user-menu-trigger"
      >
        {avatar}
        {variant === "sidebar" && (
          <>
            <span className="user-menu__who">
              <span className="user-menu__name">{name}</span>
              <TruncatedText className="user-menu__email" value={user.email} />
            </span>
            <ChevronsUpDown size={14} className="user-menu__chev" aria-hidden="true" />
          </>
        )}
      </button>
      <ResponsiveMenu
        open={menu.open}
        onClose={menu.close}
        anchorRef={menu.anchorRef}
        id={menu.id}
        label={t("shell.userMenu", { name })}
        title={name}
        placement={variant === "rail" ? "right-end" : "top-start"}
        className="user-menu__panel"
        header={
          <div className="user-menu__head">
            {avatar}
            <span className="user-menu__who">
              <span className="user-menu__name">{name}</span>
              <TruncatedText className="user-menu__email" value={user.email} />
            </span>
            {variant === "mobile" && <SyncIndicator />}
          </div>
        }
      >
        <MenuItem icon={CircleUser} onSelect={() => navigate("/profile")}>
          {t("shell.myProfile")}
        </MenuItem>
        <MenuItem icon={Settings2} onSelect={() => navigate("/admin")}>
          {t("nav.admin")}
        </MenuItem>
        {variant === "mobile" && (
          <MenuItem
            icon={theme === "light" ? Moon : Sun}
            onSelect={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? t("shell.themeToDark") : t("shell.themeToLight")}
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuLabel>{t("shell.language")}</MenuLabel>
        {SUPPORTED_LANGUAGES.map((lng) => (
          <MenuItem
            key={lng}
            selected={current === lng}
            testId={`lang-${lng}`}
            onSelect={() => void i18n.changeLanguage(lng)}
          >
            {t(`language.${lng}`)}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem icon={LogOut} tone="danger" onSelect={() => void logout()}>
          {t("auth.logout")}
        </MenuItem>
      </ResponsiveMenu>
    </div>
  );
}
