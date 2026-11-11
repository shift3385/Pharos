// Administration settings (spec §10.3). Language and theme live in the topbar;
// here we keep app personalization (custom background + opacity) and operational
// preferences (retention). Persisted in localStorage for now (DB persistence +
// sync is a later refinement). The download folder is not here: the desktop app
// stores it, chosen with the native picker (UX-02, src/shared/export/saveFile).

import defaultBackgroundUrl from "../assets/default-background.jpg";

/** Stored instead of the bundled image's URL, which changes with each build. */
export const DEFAULT_BACKGROUND = "default";

export interface AdminSettings {
  /** App background: `DEFAULT_BACKGROUND`, a custom image as a data URI, or
   *  empty for none. */
  backgroundImage: string;
  /** Background visibility, 0–100 (lower = more transparent). */
  backgroundOpacity: number;
  /** A light shadow on the cards (`shared/theme/cardShadow.css`). */
  cardShadow: boolean;
  /** Days a soft-deleted row is kept on this device before the purge removes
   *  it for good (SYNC-06, `sync-offline/api/purgeApi.ts`). */
  retentionDays: number;
  /** Sync on its own every `autoSyncMinutes` while online (NC-025, MAN-03);
   *  off by default. «Sincronizar ahora» is always there, and Pharos also
   *  syncs at sign-in and when the connection comes back, whatever this says.
   *  Any completed sync restarts the count. */
  autoSync: boolean;
  /** One of `AUTO_SYNC_MINUTES`. */
  autoSyncMinutes: number;
}

/** The intervals «Sincronizar automáticamente» offers, in minutes. */
export const AUTO_SYNC_MINUTES = [1, 5, 15, 30] as const;

/** Fired on `window` when the sync settings change, so the shell's sync
 *  loop (`SyncStatusProvider`) re-reads them without a reload. */
export const SYNC_SETTINGS_EVENT = "pharos:sync-settings";

export const DEFAULT_SETTINGS: AdminSettings = {
  backgroundImage: DEFAULT_BACKGROUND,
  backgroundOpacity: 40,
  cardShadow: true,
  retentionDays: 30,
  // Off by default (NC-025): sync is manual until the user turns it on.
  autoSync: false,
  autoSyncMinutes: 5,
};

/** A stored interval that is not one of the offered ones reads as 5 min. */
const syncMinutes = (v: unknown): number =>
  (AUTO_SYNC_MINUTES as readonly number[]).includes(Number(v)) ? Number(v) : DEFAULT_SETTINGS.autoSyncMinutes;

const KEY = "pharos.admin.settings";

/** Settings stored before the default background have no version. Their empty
 *  background was not a choice (there was nothing else to have), so they get the
 *  default; a custom image stays, with its opacity. */
const BACKGROUND_VERSION = 2;

/** The image of a stored background, for CSS or a preview (empty = none). */
export function backgroundImageUrl(value: string): string {
  return value === DEFAULT_BACKGROUND ? defaultBackgroundUrl : value;
}

const clampInt = (v: number, min: number, max: number, fallback: number) =>
  Math.max(min, Math.min(max, Math.round(v) || fallback));

export function loadSettings(): AdminSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    // Before UX-02 a free-text download folder was stored here and never used.
    delete stored.downloadLocation;
    const current = stored.backgroundVersion === BACKGROUND_VERSION;
    delete stored.backgroundVersion;
    if (!current && !stored.backgroundImage) {
      delete stored.backgroundImage;
      delete stored.backgroundOpacity;
    }
    const merged = { ...DEFAULT_SETTINGS, ...stored } as AdminSettings;
    return { ...merged, autoSync: merged.autoSync === true, autoSyncMinutes: syncMinutes(merged.autoSyncMinutes) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AdminSettings): void {
  const clean: AdminSettings = {
    ...settings,
    // Clamp so a bad value can't wipe data instantly or hide the whole UI.
    retentionDays: clampInt(settings.retentionDays || 0, 1, 3650, 30),
    // Not `clampInt`'s fallback for 0: fully transparent is a valid choice.
    backgroundOpacity: Math.max(0, Math.min(100, Math.round(settings.backgroundOpacity ?? 40))),
    autoSync: settings.autoSync === true,
    autoSyncMinutes: syncMinutes(settings.autoSyncMinutes),
  };
  localStorage.setItem(KEY, JSON.stringify({ ...clean, backgroundVersion: BACKGROUND_VERSION }));
}

/** Saves only the sync settings (they apply at once, with no «Guardar») and
 *  tells the sync loop. */
export function saveSyncSettings(patch: Pick<Partial<AdminSettings>, "autoSync" | "autoSyncMinutes">): void {
  saveSettings({ ...loadSettings(), ...patch });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SYNC_SETTINGS_EVENT));
}

/** Applies the background and the card shadow to the whole app. Safe to call on
 *  startup, after each save, and with a draft to preview it before saving. */
export function applyAppearance(settings: AdminSettings = loadSettings()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.toggleAttribute("data-card-shadow", settings.cardShadow);
  const image = backgroundImageUrl(settings.backgroundImage);
  root.style.setProperty("--app-bg-image", image ? `url("${image}")` : "none");
  root.style.setProperty("--app-bg-opacity", String((settings.backgroundOpacity ?? 40) / 100));
}
