// Public API of the admin module (spec §10, SPEC §8).
export { AdminPage } from "./ui/AdminPage";
export { SYNC_SETTINGS_EVENT, applyAppearance, loadSettings } from "./model/settings";
export { ADMIN_TABS, adminPath, adminTabFrom, type AdminTab } from "./model/tabs";
