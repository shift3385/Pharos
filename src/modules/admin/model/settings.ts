// Administration settings (spec §10.3). Language and theme live in the topbar;
// here we keep app personalization (custom background + opacity) and operational
// preferences (retention). Persisted in localStorage for now (DB persistence +
// sync is a later refinement). The download folder is not here: the desktop app
// stores it, chosen with the native picker (UX-02, src/shared/export/saveFile).

export interface AdminSettings {
  /** Custom app background image as a data URI (empty = none). */
  backgroundImage: string;
  /** Background visibility, 0–100 (lower = more transparent). */
  backgroundOpacity: number;
  /** Days a soft-deleted row is kept before automatic purge (task #37). */
  retentionDays: number;
}

export const DEFAULT_SETTINGS: AdminSettings = {
  backgroundImage: "",
  backgroundOpacity: 30,
  retentionDays: 30,
};

const KEY = "pharos.admin.settings";

const clampInt = (v: number, min: number, max: number, fallback: number) =>
  Math.max(min, Math.min(max, Math.round(v) || fallback));

export function loadSettings(): AdminSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    // Before UX-02 a free-text download folder was stored here and never used.
    delete stored.downloadLocation;
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AdminSettings): void {
  const clean: AdminSettings = {
    ...settings,
    // Clamp so a bad value can't wipe data instantly or hide the whole UI.
    retentionDays: clampInt(settings.retentionDays || 0, 1, 3650, 30),
    backgroundOpacity: clampInt(settings.backgroundOpacity ?? 30, 0, 100, 30),
  };
  localStorage.setItem(KEY, JSON.stringify(clean));
}

/** Applies the custom background to the whole app via CSS variables. Safe to
 *  call on startup and after each save. */
export function applyBackground(settings: AdminSettings = loadSettings()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty(
    "--app-bg-image",
    settings.backgroundImage ? `url("${settings.backgroundImage}")` : "none",
  );
  root.style.setProperty("--app-bg-opacity", String((settings.backgroundOpacity ?? 30) / 100));
}
