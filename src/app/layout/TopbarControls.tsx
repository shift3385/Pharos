import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Bell, Moon, Search, Sun, X } from "lucide-react";
import { useTheme } from "@shared/theme/useTheme";
import { Popover } from "@shared/ui/Popover";
import { usePopover } from "@shared/ui/usePopover";

/** Placeholder panel body until the feature lands (wave 5, RED-W1/RED-W2). */
function Soon({ title, text }: { title: string; text: string }) {
  return (
    <div className="soon">
      <p className="soon__title">{title}</p>
      <p className="soon__text">{text}</p>
    </div>
  );
}

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

/**
 * Global search trigger (SPEC §7): a field-like button with the Ctrl K hint
 * (⌘K on macOS) on tablet and desktop. The shortcut opens it from anywhere,
 * except while a dialog is open or when something else already handled the
 * key. Until global search exists (RED-W1) it opens a "coming soon" panel,
 * which takes the focus.
 */
export function SearchTrigger() {
  const { t } = useTranslation();
  const pop = usePopover("dialog");
  const { setOpen } = pop;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Autofill can send a keydown without `key`.
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key?.toLowerCase() !== "k") return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setOpen]);

  return (
    <>
      <button
        type="button"
        className="topbar__search"
        {...pop.triggerProps}
        aria-keyshortcuts="Control+K Meta+K"
        data-testid="search-trigger"
      >
        <Search size={15} aria-hidden="true" />
        <span className="topbar__search-text">{t("shell.searchPlaceholder")}</span>
        <kbd className="topbar__kbd">{IS_MAC ? "⌘K" : t("shell.searchShortcut")}</kbd>
      </button>
      <Popover
        open={pop.open}
        onClose={pop.close}
        anchorRef={pop.anchorRef}
        id={pop.id}
        role="dialog"
        label={t("shell.searchLabel")}
        placement="bottom-end"
        className="topbar__panel"
      >
        <Soon title={t("shell.searchLabel")} text={t("shell.searchSoon")} />
      </Popover>
    </>
  );
}

/** Notifications trigger (SPEC §7/§8). Until the notifications panel exists
 *  (RED-W2) it opens a "coming soon" panel; no unread dot without data. */
export function NotificationsTrigger({ onNavy }: { onNavy?: boolean }) {
  const { t } = useTranslation();
  const pop = usePopover("dialog");
  return (
    <>
      <button
        type="button"
        className={onNavy ? "topbar__icon-btn topbar__icon-btn--navy" : "topbar__icon-btn"}
        {...pop.triggerProps}
        aria-label={t("shell.notifications")}
        title={t("shell.notifications")}
        data-testid="notifications-trigger"
      >
        <Bell size={onNavy ? 20 : 17} aria-hidden="true" />
      </button>
      <Popover
        open={pop.open}
        onClose={pop.close}
        anchorRef={pop.anchorRef}
        id={pop.id}
        role="dialog"
        label={t("shell.notifications")}
        placement="bottom-end"
        className="topbar__panel"
      >
        <Soon title={t("shell.notifications")} text={t("shell.notificationsSoon")} />
      </Popover>
    </>
  );
}

/** Light/dark quick switch (moon in light, sun in dark). The language lives
 *  only in the user menu (SPEC §7). */
export function ThemeQuickToggle() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const label = theme === "light" ? t("shell.themeToDark") : t("shell.themeToLight");
  const Icon = theme === "light" ? Moon : Sun;
  return (
    <button
      type="button"
      className="topbar__icon-btn"
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      onClick={toggleTheme}
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}

/**
 * Mobile search (SPEC §7): the magnifier turns the whole top bar into the
 * search field (back arrow, field, ✕). Results arrive with RED-W1; until then
 * a note under the bar says so.
 */
export function MobileSearchBar({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="mtopbar__search" role="search">
      <button
        type="button"
        className="topbar__icon-btn topbar__icon-btn--navy"
        aria-label={t("shell.searchClose")}
        title={t("shell.searchClose")}
        onClick={onClose}
      >
        <ArrowLeft size={22} aria-hidden="true" />
      </button>
      <input
        ref={input}
        type="search"
        className="mtopbar__search-input"
        placeholder={t("shell.searchPlaceholder")}
        aria-label={t("shell.searchLabel")}
        aria-describedby="mtopbar-search-soon"
      />
      <button
        type="button"
        className="topbar__icon-btn topbar__icon-btn--navy"
        aria-label={t("shell.searchClear")}
        title={t("shell.searchClear")}
        onClick={() => {
          if (input.current) input.current.value = "";
          input.current?.focus();
        }}
      >
        <X size={20} aria-hidden="true" />
      </button>
      <p id="mtopbar-search-soon" className="mtopbar__search-soon">
        {t("shell.searchSoon")}
      </p>
    </div>
  );
}
