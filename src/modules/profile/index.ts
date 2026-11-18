// Public API of the profile module (spec §3, §10).
export { ProfilePage } from "./ui/ProfilePage";
export { RecoveryKeySection } from "./ui/RecoveryKeySection";
export type { Profile } from "./model/types";
export {
  pullPreference,
  readLocalPreference,
  savePreference,
  type PreferenceKey,
  type StoredPreference,
} from "./api/accountPreferences";
export {
  isLanguage,
  pullSynced,
  pushSynced,
  syncProfileNames,
  type SyncedAppearance,
  type SyncedLanguage,
  type SyncedTheme,
} from "./api/preferenceSync";
