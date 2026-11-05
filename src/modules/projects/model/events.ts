/** Fired on `window` after a project's settings are saved (name, case-ID
 *  prefix…), so views that keep their own copy of the project list, like the
 *  sidebar's project switcher, reload it at once (FIX-11). */
export const PROJECT_SAVED_EVENT = "pharos:project-saved";
