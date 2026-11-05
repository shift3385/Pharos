/** Fired on `window` after a case is created or deleted, so the project
 *  header reloads its «N casos» count at once (FIX-13; projects composes
 *  test-cases and listens). */
export const CASES_CHANGED_EVENT = "pharos:cases-changed";

/** Tells the listeners that the project's cases changed. A single create or
 *  delete does it itself (`testCaseApi`); a loop over many cases passes
 *  `{ quiet: true }` to each call and announces once at the end, so the
 *  header reloads once per batch however slow each call is. */
export function announceCasesChanged(): void {
  window.dispatchEvent(new Event(CASES_CHANGED_EVENT));
}

/** Option of `testCaseApi.create/remove` for the calls of a batch. */
export interface BatchOptions {
  /** Do not announce this change: the batch announces once when done. */
  quiet?: boolean;
}
