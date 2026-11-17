import { useEffect, useRef } from "react";
import i18n from "i18next";
import { useAuth } from "@modules/auth";
import { adoptAppearance, APPEARANCE_EVENT, appearanceOf, loadSettings } from "@modules/admin";
import {
  isLanguage,
  pullSynced,
  pushSynced,
  syncProfileNames,
  type SyncedAppearance,
  type SyncedLanguage,
  type SyncedTheme,
} from "@modules/profile";
import { useTheme } from "@shared/theme/useTheme";

/** How often the shell brings the account's preferences, besides sign-in,
 *  focus and reconnection. */
export const PREFERENCES_EVERY_MS = 5 * 60_000;

const currentLanguage = (): SyncedLanguage => {
  const l = i18n.resolvedLanguage;
  return isLanguage(l) ? l : "es";
};

/**
 * Profile, language and preferences follow the account (SYNC-09). Mounted
 * once in the shell: at sign-in, after every sync, when the window gets the
 * focus back, when the connection returns and every few minutes it takes the account's
 * newer values; a change made here is sent at once. A value taken from the
 * account is not sent back.
 */
export function usePreferenceSync(): void {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const { preference, setPreference } = useTheme();
  const applying = useRef(false);
  const theme = useRef(preference);
  theme.current = preference;
  /** The theme just taken from the account: its render must not send it back. */
  const adoptedTheme = useRef<SyncedTheme | null>(null);

  // Pull: account → this device.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    // Each step asks the server; after sign-out (or another account) none of
    // the remaining ones may go out for the account that left (FIX-07).
    const pull = async () => {
      const lang = await pullSynced(userId, "ui.language", currentLanguage());
      if (!alive) return;
      const mode = await pullSynced<SyncedTheme>(userId, "ui.theme", theme.current);
      if (!alive) return;
      const look = await pullSynced<SyncedAppearance>(userId, "ui.appearance", appearanceOf(loadSettings()));
      if (!alive) return;
      applying.current = true;
      try {
        if (lang && lang !== currentLanguage()) await i18n.changeLanguage(lang);
        if (mode && mode !== theme.current) {
          adoptedTheme.current = mode;
          setPreference(mode);
        }
        if (look) adoptAppearance(look);
      } finally {
        applying.current = false;
      }
      if (alive) void syncProfileNames();
    };
    const run = () => void pull().catch(() => undefined);
    run();
    const timer = window.setInterval(run, PREFERENCES_EVERY_MS);
    window.addEventListener("focus", run);
    window.addEventListener("online", run);
    window.addEventListener("pharos:synced", run);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", run);
      window.removeEventListener("online", run);
      window.removeEventListener("pharos:synced", run);
    };
  }, [userId, setPreference]);

  // Push: language and appearance changed here.
  useEffect(() => {
    if (!userId) return;
    const onLanguage = (lng: string) => {
      if (!applying.current && isLanguage(lng)) void pushSynced(userId, "ui.language", lng);
    };
    const onAppearance = () => {
      if (!applying.current) void pushSynced(userId, "ui.appearance", appearanceOf(loadSettings()));
    };
    i18n.on("languageChanged", onLanguage);
    window.addEventListener(APPEARANCE_EVENT, onAppearance);
    return () => {
      i18n.off("languageChanged", onLanguage);
      window.removeEventListener(APPEARANCE_EVENT, onAppearance);
    };
  }, [userId]);

  // Push: the theme chosen here (not the first value, nor one adopted).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (adoptedTheme.current === preference) {
      adoptedTheme.current = null;
      return;
    }
    if (userId) void pushSynced(userId, "ui.theme", preference);
  }, [preference, userId]);
}
