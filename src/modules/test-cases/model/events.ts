/** Fired on `window` after a case is created or deleted, so the project
 *  header reloads its «N casos» count at once (FIX-13; projects composes
 *  test-cases and listens). */
export const CASES_CHANGED_EVENT = "pharos:cases-changed";
